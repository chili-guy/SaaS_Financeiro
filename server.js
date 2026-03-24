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
- TASK_QUERY (Consultar agenda, tarefas, compromissos, lembretes)
- EXPENSE_QUERY (Consultar gastos, dívidas, boletos, faturas, financeiro)
- INCOME_QUERY (Consultar ganhos, salários, depósitos)
- DELETE (Apagar, limpar, excluir histórico, tarefas ou gastos)
- UNKNOWN (Outros casos)

Mensagem: "${msgText}"`;

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
      })
    });

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    return JSON.parse(content).intent || "UNKNOWN";
  } catch (e) {
    console.error("❌ Erro classifyIntent:", e.message);
    return "UNKNOWN";
  }
}

/**
 * Formata os gastos agrupados por categoria (Relatório Premium)
 */
function formatExpensesByCategory(exps) {
  if (!exps || !exps.length) return "Não encontrei registros de gastos para este período. 📂";

  const catEmojis = {
    "Alimentação": "🍔",
    "Alimentação/Supermercado": "🛒",
    "Alimentação/Lanche": "🍟",
    "Lazer/Compras": "🛍️",
    "Saúde/Academia": "🏋️",
    "Animais de Estimação": "🐱",
    "Transporte/Manutenção": "🚗",
    "Saúde": "💊",
    "Educação": "📚",
    "Moradia": "🏠",
    "Lazer": "🎭",
    "Trabalho": "💼",
    "Outros": "📦"
  };

  let groups = {};
  let totalAll = 0;

  exps.forEach(e => {
    const c = e.category || "Outros";
    if (!groups[c]) groups[c] = { total: 0, items: [] };
    groups[c].total += e.amount;
    groups[c].items.push(e);
    totalAll += e.amount;
  });

  const sorted = Object.entries(groups).sort((a,b) => b[1].total - a[1].total);
  let reply = "💸 *Seus Gastos por Categoria:*\n\n";

  for (const [cat, data] of sorted) {
    const emoji = catEmojis[cat] || catEmojis["Outros"];
    const pct = totalAll > 0 ? ((data.total / totalAll) * 100).toFixed(0) : 0;
    reply += `${emoji} *${cat}* (${pct}%)\n`;
    data.items.forEach(i => {
      reply += `• R$ ${i.amount.toFixed(2)} — ${i.description}\n`;
    });
    reply += `🔸 Total: R$ ${data.total.toFixed(2)}\n\n`;
  }

  reply += "━━━━━━━━━━━━━━━\n";
  reply += `💰 *Total Geral: R$ ${totalAll.toFixed(2)}*`;
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
    // 1. Controle de Assinante (SaaS com Trial de 14 dias)
    let user = await prisma.user.findUnique({ where: { phone_number: remoteJid } });
    if (!user) {
      user = await prisma.user.create({ data: { phone_number: remoteJid, status: "TRIAL" } });
    }

    const now = new Date();
    const created = new Date(user.created_at);
    const diffTime = Math.abs(now - created);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const daysLeft = 30 - diffDays;

    // Se o trial acabou e não é ACTIVE, bloqueia.
    if (user.status !== "ACTIVE" && daysLeft <= 0) {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
        mode: 'subscription',
        client_reference_id: remoteJid,
        success_url: `${APP_URL}/success.html`,
        cancel_url: `${APP_URL}/cancel.html`,
      });

      const endpoint = `${EVO_URL.replace(/\/$/, "")}/message/sendText/${instance}`;
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": EVO_KEY },
        body: JSON.stringify({ 
          number: remoteJid, 
          text: `Seu período de teste de 30 dias chegou ao fim! ⏳ \n\nPara continuar com suas mentorias financeiras e organização de tarefas, ative sua assinatura no link abaixo: \n\n🔗 ${session.url}` 
        })
      });
      return;
    }

    // 2. Histórico e Contexto
    await prisma.message.create({ data: { user_id: user.id, role: "user", content: msgText } });
    const history = await prisma.message.findMany({ where: { user_id: user.id }, orderBy: { created_at: 'desc' }, take: 6 });
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

    // 3. System Prompt (Instruções de Identidade e Regras)
    const sysPrompt = `### IDENTIDADE
Você é o Assessor Nico, mentor de organização e finanças. Para você, "Dívidas", "Contas" e "Gastos" são a mesma coisa. Você é um parceiro que simplifica a vida financeira do usuário.

### CONTEXTO ATUAL (VERDADE ABSOLUTA)
- Data/Hora: ${dataAtual}
- Status da Assinatura: ${user.status === "ACTIVE" ? "ASSINANTE PRO" : `TRIAL (${daysLeft} dias restantes)`}
- Usuário: ${user.name && user.name !== "Nico User" ? user.name : "Investidor"}

