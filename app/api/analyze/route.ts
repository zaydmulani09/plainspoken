// POST /api/analyze: lint only. Deterministic, free, no model call.
import { freeze } from "@/engine/freeze";
import { lint } from "@/engine/lint";
import { countWords } from "@/engine/text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WORDS = 20000;

export async function POST(req: Request) {
  let text = "";
  try {
    const body = await req.json();
    text = typeof body.text === "string" ? body.text : "";
  } catch {
    return Response.json({ error: "Send JSON with a text field." }, { status: 400 });
  }
  if (!text.trim()) return Response.json({ error: "Paste some text first." }, { status: 400 });
  if (countWords(text) > MAX_WORDS) return Response.json({ error: `Up to ${MAX_WORDS.toLocaleString("en-US")} words.` }, { status: 413 });
  return Response.json({ report: lint(text), frozen: freeze(text) }, { headers: { "Cache-Control": "no-store" } });
}
