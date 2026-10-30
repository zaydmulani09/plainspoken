// Voice card: a local, deterministic profile of how someone writes, computed
// from 300+ words of their own text. Stored in the browser only and sent with
// each request so the writer can match it.
import { lint } from "./lint";
import { countWords, cv, mean, sentences, splitBlocks, words } from "./text";

export interface VoiceCard {
  version: 1;
  words: number;
  sentence: { mean: number; min: number; max: number; cv: number; shortShare: number; longShare: number };
  contractions: { per100: number; rate: number };
  punctuation: Record<"comma" | "semicolon" | "colon" | "paren" | "question" | "exclaim" | "dash" | "ellipsis", number>;
  grade: number;
  firstPerson: number;
  openers: string[];
  excerpts: string[];
}

export const MIN_VOICE_WORDS = 300;

const CONTRACTION = /\b\p{L}+['’](?:s|t|re|ve|ll|d|m)\b/giu;
// Places where a contraction could have been used but was not.
const UNCONTRACTED = /\b(?:do not|does not|did not|is not|are not|was not|were not|have not|has not|had not|will not|would not|could not|should not|can not|cannot|it is|that is|there is|I am|I have|I will|I would|you are|you have|we are|we have|they are|they have|let us)\b/gi;

function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}

function per100(n: number, total: number) {
  return total ? Math.round((n / total) * 1000) / 10 : 0;
}

export function buildVoiceCard(sample: string): VoiceCard {
  const text = splitBlocks(sample)
    .filter((b) => b.kind === "paragraph" || b.kind === "list")
    .map((b) => b.text)
    .join("\n\n");
  const sents = sentences(text);
  const lens = sents.map((s) => countWords(s.text)).filter((n) => n > 0);
  const ws = words(text);
  const total = ws.length;
  const count = (re: RegExp) => text.match(re)?.length ?? 0;
  const contr = count(CONTRACTION);
  const uncontr = count(UNCONTRACTED);
  const syl = ws.reduce((a, w) => a + syllables(w), 0);
  const grade = lens.length && total ? 0.39 * (total / lens.length) + 11.8 * (syl / total) - 15.59 : 0;
  const openerCounts = new Map<string, number>();
  for (const s of sents) {
    const w = s.text.match(/[\p{L}']+/u)?.[0];
    if (w) openerCounts.set(w, (openerCounts.get(w) ?? 0) + 1);
  }
  const openers = [...openerCounts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w);

  return {
    version: 1,
    words: total,
    sentence: {
      mean: Math.round(mean(lens) * 10) / 10,
      min: lens.length ? Math.min(...lens) : 0,
      max: lens.length ? Math.max(...lens) : 0,
      cv: Math.round(cv(lens) * 100) / 100,
      shortShare: lens.length ? Math.round((lens.filter((n) => n <= 8).length / lens.length) * 100) / 100 : 0,
      longShare: lens.length ? Math.round((lens.filter((n) => n >= 25).length / lens.length) * 100) / 100 : 0,
    },
    contractions: { per100: per100(contr, total), rate: contr + uncontr ? Math.round((contr / (contr + uncontr)) * 100) / 100 : 0 },
    punctuation: {
      comma: per100(count(/,/g), total),
      semicolon: per100(count(/;/g), total),
      colon: per100(count(/:(?!\/\/)/g), total),
      paren: per100(count(/\(/g), total),
      question: per100(count(/\?/g), total),
      exclaim: per100(count(/!/g), total),
      dash: per100(count(/\s[-\u{2013}\u{2014}]\s|--/gu), total),
      ellipsis: per100(count(/\.\.\.|…/g), total),
    },
    grade: Math.round(grade * 10) / 10,
    firstPerson: per100(count(/\b(?:I|me|my|mine|I'm|I've|I'd|I'll)\b/g), total),
    openers,
    excerpts: pickExcerpts(text),
  };
}

// Two or three short passages (25 to 70 words) with the fewest AI tells,
// spread across the sample.
function pickExcerpts(text: string): string[] {
  const sents = sentences(text);
  const windows: { text: string; start: number; score: number }[] = [];
  for (let i = 0; i < sents.length; i++) {
    let t = "";
    for (let j = i; j < Math.min(sents.length, i + 4); j++) {
      t = text.slice(sents[i].start, sents[j].end);
      const n = countWords(t);
      if (n > 70) break;
      if (n >= 25) {
        windows.push({ text: t.replace(/\s+/g, " ").trim(), start: sents[i].start, score: lint(t).density });
        break;
      }
    }
  }
  windows.sort((a, b) => a.score - b.score);
  const picked: typeof windows = [];
  const gap = text.length / 4;
  for (const w of windows) {
    if (picked.length >= 3) break;
    if (picked.every((p) => Math.abs(p.start - w.start) > gap)) picked.push(w);
  }
  return picked.sort((a, b) => a.start - b.start).map((w) => w.text);
}

function level(x: number, lo: number, hi: number, words: [string, string, string]) {
  return x < lo ? words[0] : x > hi ? words[2] : words[1];
}

// A compact description of the card for the writer prompt. Excerpts are
// returned separately so the caller can wrap them as untrusted data.
export function describeVoice(v: VoiceCard): string {
  const p = v.punctuation;
  const habits = [
    p.semicolon >= 0.3 ? "uses semicolons" : "almost never uses semicolons",
    p.paren >= 0.5 ? "uses parentheses for asides" : "",
    p.question >= 0.5 ? "asks questions" : "",
    p.exclaim >= 0.3 ? "uses exclamation marks" : "rarely uses exclamation marks",
    p.ellipsis >= 0.2 ? "uses ellipses" : "",
    p.colon >= 0.4 ? "uses colons" : "",
  ].filter(Boolean);
  return [
    `Sentence length: average ${v.sentence.mean} words, range ${v.sentence.min} to ${v.sentence.max}; variation is ${level(v.sentence.cv, 0.4, 0.65, ["low", "moderate", "high"])} (CV ${v.sentence.cv}); ${Math.round(v.sentence.shortShare * 100)}% of sentences are 8 words or fewer.`,
    `Contractions: ${level(v.contractions.rate, 0.3, 0.7, ["rare", "sometimes", "usual"])} (${Math.round(v.contractions.rate * 100)}% of chances).`,
    `Punctuation: ${habits.join(", ")}; about ${p.comma} commas per 100 words.`,
    `Reading level: about grade ${Math.max(1, Math.round(v.grade))}.`,
    `First person: ${level(v.firstPerson, 1, 4, ["rare", "moderate", "frequent"])}.`,
    v.openers.length ? `Often starts sentences with: ${v.openers.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function isVoiceCard(x: unknown): x is VoiceCard {
  const v = x as VoiceCard;
  return !!v && v.version === 1 && typeof v.sentence?.mean === "number" && Array.isArray(v.excerpts) && v.excerpts.every((e) => typeof e === "string");
}
