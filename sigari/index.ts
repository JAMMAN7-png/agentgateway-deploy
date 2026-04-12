import { Hono } from "hono";
import { cors } from "hono/cors";

// ── Circuit Breaker ─────────────────────────────────────────
const FAILURE_THRESHOLD = 3;
const RECOVERY_MS = 60_000;
type CBState = "closed" | "open" | "half_open";
interface Circuit { state: CBState; failures: number; lastFailure: number }
const circuits = new Map<string, Circuit>();

function getCB(name: string): Circuit {
  let c = circuits.get(name);
  if (!c) { c = { state: "closed", failures: 0, lastFailure: 0 }; circuits.set(name, c); }
  return c;
}
function cbAvailable(name: string): boolean {
  const c = getCB(name);
  if (c.state === "closed") return true;
  if (c.state === "open" && Date.now() - c.lastFailure > RECOVERY_MS) { c.state = "half_open"; return true; }
  return c.state === "half_open";
}
function cbSuccess(name: string) { const c = getCB(name); c.state = "closed"; c.failures = 0; }
function cbFailure(name: string) {
  const c = getCB(name); c.failures++; c.lastFailure = Date.now();
  if (c.state === "half_open" || c.failures >= FAILURE_THRESHOLD) c.state = "open";
}
function cbStatus(name: string) {
  const c = getCB(name);
  if (c.state === "open" && Date.now() - c.lastFailure > RECOVERY_MS) c.state = "half_open";
  return { state: c.state, failures: c.failures };
}

// ── Provider Definitions ────────────────────────────────────
interface Provider {
  name: string; enabled: boolean; baseUrl: string; apiKey: string;
  models: string[]; format: "openai" | "ollama";
}

const env = process.env;

function getProviders(): Provider[] {
  return [
    {
      name: "openrouter", enabled: !!env.OPENROUTER_API_KEY,
      baseUrl: "https://openrouter.ai/api/v1", apiKey: env.OPENROUTER_API_KEY ?? "",
      models: ["meta-llama/llama-3.3-70b-instruct:free", "google/gemma-3-27b-it:free", "mistralai/mistral-small-3.1-24b-instruct:free", "qwen/qwen3-32b:free"],
      format: "openai",
    },
    {
      name: "mistral", enabled: !!env.MISTRAL_API_KEY,
      baseUrl: "https://api.mistral.ai/v1", apiKey: env.MISTRAL_API_KEY ?? "",
      models: ["mistral-small-latest"], format: "openai",
    },
    {
      name: "cerebras", enabled: !!env.CEREBRAS_API_KEY,
      baseUrl: "https://api.cerebras.ai/v1", apiKey: env.CEREBRAS_API_KEY ?? "",
      models: ["llama-3.3-70b", "llama3.1-8b"], format: "openai",
    },
    {
      name: "nvidia", enabled: !!env.NVIDIA_API_KEY,
      baseUrl: "https://integrate.api.nvidia.com/v1", apiKey: env.NVIDIA_API_KEY ?? "",
      models: ["meta/llama-3.1-8b-instruct"], format: "openai",
    },
    {
      name: "huggingface", enabled: !!env.HUGGINGFACE_API_KEY,
      baseUrl: "https://router.huggingface.co/hf-inference/models/meta-llama/Llama-3.1-8B-Instruct/v1",
      apiKey: env.HUGGINGFACE_API_KEY ?? "",
      models: ["meta-llama/Llama-3.1-8B-Instruct"], format: "openai",
    },
    {
      name: "scitely", enabled: !!env.SCITELY_API_KEY,
      baseUrl: "https://api.scitely.com/v1", apiKey: env.SCITELY_API_KEY ?? "",
      models: ["deepseek-v3", "deepseek-v3.2", "qwen3-32b", "qwen3-235b", "kimi-k2", "mistral"],
      format: "openai",
    },
    {
      name: "cohere", enabled: !!env.COHERE_API_KEY,
      baseUrl: "https://api.cohere.com/compatibility/v1", apiKey: env.COHERE_API_KEY ?? "",
      models: ["command-r"], format: "openai",
    },
    {
      name: "cloudflare", enabled: !!(env.CLOUDFLARE_API_KEY && env.CLOUDFLARE_ACCOUNT_ID),
      baseUrl: `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID ?? ""}/ai/v1`,
      apiKey: env.CLOUDFLARE_API_KEY ?? "",
      models: ["@cf/meta/llama-3.3-70b-instruct-fp8-fast"], format: "openai",
    },
    {
      name: "chutes", enabled: !!env.CHUTES_API_KEY,
      baseUrl: "https://llm.chutes.ai/v1", apiKey: env.CHUTES_API_KEY ?? "",
      models: ["unsloth/gemma-3-4b-it", "unsloth/Llama-3.2-3B-Instruct"], format: "openai",
    },
    {
      name: "opencode", enabled: !!env.OPENCODE_API_KEY,
      baseUrl: "https://opencode.ai/zen/v1", apiKey: env.OPENCODE_API_KEY ?? "",
      models: ["big-pickle", "minimax-m2.5-free"], format: "openai",
    },
    {
      name: "mlvoca", enabled: true,
      baseUrl: "https://mlvoca.com", apiKey: "",
      models: ["tinyllama", "deepseek-r1:1.5b"], format: "ollama",
    },
    {
      name: "puter", enabled: !!env.PUTER_AUTH_TOKEN,
      baseUrl: "https://api.puter.com/puterai/openai/v1", apiKey: env.PUTER_AUTH_TOKEN ?? "",
      models: ["mistralai/mistral-large-2512"], format: "openai",
    },
  ];
}

