// Deterministic AI-tell linter. No model calls. Scores and locates the tells
// defined in tells.json.
import data from "./tells.json";
import { freeze } from "./freeze";
import { countWords, cv, sentences, splitBlocks, words, type Span } from "./text";

export interface TellDef {
  id: string;
  category: string;
  label: string;
  hint?: string;
  kind: "regex" | "terms" | "special" | "metric";
  pattern?: string;
  flags?: string;
  scope?: "sentenceStart";
  terms?: string[];
  special?: string;
  metric?: string;
  below?: number;
  above?: number;
  floor?: number;
  ceiling?: number;
  minCount?: number;
  concreteBonus?: number;
  weight: number;
  sources: string[];
}

export interface Hit {
  id: string;
  category: string;
  label: string;
  start: number;
  end: number;
  text: string;
  weight: number;
}

export interface MetricResult {
  id: string;
  label: string;
  category: string;
  value: number;
  penalty: number;
  triggered: boolean;
}

export interface LintReport {
  words: number;
  sentenceCount: number;
  score: number;
  density: number;
  hits: Hit[];
  metrics: MetricResult[];
  categories: Record<string, number>;
  flagged: number[];
  sentenceLengths: number[];
}

export const TELLS = data.tells as TellDef[];
export const SOURCES = data.sources as Record<string, { title: string; url: string; accessed: string; read: string }>;
export const CATEGORY_LABELS: Record<string, string> = {
  contrast: "Contrast framing",
  triads: "Groups of three",
  vocabulary: "Stock vocabulary",
  connectors: "Formal connectors",
  lessons: "Lessons and summaries",
  openings: "Stock openings and endings",
  dashes: "Em and en dashes",
  ranges: "False ranges",
  formatting: "Over-formatting",
  rhythm: "Rhythm",
  hedges: "Hedging",
  grandiose: "Grandiose or vague claims",
};

const compiled = TELLS.map((t) => {
  if (t.kind === "regex") return { t, re: new RegExp(t.scope === "sentenceStart" ? `^(?:${t.pattern})` : t.pattern!, t.flags ?? "g") };
  if (t.kind === "terms" || (t.kind === "metric" && t.terms)) {
    return { t, re: new RegExp(`(?<![\\p{L}\\p{N}-])(?:${t.terms!.join("|")})(?![\\p{L}\\p{N}-])`, "giu") };
  }
  return { t, re: null as RegExp | null };
});

const IDIOM_RANGES = /^(?:bad to worse|time to time|start to finish|head to toe|top to bottom|day to day|door to door|side to side|place to place|one to (?:another|the next)|beginning to end|rags to riches|dawn to dusk|morning to night|cover to cover|end to end|back to front|left to right|right to left|scratch to|point a to point b)/;
const CHANGE_VERB = /\b(?:went|go|goes|going|gone|grew|grow|grows|growing|moved|move|moves|moving|changed|shifted|rose|fell|increased|decreased|dropped|jumped|climbed|switched|transitioned|drove|drive|traveled|travelled|flew|walked|commute[sd]?|ran|run|turned|evolved|upgraded|downgraded|migrated|converted|translated|promoted)\s+(?:\w+\s+)?$/i;
const RANGE_LEAD = /\b(?:everything|anything|all|ranging|spanning|varying|vary|varies|range|ranges)\s+$/i;

// Abstract nouns and quality adjectives, by suffix or from a short list of the
// usual ones, plus hyphenated compounds like "data-driven".
const ABSTRACT_SUFFIX = /(?:tion|sion|ity|ness|ment|ance|ence|ship|ism|ive|ous|ful|less|ical|able|ible|ent|ant|ic)$/i;
const ABSTRACT_WORDS = new Set(
  "trust growth purpose focus speed value impact change power balance vision quality insight clarity meaning depth scale reach care joy hope love freedom courage strength wisdom energy passion progress success excellence".split(" "),
);
function isAbstract(item: string): boolean {
  return item.split(" ").some((w) => w.includes("-") || ABSTRACT_SUFFIX.test(w) || ABSTRACT_WORDS.has(w.toLowerCase()));
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }) {
  return a.start < b.end && b.start < a.end;
}

