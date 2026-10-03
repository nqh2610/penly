/**
 * Penly AI Proxy Worker
 * Deploy lên Cloudflare Workers
 *
 * Bindings cần setup trong Cloudflare dashboard:
 *   PENLY_KEYS  — KV namespace (lưu Penly key hash → { name, groqKey, active, created })
 *   AI          — Workers AI binding (fallback khi Groq hết quota)
 *
 * Environment variables:
 *   ADMIN_PASSWORD  — mật khẩu bảo vệ trang admin
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const ALLOWED_MODELS = new Set([
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "qwen/qwen3-8b",
  "llama-3.1-8b-instant",
]);
const GROQ_MODEL_PRIMARY = "openai/gpt-oss-120b";
const CF_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const ALLOWED_ORIGIN = "*";

async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    },
  });
}

function cors() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Admin-Password",
    },
  });
}

// generate a random Penly key: PENLY-XXXX-XXXX-XXXX
function genPenlyKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `PENLY-${seg()}-${seg()}-${seg()}`;
}

// ── Admin auth ──────────────────────────────────────────────────────────────
async function checkAdmin(request, env) {
  const pw = request.headers.get("X-Admin-Password");
  if (!pw || pw !== env.ADMIN_PASSWORD) return false;
  return true;
}

// ── Admin handlers ──────────────────────────────────────────────────────────
async function handleAdmin(request, env, url) {
  if (!(await checkAdmin(request, env))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const path = url.pathname; // /admin/keys, /admin/keys/{hash}

  // GET /admin/keys — list all keys
  if (request.method === "GET" && path === "/admin/keys") {
    const list = await env.PENLY_KEYS.list();
    const keys = await Promise.all(
      list.keys.map(async (k) => {
        const val = await env.PENLY_KEYS.get(k.name, "json");
        return { hash: k.name, ...val };
      })
    );
    return json({ keys });
  }

  // POST /admin/keys — create new key
  if (request.method === "POST" && path === "/admin/keys") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

    const { name, groqKey } = body;
    if (!name || !groqKey) return json({ error: "name and groqKey required" }, 400);

    const penlyKey = genPenlyKey();
    const hash = await sha256(penlyKey.trim().toUpperCase());

    await env.PENLY_KEYS.put(hash, JSON.stringify({
      name,
      groqKey,
      active: true,
      created: new Date().toISOString(),
      penlyKey, // lưu để admin có thể xem lại
    }));

    return json({ penlyKey, hash, name });
  }

  // DELETE /admin/keys/{hash} — delete key
  const delMatch = path.match(/^\/admin\/keys\/([a-f0-9]{64})$/);
  if (request.method === "DELETE" && delMatch) {
    await env.PENLY_KEYS.delete(delMatch[1]);
    return json({ ok: true });
  }

  // PATCH /admin/keys/{hash} — update active, name, groqKey
  const patchMatch = path.match(/^\/admin\/keys\/([a-f0-9]{64})$/);
  if (request.method === "PATCH" && patchMatch) {
    const hash = patchMatch[1];
    const val = await env.PENLY_KEYS.get(hash, "json");
    if (!val) return json({ error: "Key not found" }, 404);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (body.active !== undefined) val.active = body.active;
    if (body.name) val.name = body.name;
    if (body.groqKey) val.groqKey = body.groqKey;
    await env.PENLY_KEYS.put(hash, JSON.stringify(val));
    return json({ ok: true, active: val.active });
  }

  return json({ error: "Not found" }, 404);
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return cors();

    const url = new URL(request.url);

    // admin routes
    if (url.pathname.startsWith("/admin/")) {
      return handleAdmin(request, env, url);
    }

    // Cloudflare AI fallback endpoint
    if (url.pathname === "/cf-ai" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

      const { penly_key, prompt, temperature, max_tokens } = body;

      if (!penly_key || !/^PENLY-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(penly_key.trim().toUpperCase())) {
        return json({ error: "Invalid license key format" }, 401);
      }

      const hash = await sha256(penly_key.trim().toUpperCase());
      const entry = await env.PENLY_KEYS.get(hash, "json");
      if (!entry) return json({ error: "License key not found or inactive" }, 401);
      if (!entry.active) return json({ error: "License key is disabled" }, 401);

      try {
        const result = await env.AI.run(CF_AI_MODEL, {
          messages: [{ role: "user", content: prompt }],
          temperature: temperature ?? 0.7,
          max_tokens: max_tokens ?? 3000,
        });
        const content = result?.response || result?.choices?.[0]?.message?.content;
        if (content) return json({ content, cf_fallback: true });
        return json({ error: "Cloudflare AI returned no content" }, 502);
      } catch (e) {
        return json({ error: "Cloudflare AI failed: " + e.message }, 502);
      }
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

    const { penly_key, prompt, temperature, max_tokens, model } = body;

    // validate key format
    if (!penly_key || !/^PENLY-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(penly_key.trim().toUpperCase())) {
      return json({ error: "Invalid license key format" }, 401);
    }

    const hash = await sha256(penly_key.trim().toUpperCase());
    const entry = await env.PENLY_KEYS.get(hash, "json");

    if (!entry) return json({ error: "License key not found or inactive" }, 401);
    if (!entry.active) return json({ error: "License key is disabled" }, 401);
    if (!entry.groqKey) return json({ error: "Server misconfigured" }, 500);

    const chosenModel = (model && ALLOWED_MODELS.has(model)) ? model : GROQ_MODEL_PRIMARY;

    try {
      const groqRes = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${entry.groqKey}`,
        },
        body: JSON.stringify({
          model: chosenModel,
          messages: [{ role: "user", content: prompt }],
          temperature: temperature ?? 0.7,
          max_tokens: max_tokens ?? 3000,
        }),
      });

      const data = await groqRes.json();

      if (data.choices?.[0]?.message?.content) {
        return json({ content: data.choices[0].message.content });
      }

      const errMsg = data.error?.message || "Unknown error from AI";
      const shouldFallback = groqRes.status === 429
        || groqRes.status === 404
        || errMsg.toLowerCase().includes("rate limit")
        || errMsg.toLowerCase().includes("does not exist")
        || errMsg.toLowerCase().includes("not found")
        || errMsg.toLowerCase().includes("do not have access")
        || errMsg.toLowerCase().includes("model_not_found");

      return json({ error: errMsg, rate_limited: shouldFallback }, 502);

    } catch (e) {
      return json({ error: "Failed to reach AI service" }, 502);
    }
  },
};
