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
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const RESET_SECRET         = process.env.RESET_SECRET || "";

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
  let reply = type === "EXPENSE" ? "💸 Seus Gastos por Categoria:\n\n" : "💰 Suas Receitas por Categoria:\n\n";

  for (const [cat, data] of sorted) {
    const emoji = catEmojis[cat] || (type === "EXPENSE" ? "📦" : "💵");
    const pct = totalAll > 0 ? ((data.total / totalAll) * 100).toFixed(0) : 0;
    reply += `${emoji} ${cat} (${pct}%)\n`;
    data.items.forEach(i => {
      reply += `• R$ ${i.amount.toFixed(2)} — ${i.description}\n`;
    });
    reply += `🔸 Total: R$ ${data.total.toFixed(2)}\n\n`;
  }

  reply += "━━━━━━━━━━━━━━━\n";
  reply += `✨ Total Geral: R$ ${totalAll.toFixed(2)}`;
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

    // 2. Histórico e Contexto (Busca antes de salvar a nova para evitar duplicação no prompt)
    const history = await prisma.message.findMany({ where: { user_id: user.id }, orderBy: { created_at: 'desc' }, take: 30 });
    const memory  = history.reverse().map(m => ({ role: m.role, content: m.content }));

    // Agora salva a mensagem atual no banco para o próximo turno
    await prisma.message.create({ data: { user_id: user.id, role: "user", content: msgText } });

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

    const fmtDate = (d) => new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });

    const myExpStr = expenses.length > 0 
      ? expenses.map(e => `- R$${e.amount} em ${e.description} (${e.category}) [DATA: ${fmtDate(e.date)}]`).join("\n") 
      : "Nenhum gasto recente";
      
    const myIncStr = incomes.length > 0 
      ? incomes.map(i => `- R$${i.amount} em ${i.description} (${i.category}) [DATA: ${fmtDate(i.date)}]`).join("\n") 
      : "Nenhuma receita recente";

    const msgCount = await prisma.message.count({ where: { user_id: user.id } });
    const isFirst = msgCount <= 1;

    const dataAtual = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

    console.log(`[AI Context] Iniciando processamento...`);
    const sysPrompt = `### IDENTIDADE
Você é o Assessor Nico, um consultor financeiro e assistente pessoal polido, educado e profissional. Para você, "Dívidas", "Contas" e "Gastos" são a mesma coisa. 
Você simplifica a vida financeira do usuário, mas sempre com um tom de cordialidade e elegância, como um gerente de banco premium.
NUNCA use gírias como "chefe", "mano", "bora", "show", nem exageros informais. Seja prestativo, claro e direto ao ponto. Use emojis com moderação apenas para organizar informações visualmente.

### CONTEXTO ATUAL (VERDADE ABSOLUTA)
- Data/Hora: ${dataAtual}
- Status da Assinatura: ASSINANTE PRO (Acesso Liberado)
- Primeira Interação: ${isFirst ? 'SIM — apresente-se completamente' : 'NÃO — seja direto e informal'}
- Total de mensagens trocadas: ${msgCount}
- Usuário: ${user.name && !["Nico User", "Investidor", "Investidor ", "Prezado"].includes(user.name) ? user.name : "NÃO INFORMADO"}

### REGISTROS INTERNOS (PARA SEU CONHECIMENTO):
- Financeiro (Este Mês): R$ ${balance.toFixed(2)} (Receitas: R$ ${totalInc.toFixed(2)} | Gastos/Dívidas: R$ ${totalExp.toFixed(2)})
- Agenda de Tarefas: ${myTasksStr}
- Histórico de Dívidas/Gastos: ${myExpStr}
- Histórico de Receitas: ${myIncStr}

### REGRAS DE COMPORTAMENTO (ESTRITAS):
1. **AÇÃO E CONVERSA**: Se o usuário mandar um comando (Gastar, Lembrar), foque em registrar. Se ele apenas conversar (ex: "oi", "tudo bem"), responda de forma amigável no campo 'reply'.
2. **SAUDAÇÃO INTELIGENTE**: ${isFirst ? 'Esta é a PRIMEIRA mensagem deste usuário. Apresente-se completamente como Assessor Nico.' : 'NÃO é a primeira mensagem (total: ' + msgCount + '). Seja breve e natural. NUNCA repita sua bio completa.'}
3. **ZERO ALUCINAÇÃO**: Se o usuário perguntar por algo, olhe APENAS os "REGISTROS INTERNOS". Se não estiver lá, diga "Não encontrei esse registro".
4. **MODELO DE CONFIRMAÇÃO OBRIGATÓRIO**: Para CADA ação de registro (TASK, EXPENSE, INCOME) que você identificar, você DEVE gerar o bloco estruturado abaixo no campo 'reply'. Se houver 3 gastos, você deve gerar 3 blocos no mesmo 'reply'.
✅ [Gasto/Entrada/Tarefa] registrado!

📝 [Descrição/Título]: [texto exato do usuário, ex: "mercado"]
💰 Valor: R$ [valor] (apenas se for financeiro)
📅 Data: [Apenas "DD-MM-AAAA" se for dia inteiro, ou "DD-MM-AAAA às HH:mm" se tiver hora]
🏷️ [Categoria/Alarme]: [categoria do gasto ou Status do Lembrete]

6. **EMOJIS**: Use emojis de forma moderada e estratégica para dar vida à conversa. Máximo 1 por parágrafo.
7. **INSTRUÇÃO PROATIVA**: Para comandos vagos, dê um exemplo útil.
8. **CATEGORIZAÇÃO**: Atribua sempre uma categoria lógica aos gastos (EXPENSE).
10. **MÚLTIPLOS PEDIDOS**: Gere uma "action" separada para cada um deles.
11. **SEM REPETIÇÃO**: Se for apenas uma confirmação curta como "Ok", responda apenas com texto.
12. **COMANDO DELETE**: Se o usuário pedir para "limpar tudo", "apagar histórico" ou "resetar", use a ação DELETE. NUNCA use DELETE para marcar uma tarefa como feita.
13. **CONCLUIR TAREFA (DONE)**: Se o usuário disser "concluí", "feito", "já fiz", "finalizei", use obrigatoriamente a ação DONE com o título da tarefa no parsedData.
15. **AGENDAMENTO**: Se houver intenção de lembrete (ex: "me lembre", "anote aí", "marcar reunião"), use TASK com "remind: true".
31. **CONVERSA LIVRE E OBRIGATÓRIA**: Você é um assessor com personalidade! O campo 'reply' NUNCA deve ficar vazio. Se o usuário fizer uma pergunta casual ("quem eu sou?", "tudo bem?"), responda de forma natural e proativa usando o nome dele (que está no Contexto Atual).
32. **INTELIGÊNCIA DE INTENÇÃO**: Frases como "o que vou fazer hoje?", "meus compromissos", "minha agenda" ou "quais minhas tarefas?" significam que o usuário quer ver a agenda. Você DEVE gerar a ação QUERY com type "TASKS" e escrever no 'reply' algo como "Deixa comigo, fui buscar sua agenda:"
33. **PERSONALIDADE NATURAL**: Seja cordial como um gerente premium. Se o Contexto Atual indicar que o nome do usuário é "NÃO INFORMADO", NUNCA use codinomes ou títulos genéricos como "Prezado", "Investidor", "Chefe", "Mano", "Amigo", etc. Apenas inicie a frase de forma educada e direta (ex: "Claro, registrei seu gasto..." ao invés de "Claro, Prezado..."). Se você souber o nome real do usuário, use-o com moderação (no máximo uma vez por resposta).
34. **CANCELAR LEMBRETE**: Se o usuário pedir para "cancelar o alarme" ou "tirar o lembrete" (mas manter a tarefa na agenda), use a ação TOGGLE_ALARM. O target pode ser "todos" (para todos os lembretes) ou o título específico da tarefa.
35. **SEM ASTERISCOS**: NUNCA use o caractere asterisco (*) para negrito, itálico ou qualquer tipo de formatação. Escreva o texto limpo, sem o caractere *.

### FORMATO DE SAÍDA (OBRIGATÓRIO JSON):
Você DEVE retornar um JSON válido. Se não houver ações a fazer (ex: usuário disse apenas "oi"), retorne a lista de actions VAZIA [], mas PREENCHA o reply.

{
  "actions": [
    { "action": "TASK", "parsedData": { "title": "string", "due_date": "ISO-DATE ou null", "remind": boolean } },
    { "action": "EXPENSE", "parsedData": { "amount": float, "description": "string", "category": "string", "date": "ISO-DATE | null" } },
    { "action": "INCOME", "parsedData": { "amount": float, "description": "string", "category": "string", "date": "ISO-DATE | null" } },
    { "action": "QUERY", "parsedData": { "type": "TASKS | EXPENSES | INCOMES | SUMMARY" } },
    { "action": "DELETE", "parsedData": {} },
    { "action": "DONE", "parsedData": { "title": "string" } },
    { "action": "SUBSCRIBE", "parsedData": {} },
    { "action": "TOGGLE_ALARM", "parsedData": { "target": "string ou 'todos'", "active": boolean } }
  ],
  "reply": "Sua resposta natural, humana e com emojis aqui. OBRIGATÓRIO preencher se for um bate-papo ou pergunta."
}
*Nota: Se o usuário pedir para você 'Parar de mandar mensagem', responda que entendeu e NÃO inclua ações.*`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    // 4. Chamada IA Principal (Única e Absoluta)
    const upstream = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method:  "POST",
      headers: { "Content-Type":  "application/json", "Authorization": `Bearer ${DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "system", "content": sysPrompt }, ...memory, { role: "user", "content": msgText }],
        temperature: 0.2
        // response_format: { type: "json_object" } 
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
      console.log(`[DEBUG IA - ${remoteJid}] Resposta CRUA da DeepSeek:`, rawContent);
      
      try {
        const s = rawContent.indexOf('{');
        const e = rawContent.lastIndexOf('}');
        
        if (s !== -1 && e !== -1) {
          const jsonString = rawContent.substring(s, e + 1);
          aiResponse = JSON.parse(jsonString);
        } else {
          aiResponse.reply = rawContent.trim();
        }
      } catch(e) { 
        console.error(`[${remoteJid}] ❌ Erro Parse JSON AI:`, e.message);
        aiResponse.reply = "Deu um curto-circuito interno ao processar isso. Pode repetir?";
      }
    }

    // 5. Execução de Ações
    let hasChange = false;
    const aiActions = aiResponse.actions || [];
    
    // Deduplicação
    const uniqueActions = [];
    const seenActions = new Set();
    for (const act of aiActions) {
      const cleanData = JSON.parse(JSON.stringify(act.parsedData || {}));
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
          }
        } 
        else if (action === "TASK" && parsedData.title) {
          const title = cleanTitle(parsedData.title);
          const existing = await prisma.task.findFirst({ where: { user_id: user.id, completed: false, title: { contains: title, mode: 'insensitive' } } });
          const finalDueDate = parsedData.due_date ? new Date(String(parsedData.due_date).replace(/Z$/i, "")) : null;
          const notifiedFlag = (parsedData.remind === true) ? false : true; 
          
          if (existing) {
            await prisma.task.update({ 
              where: { id: existing.id }, 
              data: { due_date: finalDueDate || existing.due_date, notified: notifiedFlag, notified_5min: notifiedFlag } 
            });
          } else {
            await prisma.task.create({ 
              data: { user_id: user.id, title: title, due_date: finalDueDate, notified: notifiedFlag, notified_5min: notifiedFlag } 
            });
          }
          hasChange = true;
        } 
        else if (action === "QUERY") {
          const queryType = parsedData.type || "SUMMARY"; 
          const dateFilter = { gte: new Date(now.getFullYear(), now.getMonth(), 1) };
          let queryResultText = ""; 

          if (queryType === "TASKS") {
            const list = await prisma.task.findMany({ where: { user_id: user.id, completed: false }, orderBy: { due_date: 'asc' } });
            queryResultText = list.length > 0 ? `📅 Sua Agenda:\n\n` + list.map(t => {
                if (!t.due_date) return `🔔 ${t.title}`;
                const d = new Date(t.due_date);
                return `🔔 ${t.title} - ${d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}`;
            }).join("\n") : "Sua lista de tarefas está zerada para hoje! 🎉";
          } 
          else if (queryType === "EXPENSES") {
            const exps = await prisma.expense.findMany({ where: { user_id: user.id, date: dateFilter }, orderBy: { date: 'desc' } });
            queryResultText = formatFinanceRecords(exps, "EXPENSE");
          } 
          else if (queryType === "INCOMES") {
            const incs = await prisma.income.findMany({ where: { user_id: user.id, date: dateFilter }, orderBy: { date: 'desc' } });
            queryResultText = formatFinanceRecords(incs, "INCOME");
          } 
          else {
            const tasks = await prisma.task.findMany({ where: { user_id: user.id, completed: false }, take: 5 });
            const eSum = await prisma.expense.aggregate({ where: { user_id: user.id, date: dateFilter }, _sum: { amount: true } });
            const iSum = await prisma.income.aggregate({ where: { user_id: user.id, date: dateFilter }, _sum: { amount: true } });
            queryResultText = `✨ Seu Resumo Geral ✨\n\n💰 Receitas: R$ ${(iSum._sum.amount || 0).toFixed(2)}\n💸 Gastos: R$ ${(eSum._sum.amount || 0).toFixed(2)}\n📋 Tarefas pendentes: ${tasks.length}`;
          }

          // A MÁGICA ACONTECE AQUI: Junta a fala natural da IA com os dados puxados do banco!
          aiResponse.reply = (aiResponse.reply ? aiResponse.reply + "\n\n" : "") + queryResultText;
        }
        else if (action === "TOGGLE_ALARM") {
          const target = (parsedData.target || "").toLowerCase();
          const turnOff = parsedData.active === false;
          // Se turnOff for true, marcamos notified como true para o sistema "achar" que já tocou e não avisar mais.
          const flagStatus = turnOff ? true : false; 

          if (target === "todos" || target === "tudo") {
            await prisma.task.updateMany({ 
              where: { user_id: user.id, completed: false }, 
              data: { notified: flagStatus, notified_5min: flagStatus } 
            });
            console.log(`[${remoteJid}] 🔇 Todos os alarmes desativados.`);
          } else {
            // Tenta achar a tarefa específica
            const existing = await prisma.task.findFirst({ 
              where: { user_id: user.id, completed: false, title: { contains: target, mode: 'insensitive' } } 
            });
            if (existing) {
              await prisma.task.update({ 
                where: { id: existing.id }, 
                data: { notified: flagStatus, notified_5min: flagStatus } 
              });
              console.log(`[${remoteJid}] 🔇 Alarme desativado para: ${existing.title}`);
            }
          }
          hasChange = true;
        }
        else if (action === "DELETE") {
           const raw = msgText.toLowerCase();
           if (raw.includes("tudo") || raw.includes("reset") || raw.includes("limpar agenda") || raw.includes("apagar histórico")) {
              await prisma.task.deleteMany({ where: { user_id: user.id } });
              await prisma.expense.deleteMany({ where: { user_id: user.id } });
              aiResponse.reply = "🗑️ RESET COMPLETO! Removi todos os registros conforme solicitado.";
              hasChange = true;
           } else if (raw.includes("limpar gasto") || raw.includes("limpar financeiro")) {
              await prisma.expense.deleteMany({ where: { user_id: user.id } });
              aiResponse.reply = "🗑️ FINANCEIRO LIMPO! Seus registros de gastos e receitas foram removidos.";
              hasChange = true;
           } else {
              console.log(`[${remoteJid}] 🔎 Ignorando DELETE genérico (segurança).`);
           }
        }
        else if (action === "DONE") {
          const taskName = parsedData.title || "";
          const task = await prisma.task.findFirst({ 
            where: { user_id: user.id, completed: false, title: { contains: taskName, mode: 'insensitive' } },
            orderBy: { created_at: 'desc' }
          });
          
          if (task) {
            await prisma.task.update({ where: { id: task.id }, data: { completed: true } });
            aiResponse.reply = (aiResponse.reply ? aiResponse.reply + "\n\n" : "") + 
              `✅ Tarefa finalizada!\n\n📝 Título: ${task.title}\n🏆 Status: Concluída`;
            hasChange = true;
          } else {
            console.log(`[${remoteJid}] ⚠️ Nenhuma tarefa encontrada para concluir: ${taskName}`);
          }
        }
        else if (action === "SUBSCRIBE") {
          const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
            mode: 'subscription',
            client_reference_id: remoteJid,
            phone_number_collection: { enabled: true },
            success_url: `${APP_URL}/success.html`,
            cancel_url: `${APP_URL}/cancel.html`,
          });
          aiResponse.reply += `\n\n🔗 *Ative sua assinatura aqui:* ${session.url}`;
          hasChange = true;
        }
      } catch(e) { console.error("Erro DB Action:", e.message); }
    }

    // 6. Resposta Final (Blindada contra amnésia)
    let rawReply = aiResponse.reply?.trim();
    if (!rawReply) {
      if (hasChange) {
        rawReply = "Prontinho, já deixei tudo registrado aqui para você! ✅";
      } else {
        rawReply = "Putz, dei uma engasgada aqui processando isso. Você pode me explicar de outra forma? 🤔";
      }
    }

    // QA: Agora o Nico envia tudo em um único balão de mensagem, mantendo a formatação original da IA.
    const parts = [rawReply];

    const finalReply = parts.join("\n\n");
    const MAX_HISTORY_LEN = 400;
    const contentToSave = finalReply.length > MAX_HISTORY_LEN 
      ? finalReply.substring(0, MAX_HISTORY_LEN) + "... [relatório completo truncado para contexto]" 
      : finalReply;
    await prisma.message.create({ data: { user_id: user.id, role: "assistant", content: contentToSave } });

    const instanceName = instance || "main";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      const isLastPart = i === parts.length - 1;
      const hasTaskAction = uniqueActions.some(a => a.action === "TASK");
      
      try {
        console.log(`[${remoteJid}] 📤 Enviando parte ${i + 1}/${parts.length}...`);
        
        // Sempre envia o texto principal como sendText para garantir entrega
        await sendText(remoteJid, part, instanceName);

        // Se for a última parte e houver ação de tarefa, tenta enviar botões extras
        if (false && isLastPart && hasTaskAction) { // Botões desabilitados até handler de clique ser validado
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
  if (req.method === 'GET' && req.url.startsWith('/nico-reset-database-delete-all')) {
    const urlParams = new URL(req.url, `http://localhost`).searchParams;
    const tokenProvided = urlParams.get('token');
    if (!RESET_SECRET || tokenProvided !== RESET_SECRET) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("403 Forbidden");
      return;
    }
    try {
      console.log("🧼 Iniciando limpeza completa via Rota de Servidor...");
      // Ordem importa por causa das chaves estrangeiras
      await prisma.message.deleteMany({});
      await prisma.task.deleteMany({});
      await prisma.expense.deleteMany({});
      try { await prisma.note.deleteMany({}); } catch (_) {}
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
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", async () => {
      try {
        const body = Buffer.concat(chunks);
        let ev;
        const signature = req.headers['stripe-signature'];
        if (STRIPE_WEBHOOK_SECRET && signature) {
          try {
            ev = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
          } catch (sigErr) {
            console.error("[STRIPE Webhook] ❌ Assinatura inválida:", sigErr.message);
            res.writeHead(400); res.end("Invalid signature"); return;
          }
        } else {
          console.warn("[STRIPE Webhook] ⚠️ STRIPE_WEBHOOK_SECRET não configurado. Validando sem assinatura (inseguro em produção).");
          ev = JSON.parse(body.toString());
        }
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
        let msgText = msgNode.conversation 
          || msgNode.extendedTextMessage?.text 
          || msgNode.imageMessage?.caption 
          || msgNode.buttonsResponseMessage?.selectedButtonId
          || msgNode.templateButtonReplyMessage?.selectedId
          || "";

        // Traduz IDs de botão para comandos de texto naturais
        const buttonAliases = {
          "confirm_task": "mostrar minha agenda",
          "done_last": "concluir última tarefa"
        };
        if (buttonAliases[msgText]) {
          msgText = buttonAliases[msgText];
        }
        
        // FILTRO DE RUÍDO (QA): Remove prefixos de teste e metadados que confundem a IA
        msgText = msgText.replace(/\[TESTE \d+\/\d+\]/gi, '').replace(/^G\d+\s*·\s*[^\n]+\n?/i, '').replace(/^=/, '').trim();

        if (!msgText) return end200();

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
