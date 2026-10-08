/**
 * Penly AI Proxy Worker
 * Deploy lên Cloudflare Workers
 *
 * Bindings cần setup trong Cloudflare dashboard:
 *   PENLY_KEYS     — KV namespace (lưu Penly key hash → { name, geminiKey, active, created })
 *   AI             — Workers AI binding (fallback khi tất cả hết quota)
 *
 * Secrets (wrangler secret put):
 *   ADMIN_PASSWORD  — mật khẩu bảo vệ trang admin
 *   OPENROUTER_KEY  — OpenRouter API key (shared fallback)
 *
 * Provider chain per request:
 *   1. Gemini (user's geminiKey) — 1M tokens/day free, stable -latest aliases
 *   2. OpenRouter free models (shared OPENROUTER_KEY)
 *   3. Cloudflare Workers AI (shared, last resort)
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// Route Gemini through Cloudflare AI Gateway to bypass geo-restrictions
// Requires CF_AIG_TOKEN secret (wrangler secret put CF_AIG_TOKEN)
const GEMINI_URL_KEY = (model, key) =>
  `https://gateway.ai.cloudflare.com/v1/a4a250a3862b08a270c13b231bbc8a56/penly-gateway/google-ai-studio/v1beta/models/${model}:generateContent?key=${key}`;
const GEMINI_URL_BEARER = (model) =>
  `https://gateway.ai.cloudflare.com/v1/a4a250a3862b08a270c13b231bbc8a56/penly-gateway/google-ai-studio/v1beta/models/${model}:generateContent`;

// "gemini-flash-latest" is Google's official stable alias — auto-updated on every new release
const GEMINI_MODELS = [
  "gemini-flash-latest",
  "gemini-3.8-flash",   // explicit fallback if alias fails
];

// OpenRouter free models — updated Oct 2026
const OR_MODELS = [
  "google/gemma-4-27b-it:free",
  "google/gemma-4-31b:free",
  "nvidia/llama-3.3-nemotron-super-49b-v1:free",
  "meta-llama/llama-3.3-70b-instruct:free",
];

const CF_AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
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
      "Access-Control-Allow-Methods": "GET, POST, DELETE, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Admin-Password",
    },
  });
}

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

  const path = url.pathname;

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

  if (request.method === "POST" && path === "/admin/keys") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

    const { name, geminiKey } = body;
    if (!name) return json({ error: "name required" }, 400);

    const penlyKey = genPenlyKey();
    const hash = await sha256(penlyKey.trim().toUpperCase());

    await env.PENLY_KEYS.put(hash, JSON.stringify({
      name, geminiKey: geminiKey || '', active: true,
      created: new Date().toISOString(),
      penlyKey,
    }));

    return json({ penlyKey, hash, name });
  }

  const delMatch = path.match(/^\/admin\/keys\/([a-f0-9]{64})$/);
  if (request.method === "DELETE" && delMatch) {
    await env.PENLY_KEYS.delete(delMatch[1]);
    return json({ ok: true });
  }

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
    if (body.geminiKey !== undefined) val.geminiKey = body.geminiKey;
    await env.PENLY_KEYS.put(hash, JSON.stringify(val));
    return json({ ok: true, active: val.active });
  }

  return json({ error: "Not found" }, 404);
}

// ── Gemini (user's own key — 1M tokens/day free) ────────────────────────────
async function callGemini(geminiKey, prompt, temperature, max_tokens, aigToken) {
  if (!geminiKey || geminiKey.length < 20) return null;

  // AQ... keys use Bearer auth; AIza... keys use ?key= param
  const usesBearer = geminiKey.startsWith('AQ');

  for (const model of GEMINI_MODELS) {
    try {
      const url = usesBearer ? GEMINI_URL_BEARER(model) : GEMINI_URL_KEY(model, geminiKey);
      const headers = { "Content-Type": "application/json" };
      if (aigToken) headers["cf-aig-authorization"] = `Bearer ${aigToken}`;
      if (usesBearer) headers["Authorization"] = `Bearer ${geminiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: temperature ?? 0.7,
            maxOutputTokens: max_tokens ?? 2000,
          },
        }),
      });
      const data = await res.json();
      console.info(`[gemini] ${model} status=${res.status} error=${JSON.stringify(data.error?.message || null)}`);
      if (res.status === 429 || res.status === 503) continue;
      if (data.error) {
        const code = data.error?.code;
        if (code === 429 || code === 503) continue;
        console.info(`[gemini] ${model} fatal error ${code}: ${data.error?.message?.slice(0, 100)}`);
        return null;
      }
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (content) return { content, gemini_model: model };
    } catch (e) {
      console.info(`[gemini] ${model} exception: ${e.message}`);
    }
  }
  return null;
}

// ── OpenRouter fallback (shared key) ────────────────────────────────────────
async function callOpenRouter(env, prompt, temperature, max_tokens) {
  if (!env.OPENROUTER_KEY) { console.info('[or] no OPENROUTER_KEY'); return null; }

  for (const model of OR_MODELS) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.OPENROUTER_KEY}`,
          "HTTP-Referer": "https://nqh2610.github.io/penly",
          "X-Title": "Penly",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: temperature ?? 0.7,
          max_tokens: max_tokens ?? 2000,
        }),
      });
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      console.info(`[or] ${model} status=${res.status} ok=${!!content}`);
      if (content) return { content, or_model: model };
    } catch (e) {
      console.info(`[or] ${model} exception: ${e.message}`);
    }
  }
  return null;
}

// ── Shared fallback: Gemini (no user key) → OpenRouter → Cloudflare AI ──────
async function callFallbackChain(env, prompt, temperature, max_tokens) {
  // OpenRouter (shared key)
  const orResult = await callOpenRouter(env, prompt, temperature, max_tokens);
  if (orResult) return { ...orResult, cf_fallback: true };

  // Cloudflare AI (last resort)
  try {
    const result = await env.AI.run(CF_AI_MODEL, {
      messages: [{ role: "user", content: prompt }],
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens ?? 3000,
    });
    const content = result?.response || result?.choices?.[0]?.message?.content;
    if (content) return { content, cf_fallback: true };
  } catch (e) {
    console.info(`[cf-ai] failed: ${e.message}`);
  }
  return null;
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return cors();

    const url = new URL(request.url);

    // Dictionary proxy endpoint
    if (url.pathname === "/dict" && request.method === "GET") {
      const word = url.searchParams.get("word");
      if (!word) return json({ error: "word required" }, 400);
      try {
        const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
        const data = await res.json();
        return json(data, res.status);
      } catch (e) {
        return json({ error: "Dictionary API failed" }, 502);
      }
    }

    // Audio proxy
    if (url.pathname === "/audio" && request.method === "GET") {
      const src = url.searchParams.get("src");
      if (!src || !src.startsWith("https://api.dictionaryapi.dev/")) {
        return new Response("Invalid audio source", { status: 400 });
      }
      try {
        const res = await fetch(src);
        return new Response(res.body, {
          status: res.status,
          headers: {
            "Content-Type": res.headers.get("Content-Type") || "audio/mpeg",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=86400",
          },
        });
      } catch (e) {
        return new Response("Audio fetch failed", { status: 502 });
      }
    }

    if (url.pathname.startsWith("/admin/")) {
      return handleAdmin(request, env, url);
    }

    // ── /validate — check if a Penly key exists and is active ──
    if (url.pathname === "/validate" && request.method === "GET") {
      const key = url.searchParams.get("key");
      if (!key || !/^PENLY-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key.trim().toUpperCase())) {
        return json({ valid: false, reason: "invalid_format" });
      }
      const hash = await sha256(key.trim().toUpperCase());
      const entry = await env.PENLY_KEYS.get(hash, "json");
      if (!entry) return json({ valid: false, reason: "not_found" });
      if (!entry.active) return json({ valid: false, reason: "disabled" });
      return json({ valid: true });
    }

    // ── /cf-ai — fallback endpoint (Gemini → OpenRouter → Cloudflare AI) ──
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

      // Try user's Gemini key first (highest free quota)
      if (entry.geminiKey) {
        const gemResult = await callGemini(entry.geminiKey, prompt, temperature, max_tokens, env.CF_AIG_TOKEN);
        if (gemResult) return json({ ...gemResult, cf_fallback: true });
      }

      // Then shared fallback chain
      const result = await callFallbackChain(env, prompt, temperature, max_tokens);
      if (result) return json(result);

      return json({ error: "All fallback providers exhausted" }, 502);
    }

    // ── Main POST — Groq primary ──────────────────────────────────────────
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

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

    // Primary: Gemini (user's own key — 1M tokens/day free)
    if (entry.geminiKey) {
      console.info(`[main] trying Gemini, key length=${entry.geminiKey.length}`);
      const gemResult = await callGemini(entry.geminiKey, prompt, temperature, max_tokens, env.CF_AIG_TOKEN);
      if (gemResult) return json(gemResult);
      console.info('[main] Gemini exhausted, trying fallback');
    } else {
      console.info('[main] no geminiKey in entry, skipping Gemini');
    }

    // Fallback chain: OpenRouter → Cloudflare AI
    const result = await callFallbackChain(env, prompt, temperature, max_tokens);
    if (result) return json(result);

    console.info('[main] all providers exhausted');
    return json({ error: "All AI providers exhausted", rate_limited: true }, 502);
  },
};
