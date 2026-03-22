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

Sua personalidade: Carismático, inteligente, prestativo e ADAPTÁVEL. Seu nome é *Assessor Nico*. Se o usuário for informal, use gírias leves; se for sério, seja formal. Seu objetivo é ser um mentor financeiro e um braço direito na organização pessoal.

REGRAS DE OURO:
1. APRESENTAÇÃO: Sempre que receber um "Oi", "Olá" ou for o primeiro contato do dia, apresente-se como *Assessor Nico* e dê uma mensagem de boas-vindas calorosa.
2. FORMATO: SEMPRE use apenas um asterisco para NEGRIRE: *texto*. Nunca use **.
3. ADAPTAÇÃO: Espelhe o tom do usuário. Seja um parceiro de conversa, não apenas um robô de comandos.
4. RESUMOS: Ao dar um resumo, não jogue apenas os dados. Dê um insight amigável. Ex: "Vi que você gastou R$50 hoje, mas suas tarefas estão em dia. Mandou bem! 💪".
5. CONCISÃO INTELIGENTE: Seja breve nos dados, mas rico na empatia. Não mande "textões", mas não seja seco.
6. LEMBRETES ATIVOS: Você tem o poder de agendar alertas reais. Mostre confiança nisso.
6. PERSISTÊNCIA: Nunca diga que "nada fica salvo". Use a ação "CHAT" para responder usando os dados acima.
7. Se o usuário for vago ao pedir um gasto ou tarefa, diga que já salvou e peça confirmação.
8. PROATIVIDADE EM LEMBRETES: Sempre que o usuário criar uma tarefa sem horário, pergunte: "Que horas quer que eu te lembre?".
9. COMANDOS VS TAREFAS: NUNCA crie uma TASK com títulos como "Concluir tarefas", "Limpar tudo" ou "Deletar". Se o usuário disser algo assim, use as ações DONE, DELETE ou CLEANUP.
10. TÍTULOS GENÉRICOS: Nunca crie uma tarefa chamada apenas "Tarefa" ou "Lembrete". Peça mais detalhes se necessário.
11. LIMPEZA: Se houver duplicatas ou o usuário pedir para organizar/limpar a lista, use obrigatoriamente a ação CLEANUP.

RESPOSTA OBRIGATÓRIA EM JSON:
{
  "actions": [ 
    { "action": "TASK|EXPENSE|NOTE|DONE|DELETE|CLEANUP", "parsedData": { ... } }
  ],
  "reply": "Sua resposta amigável aqui."
}
*Nota: Você pode enviar múltiplas ações no array se o usuário pedir várias coisas (ex: recorrência). Se for apenas uma coisa, mande apenas um objeto no array.*

