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

// --- Buffer de Mensagens (QA: Debounce para evitar múltiplas notificações) ---
const messageBuffers = new Map();
const DEBOUNCE_TIME = 2500; // Aguarda 2.5s antes de processar

/**
 * Motor Central de Inteligência do Nico
 */
async function processNicoCore(remoteJid, msgText, instance) {
  try {
    // 1. Controle de Assinante
    let user = await prisma.user.findUnique({ where: { phone_number: remoteJid } });
    if (!user) {
      user = await prisma.user.create({ data: { whatsapp: remoteJid, phone_number: remoteJid, status: "ACTIVE" } });
    }

    if (user.status !== "ACTIVE") {
      const endpoint = `${EVO_URL.replace(/\/$/, "")}/message/sendText/${instance}`;
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": EVO_KEY },
        body: JSON.stringify({ number: remoteJid, text: "Sua assinatura FIn está inativa. Renove para continuar usando! 💳" })
      });
      return;
    }

    // 2. Histórico e Contexto
    await prisma.message.create({ data: { user_id: user.id, role: "user", content: msgText } });
    const history = await prisma.message.findMany({ where: { user_id: user.id }, orderBy: { created_at: 'desc' }, take: 6 });
    const memory  = history.reverse().map(m => ({ role: m.role, content: m.content }));

    const pendingTasks = await prisma.task.findMany({ where: { user_id: user.id, completed: false }, take: 15 });
    const expenses     = await prisma.expense.findMany({ where: { user_id: user.id }, orderBy: { date: 'desc' }, take: 5 });

    const myTasksStr = pendingTasks.length > 0 ? pendingTasks.map(t => t.title).join(", ") : "Nenhuma pendente";
    const myExpStr   = expenses.length > 0 ? expenses.map(e => `R$${e.amount} (${e.description})`).join(", ") : "Nenhum gasto recente";
    const dataAtual  = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

    // 3. System Prompt (Assertividade & Blocos)
    const sysPrompt = `Seu nome é Assessor Nico, um mentor financeiro inteligente e parceiro de organização.
Hoje é ${dataAtual}.

DADOS DO USUÁRIO (ESTADO ATUAL DO SISTEMA):
- Nome: ${user.name && user.name !== "Nico User" ? user.name : "usuário"}
- Tarefas Pendentes: ${myTasksStr}
- Últimos Gastos: ${myExpStr}

Sua personalidade: Amigo Educado, prestativo e um Mentor financeiro elegante.

REGRAS DE OURO (QA Elite):
1. VERDADE ABSOLUTA: O bloco "DADOS DO USUÁRIO" acima é a única fonte da verdade sobre o que existe agora. Se uma tarefa foi mencionada no histórico de chat, mas NÃO está no bloco acima, ela foi DELETADA ou CONCLUÍDA. Jamais cite itens que não estão na lista atual.
2. TOM DE VOZ: Seja leve, pessoal e empático. Use emojis (1 ou 2 por bloco) como 😊, ✅, 📈.
3. SEM GÍRIAS VULGARES: Mantenha a classe. Nada de "eai", "blz", "vlw" ou "mano".
4. APRESENTAÇÃO: Em saudações, apresente-se com elegância como Assessor Nico.
5. ASSERTIVIDADE: Responda o que foi pedido com foco e clareza.
6. ESTRUTURA: Blocos curtos e bem espaçados (\n\n).

RESPOSTA OBRIGATÓRIA EM JSON:
{
  "actions": [],
  "reply": "Sua resposta natural aqui."
}
*Nota: Nunca mande texto fora do JSON.*`;

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
        // Fallback: Se não tem chaves, assume que a IA mandou texto puro por erro
        aiResponse.reply = rawContent.trim();
      }
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
            await prisma.expense.create({ data: { user_id: user.id, amount: val, description: parsedData.description || "Gasto" } });
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
          const term = (parsedData.searchTerm || "").toLowerCase().trim();
          const isGeneric = !term || ["lista", "tarefas", "resumo", "tudo"].some(k => term.includes(k));
          if (isGeneric) {
            const list = await prisma.task.findMany({ where: { user_id: user.id, completed: false }, orderBy: { due_date: 'asc' } });
            aiResponse.reply = list.length > 0 ? `✅ *Suas Tarefas:*\n` + list.map(t => `• *${t.title}*`).join("\n") : "Lista zerada! 🎉";
          }
        } else if (action === "DONE") {
          const task = await prisma.task.findFirst({ where: { user_id: user.id, completed: false, title: { contains: parsedData.title || "", mode: 'insensitive' } } });
          if (task) await prisma.task.update({ where: { id: task.id }, data: { completed: true } });
          hasChange = true;
        } else if (action === "CLEANUP") {
          const tasks = await prisma.task.findMany({ where: { user_id: user.id, completed: false } });
          const seen = new Set();
          for (const t of tasks) {
            const nt = t.title.toLowerCase().trim();
            if (seen.has(nt)) { await prisma.task.delete({ where: { id: t.id } }); } else { seen.add(nt); }
          }
        } else if (action === "DELETE") {
          const s = (parsedData.title || "").toLowerCase();
          if (s.includes("tudo")) await prisma.task.deleteMany({ where: { user_id: user.id } });
          else await prisma.task.deleteMany({ where: { user_id: user.id, title: { contains: s, mode: 'insensitive' } } });
          hasChange = true;
        }
      } catch(e) { console.error("Erro DB Action:", e.message); }
    }

    // 6. Resposta Final
    const finalReply = String(aiResponse.reply || (hasChange ? "Tudo pronto! ✅" : "Entendido! 👍")).trim();
    await prisma.message.create({ data: { user_id: user.id, role: "assistant", content: finalReply } });

    const endpoint = `${EVO_URL.replace(/\/$/, "")}/message/sendText/${instance}`;
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": EVO_KEY },
      body: JSON.stringify({ number: remoteJid, text: finalReply })
    });

  } catch (err) { console.error("Erro Core:", err); }
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

  // Webhook Stripe
  if (req.method === 'POST' && req.url === '/webhook/stripe') {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", async () => {
      try {
        const ev = JSON.parse(body);
        if (ev.type === 'checkout.session.completed') {
          const phone = ev.data.object.client_reference_id;
          if (phone) await prisma.user.update({ where: { phone_number: phone }, data: { status: 'ACTIVE' } });
        }
        res.writeHead(200); res.end();
      } catch(e) { res.writeHead(400); res.end(); }
    });
    return;
  }

  // Webhook Evolution (WhatsApp)
  if (req.method === "POST" && (req.url === "/webhook/evolution" || req.url === "/webhook")) {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", async () => {
      const end200 = () => { res.writeHead(200); res.end(); };
      try {
        const payload = JSON.parse(body);
        if (payload.event !== "messages.upsert") return end200();

        const dataKey = payload.data?.key || payload.data?.message?.key || {};
        const remoteJid = dataKey.remoteJid || "";
        if (dataKey.fromMe || !remoteJid || remoteJid.includes("@g.us")) return end200();

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
