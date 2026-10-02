/**
 * Penly AI Proxy Worker
 * Deploy lên Cloudflare Workers
 *
 * Environment variables cần set trong Cloudflare dashboard:
 *   KEY_MAP  — JSON string: { "PENLY_KEY_HASH": "gsk_groq_key_here", ... }
 *
 * Ví dụ KEY_MAP:
 *   {
 *     "03d42c4928fe18f219e078fa312722770814d911c27227a7aa9013f680b8c152": "gsk_abc123...",
 *     "e56616fdd4acdfe4b3b68fa6dc00b4b80f22ba88b2c250294e8b6f931ebd306f": "gsk_def456..."
 *   }
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-120b";
const ALLOWED_ORIGIN = "*"; // hoặc đổi thành domain của bạn: "https://nqh2610.github.io"

async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const { penly_key, prompt, temperature, max_tokens } = body;

    // validate penly_key format
    if (!penly_key || !/^PENLY-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(penly_key.trim().toUpperCase())) {
      return json({ error: "Invalid license key format" }, 401);
    }

    // hash the key and look up Groq key
    const hash = await sha256(penly_key.trim().toUpperCase());

    let keyMap;
    try {
      keyMap = JSON.parse(env.KEY_MAP || "{}");
    } catch {
      return json({ error: "Server misconfigured" }, 500);
    }

    const groqKey = keyMap[hash];
    if (!groqKey) {
      return json({ error: "License key not found or inactive" }, 401);
    }

    // forward to Groq
    try {
      const groqRes = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [{ role: "user", content: prompt }],
          temperature: temperature ?? 0.7,
          max_tokens: max_tokens ?? 3000,
        }),
      });

      const data = await groqRes.json();

      // only forward the content, not the full Groq response (hides model details)
      if (data.choices?.[0]?.message?.content) {
        return json({ content: data.choices[0].message.content });
      }

      const errMsg = data.error?.message || "Unknown error from AI";
      return json({ error: errMsg }, 502);

    } catch (e) {
      return json({ error: "Failed to reach AI service" }, 502);
    }
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    },
  });
}