### REGISTROS INTERNOS (PARA SEU CONHECIMENTO):
- Financeiro (Este Mês): R$ ${balance.toFixed(2)} (Receitas: R$ ${totalInc.toFixed(2)} | Gastos/Dívidas: R$ ${totalExp.toFixed(2)})
- Agenda de Tarefas: ${myTasksStr}
- Histórico de Dívidas/Gastos: ${myExpStr}
- Histórico de Receitas: ${myIncStr}

### REGRAS DE COMPORTAMENTO (ESTRITAS):
1. **SAUDAÇÃO ELABORADA**: Se o usuário saudar (Oi, Ola, Tudo bem?), apresente-se como o Assessor Nico. Seja cordial e mostre entusiasmo em ajudar.
2. **ZERO ALUCINAÇÃO**: Se o usuário perguntar por algo, olhe APENAS os "REGISTROS INTERNOS". Se não estiver lá, diga "Não encontrei esse registro".
3. **PENSAMENTO ECONÔMICO**: Diferencie "registrei um gasto" (EXPENSE) de "criei uma tarefa" (TASK).
4. **TRIAL AWARENESS**: Nas saudações de usuários TRIAL, informe com elegância: "Você está no seu período de testes (X dias restantes). Sou seu Assessor Nico e posso organizar seus gastos, dívidas e sua agenda de produtividade. Como começamos?".
5. **MODELO DE CONFIRMAÇÃO**: Use SEMPRE este padrão visual para confirmar qualquer registro (Financeiro ou Agenda):
✅ [Gasto/Entrada/Tarefa] registrado!

📝 [Descrição/Título]: [texto exato do usuário, ex: "mercado"]
💰 Valor: R$ [valor] (se financeiro)
📅 [Data/Hora]: [DD-MM-AAAA ou horário]
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
15. **AGENDAMENTO**: Ao criar uma tarefa, SEMPRE pergunte se o usuário quer um lembrete (15 min antes e na hora). No modelo de confirmação (Regra 5), coloque o status como "🔔 Status: Ativar lembrete? (15 min antes e na hora)".
16. **CONSULTAS**: Sempre use a ação QUERY para listar ou ver registros. NUNCA escreva textos de lista manualmente; o sistema injetará com ícones (🔔 para tarefas e 💰 para gastos).
17. **DATAS RELATIVAS**: Converta "hoje", "amanhã", "ontem" ou dias da semana em datas ISO usando a Data Atual como base rígida.
18. **FOCO NO REGISTRO**: Priorize a exibição do modelo de confirmação estruturado da Regra 5. NÃO mostre o saldo mensal automaticamente.
19. **TÍTULO ORIGINAL**: Ao atualizar horários, mantenha o nome original do compromisso.
20. **MAPEAMENTO DE TERMOS**: "Dívidas" e "Contas" = GASTOS (EXPENSE).
21. **AMBIGUIDADE**: Se for genérico, peça detalhes antes de agir.
22. **SIGILO TÉCNICO**: Proibido usar termos como JSON, TASK, EXPENSE nas respostas.
23. **UNICIDADE**: NUNCA duplique a mesma ação no mesmo turno.
26. **PENSAMENTO ÚNICO**: Registre apenas um item por vez, a menos que haja valores claramente distintos.
27. **AÇÃO REAL**: Se o usuário pedir para apagar ou limpar, você DEVE gerar a ação DELETE no JSON. NUNCA diga que limpou algo se a ação DELETE não estiver presente.

### FORMATO DE SAÍDA (OBRIGATÓRIO JSON):
{
  "actions": [
    { "action": "TASK", "parsedData": { "title": "string", "due_date": "ISO-DATE ou null" } },
    { "action": "EXPENSE", "parsedData": { "amount": float, "description": "string", "category": "string" } },
    { "action": "INCOME", "parsedData": { "amount": float, "description": "string", "category": "string" } },
    { "action": "PAY", "parsedData": { "title": "string" } },
    { "action": "SUBSCRIBE", "parsedData": {} }
  ],
  "reply": "Sua resposta natural e humana aqui fatiada em bolhas por \\n\\n"
}

