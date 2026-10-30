// GET /api/status: which server route is configured (never the key itself).
import { MAX_WORDS } from "@/engine/limits";
import { serverProvider } from "@/engine/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const p = serverProvider();
  return Response.json(
    { server: p ? { name: p.name, writer: p.models.writer, judge: p.models.judge } : null, maxWords: MAX_WORDS },
    { headers: { "Cache-Control": "no-store" } },
  );
}
