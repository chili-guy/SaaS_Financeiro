process.env.TZ = "America/Sao_Paulo";
import 'dotenv/config';
import http from "http";
import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import './scheduler.js';

// --- Configuração e Iniciação ---
const prisma = new PrismaClient();
const __dir = path.dirname(fileURLToPath(import.meta.url));

const PORT                 = process.env.PORT || 3000;
const EVO_URL              = process.env.EVOLUTION_API_URL || "http://127.0.0.1:8080";
const EVO_KEY              = process.env.EVOLUTION_API_KEY || "FInAgentAPISecretKey_2026";
const DEEPSEEK_API_KEY     = process.env.DEEPSEEK_API_KEY || "SUA_CHAVE_AQUI";
const STRIPE_KEY           = process.env.STRIPE_SECRET_KEY || "sk_test_...";
const stripe               = new Stripe(STRIPE_KEY);

const STRIPE_PRICE_ID      = process.env.STRIPE_PRICE_ID || "price_...";
const APP_URL              = process.env.APP_URL || "http://localhost:3000";

// --- Buffer de Mensagens (QA: Debounce para evitar múltiplas notificações) ---
const messageBuffers = new Map();
const processedIds   = new Set(); 
const userLocks      = new Set(); // Trava de processamento por usuário
const DEBOUNCE_TIME  = 2500; 

/**
 * Helper para limpar títulos de tarefas (Remove "Marcar", "Lembrar", etc)
 */
function cleanTitle(title) {
  if (!title) return "";
  return title
    .replace(/^(marcar|agendar|anotar|lembrar de|lembrar|criar|adicionar|por|colocar|novo|nova)\s+/i, "")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Função de Classificação de Intenção via IA (Reforço de Precisão)
 */
async function classifyIntent(msgText) {
  try {
    const prompt = `Classifique a intenção do usuário baseado na mensagem. Responda APENAS um JSON válido no formato: { "intent": "..." }. 

Intenções possíveis:
- TASK_QUERY (Listar, ver, mostrar, dizer o que tem na agenda/lembretes. EXCLUIR se o usuário estiver pedindo para anotar algo agora)
- EXPENSE_QUERY (Ver gastos, quanto gastei, lista de dívidas, financeiro)
- INCOME_QUERY (Ver ganhos, extrato de receitas)
- SUMMARY_QUERY (Resumo geral, balanço do mês, como estou hoje)
- DELETE (Apagar tudo, limpar histórico, excluir)
- UNKNOWN (Outros casos)

Mensagem: "${msgText}"`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        response_format: { type: "json_object" }
      }),
      signal: controller.signal
    }).finally(() => clearTimeout(timeoutId));

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    return JSON.parse(content).intent || "UNKNOWN";
  } catch (e) {
    console.error("❌ Erro classifyIntent:", e.message);
    return "UNKNOWN";
  }
}

/**
 * Formata os registros financeiros agrupados por categoria (Relatório Premium Padronizado)
 */
function formatFinanceRecords(records, type = "EXPENSE") {
  if (!records || !records.length) {
    return type === "EXPENSE" ? "Não encontrei registros de gastos. 📂" : "Não encontrei registros de receitas. 📂";
  }

  const catEmojis = {
    // Gastos
    "Alimentação": "🍔", "Alimentação/Supermercado": "🛒", "Alimentação/Lanche": "🍟",
    "Lazer/Compras": "🛍️", "Saúde/Academia": "🏋️", "Animais de Estimação": "🐱",
    "Transporte/Manutenção": "🚗", "Saúde": "💊", "Educação": "📚", "Moradia": "🏠",
    "Lazer": "🎭", "Trabalho": "💼", "Outros": "📦", "Transporte": "🚗",
    // Receitas
    "Salário": "💰", "Renda": "💵", "Transferência": "💸", "Investimento": "📈",
    "Vendas": "🤝", "Presente": "🎁", "Reembolso": "🔙", "Extra": "➕"
  };

  let groups = {};
  let totalAll = 0;

  records.forEach(r => {
    const c = r.category || (type === "EXPENSE" ? "Outros" : "Renda");
    if (!groups[c]) groups[c] = { total: 0, items: [] };
    groups[c].total += r.amount;
    groups[c].items.push(r);
    totalAll += r.amount;
  });

  const sorted = Object.entries(groups).sort((a,b) => b[1].total - a[1].total);
  let reply = type === "EXPENSE" ? "💸 *Seus Gastos por Categoria:*\n\n" : "💰 *Suas Receitas por Categoria:*\n\n";

  for (const [cat, data] of sorted) {
    const emoji = catEmojis[cat] || (type === "EXPENSE" ? "📦" : "💵");
    const pct = totalAll > 0 ? ((data.total / totalAll) * 100).toFixed(0) : 0;
    reply += `${emoji} *${cat}* (${pct}%)\n`;
    data.items.forEach(i => {
      reply += `• R$ ${i.amount.toFixed(2)} — ${i.description}\n`;
    });
    reply += `🔸 Total: R$ ${data.total.toFixed(2)}\n\n`;
  }

  reply += "━━━━━━━━━━━━━━━\n";
  reply += `✨ *Total Geral: R$ ${totalAll.toFixed(2)}*`;
  return reply;
}

/**
 * Motor Central de Inteligência do Nico
 */