*Nota: Se o usuário pedir para você 'Parar de mandar mensagem', responda que entendeu e NÃO inclua ações.*`;

    // 4. Chamada IA (Modo JSON Forçado para estabilidade absoluta)
    const upstream = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method:  "POST",
      headers: { "Content-Type":  "application/json", "Authorization": `Bearer ${DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "system", "content": sysPrompt }, ...memory, { role: "user", "content": msgText }],
        temperature: 0.1,
        response_format: { type: "json_object" } // QA: Obriga a IA a responder JSON válido
      }),
    });

    const dsData = await upstream.json();
    if (!upstream.ok) return console.error("Erro AI:", dsData);

    let rawContent = dsData.choices?.[0]?.message?.content || "";
    let aiResponse = { actions: [], reply: "" };

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
      console.error("Erro Parse JSON AI, usando rawContent como fallback");
      aiResponse.reply = rawContent.trim() || "Tive um soluço técnico. Pode repetir?";
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
          
          // Permite que a IA silencie o lembrete enviando notified: true no JSON
          const notifiedFlag = parsedData.notified === true; 
          
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
          console.log(`[${remoteJid}] 🔎 Roteando consulta via Classificação de Intenção...`);

          const intent = await classifyIntent(msgText);
          console.log(`[${remoteJid}] 🧠 Intent detectada: ${intent}`);

          if (intent === "TASK_QUERY") {
            const list = await prisma.task.findMany({ 
              where: { user_id: user.id, completed: false }, 
              orderBy: { due_date: 'asc' } 
            });
            aiResponse.reply = list.length > 0 
              ? `✅ *Sua Agenda de Tarefas:*\n\n` + list.map(t => {
                  const dateStr = t.due_date ? new Date(t.due_date).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }) : "[SEM DATA]";
                  return `🔔 *${t.title}* - ${dateStr}`;
                }).join("\n") 
              : "Sua lista de tarefas está zerada! 🎉";
          } else if (intent === "EXPENSE_QUERY" || intent === "INCOME_QUERY" || intent === "UNKNOWN") {
            const raw = msgText.toLowerCase();
            const dateFilter = raw.includes("mês passado") ? { gte: new Date(now.getFullYear(), now.getMonth() - 1, 1), lt: new Date(now.getFullYear(), now.getMonth(), 1) } : { gte: new Date(now.getFullYear(), now.getMonth(), 1) };
            
            if (raw.includes("gastos") || raw.includes("divida") || raw.includes("débito") || raw.includes("contas") || raw.includes("despesa") || intent === "EXPENSE_QUERY") {
              const exps = await prisma.expense.findMany({ where: { user_id: user.id, date: dateFilter }, orderBy: { date: 'desc' } });
              aiResponse.reply = formatExpensesByCategory(exps);
            } else {
              const eSum = await prisma.expense.aggregate({ where: { user_id: user.id, date: dateFilter }, _sum: { amount: true } });
              const iSum = await prisma.income.aggregate({ where: { user_id: user.id, date: dateFilter }, _sum: { amount: true } });
              const totalE = eSum._sum.amount || 0;
              const totalI = iSum._sum.amount || 0;
              aiResponse.reply = `📊 *Resumo ${raw.includes("passado") ? "do Mês Passado" : "Mensal"}:*\n\n💰 Receitas: R$ ${totalI.toFixed(2)}\n💸 Gastos: R$ ${totalE.toFixed(2)}`;
            }
          } else {
            aiResponse.reply = "Pode me pedir para ver tarefas, gastos ou registrar algo!";
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
        } else if (action === "PAY") {
          console.log(`[${remoteJid}] 💳 Ação PAY (Dívida) detectada.`);
          // Apenas log de interesse, a IA deve perguntar qual dívida no "reply".
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
    const rawReply = (aiResponse.reply || (hasChange ? "Tudo certo! ✅" : "Entendido.")).trim();
    
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
          const phone = ev.data.object.client_reference_id;
          if (phone) {
            console.log(`[STRIPE Webhook] 💰 Pagamento confirmado para o número: ${phone}`);
            await prisma.user.update({ where: { phone_number: phone }, data: { status: 'ACTIVE' } });
            
            // Notificar usuário via WhatsApp
            const instance = process.env.INSTANCE || "main";
            const endpoint = `${EVO_URL.replace(/\/$/, "")}/message/sendText/${instance}`;
            await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json", "apikey": EVO_KEY },
              body: JSON.stringify({ 
                number: phone, 
                text: "Opa! Recebi a confirmação do seu pagamento. ✅ \n\nSeu acesso ao Assessor Nico agora é ILIMITADO! 🎉 \n\nJá pode começar a organizar suas finanças e tarefas sem restrições. Como posso ser útil agora? 📈🚀" 
              })
            }).catch(e => console.error("Erro ao enviar confirmação WhatsApp:", e.message));
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
        const remoteJid = dataKey.remoteJid || "";
        const msgId     = dataKey.id || "";

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
          const fullMsg = buffer.texts.join("\n");
          const instance = (payload.instance?._id || payload.instance || "main");
          messageBuffers.delete(remoteJid);
          processNicoCore(remoteJid, fullMsg, instance);
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
