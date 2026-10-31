// The humanize pipeline: freeze, lint, rewrite (2 candidates), verify
// (frozen spans, meaning, quality, lint), pick, repair up to twice, fall back.
import { bannedChars, hasDash, stripBanned } from "./guard";
import { checkFrozen, freeze, uniqueFrozen, type Frozen } from "./freeze";
import { keepCheck, type KeepReport } from "./keep";
import { lint, TELLS, type LintReport } from "./lint";
import {
  CLAIMS_SYSTEM, MEANING_SYSTEM, QUALITY_SYSTEM, SCHEMAS, WRITER_SYSTEM,
  claimsPrompt, lightPrompt, meaningPrompt, qualityPrompt, repairPrompt, requestId, writerPrompt,
  type Mode, type TellNote, type Tone,
} from "./prompts";
import { parseJson, ProviderError, type Provider } from "./providers";
import { countWords, joinBlocks, sentences, splitBlocks } from "./text";
import { describeVoice, type VoiceCard } from "./voice";

export interface HumanizeOptions {
  mode: Mode;
  tone: Tone;
  voice?: VoiceCard | null;
  provider: Provider;
  concurrency?: number;
  maxLoops?: number;
  signal?: AbortSignal;
  // Epoch ms. Paragraphs not started by then are kept as written, and calls
  // still running 35 seconds later are cut, so a run fits a serverless limit.
  deadline?: number;
  onEvent?: (e: PipelineEvent) => void;
}

export type Stage = "queued" | "extracting" | "writing" | "checking" | "repairing" | "done" | "skipped";

export interface ParagraphPlan {
  i: number;
  kind: string;
  words: number;
  rewrite: boolean;
}

export interface ParagraphResult {
  i: number;
  original: string;
  text: string;
  rewritten: boolean;
  flagged: boolean;
  // Why a paragraph was not rewritten as planned: "original" means every draft
  // changed its meaning, so the original was kept; "length" means the kept
  // draft is outside the length range; "time" and "error" kept the original.
  fallback: "original" | "length" | "time" | "error" | null;
  issues: string[];
  claims: number;
  missing: string[];
  added: string[];
  frozenMissing: string[];
  qualityOriginal: number | null;
  qualityChosen: number | null;
  loops: number;
  candidatesTried: number;
  cleanedChars: boolean;
}

export type PipelineEvent =
  | { type: "plan"; paragraphs: ParagraphPlan[]; before: LintReport }
  | { type: "stage"; i: number; stage: Stage }
  | { type: "paragraph"; result: ParagraphResult };

export interface HumanizeResult {
  text: string;
  before: LintReport;
  after: LintReport;
  paragraphs: ParagraphResult[];
  meaning: { claims: number; missing: string[]; added: string[]; ok: boolean };
  flagged: number;
  usage: { calls: number; inputTokens: number; outputTokens: number };
  provider: { name: string; writer: string; judge: string; source: string };
}

interface Candidate {
  text: string;
  frozen: ReturnType<typeof checkFrozen>;
  bannedOk: boolean;
  words: number;
  inRange: boolean;
  density: number;
  // Density without groups of three carried over from the source.
  gateDensity: number;
  remainingTells: TellNote[];
  keep: KeepReport;
  missing?: string[];
  added?: string[];
  missingText?: string[];
  quality?: number;
  score?: number;
}

const MIN_WORDS_TO_REWRITE = 6;

// The writer is asked for a range within 7 percent, since drafts run short. A
// candidate only fails outside the hard range (14 percent), so it never has to
// pad a paragraph whose filler it cut.
export function rangeFor(n: number): [number, number] {
  return [Math.max(1, Math.min(Math.floor(n * 0.93), n - 2)), Math.max(Math.ceil(n * 1.07), n + 2)];
}
function hardRangeFor(n: number): [number, number] {
  return [Math.max(1, Math.min(Math.floor(n * 0.86), n - 6)), Math.max(Math.ceil(n * 1.14), n + 5)];
}