function specialHits(t: TellDef, text: string, sents: Span[], proseSents: Span[], totalWords: number): Hit[] {
  const hits: Hit[] = [];
  const mk = (start: number, end: number, weight = t.weight): Hit => ({
    id: t.id, category: t.category, label: t.label, start, end, text: text.slice(start, end), weight,
  });
  if (t.special === "triad") {
    // Find ", B, and C" then take A and C with the same word count as B, so
    // only parallel triads ("faster X, better Y, and happier Z") count.
    const re = /, ([\p{L}'’-]+(?: [\p{L}'’-]+){0,2}),? (?:and|or) /gu;
    for (const s of sents) {
      for (const m of s.text.matchAll(re)) {
        const n = m[1].split(" ").length;
        const before = s.text.slice(0, m.index!).match(new RegExp(`((?:[\\p{L}'\\u2019-]+ ){${n - 1}}[\\p{L}'\\u2019-]+)$`, "u"));
        const after = s.text.slice(m.index! + m[0].length).match(new RegExp(`^((?:[\\p{L}'\\u2019-]+ ){${n - 1}}[\\p{L}'\\u2019-]+)(?![\\p{L}'\\u2019-])`, "u"));
        if (!before || !after) continue;
        const items = [before[1], m[1], after[1]];
        // Lists of names or numbers are content, not rhythm.
        if (items.some((x) => /\d|[A-Z]/.test(x.slice(1))) || /^[A-Z]/.test(m[1]) || /^[A-Z]/.test(after[1])) continue;
        // So are concrete lists ("product, engineering, and marketing"). The
        // tell is a run of abstract qualities, so two of the three must be.
        if (items.filter(isAbstract).length < 2) continue;
        const start = s.start + m.index! - before[1].length;
        const end = s.start + m.index! + m[0].length + after[1].length;
        hits.push(mk(start, end));
      }
    }
    // A single triad in a short piece is normal writing; weigh it down.
    if (hits.length === 1 && totalWords < 150) hits[0].weight = t.weight / 2;
  } else if (t.special === "fragmentRun") {
    let run: Span[] = [];
    const flush = () => {
      if (run.length >= 3) hits.push(mk(run[0].start, run[run.length - 1].end));
      run = [];
    };
    for (const s of proseSents) {
      if (countWords(s.text) <= 4 && /[.!]$/.test(s.text)) run.push(s);
      else flush();
    }
    flush();
  } else if (t.special === "fromTo") {
    const re = /\b[Ff]rom ((?:[a-z][\p{L}'-]*)(?: [a-z][\p{L}'-]*){0,3}) to ((?:[a-z][\p{L}'-]*)(?: [a-z][\p{L}'-]*){0,3})/gu;
    for (const s of sents) {
      for (const m of s.text.matchAll(re)) {
        const phrase = `${m[1]} to ${m[2]}`;
        if (IDIOM_RANGES.test(phrase)) continue;
        const before = s.text.slice(0, m.index!);
        if (CHANGE_VERB.test(before)) continue;
        const after = s.text.slice(m.index! + m[0].length);
        const sentenceInitial = before.trim() === "" && /^,/.test(after);
        const chained = /^(?:,? (?:and|to) |, )/.test(after);
        if (sentenceInitial || chained || RANGE_LEAD.test(before)) {
          hits.push(mk(s.start + m.index!, s.start + m.index! + m[0].length));
        }
      }
    }
  } else if (t.special === "headingInShortText") {
    if (totalWords < 300) {
      for (const m of text.matchAll(/^#{1,6} .+$/gm)) hits.push(mk(m.index!, m.index! + m[0].length));
    }
  } else if (t.special === "openers") {
    if (proseSents.length >= 4) {
      const first = proseSents.map((s) => (s.text.match(/[\p{L}']+/u)?.[0] ?? "").toLowerCase());
      // Runs of three or more consecutive sentences with the same first word.
      let i = 0;
      while (i < first.length) {
        let j = i;
        while (j + 1 < first.length && first[j + 1] === first[i] && first[i]) j++;
        if (j - i + 1 >= 3) hits.push(mk(proseSents[i].start, proseSents[j].end));
        i = j + 1;
      }
      // One opener used for a quarter or more of all sentences.
      if (proseSents.length >= 6) {
        const counts = new Map<string, number>();
        for (const w of first) if (w) counts.set(w, (counts.get(w) ?? 0) + 1);
        for (const [w, c] of counts) {
          if (c >= 3 && c / first.length >= 0.25) {
            const idx = first.map((x, k) => (x === w ? k : -1)).filter((k) => k >= 0).slice(2);
            for (const k of idx) {
              const s = proseSents[k];
              if (!hits.some((h) => overlaps(h, s))) hits.push(mk(s.start, s.start + w.length, t.weight / 2));
            }
          }
        }
      }
    }
  }
  return hits;
}

function sentenceHasConcreteDetail(s: string): boolean {
  return /\d/.test(s) || /\s[A-Z][a-z]/.test(s.slice(1));
}

export function lint(text: string): LintReport {
  const sents = sentences(text);
  const blocks = splitBlocks(text);
  // Prose sentences only (skip headings, lists, code) for rhythm metrics.
  const proseRanges: { start: number; end: number }[] = [];
  let cursor = 0;
  const paraLengths: number[] = [];
  for (const b of blocks) {
    const at = text.indexOf(b.text, cursor);
    if (at >= 0) {
      if (b.kind === "paragraph") {
        proseRanges.push({ start: at, end: at + b.text.length });
        paraLengths.push(countWords(b.text));
      }
      cursor = at + b.text.length;
    }
  }
  const proseSents = sents.filter((s) => proseRanges.some((r) => s.start >= r.start && s.end <= r.end));
  const totalWords = countWords(text);
  const protectedSpans = freeze(text).filter((f) => f.kind === "quote" || f.kind === "code" || f.kind === "url");

  let hits: Hit[] = [];
  const metrics: MetricResult[] = [];
  for (const { t, re } of compiled) {
    if (t.kind === "metric") continue;
    if (t.kind === "special") {
      hits.push(...specialHits(t, text, sents, proseSents, totalWords));
      continue;
    }
    if (!re) continue;
    if (t.scope === "sentenceStart") {
      for (const s of sents) {
        const lead = s.text.match(/^["'“‘(\s]*/)![0].length;
        const m = s.text.slice(lead).match(re);
        if (m) hits.push({ id: t.id, category: t.category, label: t.label, start: s.start + lead, end: s.start + lead + m[0].length, text: m[0], weight: t.weight });
      }
      continue;
    }
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      if (!m[0]) continue;
      let weight = t.weight;
      if (t.concreteBonus) {
        const s = sents.find((x) => m.index! >= x.start && m.index! < x.end);
        if (s && !sentenceHasConcreteDetail(s.text)) weight += t.concreteBonus;
      }
      hits.push({ id: t.id, category: t.category, label: t.label, start: m.index!, end: m.index! + m[0].length, text: m[0], weight });
    }
  }
  // Tells inside quotes, code and URLs belong to someone else; do not score them.
  hits = hits.filter((h) => !protectedSpans.some((p) => h.start >= p.start && h.end <= p.end));
  hits.sort((a, b) => a.start - b.start);

  // Metrics
  const sentLens = proseSents.map((s) => countWords(s.text)).filter((n) => n > 0);
  for (const t of TELLS.filter((x) => x.kind === "metric")) {
    let value = 0;
    let count = 0;
    if (t.metric === "sentenceLengthCV") {
      value = cv(sentLens);
      count = sentLens.length;
    } else if (t.metric === "paragraphLengthCV") {
      value = cv(paraLengths);
      count = paraLengths.length;
    } else if (t.metric === "hedgeDensity") {
      const re = compiled.find((c) => c.t.id === t.id)!.re!;
      let n = 0;
      for (const m of text.matchAll(re)) n += /^(?:may|might|could)$/i.test(m[0]) ? 0.5 : 1;
      value = totalWords ? (n / totalWords) * 100 : 0;
      count = totalWords;
    }
    let penalty = 0;
    if (count >= (t.minCount ?? 1)) {
      if (t.below !== undefined && value < t.below) penalty = Math.min(1, (t.below - value) / (t.below - (t.floor ?? 0)));
      if (t.above !== undefined && value > t.above) penalty = Math.min(1, (value - t.above) / ((t.ceiling ?? t.above * 2) - t.above));
    }
    metrics.push({ id: t.id, label: t.label, category: t.category, value: round(value, 3), penalty: round(penalty * t.weight, 3), triggered: penalty > 0 });
  }

  const categories: Record<string, number> = {};
  for (const h of hits) categories[h.category] = (categories[h.category] ?? 0) + h.weight;
  for (const m of metrics) if (m.penalty) categories[m.category] = (categories[m.category] ?? 0) + m.penalty;
  for (const k of Object.keys(categories)) categories[k] = round(categories[k], 2);

  const score = round(hits.reduce((a, h) => a + h.weight, 0) + metrics.reduce((a, m) => a + m.penalty, 0), 2);
  const flagged = sents.map((s, i) => (hits.some((h) => h.weight > 0 && overlaps(h, s)) ? i : -1)).filter((i) => i >= 0);
  return {
    words: totalWords,
    sentenceCount: sents.length,
    score,
    density: totalWords ? round((score / totalWords) * 100, 2) : 0,
    hits,
    metrics,
    categories,
    flagged,
    sentenceLengths: sentLens,
  };
}

function round(x: number, d: number) {
  const p = 10 ** d;
  return Math.round(x * p) / p;
}

export function tellReduction(before: LintReport, after: LintReport): number {
  if (before.density === 0) return after.density === 0 ? 1 : 0;
  return round(1 - after.density / before.density, 4);
}

export { words };
