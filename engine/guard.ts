// Characters the app must never output: dashes the brief bans, invisible
// characters, and mixed-script words (homoglyphs). Used as a hard check on
// candidates and as a last-resort cleanup on final text.
// Escapes use the \u{...} form so no banned character appears in the source.

const DASH = /[\u{2012}-\u{2015}\u{2E3A}\u{2E3B}\u{FE58}\u{FE63}\u{FF0D}]/gu;
const INVISIBLE = /[\u{00AD}\u{180E}\u{200B}-\u{200F}\u{202A}-\u{202E}\u{2060}-\u{2064}\u{2066}-\u{2069}\u{FEFF}]/gu;
const ODD_SPACE = /[\u{00A0}\u{2000}-\u{200A}\u{202F}\u{205F}\u{3000}]/gu;
// Non-ASCII hyphens that look like "-" but are different characters.
const ODD_HYPHEN = /[\u{2010}\u{2011}\u{2043}]/gu;
// A word that mixes Latin letters with Cyrillic or Greek letters.
const MIXED = /(?=[\p{L}]*\p{Script=Latin})(?=[\p{L}]*[\p{Script=Cyrillic}\p{Script=Greek}])[\p{L}]+/gu;

export interface BannedReport {
  ok: boolean;
  dashes: number;
  invisible: number;
  oddSpaces: number;
  mixedScript: string[];
}

export function bannedChars(text: string): BannedReport {
  const dashes = text.match(DASH)?.length ?? 0;
  const invisible = text.match(INVISIBLE)?.length ?? 0;
  const oddSpaces = (text.match(ODD_SPACE)?.length ?? 0) + (text.match(ODD_HYPHEN)?.length ?? 0);
  const mixedScript = text.match(MIXED) ?? [];
  return { ok: !dashes && !invisible && !oddSpaces && !mixedScript.length, dashes, invisible, oddSpaces, mixedScript };
}

// Typographic cleanup only: it never changes words. Number ranges keep a
// hyphen, a spaced dash becomes a comma, an unspaced one a hyphen.
export function stripBanned(text: string): string {
  return text
    .replace(INVISIBLE, "")
    .replace(ODD_SPACE, " ")
    .replace(ODD_HYPHEN, "-")
    .replace(/(\d)\s*[\u{2012}-\u{2014}]\s*(\d)/gu, "$1-$2")
    // A lone dash in a sentence usually introduces what follows: a colon
    // reads right where a comma would make a splice. A pair is an aside.
    .replace(/(^|[.!?]\s+)([^.!?:\u{2014}\n]+?)\s*\u{2014}\s*([^.!?:\u{2014}\n]+)(?=[.!?]|$)/gmu, "$1$2: $3")
    .replace(/\s*[\u{2014}\u{2015}\u{2E3A}\u{2E3B}]\s*/gu, ", ")
    .replace(/\s+[\u{2012}\u{2013}\u{FE58}\u{FE63}\u{FF0D}]\s+/gu, ", ")
    .replace(DASH, "-")
    .replace(/,\s*([.,;:!?])/g, "$1")
    .replace(/ {2,}/g, " ");
}

export function hasDash(text: string): boolean {
  return /[\u{2012}-\u{2015}]/u.test(text);
}
