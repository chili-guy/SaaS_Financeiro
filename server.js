process.env.TZ = "America/Sao_Paulo";
import 'dotenv/config';
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import './scheduler.js';

// --- Configuração e Iniciação ---
const prisma = new PrismaClient();
const __dir = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const EVO_URL = process.env.EVOLUTION_API_URL || "http://127.0.0.1:8080";
const EVO_KEY = process.env.EVOLUTION_API_KEY || "FInAgentAPISecretKey_2026";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "SUA_CHAVE_AQUI";
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_...";
const stripe = new Stripe(STRIPE_KEY);
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || "price_...";
const APP_URL = process.env.APP_URL || "http://localhost:3000";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const RESET_SECRET = process.env.RESET_SECRET || "";

// --- Buffer de Mensagens ---
const messageBuffers = new Map();
const processedIds = new Set();
const userLocks = new Set();
const DEBOUNCE_TIME = 4000; // 4s — agrupa mensagens rápidas em uma única chamada à IA

// Cache da última lista numerada exibida por usuário — permite referenciar "item 2", "o 3", etc.
// Estrutura: { expenses: [{id, description, amount, category, date}], incomes: [...], tasks: [{id, title}] }
const lastListCache = new Map();

// Resolve uma referência numérica ("2", "item 3", "o primeiro") para o id/descrição real do cache
function resolveNumericRef(target, cacheEntry) {
  if (!cacheEntry) return null;
  const t = String(target).toLowerCase().trim();
  const num = t === "primeiro" || t === "1" ? 1
            : t === "último" || t === "ultimo" ? null  // null = last
            : parseInt(t.replace(/\D/g, ""), 10);
  if (isNaN(num) && num !== null) return null;

  // Tenta nas listas na ordem: expenses > incomes > tasks
  const lists = [
    { key: "expenses", items: cacheEntry.expenses },
    { key: "incomes",  items: cacheEntry.incomes },
    { key: "tasks",    items: cacheEntry.tasks },
  ];
  for (const { key, items } of lists) {
    if (!items?.length) continue;
    const idx = num === null ? items.length - 1 : num - 1;
    if (idx >= 0 && idx < items.length) {
      const item = items[idx];
      return { listType: key, item, idx };
    }
  }
  return null;
}

// Rate limit global DeepSeek: garante mínimo de 2s entre chamadas consecutivas
let lastDeepSeekCall = 0;
const MIN_CALL_GAP_MS = 3500;

// ─── Utilitários ──────────────────────────────────────────────────────────────

// Remove lone surrogates (caracteres UTF-16 inválidos de alguns emojis do WhatsApp)
// que causam HTTP 400 ao serializar o histórico para JSON na API da DeepSeek.
function sanitizeText(str) {
  if (!str) return "";
  return str.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}

