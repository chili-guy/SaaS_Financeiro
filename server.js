import http from "http";
import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

// Inicia o ORM
const prisma = new PrismaClient();

const __dir   = path.dirname(fileURLToPath(import.meta.url));
const PORT    = process.env.PORT || 3000;
const EVO_URL = process.env.EVOLUTION_API_URL || "http://127.0.0.1:8080";
const EVO_KEY = process.env.EVOLUTION_API_KEY || "FInAgentAPISecretKey_2026";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "SUA_CHAVE_AQUI";

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  // ── Webhook Evolution API (WhatsApp) ──────────────────────────────
  if (req.method === "POST" && req.url === "/webhook/evolution") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      const end200 = () => { res.writeHead(200); return res.end(); };
      
      try {
        const payload = JSON.parse(body);
        
        // Apenas mensagens novas
        if (payload.event !== "messages.upsert") return end200();

        const dataKey = payload.data?.key || payload.data?.message?.key || {};
        const remoteJid = dataKey.remoteJid || "";
        const fromMe = dataKey.fromMe || false;

        // Ignora grupos e bots
        if (fromMe || typeof remoteJid !== "string" || remoteJid.includes("@g.us")) return end200();
        
        const msgNode = payload.data?.message || payload.data;
        const msgText = msgNode.conversation || msgNode.extendedTextMessage?.text || msgNode.imageMessage?.caption || "";
        
        if (!msgText.trim()) return end200();

        // 1. Controle de Assinante (Acha ou Cria o Usuário no DB)
        let user = await prisma.user.findUnique({ where: { phone_number: remoteJid } });
        if (!user) {
          user = await prisma.user.create({ data: { phone_number: remoteJid, status: "ACTIVE" } });
        }

        // Se futuramente o stripe cancelar o usuário:
        if (user.status !== "ACTIVE") {
          const endpoint = `${EVO_URL}/message/sendText/${payload.instance}`;
          await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": EVO_KEY },
            body: JSON.stringify({ number: remoteJid, text: "Sua assinatura FIn está inativa. Renove para continuar usando! 💳" })
          });
          return end200();
        }

        // Salva a mensagem que o user mandou no histórico de contexto
        await prisma.message.create({ data: { user_id: user.id, role: "user", content: msgText } });

        // Pega as últimas 4 mensagens de memória (curta)
        const history = await prisma.message.findMany({
          where: { user_id: user.id },
          orderBy: { created_at: 'desc' },
          take: 4
        });
        const memory = history.reverse().map(m => ({ role: m.role, content: m.content }));

        // Coleta itens atuais do usuário para a IA ter "consciência" na hora de responder
        const pendingTasks = await prisma.task.findMany({ where: { user_id: user.id, completed: false }, take: 10 });
        const expenses = await prisma.expense.findMany({ where: { user_id: user.id }, orderBy: { date: 'desc' }, take: 5 });

        const myTasksStr = pendingTasks.length > 0 ? "Tarefas ativas: " + pendingTasks.map(t => `- ${t.title}`).join(", ") : "Nenhuma tarefa pendente.";
        const myExpStr = expenses.length > 0 ? "Últimos 5 gastos: " + expenses.map(e => `- R$${e.amount} (${e.description})`).join(", ") : "Nenhum gasto recente.";

        // --- Data e Hora em Português-BR para contexto automático ---
        const dataAtual = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

        // Prompt do Sistema transformado para Motor Lógico JSON
        const sysPrompt = `Você é o FIn, seu Assistente Financeiro super-poderoso no WhatsApp.
Hoje é dia e hora exata: ${dataAtual}. BASEIE-SE NISSO para datas como "amanhã" e "hoje".

DADOS DO USUÁRIO AGORA:
${myTasksStr}
${myExpStr}

SUA MISSÃO OBRIGATÓRIA:
Você DEVE avaliar o que o usuário quer fazer, e me responder com APENAS UM CÓDIGO JSON (Nenhum outro texto fora do JSON).

Formato JSON EXATO que você tem que me devolver:
{
  "action": "(Escolha uma: TASK | EXPENSE | NOTE | CHAT)",
  "parsedData": {
     // Se for TASK: "title": "...", "due_date": "YYYY-MM-DDTHH:mm:ssZ" (Exato UTC ISO)
     // Se for EXPENSE: "amount": 15.50 (Obrigatório ser número decimal), "description": "Comida"
     // Se for NOTE: "text": "o texto da anotação inteira aqui"
     // Se for CHAT (apenas conversa ou dúvidas): deixe vazio o objeto {}
  },
  "reply": "O seu texto amigável conversando com o usuário respondendo. Pode usar emoji e formatação do WhatsApp de boa."
}`;

        // Chama a Inteligência Artificial
        const upstream = await fetch("https://api.deepseek.com/v1/chat/completions", {
          method:  "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
          },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
              { role: "system", "content": sysPrompt },
              // Injeta o que foi conversado agora
              ...memory, 
              // A última msg nova sempre garante o processamento
              { role: "user", "content": msgText }
            ],
            temperature: 0.2 // baixo para focar no JSON exato
          }),
        });

        const dsData = await upstream.json();
        let rawContent = dsData.choices?.[0]?.message?.content || "{}";
        
        // Limpa possíveis marcações markdown que a IA cuspir "```json { ... } ```"
        rawContent = rawContent.replace(/```json/g, "").replace(/```/g, "").trim();

        let aiResponse;
        try {
           aiResponse = JSON.parse(rawContent);
        } catch(e) {
           console.error("Falha ao ler JSON da IA:", rawContent);
           aiResponse = { action: "CHAT", parsedData: {}, reply: "Entendi, mas meus circuitos falharam na organização disso. Pode falar novamente?" };
        }

        // Executa a Mágica Bancária de acordo com o Cérebro da IA
        const { action, parsedData } = aiResponse;
        
        try {
          if (action === "EXPENSE" && parsedData.amount && parsedData.description) {
            await prisma.expense.create({
              data: { user_id: user.id, amount: Number(parsedData.amount), description: parsedData.description }
            });
          } else if (action === "TASK" && parsedData.title) {
            await prisma.task.create({
              data: { 
                user_id: user.id, 
                title: parsedData.title, 
                due_date: parsedData.due_date ? new Date(parsedData.due_date) : null 
              }
            });
          } else if (action === "NOTE" && parsedData.text) {
            await prisma.note.create({
              data: { user_id: user.id, content: parsedData.text }
            });
          }
        } catch(dbErr) {
          console.error("Erro ao salvar no DB pelo comando da IA:", dbErr);
        }

        // Salvo o histórico pra ele lembrar o que falou
        if (aiResponse.reply) {
          await prisma.message.create({ data: { user_id: user.id, role: "assistant", content: aiResponse.reply } });
        }

        // Dispara de Volta pelo Cânion da Evolution!
        const endpoint = `${EVO_URL}/message/sendText/${payload.instance}`;
        await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": EVO_KEY
          },
          body: JSON.stringify({
            number: remoteJid,
            text: aiResponse.reply || "Ação executada com sucesso! 🚀"
          })
        });

        return end200();
      } catch (err) {
        console.error("Erro Catastrófico no Webhook Evolution:", err);
        return res.writeHead(500), res.end();
      }
    });
    return;
  }

  // ── Serve Arquivos (A futura Landing Page vai aqui) ─────────────────────
  let filePath = path.join(__dir, req.url === "/" ? "index.html" : req.url);
  const ext    = path.extname(filePath);
  const mime   = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": mime[ext] || "text/plain" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 Servidor FIn (SaaS) Módulo 2 ativado na porta ${PORT}!`);
});
