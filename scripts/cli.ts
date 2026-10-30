// Local CLI: npx tsx scripts/cli.ts <file> [--mode standard] [--tone neutral] [--json]
import { appendFileSync, readFileSync } from "node:fs";
import { humanize } from "../engine/pipeline";
import { serverProvider } from "../engine/providers";
import type { Mode, Tone } from "../engine/prompts";

const args = process.argv.slice(2);
const flag = (k: string, d: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const file = args.find((a) => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--"));
if (!file) throw new Error("usage: cli.ts <file>");
const base = serverProvider();
if (!base) throw new Error("Set ANTHROPIC_API_KEY or GROQ_API_KEY");
// --log <file>: append every prompt and reply to a local file for debugging.
const logFile = args.includes("--log") ? flag("log", "") : "";
const provider = logFile
  ? {
      ...base,
      async call(o: Parameters<typeof base.call>[0]) {
        const r = await base.call(o);
        appendFileSync(logFile, `\n===== ${o.role} ${r.model}\n----- user\n${o.user}\n----- reply\n${r.text}\n`);
        return r;
      },
    }
  : base;

const t0 = Date.now();
const r = await humanize(readFileSync(file, "utf8"), {
  mode: flag("mode", "standard") as Mode,
  tone: flag("tone", "neutral") as Tone,
  provider,
  onEvent: (e) => {
    if (e.type === "stage") process.stderr.write(`[p${e.i} ${e.stage}] `);
  },
});
process.stderr.write("\n");
if (args.includes("--json")) console.log(JSON.stringify(r, null, 2));
else {
  console.log(r.text);
  console.log("\n---");
  console.log(`tells: ${r.before.density} -> ${r.after.density} per 100 words; words ${r.before.words} -> ${r.after.words}`);
  console.log(`meaning ok: ${r.meaning.ok}; claims ${r.meaning.claims}; missing ${JSON.stringify(r.meaning.missing)}; added ${JSON.stringify(r.meaning.added)}`);
  console.log(`flagged paragraphs: ${r.flagged}; calls ${r.usage.calls}; tokens ${r.usage.inputTokens}+${r.usage.outputTokens}; ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  for (const p of r.paragraphs) if (p.rewritten) console.log(`p${p.i}: q ${p.qualityOriginal} -> ${p.qualityChosen}, loops ${p.loops}, tried ${p.candidatesTried}${p.flagged ? " FLAGGED " + JSON.stringify(p.issues) : ""}`);
}
