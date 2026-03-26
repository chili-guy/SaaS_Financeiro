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

function cleanTitle(title) {
  if (!title) return "";
  return title
    .replace(/^(marcar|agendar|anotar|lembrar de|lembrar|criar|adicionar|por|colocar|novo|nova)\s+/i, "")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function formatFinanceRecords(records, type = "EXPENSE") {
  if (!records || !records.length) {
    return type === "EXPENSE"
      ? "Não encontrei registros de gastos este mês. 📂"
      : "Não encontrei registros de receitas este mês. 📂";
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

  for (const [cat, data] of sorted) {
    const emoji = catEmojis[cat] || (type === "EXPENSE" ? "📦" : "💵");
    const pct = totalAll > 0 ? ((data.total / totalAll) * 100).toFixed(0) : 0;
    reply += `${emoji} ${cat.toUpperCase()} (${pct}%)\n`;
    data.items.forEach(i => {
      const d = new Date(i.date || new Date());
      const dStr = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      reply += `▫️ R$ ${i.amount.toFixed(2)} — ${i.description} (${dStr})\n`;
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
            ? m.content.split("\n")[0].replace(/[✅🗑️📊📈📉]/g, '').substring(0, 100).trim()
            : m.content
        )
      }));

    // Salva mensagem atual ANTES de chamar a IA (para ficar no contexto da próxima)
    await prisma.message.create({ data: { user_id: user.id, role: "user", content: msgText } });

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

    const dataAtual = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const userName = user.name && !["Nico User", "Investidor", "Investidor ", "Prezado"].includes(user.name) ? user.name : null;

    // ─── SYSTEM PROMPT CIRÚRGICO ────────────────────────────────────────────────
    //
    // PRINCÍPIO: Regras claras + exemplos few-shot = execução precisa.
    // Menos regras, mais exemplos concretos.
    //
    const sysPrompt = `Você é o Assessor Nico — consultor financeiro e assistente pessoal via WhatsApp.
Tom: profissional, cordial, sem gírias. Emojis apenas para estruturar informação. Sem asteriscos (*) ou underscores (_).

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

1. REGISTRAR GASTO/DÍVIDA/CONTA → action "EXPENSE"
   Gatilhos: "gastei", "paguei", "comprei", "saiu", "dívida", "conta de"
   Exemplo input: "gastei 45 no uber"
   → { "action": "EXPENSE", "parsedData": { "amount": 45.00, "description": "Uber", "category": "Transporte", "date": null } }

2. REGISTRAR RECEITA/ENTRADA → action "INCOME"
   Gatilhos: "recebi", "entrou", "salário", "vendi", "renda"
   Exemplo input: "recebi 3000 de salário"
   → { "action": "INCOME", "parsedData": { "amount": 3000.00, "description": "Salário", "category": "Salário", "date": null } }

3. CRIAR TAREFA/LEMBRETE → action "TASK"
   Gatilhos: "lembrar", "me avise", "agendar", "reunião", "compromisso", "não esquecer"
   Para lembrete com horário: "remind": true. Sem horário: "remind": false.
   Exemplo input: "me lembra de pagar o aluguel amanhã às 9h"
   → { "action": "TASK", "parsedData": { "title": "Pagar aluguel", "due_date": "2025-01-15T09:00:00", "remind": true } }

4. CONSULTAR DADOS → action "QUERY"
   Gatilhos: "mostrar", "listar", "ver", "quais são", "quanto gastei", "extrato", "relatório", "meus gastos", "minha agenda", "resumo", "saldo", "tarefas", "compromissos", "o que tenho", "o que está", "meu dia", "hoje", "amanhã", "essa semana", "tenho algo", "tem algo", "algum compromisso", "alguma tarefa"
   IMPORTANTE: Você DEVE usar QUERY para qualquer pedido de visualização. Nunca escreva listas no campo "reply".
   Tipos disponíveis: "TASKS", "EXPENSES", "INCOMES", "SUMMARY"

   Exemplo input: "quero ver os meus gastos" / "liste minhas despesas" / "quanto gastei?"
   → { "actions": [{ "action": "QUERY", "parsedData": { "type": "EXPENSES", "date": null } }], "reply": "Aqui estão seus gastos:" }

   Exemplo input: "minha agenda" / "tenho algum compromisso?" / "o que tenho pra amanhã?" / "o que tenho hoje?"
   → { "actions": [{ "action": "QUERY", "parsedData": { "type": "TASKS", "date": null } }], "reply": "Aqui está sua agenda:" }

   Exemplo input: "meu resumo" / "meu saldo"
   → { "actions": [{ "action": "QUERY", "parsedData": { "type": "SUMMARY", "date": null } }], "reply": "Aqui está seu resumo:" }

   Exemplo input: "minhas receitas de março"
   → { "actions": [{ "action": "QUERY", "parsedData": { "type": "INCOMES", "date": "2025-03" } }], "reply": "Aqui estão suas receitas de março:" }

5. CONCLUIR TAREFA → action "DONE"
   Gatilhos: "concluí", "terminei", "feito", "finalizado", "já fiz", "marcar como feito"
   Exemplo input: "concluí a reunião"
   → { "action": "DONE", "parsedData": { "title": "reunião" } }

6. APAGAR REGISTRO → action "DELETE"
   Gatilhos: "apagar", "remover", "excluir", "deletar", "cancelar"
   Para resetar tudo: type "ALL"
   Exemplo input: "apaga o gasto do uber"
   → { "action": "DELETE", "parsedData": { "type": "EXPENSES", "target": "uber" } }
   Exemplo input: "apaga a tarefa de academia"
   → { "action": "DELETE", "parsedData": { "type": "TASKS", "target": "academia" } }

7. SILENCIAR ALARME → action "TOGGLE_ALARM"
   Gatilhos: "desligar alarme", "silenciar lembrete", "parar de me avisar", "desative o lembrete"
   REGRA: Se o usuário disser "desative o lembrete" sem especificar tarefa, verifique o histórico da conversa.
   Se a última tarefa criada estiver no histórico (ex: "Tarefa registrada: Call com a Raquel"), use-a como alvo.
   Só use target "todos" se o usuário pedir explicitamente ("todos os lembretes", "todas as tarefas").
   Exemplo (tarefa recente no histórico): "desative o lembrete"
   → { "action": "TOGGLE_ALARM", "parsedData": { "target": "Call com a Raquel", "active": false } }
   Exemplo (pedido genérico): "desative todos os lembretes"
   → { "action": "TOGGLE_ALARM", "parsedData": { "target": "todos", "active": false } }

=== REGRAS CRÍTICAS ===

R1. MÚLTIPLOS PEDIDOS: Se o usuário mandar vários pedidos numa mensagem, gere uma action para cada um.
    Exemplo: "gastei 20 na farmácia e 50 no mercado" → duas actions EXPENSE.

R2. REPLY OBRIGATÓRIO: O campo "reply" nunca fica vazio. Se só registrou, confirme brevemente.
    Formato de confirmação:
    "✅ [Tipo] registrado!
    📝 [Descrição]
    💰 Valor: R$ X,XX (se financeiro)
    📅 Data: DD/MM/AAAA
    🏷️ Categoria: [categoria]"

R3. CONSULTAS: Para qualquer pedido de "ver", "listar", "mostrar" ou "extrato", use SEMPRE a action QUERY.
    No campo "reply", escreva apenas uma frase curta introdutória (ex: "Aqui estão seus gastos:").
    NUNCA reproduza listas, valores ou dados no "reply" quando usar QUERY — o sistema já exibe os dados.
    PROIBIDO usar "Consulta realizada" ou qualquer label técnico no "reply".

R4. SEM ALUCINAÇÃO: Use apenas os dados em "DADOS DO USUÁRIO". Se não estiver lá, diga que não encontrou.

R5. INTENÇÃO VAGA: Se o pedido for impreciso, execute o que conseguir e peça confirmação.

R6. DATAS RELATIVAS: Resolva baseado na data atual (${dataAtual}).
    "hoje" → data de hoje, "amanhã" → data de amanhã, "semana que vem" → próxima segunda.

R7. ACTIONS VAZIAS: Se for só conversa (ex: "oi", "tudo bem?"), retorne "actions": [] e responda no "reply".`;

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
        if (/\b(gastos?|despesas?|extrato|gast[ei]|pagu[ei]|compra[ei]|saiu)\b/.test(lowerMsg))                           queryType = "EXPENSES";
        else if (/\b(receitas?|entrad[ao]s?|sal[aá]rio|renda|recebi|entrou)\b/.test(lowerMsg))                            queryType = "INCOMES";
        else if (/\b(tarefas?|agenda|compromisso|amanh[aã]|hoje|semana|lembretes?)\b/.test(lowerMsg))                     queryType = "TASKS";
        else if (/\b(resumo|saldo|balan[cç]o|situa[cç][aã]o|panorama|vis[aã]o|geral|como estou|quanto tenho)\b/.test(lowerMsg)) queryType = "SUMMARY";
        else queryType = "SUMMARY"; // fallback: eco detectado mas sem keyword → consulta geral

        console.warn(`[${remoteJid}] ⚠️ Safeguard: eco detectado. Injetando QUERY ${queryType}.`);
        aiResponse.actions.push({ action: "QUERY", parsedData: { type: queryType, date: null } });
        aiResponse.reply = "";
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

    for (const act of uniqueActs) {
      const { action, parsedData = {} } = act;
      console.log(`[${remoteJid}] ▶ Executando action: ${action}`, JSON.stringify(parsedData));

      try {
        // ── EXPENSE ──────────────────────────────────────────────────────────
        if (action === "EXPENSE") {
          const val = parseFloat(String(parsedData.amount || 0).replace(',', '.').replace(/[^\d.]/g, ''));
          if (val > 0) {
            await prisma.expense.create({
              data: {
                user_id: user.id,
                amount: val,
                description: parsedData.description || "Gasto",
                category: parsedData.category || "Outros",
                date: parsedData.date ? new Date(String(parsedData.date).replace(/Z$/i, "")) : new Date()
              }
            });
            hasChange = true;
          } else {
            console.warn(`[${remoteJid}] ⚠️ EXPENSE ignorado: valor inválido (${parsedData.amount})`);
          }
        }

        // ── INCOME ───────────────────────────────────────────────────────────
        else if (action === "INCOME") {
          const val = parseFloat(String(parsedData.amount || 0).replace(',', '.').replace(/[^\d.]/g, ''));
          if (val > 0) {
            await prisma.income.create({
              data: {
                user_id: user.id,
                amount: val,
                description: parsedData.description || "Receita",
                category: parsedData.category || "Renda",
                date: parsedData.date ? new Date(String(parsedData.date).replace(/Z$/i, "")) : new Date()
              }
            });
            hasChange = true;
          }
        }

        // ── TASK ─────────────────────────────────────────────────────────────
        else if (action === "TASK") {
          const title = cleanTitle(parsedData.title || "");
          if (!title) { console.warn(`[${remoteJid}] ⚠️ TASK ignorada: título vazio`); continue; }

          const dueDate = parsedData.due_date ? new Date(String(parsedData.due_date).replace(/Z$/i, "")) : null;
          const shouldRemind = parsedData.remind === true && dueDate !== null;
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
          hasChange = true;
        }

        // ── QUERY ─────────────────────────────────────────────────────────────
        else if (action === "QUERY") {
          const queryType = (parsedData.type || "SUMMARY").toUpperCase();

          // Resolução de período
          let dateFilter = { gte: firstDayMonth };
          if (parsedData.date) {
            const rawDate = String(parsedData.date);
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

          let queryResult = "";

          if (queryType === "TASKS") {
            const list = await prisma.task.findMany({
              where: { user_id: user.id, completed: false },
              orderBy: { due_date: 'asc' }
            });
            if (list.length > 0) {
              queryResult = `📅 SUA AGENDA\n━━━━━━━━━━━━━━━━━━\n\n`;
              queryResult += list.map(t => {
                if (!t.due_date) return `🔔 ${t.title}\n   └─ Sem data definida`;
                const dStr = new Date(t.due_date).toLocaleString("pt-BR", {
                  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit",
                  hour: "2-digit", minute: "2-digit"
                });
                return `🔔 ${t.title}\n   └─ ⏰ ${dStr}`;
              }).join("\n\n");
              queryResult += `\n\n━━━━━━━━━━━━━━━━━━\nTotal: ${list.length} tarefa(s) pendente(s)`;
            } else {
              queryResult = "Sua agenda está limpa! Nenhuma tarefa pendente. 🎉";
            }

          } else if (queryType === "EXPENSES") {
            const exps = await prisma.expense.findMany({
              where: { user_id: user.id, ...(parsedData.date ? { date: dateFilter } : { date: { gte: firstDayMonth } }) },
              orderBy: { date: 'desc' },
              take: 50
            });
            queryResult = formatFinanceRecords(exps, "EXPENSE");

          } else if (queryType === "INCOMES") {
            const incs = await prisma.income.findMany({
              where: { user_id: user.id, ...(parsedData.date ? { date: dateFilter } : {}) },
              orderBy: { date: 'desc' },
              take: 50
            });
            queryResult = formatFinanceRecords(incs, "INCOME");

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
            aiResponse.reply = (aiResponse.reply ? aiResponse.reply + "\n\n" : "") +
              `✅ Tarefa concluída!\n\n📝 "${task.title}"\n🏆 Status: Finalizada`;
            hasChange = true;
          } else {
            console.log(`[${remoteJid}] ⚠️ Tarefa para DONE não encontrada: "${taskName}"`);
            aiResponse.reply = (aiResponse.reply ? aiResponse.reply + "\n\n" : "") +
              `Não encontrei nenhuma tarefa pendente com esse nome. Deseja ver sua agenda completa?`;
          }
        }

        // ── DELETE ───────────────────────────────────────────────────────────
        else if (action === "DELETE") {
          const delType = (parsedData.type || "ALL").toUpperCase();
          const target = (parsedData.target || "").toLowerCase().trim();
          const rawLower = msgText.toLowerCase();

          if (delType === "ALL" || rawLower.includes("tudo") || rawLower.includes("reset")) {
            await Promise.all([
              prisma.task.deleteMany({ where: { user_id: user.id } }),
              prisma.expense.deleteMany({ where: { user_id: user.id } }),
              prisma.income.deleteMany({ where: { user_id: user.id } })
            ]);
            aiResponse.reply = "🗑️ Reset completo! Todos os seus registros foram removidos.";
            hasChange = true;

          } else if (delType === "EXPENSES" || delType === "INCOMES") {
            const model = delType === "EXPENSES" ? prisma.expense : prisma.income;
            const label = delType === "EXPENSES" ? "Gasto" : "Receita";

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

          } else if (delType === "TASKS") {
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
              client_reference_id: remoteJid,
              phone_number_collection: { enabled: true },
              success_url: `${APP_URL}/success.html`,
              cancel_url: `${APP_URL}/cancel.html`,
            });
            aiResponse.reply += `\n\n🔗 Ative sua assinatura aqui: ${session.url}`;
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
  res.setHeader("Access-Control-Allow-Origin", "*");
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

        if (ev.type === 'checkout.session.completed') {
          const session = ev.data.object;
          let phone = session.client_reference_id || session.metadata?.whatsapp || session.customer_details?.phone;

          if (phone) {
            let cleanPhone = phone.replace(/[^\d]/g, '');
            if (cleanPhone.length >= 10 && cleanPhone.length <= 11 && !cleanPhone.startsWith("55")) {
              cleanPhone = `55${cleanPhone}`;
            }
            if (!cleanPhone.includes("@s.whatsapp.net")) cleanPhone = `${cleanPhone}@s.whatsapp.net`;

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
              "Acesso confirmado! ✅\n\nSou seu Assessor Nico e já estou pronto para te ajudar com finanças e tarefas. 📈\n\nComeça mandando: \"gastei 50 no mercado\" ou \"me lembra de treinar às 18h\".",
              inst
            );
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
          const tryProcess = () => {
            if (userLocks.has(remoteJid)) {
              console.log(`[${remoteJid}] ⏳ Ocupado, re-agendando em 1.5s...`);
              setTimeout(tryProcess, 1500);
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
  const fPath = path.join(__dir, req.url === "/" ? "index.html" : req.url);
  fs.readFile(fPath, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    const ext = path.extname(fPath);
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
    res.writeHead(200, { "Content-Type": mime[ext] || "text/plain" });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`🚀 Nico ativado na porta ${PORT}`));