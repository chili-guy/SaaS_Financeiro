// api/chat.js — proxy serverless para a DeepSeek API
// A chave fica segura como variável de ambiente no Vercel (DEEPSEEK_API_KEY)

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  try {
    // DeepSeek usa a mesma interface do OpenAI
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model:       "deepseek-chat",
        max_tokens:  512,
        messages:    req.body.messages, // já vêm no formato correto
      }),
    });

    const data = await response.json();
    // Normaliza para o mesmo formato que o frontend espera
    const text = data.choices?.[0]?.message?.content || "";
    return res.status(response.status).json({ content: [{ text }] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
