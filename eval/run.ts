// Eval runner. Rewrites each source with the pipeline (Standard mode, the
// source's tone), then measures it with deterministic metrics and an
// independent judge model.
// Usage: GROQ_API_KEY=... npx tsx eval/run.ts --round 1 [--set dev|all] [--ids a,b]
// Per-text results are cached in eval/.cache/round-N so a run can resume after
// a rate limit. Summaries go to eval/results/round-N.json and .md.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { bannedChars } from "../engine/guard";
import { lint, tellReduction } from "../engine/lint";
import { humanize } from "../engine/pipeline";
import { groqProvider, type Provider } from "../engine/providers";
import { countWords, mattr } from "../engine/text";
import { loadCorpus, readJson, writeJson, type Source } from "./corpus";
import { aiProbability, DETECTOR } from "./detector";
import { checkClaims, extractClaims, pairwise, type ClaimCheck } from "./judge";

// Eight sources spread over generators and genres, used for tuning rounds.
export const DEV_SET = [
  "g02-linkedin-failed-launch", "g09-essay-libraries", "g12-nursing-statement", "g19-explainer-api",
  "g25-postmortem-cert", "c02-essay-social-media", "c05-report-sales", "c07-blog-productivity",
];

const WRITER = "openai/gpt-oss-120b";
const PIPELINE_JUDGE = "openai/gpt-oss-20b";
const EVAL_JUDGE = "qwen/qwen3.8-27b";

interface TextResult {
  id: string;
  genre: string;
  generator: string;
  tone: string;
  original: string;
  rewrite: string;
  words: [number, number];
  drift: number;
  density: [number, number];
  score: [number, number];
  reduction: number;
  claims: number;
  check: ClaimCheck;
  pair: { result: "win" | "tie" | "loss"; orders: string[]; reason: string };
  sentenceCv: [number, number];
  mattr: [number, number];
  banned: ReturnType<typeof bannedChars>;
  fallbacks: Record<string, number>;
  // What was still wrong with each paragraph that fell back.
  issues?: string[][];
  calls: number;
  tokens: number;
  seconds: number;
  // Calls per model; "ovh/" models were served by OVHcloud, the rest by Groq.
  served?: Record<string, number>;
  detector?: [number, number];
}

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const cvOf = (t: string) => lint(t).metrics.find((m) => m.id === "rhythm-sentence-cv")?.value ?? 0;

