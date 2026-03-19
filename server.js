// server.js — servidor local para testar a demo
// Execute: node server.js
// Depois abra: http://localhost:3000

import http from "http";
import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dir   = path.dirname(fileURLToPath(import.meta.url));
const PORT    = process.env.PORT || 3000;
const EVO_URL = process.env.EVOLUTION_API_URL || "http://127.0.0.1:8080";
const EVO_KEY = process.env.EVOLUTION_API_KEY || "FInAgentAPISecretKey_2026";

// ── Coloque sua chave DeepSeek aqui ──────────────────────────
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "SUA_CHAVE_AQUI";
// ─────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  // ── Proxy para DeepSeek ──────────────────────────────────
  if (req.method === "POST" && req.url === "/api/chat") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body);
        const upstream = await fetch("https://api.deepseek.com/v1/chat/completions", {
          method:  "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
          },
          body: JSON.stringify(payload),
        });
        const data  = await upstream.json();
        if (data.error) {
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: data.error }));
        }
        const text  = data.choices?.[0]?.message?.content || "";
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ content: [{ text }] }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // ── Webhook Evolution API ──────────────────────────────
  if (req.method === "POST" && req.url === "/webhook/evolution") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      // Helper handler
      const end200 = () => { res.writeHead(200); return res.end(); };
      try {
        const payload = JSON.parse(body);
        
        // Verifica se é evento de nova mensagem
        if (payload.event !== "messages.upsert") return end200();

        // Extrai as variáveis de forma resiliente
        const dataKey = payload.data?.key || payload.data?.message?.key || {};
        const remoteJid = dataKey.remoteJid || "";
        const fromMe = dataKey.fromMe || false;

        // Se a mensagem foi enviada por mim ou for de grupo, ignora
        if (fromMe || typeof remoteJid !== "string" || remoteJid.includes("@g.us")) return end200();
        
        const msgNode = payload.data?.message || payload.data;
        const msgText = msgNode.conversation || msgNode.extendedTextMessage?.text || msgNode.imageMessage?.caption || "";
        
        if (!msgText.trim()) return end200(); // não faz nada se for imagem sem legenda/audio

        // Monta chamada para DeepSeek
        const dsPayload = {
          model: "deepseek-chat",
          messages: [
            { role: "system", "content": "Você é o FIn, um Agente de Finanças virtual. Responda as dúvidas de forma concisa e amigável usando formatação do WhatsApp (*negrito*, _itálico_)." },
            { role: "user", "content": msgText }
          ]
        };

        const upstream = await fetch("https://api.deepseek.com/v1/chat/completions", {
          method:  "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
          },
          body: JSON.stringify(dsPayload),
        });

        const dsData = await upstream.json();
        const replyText = dsData.choices?.[0]?.message?.content || "Desculpe, tive um problema ao tentar processar sua mensagem. 💸";

        // Chama a Evolution API para responder a mensagem
        // Usamos EVOLUTION_API_URL para suportar a rede interna do Easypanel
        const endpoint = `${EVO_URL}/message/sendText/${payload.instance}`;
        await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": EVO_KEY
          },
          // Envando direto pro JID original
          body: JSON.stringify({
            number: remoteJid,
            text: replyText
          })
        });

        return end200();
      } catch (err) {
        console.error("Erro no Webhook Evolution:", err);
        return res.writeHead(200), res.end();
      }
    });
    return;
  }

  // ── Serve arquivos estáticos ─────────────────────────────
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
  console.log(`\n🚀 Servidor rodando!`);
  console.log(`👉 Abra no navegador: http://localhost:${PORT}\n`);
  if (DEEPSEEK_API_KEY === "SUA_CHAVE_AQUI") {
    console.log(`⚠️  Lembre de colocar sua chave DeepSeek no arquivo server.js`);
    console.log(`   Ou rode: DEEPSEEK_API_KEY=sk-... node server.js\n`);
  }
});