// ── Send to Provider ────────────────────────────────────────
const TIMEOUT_MS = 15_000;
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

async function sendToProvider(p: Provider, body: Record<string, unknown>): Promise<Response> {
  const model = pick(p.models);
  if (p.format === "ollama") return sendOllama(p, body, model);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${p.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.apiKey}` },
      body: JSON.stringify({ ...body, model }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`${p.name} ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    return res;
  } finally { clearTimeout(t); }
}

async function sendOllama(p: Provider, body: Record<string, unknown>, model: string): Promise<Response> {
  const msgs = (body.messages as Array<{ role: string; content: string }>) ?? [];
  const prompt = msgs.map(m => `${m.role}: ${m.content}`).join("\n");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${p.baseUrl}/api/generate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, stream: false }), signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`${p.name} ${res.status}`);
    const data = (await res.json()) as { response?: string };
    return new Response(JSON.stringify({
      id: `chatcmpl-${crypto.randomUUID()}`, object: "chat.completion",
      created: Math.floor(Date.now() / 1000), model: `${p.name}/${model}`,
      choices: [{ index: 0, message: { role: "assistant", content: data.response ?? "" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  } finally { clearTimeout(t); }
}

// ── Hono App ────────────────────────────────────────────────
const app = new Hono();
app.use("*", cors());

app.get("/health", (c) => {
  const providers = getProviders();
  return c.json({
    status: "ok", uptime: process.uptime(),
    providers: providers.map(p => ({ name: p.name, enabled: p.enabled, models: p.models, circuit: cbStatus(p.name) })),
  });
});

app.get("/v1/models", (c) => {
  const all = getProviders().filter(p => p.enabled && cbAvailable(p.name));
  const models = all.flatMap(p => p.models.map(m => ({ id: `${p.name}/${m}`, object: "model" as const, created: 1700000000, owned_by: p.name })));
  models.unshift({ id: "auto", object: "model", created: 1700000000, owned_by: "sigari" });
  return c.json({ object: "list", data: models });
});

const MAX_RETRIES = 5;

app.post("/v1/chat/completions", async (c) => {
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch {
    return c.json({ error: { message: "Invalid JSON", type: "invalid_request_error" } }, 400);
  }
  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return c.json({ error: { message: "messages required", type: "invalid_request_error" } }, 400);
  }

  const isStream = body.stream === true;
  const tried = new Set<string>();
  const errors: string[] = [];

  for (let i = 0; i < MAX_RETRIES; i++) {
    const avail = getProviders().filter(p => p.enabled && cbAvailable(p.name) && !tried.has(p.name));
    if (avail.length === 0) break;
    const provider = pick(avail);
    tried.add(provider.name);

    try {
      console.log(`[${i + 1}] → ${provider.name}`);
      const res = await sendToProvider(provider, body);
      cbSuccess(provider.name);

      if (isStream && res.body) {
        return new Response(res.body, {
          status: 200,
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Sigari-Provider": provider.name },
        });
      }
      const data = await res.json();
      c.header("X-Sigari-Provider", provider.name);
      return c.json(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      cbFailure(provider.name);
      errors.push(`${provider.name}: ${msg}`);
      console.error(`[${i + 1}] ✗ ${provider.name}: ${msg}`);
    }
  }

  return c.json({ error: { message: "All providers failed", type: "server_error", details: errors } }, 502);
});

// ── Start ───────────────────────────────────────────────────
const port = Number(env.SIGARI_PORT ?? 4000);
const enabled = getProviders().filter(p => p.enabled);
console.log(`\n  Sigari Free LLM Gateway | port ${port} | ${enabled.length} providers`);
enabled.forEach(p => console.log(`    ✓ ${p.name} (${p.models.length} models)`));
getProviders().filter(p => !p.enabled).forEach(p => console.log(`    ✗ ${p.name}`));

export default { port, fetch: app.fetch };
