// Abuse limits for the server key. BYOK requests skip all of these.
// - MAX_WORDS per request.
// - Per-IP request limit. The Vercel Firewall rule is the main gate; this
//   in-memory limiter is a per-instance backstop.
// - Daily cap: a per-instance word budget, plus Groq's own per-day request
//   counter (shared by every instance) as the global stop.
import { groqRemaining } from "./providers";

export const MAX_WORDS = 1500;
export const DAILY_WORDS = Number(process.env.DAILY_WORD_CAP ?? 60000);
export const GROQ_DAILY_RESERVE = Number(process.env.GROQ_DAILY_RESERVE ?? 150);
const IP_LIMIT = Number(process.env.IP_LIMIT ?? 8);
const IP_WINDOW_MS = 10 * 60 * 1000;

const hits = new Map<string, number[]>();
let day = "";
let wordsToday = 0;

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function ipAllowed(ip: string, now = Date.now()): boolean {
  const list = (hits.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
  if (list.length >= IP_LIMIT) {
    hits.set(ip, list);
    return false;
  }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) for (const k of [...hits.keys()].slice(0, 1000)) hits.delete(k);
  return true;
}

export type CapResult = { ok: true } | { ok: false; reason: string };

export function dailyAllowed(words: number, writerModel: string): CapResult {
  if (day !== today()) {
    day = today();
    wordsToday = 0;
  }
  if (wordsToday + words > DAILY_WORDS) return { ok: false, reason: "The free server key has reached today's word budget." };
  const r = groqRemaining.get(writerModel);
  // Groq resets the daily counter gradually; only trust a reading from the last hour.
  if (r && Date.now() - r.at < 3600000 && r.requests < GROQ_DAILY_RESERVE) {
    return { ok: false, reason: "The free server key is close to its daily request limit." };
  }
  return { ok: true };
}

export function recordWords(words: number) {
  if (day !== today()) {
    day = today();
    wordsToday = 0;
  }
  wordsToday += words;
}

export function clientIp(headers: Headers): string {
  return headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}
