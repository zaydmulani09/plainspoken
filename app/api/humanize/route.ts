// POST /api/humanize: streams NDJSON events while the pipeline runs.
// Pasted text and keys are never stored or logged.
import { clientIp, dailyAllowed, ipAllowed, MAX_WORDS, recordWords } from "@/engine/limits";
import { humanize, type PipelineEvent } from "@/engine/pipeline";
import { MODES, TONES, type Mode, type Tone } from "@/engine/prompts";
import { ProviderError, providerFromKey, serverProvider, type Provider } from "@/engine/providers";
import { countWords } from "@/engine/text";
import { isVoiceCard } from "@/engine/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BYOK_MAX_WORDS = 6000;

function fail(status: number, error: string, code: string) {
  return Response.json({ error, code }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  let body: { text?: unknown; mode?: unknown; tone?: unknown; voice?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "Send JSON with a text field.", "bad_request");
  }
  const text = typeof body.text === "string" ? body.text : "";
  const mode = (MODES as string[]).includes(body.mode as string) ? (body.mode as Mode) : "standard";
  const tone = (TONES as string[]).includes(body.tone as string) ? (body.tone as Tone) : "neutral";
  const voice = isVoiceCard(body.voice) ? body.voice : null;
  if (voice) voice.excerpts = voice.excerpts.slice(0, 3).map((e) => e.slice(0, 600));
  const words = countWords(text);
  if (!words) return fail(400, "Paste some text first.", "empty");

  const userKey = req.headers.get("x-provider-key")?.trim();
  let provider: Provider;
  try {
    if (userKey) {
      provider = providerFromKey(userKey);
      if (words > BYOK_MAX_WORDS) return fail(413, `Up to ${BYOK_MAX_WORDS.toLocaleString("en-US")} words per request, so the run fits in the time limit.`, "too_long");
    } else {
      const p = serverProvider();
      if (!p) return fail(503, "No server key is configured. Paste your own Anthropic or Groq key.", "no_server_key");
      provider = p;
      if (words > MAX_WORDS) return fail(413, `The free server key takes up to ${MAX_WORDS.toLocaleString("en-US")} words per request. Paste your own key for longer text.`, "too_long");
      if (!ipAllowed(clientIp(req.headers))) return fail(429, "Too many requests from your network. Try again in a few minutes, or use your own key.", "ip_limit");
      const cap = dailyAllowed(words, p.models.writer);
      if (!cap.ok) return fail(429, `${cap.reason} Paste your own key to keep going.`, "daily_cap");
      recordWords(words);
    }
  } catch (e) {
    if (e instanceof ProviderError) return fail(400, e.message, e.code);
    return fail(400, "Could not use that key.", "bad_key");
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
        } catch {
          // client went away
        }
      };
      const ping = setInterval(() => send({ type: "ping" }), 10000);
      send({ type: "start", provider: { name: provider.name, writer: provider.models.writer, judge: provider.models.judge, source: provider.source }, words });
      try {
        const result = await humanize(text, {
          mode, tone, voice, provider, signal: req.signal, concurrency: provider.name === "groq" ? 2 : 4,
          onEvent: (e: PipelineEvent) => send(e),
        });
        send({ type: "done", result });
      } catch (e) {
        const code = e instanceof ProviderError ? e.code : "error";
        const message =
          code === "auth" ? (e as Error).message
          : code === "rate_limit" ? "The model provider is rate limiting right now. Try again in a minute, or use your own key."
          : "The rewrite failed partway. Try again.";
        // Log the error class only. Never the text or the key.
        console.error(`humanize failed: ${code}`);
        send({ type: "error", code, message });
      } finally {
        clearInterval(ping);
        try {
          controller.close();
        } catch {}
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" },
  });
}