async function main() {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set");
  const round = Number(arg("round", "1"));
  const set = arg("set", "dev");
  const ids = arg("ids")?.split(",");
  const corpus = loadCorpus();
  const sources = ids ? corpus.filter((s) => ids.includes(s.id)) : set === "all" ? corpus : corpus.filter((s) => DEV_SET.includes(s.id));

  const cacheDir = new URL(`./.cache/round-${round}/`, import.meta.url);
  mkdirSync(cacheDir, { recursive: true });
  const claimsPath = new URL("./claims.json", import.meta.url);
  const claimsCache: Record<string, string[]> = existsSync(claimsPath) ? readJson(claimsPath) : {};

  // The live site's models, pinned: no qwen writer fallback (qwen is the eval
  // judge), and no gpt-oss-120b judge fallback, so a full run fits the free
  // tier's daily token quota. Live runs can only get a stronger judge.
  // --ovh: when Groq's daily quota is spent, the same models on OVHcloud's
  // keyless endpoint take the call (see engine/providers.ts).
  const alt = (m: string) => (process.argv.includes("--ovh") ? [m, `ovh/${m.split("/").pop()}`] : [m]);
  const pipeline = groqProvider(key, "server", { writer: alt(WRITER), judge: alt(PIPELINE_JUDGE) });
  const judgeBase = groqProvider(key, "server", { writer: alt(EVAL_JUDGE), judge: alt(EVAL_JUDGE) });
  const tally = (p: Provider, served: Record<string, number>): Provider => ({
    ...p,
    call: async (o) => {
      const r = await p.call(o);
      served[r.model] = (served[r.model] ?? 0) + 1;
      return r;
    },
  });

  const runOne = async (s: Source): Promise<TextResult | null> => {
    const cached = new URL(`${s.id}.json`, cacheDir);
    if (existsSync(cached)) return JSON.parse(readFileSync(cached, "utf8"));
    // --cached: summarize what a stopped round finished, without new calls.
    if (process.argv.includes("--cached")) return null;
    // The rewrite is cached on its own, so judging can resume after the
    // judge model's daily quota resets without redoing it.
    const rewriteCache = new URL(`${s.id}.rewrite.json`, cacheDir);
    let res: Awaited<ReturnType<typeof humanize>>;
    let seconds: number;
    let served: Record<string, number> = {};
    if (existsSync(rewriteCache)) ({ res, seconds, served = {} } = readJson(rewriteCache) as { res: typeof res; seconds: number; served?: Record<string, number> });
    else {
      const t0 = Date.now();
      // Paragraph concurrency matches the live route, and texts run one at a
      // time by default, so the seconds below are close to a live run.
      res = await humanize(s.text, { mode: "standard", tone: s.tone, provider: tally(pipeline, served), concurrency: 3 });
      seconds = Math.round((Date.now() - t0) / 1000);
      if (res.paragraphs.some((p) => p.fallback === "error" || p.fallback === "time")) {
        console.log(`${s.id}: provider error, not cached`);
        return null;
      }
      writeJson(rewriteCache, { res, seconds, served });
    }
    const fallbacks: Record<string, number> = {};
    for (const p of res.paragraphs) if (p.fallback) fallbacks[p.fallback] = (fallbacks[p.fallback] ?? 0) + 1;
    const judge = tally(judgeBase, served);
    if (!claimsCache[s.id]) {
      claimsCache[s.id] = await extractClaims(judge, s.text);
      writeJson(claimsPath, claimsCache);
    }
    const claims = claimsCache[s.id];
    const check = await checkClaims(judge, s.text, claims, res.text);
    const pair = await pairwise(judge, s.tone, s.text, res.text);
    const before = lint(s.text);
    const after = lint(res.text);
    const w0 = countWords(s.text);
    const w1 = countWords(res.text);
    const out: TextResult = {
      id: s.id, genre: s.genre, generator: s.generator, tone: s.tone, original: s.text, rewrite: res.text,
      words: [w0, w1], drift: r3((w1 - w0) / w0), density: [before.density, after.density], score: [before.score, after.score],
      reduction: r3(tellReduction(before, after)), claims: claims.length, check, pair,
      sentenceCv: [r3(cvOf(s.text)), r3(cvOf(res.text))], mattr: [r3(mattr(s.text)), r3(mattr(res.text))],
      banned: bannedChars(res.text), fallbacks, issues: res.paragraphs.filter((p) => p.fallback).map((p) => p.issues), calls: res.usage.calls, tokens: res.usage.inputTokens + res.usage.outputTokens,
      seconds, served,
    };
    writeJson(cached, out);
    console.log(
      `${s.id}: tells ${before.density.toFixed(1)} -> ${after.density.toFixed(1)}, claims ${check.kept}/${claims.length} kept, ${check.changed.length} changed, ${check.missing.length} missing, ${check.added.length} added, pair ${pair.result}, drift ${(out.drift * 100).toFixed(0)}%, ${out.seconds}s`,
    );
    return out;
  };

  const results: TextResult[] = [];
  let next = 0;
  let failures = 0;
  await Promise.all(
    Array.from({ length: Number(arg("concurrency", "1")) }, async () => {
      while (next < sources.length && failures < 3) {
        const s = sources[next++];
        try {
          const r = await runOne(s);
          if (r) results.push(r);
          else if (!process.argv.includes("--cached")) failures++;
        } catch (e) {
          failures++;
          console.log(`${s.id}: ${(e as Error).message}`);
        }
      }
    }),
  );

  // Local detector, scored at summary time (no API quota).
  for (const r of results) r.detector ??= [r3(await aiProbability(r.original)), r3(await aiProbability(r.rewrite))];
  const flaggedBefore = results.filter((r) => r.detector![0] > 0.5).length;
  const flaggedAfter = results.filter((r) => r.detector![1] > 0.5).length;

  const missingIds = sources.filter((s) => !results.some((r) => r.id === s.id)).map((s) => s.id);
  const totalClaims = sum(results.map((r) => r.claims));
  const kept = sum(results.map((r) => r.check.kept));
  const added = sum(results.map((r) => r.check.added.length));
  const words0 = sum(results.map((r) => r.words[0]));
  const words1 = sum(results.map((r) => r.words[1]));
  const pooledBefore = (sum(results.map((r) => r.score[0])) / words0) * 100;
  const pooledAfter = (sum(results.map((r) => r.score[1])) / words1) * 100;
  const banned = sum(results.map((r) => r.banned.dashes + r.banned.invisible + r.banned.oddSpaces + r.banned.mixedScript.length));
  const summary = {
    round,
    date: new Date().toISOString().slice(0, 10),
    set: ids ? `ids:${ids.join(",")}` : set,
    texts: results.length,
    missing: missingIds,
    models: { writer: WRITER, pipelineJudge: PIPELINE_JUDGE, evalJudge: EVAL_JUDGE },
    tellReduction: { pooled: r3(1 - pooledAfter / pooledBefore), meanPerText: r3(mean(results.map((r) => r.reduction))), densityBefore: r3(pooledBefore), densityAfter: r3(pooledAfter) },
    claims: { total: totalClaims, kept, changed: sum(results.map((r) => r.check.changed.length)), missing: sum(results.map((r) => r.check.missing.length)), recall: r3(kept / totalClaims), added, textsWithAdditions: results.filter((r) => r.check.added.length).length },
    quality: {
      win: results.filter((r) => r.pair.result === "win").length,
      tie: results.filter((r) => r.pair.result === "tie").length,
      loss: results.filter((r) => r.pair.result === "loss").length,
      winOrTie: r3(results.filter((r) => r.pair.result !== "loss").length / results.length),
    },
    length: { totalDrift: r3((words1 - words0) / words0), meanAbsDrift: r3(mean(results.map((r) => Math.abs(r.drift)))), within10: results.filter((r) => Math.abs(r.drift) <= 0.1).length },
    sentenceCv: { before: r3(mean(results.map((r) => r.sentenceCv[0]))), after: r3(mean(results.map((r) => r.sentenceCv[1]))) },
    mattr: { before: r3(mean(results.map((r) => r.mattr[0]))), after: r3(mean(results.map((r) => r.mattr[1]))) },
    bannedChars: banned,
    fallbacks: results.reduce<Record<string, number>>((acc, r) => {
      for (const [k, v] of Object.entries(r.fallbacks)) acc[k] = (acc[k] ?? 0) + v;
      return acc;
    }, {}),
    detector: {
      ...DETECTOR,
      meanAiProbability: [r3(mean(results.map((r) => r.detector![0]))), r3(mean(results.map((r) => r.detector![1])))],
      flaggedAi: [flaggedBefore, flaggedAfter],
      note: "Flagged means AI probability above 0.5. See eval/results/detector-sanity.json for its scores on human text.",
    },
    usage: { calls: sum(results.map((r) => r.calls)), tokens: sum(results.map((r) => r.tokens)) },
  };
  const targets = [
    ["Tell reduction (pooled)", `${(summary.tellReduction.pooled * 100).toFixed(1)}%`, ">= 80%", summary.tellReduction.pooled >= 0.8],
    ["Claim recall", `${(summary.claims.recall * 100).toFixed(1)}% (${kept}/${totalClaims})`, ">= 98%", summary.claims.recall >= 0.98],
    ["Added claims", `${added} in ${summary.claims.textsWithAdditions} texts`, "0", added === 0],
    ["Quality win or tie vs original", `${(summary.quality.winOrTie * 100).toFixed(1)}% (${summary.quality.win} win, ${summary.quality.tie} tie, ${summary.quality.loss} loss)`, ">= 85%", summary.quality.winOrTie >= 0.85],
    ["Length drift", `${(summary.length.totalDrift * 100).toFixed(1)}% total, ${summary.length.within10}/${results.length} texts within 10%`, "within 10%", Math.abs(summary.length.totalDrift) <= 0.1],
    ["Banned characters in output", String(banned), "0", banned === 0],
  ] as const;
  const md = [
    `# Eval round ${round} (${summary.date}, ${summary.set}, ${results.length} texts)`,
    "",
    `Writer ${WRITER}, pipeline judge ${PIPELINE_JUDGE}, eval judge ${EVAL_JUDGE} (Groq). Mode: Standard.`,
    "",
    "| Metric | Result | Target | Met |",
    "| --- | --- | --- | --- |",
    ...targets.map(([m, v, t, ok]) => `| ${m} | ${v} | ${t} | ${ok ? "yes" : "no"} |`),
    `| Tell density per 100 words | ${summary.tellReduction.densityBefore} before, ${summary.tellReduction.densityAfter} after | | |`,
    `| Sentence length spread (CV) | ${summary.sentenceCv.before} before, ${summary.sentenceCv.after} after | | |`,
    `| MATTR (window 50) | ${summary.mattr.before} before, ${summary.mattr.after} after | | |`,
    `| Detector: ${DETECTOR.name}, texts flagged AI | ${flaggedBefore}/${results.length} before, ${flaggedAfter}/${results.length} after (mean AI probability ${summary.detector.meanAiProbability[0]} before, ${summary.detector.meanAiProbability[1]} after) | not a target | |`,
    "",
    missingIds.length ? `Not finished: ${missingIds.join(", ")}` : "",
  ].join("\n");
  const outDir = new URL("./results/", import.meta.url);
  mkdirSync(outDir, { recursive: true });
  writeJson(new URL(`round-${round}.json`, outDir), { summary, results });
  writeFileSync(new URL(`round-${round}.md`, outDir), md + "\n");
  console.log("\n" + md);
}

main();
