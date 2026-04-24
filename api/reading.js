const { buildSystemPrompt, buildUserMessage } = require("./_prompts.js");

const ALLOWED_MODES = new Set(["reading", "advice", "anchor"]);

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.DEEPSEEK_API_KEY_back;
  if (!apiKey) {
    res.status(500).json({ error: "Server missing DEEPSEEK_API_KEY_back env var" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const mode = ALLOWED_MODES.has(body.mode) ? body.mode : "reading";
  const language = body.language === "zh" ? "zh" : "en";
  const cardName = typeof body.cardName === "string" ? body.cardName.trim() : "";
  const orientation = body.orientation === "reversed" ? "reversed" : "upright";

  if (!cardName) {
    res.status(400).json({ error: "Missing cardName" });
    return;
  }

  const intent = typeof body.intent === "string" ? body.intent : "";
  const question = typeof body.question === "string" ? body.question : "";
  const round = Number.isFinite(Number(body.round)) ? Number(body.round) : 1;
  const sessionHistory = typeof body.sessionHistory === "string" ? body.sessionHistory : "";
  const sessionSummary = typeof body.sessionSummary === "string" ? body.sessionSummary : "";

  const systemPrompt = buildSystemPrompt({ language, mode });
  const userContent = buildUserMessage({
    mode, cardName, orientation, intent, question, round,
    sessionHistory, sessionSummary, language,
  });

  try {
    const upstream = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const msg = (data && data.error && data.error.message) || upstream.statusText || "Upstream error";
      res.status(upstream.status).json({ error: msg });
      return;
    }

    const text =
      data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text || !String(text).trim()) {
      res.status(502).json({ error: "Empty model response" });
      return;
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json({ text: String(text).trim() });
  } catch (err) {
    res.status(502).json({ error: (err && err.message) || "Failed to reach DeepSeek" });
  }
};
