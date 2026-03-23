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

    const myTasksStr = pendingTasks.length > 0 
      ? pendingTasks.map(t => `- ${t.title}${t.due_date ? ` [DATA: ${t.due_date.toISOString()}]` : " [SEM DATA]"}`).join("\n") 
      : "Nenhuma pendente";

    const myExpStr   = expenses.length > 0 
      ? expenses.map(e => `- R$${e.amount} em ${e.description} (${e.category}) [DATA: ${e.date.toISOString()}]`).join("\n") 
      : "Nenhum gasto recente";
    const dataAtual  = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

    console.log(`[AI Context] User: ${user.phone_number} | Tasks: ${myTasksStr}`);

    const msgCount  = await prisma.message.count({ where: { user_id: user.id } });
    const isFirst   = msgCount <= 1;
    const isPaying  = /pagar|assinar|assinatura|checkout|pix/i.test(msgText);

    // 3. System Prompt (Instruções de Identidade e Regras)
    const sysPrompt = `### IDENTIDADE
Você é o Assessor Nico, o mentor de produtividade e finanças oficial do usuário. Seu tom é prático, inteligente e direto. Você não é um robô assistente, você é um parceiro estratégico.

### CONTEXTO ATUAL (VERDADE ABSOLUTA)
- Data/Hora: ${dataAtual}
- Status da Assinatura: ${user.status === "ACTIVE" ? "ASSINANTE PRO" : `TRIAL (${daysLeft} dias restantes)`}
- Usuário: ${user.name && user.name !== "Nico User" ? user.name : "Investidor"}

### DADOS DO SISTEMA (NUNCA INVENTE ALÉM DISSO):
- Tarefas Pendentes no Banco: ${myTasksStr}
- Movimentações Recentes (Gastos/Entradas): ${myExpStr}

### REGRAS DE COMPORTAMENTO (LEIA COM ATENÇÃO):
1. **MEMÓRIA DE CURTO PRAZO**: Se o histórico mostra que você já disse "Olá" ou já se apresentou nesta sessão, PULE a saudação inicial. Vá direto ao ponto. NUNCA diga seu nome duas vezes na mesma conversa.
2. **ZERO ALUCINAÇÃO**: Se o usuário perguntar por uma tarefa ou gasto, olhe APENAS os "DADOS DO SISTEMA". Se não estiver lá, diga "Não encontrei esse registro". Nunca invente datas ou status.
3. **PENSAMENTO ECONÔMICO**: Diferencie "registrei um gasto" de "criei uma tarefa". Dinheiro é transação (EXPENSE), compromisso é tarefa (TASK).
4. **TRIAL AWARENESS**: Se o status for TRIAL e for a PRIMEIRA interação real (msgCount <= 1), informe sobre os 30 dias de presente. Caso contrário, ignore o trial.
5. **BREVIDADE EXTREMA**: Seja extremamente sucinto. Responda o essencial em no máximo 2 frases curtas por bloco. Evite frases de preenchimento ("Como posso ajudar?", "Estou aqui para você", "É um prazer"). Vá direto ao ponto.
6. **EQUILÍBRIO DE EMOJIS**: Use apenas 1 emoji por parágrafo para manter a leveza sem poluir visualmente. NUNCA use NEGRITO ou asteriscos.
7. **INSTRUÇÃO PROATIVA**: Se o usuário der comandos genéricos ou vagos (ex: "Agenda", "Gastos", "Comando"), responda com um exemplo prático de uso (ex: "Pode me mandar seus gastos ou pedir para eu lembrar de algo!"). Seja educativo.
8. **CATEGORIZAÇÃO AUTOMÁTICA**: Ao registrar um gasto (EXPENSE), atribua SEMPRE uma categoria lógica.
9. **SEM ASTERISCOS**: Proibido usar "*" ou "**". Entregue o texto totalmente limpo.
10. **FOCO NO AGORA**: Só retorne "actions" para o que o usuário pediu na MENSAGEM ATUAL. Se o seu próprio histórico de respostas já mostra que você confirmou um gasto ou tarefa anteriormente (ex: "Registrei R$20"), NUNCA gere a "action" novamente. Ignore o passado para evitar duplicatas.

### FORMATO DE SAÍDA (OBRIGATÓRIO JSON):
{
  "actions": [
    { "action": "TASK", "parsedData": { "title": "string", "due_date": "ISO-DATE" } },
    { "action": "EXPENSE", "parsedData": { "amount": float, "description": "string", "category": "string" } },
    { "action": "PAY", "parsedData": {} }
  ],
  "reply": "Sua resposta natural fatiada em parágrafos com \\n\\n para eu poder separar em bolhas."
}

*Nota: Se o usuário pedir para você 'Parar de mandar mensagem' ou ficar em silêncio, responda que entendeu e NÃO inclua ações de tarefa ou gasto.*`;

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
    const actions = aiResponse.actions || [];
    let hasChange = false;

    for (const act of actions) {
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
                category: parsedData.category || "Outros"
              } 
            });
            hasChange = true;
          }
        } else if (action === "TASK" && parsedData.title) {
          const existing = await prisma.task.findFirst({ where: { user_id: user.id, completed: false, title: { contains: parsedData.title, mode: 'insensitive' } } });
          if (existing) {
            await prisma.task.update({ where: { id: existing.id }, data: { due_date: parsedData.due_date ? new Date(parsedData.due_date) : existing.due_date } });
          } else {
            await prisma.task.create({ data: { user_id: user.id, title: parsedData.title, due_date: parsedData.due_date ? new Date(parsedData.due_date) : null } });
          }
          hasChange = true;
        } else if (action === "QUERY") {
          console.log(`[${remoteJid}] 🔎 Buscando informações...`);
          const term = (parsedData.searchTerm || "").toLowerCase().trim();
          // Busca ampliada: se perguntar qualquer coisa sobre tarefas ou compromissos, mostra a lista.
          const isTaskQuery = !term || ["tarefa", "agenda", "lista", "tudo", "hoje", "amanhã", "amanha", "fazer", "pendente", "atividade"].some(k => term.includes(k));
          if (isTaskQuery) {
            const list = await prisma.task.findMany({ where: { user_id: user.id, completed: false }, orderBy: { due_date: 'asc' } });
            aiResponse.reply = list.length > 0 ? `✅ Suas Tarefas:\n` + list.map(t => `• ${t.title}`).join("\n") : "Sua lista de tarefas está zerada! 🎉";
          }
        } else if (action === "DONE") {
          const task = await prisma.task.findFirst({ where: { user_id: user.id, completed: false, title: { contains: parsedData.title || "", mode: 'insensitive' } } });
          if (task) {
            await prisma.task.update({ where: { id: task.id }, data: { completed: true } });
            console.log(`[${remoteJid}] ✅ Tarefa concluída: ${task.title}`);
          }
        } else if (action === "CLEANUP") {
          const tasks = await prisma.task.findMany({ where: { user_id: user.id, completed: false } });
          const seen = new Set();
          let removed = 0;
          for (const t of tasks) {
            const nt = t.title.toLowerCase().trim();
            if (seen.has(nt)) { await prisma.task.delete({ where: { id: t.id } }); removed++; } else { seen.add(nt); }
          }
          console.log(`[${remoteJid}] ✨ Limpeza de duplicatas: ${removed} removidos.`);
        } else if (action === "DELETE") {
          const s = (parsedData.title || "").toLowerCase();
          // Sinônimos de "Limpar Tudo" para evitar deletar itens específicos com esses nomes
          const isFullCleanup = s.includes("tudo") || s.includes("todas") || s.includes("toda") || 
                                s.includes("lista") || s.includes("agenda") || s.includes("histórico") ||
                                s.includes("registros") || s === "tarefas" || s === "gastos";

          if (isFullCleanup) {
            console.log(`[${remoteJid}] 🗑️ LIMPANDO TUDO (Tasks + Expenses)...`);
            const dt = await prisma.task.deleteMany({ where: { user_id: user.id } });
            const de = await prisma.expense.deleteMany({ where: { user_id: user.id } });
            aiResponse.reply = `🗑️ *TUDO LIMPO!* \n\nAcabei de remover suas ${dt.count} tarefas e registros de gastos. Estamos prontos para um novo começo! ✨`;
          } else {
            console.log(`[${remoteJid}] 🗑️ Removendo itens específicos: "${s}"...`);
            const dt = await prisma.task.deleteMany({ where: { user_id: user.id, title: { contains: s, mode: 'insensitive' } } });
            const de = await prisma.expense.deleteMany({ where: { user_id: user.id, description: { contains: s, mode: 'insensitive' } } });
            aiResponse.reply = `🗑️ *Removido:* ${dt.count + de.count} itens contendo "${s}".`;
          }
          hasChange = true;
        } else if (action === "PAY") {
          console.log(`[${remoteJid}] 💳 Usuário solicitou checkout.`);
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

    // 6. Resposta Final
    const finalReply = String(aiResponse.reply || (hasChange ? "Tudo certo! ✅" : "Entendido.")).trim();
    await prisma.message.create({ data: { user_id: user.id, role: "assistant", content: finalReply } });

    // 6. Enviar em blocos (fatiado por \n\n) para naturalidade
    const parts = finalReply.split("\n\n").filter(p => p.trim() !== "");
    const endpoint = `${EVO_URL.replace(/\/$/, "")}/message/sendText/${instance}`;

    for (const part of parts) {
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": EVO_KEY },
        body: JSON.stringify({ number: remoteJid, text: part.trim() })
      });
      // Pequena pausa entre as bolhas de mensagem
      await new Promise(r => setTimeout(r, 1500));
    }

  } catch (err) { 
    console.error("Erro Core:", err); 
  } finally {
    userLocks.delete(remoteJid); // Libera o bot para a próxima mensagem
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
        const msgText = msgNode.conversation || msgNode.extendedTextMessage?.text || msgNode.imageMessage?.caption || "";
        if (!msgText.trim()) return end200();

        // DEBOUNCE LOGIC
        if (!messageBuffers.has(remoteJid)) messageBuffers.set(remoteJid, { texts: [], timer: null });
        const buffer = messageBuffers.get(remoteJid);
        buffer.texts.push(msgText);

        if (buffer.timer) clearTimeout(buffer.timer);
        buffer.timer = setTimeout(() => {
          const fullMsg = buffer.texts.join(" ");
          const instance = payload.instance || "main";
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
