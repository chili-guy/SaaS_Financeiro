import 'dotenv/config';
import http from "http";
import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";
import './scheduler.js';

// Inicia o ORM
const prisma = new PrismaClient();

const __dir   = path.dirname(fileURLToPath(import.meta.url));
const PORT    = process.env.PORT || 3000;
const EVO_URL = process.env.EVOLUTION_API_URL || "http://127.0.0.1:8080";
const EVO_KEY = process.env.EVOLUTION_API_KEY || "FInAgentAPISecretKey_2026";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "SUA_CHAVE_AQUI";


// Stripe Config
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_...";
const stripe = new Stripe(STRIPE_KEY);
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || "price_1P2_EXEMPLO"; // ID do seu produto na Stripe

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  // --- ROTA DE WEBHOOK STRIPE (SaaS) ---
  if (req.method === 'POST' && req.url === '/webhook/stripe') {
      let body = "";
      req.on("data", chunk => body += chunk);
      req.on("end", async () => {
          try {
              const event = JSON.parse(body);
              if (event.type === 'checkout.session.completed') {
                  const session = event.data.object;
                  const phone = session.client_reference_id;
                  
                  if (phone) {
                      console.log(`💳 [Stripe] Pagamento confirmado para ${phone}! Ativando...`);
                      await prisma.user.update({
                          where: { phone_number: phone },
                          data: { status: 'ACTIVE' }
                      });

                      // Mensagem de Boas-vindas automática
                      const endpoint = `${EVO_URL.replace(/\/$/, "")}/message/sendText/${process.env.EVO_INSTANCE || 'main'}`;
                      await fetch(endpoint, {
                          method: "POST",
                          headers: { "Content-Type": "application/json", "apikey": EVO_KEY },
                          body: JSON.stringify({ number: phone, text: "✅ *Assinatura Ativada!* \n\nParabéns! Agora você tem acesso ilimitado ao Assessor Nico. Como posso te ajudar hoje? 🚀" })
                      });
                  }
              }
              res.writeHead(200);
              res.end(JSON.stringify({ received: true }));
          } catch (err) {
              console.error("❌ Erro no Webhook Stripe:", err);
              res.writeHead(400);
              res.end();
          }
      });
      return;
  }

  // ── Webhook Evolution API (WhatsApp) ──────────────────────────────
  if (req.method === "POST" && req.url === "/webhook/evolution") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      const end200 = () => { res.writeHead(200); return res.end(); };
      
      try {
        const payload = JSON.parse(body);
        console.log(`📡 [Evolution Webhook] Evento: ${payload.event}`);
        
        // Apenas mensagens novas
        if (payload.event !== "messages.upsert") return end200();

        const dataKey = payload.data?.key || payload.data?.message?.key || {};
        const remoteJid = dataKey.remoteJid || "";
        const fromMe = dataKey.fromMe || false;

        console.log(`📩 [Evolution Webhook] Nova mensagem de ${remoteJid}${fromMe ? ' (Enviada por mim, aguardando)' : ''}`);
        
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
        const expenses = await prisma.expense.findMany({ where: { user_id: user.id }, orderBy: { date: 'desc' }, take: 20 });

        const myTasksStr = pendingTasks.length > 0 ? "Tarefas ativas: " + pendingTasks.map(t => `- ${t.title}`).join(", ") : "Nenhuma tarefa pendente.";
        const myExpStr = expenses.length > 0 ? "Últimos 20 gastos: " + expenses.map(e => `- R$${e.amount} (${e.description})`).join(", ") : "Nenhum gasto recente.";

        console.log(`[Nico Context] Tasks: ${pendingTasks.length}, Expenses: ${expenses.length}`);

        // --- Data e Hora em Português-BR para contexto automático ---
        const dataAtual = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

        // Prompt do Sistema transformado para Motor Lógico JSON
        const sysPrompt = `Você é o Assessor Nico, um mentor financeiro e assistente pessoal.
Lembre-se: Você tem ACESSO AOS DADOS PERSISTENTES abaixo e deve USÁ-LOS para ser útil.

Hoje é ${dataAtual}.

DADOS DO USUÁRIO (Sempre consulte antes de responder):
- Tarefas Pendentes: ${myTasksStr}
- Últimos Gastos: ${myExpStr}

Sua personalidade: Direta, concisa, profissional e EFICIENTE. Use poucos emojis e seja breve nas respostas.

REGRAS DE OURO:
1. FORMATO: SEMPRE use apenas um asterisco para NEGRIRE: *texto*. Nunca use **.
2. CONCISÃO: Evite textos longos ou saudações exageradas. Vá direto ao ponto.
3. RESUMOS: Se o usuário te der um "Bom dia/Olá" ou perguntar "O que tenho pra hoje?", responda com um resumo curtíssimo das tarefas e gastos.
4. PROATIVIDADE: Use os dados para insights breves. Ex: "Gastou R$50 ontem. Tudo certo?".
5. LEMBRETES ATIVOS (PODER REAL): Você POSSUI um sistema de agendamento automático. Se ele pedir "Me lembre de X às 14h", salve como TASK e diga: "Agendado para as 14h. Te aviso! 🔔".
6. PERSISTÊNCIA: Nunca diga que "nada fica salvo". Use a ação "CHAT" para responder usando os dados acima.
7. Se o usuário for vago ao pedir um gasto ou tarefa, diga que já salvou e peça confirmação.
8. PROATIVIDADE EM LEMBRETES: Sempre que o usuário criar uma tarefa sem horário, pergunte: "Que horas quer que eu te lembre?".

RESPOSTA OBRIGATÓRIA EM JSON:
{
  "action": "(TASK | EXPENSE | NOTE | CHAT | QUERY | DONE)",
  "parsedData": {
     "title": "...", "due_date": "ISO8601", 
     "amount": 0.0, "description": "...", 
     "text": "...",
     "searchTerm": "...",
     "taskId": "..." 
  },
  "reply": "Sua resposta amigável e rica em contexto aqui."
}

INSTRUÇÃO DE CONTEXTO:
- Se a resposta para a pergunta (ex: lista recente, total rápido de 20 itens ou um lembrete específico) já estiver nos DADOS DO USUÁRIO acima, use a ação CHAT e responda diretamente.
- Use QUERY apenas se precisar buscar um item específico que NÃO está na lista acima ou se o usuário pedir o "Total Geral" de todo o histórico.`;

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
        console.log(`🤖 [DeepSeek] Status: ${upstream.status}`);
        
        if (!upstream.ok) {
           console.error("❌ Erro na DeepSeek API:", JSON.stringify(dsData));
           return end200(); // Encerra mas logou o erro
        }

        let rawContent = dsData.choices?.[0]?.message?.content || "{}";
        console.log(`🤖 [DeepSeek] Resposta Raw: ${rawContent.substring(0, 100)}...`);
        
        // Limpa possíveis marcações markdown que a IA cuspir "```json { ... } ```"
        rawContent = rawContent.replace(/```json/g, "").replace(/```/g, "").trim();


        let aiResponse;
        try {
           const jsonPart = rawContent.match(/\{[\s\S]*\}/)?.[0] || rawContent;
           aiResponse = JSON.parse(jsonPart);
        } catch(e) {
           console.error("Falha ao ler JSON da IA:", rawContent);
           aiResponse = { action: "CHAT", parsedData: {}, reply: "Entendi, mas meus circuitos falharam na organização disso. Pode falar novamente?" };
        }

        // Executa a Mágica Bancária de acordo com o Cérebro da IA
        const { action, parsedData } = aiResponse;
        console.log(`[${remoteJid}] Ação Identificada: ${action}`);
        
        try {
          if (action === "EXPENSE" && parsedData.amount && parsedData.description) {
            console.log(`[${remoteJid}] Salvando Gasto: R$${parsedData.amount}`);
            await prisma.expense.create({
              data: { user_id: user.id, amount: Number(parsedData.amount), description: parsedData.description }
            });
          } else if (action === "TASK" && parsedData.title) {
            console.log(`[${remoteJid}] Agendando Tarefa: ${parsedData.title}`);
            await prisma.task.create({
              data: { 
                user_id: user.id, 
                title: parsedData.title, 
                due_date: parsedData.due_date ? new Date(parsedData.due_date) : null 
              }
            });
          } else if (action === "NOTE" && parsedData.text) {
            console.log(`[${remoteJid}] Criando Nota`);
            await prisma.note.create({
              data: { user_id: user.id, content: parsedData.text }
            });
          } else if (action === "QUERY") {
            const searchTerm = (parsedData.searchTerm || parsedData.description || "").trim().toLowerCase();
            const isTotal = searchTerm.includes("total") || searchTerm.includes("soma") || searchTerm.includes("quanto");
            
            if (isTotal) {
              const expenses = await prisma.expense.findMany({ where: { user_id: user.id } });
              const total = expenses.reduce((s, e) => s + e.amount, 0);
              const tasks = await prisma.task.count({ where: { user_id: user.id, completed: false } });
              aiResponse.reply = `📊 *Resumo Geral:* \n\n*Total de Gastos:* R$ ${total.toFixed(2)}\n*Tarefas Pendentes:* ${tasks}\n\nAlgo mais que eu possa ajudar?`;
            } else {
              const isTaskSearch = searchTerm.includes("tarefa") || searchTerm.includes("lembrete") || searchTerm.includes("pendente") || searchTerm.includes("resumo");
              
              if (isTaskSearch) {
                 const tasks = await prisma.task.findMany({
                   where: { user_id: user.id, completed: false, title: { contains: searchTerm.replace(/tarefa|lembrete|pendente|resumo/g, "").trim(), mode: 'insensitive' } },
                   orderBy: { due_date: 'asc' }, take: 20
                 });
                 if (tasks.length > 0) {
                    aiResponse.reply = `✅ *Tarefas encontradas:*\n\n` + tasks.map(t => `• *${t.title}* ${t.due_date ? `(_${new Date(t.due_date).toLocaleString('pt-BR')}_)` : "(_Sem data_)"}`).join("\n");
                 } else {
                    aiResponse.reply = `Não encontrei nenhuma tarefa correspondente a "${searchTerm}". 🧐`;
                 }
              } else {
                 const expenses = await prisma.expense.findMany({
                   where: { user_id: user.id, description: { contains: searchTerm, mode: 'insensitive' } },
                   orderBy: { date: 'desc' }, take: 15
                 });
                 if (expenses.length > 0) {
                    aiResponse.reply = `✅ *Gastos encontrados:*\n\n` + expenses.map(e => `• *R$${e.amount.toFixed(2)}* - ${e.description} (_${e.date.toLocaleDateString('pt-BR')}_)`).join("\n");
                 } else {
                    // Fallback: busca na tabela de tarefas se não achou gastos
                    const fallbackTasks = await prisma.task.findMany({
                      where: { user_id: user.id, completed: false, title: { contains: searchTerm, mode: 'insensitive' } },
                      take: 5
                    });
                    if (fallbackTasks.length > 0) {
                      aiResponse.reply = `Não achei gastos, mas encontrei estas tarefas: \n` + fallbackTasks.map(t => `• *${t.title}* ${t.due_date ? `(_${new Date(t.due_date).toLocaleString('pt-BR')}_)` : ""}`).join("\n");
                    } else {
                      aiResponse.reply = `Não encontrei nenhum registro de gasto ou tarefa para "${searchTerm}". 🧐`;
                    }
                 }
              }
            }
          } else if (action === "DONE") {
            const search = parsedData.taskId || parsedData.title || "";
            console.log(`[${remoteJid}] Concluindo tarefa: ${search}`);
            
            // Busca a tarefa mais recente com esse nome se não houver ID
            const task = await prisma.task.findFirst({
              where: { 
                user_id: user.id, 
                completed: false,
                title: { contains: search, mode: 'insensitive' }
              },
              orderBy: { created_at: 'desc' }
            });

            if (task) {
              await prisma.task.update({
                where: { id: task.id },
                data: { completed: true }
              });
              aiResponse.reply = `✅ *Tarefa Concluída!* \n\nMarquei "${task.title}" como feita. Mandou bem! 🚀`;
            } else {
              // Tenta concluir TODAS se o usuário pediu especificamente (opcional, baseado no contexto)
              if (search.toLowerCase().includes("todas") || search.toLowerCase().includes("tudo")) {
                await prisma.task.updateMany({
                  where: { user_id: user.id, completed: false },
                  data: { completed: true }
                });
                aiResponse.reply = `✅ *Tudo limpo!* Concluí todas as suas tarefas pendentes de uma vez. 🎉`;
              } else {
                aiResponse.reply = `Não encontrei nenhuma tarefa pendente com o nome "${search}" para concluir. 🧐`;
              }
            }
          }
        } catch(dbErr) {
          console.error(`[${remoteJid}] Erro ao salvar no DB:`, dbErr);
        }

        // Salvo o histórico pra ele lembrar o que falou
        if (aiResponse.reply) {
          await prisma.message.create({ data: { user_id: user.id, role: "assistant", content: aiResponse.reply } });
        }

        // Dispara de Volta pelo Cânion da Evolution!
        const endpoint = `${EVO_URL.replace(/\/$/, "")}/message/sendText/${payload.instance}`;
        console.log(`[${remoteJid}] Enviando resposta via Evolution para: ${endpoint}`);
        
        try {
          const sendRes = await fetch(endpoint, {
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

          const sendResult = await sendRes.json();
          console.log(`[${remoteJid}] Resposta da Evolution API:`, JSON.stringify(sendResult));
        } catch (sendErr) {
          console.error(`[${remoteJid}] Erro ao ENVIAR mensagem via Evolution:`, sendErr);
        }

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
  console.log(`\n🚀 Assessor Nico Ativado na porta ${PORT}!`);
});
