import { buildSystemPrompt, buildUserMessage } from "./_prompts.js";

const ALLOWED_MODES = new Set(["reading", "advice", "anchor"]);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", Allow: "POST", ...CORS },
    });
  }

  const apiKey = env.DEEPSEEK_API_KEY_back;
  if (!apiKey) {
    return json(500, { error: "Server missing DEEPSEEK_API_KEY_back env var" });
  }

  let body = {};
  try { body = await request.json(); } catch { body = {}; }
  body = body || {};

  const mode = ALLOWED_MODES.has(body.mode) ? body.mode : "reading";
  const language = body.language === "zh" ? "zh" : "en";
  const cardName = typeof body.cardName === "string" ? body.cardName.trim() : "";
  const orientation = body.orientation === "reversed" ? "reversed" : "upright";

  if (!cardName) return json(400, { error: "Missing cardName" });

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
      return json(upstream.status, { error: msg });
    }

    const text =
      data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text || !String(text).trim()) {
      return json(502, { error: "Empty model response" });
    }

    return json(200, { text: String(text).trim() });
  } catch (err) {
    return json(502, { error: (err && err.message) || "Failed to reach DeepSeek" });
  }
}
