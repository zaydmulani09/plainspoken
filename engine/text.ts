// Text primitives shared by the linter, freezer, voice card and pipeline.
// Everything here is deterministic and runs in the browser and on the server.

export type BlockKind = "paragraph" | "heading" | "list" | "code" | "blank";

export interface Block {
  kind: BlockKind;
  text: string;
}

export interface Span {
  text: string;
  start: number;
  end: number;
}

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*(?:[-.][\p{L}\p{N}]+)*/gu;

export function words(text: string): string[] {
  return text.match(WORD) ?? [];
}

export function countWords(text: string): number {
  return words(text).length;
}

// Splits a document into blocks separated by blank lines, keeping fenced code
// blocks whole even when they contain blank lines.
export function splitBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let buf: string[] = [];
  let inFence = false;
  const flush = () => {
    if (!buf.length) return;
    const t = buf.join("\n");
    buf = [];
    blocks.push({ kind: classify(t), text: t });
  };
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      if (!inFence) flush();
      buf.push(line);
      inFence = !inFence;
      if (!inFence) {
        blocks.push({ kind: "code", text: buf.join("\n") });
        buf = [];
      }
      continue;
    }
    if (inFence) {
      buf.push(line);
      continue;
    }
    if (!line.trim()) flush();
    else buf.push(line);
  }
  if (inFence) blocks.push({ kind: "code", text: buf.join("\n") });
  else flush();
  return blocks;
}

function classify(t: string): BlockKind {
  if (/^#{1,6}\s/.test(t) && !t.includes("\n")) return "heading";
  const lines = t.split("\n");
  if (lines.every((l) => /^\s*(?:[-*+•]|\d+[.)])\s+/.test(l) || /^\s{2,}\S/.test(l))) return "list";
  if (lines.every((l) => /^( {4}|\t)/.test(l))) return "code";
  return "paragraph";
}

export function joinBlocks(blocks: string[]): string {
  return blocks.join("\n\n");
}

const ABBREV = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e|cf|al|approx|Inc|Ltd|Co|Corp|No|Fig|Vol|U\.S|U\.K|a\.m|p\.m|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.$/i;

let segmenter: Intl.Segmenter | null = null;

// Sentence spans with offsets. Intl.Segmenter splits after abbreviations like
// "Dr." so those fragments are merged back.
export function sentences(text: string): Span[] {
  segmenter ??= new Intl.Segmenter("en", { granularity: "sentence" });
  const raw: Span[] = [];
  for (const s of segmenter.segment(text)) {
    raw.push({ text: s.segment, start: s.index, end: s.index + s.segment.length });
  }
  const merged: Span[] = [];
  for (const s of raw) {
    const prev = merged[merged.length - 1];
    if (prev && (ABBREV.test(prev.text.trimEnd()) || /^\s*[a-z0-9]/.test(s.text) && !/[.!?]["')\]]*\s*$/.test(prev.text))) {
      prev.text += s.text;
      prev.end = s.end;
    } else merged.push({ ...s });
  }
  // Also split on hard line breaks inside a block (lists, short lines).
  const out: Span[] = [];
  for (const s of merged) {
    let offset = 0;
    for (const part of s.text.split(/(?<=\n)/)) {
      const lead = part.length - part.trimStart().length;
      const t = part.trim();
      if (t) out.push({ text: t, start: s.start + offset + lead, end: s.start + offset + lead + t.length });
      offset += part.length;
    }
  }
  return out;
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

export function cv(xs: number[]): number {
  const m = mean(xs);
  return m ? stdev(xs) / m : 0;
}

// Function words carry no claim. Negations, "about", "more" and "most" stay
// out of this list on purpose: dropping one changes a claim.
const FUNCTION_WORDS = new Set(
  "a an the and or but nor so yet of in on at to for from by with as is are was were be been being am do does did has have had it its this that these those there their they them we us our you your i me my he she his her him which who whom whose what when where while than then also just very into onto over under".split(" "),
);
const stem = (w: string) => w.toLowerCase().replace(/['’]s$/, "").replace(/(?:ing|ed|ly|(?<!s)s)$/, "");

// Source words with no form in the rewrite, in source order, for the meaning
// judge to look at. Most are harmless swaps; some are a dropped hedge or item.
export function droppedWords(source: string, rewrite: string, limit = 40): string[] {
  const have = new Set(words(rewrite).map(stem));
  const out: string[] = [];
  for (const w of words(source)) {
    const l = w.toLowerCase();
    if (FUNCTION_WORDS.has(l) || /^\d/.test(l) || have.has(stem(w)) || out.includes(l)) continue;
    out.push(l);
    if (out.length >= limit) break;
  }
  return out;
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Moving-average type-token ratio over a fixed window, a length-robust measure
// of lexical diversity.
export function mattr(text: string, window = 50): number {
  const toks = words(text).map((w) => w.toLowerCase());
  if (toks.length === 0) return 0;
  if (toks.length <= window) return new Set(toks).size / toks.length;
  const counts = new Map<string, number>();
  for (let i = 0; i < window; i++) counts.set(toks[i], (counts.get(toks[i]) ?? 0) + 1);
  let total = counts.size / window;
  let n = 1;
  for (let i = window; i < toks.length; i++) {
    const out = toks[i - window];
    const c = counts.get(out)! - 1;
    if (c) counts.set(out, c);
    else counts.delete(out);
    counts.set(toks[i], (counts.get(toks[i]) ?? 0) + 1);
    total += counts.size / window;
    n++;
  }
  return total / n;
}
