import { describe, expect, it } from "vitest";
import { wordDiff } from "@/engine/diff";
import { bannedChars, stripBanned } from "@/engine/guard";
import { buildVoiceCard } from "@/engine/voice";

const EM = "\u{2014}";
const EN = "\u{2013}";

describe("guard", () => {
  it("detects dashes, invisible characters, odd spaces and mixed scripts", () => {
    expect(bannedChars(`one${EM}two`).dashes).toBe(1);
    expect(bannedChars(`pages 4${EN}9`).dashes).toBe(1);
    expect(bannedChars("zero\u{200B}width").invisible).toBe(1);
    expect(bannedChars("no\u{00A0}break").oddSpaces).toBe(1);
    expect(bannedChars("p\u{0430}ypal").mixedScript.length).toBe(1);
    expect(bannedChars("Plain text, with a hyphen-joined word.").ok).toBe(true);
  });

  it("cleans typography without changing words", () => {
    expect(stripBanned(`The plan ${EM} simple as it is ${EM} works.`)).toBe("The plan, simple as it is, works.");
    expect(stripBanned(`pages 4${EN}9`)).toBe("pages 4-9");
    expect(stripBanned("zero\u{200B}width and\u{00A0}space")).toBe("zerowidth and space");
    expect(bannedChars(stripBanned(`a${EM}b ${EN} c\u{2011}d`)).ok).toBe(true);
  });
});

describe("wordDiff", () => {
  it("rebuilds both sides", () => {
    const a = "The quick brown fox jumps over the lazy dog.";
    const b = "A quick red fox jumped over the dog.";
    const d = wordDiff(a, b);
    expect(d.filter((p) => p.type !== "add").map((p) => p.text).join("")).toBe(a);
    expect(d.filter((p) => p.type !== "del").map((p) => p.text).join("")).toBe(b);
  });
});

describe("voice card", () => {
  it("profiles a sample locally and keeps short excerpts", () => {
    const sample = Array.from({ length: 40 }, (_, i) =>
      i % 3 === 0 ? "I don't love long meetings." : i % 3 === 1 ? "We tried a shorter one on Tuesday, and it worked better than I'd expected for a team this size." : "Why does that surprise anyone?",
    ).join(" ");
    const v = buildVoiceCard(sample);
    expect(v.words).toBeGreaterThan(300);
    expect(v.contractions.per100).toBeGreaterThan(0);
    expect(v.punctuation.question).toBeGreaterThan(0);
    expect(v.excerpts.length).toBeGreaterThan(0);
    expect(v.excerpts.length).toBeLessThanOrEqual(3);
  });
});
