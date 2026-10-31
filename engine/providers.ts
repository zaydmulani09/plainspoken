// Model providers with two roles: writer and judge. Server route order:
// ANTHROPIC_API_KEY, then GROQ_API_KEY. A user key (BYOK) always wins and is
// used for that request only. Keys and request text are never logged.
import Anthropic from "@anthropic-ai/sdk";

export type Role = "writer" | "judge";
export type Effort = "low" | "medium" | "high";

export interface CallOpts {
  role: Role;
  system: string;
  user: string;
  schema?: Record<string, unknown>;
  maxTokens?: number;
  effort?: Effort;
  signal?: AbortSignal;
}

export interface CallResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface Provider {
  name: "groq" | "anthropic";
  source: "server" | "byok";
  models: Record<Role, string>;
  call(opts: CallOpts): Promise<CallResult>;
}

export class ProviderError extends Error {
  constructor(
    public code: "auth" | "rate_limit" | "unavailable" | "bad_output" | "no_key",
    message: string,
  ) {
    super(message);
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new ProviderError("unavailable", "aborted"));
    });
  });

// ---------- Groq (OpenAI-compatible chat completions) ----------

export const GROQ_MODELS: Record<Role, string[]> = {
  writer: ["openai/gpt-oss-120b", "qwen/qwen3.8-27b"],
  judge: ["openai/gpt-oss-20b", "openai/gpt-oss-120b"],
};

// Last daily request count Groq reported per model (x-ratelimit-remaining-requests
// is a per-day budget on the free tier). Used for the server-key daily cap.
export const groqRemaining = new Map<string, { requests: number; at: number }>();

// Free tier: 8,000 tokens per minute per model, counted as prompt plus
// max_completion_tokens. A rolling 60 second window per model keeps bursts of
// parallel calls under that line instead of colliding into 429s.
const TPM = Number(process.env.GROQ_TPM ?? 7600);
const windowUse = new Map<string, { t: number; n: number }[]>();

function used(model: string, now: number): { total: number; entries: { t: number; n: number }[] } {
  const entries = (windowUse.get(model) ?? []).filter((e) => now - e.t < 60000);
  windowUse.set(model, entries);
  return { total: entries.reduce((a, e) => a + e.n, 0), entries };
}

// Milliseconds until `need` tokens fit in the model's window.
function waitFor(model: string, need: number, now = Date.now()): number {
  const { total, entries } = used(model, now);
  if (total + need <= TPM) return 0;
  let free = TPM - total;
  for (const e of entries) {
    free += e.n;
    if (free >= need) return 60000 - (now - e.t) + 50;
  }
  return 60000;
}

function parseReset(v: string | null): number {
  if (!v) return 0;
  let ms = 0;
  for (const [, n, u] of v.matchAll(/([\d.]+)(ms|s|m|h)/g)) ms += parseFloat(n) * (u === "ms" ? 1 : u === "s" ? 1000 : u === "m" ? 60000 : 3600000);
  return ms;
}

export function groqProvider(apiKey: string, source: "server" | "byok", models = GROQ_MODELS): Provider {
  return {
    name: "groq",
    source,
    models: { writer: models.writer[0], judge: models.judge[0] },
    async call(o) {
      const list = models[o.role];
      // The writer sticks to its first model unless the wait gets long; judges
      // take whichever model frees up first.
      const patience = o.role === "writer" ? 25000 : 4000;
      let maxTokens = o.maxTokens ?? 2000;
      let lastErr: unknown = null;
      const started = Date.now();
      for (let attempt = 0; attempt < 8; attempt++) {
        const need = Math.ceil((o.system.length + o.user.length) / 3.5) + maxTokens;
        const waits = list.map((m) => waitFor(m, need));
        let k = waits[0] <= patience ? 0 : waits.indexOf(Math.min(...waits));
        const model = list[k];
        if (waits[k] > 0) await sleep(waits[k], o.signal);
        // Admission needs room for prompt plus max tokens; once the call returns,
        // the window holds what it actually used.
        const entry = { t: Date.now(), n: need };
        used(model, entry.t).entries.push(entry);
        const isOss = model.startsWith("openai/");
        const body: Record<string, unknown> = {
          model,
          messages: [
            { role: "system", content: o.system },
            { role: "user", content: o.user },
          ],
          max_completion_tokens: maxTokens,
          temperature: o.role === "writer" ? 0.8 : 0.2,
        };
        if (isOss) {
          body.reasoning_effort = o.effort ?? "low";
          body.include_reasoning = false;
        } else if (o.effort === "medium" || o.effort === "high") {
          // Qwen has reasoning on or off; keep it out of the reply.
          body.reasoning_effort = "default";
          body.reasoning_format = "hidden";
        } else body.reasoning_effort = "none";
        if (o.schema) {
          body.response_format = isOss
            ? { type: "json_schema", json_schema: { name: "out", strict: true, schema: o.schema } }
            : { type: "json_object" };
        }
        let res: Response;
        try {
          res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: o.signal,
          });
        } catch (e) {
          lastErr = e;
          if (o.signal?.aborted) throw new ProviderError("unavailable", "aborted");
          await sleep(1000, o.signal);
          continue;
        }
        const remaining = res.headers.get("x-ratelimit-remaining-requests");
        if (remaining !== null) groqRemaining.set(model, { requests: Number(remaining), at: Date.now() });
        if (res.status === 401 || res.status === 403) throw new ProviderError("auth", "The Groq key was rejected.");
        if (res.status === 429 || res.status >= 500) {
          lastErr = new ProviderError(res.status === 429 ? "rate_limit" : "unavailable", `Groq ${res.status}`);
          const errBody = await res.text().catch(() => "");
          // A daily limit will not clear soon: mark the model full for a minute so
          // the next attempt picks another one.
          const daily = /per day|TPD|RPD/i.test(errBody);
          const wait = daily
            ? 60000
            : Math.max(parseReset(res.headers.get("retry-after") ? `${res.headers.get("retry-after")}s` : null), parseReset(res.headers.get("x-ratelimit-reset-tokens")), 1000);
          used(model, Date.now()).entries.push({ t: Date.now() - 60000 + wait, n: TPM });
          // A per-minute limit clears soon, so it does not use up an attempt
          // for the first two minutes of a call.
          if (res.status === 429 && !daily && Date.now() - started + wait < 120000) attempt--;
          continue;
        }
        if (!res.ok) {
          lastErr = new ProviderError("unavailable", `Groq ${res.status}`);
          const errBody = await res.text().catch(() => "");
          if (process.env.PLAINSPOKEN_DEBUG) console.error(model, res.status, errBody.slice(0, 600));
          if (res.status === 400 && o.schema && attempt < 3) {
            // Structured-output validation failures come back as 400; retry.
            // An empty or truncated generation means the budget ran out.
            if (/"failed_generation":""|max completion tokens reached/.test(errBody)) maxTokens = Math.min(maxTokens * 2, 8000);
            await sleep(300, o.signal);
            continue;
          }
          throw lastErr;
        }
        const j = await res.json();
        const actual = (j.usage?.prompt_tokens ?? 0) + (j.usage?.completion_tokens ?? 0);
        if (actual > 0) entry.n = actual;
        const choice = j.choices?.[0];
        const text: string = choice?.message?.content ?? "";
        if (choice?.finish_reason === "length" || !text.trim()) {
          lastErr = new ProviderError("bad_output", "response cut off");
          maxTokens = Math.min(maxTokens * 2, 16000);
          continue;
        }
        return { text, model, inputTokens: j.usage?.prompt_tokens ?? 0, outputTokens: j.usage?.completion_tokens ?? 0 };
      }
      if (lastErr instanceof ProviderError) throw lastErr;
      throw new ProviderError("unavailable", "Groq request failed");
    },
  };
}