// Infere categoria de gasto/receita a partir do texto — usado como fallback quando AI retorna "Outros"
function inferCategory(text) {
  const t = (text || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // remove acentos para comparação

  if (/\b(uber|99pop|99|cabify|taxi|taxista|onibus|metro|metrô|trem|vlt|brt|ferry|balsa|moto.?taxi|mototaxi|combustivel|gasolina|etanol|alcool|diesel|gnv|abastec|posto|estacionamento|pedagio|pedagio|passagem|bilhete|cartao.?transporte|condução|conducao|fretado|van|bicicleta|bike|patinete|scooter|transporte|locomocao|deslocamento|viagem\s+de\s+trabalho)\b/.test(t))
    return "Transporte";

  if (/\b(mercado|supermercado|hipermercado|atacado|atacarejo|assai|atacadao|carrefour|extra|pao.?de.?acucar|walmart|lidl|aldi|sacolao|hortifruti|quitanda|feira|feirinha|verdura|legume|fruta|acougue|peixaria|frigorífico|frigorifico|padaria|confeitaria|doceria|mercearia|armazem|emporio|provisoes|mantimentos|compras.?do.?(mes|semana|casa|cozinha))\b/.test(t))
    return "Mercado";

  if (/\b(restaurante|lanchonete|hamburgueria|pizzaria|sushiaria|churrascaria|bar|boteco|petisco|botequim|trailer|food.?truck|cantina|birosca|quiosque|fast.?food|mc(donalds|donald)|burguer.?king|subway|kfc|bobs|habib|giraffas|outback|applebees|almoco|almoço|jantar|cafe.?da.?manha|cafe.?da.?manhã|desjejum|lanche|marmita|comida|refeicao|refeição|prato|pizza|hamburguer|hambúrguer|sushi|yakisoba|churrasco|espetinho|pastel|coxinha|salgado|sanduiche|sanduíche|sorvete|acai|açaí|frozen|smoothie|suco|refrigerante|agua.?mineral|cerveja|chopp|drinque|drink|bebida|ifood|rappi|uber.?eats|loggi|aiqfome|delivery|entrega.?de.?comida)\b/.test(t))
    return "Alimentação";

  if (/\b(cinema|cinemark|cinepolis|uci|multiplex|teatro|musical|show|festival|concerto|opera|ballet|balé|evento|ingresso|ticket|bilhete.?(de.?show|cultural)|netflix|spotify|deezer|youtube.?premium|disney\+?|hbo\+?|max|prime.?video|apple.?tv|paramount|globoplay|telecine|crunchyroll|twitch|steam|playstation|xbox|nintendo|jogo|game|vídeo.?game|video.?game|clube|academia.?de.?danca|dança|teatro|museu|exposicao|exposição|parque.?de.?diversao|diversao|passatempo|hobby|barzinho|balada|festa|aniversario|churrasquinho|rolê|role|passeio|viagem|excursao|excursão|turismo|hotel|airbnb|hostel|resort|cruzeiro|pousada|trilha|camping)\b/.test(t))
    return "Lazer";

  if (/\b(farmacia|farmácia|drogaria|drogasil|drogaraia|ultrafarma|pacheco|remedios|remédios|medicamento|comprimido|capsula|injecao|injeção|vacina|vitamina|suplemento|medico|médico|medica|clínica|clinica|consulta|exame|laboratorio|laboratório|radiografia|ultrassom|tomografia|ressonancia|cirurgia|internacao|internação|hospital|ubs|sus|plano.?de.?saude|convenio.?medico|odonto|dentista|ortodontia|aparelho.?dentario|implante.?dentario|psicologo|psicologa|psiquiatra|terapeuta|terapia|fisioterapeuta|fisioterapia|fonoaudiologo|nutricionista|academica.?de.?saude|academia|personal.?trainer|pilates|yoga|crossfit|musculacao|musculação|ginastica|ginástica|corrida|natacao|natação|esporte|saúde|saude)\b/.test(t))
    return "Saúde";

  if (/\b(faculdade|universidade|usp|unicamp|puc|mackenzie|unip|anhanguera|estacio|kroton|escola|colegio|colégio|creche|jardim.?de.?infancia|infância|ensino|graduacao|graduação|pos.?graduacao|mba|mestrado|doutorado|curso|aula|workshop|treinamento|capacitacao|capacitação|certificacao|certificação|idioma|ingles|inglês|espanhol|frances|francês|libras|reforco|reforço|apostila|livro|livro.?didatico|material.?escolar|caderno|caneta|mochila|uniforme|mensalidade.?escolar|matricula|matrícula|bolsa.?de.?estudos|educacao|educação|enem|vestibular|concurso|coaching)\b/.test(t))
    return "Educação";

  if (/\b(aluguel|condominio|condomínio|iptu|itr|agua|água|luz|energia.?eletrica|eletrica|celpe|cemig|copel|enel|coelba|sabesp|copasa|embasa|gas.?canalizado|gas.?encanado|internet|banda.?larga|wi.?fi|cabo|net|claro.?residencial|vivo.?fibra|tim.?live|oi.?fibra|telefone.?fixo|seguro.?residencial|seguro.?imovel|vistoria|mudanca|mudança|movel|móvel|sofa|sofá|cama|colchao|colchão|guarda.?roupa|armario|armário|geladeira|fogao|fogão|microondas|maquina.?de.?lavar|lavadora|secadora|maquina.?de.?louça|ar.?condicionado|ventilador|reforma|obra|pintura|eletricista|encanador|pedreiro|jardineiro|faxineira|diarista|limpeza|manutencao|manutenção|casa|apartamento|imovel|imóvel|moradia|habitacao|habitação)\b/.test(t))
    return "Moradia";

  if (/\b(roupa|roupas|camisa|camiseta|camisas|blusa|blusas|calça|calca|saia|vestido|shorts|bermuda|jaqueta|casaco|paletó|paleto|terno|gravata|cinto|meia|cueca|calcinha|sutiã|sutia|pijama|moletom|moleton|agasalho|biquini|biquíni|maio|sunga|sapato|sapatos|tenis|tênis|sandalia|sandália|chinelo|bota|salto|scarpin|mocassim|bolsa|carteira|mochila|mala|acessorio|acessório|brinco|brincos|colar|pulseira|anel|relógio|relogio|óculos|oculos|chapeu|chapéu|boné|bone|cinto|gravata|lenco|lenço|toalha|cosmético|cosmetico|maquiagem|batom|base|blush|sombra|rimel|mascara|hidratante|creme|loção|locao|perfume|colonia|colônia|desodorante|xampu|shampoo|condicionador|sabonete|gel|cera|bronzeador|protetor.?solar|depilacao|depilação|manicure|pedicure|unhas|cabelo|corte.?de.?cabelo|tintura|coloracao|coloração|escova|hidratacao.?capilar|salao|salão|barbearia|estetica|estética|spa|massagem|botox|procedimento.?estetico)\b/.test(t))
    return "Cuidados Pessoais";

  if (/\b(celular|smartphone|iphone|samsung|motorola|xiaomi|tablet|ipad|notebook|computador|pc|monitor|impressora|fone|headphone|earphone|carregador|cabo|mouse|teclado|pendrive|hd|ssd|camera|câmera|tv|televisao|televisão|eletronico|eletrônico|gadget|plano.?(celular|mensal|dados)|tim|claro|vivo|oi|nextel|internet.?movel|internet.?móvel|chip|recarga|mensalidade|assinatura|seguro|seguros|seguro.?(auto|carro|vida|residencial|saude)|previdencia|previdência|consorcio|consórcio|financiamento|emprestimo|empréstimo|prestacao|prestação|parcela|divida|dívida|fatura|boleto|conta.?(telefone|celular|luz|agua|gas)|tributo|taxa|multa|imposto|ir|irpf|inss|fgts|servico|serviço|manutencao|manutenção|assistencia|assistência.?tecnica|tecnica)\b/.test(t))
    return "Serviços";

  return null; // não inferiu — mantém o que veio da AI
}

function cleanTitle(title) {
  if (!title) return "";
  return title
    .replace(/^(marcar|agendar|anotar|lembrar de|lembrar|criar|adicionar|por|colocar|novo|nova)\s+/i, "")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function formatFinanceRecords(records, type = "EXPENSE", periodLabel = "") {
  if (!records || !records.length) {
    const period = periodLabel ? ` ${periodLabel}` : " este mês";
    return type === "EXPENSE"
      ? `Não encontrei registros de gastos${period}. 📂`
      : `Não encontrei registros de receitas${period}. 📂`;
  }

  const catEmojis = {
    "Alimentação": "🍕", "Lazer": "🎭", "Saúde": "💊", "Educação": "📚",
    "Transporte": "🚗", "Moradia": "🏠", "Cuidados Pessoais": "✨", "Serviços": "🛠️",
    "Mercado": "🛒", "Assinaturas": "📱", "Vendas": "🛍️", "Salário": "🏦", "Freelance": "💻"
  };

  const groups = {};
  let totalAll = 0;

  records.forEach(r => {
    const c = r.category || (type === "EXPENSE" ? "Outros" : "Renda");
    if (!groups[c]) groups[c] = { total: 0, items: [] };
    groups[c].total += r.amount;
    groups[c].items.push(r);
    totalAll += r.amount;
  });

  const sorted = Object.entries(groups).sort((a, b) => b[1].total - a[1].total);
  let reply = type === "EXPENSE" ? "📉 EXTRATO DE GASTOS" : "📈 EXTRATO DE RECEITAS";
  reply += "\n━━━━━━━━━━━━━━━━━━\n\n";

  let globalIdx = 1;
  for (const [cat, data] of sorted) {
    const emoji = catEmojis[cat] || (type === "EXPENSE" ? "📦" : "💵");
    const pct = totalAll > 0 ? ((data.total / totalAll) * 100).toFixed(0) : 0;
    reply += `${emoji} ${cat.toUpperCase()} (${pct}%)\n`;
    data.items.forEach(i => {
      const d = new Date(i.date || new Date());
      const dStr = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
      reply += `${globalIdx}. R$ ${i.amount.toFixed(2)} — ${i.description} (${dStr})\n`;
      globalIdx++;
    });
    reply += `└─ Subtotal: R$ ${data.total.toFixed(2)}\n\n`;
  }

  reply += "━━━━━━━━━━━━━━━━━━\n";
  reply += `💰 TOTAL GERAL: R$ ${totalAll.toFixed(2)}`;
  return reply;
}

// ─── Motor Central ────────────────────────────────────────────────────────────

async function processNicoCore(remoteJid, msgText, instance) {
  if (userLocks.has(remoteJid)) {
    console.log(`[${remoteJid}] 🔒 Processando outro pedido, ignorando concorrência.`);
    return;
  }
  userLocks.add(remoteJid);

  try {
    const now = new Date();

    // 1. Busca usuário (suporte a nono dígito BR)
    const phoneNo9 = remoteJid.replace(/^55(\d{2})9/, '55$1');
    const phoneWith9 = remoteJid.replace(/^55(\d{2})(\d{8})@/, '55$19$2@');

    let user = await prisma.user.findFirst({
      where: { OR: [{ phone_number: remoteJid }, { phone_number: phoneNo9 }, { phone_number: phoneWith9 }] }
    });

    if (!user || user.status !== "ACTIVE") {
      if (!user) user = await prisma.user.create({ data: { phone_number: remoteJid, status: "INACTIVE" } });
      await sendText(remoteJid,
        `Olá! Sou o Nico, seu Assessor Financeiro. 🤖📈\n\nSua assinatura ainda não está ativa. Para liberar o acesso, garanta sua vaga:\n\n🎁 30 DIAS GRÁTIS — só paga após o primeiro mês.\n\n🔗 https://www.nicoassessor.com/\n\nAssim que concluir o cadastro, seu acesso é liberado aqui automaticamente!`,
        instance || "main"
      );
      return;
    }

    // 2. Histórico de conversa (últimas 20 mensagens, ordenadas corretamente)
    const history = await prisma.message.findMany({
      where: { user_id: user.id },
      orderBy: { created_at: 'desc' },
      take: 20
    });
    // Sanitiza o histórico: mantém contexto sem poluir o modo json_object
    // Filtra mensagens longas (extratos antigos) para não estourar contexto
    const memory = history.reverse()
      .filter(m => m.content.length < 300) // descarta extratos grandes salvos anteriormente
      .slice(-16)                            // máximo 16 mensagens
      .map(m => ({
        role: m.role,
        content: sanitizeText(
          m.role === "assistant"
            ? m.content.split("\n")[0].replace(/[✅🗑️📊📈📉]/g, '').substring(0, 180).trim()
            : m.content
        )
      }));

    // Salva mensagem atual ANTES de chamar a IA (para ficar no contexto da próxima)
    // Limita a 1000 chars para evitar poluição do contexto com mensagens muito longas
    await prisma.message.create({ data: { user_id: user.id, role: "user", content: msgText.substring(0, 1000) } });

    // 3. Contexto financeiro e de tarefas
    const firstDayMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const [pendingTasks, recentExpenses, recentIncomes, monthExpAgg, monthIncAgg, msgCount] = await Promise.all([
      prisma.task.findMany({ where: { user_id: user.id, completed: false }, orderBy: { due_date: 'asc' }, take: 15 }),
      prisma.expense.findMany({ where: { user_id: user.id }, orderBy: { date: 'desc' }, take: 5 }),
      prisma.income.findMany({ where: { user_id: user.id }, orderBy: { date: 'desc' }, take: 5 }),
      prisma.expense.aggregate({ where: { user_id: user.id, date: { gte: firstDayMonth } }, _sum: { amount: true } }),
      prisma.income.aggregate({ where: { user_id: user.id, date: { gte: firstDayMonth } }, _sum: { amount: true } }),
      prisma.message.count({ where: { user_id: user.id } })
    ]);

    const totalExp = monthExpAgg._sum.amount || 0;
    const totalInc = monthIncAgg._sum.amount || 0;
    const balance = totalInc - totalExp;
    const isFirst = msgCount <= 1;

    const fmtDate = (d) => new Date(d).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric"
    });
    const fmtDateTime = (d) => new Date(d).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });

    const tasksStr = pendingTasks.length
      ? pendingTasks.map(t => `• "${t.title}" ${t.due_date ? `[${fmtDateTime(t.due_date)}]` : "[sem data]"}`).join("\n")
      : "Nenhuma tarefa pendente";

    const expensesStr = recentExpenses.length
      ? recentExpenses.map(e => `• R$${e.amount.toFixed(2)} — ${e.description} (${e.category}) [${fmtDate(e.date)}]`).join("\n")
      : "Nenhum gasto recente";

    const incomesStr = recentIncomes.length
      ? recentIncomes.map(i => `• R$${i.amount.toFixed(2)} — ${i.description} (${i.category}) [${fmtDate(i.date)}]`).join("\n")
      : "Nenhuma receita recente";

    const _now = new Date();
    const dataAtual = _now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    const userName = user.name && !["Nico User", "Investidor", "Investidor ", "Prezado"].includes(user.name) ? user.name : null;

    // ─── SYSTEM PROMPT CIRÚRGICO ────────────────────────────────────────────────
    //
    // PRINCÍPIO: Regras claras + exemplos few-shot = execução precisa.
    // Menos regras, mais exemplos concretos.
    //
    const sysPrompt = `Você é o Assessor Nico — consultor financeiro pessoal e assistente de vida via WhatsApp.
Tom: profissional, cordial, direto. Emojis apenas para estruturar informação. Sem asteriscos (*) ou underscores (_).

Você tem conhecimento sólido em:
- Finanças pessoais: orçamento, controle de gastos, reserva de emergência, quitação de dívidas
- Investimentos: Tesouro Direto, CDB, LCI/LCA, fundos, ações, FIIs, criptomoedas (conceitos básicos)
- Planejamento financeiro: metas, aposentadoria, educação financeira
- Vida pessoal: produtividade, hábitos, bem-estar, organização pessoal

Quando o usuário perguntar sobre esses temas, responda de forma útil, prática e concisa.
Limite: máximo 5 linhas por resposta consultiva. Seja direto, sem enrolação.
Se a pergunta exigir mais profundidade, dê o essencial e ofereça aprofundar em outro ponto específico.
Nunca recuse uma pergunta por ser "fora do seu escopo" — você é um assessor completo.

=== DADOS DO USUÁRIO ===
Data/Hora atual: ${dataAtual}
Nome: ${userName || "não informado"}
Primeira mensagem: ${isFirst ? "SIM — apresente-se brevemente" : "NÃO — seja direto"}
Saldo mensal: R$ ${balance.toFixed(2)} (Receitas: R$ ${totalInc.toFixed(2)} | Gastos: R$ ${totalExp.toFixed(2)})

Tarefas pendentes:
${tasksStr}

Últimos gastos:
${expensesStr}

Últimas receitas:
${incomesStr}

=== SEU ÚNICO FORMATO DE RESPOSTA ===
Retorne APENAS um JSON válido, sem texto fora dele, sem blocos de código. Estrutura:

{
  "actions": [...],
  "reply": "mensagem para o usuário"
}

=== TIPOS DE AÇÃO ===

REGRA FUNDAMENTAL: Interprete a INTENÇÃO do usuário, não palavras exatas.
Cada pessoa se expressa de forma diferente — sua função é entender o que a pessoa quer fazer,
independente do vocabulário que usar.

1. REGISTRAR GASTO/DÍVIDA/CONTA → action "EXPENSE"
   INTENÇÃO: usuário informa que gastou, pagou, comprou, deve ou saiu dinheiro da sua vida financeira.
   Exemplos de vocabulário variado:
   "gastei 45 no uber" / "paguei 45 no uber" / "saíram 45 com transporte" / "uber me custou 45"
   "fui no mercado, 120 reais" / "conta de luz veio 80" / "debitou 200 do cartão" / "devo 500 no cartão"
   → { "action": "EXPENSE", "parsedData": { "amount": 45.00, "description": "Uber", "category": "Transporte", "date": null } }

2. REGISTRAR RECEITA/ENTRADA → action "INCOME"
   INTENÇÃO: usuário informa que recebeu, entrou dinheiro, obteve renda ou valor positivo.
   Exemplos de vocabulário variado:
   "recebi 3000 de salário" / "caiu o salário, 3000" / "entrou 3k hoje" / "vendi meu notebook por 1500"
   "me pagaram 500 de freela" / "chegou 200 de dividendos" / "ganhei 400 com serviço"
   → { "action": "INCOME", "parsedData": { "amount": 3000.00, "description": "Salário", "category": "Salário", "date": null } }

3. CRIAR TAREFA/LEMBRETE → action "TASK"
   INTENÇÃO: usuário quer que algo seja lembrado, agendado ou registrado para fazer depois.
   REGRA CRÍTICA: SEMPRE envie due_date. Nunca deixe due_date nulo em tarefas com data ou lembrete.
   - Usuário informou dia E hora → use o dia e hora exatos
   - Usuário informou dia SEM hora → use o dia às 09:00 (ex: "na segunda" → segunda às 09:00)
   - Usuário não informou dia nem hora → use hoje às 09:00
   Para lembrete: "remind": true sempre que houver due_date.
   Exemplos de vocabulário variado:
   "me lembra de pagar o aluguel amanhã às 9h" / "adiciona reunião na sexta às 14h"
   "põe na agenda: academia às 7h" / "não me deixa esquecer da consulta segunda"
   "anota que tenho dentista dia 5 às 10h" / "cria um lembrete pra ligar pra fulano amanhã"
   "compromisso com cliente hoje às 15h" / "study session de 15h às 17h"
   "tomar remédio 16h44 hj" / "cinema 20h" / "reunião 14h30" / "lembrete 9h amanhã"
   "me lembre de ir pro trabalho na segunda" → due_date: segunda-feira às 09:00
   ATENÇÃO: horários sem "às" também são válidos — "cinema 20h" = cinema às 20h hoje.
   → { "action": "TASK", "parsedData": { "title": "Pagar aluguel", "due_date": "2025-01-15T09:00:00", "remind": true } }

4. CONSULTAR DADOS → action "QUERY"
   INTENÇÃO: usuário quer visualizar, ver, listar ou entender seus dados financeiros ou agenda.
   IMPORTANTE: Use QUERY para qualquer pedido de visualização. Nunca escreva listas no "reply".
   Tipos disponíveis: "TASKS", "EXPENSES", "INCOMES", "SUMMARY"

   Gastos/Despesas — USE EXPENSES para QUALQUER pergunta sobre o que foi gasto:
   "quero ver meus gastos" / "quanto saiu esse mês" / "o que gastei?" / "quanto gastei hj" /
   "quanto gastei hoje" / "quanto gastei essa semana" / "quanto gastei nesse mês" / "meus gastos de março"
   → { "actions": [{ "action": "QUERY", "parsedData": { "type": "EXPENSES", "date": null } }], "reply": "Aqui estão seus gastos:" }
   Para gastos de hoje: date: "HOJE" — Para gastos de um mês: date: "YYYY-MM"
   REGRA: "quanto gastei X" é SEMPRE EXPENSES. NUNCA use SUMMARY para perguntas de gastos.

   Agenda/Tarefas — exemplos: "minha agenda" / "o que tenho amanhã?" / "tem algum compromisso?"
   "o que eu fiz hoje?" / "quais minhas atividades de hj?" / "minha lista de tarefas" / "o que tenho pra fazer?"
   "tem algum afazer?" / "meus compromissos" / "o que fiz essa semana?"
   (NÃO use TASKS para "hoje" quando a pergunta é sobre gastos — se tiver valor monetário, é EXPENSES)
   → { "actions": [{ "action": "QUERY", "parsedData": { "type": "TASKS", "date": null } }], "reply": "Aqui está sua agenda:" }

   Resumo/Saldo geral — USE SUMMARY apenas para visão financeira completa (receitas + gastos + saldo):
   "como estou financeiramente?" / "me dá um panorama" / "meu saldo" / "resumo do mês"
   SUMMARY nunca deve ser usado para responder "quanto gastei X" — use EXPENSES.
   → { "actions": [{ "action": "QUERY", "parsedData": { "type": "SUMMARY", "date": null } }], "reply": "Aqui está seu resumo:" }

   Detalhado — exemplos: "detalhe tudo" / "gastos e receitas completos"
   → { "actions": [{ "action": "QUERY", "parsedData": { "type": "EXPENSES", "date": null } }, { "action": "QUERY", "parsedData": { "type": "INCOMES", "date": null } }], "reply": "Aqui está o detalhamento:" }

   Com período — exemplos: "minhas receitas de março"
   → { "actions": [{ "action": "QUERY", "parsedData": { "type": "INCOMES", "date": "2025-03" } }], "reply": "Aqui estão suas receitas de março:" }

5. CONCLUIR TAREFA → action "DONE"
   INTENÇÃO: usuário indica que uma tarefa foi realizada, completada, finalizada — em qualquer forma verbal,
   tempo, voz (ativa ou passiva), singular ou plural, formal ou informal.
   Exemplos de vocabulário variado (1 tarefa):
   "concluí a reunião" / "terminei a academia" / "já fiz o mercado" / "pronto, médico feito"
   "missão cumprida: dentista" / "ok, liguei pra fulano" / "academia: check" / "resolvi o aluguel"
   → { "action": "DONE", "parsedData": { "title": "reunião" } }
   Exemplos de vocabulário variado (TODAS as tarefas pendentes):
   "as duas foram concluídas" / "fiz tudo" / "todas feitas" / "tudo resolvido" / "missão cumprida"
   "já resolvi tudo isso" / "ok, todos feitos" / "pronto, tudo certo" / "feito, pode limpar"
   → Gere uma action DONE para CADA tarefa listada em "Tarefas pendentes", usando o título exato de cada uma.

6. APAGAR REGISTRO → action "DELETE"
   INTENÇÃO: usuário quer remover, apagar ou eliminar algum dado já registrado.
   REGRA: "target" = nome específico do item. Para apagar todos de um tipo, use target: null.
   type "ALL" somente para reset total — nunca para um tipo específico.
   Exemplos: "apaga o gasto do uber" → target: "uber" | "limpe meus gastos" → type: EXPENSES, target: null
   "tira aquela tarefa de academia" → type: TASKS, target: "academia" | "zera tudo" → type: ALL
   → { "action": "DELETE", "parsedData": { "type": "EXPENSES", "target": "uber" } }

7. ATUALIZAR GASTO/RECEITA → action "UPDATE"
   INTENÇÃO: usuário quer alterar categoria, data, valor ou descrição de um gasto ou receita existente.
   Exemplos:
   "muda a categoria do uber para Transporte" → type: EXPENSE, target: "uber", field: "category", value: "Transporte"
   "corrige a data do cinema para ontem" → type: EXPENSE, target: "cinema", field: "date", value: "ONTEM"
   "muda todos os gastos para ontem" → type: EXPENSE, target: "TODOS", field: "date", value: "ONTEM"
   "muda o valor do mercado para 150" → type: EXPENSE, target: "mercado", field: "amount", value: 150
   "renomeia o gasto 'comida' para 'almoço'" → type: EXPENSE, target: "comida", field: "description", value: "almoço"
   → { "action": "UPDATE", "parsedData": { "type": "EXPENSE", "target": "uber", "field": "category", "value": "Transporte" } }
   REGRA: Use target "TODOS" apenas quando o usuário pedir para alterar TODOS os registros de um tipo.
   REGRA: Para datas relativas use: "HOJE", "ONTEM", "ANTEONTEM" — não tente calcular a data ISO.

8. SILENCIAR ALARME → action "TOGGLE_ALARM"
   INTENÇÃO: usuário quer desativar, silenciar ou cancelar o lembrete de uma tarefa.
   REGRA: Se sem tarefa específica, use o histórico para identificar a tarefa mais recente.
   Só use target "todos" se o usuário pedir explicitamente para todas as tarefas.
   Exemplos: "desativa o lembrete" / "para de me avisar disso" / "silencia esse alarme" / "cancela o aviso"
   → { "action": "TOGGLE_ALARM", "parsedData": { "target": "Call com a Raquel", "active": false } }

=== REGRAS CRÍTICAS ===

R0. REFERÊNCIAS NUMÉRICAS: listas exibidas têm numeração global (1, 2, 3...).
    Quando o usuário referenciar "o item 2", "o número 3", "o primeiro", "o último", use o histórico da conversa
    para identificar a descrição/título correspondente ao número e use-o como target na action.
    Exemplos: "apaga o 2" → DELETE com target = descrição do item 2 da última lista mostrada
    "muda a categoria do 1 para Transporte" → UPDATE com target = descrição do item 1

R0b. PERGUNTAS RETÓRICAS / NEGAÇÕES nunca geram TASK:
    "não fiz nada hoje?" / "não tenho nada?" / "não tem nada pra fazer?" / "o que eu fiz?"
    Essas são perguntas — responda com texto, nunca crie uma tarefa.
    TASK só é criado quando o usuário AFIRMA que quer registrar algo: "cinema amanhã 20h", "dentista sexta".

R1. MÚLTIPLOS PEDIDOS: Se o usuário mandar vários pedidos numa mensagem, gere uma action para cada um.
    Exemplo: "gastei 20 na farmácia e 50 no mercado" → duas actions EXPENSE.

R2. REPLY OBRIGATÓRIO: O campo "reply" nunca fica vazio. Se só registrou, confirme brevemente.
    Para gastos e receitas:
    "✅ [Tipo] registrado!
    📝 [Descrição]
    💰 Valor: R$ X,XX
    📅 Data: DD/MM/AAAA
    🏷️ Categoria: [categoria]"
    Para tarefas/lembretes — SEMPRE inclua a data, hora e status do lembrete:
    "✅ Lembrete criado!
    📝 [Título]
    📅 [Data/hora — ex: Hoje às 09:00 ou DD/MM às HH:MM]
    🔔 Lembrete: será enviado às HH:MM"
    REGRA DE HORÁRIO: se o usuário não informar hora, o sistema usa 09:00 como padrão.
    Nunca diga "sem horário definido" para tarefas com data — sempre haverá um horário (mínimo 09:00).

R3. CONSULTAS: Para qualquer pedido de "ver", "listar", "mostrar" ou "extrato", use SEMPRE a action QUERY.
    No campo "reply", escreva apenas uma frase curta introdutória (ex: "Aqui estão seus gastos:").
    NUNCA reproduza listas, valores ou dados no "reply" quando usar QUERY — o sistema já exibe os dados.
    PROIBIDO usar "Consulta realizada" ou qualquer label técnico no "reply".

R4. SEM ALUCINAÇÃO: Use apenas os dados em "DADOS DO USUÁRIO". Se não estiver lá, diga que não encontrou.

R5. INTENÇÃO VAGA: Se o pedido for impreciso, execute o que conseguir e peça confirmação.

R6. DATAS RELATIVAS: Resolva baseado na data atual (${dataAtual}).
    "hoje" → data de hoje, "amanhã" → data de amanhã, "semana que vem" → próxima segunda.

R7. ACTIONS VAZIAS: Se for conversa, dúvida ou pedido de dica (investimentos, finanças, vida pessoal), retorne "actions": [] e responda com conteúdo útil no "reply". Nunca deixe o usuário sem resposta em perguntas consultivas.

R9. LEMBRETES SEM HORÁRIO: Quando o usuário perguntar se vai receber lembrete, ou quando confirmar uma tarefa sem horário explícito, sempre informe:
    "Sim! O lembrete será enviado às 09:00 (horário padrão quando não especificado).
    Para mudar o horário, é só me dizer — ex: 'muda o lembrete da [tarefa] para 14h'."

R8. AÇÃO OBRIGATÓRIA ANTES DA CONFIRMAÇÃO: Toda confirmação no "reply" EXIGE a action correspondente em "actions".
    PROIBIDO: escrever "receita registrada" sem action INCOME em "actions".
    PROIBIDO: escrever "gasto registrado" sem action EXPENSE em "actions".
    PROIBIDO: escrever "tarefa registrada" ou "lembrete criado" sem action TASK em "actions".
    Se o dado já existia no contexto, registre-o igualmente — o sistema lida com duplicatas automaticamente.`;

    // ─── Chamada IA ────────────────────────────────────────────────────────────

    // Função auxiliar: chama DeepSeek com retry automático se resposta vier vazia
    async function callDeepSeek(attempt = 1) {

      // Throttle global: respeita o gap mínimo entre chamadas para evitar rate limit
      const now = Date.now();
      const sinceLastCall = now - lastDeepSeekCall;
      if (sinceLastCall < MIN_CALL_GAP_MS) {
        const waitMs = MIN_CALL_GAP_MS - sinceLastCall;
        console.log(`[${remoteJid}] ⏱️ Throttle DeepSeek: aguardando ${waitMs}ms...`);
        await new Promise(r => setTimeout(r, waitMs));
      }
      lastDeepSeekCall = Date.now();

      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 28000);

      try {
        const upstream = await fetch("https://api.deepseek.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${DEEPSEEK_API_KEY}` },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [{ role: "system", content: sanitizeText(sysPrompt) }, ...memory, { role: "user", content: sanitizeText(msgText) }],
            temperature: 0.1,
            max_tokens: 2048
          }),
          signal: ctrl.signal
        });
        clearTimeout(tid);

        if (!upstream.ok) {
          const errText = await upstream.text();
          console.error(`[${remoteJid}] ❌ DeepSeek HTTP ${upstream.status} (tentativa ${attempt}):`, errText);

          // Rate limit (429) ou erro de servidor (5xx): aguarda e tenta de novo
          if (attempt < 4 && (upstream.status === 429 || upstream.status >= 500)) {
            const wait = attempt * 3000; // 3s, 6s, 9s
            console.log(`[${remoteJid}] ⏳ HTTP ${upstream.status} — aguardando ${wait}ms...`);
            await new Promise(r => setTimeout(r, wait));
            return callDeepSeek(attempt + 1);
          }
          return null; // falha definitiva
        }

        const dsData = await upstream.json();
        const rawContent = (dsData.choices?.[0]?.message?.content || "").trim();
        console.log(`[AI RAW - ${remoteJid}] (tentativa ${attempt}):`, rawContent.substring(0, 300));

        // Resposta vazia = DeepSeek engasgou (rate limit silencioso ou context issue)
        if (!rawContent) {
          if (attempt < 4) {
            const wait = attempt * 2000; // 2s, 4s, 6s
            console.warn(`[${remoteJid}] ⚠️ Resposta vazia (tentativa ${attempt}). Aguardando ${wait}ms...`);
            await new Promise(r => setTimeout(r, wait));
            return callDeepSeek(attempt + 1);
          }
          console.error(`[${remoteJid}] ❌ 4 tentativas falharam com resposta vazia.`);
          return null;
        }

        return rawContent;

      } catch (fetchErr) {
        clearTimeout(tid);
        console.error(`[${remoteJid}] ❌ Fetch DeepSeek (tentativa ${attempt}):`, fetchErr.message);
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, attempt * 2000));
          return callDeepSeek(attempt + 1);
        }
        return null;
      }
    }

    let aiResponse = { actions: [], reply: "" };

    const rawContent = await callDeepSeek();

    if (!rawContent) {
      aiResponse.reply = "Tive uma instabilidade técnica agora. Pode repetir sua mensagem?";
    } else {
      try {
        const s = rawContent.indexOf('{');
        const e = rawContent.lastIndexOf('}');
        if (s !== -1 && e !== -1) {
          aiResponse = JSON.parse(rawContent.substring(s, e + 1));
        } else {
          aiResponse.reply = rawContent.replace(/[*_`#]/g, '').trim();
        }
      } catch (parseErr) {
        console.error(`[${remoteJid}] ❌ JSON parse falhou:`, parseErr.message, "| Raw:", rawContent.substring(0, 200));
        aiResponse.reply = rawContent.replace(/[*_`#]/g, '').trim() || "Não consegui processar. Pode repetir de outra forma?";
      }
    }

    // ─── Execução de Ações ─────────────────────────────────────────────────────

    // Garante que actions é sempre um array válido
    if (!Array.isArray(aiResponse.actions)) aiResponse.actions = [];

    // Safeguard: IA ecoou uma frase de introdução de query (padrão do histórico)
    // sem gerar a QUERY action — injeta a action correta baseado na mensagem do usuário.
    {
      const echoPatterns = [
        /^Consulta realizada:/i,
        /^Aqui estão (seus|suas)/i,
        /^Aqui está (seu|sua)/i,
        /^Mostrei os dados/i,
      ];
      const hasQueryAct = aiResponse.actions.some(a => a?.action === "QUERY");
      const looksLikeEcho = echoPatterns.some(p => p.test(aiResponse.reply || ""));

      if (looksLikeEcho && !hasQueryAct) {
        const lowerMsg = msgText.toLowerCase();
        let queryType = null;
        // EXPENSES e INCOMES têm prioridade — "gastei hoje" deve virar EXPENSES, não TASKS
        if (/\b(gastos?|despesas?|extrato|gast[ei]|pagu[ei]|compra[ei]|saiu|quanto\s+gast)\b/.test(lowerMsg))             queryType = "EXPENSES";
        else if (/\b(receitas?|entrad[ao]s?|sal[aá]rio|renda|recebi|entrou|quanto\s+recebi)\b/.test(lowerMsg))            queryType = "INCOMES";
        else if (/\b(resumo|saldo|balan[cç]o|situa[cç][aã]o|panorama|vis[aã]o|geral|como estou|quanto tenho)\b/.test(lowerMsg)) queryType = "SUMMARY";
        else if (/\b(tarefas?|agenda|compromisso|amanh[aã]|lembretes?)\b/.test(lowerMsg))                                 queryType = "TASKS";
        else queryType = "SUMMARY";

        console.warn(`[${remoteJid}] ⚠️ Safeguard: eco detectado. Injetando QUERY ${queryType}.`);
        aiResponse.actions.push({ action: "QUERY", parsedData: { type: queryType, date: null } });
        aiResponse.reply = "";
      }
    }

    // Safeguard: IA confirmou deleção ("removidos", "apagados") sem gerar DELETE action
    {
      const deleteConfirmPatterns = [
        /removidos?/i,
        /apagados?/i,
        /deletados?/i,
        /limpos?/i,
        /zerados?/i,
        /exclu[íi]dos?/i,
      ];
      const hasDeleteAct = aiResponse.actions.some(a => a?.action === "DELETE");
      const looksLikeDeleteConfirm = deleteConfirmPatterns.some(p => p.test(aiResponse.reply || ""));

      if (looksLikeDeleteConfirm && !hasDeleteAct) {
        const lowerMsg = msgText.toLowerCase();
        let delType = null;
        if (/\b(gastos?|despesas?)\b/.test(lowerMsg))               delType = "EXPENSES";
        else if (/\b(receitas?|renda|entradas?)\b/.test(lowerMsg))   delType = "INCOMES";
        else if (/\b(tarefas?|compromissos?)\b/.test(lowerMsg))      delType = "TASKS";
        else if (/\b(tudo|todos|geral|completo)\b/.test(lowerMsg))   delType = "ALL";

        if (delType) {
          console.warn(`[${remoteJid}] ⚠️ Safeguard: confirmação de delete sem action. Injetando DELETE ${delType}.`);
          aiResponse.actions.push({ action: "DELETE", parsedData: { type: delType, target: null } });
        }
      }
    }

    // Safeguard: IA confirmou receita sem gerar INCOME action
    {
      const incomeConfirmPatterns = [
        /receita.{0,50}registrada/i,
        /registr[aeo][id]?.{0,20}receita/i,
        /R\$\s*[\d,.]+.{0,50}registrada/i,
        /entrada.{0,50}registrada/i,
      ];
      const hasIncomeAct = aiResponse.actions.some(a => a?.action === "INCOME");
      if (!hasIncomeAct && incomeConfirmPatterns.some(p => p.test(aiResponse.reply || ""))) {
        const amountMatch = msgText.match(/\b(\d+[\.,]?\d*)\b/);
        const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : 0;
        if (amount > 0) {
          const descMatch = msgText.match(/\bde\s+([^\d][a-zA-ZÀ-ú\s]+?)(?:\s*$|\s+(?:hoje|amanhã|às|no\b|na\b))/i);
          const description = descMatch ? descMatch[1].trim() : "Receita";
          console.warn(`[${remoteJid}] ⚠️ Safeguard INCOME: confirmação sem action. Injetando INCOME R$${amount} — ${description}.`);
          aiResponse.actions.push({ action: "INCOME", parsedData: { amount, description, category: "Renda", date: null } });
        }
      }
    }

    // Safeguard: IA confirmou gasto sem gerar EXPENSE action
    {
      const expenseConfirmPatterns = [
        /gasto.{0,50}registrado/i,
        /despesa.{0,50}registrada/i,
        /registr[aeo][id]?.{0,20}gasto/i,
      ];
      const hasExpenseAct = aiResponse.actions.some(a => a?.action === "EXPENSE");
      if (!hasExpenseAct && expenseConfirmPatterns.some(p => p.test(aiResponse.reply || ""))) {
        const amountMatch = msgText.match(/\b(\d+[\.,]?\d*)\b/);
        const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : 0;
        if (amount > 0) {
          const descMatch = msgText.match(/\bno?\s+([a-zA-ZÀ-ú\s]+?)(?:\s*$|\s+(?:hoje|amanhã|às))/i)
            || msgText.match(/\bde\s+([^\d][a-zA-ZÀ-ú\s]+?)(?:\s*$|\s+(?:hoje|amanhã|às))/i);
          const description = descMatch ? descMatch[1].trim() : "Gasto";
          console.warn(`[${remoteJid}] ⚠️ Safeguard EXPENSE: confirmação sem action. Injetando EXPENSE R$${amount} — ${description}.`);
          aiResponse.actions.push({ action: "EXPENSE", parsedData: { amount, description, category: "Outros", date: null } });
        }
      }
    }

    // Safeguard: IA confirmou tarefa sem gerar TASK action
    {
      const taskConfirmPatterns = [
        /tarefa\s+(registrada|criada|adicionada)/i,
        /lembrete\s+(criado|registrado|configurado|adicionado)/i,
        /agendado\s+(com\s+sucesso|para)/i,
      ];
      const hasTaskAct = aiResponse.actions.some(a => a?.action === "TASK");
      if (!hasTaskAct && taskConfirmPatterns.some(p => p.test(aiResponse.reply || ""))) {
        // Extrai título do reply da IA ("Tarefa registrada: X") ou da mensagem do usuário como fallback
        const titleFromReply = (aiResponse.reply || "").match(/(?:Tarefa|Lembrete)\s+(?:registrada?|criado?):\s*(.+?)(?:\n|$)/i);
        let title = titleFromReply ? titleFromReply[1].trim() : null;
        if (!title) {
          // Fallback: remove horário e palavras de comando da mensagem do usuário para extrair o título
          title = msgText
            .replace(/\b(\d{1,2})[h:](\d{2})\b/gi, '')
            .replace(/\bàs?\s*\d{1,2}[h:]\d{0,2}\b/gi, '')
            .replace(/\b(hoje|hj|amanhã|lembrar|lembra|lembrete|adiciona|registra|anota|cria|me avisa?)\b/gi, '')
            .replace(/\s{2,}/g, ' ').trim();
        }
        if (title) {
          // Tenta extrair horário da mensagem do usuário (ex: "às 17h", "15h", "de 15h às 17h")
          const timeMatch = msgText.match(/\bàs?\s*(\d{1,2})[h:]\s*(\d{0,2})/i)
                         || msgText.match(/\bde\s+(\d{1,2})[h:]\s*(\d{0,2})/i);
          let dueDate = null;
          if (timeMatch) {
            const d = new Date();
            d.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2] || '0', 10), 0, 0);
            dueDate = d.toISOString().replace('Z', '');
            const hh = String(parseInt(timeMatch[1])).padStart(2, '0');
            const mm = String(parseInt(timeMatch[2] || '0')).padStart(2, '0');
            const dateStr = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
            aiResponse.reply = `✅ Lembrete criado!\n📝 ${title}\n📅 ${dateStr} às ${hh}:${mm}\n🔔 Lembrete: ativo às ${hh}:${mm}`;
          } else {
            aiResponse.reply = `✅ Tarefa registrada!\n📝 ${title}\n🔔 Lembrete: sem horário definido`;
          }
          console.warn(`[${remoteJid}] ⚠️ Safeguard TASK: confirmação sem action. Injetando TASK "${title}".`);
          aiResponse.actions.push({ action: "TASK", parsedData: { title, due_date: dueDate, remind: dueDate !== null } });
        }
      }
    }

    // Safeguard DONE: detecta conclusão por sinal do usuário OU pelo reply da IA
    // — sem depender de vocabulário específico do usuário
    {
      // Sinais na mensagem do usuário (amplos — vocabulário variado)
      // NOTA: "fiz" sozinho foi removido — muito ambíguo ("fiz compras" = EXPENSE, não DONE)
      const userDonePatterns = [
        /\b(conclu[íi]|terminei|finalizei|realizei|executei|cumpri|completei)\b/i,
        /\b(fiz\s+tudo|já\s+fiz|já\s+fiz\s+tudo)\b/i,
        /\b(feito|pronto|done|check|✓|✅)\b/i,   // "ok" removido — muito ambíguo
        /foram\s+(conclu[íi]das?|feitas?|finalizadas?|realizadas?|prontas?)/i,
        /\b(tod[ao]s?|as\s+duas?|os\s+dois?|ambas?|tud[oa])\b.{0,20}\b(feit[ao]s?|conclu[íi]d[ao]s?|finalizad[ao]s?|pronto|resolvid[ao]s?)\b/i,
        /\b(tudo\s+)?(resolvido|executado|cumprido|missão\s+cumprida|pode\s+tirar|pode\s+apagar)\b/i,
      ];
      // Sinais no reply da IA de que ela entendeu conclusão mas não gerou a action
      const aiDoneReplyPatterns = [
        /marcad[ao]s?\s+(como\s+)?(conclu[íi]d[ao]s?|feit[ao]s?|finalizad[ao]s?)/i,
        /tarefa[s]?\s+(conclu[íi]da|marcada|finalizada)/i,
        /registrei\s+(a\s+)?conclusão/i,
        /anotei\s+(que\s+)?(foi|foram)\s+(feit[ao]s?|conclu[íi]d[ao]s?)/i,
        /ótimo.{0,30}(conclu[íi]|feit[ao]|finaliz)/i,
        /perfeito.{0,50}(tarefa|agenda).{0,30}(vazi[ao]|limpou|zerou)/i,
      ];

      const hasDoneAct = aiResponse.actions.some(a => a?.action === "DONE");
      const userSignal = userDonePatterns.some(p => p.test(msgText));
      const aiSignal = aiDoneReplyPatterns.some(p => p.test(aiResponse.reply || ""));

      // Guarda: se a IA retornou EXPENSE/INCOME E mensagem tem valor monetário,
      // é quase certo que "fiz/feito" refere-se ao registro financeiro, não a uma tarefa
      const hasFinanceAct = aiResponse.actions.some(a => a?.action === "EXPENSE" || a?.action === "INCOME");
      const hasMoney = /\b\d+[,.]?\d*\s*(reais|real)?\b/i.test(msgText) && /\b(r\$|reais|real|paguei|gastei|comprei|custou|saiu|debitou|foi)\b/i.test(msgText);
      const isLikelyFinance = hasFinanceAct && hasMoney;

      if (!hasDoneAct && (userSignal || aiSignal) && pendingTasks.length > 0 && !isLikelyFinance) {
        const msgLower = msgText.toLowerCase();
        const replyLower = (aiResponse.reply || "").toLowerCase();

        // 1. Tarefa mencionada explicitamente pelo nome na mensagem ou reply da IA
        const specificTask = pendingTasks.find(t =>
          msgLower.includes(t.title.toLowerCase()) || replyLower.includes(t.title.toLowerCase())
        );

        if (specificTask) {
          console.warn(`[${remoteJid}] ⚠️ Safeguard DONE: tarefa específica "${specificTask.title}".`);
          aiResponse.actions.push({ action: "DONE", parsedData: { title: specificTask.title } });

        } else if (/\b(tudo|todas?|tod[ao]s?|ambas?|os\s+dois?|as\s+duas?)\b/i.test(msgText)) {
          // 2. Usuário disse explicitamente "tudo/todas/os dois" → batch
          console.warn(`[${remoteJid}] ⚠️ Safeguard DONE: batch explícito (${pendingTasks.length} tarefas).`);
          for (const task of pendingTasks) {
            aiResponse.actions.push({ action: "DONE", parsedData: { title: task.title } });
          }

        } else {
          // 3. Confirmação genérica ("já sim", "feito", "ok") → busca contexto no histórico recente
          // para identificar qual tarefa estava sendo discutida (ex: lembrete que acabou de disparar)
          const recentBotMsgs = memory
            .filter(m => m.role === "assistant")
            .slice(-3)
            .map(m => m.content.toLowerCase());

          const contextTask = pendingTasks.find(t =>
            recentBotMsgs.some(msg => msg.includes(t.title.toLowerCase()))
          );

          if (contextTask) {
            console.warn(`[${remoteJid}] ⚠️ Safeguard DONE: tarefa do contexto recente "${contextTask.title}".`);
            aiResponse.actions.push({ action: "DONE", parsedData: { title: contextTask.title } });
          } else {
            // 4. Fallback: marca apenas a tarefa com due_date mais próxima
            const nearest = [...pendingTasks].sort((a, b) => {
              if (!a.due_date) return 1;
              if (!b.due_date) return -1;
              return new Date(a.due_date) - new Date(b.due_date);
            })[0];
            console.warn(`[${remoteJid}] ⚠️ Safeguard DONE: fallback due_date mais próxima "${nearest.title}".`);
            aiResponse.actions.push({ action: "DONE", parsedData: { title: nearest.title } });
          }
        }
      }
    }

    // Deduplicação de ações idênticas
    const seenKeys = new Set();
    const uniqueActs = aiResponse.actions.filter(act => {
      if (!act?.action) return false;
      const d = JSON.parse(JSON.stringify(act.parsedData || {}));
      if (d.description) d.description = d.description.toLowerCase().trim();
      if (d.title) d.title = d.title.toLowerCase().trim();
      const key = `${act.action}::${JSON.stringify(d)}`;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });

    let hasChange = false;
    const taskReplies = [];    // acumula confirmações de múltiplas tarefas
    const financeReplies = []; // acumula confirmações de múltiplas transações financeiras

    for (const act of uniqueActs) {
      const { action, parsedData = {} } = act;
      console.log(`[${remoteJid}] ▶ Executando action: ${action}`, JSON.stringify(parsedData));

      try {
        // ── EXPENSE ──────────────────────────────────────────────────────────
        if (action === "EXPENSE") {
          const val = parseFloat(String(parsedData.amount || 0).replace(',', '.').replace(/[^\d.]/g, ''));
          if (val > 0) {
            // Fallback de data: se AI não enviou mas mensagem tem indicador temporal
            let expDateRaw = parsedData.date;
            if (!expDateRaw) {
              const t = new Date();
              if (/\bontem\b/i.test(msgText)) {
                const y = new Date(t); y.setDate(t.getDate() - 1);
                expDateRaw = `${y.getFullYear()}-${String(y.getMonth()+1).padStart(2,'0')}-${String(y.getDate()).padStart(2,'0')}`;
              } else if (/\banteontem\b/i.test(msgText)) {
                const y = new Date(t); y.setDate(t.getDate() - 2);
                expDateRaw = `${y.getFullYear()}-${String(y.getMonth()+1).padStart(2,'0')}-${String(y.getDate()).padStart(2,'0')}`;
              }
            }
            const expDate = expDateRaw
              ? (() => { const s = String(expDateRaw).replace(/Z$/i, ""); return new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + "T12:00:00" : s); })()
              : new Date();

            // Fallback de descrição: quando AI retorna genérico ("Gasto") extrai da mensagem
            let expDesc = parsedData.description;
            if (!expDesc || /^gasto$/i.test(expDesc.trim())) {
              // Prioridade 1: "{valor} em/de/no/na {desc}" — ex: "19,90 em brincos novos"
              const mAfter = msgText.match(/\d[,.]?\d*\s*(?:reais|r\$)?\s+(?:em|de|no|na|nos|nas|do|da)\s+([a-zA-ZÀ-ú][a-zA-ZÀ-ú\s]{1,40}?)(?:\s+(?:ontem|hoje|hj|amanhã|também|tambem)|$)/i);
              // Prioridade 2: "{desc} {verbo?} {valor}" — para antes de verbos de preço e antes do número
              // ex: "Cinema 42,50", "Lanche no Cinema foi 40" → captura só "Lanche no Cinema"
              const mBefore = msgText.match(/^([a-zA-ZÀ-ú][a-zA-ZÀ-ú\s]{1,35}?)\s+(?:foi|é|e|eh|era|custa[va]?|saiu|valeu?|ficou|fica|gastei|paguei)?\s*\d/i);
              let extracted = (mAfter?.[1] || mBefore?.[1] || "").trim()
                .replace(/\s+(?:foi|é|e|eh|era|custa[va]?|saiu|valeu?|ficou|fica)$/i, "")
                .replace(/\s+(ontem|hoje|hj|amanhã|também|tambem)$/i, "").trim();
              if (extracted && extracted.length > 1) {
                expDesc = extracted;
                console.log(`[${remoteJid}] 📝 Desc fallback EXPENSE: "${expDesc}"`);
              } else {
                expDesc = "Gasto";
              }
            }
            // Infere categoria quando AI retornou "Outros" ou vazio
            const aiCat = parsedData.category || "";
            const expCat = (!aiCat || /^outros$/i.test(aiCat))
              ? (inferCategory(expDesc) || inferCategory(msgText) || "Outros")
              : aiCat;
            await prisma.expense.create({
              data: { user_id: user.id, amount: val, description: expDesc, category: expCat, date: expDate }
            });
            const dateStr = expDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
            financeReplies.push(`✅ Gasto registrado!\n📝 ${expDesc}\n💰 Valor: R$ ${val.toFixed(2).replace('.', ',')}\n📅 Data: ${dateStr}\n🏷️ Categoria: ${expCat}`);
            hasChange = true;
          } else {
            console.warn(`[${remoteJid}] ⚠️ EXPENSE ignorado: valor inválido (${parsedData.amount})`);
          }
        }

        // ── INCOME ───────────────────────────────────────────────────────────
        else if (action === "INCOME") {
          const val = parseFloat(String(parsedData.amount || 0).replace(',', '.').replace(/[^\d.]/g, ''));
          if (val > 0) {
            let incDateRaw = parsedData.date;
            if (!incDateRaw) {
              const t = new Date();
              if (/\bontem\b/i.test(msgText)) {
                const y = new Date(t); y.setDate(t.getDate() - 1);
                incDateRaw = `${y.getFullYear()}-${String(y.getMonth()+1).padStart(2,'0')}-${String(y.getDate()).padStart(2,'0')}`;
              } else if (/\banteontem\b/i.test(msgText)) {
                const y = new Date(t); y.setDate(t.getDate() - 2);
                incDateRaw = `${y.getFullYear()}-${String(y.getMonth()+1).padStart(2,'0')}-${String(y.getDate()).padStart(2,'0')}`;
              }
            }
            const incDate = incDateRaw
              ? (() => { const s = String(incDateRaw).replace(/Z$/i, ""); return new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + "T12:00:00" : s); })()
              : new Date();

            let incDesc = parsedData.description;
            if (!incDesc || /^receita$/i.test(incDesc.trim())) {
              const mAfter  = msgText.match(/\d[,.]?\d*\s*(?:reais|r\$)?\s+(?:em|de|no|na|nos|nas|do|da)\s+([a-zA-ZÀ-ú][a-zA-ZÀ-ú\s]{1,40}?)(?:\s+(?:ontem|hoje|hj|amanhã|também|tambem)|$)/i);
              const mBefore = msgText.match(/^([a-zA-ZÀ-ú][a-zA-ZÀ-ú\s]{1,35}?)\s+(?:foi|é|e|eh|era|custa[va]?|saiu|valeu?|ficou|fica|recebi|entrou)?\s*\d/i);
              let extracted = (mAfter?.[1] || mBefore?.[1] || "").trim()
                .replace(/\s+(?:foi|é|e|eh|era|saiu|valeu?|ficou|fica)$/i, "")
                .replace(/\s+(ontem|hoje|hj|amanhã|também|tambem)$/i, "").trim();
              incDesc = (extracted && extracted.length > 1) ? extracted : "Receita";
            }
            const aiIncCat = parsedData.category || "";
            const incCat = (!aiIncCat || /^(renda|outros)$/i.test(aiIncCat))
              ? (inferCategory(incDesc) || inferCategory(msgText) || "Renda")
              : aiIncCat;
            await prisma.income.create({
              data: { user_id: user.id, amount: val, description: incDesc, category: incCat, date: incDate }
            });
            const dateStr = incDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
            financeReplies.push(`✅ Receita registrada!\n📝 ${incDesc}\n💰 Valor: R$ ${val.toFixed(2).replace('.', ',')}\n📅 Data: ${dateStr}\n🏷️ Categoria: ${incCat}`);
            hasChange = true;
          }
        }

        // ── TASK ─────────────────────────────────────────────────────────────
        else if (action === "TASK") {
          const title = cleanTitle(parsedData.title || "");
          if (!title) { console.warn(`[${remoteJid}] ⚠️ TASK ignorada: título vazio`); continue; }

          // Rejeita títulos que são claramente perguntas retóricas ou negações
          // Ex: "não fiz nada", "nada hoje", "nenhuma tarefa", "não tenho nada"
          const invalidTitlePatterns = [
            /^(não|nao)\b/i,                     // começa com negação
            /\b(nada|nenhum[ao]?)\b/i,            // contém "nada" ou "nenhum"
            /\b(o\s+que\s+(eu\s+)?(fiz|tenho|tem))\b/i,  // "o que eu fiz/tenho"
            /\?$/,                                // título termina com "?"
          ];
          if (invalidTitlePatterns.some(p => p.test(title))) {
            console.warn(`[${remoteJid}] ⚠️ TASK rejeitada: título parece pergunta/negação "${title}"`);
            continue;
          }

          let dueDate = parsedData.due_date ? new Date(String(parsedData.due_date).replace(/Z$/i, "")) : null;

          // Fallback: se IA não enviou due_date mas a mensagem contém horário, extrai diretamente
          // Prioridade: "às 21h" > "21h30" > "21h" — evita capturar timestamps como "17:06"
          if (!dueDate) {
            const tMatch = msgText.match(/\bàs?\s*(\d{1,2})[h:](\d{2})\b/i)   // "às 21h30" ou "as 21:30"
                        || msgText.match(/\bàs?\s*(\d{1,2})h\b/i)              // "às 21h"
                        || msgText.match(/\b(\d{1,2})h(\d{2})\b/i)             // "21h30"
                        || msgText.match(/\b(\d{1,2})h\b/i);                   // "21h"
            if (tMatch) {
              const hour = parseInt(tMatch[1], 10);
              const min  = parseInt(tMatch[2] || '0', 10);
              if (hour <= 23 && min <= 59) {
                dueDate = new Date();
                dueDate.setHours(hour, min, 0, 0);
                console.log(`[${remoteJid}] 🕐 Fallback time extract: ${hour}:${String(min).padStart(2,'0')}`);
              }
            }
          }

          // Padrão 9h: se a IA enviou uma data mas sem horário (meia-noite = hora não especificada),
          // aplica 09:00 como horário padrão de lembrete
          if (dueDate && dueDate.getHours() === 0 && dueDate.getMinutes() === 0) {
            dueDate.setHours(9, 0, 0, 0);
            console.log(`[${remoteJid}] 🕘 Horário padrão aplicado: 09:00`);
          }

          const shouldRemind = dueDate !== null;
          const notifiedFlag = !shouldRemind; // false = alarme ativo

          const existing = await prisma.task.findFirst({
            where: { user_id: user.id, completed: false, title: { contains: title, mode: 'insensitive' } }
          });

          if (existing) {
            await prisma.task.update({
              where: { id: existing.id },
              data: { due_date: dueDate || existing.due_date, notified: notifiedFlag, notified_5min: notifiedFlag }
            });
            console.log(`[${remoteJid}] 🔄 Tarefa atualizada: "${title}"`);
          } else {
            await prisma.task.create({
              data: { user_id: user.id, title, due_date: dueDate, notified: notifiedFlag, notified_5min: notifiedFlag }
            });
            console.log(`[${remoteJid}] ✅ Tarefa criada: "${title}"`);
          }

          // Acumula confirmação — suporta múltiplas tarefas na mesma mensagem
          if (dueDate) {
            const hh = String(dueDate.getHours()).padStart(2, '0');
            const mm = String(dueDate.getMinutes()).padStart(2, '0');
            const dateStr = dueDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
            taskReplies.push(`✅ Lembrete criado!\n📝 ${title}\n📅 ${dateStr} às ${hh}:${mm}\n🔔 Lembrete: ativo às ${hh}:${mm}`);
          } else {
            taskReplies.push(`✅ Tarefa registrada!\n📝 ${title}\n🔔 Lembrete: sem horário definido`);
          }
          hasChange = true;
        }

        // ── QUERY ─────────────────────────────────────────────────────────────
        else if (action === "QUERY") {
          let queryType = (parsedData.type || "SUMMARY").toUpperCase();

          // Override semântico: se IA retornou SUMMARY mas mensagem é claramente sobre gastos, receitas ou agenda
          const msgLowerQ = msgText.toLowerCase();
          if (queryType === "SUMMARY") {
            if (/\b(gastei|gasto|despesa|extrato|saiu|paguei|quanto\s+gast)\b/.test(msgLowerQ))
              queryType = "EXPENSES";
            else if (/\b(recebi|receita|entrou|entrad[ao]|salário|renda|quanto\s+recebi)\b/.test(msgLowerQ))
              queryType = "INCOMES";
            else if (/\b(agenda|tarefas?|atividades?|compromissos?|afazeres?|o\s+que\s+(eu\s+)?(fiz|tenho|tem)|minha\s+lista)\b/.test(msgLowerQ))
              queryType = "TASKS";
            else if (/^(liste?|extrato|listagem|mostre?|exibe?|mostra|ver)\s*$|^(liste?|mostre?|exibe?)\s+(tudo|tudo|os\s+gastos?|os\s+registros?|meus\s+gastos?|minhas\s+receitas?|meu\s+extrato)\s*$/i.test(msgLowerQ))
              queryType = "EXPENSES"; // "liste", "extrato", "ver" sem qualificador → mostra gastos
          }

          // Override contextual: "e dessa semana?" / "e na sexta?" é follow-up — herda tipo da última consulta
          if (queryType === "SUMMARY") {
            const isFollowUp = /^(e\b|e\s+(a[aio]?|o|essa?|nessa?|esta?|neste?|desse?|deste?|do|da|no|na|na\s+sexta|na\s+segunda|anteontem|ontem|amanhã)\b)/i.test(msgLowerQ);
            if (isFollowUp) {
              const lastBotQuery = memory
                .filter(m => m.role === "assistant")
                .slice(-5)
                .map(m => m.content)
                .find(c => /mostrei os dados:/i.test(c));
              if (lastBotQuery) {
                if (/EXPENSES/i.test(lastBotQuery)) { queryType = "EXPENSES"; console.log(`[${remoteJid}] 🔄 Context inherit: EXPENSES`); }
                else if (/INCOMES/i.test(lastBotQuery)) { queryType = "INCOMES"; console.log(`[${remoteJid}] 🔄 Context inherit: INCOMES`); }
                else if (/TASKS/i.test(lastBotQuery)) { queryType = "TASKS"; console.log(`[${remoteJid}] 🔄 Context inherit: TASKS`); }
              }
            }
          }

          // Sincroniza parsedData.type com o queryType final (após overrides)
          // — garante que replyToSave salve o tipo correto ("Mostrei os dados: EXPENSES", não "SUMMARY")
          parsedData.type = queryType;

          // Resolução de período
          let dateFilter = { gte: firstDayMonth };
          if (parsedData.date) {
            const rawDate = String(parsedData.date).trim().toUpperCase();
            if (rawDate === "HOJE" || rawDate === "TODAY") {
              const t = new Date();
              dateFilter = {
                gte: new Date(t.getFullYear(), t.getMonth(), t.getDate(), 0, 0, 0),
                lte: new Date(t.getFullYear(), t.getMonth(), t.getDate(), 23, 59, 59)
              };
            } else {
              const monthMatch = rawDate.match(/^(\d{4})-(\d{2})$/);
              if (monthMatch) {
                const yr = parseInt(monthMatch[1]);
                const mo = parseInt(monthMatch[2]) - 1;
                dateFilter = { gte: new Date(yr, mo, 1), lte: new Date(yr, mo + 1, 0, 23, 59, 59) };
              } else {
                const d = new Date(rawDate);
                if (!isNaN(d.getTime())) {
                  dateFilter = {
                    gte: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0),
                    lte: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59)
                  };
                }
              }
            }
          }

          // Fallback semântico de período — se IA não enviou date mas mensagem tem indicador temporal
          let periodLabel = "";
          if (!parsedData.date && queryType !== "SUMMARY") {
            const t = new Date();
            if (/\b(hoje|hj)\b/i.test(msgText)) {
              dateFilter = {
                gte: new Date(t.getFullYear(), t.getMonth(), t.getDate(), 0, 0, 0),
                lte: new Date(t.getFullYear(), t.getMonth(), t.getDate(), 23, 59, 59)
              };
              periodLabel = "hoje";
            } else if (/\bontem\b/i.test(msgText)) {
              const y = new Date(t); y.setDate(t.getDate() - 1);
              dateFilter = {
                gte: new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0),
                lte: new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59)
              };
              periodLabel = "ontem";
            } else if (/\banteontem\b/i.test(msgText)) {
              const y = new Date(t); y.setDate(t.getDate() - 2);
              dateFilter = {
                gte: new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0),
                lte: new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59)
              };
              periodLabel = "anteontem";
            } else if (/\b(essa|esta|nessa|nesta|dessa|desta)\s+semana\b/i.test(msgText)) {
              const dow = t.getDay();
              const daysFromMon = dow === 0 ? 6 : dow - 1;
              const mon = new Date(t); mon.setDate(t.getDate() - daysFromMon); mon.setHours(0, 0, 0, 0);
              const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23, 59, 59, 999);
              dateFilter = { gte: mon, lte: sun };
              periodLabel = "esta semana";
            } else if (/\b(semana\s+passada|última\s+semana)\b/i.test(msgText)) {
              const dow = t.getDay();
              const daysFromMon = dow === 0 ? 6 : dow - 1;
              const thisMon = new Date(t); thisMon.setDate(t.getDate() - daysFromMon);
              const lastMon = new Date(thisMon); lastMon.setDate(thisMon.getDate() - 7); lastMon.setHours(0, 0, 0, 0);
              const lastSun = new Date(lastMon); lastSun.setDate(lastMon.getDate() + 6); lastSun.setHours(23, 59, 59, 999);
              dateFilter = { gte: lastMon, lte: lastSun };
              periodLabel = "na semana passada";
            }
          }

          let queryResult = "";

          if (queryType === "TASKS") {
            // Se há um dateFilter específico (não o default do mês inteiro), filtra tarefas pelo due_date
            const hasSpecificDate = parsedData.date ||
              /\b(hoje|hj|amanhã|ontem|sexta|segunda|terça|quarta|quinta|sábado|domingo)\b/i.test(msgText) ||
              /\b(essa|esta|nessa|nesta|dessa|desta)\s+semana\b/i.test(msgText);

            const taskWhere = hasSpecificDate
              ? { user_id: user.id, completed: false, due_date: dateFilter }
              : { user_id: user.id, completed: false };

            const list = await prisma.task.findMany({
              where: taskWhere,
              orderBy: { due_date: 'asc' }
            });
            if (list.length > 0) {
              // Salva lista no cache
              const cache = lastListCache.get(remoteJid) || {};
              cache.tasks = list;
              lastListCache.set(remoteJid, cache);

              queryResult = `📅 SUA AGENDA\n━━━━━━━━━━━━━━━━━━\n\n`;
              queryResult += list.map((t, idx) => {
                const num = idx + 1;
                if (!t.due_date) return `${num}. 🔔 ${t.title}\n   └─ Sem horário definido`;
                const dStr = new Date(t.due_date).toLocaleString("pt-BR", {
                  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit",
                  hour: "2-digit", minute: "2-digit"
                });
                return `${num}. 🔔 ${t.title}\n   └─ ⏰ ${dStr}`;
              }).join("\n\n");
              queryResult += `\n\n━━━━━━━━━━━━━━━━━━\nTotal: ${list.length} tarefa(s) pendente(s)`;
            } else {
              // Se a pergunta era "o que eu fiz", o usuário quer histórico — sugere extrato
              const askingPast = /\b(fiz|fiz\s+hj|o\s+que\s+eu\s+fiz|atividades\s+de\s+hj)\b/i.test(msgText);
              if (askingPast) {
                queryResult = "Nenhuma tarefa pendente no momento.\n\nSe quiser ver o que movimentou hoje financeiramente, é só perguntar \"quanto gastei hj?\" ou \"meu resumo de hoje\". 📊";
              } else {
                queryResult = "Sua agenda está limpa! Nenhuma tarefa pendente. 🎉";
              }
            }

          } else if (queryType === "EXPENSES") {
            const exps = await prisma.expense.findMany({
              where: { user_id: user.id, date: dateFilter },
              orderBy: { date: 'desc' },
              take: 50
            });
            // Salva lista no cache na mesma ordem exibida em formatFinanceRecords (por categoria total desc)
            {
              const grps = {};
              exps.forEach(r => { const c = r.category || "Outros"; if (!grps[c]) grps[c] = []; grps[c].push(r); });
              const totals = {};
              Object.entries(grps).forEach(([c, items]) => { totals[c] = items.reduce((s, i) => s + i.amount, 0); });
              const orderedExps = Object.keys(grps).sort((a, b) => totals[b] - totals[a]).flatMap(c => grps[c]);
              const cache = lastListCache.get(remoteJid) || {};
              cache.expenses = orderedExps;
              lastListCache.set(remoteJid, cache);
            }
            queryResult = formatFinanceRecords(exps, "EXPENSE", periodLabel);

          } else if (queryType === "INCOMES") {
            const incs = await prisma.income.findMany({
              where: { user_id: user.id, date: dateFilter },
              orderBy: { date: 'desc' },
              take: 50
            });
            {
              const grps = {};
              incs.forEach(r => { const c = r.category || "Renda"; if (!grps[c]) grps[c] = []; grps[c].push(r); });
              const totals = {};
              Object.entries(grps).forEach(([c, items]) => { totals[c] = items.reduce((s, i) => s + i.amount, 0); });
              const orderedIncs = Object.keys(grps).sort((a, b) => totals[b] - totals[a]).flatMap(c => grps[c]);
              const cache = lastListCache.get(remoteJid) || {};
              cache.incomes = orderedIncs;
              lastListCache.set(remoteJid, cache);
            }
            queryResult = formatFinanceRecords(incs, "INCOME", periodLabel);

          } else { // SUMMARY
            const [tasks, eAgg, iAgg] = await Promise.all([
              prisma.task.findMany({ where: { user_id: user.id, completed: false }, take: 5 }),
              prisma.expense.aggregate({ where: { user_id: user.id, date: dateFilter }, _sum: { amount: true } }),
              prisma.income.aggregate({ where: { user_id: user.id, date: dateFilter }, _sum: { amount: true } })
            ]);
            const inc = iAgg._sum.amount || 0;
            const exp = eAgg._sum.amount || 0;
            const bal = inc - exp;
            const balEmoji = bal >= 0 ? "✅" : "⚠️";
            queryResult = `✨ RESUMO MENSAL\n━━━━━━━━━━━━━━━━━━\n\n`;
            queryResult += `📈 Receitas:  R$ ${inc.toFixed(2)}\n`;
            queryResult += `📉 Gastos:    R$ ${exp.toFixed(2)}\n`;
            queryResult += `━━━━━━━━━━━━━━━━━━\n`;
            queryResult += `${balEmoji} Saldo:     R$ ${bal.toFixed(2)}\n\n`;
            queryResult += `📋 Tarefas pendentes: ${tasks.length}`;
          }

          // Junta a fala da IA com os dados reais
          aiResponse.reply = (aiResponse.reply ? aiResponse.reply.trim() + "\n\n" : "") + queryResult;
          console.log(`[${remoteJid}] 📊 QUERY ${queryType} executada com sucesso.`);
        }

        // ── DONE ─────────────────────────────────────────────────────────────
        else if (action === "DONE") {
          const taskName = (parsedData.title || "").toLowerCase();
          if (!taskName) { console.warn(`[${remoteJid}] ⚠️ DONE ignorado: título vazio`); continue; }

          const task = await prisma.task.findFirst({
            where: { user_id: user.id, completed: false, title: { contains: taskName, mode: 'insensitive' } },
            orderBy: { created_at: 'desc' }
          });

          if (task) {
            await prisma.task.update({ where: { id: task.id }, data: { completed: true } });
            // Sempre sobrescreve — evita duplicação com o reply da IA
            aiResponse.reply = `✅ Tarefa concluída!\n📝 "${task.title}"\n🏆 Status: Finalizada`;
            hasChange = true;
          } else {
            console.log(`[${remoteJid}] ⚠️ Tarefa para DONE não encontrada: "${taskName}"`);
            aiResponse.reply = `Não encontrei nenhuma tarefa pendente com esse nome. Deseja ver sua agenda completa?`;
          }
        }

        // ── UPDATE ───────────────────────────────────────────────────────────
        else if (action === "UPDATE") {
          let updType   = (parsedData.type  || "EXPENSE").toUpperCase();
          let target    = (parsedData.target || "").toLowerCase().trim();
          const field     = (parsedData.field  || "").toLowerCase();
          const rawValue  = parsedData.value;
          const isBulk    = !target || ["todos","all","tudo","todas"].includes(target);

          // Resolve referência numérica ("2", "item 3") para id real do cache
          if (!isBulk && /^\d+$/.test(target.replace(/\D/g, "")) && /\d/.test(target)) {
            const resolved = resolveNumericRef(target, lastListCache.get(remoteJid));
            if (resolved) {
              if (resolved.listType === "expenses") { updType = "EXPENSE"; target = resolved.item.description.toLowerCase(); }
              else if (resolved.listType === "incomes") { updType = "INCOME"; target = resolved.item.description.toLowerCase(); }
              console.log(`[${remoteJid}] 🔢 UPDATE numérico resolvido: "${target}" (${resolved.listType})`);
            }
          }

          const model     = updType === "INCOME" ? prisma.income : prisma.expense;
          const label     = updType === "INCOME" ? "Receita" : "Gasto";

          // Monta o dado a atualizar
          let updateData = {};
          if (field === "category") {
            updateData.category = String(rawValue).trim();
          } else if (field === "date") {
            const rv = String(rawValue).trim().toUpperCase();
            const t  = new Date();
            let nd;
            if (rv === "HOJE" || rv === "TODAY") {
              nd = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 12, 0, 0);
            } else if (rv === "ONTEM") {
              nd = new Date(t); nd.setDate(t.getDate() - 1); nd.setHours(12, 0, 0, 0);
            } else if (rv === "ANTEONTEM") {
              nd = new Date(t); nd.setDate(t.getDate() - 2); nd.setHours(12, 0, 0, 0);
            } else {
              const s = rv.replace(/Z$/i, "");
              nd = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + "T12:00:00" : s);
            }
            if (nd && !isNaN(nd.getTime())) updateData.date = nd;
          } else if (field === "amount") {
            const v = parseFloat(String(rawValue).replace(',', '.'));
            if (v > 0) updateData.amount = v;
          } else if (field === "description") {
            updateData.description = String(rawValue).trim();
          }

          if (Object.keys(updateData).length === 0) {
            console.warn(`[${remoteJid}] ⚠️ UPDATE ignorado: campo/valor inválido (field=${field}, value=${rawValue})`);
          } else if (isBulk) {
            const result = await model.updateMany({ where: { user_id: user.id }, data: updateData });
            const newVal = field === "date" ? updateData.date?.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : rawValue;
            aiResponse.reply = `✅ ${result.count} registro(s) atualizado(s)!\n🏷️ ${field} → ${newVal}`;
            hasChange = true;
          } else {
            const record = await model.findFirst({
              where: { user_id: user.id, description: { contains: target, mode: 'insensitive' } },
              orderBy: { date: 'desc' }
            });
            if (record) {
              await model.update({ where: { id: record.id }, data: updateData });
              const newVal = field === "date" ? updateData.date?.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : rawValue;
              const fieldLabel = { category: "Categoria", date: "Data", amount: "Valor", description: "Descrição" }[field] || field;
              aiResponse.reply = `✅ ${label} atualizado!\n📝 ${record.description}\n🏷️ ${fieldLabel}: ${newVal}`;
              hasChange = true;
            } else {
              aiResponse.reply = `Não encontrei nenhum registro com a descrição "${target}". Confira o nome exato e tente novamente.`;
            }
          }
        }

        // ── DELETE ───────────────────────────────────────────────────────────
        else if (action === "DELETE") {
          const delType = (parsedData.type || "ALL").toUpperCase();
          const rawLower = msgText.toLowerCase();

          // target genérico (possessivos, artigos, tipo-espelho) → delete-all, não busca por nome
          const rawTarget = (parsedData.target || "").toLowerCase().trim();
          const genericTargets = [
            "todos", "tudo", "all", "todas", "tud",
            "meus", "minhas", "meu", "minha", "os", "as",
            "gastos", "despesas", "receitas", "tarefas", "compromissos", "registros"
          ];
          let target = genericTargets.includes(rawTarget) ? "" : rawTarget;

          // Se a IA retornou type=ALL mas a mensagem menciona tipo específico, corrige para o tipo certo
          let effectiveDelType = delType;
          if (delType === "ALL") {
            if (rawLower.match(/\b(gastos?|despesas?)\b/))           effectiveDelType = "EXPENSES";
            else if (rawLower.match(/\b(receitas?|renda)\b/))        effectiveDelType = "INCOMES";
            else if (rawLower.match(/\b(tarefas?|compromissos?)\b/)) effectiveDelType = "TASKS";
          }

          // Resolve referência numérica ("delete o 2") para descrição real do cache
          if (target && /\d/.test(target)) {
            const numOnly = target.replace(/\D/g, "");
            if (numOnly) {
              const resolved = resolveNumericRef(numOnly, lastListCache.get(remoteJid));
              if (resolved) {
                target = resolved.listType === "tasks" ? resolved.item.title.toLowerCase() : resolved.item.description.toLowerCase();
                if (effectiveDelType === "ALL" || effectiveDelType === delType) {
                  if (resolved.listType === "expenses") effectiveDelType = "EXPENSES";
                  else if (resolved.listType === "incomes") effectiveDelType = "INCOMES";
                  else if (resolved.listType === "tasks")   effectiveDelType = "TASKS";
                }
                console.log(`[${remoteJid}] 🔢 DELETE numérico resolvido: "${target}" (${resolved.listType})`);
              }
            }
          }

          // Reset total: só se sem tipo específico na mensagem E sem keyword de tipo
          const isFullReset = effectiveDelType === "ALL" || rawLower.includes("reset");

          if (isFullReset) {
            await Promise.all([
              prisma.task.deleteMany({ where: { user_id: user.id } }),
              prisma.expense.deleteMany({ where: { user_id: user.id } }),
              prisma.income.deleteMany({ where: { user_id: user.id } })
            ]);
            aiResponse.reply = "🗑️ Reset completo! Todos os seus registros foram removidos.";
            hasChange = true;

          } else if (effectiveDelType === "EXPENSES" || effectiveDelType === "INCOMES") {
            const model = effectiveDelType === "EXPENSES" ? prisma.expense : prisma.income;
            const label = effectiveDelType === "EXPENSES" ? "Gasto" : "Receita";

            if (target) {
              const record = await model.findFirst({
                where: { user_id: user.id, description: { contains: target, mode: 'insensitive' } },
                orderBy: { date: 'desc' }
              });
              if (record) {
                await model.delete({ where: { id: record.id } });
                aiResponse.reply = (aiResponse.reply ? aiResponse.reply + "\n\n" : "") +
                  `🗑️ ${label} removido!\n📝 ${record.description} — R$ ${record.amount.toFixed(2)}`;
                hasChange = true;
              } else {
                aiResponse.reply = (aiResponse.reply ? aiResponse.reply + "\n\n" : "") +
                  `Não encontrei nenhum registro de ${label.toLowerCase()} com o nome "${target}".`;
              }
            } else {
              await model.deleteMany({ where: { user_id: user.id } });
              aiResponse.reply = `🗑️ Todos os registros de ${label.toLowerCase()} foram removidos.`;
              hasChange = true;
            }

          } else if (effectiveDelType === "TASKS") {
            if (target) {
              const task = await prisma.task.findFirst({
                where: { user_id: user.id, title: { contains: target, mode: 'insensitive' } },
                orderBy: { created_at: 'desc' }
              });
              if (task) {
                await prisma.task.delete({ where: { id: task.id } });
                aiResponse.reply = (aiResponse.reply ? aiResponse.reply + "\n\n" : "") +
                  `🗑️ Tarefa removida!\n📝 "${task.title}"`;
                hasChange = true;
              } else {
                aiResponse.reply = (aiResponse.reply ? aiResponse.reply + "\n\n" : "") +
                  `Não encontrei nenhuma tarefa com o nome "${target}".`;
              }
            } else {
              await prisma.task.deleteMany({ where: { user_id: user.id } });
              aiResponse.reply = "🗑️ Todas as suas tarefas foram removidas.";
              hasChange = true;
            }
          }
        }

        // ── TOGGLE_ALARM ─────────────────────────────────────────────────────
        else if (action === "TOGGLE_ALARM") {
          const target = (parsedData.target || "").toLowerCase();
          const turnOff = parsedData.active === false;
          const flagStatus = turnOff; // true = "já notificado" = alarme silenciado

          if (target === "todos" || target === "tudo" || !target) {
            await prisma.task.updateMany({
              where: { user_id: user.id, completed: false },
              data: { notified: flagStatus, notified_5min: flagStatus }
            });
          } else {
            const task = await prisma.task.findFirst({
              where: { user_id: user.id, completed: false, title: { contains: target, mode: 'insensitive' } }
            });
            if (task) {
              await prisma.task.update({
                where: { id: task.id },
                data: { notified: flagStatus, notified_5min: flagStatus }
              });
            }
          }
          hasChange = true;
        }

        // ── SUBSCRIBE ────────────────────────────────────────────────────────
        else if (action === "SUBSCRIBE") {
          try {
            const session = await stripe.checkout.sessions.create({
              payment_method_types: ['card'],
              line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
              mode: 'subscription',
              subscription_data: { trial_period_days: 30 },
              allow_promotion_codes: true,
              client_reference_id: remoteJid,
              phone_number_collection: { enabled: true },
              success_url: `${APP_URL}`,
              cancel_url: `${APP_URL}`,
            });
            aiResponse.reply += `\n\n🔗 Ative sua assinatura aqui (30 dias grátis): ${session.url}`;
            hasChange = true;
          } catch (stripeErr) {
            console.error(`[${remoteJid}] ❌ Stripe:`, stripeErr.message);
          }
        }

        else {
          console.warn(`[${remoteJid}] ⚠️ Action desconhecida: "${action}"`);
        }

      } catch (actionErr) {
        console.error(`[${remoteJid}] ❌ Erro na action "${action}":`, actionErr.message);
      }
    } // fim for actions

    // Aplica confirmações acumuladas de múltiplas tarefas
    if (taskReplies.length > 0) {
      aiResponse.reply = taskReplies.join("\n\n");
    }

    // Aplica confirmações acumuladas de transações financeiras (formato padronizado)
    if (financeReplies.length > 0) {
      aiResponse.reply = financeReplies.join("\n\n");
    }

    // ─── Resposta final ────────────────────────────────────────────────────────
    let finalReply = (aiResponse.reply || "").trim();

    if (!finalReply) {
      finalReply = hasChange
        ? "Tudo registrado! ✅"
        : "Não entendi bem. Pode me explicar de outra forma?";
    }

    // Remove formatação Markdown que não funciona no WhatsApp
    finalReply = finalReply.replace(/[*_`#]/g, '').trim();

    // Salva no histórico apenas um resumo curto e limpo.
    // NUNCA salva extratos/relatórios — eles estouram o contexto da IA nas próximas chamadas.
    const hasQuery = uniqueActs.some(a => a.action === "QUERY");
    let replyToSave;
    if (hasQuery) {
      // Salva label neutro que não começa com "Aqui estão/está" para evitar eco.
      // O safeguard captura qualquer echo (Consulta realizada / Aqui estão / Aqui está).
      const queryTypes = uniqueActs.filter(a => a.action === "QUERY").map(a => a.parsedData?.type || "SUMMARY").join(", ");
      replyToSave = `Mostrei os dados: ${queryTypes}`;
    } else {
      // Para TASK: salva título para que mensagens seguintes (ex: "desative o lembrete") saibam o alvo
      const taskAct = uniqueActs.find(a => a.action === "TASK");
      if (taskAct?.parsedData?.title) {
        replyToSave = `Tarefa registrada: ${taskAct.parsedData.title}`;
      } else {
        // Para demais ações, salva primeira linha da confirmação
        replyToSave = finalReply.split("\n")[0].substring(0, 120);
      }
    }

    await prisma.message.create({
      data: { user_id: user.id, role: "assistant", content: replyToSave }
    });

    const instanceName = instance || "main";
    console.log(`[${remoteJid}] 📤 Enviando resposta (${finalReply.length} chars)...`);
    await sendText(remoteJid, finalReply, instanceName);

  } catch (err) {
    console.error(`[${remoteJid}] ❌ Erro Core:`, err.message, err.stack);
    try {
      await sendText(remoteJid, "Ocorreu um erro interno. Por favor, tente novamente.", instance || "main");
    } catch (_) { }
  } finally {
    userLocks.delete(remoteJid);
  }
}

// ─── Helpers de Comunicação ────────────────────────────────────────────────────

async function sendText(number, text, instance) {
  const endpoint = `${EVO_URL.replace(/\/$/, "")}/message/sendText/${instance}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": EVO_KEY },
      body: JSON.stringify({ number, text }),
      signal: controller.signal
    });
    if (res.ok) {
      console.log(`[${number}] ✅ Mensagem enviada.`);
    } else {
      console.error(`[${number}] ❌ Envio falhou (${res.status}):`, await res.text());
    }
  } catch (e) {
    console.error(`[${number}] ❌ sendText erro:`, e.message);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function sendEvolutionButtons(number, text, instance, buttons) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const endpoint = `${EVO_URL.replace(/\/$/, "")}/message/sendButtons/${instance}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": EVO_KEY },
      body: JSON.stringify({
        number,
        title: "Assessor Nico",
        description: text,
        footer: "Toque em um botão para agir",
        buttons: buttons.map(b => ({ type: "reply", displayText: b.text, id: b.id }))
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      console.error(`[${number}] ❌ sendButtons falhou (${response.status}):`, await response.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[${number}] ❌ sendButtons erro:`, e.message);
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Servidor HTTP ─────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const allowedOrigin = process.env.APP_URL || "http://localhost:3000";
  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  // ── Reset de banco (apenas com token) ──────────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/nico-reset-database-delete-all')) {
    const params = new URL(req.url, `http://localhost`).searchParams;
    if (!RESET_SECRET || params.get('token') !== RESET_SECRET) {
      res.writeHead(403); return res.end("403 Forbidden");
    }
    try {
      await prisma.message.deleteMany({});
      await prisma.task.deleteMany({});
      await prisma.expense.deleteMany({});
      try { await prisma.note.deleteMany({}); } catch (_) { }
      await prisma.user.deleteMany({});
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("✅ Banco zerado com sucesso.");
    } catch (err) {
      res.writeHead(500); res.end("❌ Erro: " + err.message);
    }
    return;
  }

  const cleanUrl = req.url.split('?')[0].replace(/\/$/, '');

  // ── Health Check ───────────────────────────────────────────────────────────
  if (req.method === 'GET' && (cleanUrl === "" || cleanUrl === "/health")) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end("Nico is alive! 🚀");
  }

  // ── Assinar (30 dias grátis) ───────────────────────────────────────────────
  if (req.method === 'GET' && cleanUrl === '/assinar') {
    try {
      // Aceita ?jid=5591999999999 para vincular checkout ao usuário WhatsApp
      const jidParam = new URL(req.url, `http://localhost`).searchParams.get('jid');
      const clientRef = jidParam ? (jidParam.includes('@') ? jidParam : `${jidParam}@s.whatsapp.net`) : undefined;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
        mode: 'subscription',
        subscription_data: { trial_period_days: 30 },
        allow_promotion_codes: true,
        client_reference_id: clientRef,
        phone_number_collection: { enabled: true },
        success_url: `${APP_URL}`,
        cancel_url: `${APP_URL}`,
      });
      res.writeHead(302, { Location: session.url });
      return res.end();
    } catch (err) {
      console.error("[CHECKOUT] Erro ao criar sessão:", err.message);
      res.writeHead(500); return res.end("Erro ao criar checkout.");
    }
  }

  // ── Webhook Stripe ─────────────────────────────────────────────────────────
  if (req.method === 'POST' && cleanUrl === '/webhook/stripe') {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", async () => {
      try {
        const body = Buffer.concat(chunks);
        const signature = req.headers['stripe-signature'];
        let ev;

        if (STRIPE_WEBHOOK_SECRET && signature) {
          try {
            ev = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
          } catch (sigErr) {
            console.error("[STRIPE] ❌ Assinatura inválida:", sigErr.message);
            res.writeHead(400); res.end("Invalid signature"); return;
          }
        } else {
          console.warn("[STRIPE] ⚠️ Validando sem assinatura (configure STRIPE_WEBHOOK_SECRET em produção).");
          ev = JSON.parse(body.toString());
        }

        console.log(`[STRIPE] Evento: ${ev.type}`);

        // ── Ativa conta ao cadastrar cartão (início do trial ou pagamento) ──────
        if (ev.type === 'checkout.session.completed') {
          const session = ev.data.object;
          let phone = session.client_reference_id || session.metadata?.whatsapp || session.customer_details?.phone;

          if (phone) {
            let cleanPhone = phone.replace(/[^\d]/g, '');
            if (cleanPhone.length >= 10 && cleanPhone.length <= 11 && !cleanPhone.startsWith("55")) {
              cleanPhone = `55${cleanPhone}`;
            }
            if (!cleanPhone.includes("@s.whatsapp.net")) cleanPhone = `${cleanPhone}@s.whatsapp.net`;

            // Salva o telefone no cliente Stripe para uso futuro (cancelamento, falha)
            if (session.customer) {
              try {
                await stripe.customers.update(session.customer, { phone: cleanPhone.replace('@s.whatsapp.net', '') });
              } catch (e) {
                console.warn("[STRIPE] Não foi possível salvar phone no customer:", e.message);
              }
            }

            const cNo9 = cleanPhone.replace(/^55(\d{2})9/, '55$1');
            const cWith9 = cleanPhone.replace(/^55(\d{2})(\d{8})@/, '55$19$2@');

            const existing = await prisma.user.findFirst({
              where: { OR: [{ phone_number: cleanPhone }, { phone_number: cNo9 }, { phone_number: cWith9 }] }
            });

            if (existing) {
              await prisma.user.update({ where: { id: existing.id }, data: { status: 'ACTIVE' } });
            } else {
              await prisma.user.create({ data: { phone_number: cleanPhone, status: 'ACTIVE' } });
            }

            const inst = process.env.INSTANCE || "main";
            await sendText(cleanPhone,
              "Acesso confirmado! ✅\n\nSou o Nico, seu Assessor Financeiro Pessoal. Estou pronto para te ajudar com finanças, tarefas e muito mais. 📈\n\n🎁 Seu período de teste gratuito de 30 dias começou agora. Você só será cobrado após esse período — e pode cancelar quando quiser antes disso.\n\nComece mandando:\n- \"gastei 50 no mercado\"\n- \"me lembra de treinar às 18h\"\n- \"qual meu saldo do mês?\"",
              inst
            );
          }
        }

        // ── Bloqueia conta se pagamento falhar após o trial ──────────────────
        if (ev.type === 'invoice.payment_failed' || ev.type === 'customer.subscription.deleted') {
          const obj = ev.data.object;
          const customerId = obj.customer;

          if (customerId) {
            const customer = await stripe.customers.retrieve(customerId);
            const rawPhone = customer.phone || customer.metadata?.whatsapp;

            if (rawPhone) {
              let cleanPhone = rawPhone.replace(/[^\d]/g, '');
              if (cleanPhone.length >= 10 && cleanPhone.length <= 11 && !cleanPhone.startsWith("55")) {
                cleanPhone = `55${cleanPhone}`;
              }
              if (!cleanPhone.includes("@s.whatsapp.net")) cleanPhone = `${cleanPhone}@s.whatsapp.net`;

              const cNo9 = cleanPhone.replace(/^55(\d{2})9/, '55$1');
              const cWith9 = cleanPhone.replace(/^55(\d{2})(\d{8})@/, '55$19$2@');

              const user = await prisma.user.findFirst({
                where: { OR: [{ phone_number: cleanPhone }, { phone_number: cNo9 }, { phone_number: cWith9 }] }
              });

              if (user) {
                await prisma.user.update({ where: { id: user.id }, data: { status: 'INACTIVE' } });
                console.log(`[STRIPE] 🔒 Acesso bloqueado: ${cleanPhone} (${ev.type})`);

                const inst = process.env.INSTANCE || "main";
                const msg = ev.type === 'invoice.payment_failed'
                  ? "Seu acesso ao Nico foi suspenso por falha no pagamento. Para reativar, atualize seu método de pagamento: https://www.nicoassessor.com/"
                  : "Sua assinatura foi cancelada e o acesso foi encerrado. Para voltar a usar o Nico: https://www.nicoassessor.com/";
                await sendText(cleanPhone, msg, inst);
              }
            }
          }
        }

        res.writeHead(200); res.end();
      } catch (e) {
        console.error("[STRIPE] Erro:", e.message);
        res.writeHead(400); res.end();
      }
    });
    return;
  }

  // ── Webhook Evolution (WhatsApp) ───────────────────────────────────────────
  if (req.method === "POST" && (cleanUrl === "/webhook/evolution" || cleanUrl === "/webhook")) {
    // Valida apikey do webhook se configurada
    const webhookSecret = process.env.WEBHOOK_SECRET || "";
    if (webhookSecret) {
      const incomingKey = req.headers['apikey'] || req.headers['x-api-key'] || "";
      if (incomingKey !== webhookSecret) {
        res.writeHead(401); return res.end("Unauthorized");
      }
    }
    let body = "";
    req.on("data", c => body += c);
    req.on("end", async () => {
      const end200 = () => { res.writeHead(200); res.end(); };
      try {
        const payload = JSON.parse(body);
        if (payload.event !== "messages.upsert") return end200();

        const dataKey = payload.data?.key || payload.data?.message?.key || {};
        let remoteJid = dataKey.remoteJid || "";
        const msgId = dataKey.id || "";

        // Normaliza JID (remove sufixo de multiconta :1 :2)
        if (remoteJid.includes(":")) {
          remoteJid = remoteJid.split(":")[0] + "@s.whatsapp.net";
        }

        if (dataKey.fromMe || !remoteJid || remoteJid.includes("@g.us")) return end200();
        if (processedIds.has(msgId)) return end200();

        processedIds.add(msgId);
        setTimeout(() => processedIds.delete(msgId), 60000);

        const msgNode = payload.data?.message || payload.data;
        let msgText = msgNode?.conversation
          || msgNode?.extendedTextMessage?.text
          || msgNode?.imageMessage?.caption
          || msgNode?.buttonsResponseMessage?.selectedButtonId
          || msgNode?.templateButtonReplyMessage?.selectedId
          || "";

        // Traduz IDs de botão para texto natural
        const btnAliases = {
          "confirm_task": "mostrar minha agenda",
          "done_last": "concluir última tarefa"
        };
        if (btnAliases[msgText]) msgText = btnAliases[msgText];

        // Remove prefixos de teste e ruídos
        msgText = msgText
          .replace(/\[TESTE \d+\/\d+\]/gi, '')
          .replace(/^G\d+\s*·\s*[^\n]+\n?/i, '')
          .replace(/^=/, '')
          .trim();

        if (!msgText) return end200();

        // Debounce: aguarda DEBOUNCE_TIME ms antes de processar
        if (!messageBuffers.has(remoteJid)) messageBuffers.set(remoteJid, { texts: [], timer: null });
        const buffer = messageBuffers.get(remoteJid);
        buffer.texts.push(msgText);

        if (buffer.timer) clearTimeout(buffer.timer);
        buffer.timer = setTimeout(() => {
          const tryProcess = (attempt = 0) => {
            if (attempt >= 10) {
              console.error(`[${remoteJid}] ❌ Máximo de tentativas atingido — mensagem descartada.`);
              messageBuffers.delete(remoteJid);
              return;
            }
            if (userLocks.has(remoteJid)) {
              console.log(`[${remoteJid}] ⏳ Ocupado, re-agendando em 1.5s... (tentativa ${attempt + 1}/10)`);
              setTimeout(() => tryProcess(attempt + 1), 1500);
              return;
            }
            const fullMsg = buffer.texts.join("\n");
            const instName = payload.instance?._id || payload.instance || "main";
            messageBuffers.delete(remoteJid);
            processNicoCore(remoteJid, fullMsg, instName);
          };
          tryProcess();
        }, DEBOUNCE_TIME);

        return end200();
      } catch (e) {
        console.error("[WEBHOOK] Erro parse:", e.message);
        end200();
      }
    });
    return;
  }

  // ── Arquivos estáticos ─────────────────────────────────────────────────────
  // Proteção contra path traversal: bloqueia qualquer caminho fora do diretório da app
  const rawStaticPath = req.url.split('?')[0];
  const fPath = path.join(__dir, rawStaticPath === "/" ? "index.html" : rawStaticPath);
  if (!fPath.startsWith(path.resolve(__dir) + path.sep) && fPath !== path.join(path.resolve(__dir), "index.html")) {
    res.writeHead(403); return res.end("403 Forbidden");
  }
  fs.readFile(fPath, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    const ext = path.extname(fPath);
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
    res.writeHead(200, { "Content-Type": mime[ext] || "text/plain" });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`🚀 Nico ativado na porta ${PORT}`));