INSTRUÇÃO DE CONTEXTO:
- Se a resposta para a pergunta já estiver nos DADOS DO USUÁRIO acima, use o array de ações vazio e responda no 'reply'.
- Use QUERY apenas se precisar buscar um item específico que NÃO está na lista acima.`;

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


        let aiResponse = null;
        try {
          // Robustez QA: Extrai o primeiro '{' até o último '}' para ignorar lixo textual ou Markdown
          const startIdx = rawContent.indexOf('{');
          const endIdx = rawContent.lastIndexOf('}');
          if (startIdx !== -1 && endIdx !== -1) {
            aiResponse = JSON.parse(rawContent.substring(startIdx, endIdx + 1));
          } else {
            throw new Error("JSON no formato esperado não encontrado.");
          }
        } catch(e) {
          console.error("❌ Falha no Parser de IA:", e.message, rawContent);
          aiResponse = { actions: [], reply: "Tive um soluço técnico aqui. Pode repetir o que queria fazer?" };
        }

        // Executa a Mágica Bancária de acordo com o Cérebro da IA
        const actions = aiResponse.actions || (aiResponse.action ? [aiResponse] : []);
        console.log(`[${remoteJid}] Processando ${actions.length} ações.`);

        let hasChange = false;
        let lastActionableData = {};

        for (const act of actions) {
          const { action, parsedData } = act;
          if (!action) continue;

          try {
            if (action === "EXPENSE") {
              // Validação de Valor: Remove vírgulas, espaços e garante que é um número positivo
              const rawAmount = String(parsedData.amount || "0").replace(',', '.').replace(/[^\d.]/g, '');
              const valor = parseFloat(rawAmount);
              
              if (!isNaN(valor) && valor > 0 && parsedData.description) {
                await prisma.expense.create({
                  data: { user_id: user.id, amount: valor, description: parsedData.description }
                });
                hasChange = true;
                lastActionableData = parsedData;
              }
            } else if (action === "TASK" && parsedData.title) {
              console.log(`[${remoteJid}] Analisando Tarefa: ${parsedData.title}`);
              
              const existingTask = await prisma.task.findFirst({
                where: { user_id: user.id, completed: false, title: { contains: parsedData.title, mode: 'insensitive' } }
              });

              if (existingTask) {
                await prisma.task.update({
                  where: { id: existingTask.id },
                  data: { due_date: parsedData.due_date ? new Date(parsedData.due_date) : existingTask.due_date }
                });
              } else {
                await prisma.task.create({
                  data: { user_id: user.id, title: parsedData.title, due_date: parsedData.due_date ? new Date(parsedData.due_date) : null }
                });
              }
              hasChange = true;
              lastActionableData = parsedData;
            } else if (action === "NOTE" && parsedData.text) {
              await prisma.note.create({ data: { user_id: user.id, content: parsedData.text } });
            } else if (action === "QUERY") {
              const searchTerm = (parsedData.searchTerm || parsedData.description || "").trim().toLowerCase();
              const isTotal = searchTerm.includes("total") || searchTerm.includes("soma") || searchTerm.includes("quanto");
              
              if (isTotal) {
                const expenses = await prisma.expense.findMany({ where: { user_id: user.id } });
                const total = expenses.reduce((s, e) => s + e.amount, 0);
                const tasks = await prisma.task.count({ where: { user_id: user.id, completed: false } });
                aiResponse.reply = `📊 *Resumo Geral:* \n\n*Total de Gastos:* R$ ${total.toFixed(2)}\n*Tarefas Pendentes:* ${tasks}\n\nAlgo mais?`;
              } else {
                const isTaskSearch = searchTerm.includes("tarefa") || searchTerm.includes("lembrete") || searchTerm.includes("pendente") || searchTerm.includes("resumo");
                if (isTaskSearch) {
                   const tasks = await prisma.task.findMany({
                     where: { user_id: user.id, completed: false, title: { contains: searchTerm.replace(/tarefa|lembrete|pendente|resumo/g, "").trim(), mode: 'insensitive' } },
                     orderBy: { due_date: 'asc' }, take: 20
                   });
                   if (tasks.length > 0) aiResponse.reply = `✅ *Tarefas:*\n` + tasks.map(t => `• *${t.title}* ${t.due_date ? `(_${new Date(t.due_date).toLocaleString('pt-BR')}_)` : ""}`).join("\n");
                } else {
                   const expenses = await prisma.expense.findMany({
                     where: { user_id: user.id, description: { contains: searchTerm, mode: 'insensitive' } },
                     orderBy: { date: 'desc' }, take: 15
                   });
                   if (expenses.length > 0) aiResponse.reply = `✅ *Gastos:*\n` + expenses.map(e => `• *R$${e.amount.toFixed(2)}* - ${e.description}`).join("\n");
                }
              }
              hasChange = true;
              lastActionableData = parsedData;
            } else if (action === "DONE") {
              const search = parsedData.taskId || parsedData.title || "";
              const task = await prisma.task.findFirst({
                where: { user_id: user.id, completed: false, title: { contains: search, mode: 'insensitive' } },
                orderBy: { created_at: 'desc' }
              });
              if (task) {
                await prisma.task.update({ where: { id: task.id }, data: { completed: true } });
                aiResponse.reply = `✅ *Tarefa Concluída: ${task.title}*`;
              }
              hasChange = true;
            } else if (action === "CLEANUP") {
              const tasks = await prisma.task.findMany({ where: { user_id: user.id, completed: false }, orderBy: { created_at: 'desc' } });
              const seenTitles = new Set();
              let removedCount = 0;
              for (const t of tasks) {
                const nt = t.title.toLowerCase().trim();
                if (seenTitles.has(nt)) { await prisma.task.delete({ where: { id: t.id } }); removedCount++; } else { seenTitles.add(nt); }
              }
              aiResponse.reply = `✨ *Limpeza concluída!* Removidos ${removedCount} itens.`;
            } else if (action === "DELETE") {
              const search = parsedData.title || parsedData.searchTerm || "";
              const dt = await prisma.task.deleteMany({ where: { user_id: user.id, title: { contains: search, mode: 'insensitive' } } });
              const de = await prisma.expense.deleteMany({ where: { user_id: user.id, description: { contains: search, mode: 'insensitive' } } });
              aiResponse.reply = `🗑️ *Removido:* ${dt.count + de.count} itens de "${search}".`;
              hasChange = true;
            }
          } catch(dbErr) { 
            console.error(`[${remoteJid}] ❌ Erro na ação:`, dbErr.message); 
          }
        }

        // --- Garantia de Resposta QA ---
        if (!aiResponse.reply && actions.length > 0) {
          aiResponse.reply = "Tudo pronto! Ação executada com sucesso. ✅";
        }

        // Salvo o histórico pra ele lembrar o que falou
        if (aiResponse.reply) {
          await prisma.message.create({ data: { user_id: user.id, role: "assistant", content: aiResponse.reply } });
        }

        // Dispara de Volta pelo Cânion da Evolution!
        let endpoint = `${EVO_URL.replace(/\/$/, "")}/message/${hasChange ? 'sendButtons' : 'sendText'}/${payload.instance}`;
        let bodyPayload = { number: remoteJid, text: aiResponse.reply || "Feito! ✅" };

        if (hasChange) {
          const itemTitle = lastActionableData.title || lastActionableData.description || lastActionableData.searchTerm || "";
          bodyPayload.buttons = [
            { "type": "reply", "displayText": "✏️ Editar", "id": `Editar ${itemTitle}` },
            { "type": "reply", "displayText": "🗑️ Excluir", "id": `Excluir ${itemTitle}` }
          ];
          bodyPayload.footer = "Assessor Nico • FIn";
        }

        // --- Envio para Evolution com Timeout de Segurança (QA Approved) ---
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s de limite

        try {
          const sendRes = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": EVO_KEY
            },
            body: JSON.stringify(bodyPayload),
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (!sendRes.ok) {
            const errData = await sendRes.json().catch(() => ({}));
            console.log(`[${remoteJid}] Erro Evolution API (${sendRes.status}):`, JSON.stringify(errData));
          }
        } catch (sendErr) {
          if (sendErr.name === 'AbortError') {
            console.error(`[${remoteJid}] Timeout ao enviar para Evolution.`);
          } else {
            console.error(`[${remoteJid}] Falha de rede/Evolution:`, sendErr.message);
          }
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