async function processNicoCore(remoteJid, msgText, instance) {
  if (userLocks.has(remoteJid)) {
    console.log(`[${remoteJid}] 🔒 Usuário já está sendo processado. Ignorando concorrência.`);
    return;
  }
  userLocks.add(remoteJid);

  try {
    const now = new Date();
    // 1. Controle de Assinante (Apenas para Pagos ou Trial via Stripe)
    // Inteligência de busca: Tenta encontrar o usuário com ou sem o nono dígito (Brasil)
    let phoneNo9 = remoteJid.replace(/^55(\d{2})9/, '55$1');
    let phoneWith9 = remoteJid.replace(/^55(\d{2})(\d{8})@/, '55$19$2@');
    
    let user = await prisma.user.findFirst({ 
      where: { 
        OR: [
          { phone_number: remoteJid },
          { phone_number: phoneNo9 },
          { phone_number: phoneWith9 }
        ]
      } 
    });
    
    // Se o usuário não existe ou não está ativo, bloqueamos o acesso
    if (!user || user.status !== "ACTIVE") {
      // Se não existe mas é um número novo, criamos como INACTIVE
      if (!user) {
        user = await prisma.user.create({ data: { phone_number: remoteJid, status: "INACTIVE" } });
      }

      const blockMsg = `Olá! Sou o Nico, seu Assessor Financeiro. 🤖📈\n\nNotei que você ainda não ativou sua assinatura. Para ter acesso à minha inteligência para organizar seus gastos e tarefas, você precisa garantir sua vaga na nossa página oficial.\n\n🎁 *DETALHE:* Você ganha 30 DIAS TOTALMENTE GRÁTIS! Só é cobrado após o primeiro mês.\n\n🔗 *Garanta seu acesso agora:* https://www.nicoassessor.com/\n\n_Assim que concluir o cadastro, seu acesso será liberado aqui no WhatsApp automaticamente!_`;

      await sendText(remoteJid, blockMsg, instance || "main");
      return;
    }

    // 2. Histórico e Contexto
    await prisma.message.create({ data: { user_id: user.id, role: "user", content: msgText } });
    const history = await prisma.message.findMany({ where: { user_id: user.id }, orderBy: { created_at: 'desc' }, take: 12 });
    const memory  = history.reverse().map(m => ({ role: m.role, content: m.content }));

    const pendingTasks = await prisma.task.findMany({ where: { user_id: user.id, completed: false }, take: 15 });
    const expenses     = await prisma.expense.findMany({ where: { user_id: user.id }, orderBy: { date: 'desc' }, take: 5 });
    const incomes      = await prisma.income.findMany({ where: { user_id: user.id }, orderBy: { date: 'desc' }, take: 5 });

    // Cálculo de Saldo Mensal (Mês Atual)
    const firstDayMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthExpenses = await prisma.expense.aggregate({ where: { user_id: user.id, date: { gte: firstDayMonth } }, _sum: { amount: true } });
    const monthIncomes  = await prisma.income.aggregate({ where: { user_id: user.id, date: { gte: firstDayMonth } }, _sum: { amount: true } });
    
    const totalExp = monthExpenses._sum.amount || 0;
    const totalInc = monthIncomes._sum.amount || 0;
    const balance  = totalInc - totalExp;

    const myTasksStr = pendingTasks.length > 0 
      ? pendingTasks.map(t => `- ${t.title}${t.due_date ? ` [DATA: ${t.due_date.toLocaleString("pt-BR", {timeZone: "America/Sao_Paulo"})}]` : " [SEM DATA]"}`).join("\n") 
      : "Nenhuma pendente";

    const myExpStr   = expenses.length > 0 
      ? expenses.map(e => `- R$${e.amount} em ${e.description} (${e.category}) [DATA: ${e.date.toISOString()}]`).join("\n") 
      : "Nenhum gasto recente";
      
    const myIncStr   = incomes.length > 0 
      ? incomes.map(i => `- R$${i.amount} em ${i.description} (${i.category}) [DATA: ${i.date.toISOString()}]`).join("\n") 
      : "Nenhuma receita recente";

    const dataAtual  = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

    console.log(`[AI Context] User: ${user.phone_number} | Tasks: ${pendingTasks.length} | Balance: R$${balance}`);

    const msgCount  = await prisma.message.count({ where: { user_id: user.id } });
    const isFirst   = msgCount <= 1;
    const isPaying  = /pagar|assinar|assinatura|checkout|pix/i.test(msgText);

    const sysPrompt = `### IDENTIDADE
Você é o Assessor Nico, mentor de organização e finanças. Para você, "Dívidas", "Contas" e "Gastos" são a mesma coisa. Você é um parceiro que simplifica a vida financeira do usuário.

### CONTEXTO ATUAL (VERDADE ABSOLUTA)
- Data/Hora: ${dataAtual}
- Status da Assinatura: ASSINANTE PRO (Acesso Liberado)
- Usuário: ${user.name && user.name !== "Nico User" ? user.name : "Investidor"}

### REGISTROS INTERNOS (PARA SEU CONHECIMENTO):
- Financeiro (Este Mês): R$ ${balance.toFixed(2)} (Receitas: R$ ${totalInc.toFixed(2)} | Gastos/Dívidas: R$ ${totalExp.toFixed(2)})
- Agenda de Tarefas: ${myTasksStr}
- Histórico de Dívidas/Gastos: ${myExpStr}
- Histórico de Receitas: ${myIncStr}

### REGRAS DE COMPORTAMENTO (ESTRITAS):
1. **SAUDAÇÃO CALOROSA**: Se o usuário saudar (Oi, Ola, etc.), seja cordial. Se for a PRIMEIRA vez que ele fala (veja msgCount), apresente-se como o Assessor Nico de forma completa. Se já estiverem conversando, responda de forma breve, amigável e natural. NUNCA responda apenas com "Entendido".
2. **ZERO ALUCINAÇÃO**: Se o usuário perguntar por algo, olhe APENAS os "REGISTROS INTERNOS". Se não estiver lá, diga "Não encontrei esse registro".
3. **PENSAMENTO ECONÔMICO**: Diferencie "registrei um gasto" (EXPENSE) de "criei uma tarefa" (TASK).
5. **MODELO DE CONFIRMAÇÃO**: Use SEMPRE este padrão visual para confirmar qualquer registro (Financeiro ou Agenda):
✅ [Gasto/Entrada/Tarefa] registrado!

📝 [Descrição/Título]: [texto exato do usuário, ex: "mercado"]
💰 Valor: R$ [valor] (se financeiro)
📅 [Data/Hora]: [Apenas "DD-MM-AAAA" se for dia inteiro, ou "DD-MM-AAAA às HH:mm" se tiver hora]
🏷️ [Categoria/Alarme]: [categoria ou Status do Lembrete]
6. **EMOJIS**: Use emojis de forma moderada e estratégica para dar vida à conversa (ex: 💰 para finanças, ✅ para confirmações, 🔔 para avisos). Máximo 1 por parágrafo. Seja elegante.
7. **INSTRUÇÃO PROATIVA**: Para comandos vagos, dê um exemplo útil (ex: "Pode me mandar seus gastos ou pedir para eu lembrar de algo!").
8. **CATEGORIZAÇÃO**: Atribua sempre uma categoria lógica aos gastos (EXPENSE).
9. **SEM NEGRITOS**: Proibido usar "*" ou "**". Texto 100% limpo.
10. **MÚLTIPLOS PEDIDOS**: Se a mensagem contiver vários pedidos (ex: várias tarefas ou gastos), você DEVE gerar uma "action" separada para cada um deles no mesmo JSON. Nunca ignore partes da mensagem.
11. **SEM REPETIÇÃO**: Se o usuário disser "Ok", "Valeu" ou similar, responda apenas com texto.
12. **COMANDO DELETE**: Se o usuário pedir para limpar tarefas, use DELETE com title "tarefas". Se for financeiro, use "financeiro".
13. **REMARCAR (UPDATE)**: Se o usuário quiser mudar o horário de uma tarefa já mencionada, use a ação TASK com o mesmo título e o novo "due_date".
14. **INTELIGÊNCIA DE TEMPO**: Se o usuário disser algo confuso como "Mandei o lembrete às 18h", NÃO aceite literalmente. Questione se ele quer que VOCÊ mande o lembrete nesse horário e já gere a ação TASK para atualizar o horário.
15. **AGENDAMENTO**: Lembretes são DESATIVADOS por padrão. Sempre pergunte se o usuário deseja ativar. Se ele disser para "Ativar lembrete", "Lembrar de", ou confirmar positivamente sobre o lembrete, use "remind: true" no JSON.
16. **CONSULTAS**: Sempre use a ação QUERY para listar ou ver registros. NUNCA escreva textos de lista manualmente; o sistema injetará com ícones (🔔 para tarefas e 💰 para gastos).
17. **DATAS RELATIVAS**: Converta "hoje", "amanhã", "ontem" ou dias da semana em datas ISO usando a Data Atual como base rígida.
18. **FOCO NO REGISTRO**: Priorize a exibição do modelo de confirmação estruturado da Regra 5. NÃO mostre o saldo mensal automaticamente.
19. **TÍTULO ORIGINAL**: Ao atualizar horários, mantenha o nome original do compromisso.
21. **AMBIGUIDADE E SENSO CRÍTICO**: Se o usuário enviar mensagens de conversa (ex: "Mano, estou aqui", "Que cansaço", "Partiu"), NÃO tente registrar nada. Responda casualmente e pergunte se ele quer que você anote algo. NUNCA tente adivinhar tarefas ou gastos a partir de desabafos ou comentários vagos.
22. **SIGILO TÉCNICO**: Proibido usar termos como JSON, TASK, EXPENSE nas respostas. Use apenas linguagem natural.
23. **UNICIDADE**: NUNCA duplique a mesma ação no mesmo turno.
24. **PENSAMENTO ÚNICO**: Registre apenas um item por vez, a menos que haja valores claramente distintos.
25. **AÇÃO REAL**: Se o usuário pedir para apagar ou limpar, você DEVE gerar a ação DELETE no JSON. NUNCA diga que limpou algo se a ação DELETE não estiver presente.
26. **VALOR OBRIGATÓRIO (PAY)**: Você NUNCA deve executar a ação PAY sem saber o valor exato. Se o usuário disser "Pagar dentista", pergunte: "Qual o valor do pagamento para eu registrar no seu financeiro?". Só gere a ação PAY quando tiver o valor confirmado.
27. **LIMPEZA DE DESCRIÇÃO**: Ao extrair descrições ou títulos, remova ruídos e palavras de ligação desnecessárias (ex: "com", "de", "no", "na", "para"). Se o usuário disser "200 com gasolina", a descrição deve ser apenas "Gasolina". Capitalize a primeira letra.
28. **CRITÉRIO DE REGISTRO**: Priorize o silêncio técnico. Só gere ações se houver um VERBO ou VALOR claros (ex: "Anotar", "Agendar", "Gastei"). Em caso de dúvida, pergunte: "Gostaria que eu registrasse isso na sua agenda ou finanças?".

### FORMATO DE SAÍDA (OBRIGATÓRIO JSON):
{
  "actions": [
    { "action": "TASK", "parsedData": { "title": "string", "due_date": "ISO-DATE ou null", "remind": boolean } },
    { "action": "EXPENSE", "parsedData": { "amount": float, "description": "string", "category": "string" } },
    { "action": "INCOME", "parsedData": { "amount": float, "description": "string", "category": "string" } },
    { "action": "PAY", "parsedData": { "title": "string", "amount": float } },
    { "action": "SUBSCRIBE", "parsedData": {} }
  ],
  "reply": "Sua resposta natural e humana aqui fatiada em bolhas por \\n\\n"
}

*Nota: Se o usuário pedir para você 'Parar de mandar mensagem', responda que entendeu e NÃO inclua ações.*`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout

    // 4. Chamada IA (Modo JSON Forçado para estabilidade absoluta)
    const upstream = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method:  "POST",
      headers: { "Content-Type":  "application/json", "Authorization": `Bearer ${DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "system", "content": sysPrompt }, ...memory, { role: "user", "content": msgText }],
        temperature: 0.1,
        response_format: { type: "json_object" } 
      }),
      signal: controller.signal
    }).finally(() => clearTimeout(timeoutId));
    
    let aiResponse = { actions: [], reply: "" };

    if (!upstream.ok) {
      console.error(`[${remoteJid}] ❌ Erro Upstream DeepSeek: ${upstream.status}`);
      aiResponse.reply = "Tive um soluço técnico ao falar com meu cérebro. Pode tentar de novo? 🧠💫";
    } else {
      const dsData = await upstream.json();
      let rawContent = dsData.choices?.[0]?.message?.content || "";
      
      try {
        const s = rawContent.indexOf('{');
        const e = rawContent.lastIndexOf('}');
        if (s !== -1 && e !== -1) {
          aiResponse = JSON.parse(rawContent.substring(s, e + 1));
        } else {
          aiResponse.reply = rawContent.trim();
        }
        console.log(`[${remoteJid}] 🤖 IA Response:`, JSON.stringify(aiResponse, null, 2));
      } catch(e) { 
        console.error(`[${remoteJid}] ❌ Erro Parse JSON AI:`, e.message);
        aiResponse.reply = rawContent.trim() || "Pode repetir? Tive um pequeno erro de interpretação.";
      }
    }

    // 5. Execução de Ações
    let hasChange = false;

    // 5. Verificação de Segurança de Intenção (Garante que DELETE/QUERY não falhem se a IA travar)
    const intent = await classifyIntent(msgText);
    const aiActions = aiResponse.actions || [];
    
    // Se for DELETE e a IA "esqueceu" a ação, nós forçamos aqui
    if (intent === "DELETE" && !aiActions.some(a => a.action === "DELETE")) {
      console.log(`[${remoteJid}] 🛡️ Intent de DELETE detectada mas ação ausente. Forçando DELETE.`);
      aiActions.push({ action: "DELETE", parsedData: { title: msgText } });
    }
    
    // 🛡️ NOVO: Se for QUERY e a IA "esqueceu" a ação, nós forçamos aqui
    // APENAS se não houver outras ações de escrita (TASK, EXPENSE, etc.) para evitar redundância
    const queryIntents = ["TASK_QUERY", "EXPENSE_QUERY", "INCOME_QUERY", "SUMMARY_QUERY"];
    const hasWriteAction = aiActions.some(a => ["TASK", "EXPENSE", "INCOME", "PAY", "DONE", "DELETE"].includes(a.action));
    
    if (queryIntents.includes(intent) && !aiActions.some(a => a.action === "QUERY") && !hasWriteAction) {
      console.log(`[${remoteJid}] 🛡️ Intent de QUERY detectada mas ação ausente. Forçando QUERY.`);
      aiActions.push({ action: "QUERY", parsedData: { type: intent } });
    }

    // 5. Processamento das Ações (Deduplicação agressiva e Case-Insensitive)
    const uniqueActions = [];
    const seenActions = new Set();
    for (const act of aiActions) {
      // Normalizamos a chave para evitar duplicidade por causa de maiúsculas/minúsculas ou espaços
      const cleanData = JSON.parse(JSON.stringify(act.parsedData));
      if (cleanData.description) cleanData.description = cleanData.description.toLowerCase().trim();
      if (cleanData.title) cleanData.title = cleanData.title.toLowerCase().trim();
      
      const key = `${act.action}-${JSON.stringify(cleanData)}`;
      if (!seenActions.has(key)) {
        uniqueActions.push(act);
        seenActions.add(key);
      }
    }

    for (const act of uniqueActions) {
      const { action, parsedData } = act;
      try {
        if (action === "EXPENSE" && parsedData.amount) {
          const val = parseFloat(String(parsedData.amount).replace(',', '.').replace(/[^\d.]/g, ''));
          if (val > 0) {
            const expDate = parsedData.date ? new Date(String(parsedData.date).replace(/Z$/i, "")) : new Date();
            await prisma.expense.create({ 
              data: { 
                user_id: user.id, 
                amount: val, 
                description: parsedData.description || "Gasto",
                category: parsedData.category || "Outros",
                date: expDate
              } 
            });
            hasChange = true;
          }
        } else if (action === "TASK" && parsedData.title) {
          const title = cleanTitle(parsedData.title);
          const existing = await prisma.task.findFirst({ where: { user_id: user.id, completed: false, title: { contains: title, mode: 'insensitive' } } });
          const finalDueDate = parsedData.due_date ? new Date(String(parsedData.due_date).replace(/Z$/i, "")) : null;
          
          // Ativa lembretes APENAS se "remind: true" vier explicitamente no JSON
          const notifiedFlag = (parsedData.remind === true) ? false : true; 
          
          if (existing) {
            console.log(`[${remoteJid}] ⏳ ATUALIZANDO TAREFA: "${existing.title}" para ${finalDueDate}...`);
            await prisma.task.update({ 
              where: { id: existing.id }, 
              data: { 
                due_date: finalDueDate || existing.due_date, 
                notified: notifiedFlag, 
                notified_5min: notifiedFlag 
              } 
            });
          } else {
            console.log(`[${remoteJid}] 📝 CRIANDO TAREFA: "${title}" para ${finalDueDate}...`);
            await prisma.task.create({ 
              data: { 
                user_id: user.id, 
                title: title, 
                due_date: finalDueDate,
                notified: notifiedFlag,
                notified_5min: notifiedFlag
              } 
            });
          }
          hasChange = true;
        } else if (action === "QUERY") {
          const raw = msgText.toLowerCase();
          console.log(`[${remoteJid}] 🔎 Roteando consulta via Classificação de Intenção...`);

          const intent = await classifyIntent(msgText);
          console.log(`[${remoteJid}] 🧠 Intent detectada: ${intent}`);

          if (intent === "TASK_QUERY" || raw.includes("tarefa") || raw.includes("agenda") || raw.includes("compromisso")) {
            const list = await prisma.task.findMany({ 
              where: { user_id: user.id, completed: false }, 
              orderBy: { due_date: 'asc' } 
            });
            aiResponse.reply = list.length > 0 
              ? `✅ *Sua Agenda de Tarefas:*\n\n` + list.map(t => {
                  if (!t.due_date) return `🔔 *${t.title}* - [SEM DATA]`;
                  const d = new Date(t.due_date);
                  const isEndOfDay = d.getHours() === 23 && d.getMinutes() === 59;
                  const dateStr = d.toLocaleString("pt-BR", { 
                    day: "2-digit", month: "2-digit", 
                    ...(isEndOfDay ? {} : { hour: "2-digit", minute: "2-digit" }),
                    timeZone: "America/Sao_Paulo" 
                  });
                  return `🔔 *${t.title}* - ${dateStr}`;
                }).join("\n") 
              : "Sua lista de tarefas está zerada! 🎉";
          } else if (intent === "EXPENSE_QUERY" || intent === "INCOME_QUERY" || raw.includes("gastos") || raw.includes("receita")) {
            const dateFilter = raw.includes("mês passado") ? { gte: new Date(now.getFullYear(), now.getMonth() - 1, 1), lt: new Date(now.getFullYear(), now.getMonth(), 1) } : { gte: new Date(now.getFullYear(), now.getMonth(), 1) };
            
            if (raw.includes("gastos") || raw.includes("divida") || raw.includes("débito") || raw.includes("contas") || raw.includes("despesa") || intent === "EXPENSE_QUERY") {
              const exps = await prisma.expense.findMany({ where: { user_id: user.id, date: dateFilter }, orderBy: { date: 'desc' } });
              aiResponse.reply = formatFinanceRecords(exps, "EXPENSE");
            } else if (raw.includes("receita") || raw.includes("ganhos") || raw.includes("salario") || intent === "INCOME_QUERY") {
              const incs = await prisma.income.findMany({ where: { user_id: user.id, date: dateFilter }, orderBy: { date: 'desc' } });
              aiResponse.reply = formatFinanceRecords(incs, "INCOME");
            } else {
              const eSum = await prisma.expense.aggregate({ where: { user_id: user.id, date: dateFilter }, _sum: { amount: true } });
              const iSum = await prisma.income.aggregate({ where: { user_id: user.id, date: dateFilter }, _sum: { amount: true } });
              const totalE = eSum._sum.amount || 0;
              const totalI = iSum._sum.amount || 0;
              aiResponse.reply = `📊 *Resumo ${raw.includes("passado") ? "do Mês Passado" : "Mensal"}:*\n\n💰 Receita: R$ ${totalI.toFixed(2)}\n💸 Gastos: R$ ${totalE.toFixed(2)}`;
            }
          } else if (intent === "SUMMARY_QUERY" || raw.includes("resumo")) {
            const dateFilter = { gte: new Date(now.getFullYear(), now.getMonth(), 1) };
            
            // 1. Tarefas
            const tasks = await prisma.task.findMany({ where: { user_id: user.id, completed: false }, orderBy: { due_date: 'asc' }, take: 5 });
            let taskPart = tasks.length > 0 ? `📅 *Agenda Recente:*\n` + tasks.map(t => `🔔 ${t.title}`).join("\n") : "✅ Agenda limpa!";
            
            // 2. Financeiro
            const eSum = await prisma.expense.aggregate({ where: { user_id: user.id, date: dateFilter }, _sum: { amount: true } });
            const iSum = await prisma.income.aggregate({ where: { user_id: user.id, date: dateFilter }, _sum: { amount: true } });
            const totalE = eSum._sum.amount || 0;
            const totalI = iSum._sum.amount || 0;
            let finPart = `\n\n📊 *Balanço Mensal:*\n💰 Receitas: R$ ${totalI.toFixed(2)}\n💸 Gastos: R$ ${totalE.toFixed(2)}`;

            aiResponse.reply = `✨ *Seu Resumo Geral* ✨\n\n${taskPart}${finPart}\n\nO que gostaria de detalhar agora?`;
          } else {
            // UNKNOWN ou Fallback: Preserva a resposta original da IA para perguntas gerais
            console.log(`[${remoteJid}] ❓ Intenção não mapeada. Usando resposta natural da IA.`);
          }
        } else if (action === "INCOME" && parsedData.amount) {
          const val = parseFloat(String(parsedData.amount).replace(',', '.').replace(/[^\d.]/g, ''));
          if (val > 0) {
            await prisma.income.create({ 
              data: { 
                user_id: user.id, 
                amount: val, 
                description: parsedData.description || "Receita",
                category: parsedData.category || "Renda"
              } 
            });
            hasChange = true;
          }
        } else if (action === "DONE") {
          const task = await prisma.task.findFirst({ where: { user_id: user.id, completed: false, title: { contains: parsedData.title || "", mode: 'insensitive' } } });
          if (task) {
            await prisma.task.update({ where: { id: task.id }, data: { completed: true } });
            console.log(`[${remoteJid}] ✅ Tarefa concluída: ${task.title}`);
          }
        } else if (action === "CLEANUP") {
          console.log(`[${remoteJid}] 🧹 Iniciando limpeza geral de duplicatas...`);
          
          // 1. Limpeza de Tarefas
          const tasks = await prisma.task.findMany({ where: { user_id: user.id, completed: false } });
          const seenT = new Set();
          let remT = 0;
          for (const t of tasks) {
            const k = t.title.toLowerCase().trim();
            if (seenT.has(k)) { await prisma.task.delete({ where: { id: t.id } }); remT++; } else { seenT.add(k); }
          }

          // 2. Limpeza de Gastos (Mesmo valor, descrição e dia)
          const exps = await prisma.expense.findMany({ where: { user_id: user.id } });
          const seenE = new Set();
          let remE = 0;
          for (const e of exps) {
            const dateKey = e.date.toISOString().split('T')[0];
            const k = `${e.amount}-${e.description.toLowerCase().trim()}-${dateKey}`;
            if (seenE.has(k)) { await prisma.expense.delete({ where: { id: e.id } }); remE++; } else { seenE.add(k); }
          }
          
          aiResponse.reply = `✨ *Limpeza concluída!* \n\nRemovi ${remT} tarefas duplicadas e ${remE} registros financeiros repetidos do seu histórico. ✅`;
          console.log(`[${remoteJid}] ✨ Limpeza concluída: ${remT} tarefas, ${remE} gastos.`);
        } else if (action === "DELETE") {
          console.log(`[${remoteJid}] 🗑️ DELETE acionado`);
          const raw = msgText.toLowerCase();

          const cleanTasks = raw.includes("tarefa") || raw.includes("agenda");
          const cleanFinance = ["gasto", "despesa", "receita", "ganho", "financeiro", "dinheiro"].some(k => raw.includes(k));
          const cleanAll = ["tudo", "geral", "histórico", "reset"].some(k => raw.includes(k));

          const beforeT = await prisma.task.count({ where: { user_id: user.id } });
          const beforeE = await prisma.expense.count({ where: { user_id: user.id } });

          if (cleanAll) {
            console.log(`[${remoteJid}] 🗑️ RESET TOTAL`);
            await prisma.task.deleteMany({ where: { user_id: user.id } });
            await prisma.expense.deleteMany({ where: { user_id: user.id } });
            await prisma.income.deleteMany({ where: { user_id: user.id } });
            aiResponse.reply = "🗑️ *RESET COMPLETO!* \n\nRemovi todas as suas tarefas e registros financeiros. ✨";
          } else if (cleanFinance) {
            console.log(`[${remoteJid}] 💸 LIMPANDO FINANCEIRO`);
            const dExp = await prisma.expense.deleteMany({ where: { user_id: user.id } });
            const dInc = await prisma.income.deleteMany({ where: { user_id: user.id } });
            aiResponse.reply = `🗑️ *FINANCEIRO LIMPO!* \n\nRemovi ${dExp.count} gastos e ${dInc.count} receitas do seu histórico. 💸`;
          } else if (cleanTasks) {
            console.log(`[${remoteJid}] 📅 LIMPANDO TAREFAS`);
            const del = await prisma.task.deleteMany({ where: { user_id: user.id } });
            aiResponse.reply = `🗑️ *TAREFAS LIMPAS!* \n\nRemovi as ${del.count} tarefas da sua agenda. ✅`;
          } else {
            console.log(`[${remoteJid}] ⚠️ DELETE não reconhecido`);
            aiResponse.reply = "O que exatamente você quer limpar? Suas *tarefas* ou seus *gastos*?";
          }

          const afterT = await prisma.task.count({ where: { user_id: user.id } });
          const afterE = await prisma.expense.count({ where: { user_id: user.id } });
          console.log(`[${remoteJid}] 🗑️ Stats Remoção - Tarefas: ${beforeT}->${afterT}, Gastos: ${beforeE}->${afterE}`);
          hasChange = true;
        } else if (action === "PAY" && parsedData.amount) {
          console.log(`[${remoteJid}] 💳 Ação PAY (Dívida) detectada: R$ ${parsedData.amount}`);
          // Podemos opcionalmente criar um gasto automático aqui se desejado,
          // mas a regra 26 exige que a IA peça o valor primeiro. 
          // Se chegou aqui com valor, o DB pode ser atualizado.
          hasChange = true;
        } else if (action === "SUBSCRIBE") {
          console.log(`[${remoteJid}] 💰 Gerando Checkout Stripe...`);
          const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
            mode: 'subscription',
            client_reference_id: remoteJid,
            success_url: `${APP_URL}/success.html`,
            cancel_url: `${APP_URL}/cancel.html`,
          });
          aiResponse.reply += `\n\n🔗 *Ative sua assinatura aqui:* ${session.url}`;
          hasChange = true;
        }
      } catch(e) { console.error("Erro DB Action:", e.message); }
    }

    // 6. Resposta Final (Deduplicação e Tratamento de Listas)
    const fallbackMsg = "Olá! Sou seu Assessor Nico. Como posso te ajudar com suas finanças ou tarefas hoje? 🚀";
    const rawReply = (aiResponse.reply || (hasChange ? "Tudo certo! ✅" : fallbackMsg)).trim();
    
    // Se for uma lista financeira/agenda ou uma mensagem muito longa, enviamos em bloco ÚNICO
    const isList = rawReply.includes("Seus Gastos por Categoria") || rawReply.includes("Sua Agenda de Tarefas") || rawReply.length > 800;
    
    let parts;
    if (isList) {
      parts = [rawReply];
    } else {
      parts = [...new Set(rawReply.split("\n\n").map(p => p.trim()))].filter(p => p !== "");
    }

    const finalReply = parts.join("\n\n");
    await prisma.message.create({ data: { user_id: user.id, role: "assistant", content: finalReply } });

    const instanceName = instance || "main";

    console.log(`[${remoteJid}] 📤 Iniciando envio de ${parts.length} partes...`);

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      const isLastPart = i === parts.length - 1;
      const hasTaskAction = uniqueActions.some(a => a.action === "TASK");
      
      try {
        console.log(`[${remoteJid}] 📤 Enviando parte ${i + 1}/${parts.length}...`);
        
        // Sempre envia o texto principal como sendText para garantir entrega
        await sendText(remoteJid, part, instanceName);

        // Se for a última parte e houver ação de tarefa, tenta enviar botões extras
        if (isLastPart && hasTaskAction) {
          console.log(`[${remoteJid}] ➕ Tentando enviar botões complementares...`);
          await sendEvolutionButtons(remoteJid, "Selecione uma opção:", instanceName, [
            { id: "confirm_task", text: "Ver Agenda 📅" },
            { id: "done_last", text: "Concluir Última ✅" }
          ]);
        }
      } catch (sendErr) {
        console.error(`[${remoteJid}] ❌ Erro ao enviar parte ${i + 1}:`, sendErr.message);
      }
      
      await new Promise(r => setTimeout(r, 1000));
    }

  } catch (err) { 
    console.error("Erro Core:", err); 
  } finally {
    userLocks.delete(remoteJid);
  }
}

// --- Helpers de Comunicação ---
async function sendText(number, text, instance) {
  const endpoint = `${EVO_URL.replace(/\/$/, "")}/message/sendText/${instance}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": EVO_KEY },
      body: JSON.stringify({ number, text }),
      signal: controller.signal
    });
    
    if (res.ok) {
      console.log(`[${number}] ✅ Mensagem enviada com sucesso.`);
    } else {
      console.error(`[${number}] ❌ Erro ao enviar mensagem (${res.status}):`, await res.text());
    }
  } catch (e) {
    console.error(`[${number}] ❌ Erro sendText:`, e.message);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function sendEvolutionButtons(number, text, instance, buttons) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const endpoint = `${EVO_URL.replace(/\/$/, "")}/message/sendButtons/${instance}`;
    const formattedButtons = buttons.map(b => ({
      type: "reply",
      displayText: b.text,
      id: b.id
    }));

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": EVO_KEY },
      body: JSON.stringify({
        number,
        title: "Assessor Nico",
        description: text,
        footer: "Toque em um botão para agir",
        buttons: formattedButtons
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errData = await response.text();
      console.error(`[${number}] ❌ Erro ao enviar botões (${response.status}):`, errData);
      return false;
    }

    console.log(`[${number}] ✅ Botões enviados com sucesso.`);
    return true;
  } catch (e) {
    console.error(`[${number}] ❌ Erro sendButtons:`, e.message);
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

// --- Servidor HTTP ---
const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  // ── ROTA DE RESET (Temporária: Limpeza Geral para Testes) ─────────────────────
  if (req.method === 'GET' && req.url === '/nico-reset-database-delete-all') {
    try {
      console.log("🧼 Iniciando limpeza completa via Rota de Servidor...");
      // Ordem importa por causa das chaves estrangeiras
      await prisma.message.deleteMany({});
      await prisma.task.deleteMany({});
      await prisma.expense.deleteMany({});
      await prisma.note.deleteMany({});
      await prisma.user.deleteMany({});
      
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("✅ BANCO DE DADOS 100% ZERADO! O Nico esqueceu tudo. Já pode deletar esta rota do código.");
    } catch (err) {
      console.error("❌ Erro no reset de banco:", err.message);
      res.writeHead(500);
      res.end("❌ Erro no reset: " + err.message);
    }
    return;
  }

  const cleanUrl = req.url.split('?')[0].replace(/\/$/, '');

  // Health Check para o Easypanel não matar o container
  if (req.method === 'GET' && (cleanUrl === "" || cleanUrl === "/health")) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end("Nico is alive! 🚀");
  }

  // Webhook Stripe
  if (req.method === 'POST' && cleanUrl === '/webhook/stripe') {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", async () => {
      try {
        const ev = JSON.parse(body);
        console.log(`[STRIPE Webhook] Evento: ${ev.type}`);

        if (ev.type === 'checkout.session.completed') {
          const session = ev.data.object;
          // Tenta pegar o telefone do client_reference_id OU do metadata 'whatsapp' 
          // ou do campo customizado (se existir)
          let phone = session.client_reference_id || session.metadata?.whatsapp || session.customer_details?.phone;
          
          if (phone) {
            // Limpa o número (remove caracteres não numéricos)
            let cleanPhone = phone.replace(/[^\d]/g, '');
            
            // Inteligência para números BR: Se tiver 10 ou 11 dígitos, adiciona o 55
            if (cleanPhone.length >= 10 && cleanPhone.length <= 11 && !cleanPhone.startsWith("55")) {
              cleanPhone = `55${cleanPhone}`;
            }

            if (!cleanPhone.includes("@s.whatsapp.net")) cleanPhone = `${cleanPhone}@s.whatsapp.net`;

            console.log(`[STRIPE Webhook] 💰 Ativando acesso para: ${cleanPhone}`);
            
            // Busca se já existe um usuário com esse número ou variações de 9 dígito
            const cPhoneNo9 = cleanPhone.replace(/^55(\d{2})9/, '55$1');
            const cPhoneWith9 = cleanPhone.replace(/^55(\d{2})(\d{8})@/, '55$19$2@');

            const existingUser = await prisma.user.findFirst({
              where: {
                OR: [
                  { phone_number: cleanPhone },
                  { phone_number: cPhoneNo9 },
                  { phone_number: cPhoneWith9 }
                ]
              }
            });

            if (existingUser) {
              await prisma.user.update({ where: { id: existingUser.id }, data: { status: 'ACTIVE' } });
            } else {
              await prisma.user.create({ data: { phone_number: cleanPhone, status: 'ACTIVE' } });
            }
            
            // Notificar usuário via WhatsApp
            const instance = process.env.INSTANCE || "main";
            await sendText(cleanPhone, "Opa! Recebi a confirmação do seu acesso. ✅ \n\nSou seu Assessor Nico e já estou pronto para te ajudar a organizar suas finanças e tarefas! 📈🚀 \n\nO que vamos registrar primeiro? Mande 'Gastei 50 no mercado' ou 'Lembrar de treinar às 18h'.", instance);
          }
        }
        res.writeHead(200); res.end();
      } catch(e) { 
        console.error("Erro Processamento Webhook Stripe:", e.message);
        res.writeHead(400); res.end(); 
      }
    });
    return;
  }

  // Webhook Evolution (WhatsApp)
  if (req.method === "POST" && (cleanUrl === "/webhook/evolution" || cleanUrl === "/webhook")) {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", async () => {
      const end200 = () => { res.writeHead(200); res.end(); };
      try {
        const payload = JSON.parse(body);
        if (payload.event !== "messages.upsert") return end200();

        const dataKey = payload.data?.key || payload.data?.message?.key || {};
        let remoteJid = dataKey.remoteJid || "";
        const msgId     = dataKey.id || "";

        // Normalização de JID (Remove sufixos de multiconta :1 :2 etc)
        if (remoteJid.includes(":")) {
          remoteJid = remoteJid.split(":")[0] + "@s.whatsapp.net";
        }

        if (dataKey.fromMe || !remoteJid || remoteJid.includes("@g.us")) return end200();
        if (processedIds.has(msgId)) return end200(); // Ignora duplicatas
        
        processedIds.add(msgId);
        setTimeout(() => processedIds.delete(msgId), 60000); // Limpa o ID após 1 min

        const msgNode = payload.data?.message || payload.data;
        let msgText = msgNode.conversation || msgNode.extendedTextMessage?.text || msgNode.imageMessage?.caption || "";
        
        // Tratamento de Resposta de Botão
        const btnRes = msgNode.buttonsResponseMessage || msgNode.templateButtonReplyMessage;
        if (btnRes) {
          const btnId = btnRes.selectedButtonId || btnRes.selectedId;
          if (btnId === "confirm_task") msgText = "Quero ver minhas tarefas pendentes";
          if (btnId === "done_last") msgText = "Concluir minha última tarefa";
          console.log(`[${remoteJid}] 🔘 Botão clicado: ${btnId} -> Interpretado como: ${msgText}`);
        }

        if (!msgText.trim()) return end200();

        // DEBOUNCE LOGIC
        if (!messageBuffers.has(remoteJid)) messageBuffers.set(remoteJid, { texts: [], timer: null });
        const buffer = messageBuffers.get(remoteJid);
        buffer.texts.push(msgText);

        if (buffer.timer) clearTimeout(buffer.timer);
        buffer.timer = setTimeout(() => {
          const attemptProcess = () => {
             if (userLocks.has(remoteJid)) {
               console.log(`[${remoteJid}] ⏳ Sistema ocupado com este usuário. Re-agendando em 1.5s...`);
               setTimeout(attemptProcess, 1500);
               return;
             }
             const fullMsg = buffer.texts.join("\n");
             const instance = (payload.instance?._id || payload.instance || "main");
             messageBuffers.delete(remoteJid);
             processNicoCore(remoteJid, fullMsg, instance);
          };
          attemptProcess();
        }, DEBOUNCE_TIME);

        return end200();
      } catch(e) { end200(); }
    });
    return;
  }

  // Static Files
  let fPath = path.join(__dir, req.url === "/" ? "index.html" : req.url);
  fs.readFile(fPath, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    const ext = path.extname(fPath);
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
    res.writeHead(200, { "Content-Type": mime[ext] || "text/plain" });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`🚀 Nico Ativado na porta ${PORT}!`));