// ---------- Anthropic (Messages API via the official SDK) ----------

export const ANTHROPIC_MODELS: Record<Role, string> = { writer: "claude-sonnet-5-5", judge: "claude-haiku-5-5" };

export function anthropicProvider(apiKey: string, source: "server" | "byok"): Provider {
  const client = new Anthropic({ apiKey, maxRetries: 3 });
  return {
    name: "anthropic",
    source,
    models: ANTHROPIC_MODELS,
    async call(o) {
      const model = ANTHROPIC_MODELS[o.role];
      // Thinking cannot be disabled on the 5.5 models and thinking tokens count
      // toward max_tokens, so keep max_tokens generous and steer with effort.
      // Sampling parameters are not sent (rejected on current models).
      const params = {
        model,
        max_tokens: o.maxTokens ? Math.max(16000, o.maxTokens * 4) : 16000,
        system: o.system,
        messages: [{ role: "user" as const, content: o.user }],
        cache_control: { type: "ephemeral" as const },
        output_config: {
          effort: o.effort ?? (o.role === "writer" ? "medium" : "low"),
          ...(o.schema ? { format: { type: "json_schema" as const, schema: o.schema } } : {}),
        },
      };
      try {
        const msg =
          o.role === "writer"
            ? await client.beta.messages.create(
                { ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming,
                { signal: o.signal },
              )
            : await client.messages.create(params as unknown as Anthropic.MessageCreateParamsNonStreaming, { signal: o.signal });
        if (msg.stop_reason === "refusal") throw new ProviderError("bad_output", "The model declined this request.");
        const text = (msg.content as { type: string; text?: string }[])
          .filter((b) => b.type === "text")
          .map((b) => b.text ?? "")
          .join("");
        return { text, model, inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens };
      } catch (e) {
        if (e instanceof ProviderError) throw e;
        if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new ProviderError("auth", "The Anthropic key was rejected.");
        if (e instanceof Anthropic.RateLimitError) throw new ProviderError("rate_limit", "Anthropic rate limit reached.");
        if (e instanceof Anthropic.APIError) throw new ProviderError("unavailable", `Anthropic ${e.status ?? "error"}`);
        throw new ProviderError("unavailable", "Anthropic request failed");
      }
    },
  };
}

// ---------- Route selection ----------

export function providerFromKey(key: string): Provider {
  const k = key.trim();
  if (/^sk-ant-/.test(k)) return anthropicProvider(k, "byok");
  if (/^gsk_/.test(k)) return groqProvider(k, "byok");
  throw new ProviderError("no_key", "Unrecognized key. Paste an Anthropic key (sk-ant-...) or a Groq key (gsk_...).");
}

export function serverProvider(env = process.env): Provider | null {
  if (env.ANTHROPIC_API_KEY) return anthropicProvider(env.ANTHROPIC_API_KEY, "server");
  if (env.GROQ_API_KEY) {
    const list = (v: string | undefined, d: string[]) => (v ? v.split(",").map((x) => x.trim()).filter(Boolean) : d);
    return groqProvider(env.GROQ_API_KEY, "server", { writer: list(env.GROQ_WRITER_MODELS, GROQ_MODELS.writer), judge: list(env.GROQ_JUDGE_MODELS, GROQ_MODELS.judge) });
  }
  return null;
}

// Pulls the first JSON object out of a model reply.
export function parseJson<T>(text: string): T {
  const t = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  try {
    return JSON.parse(t) as T;
  } catch {
    const s = t.indexOf("{");
    const e = t.lastIndexOf("}");
    if (s >= 0 && e > s) return JSON.parse(t.slice(s, e + 1)) as T;
    throw new ProviderError("bad_output", "Model did not return JSON");
  }
}