// Quotes and other frozen spans are copied verbatim, so normalize any dash in
// them first: the output may never contain an em or en dash.
function normalizeFrozenDashes(p: string): string {
  let out = p;
  for (const f of freeze(p).sort((a, b) => b.start - a.start)) {
    if (hasDash(f.text)) out = out.slice(0, f.start) + stripBanned(out.slice(f.start, f.end)) + out.slice(f.end);
  }
  return out.replace(/(\d)\s*[\u{2012}-\u{2014}]\s*(\d)/gu, "$1-$2");
}

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  const r = new Uint32Array(a.length);
  globalThis.crypto.getRandomValues(r);
  for (let i = a.length - 1; i > 0; i--) {
    const j = r[i] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function tellNotes(r: LintReport): TellNote[] {
  const seen = new Set<string>();
  const notes: TellNote[] = [];
  for (const h of r.hits) {
    if (h.weight <= 0) continue;
    const key = `${h.id}:${h.text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const def = TELL_HINTS.get(h.id);
    notes.push({ text: h.text.length > 90 ? h.text.slice(0, 87) + "..." : h.text, label: h.label, hint: def });
  }
  for (const m of r.metrics) if (m.triggered) notes.push({ text: `(${m.label.toLowerCase()})`, label: m.label, hint: METRIC_HINT[m.id] });
  return notes;
}

const TELL_HINTS = new Map(TELLS.map((t) => [t.id, t.hint ?? ""]));
const METRIC_HINT: Record<string, string> = {
  "rhythm-sentence-cv": "Sentence lengths are too even. Mix very short and long sentences.",
  "rhythm-paragraph-cv": "Paragraph lengths are too even.",
  "hedge-density": "Too many hedges. Remove the ones that do not reflect real uncertainty.",
};

export async function humanize(input: string, o: HumanizeOptions): Promise<HumanizeResult> {
  const p = o.provider;
  const usage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  const emit = (e: PipelineEvent) => o.onEvent?.(e);
  const signals = [o.signal, o.deadline ? AbortSignal.timeout(Math.max(1000, o.deadline - Date.now() + 35000)) : undefined].filter((s): s is AbortSignal => !!s);
  const signal = signals.length ? AbortSignal.any(signals) : undefined;
  const late = () => o.deadline !== undefined && Date.now() > o.deadline;
  const call = async (role: "writer" | "judge", system: string, user: string, schema: Record<string, unknown>, maxTokens: number, effort?: "low" | "medium" | "high") => {
    const r = await p.call({ role, system, user, schema, maxTokens, effort, signal });
    usage.calls++;
    usage.inputTokens += r.inputTokens;
    usage.outputTokens += r.outputTokens;
    return r.text;
  };

  const normalized = input.replace(/\r\n?/g, "\n").trim();
  const blocks = splitBlocks(normalized);
  const before = lint(normalized);
  const plans: ParagraphPlan[] = blocks.map((b, i) => {
    const words = countWords(b.text);
    const rewrite = (b.kind === "paragraph" || b.kind === "list") && words >= MIN_WORDS_TO_REWRITE;
    return { i, kind: b.kind, words, rewrite };
  });
  emit({ type: "plan", paragraphs: plans, before });

  const voice = o.voice ? { description: describeVoice(o.voice), excerpts: o.voice.excerpts.slice(0, 3) } : undefined;
  const maxLoops = o.maxLoops ?? 2;

  const baseFor = (i: number): ParagraphResult => ({
    i, original: blocks[i].text, text: blocks[i].text, rewritten: false, flagged: false, fallback: null, issues: [], claims: 0, missing: [], added: [],
    frozenMissing: [], qualityOriginal: null, qualityChosen: null, loops: 0, candidatesTried: 0, cleanedChars: false,
  });
  // Keeps the paragraph as written, minus banned characters.
  const keepOriginal = (r: ParagraphResult, fallback: ParagraphResult["fallback"]): ParagraphResult => {
    const cleaned = stripBanned(normalizeFrozenDashes(r.original));
    emit({ type: "stage", i: r.i, stage: "done" });
    return { ...r, text: cleaned, rewritten: false, flagged: fallback !== null, fallback, missing: [], added: [], frozenMissing: [], cleanedChars: cleaned !== r.original };
  };

  const processOne = async (i: number): Promise<ParagraphResult> => {
    const block = blocks[i];
    const plan = plans[i];
    const base = baseFor(i);
    if (!plan.rewrite) {
      emit({ type: "stage", i, stage: "skipped" });
      const cleaned = stripBanned(block.text);
      return { ...base, text: cleaned, cleanedChars: cleaned !== block.text };
    }
    if (late()) return keepOriginal(base, "time");
    const rid = requestId();
    const para = normalizeFrozenDashes(block.text);
    const spans: Frozen[] = freeze(para);
    const locked = uniqueFrozen(spans).map((s) => s.text);
    const pl = lint(para);
    const n = countWords(para);
    const range = rangeFor(n);
    const hard = hardRangeFor(n);
    const sents = sentences(para);
    const isList = block.kind === "list";
    const mode: Mode = o.mode;

    if (mode === "light" && pl.flagged.length === 0) {
      emit({ type: "stage", i, stage: "done" });
      return { ...base, text: para };
    }

    const winput = {
      rid, mode, tone: o.tone, paragraph: para, locked, tells: tellNotes(pl), range,
      context: { before: blocks[i - 1]?.kind === "paragraph" ? blocks[i - 1].text : undefined, after: blocks[i + 1]?.kind === "paragraph" ? blocks[i + 1].text : undefined },
      voice, isList,
    };

    let claims: string[] | undefined;
    if (mode === "deep") {
      emit({ type: "stage", i, stage: "extracting" });
      const j = parseJson<{ claims: string[] }>(await call("judge", CLAIMS_SYSTEM, claimsPrompt(rid, para), SCHEMAS.claims, 500 + 2 * n));
      claims = (j.claims ?? []).filter((c) => typeof c === "string" && c.trim());
    }

    emit({ type: "stage", i, stage: "writing" });
    // Two drafts run about 2.6 tokens per source word; a cut-off reply is
    // retried with double the budget.
    const maxOut = Math.round(2.6 * n) + 600;
    const maxRepair = Math.round(1.4 * n) + 500;
    let texts: string[] = [];
    if (mode === "light") {
      const j = parseJson<{ candidates: { edits: { n: number; text: string }[] }[] }>(
        await call("writer", WRITER_SYSTEM, lightPrompt(winput, sents.map((s) => s.text), pl.flagged), SCHEMAS.edits, maxOut),
      );
      texts = (j.candidates ?? []).slice(0, 2).map((c) => {
        let out = para;
        const edits = [...(c.edits ?? [])].filter((e) => pl.flagged.includes(e.n - 1) && sents[e.n - 1]).sort((a, b) => b.n - a.n);
        for (const e of edits) {
          const s = sents[e.n - 1];
          out = out.slice(0, s.start) + e.text.trim() + out.slice(s.end);
        }
        return out;
      });
    } else {
      // Models in JSON-object mode sometimes wrap each draft in an object; take
      // its first string field. One retry if no draft comes back at all.
      const asText = (c: unknown): string =>
        typeof c === "string" ? c : c && typeof c === "object" ? ((Object.values(c).find((v) => typeof v === "string") as string | undefined) ?? "") : "";
      for (let attempt = 0; attempt < 2; attempt++) {
        const j = parseJson<{ candidates: unknown[] }>(await call("writer", WRITER_SYSTEM, writerPrompt({ ...winput, claims }), SCHEMAS.candidates, maxOut));
        texts = (Array.isArray(j.candidates) ? j.candidates : []).map(asText).filter((t) => t.trim()).slice(0, 2);
        if (texts.length) break;
      }
    }
    // Never let the source stand in for a draft: it would pass every check.
    if (!texts.length) throw new ProviderError("bad_output", "the writer returned no drafts");

    const assess = (t: string): Candidate => {
      // Dashes and odd hyphens are typography; fix them here instead of spending a repair.
      const text = stripBanned(t.trim());
      const frozen = checkFrozen(para, text, spans);
      const w = countWords(text);
      const l = lint(text);
      // A group of three copied from the source is three claims, not a habit
      // the draft picked up; repairs cannot cut it without losing one.
      const src = para.toLowerCase();
      const carried = (h: LintReport["hits"][number]) => h.category === "triads" && src.includes(h.text.toLowerCase());
      const own = l.hits.filter((h) => !carried(h));
      const gate = w ? ((l.score - l.hits.filter(carried).reduce((a, h) => a + h.weight, 0)) / w) * 100 : 0;
      return {
        text, frozen, bannedOk: bannedChars(text).ok, words: w, inRange: w >= hard[0] && w <= hard[1],
        density: l.density, gateDensity: gate, remainingTells: tellNotes({ ...l, hits: own }), keep: keepCheck(para, text),
      };
    };

    const judgeMeaning = async (cands: Candidate[]) => {
      const labels = cands.map((_, k) => `R${k + 1}`);
      const m = parseJson<{ claims: { id: string; text: string }[]; results: { label: string; missing: string[]; added: string[] }[] }>(
        await call("judge", MEANING_SYSTEM, meaningPrompt(rid, para, cands.map((c, k) => ({ label: labels[k], text: c.text })), claims), SCHEMAS.meaning, 900 + 3 * n),
      );
      const claimText = new Map((m.claims ?? []).map((c) => [c.id, c.text]));
      base.claims = Math.max(base.claims, claims?.length ?? m.claims?.length ?? 0);
      cands.forEach((c, k) => {
        const r = (m.results ?? []).find((x) => x.label === labels[k]);
        c.missing = (r?.missing ?? []).filter((id) => claimText.has(id) || /^c\d+$/.test(id));
        c.missingText = c.missing.map((id) => claimText.get(id) ?? id);
        c.added = (r?.added ?? []).filter((a) => typeof a === "string" && a.trim());
      });
    };

    // Blind quality comparison of the passing drafts plus the original,
    // shuffled. Only needed when there is a choice to make.
    const judgeQuality = async (cands: Candidate[]) => {
      const versions = shuffle([{ key: -1, text: para }, ...cands.map((c, k) => ({ key: k, text: c.text }))]).map((v, k) => ({ ...v, label: String.fromCharCode(65 + k) }));
      const q = parseJson<{ scores: { label: string; score: number }[] }>(
        await call("judge", QUALITY_SYSTEM, qualityPrompt(rid, o.tone, versions), SCHEMAS.quality, 600),
      );
      const score = (label: string) => Math.max(1, Math.min(10, Number((q.scores ?? []).find((s) => s.label === label)?.score ?? 5)));
      for (const v of versions) {
        if (v.key === -1) base.qualityOriginal = score(v.label);
        else cands[v.key].quality = score(v.label);
      }
    };

    const passes = (c: Candidate) => c.frozen.ok && c.bannedOk && c.inRange && c.missing !== undefined && !c.missing.length && !c.added?.length;
    // A draft should also cut most of the tells (to 35% of the source). A near copy of the source
    // passes every meaning check, so without this it can win.
    const tellTarget = Math.max(2, 0.35 * pl.density);
    const keepsAll = (c: Candidate) => !c.keep.items.length && !c.keep.hedges.length;
    const tellsOk = (c: Candidate) => mode === "light" || c.gateDensity <= tellTarget;
    const combined = (c: Candidate) =>
      (c.quality ?? 5) - 0.4 * c.density - 3 * (c.missing?.length ?? 0) - 3 * (c.added?.length ?? 0) - 3 * c.frozen.missing.length - 3 * c.frozen.added.length - (c.bannedOk ? 0 : 5) - (c.inRange ? 0 : 2) - 2 * (c.keep.items.length + c.keep.hedges.length);
    const bestOf = (cs: Candidate[]) => [...cs].sort((a, b) => combined(b) - combined(a))[0];
    const tellProblems = (c: Candidate): string[] => [
      `These AI tells remain. Rewrite the sentences that contain them in plain words, keeping every claim and every listed item: ${c.remainingTells
        .map((t) => `"${t.text}" (${t.label}${t.hint ? `: ${t.hint}` : ""})`)
        .join("; ")}`,
    ];

    const problemsOf = (c: Candidate): string[] => {
      const ps: string[] = [];
      if (c.frozen.missing.length) ps.push(`These locked spans are missing or altered; include each exactly: ${JSON.stringify(c.frozen.missing)}`);
      if (c.frozen.added.length) ps.push(`Remove details that are not in the source: ${JSON.stringify(c.frozen.added)}`);
      if (c.missingText?.length) ps.push(`These claims from the source are missing or changed; restore their meaning in plain words (not the source's wording): ${JSON.stringify(c.missingText)}`);
      if (c.added?.length) ps.push(`Remove content the source does not say: ${JSON.stringify(c.added)}`);
      if (!c.inRange) ps.push(`The draft has ${c.words} words; it must have ${range[0]} to ${range[1]}.`);
      if (!c.bannedOk) ps.push("Remove every em dash and en dash and any unusual characters.");
      if (c.keep.items.length) ps.push(`These items from the source's lists are missing; keep each one: ${JSON.stringify(c.keep.items)}`);
      if (c.keep.hedges.length) ps.push(`The source says ${c.keep.hedges.map((h) => `"${h}"`).join(", ")}; keep that qualifier or one that means the same.`);
      // Restored claims tend to come back in the source's wording, tells and all,
      // so name the tells to avoid. The list-item and hedge checks keep this
      // from costing a listed item.
      const avoid = winput.tells.filter((t) => !t.text.startsWith("(") && t.text.trim().includes(" "));
      if (ps.length && avoid.length) ps.push(`While fixing, do not reuse these source phrasings, which read as AI-written: ${avoid.map((t) => `"${t.text}"`).join(", ")}`);
      return ps;
    };

    let pool = texts.map(assess);
    const all: Candidate[] = [];
    let loops = 0;
    let chosen: Candidate | null = null;
    while (true) {
      if (late()) break;
      emit({ type: "stage", i, stage: "checking" });
      const detOk = pool.filter((c) => c.frozen.ok && c.bannedOk && c.inRange);
      // If every candidate fails the cheap checks, repair before spending judge calls.
      if (!detOk.length && loops < maxLoops) {
        const best = [...pool].sort((a, b) => combined(b) - combined(a))[0];
        all.push(...pool);
        loops++;
        emit({ type: "stage", i, stage: "repairing" });
        const j = parseJson<{ text: string }>(
          await call("writer", WRITER_SYSTEM, repairPrompt({ rid, tone: o.tone, paragraph: para, draft: best.text, problems: problemsOf(best), locked, range }), SCHEMAS.text, maxRepair),
        );
        pool = [assess(j.text ?? best.text)];
        continue;
      }
      await judgeMeaning(pool);
      all.push(...pool);
      const ok = pool.filter(passes);
      const done = ok.filter((c) => keepsAll(c) && tellsOk(c));
      if (done.length > 1) await judgeQuality(done);
      if (done.length) {
        chosen = bestOf(done);
        break;
      }
      if (loops >= maxLoops) break;
      // Meaning holds but tells remain: repair the tells. Otherwise repair
      // the hard failures of the best draft.
      const best = ok.length ? bestOf(ok) : bestOf(pool);
      const tellsOnly = ok.length > 0 && keepsAll(best);
      loops++;
      emit({ type: "stage", i, stage: "repairing" });
      const j = parseJson<{ text: string }>(
        await call("writer", WRITER_SYSTEM, repairPrompt({ rid, tone: o.tone, paragraph: para, draft: best.text, problems: tellsOnly ? tellProblems(best) : problemsOf(best), locked, range }), SCHEMAS.text, maxRepair),
      );
      pool = [assess(j.text ?? best.text)];
    }

    let fallback: ParagraphResult["fallback"] = null;
    // Out of repairs: a draft that keeps the meaning but still has some tells
    // is fine to use, preferring one that kept every list item and hedge.
    if (!chosen && all.some(passes)) chosen = bestOf(all.filter((c) => passes(c) && keepsAll(c)).length ? all.filter((c) => passes(c) && keepsAll(c)) : all.filter(passes));
    if (!chosen) {
      // A draft the judge cleared on meaning but that missed the length range
      // is still safe to use. Anything that changed the meaning is not: keep
      // the original paragraph instead.
      const safe = all.filter((c) => c.missing !== undefined && !c.missing.length && !c.added?.length && c.frozen.ok && c.bannedOk);
      if (!safe.length) {
        const best = [...all].sort((a, b) => combined(b) - combined(a))[0];
        return keepOriginal({ ...base, loops, candidatesTried: all.length, issues: best ? problemsOf(best) : [] }, late() && !all.some((c) => c.missing !== undefined) ? "time" : "original");
      }
      fallback = "length";
      chosen = safe.sort((a, b) => combined(b) - combined(a))[0];
    }
    const cleaned = stripBanned(chosen.text);
    const issues = fallback ? problemsOf(chosen) : [];
    emit({ type: "stage", i, stage: "done" });
    return {
      ...base,
      text: cleaned,
      rewritten: true,
      flagged: fallback !== null,
      fallback,
      issues,
      missing: chosen.missingText ?? [],
      added: [...(chosen.added ?? []), ...chosen.frozen.added],
      frozenMissing: chosen.frozen.missing,
      qualityChosen: chosen.quality ?? null,
      loops,
      candidatesTried: all.length,
      cleanedChars: cleaned !== chosen.text,
    };
  };

  // Capped concurrency across paragraphs.
  const results: ParagraphResult[] = new Array(blocks.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, o.concurrency ?? 3) }, async () => {
    while (next < blocks.length) {
      const i = next++;
      emit({ type: "stage", i, stage: "queued" });
      try {
        results[i] = await processOne(i);
      } catch (e) {
        // The client left, or the key is bad: stop the run. Any other failure
        // (rate limit, outage, cut-off at the deadline) keeps this paragraph as written.
        if (o.signal?.aborted || (e instanceof ProviderError && (e.code === "auth" || e.code === "no_key"))) throw e;
        // Local debugging only; never set in production, where the message could quote model output.
        if (process.env.PLAINSPOKEN_DEBUG) console.error(`paragraph ${i}:`, e);
        results[i] = keepOriginal(baseFor(i), late() || signal?.aborted ? "time" : "error");
      }
      emit({ type: "paragraph", result: results[i] });
    }
  });
  await Promise.all(workers);

  const text = joinBlocks(results.map((r) => r.text));
  const after = lint(text);
  const missing = results.flatMap((r) => r.missing);
  const added = results.flatMap((r) => r.added);
  return {
    text,
    before,
    after,
    paragraphs: results,
    meaning: { claims: results.reduce((a, r) => a + r.claims, 0), missing, added, ok: !missing.length && !added.length && results.every((r) => !r.frozenMissing.length) },
    flagged: results.filter((r) => r.flagged).length,
    usage,
    provider: { name: p.name, writer: p.models.writer, judge: p.models.judge, source: p.source },
  };
}
