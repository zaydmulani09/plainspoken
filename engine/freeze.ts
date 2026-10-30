// Freeze: find spans that a rewrite must keep verbatim (numbers, dates, names,
// URLs, citations, code, quoted text, [placeholders]) and check that a
// candidate kept them and added none of its own.
import { sentences } from "./text";

export type FrozenKind = "code" | "url" | "email" | "quote" | "placeholder" | "citation" | "date" | "number" | "name";

export interface Frozen {
  text: string;
  kind: FrozenKind;
  start: number;
  end: number;
}

const MONTH = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const DAY = "(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day";

const PATTERNS: [FrozenKind, RegExp][] = [
  ["code", /```[\s\S]*?```|`[^`\n]+`/g],
  ["url", /\b(?:https?:\/\/|www\.)[^\s<>"'()]+[^\s<>"'().,;:!?]/g],
  ["email", /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g],
  ["quote", /"[^"\n]{1,600}"|“[^”\n]{1,600}”/g],
  ["citation", /\[\d+(?:\s*[,-]\s*\d+)*\]|\((?:[A-Z][\p{L}'-]+(?: et al\.)?(?:,? (?:and|&) [A-Z][\p{L}'-]+)?),? \d{4}[a-z]?(?:[,;] (?:p{1,2}\. ?)?\d+(?:-\d+)?)?\)|\b[A-Z][\p{L}'-]+(?: et al\.)? \(\d{4}[a-z]?\)/gu],
  ["placeholder", /\[[^[\]\n]{1,120}\]/g],
  ["date", new RegExp(`\\b(?:${DAY},? )?${MONTH}\\.? \\d{1,2}(?:st|nd|rd|th)?(?:,? \\d{4})?\\b|\\b\\d{1,2}(?:st|nd|rd|th)? (?:of )?${MONTH} \\d{4}\\b|\\b${MONTH} \\d{4}\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b|\\b\\d{1,2}/\\d{1,2}/\\d{2,4}\\b|\\b${DAY}s?\\b`, "g")],
  ["number", /(?:[$€£¥]\s?)?\b\d{1,3}(?:,\d{3})+(?:\.\d+)?(?:%|\b)|(?:[$€£¥]\s?)?\b\d+(?:\.\d+)?(?::\d{2})?(?:\s?(?:%|percent\b|[ap]\.?m\.?|k\b|[KMB]\b|(?:thousand|million|billion|trillion)\b))?|\b\d+(?:st|nd|rd|th)\b/g],
];

// Words that are capitalized at sentence start but are not names.
const SENTENCE_WORDS = new Set(
  "a an the this that these those it its i i'm i've i'd i'll we our you your he she they their my me us there here what when where why how who which if but and or so yet for nor as at by in on of to from with after before while because although though since unless until once also just then now still even only every each all some many most few no not one two three first second next last finally however furthermore moreover additionally overall ultimately today yesterday tomorrow".split(" "),
);
const CONNECTORS = new Set(["of", "the", "and", "for", "de", "la", "van", "von", "der", "&"]);

function nameSpans(text: string): Frozen[] {
  const out: Frozen[] = [];
  const cap = /^[A-Z][\p{L}'’.-]*$|^[A-Z]{2,}s?$|^[a-z]+[A-Z][\p{L}]*$/u;
  // Capitalized words seen mid-sentence anywhere count as names even at sentence start.
  const midCaps = new Set<string>();
  const sents = sentences(text);
  const tokenize = (s: string) => [...s.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’.&-]*/gu)];
  for (const s of sents) {
    const toks = tokenize(s.text);
    toks.forEach((m, i) => {
      if (i > 0 && cap.test(m[0].replace(/[.'’]+$/, "")) && !afterColonOrQuote(s.text, m.index!)) midCaps.add(clean(m[0]));
    });
  }
  for (const s of sents) {
    const toks = tokenize(s.text);
    let i = 0;
    while (i < toks.length) {
      const w = clean(toks[i][0]);
      const isCap = cap.test(w) && w !== "I" && !/^I['’]/.test(w);
      if (!isCap) {
        i++;
        continue;
      }
      // Grow a run: Cap (connector Cap)*, never across punctuation.
      const spaced = (a: number) => /^\s+$/.test(s.text.slice(toks[a].index! + toks[a][0].length, toks[a + 1].index!));
      let j = i;
      while (j + 1 < toks.length && spaced(j)) {
        const nxt = clean(toks[j + 1][0]);
        if (cap.test(nxt) && nxt !== "I") j++;
        else if (CONNECTORS.has(nxt.toLowerCase()) && j + 2 < toks.length && spaced(j + 1) && cap.test(clean(toks[j + 2][0]))) j += 2;
        else break;
      }
      let first = i;
      const atStart = i === 0 || afterColonOrQuote(s.text, toks[i].index!);
      if (atStart && SENTENCE_WORDS.has(w.toLowerCase())) first = i + 1;
      const runLen = j - first + 1;
      const keep =
        runLen > 0 &&
        (!atStart || first > i || runLen >= 2 || midCaps.has(clean(toks[first][0])) || /^[A-Z]{2,}s?$/.test(clean(toks[first][0])) || /[a-z][A-Z]/.test(toks[first][0]));
      if (keep && first <= j) {
        const st = s.start + toks[first].index!;
        const lastTok = toks[j];
        const en = s.start + lastTok.index! + clean(lastTok[0]).length;
        const t = text.slice(st, en);
        if (!SENTENCE_WORDS.has(t.toLowerCase())) out.push({ text: t, kind: "name", start: st, end: en });
      }
      i = j + 1;
    }
  }
  return out;
}

function clean(w: string): string {
  return w.replace(/[.'’-]+$/, "");
}

function afterColonOrQuote(s: string, idx: number): boolean {
  const before = s.slice(0, idx).trimEnd();
  return before === "" || /[:;"“(\[]$/.test(before);
}

export function freeze(text: string): Frozen[] {
  const found: Frozen[] = [];
  for (const [kind, re] of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const t = m[0].trim();
      if (!t) continue;
      if (kind === "number" && !/\d/.test(t)) continue;
      found.push({ text: t, kind, start: m.index!, end: m.index! + m[0].length });
    }
  }
  found.push(...nameSpans(text));
  // Keep the longest span where spans overlap.
  found.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const out: Frozen[] = [];
  for (const f of found) {
    const last = out[out.length - 1];
    if (last && f.start < last.end) {
      if (f.end - f.start > last.end - last.start) out[out.length - 1] = f;
      continue;
    }
    out.push(f);
  }
  return out;
}

export function uniqueFrozen(spans: Frozen[]): Frozen[] {
  const seen = new Set<string>();
  return spans.filter((s) => (seen.has(s.text) ? false : (seen.add(s.text), true)));
}

export interface FrozenCheck {
  ok: boolean;
  missing: string[];
  added: string[];
}

// Every distinct frozen span in the original must appear verbatim in the
// candidate. Numbers, URLs, emails, dates, citations and placeholders that
// appear in the candidate but not the original count as invented facts.
export function checkFrozen(original: string, candidate: string, spans = freeze(original)): FrozenCheck {
  const missing = uniqueFrozen(spans)
    .map((s) => s.text)
    .filter((t) => !candidate.includes(t));
  const origText = original;
  const added = uniqueFrozen(freeze(candidate))
    .filter((s) => s.kind !== "name" && s.kind !== "quote" && s.kind !== "code")
    .map((s) => s.text)
    .filter((t) => !origText.includes(t));
  // New proper nouns are invented details too, unless they appear in the original in any case.
  const lowerOrig = origText.toLowerCase();
  const addedNames = uniqueFrozen(freeze(candidate))
    .filter((s) => s.kind === "name")
    .map((s) => s.text)
    .filter((t) => !lowerOrig.includes(t.toLowerCase()));
  const allAdded = [...added, ...addedNames];
  return { ok: missing.length === 0 && allAdded.length === 0, missing, added: allAdded };
}
