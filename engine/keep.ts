// Deterministic meaning checks for what a small judge tends to miss: every
// item of a listed series, and every hedge or frequency word, must survive.
import { words } from "./text";

const stem = (w: string) => w.toLowerCase().replace(/['’]s$/, "").replace(/(?:ing|ed|ly|(?<!s)s)$/, "");
const SMALL = new Set("a an the and or of to in on at for with by from as is are its their our your his her my this that these those which who".split(" "));

// A rewrite may swap a hedge for another in its group, not drop it.
const HEDGES: string[][] = [
  ["often", "frequently", "regularly", "commonly"],
  ["usually", "typically", "generally", "normally", "mostly"],
  ["sometimes", "occasionally"],
  ["rarely", "seldom"],
  ["never"],
  ["always"],
  ["may", "might", "could", "possibly", "perhaps", "maybe"],
  ["likely", "probably"],
  ["some", "several"],
  ["many", "numerous"],
  ["most"],
  ["few"],
  ["approximately", "roughly", "nearly", "almost"],
  ["only", "solely", "merely"],
];

function has(text: string, h: string): boolean {
  // "May" capitalized is usually the month.
  const forms = h === "may" ? h : `${h}|${h[0].toUpperCase()}${h.slice(1)}`;
  return new RegExp(`(?<![\\p{L}'’-])(?:${forms})(?![\\p{L}'’-])`, "u").test(text);
}

const W = String.raw`[\p{L}'’-]+`;
const ITEM = `${W}(?: ${W}){0,3}`;
const SERIES = new RegExp(`${ITEM}(?:, ${ITEM})+,? (?:and|or) ${ITEM}`, "gu");

// The match can start mid-clause and run past the last item, so the first
// item is its last word and the last item its first content word.
function seriesItems(source: string): string[][] {
  const out: string[][] = [];
  for (const m of source.matchAll(SERIES)) {
    const parts = m[0].split(/,? (?:and|or) |, /u);
    if (parts.length < 3) continue;
    const content = (p: string) => p.split(" ").filter((w) => !SMALL.has(w.toLowerCase()));
    out.push(
      parts
        .map((p, i) => (i === 0 ? content(p).slice(-1) : i === parts.length - 1 ? content(p).slice(0, 1) : content(p)).join(" "))
        .filter(Boolean),
    );
  }
  return out;
}

export interface KeepReport {
  items: string[];
  hedges: string[];
}

export function keepCheck(source: string, draft: string): KeepReport {
  const hy = (t: string) => t.replace(/[\u{2010}\u{2011}]/gu, "-");
  [source, draft] = [hy(source), hy(draft)];
  const have = new Set(words(draft).map(stem));
  const items = new Set<string>();
  for (const series of seriesItems(source)) {
    for (const item of series) if (!words(item).some((w) => have.has(stem(w)))) items.add(item);
  }
  const hedges: string[] = [];
  for (const group of HEDGES) {
    const said = group.find((h) => has(source, h));
    if (said && !group.some((h) => has(draft, h))) hedges.push(said);
  }
  return { items: [...items], hedges };
}
