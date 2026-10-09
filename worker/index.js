/**
 * Penly AI Proxy Worker
 *
 * Bindings:
 *   PENLY_KEYS     — KV namespace
 *   AI             — Workers AI binding (last resort)
 *
 * Secrets:
 *   ADMIN_PASSWORD  — admin password
 *   GROQ_KEY        — Groq API key (fallback)
 *   OPENROUTER_KEY  — OpenRouter API key (last resort)
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Priority score for known model families — higher = try first
// Unknown models get score 0 and are tried last
const GROQ_MODEL_PRIORITY = {
  "gpt-oss-120b": 100,
  "llama-3.3-70b": 90,
  "llama-3.1-70b": 80,
  "llama-4-maverick": 75,
  "llama-4-scout": 70,
  "llama-3.3": 65,
  "llama-3.1": 60,
  "llama3-70b": 55,
  "gpt-oss-20b": 50,
  "llama-3.2": 45,
  "llama3-8b": 30,
  "llama-3.1-8b": 25,
  "gemma": 20,
  "qwen": 15,
  "mistral": 10,
};

function groqModelScore(id) {
  const lower = id.toLowerCase();
  for (const [key, score] of Object.entries(GROQ_MODEL_PRIORITY)) {
    if (lower.includes(key)) return score;
  }
  return 0;
}

// In-memory cache of sorted Groq models (refreshed per worker instance)
let _groqModelCache = null;

async function getGroqModels(groqKey) {
  if (_groqModelCache) return _groqModelCache;
  try {
    const res = await fetch(GROQ_MODELS_URL, {
      headers: { "Authorization": `Bearer ${groqKey}` },
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    const ids = (data.data || [])
      .filter(m => m.object === 'model' && !m.id.includes('whisper') && !m.id.includes('vision') && !m.id.includes('guard') && !m.id.includes('tool'))
      .map(m => m.id)
      .sort((a, b) => groqModelScore(b) - groqModelScore(a));
    console.info(`[groq] discovered ${ids.length} models: ${ids.slice(0,5).join(', ')}...`);
    _groqModelCache = ids.length ? ids : null;
    return _groqModelCache;
  } catch (e) {
    console.info(`[groq] model discovery failed: ${e.message}`);
    return null;
  }
}

// OpenRouter free models — last resort
const OR_MODELS = [
  "google/gemma-4-26b-a4b-it:free",
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-ultra:free",
  "cohere/north-mini-code:free",
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

async function checkAdmin(request, env) {
  const pw = request.headers.get("X-Admin-Password");
  if (!pw || pw !== env.ADMIN_PASSWORD) return false;
  return true;
}

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

    const { name } = body;
    if (!name) return json({ error: "name required" }, 400);

    const penlyKey = genPenlyKey();
    const hash = await sha256(penlyKey.trim().toUpperCase());

    await env.PENLY_KEYS.put(hash, JSON.stringify({
      name, active: true,
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
    await env.PENLY_KEYS.put(hash, JSON.stringify(val));
    return json({ ok: true, active: val.active });
  }

  return json({ error: "Not found" }, 404);
}

async function callGroq(env, prompt, temperature, max_tokens) {
  if (!env.GROQ_KEY) { console.info('[groq] no GROQ_KEY'); return null; }

  const models = await getGroqModels(env.GROQ_KEY);
  if (!models || !models.length) { console.info('[groq] no models available'); return null; }

  let lastDebug = null;
  for (const model of models) {
    try {
      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.GROQ_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: temperature ?? 0.7,
          max_tokens: max_tokens ?? 3000,
        }),
      });
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      lastDebug = `${model} status=${res.status} body=${JSON.stringify(data).slice(0,150)}`;
      console.info(`[groq] ${lastDebug}`);
      if (content) return { content, groq_model: model };
      // 429 = rate limit, 404/model not found — try next model
      if (res.status !== 429 && res.status !== 404 && !data.error?.message?.includes('does not exist')) {
        return { _err: data.error?.message || `status ${res.status}`, _debug: lastDebug };
      }
    } catch (e) {
      console.info(`[groq] ${model} exception: ${e.message}`);
      return { _err: e.message };
    }
  }
  return lastDebug ? { _debug: lastDebug } : null;
}

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

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return cors();

    const url = new URL(request.url);

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

    // Cloudflare AI (primary — fast)
    let cfErr = null;
    try {
      const result = await env.AI.run(CF_AI_MODEL, {
        messages: [{ role: "user", content: prompt }],
        temperature: temperature ?? 0.7,
        max_tokens: max_tokens ?? 3000,
      });
      const content = result?.response || result?.choices?.[0]?.message?.content;
      if (content) return json({ content, cf_fallback: true });
      cfErr = 'no content';
    } catch (e) {
      cfErr = e.message;
      console.info(`[cf-ai] failed: ${e.message}`);
    }

    // Groq (fallback — high quality)
    const groqResult = await callGroq(env, prompt, temperature, max_tokens);
    if (groqResult?.content) return json(groqResult);
    const groqErr = groqResult?._err || groqResult?._debug || null;

    // OpenRouter (last resort)
    const orResult = await callOpenRouter(env, prompt, temperature, max_tokens);
    if (orResult) return json(orResult);

    return json({ error: "All AI providers exhausted", cf_error: cfErr, groq_error: groqErr, rate_limited: true }, 502);
  },
};
