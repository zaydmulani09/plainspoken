import { describe, expect, it } from "vitest";
import { keepCheck } from "@/engine/keep";
import { droppedWords } from "@/engine/text";
import { lint, SOURCES, TELLS, tellReduction } from "@/engine/lint";

const AI = `In today's fast-paced digital landscape, it's important to note that collaboration is crucial. Moreover, teams must foster trust, embrace change, and unlock potential. This isn't just about tools. It's about people. Ultimately, the key takeaway is clear: we must delve into the rich tapestry of modern work, underscoring its pivotal role in our journey.`;

const HUMAN = `We moved the standup to 9:40 because half the team takes the early train. Nobody loved it at first. Two weeks in, people show up with coffee instead of excuses, and the meeting ends on time more often than not. I still think fifteen minutes is too long, but that's a fight for next quarter.`;

const ids = (text: string) => new Set(lint(text).hits.filter((h) => h.weight > 0).map((h) => h.id));

describe("lint", () => {
  it("scores stock AI prose far above plain human prose", () => {
    const ai = lint(AI);
    const human = lint(HUMAN);
    expect(ai.density).toBeGreaterThan(10);
    expect(human.density).toBeLessThan(2);
  });

  it("finds the minimum tell coverage", () => {
    const found = ids(AI);
    for (const id of ["opening-stock", "connector-phrase", "connector-opener", "vocab-strong", "vocab-common", "contrast-its-not-its", "lesson-stated", "triad-abstract"]) {
      expect(found, id).toContain(id);
    }
  });

  it("flags abstract triads but not concrete lists", () => {
    expect(ids("We value innovation, collaboration, and growth.")).toContain("triad-abstract");
    expect(ids("The team is customer-centric, data-driven, and collaborative.")).toContain("triad-abstract");
    expect(ids("Silos between product, engineering, and marketing caused delays.")).not.toContain("triad-abstract");
    expect(ids("Buy eggs, flour, and butter on the way home.")).not.toContain("triad-abstract");
  });

  it("flags em dashes, false ranges, bold, and double hedges", () => {
    expect(ids("The plan\u{2014}simple as it is\u{2014}works.")).toContain("dash");
    expect(ids("We cover everything from onboarding to offboarding.")).toContain("false-range");
    expect(ids("This **really** matters to us.")).toContain("format-bold");
    expect(ids("This might potentially help the team ship faster.")).toContain("hedge-double");
  });

  it("measures uniform sentence length", () => {
    const flat = "The team met on Monday morning. They reviewed the open tickets together. Then they planned the next sprint. Everyone agreed on the main goals. The meeting ended right on time.";
    const m = lint(flat).metrics.find((x) => x.id === "rhythm-sentence-cv")!;
    expect(m.triggered).toBe(true);
    const varied = lint(HUMAN).metrics.find((x) => x.id === "rhythm-sentence-cv")!;
    expect(varied.value).toBeGreaterThan(m.value);
  });

  it("ignores tells inside quotes and code", () => {
    expect(ids('The memo said "we must delve into the tapestry of synergy" and nobody laughed.')).not.toContain("vocab-strong");
    expect(ids("Call `delve()` before you exit.")).not.toContain("vocab-strong");
  });

  it("reports hit offsets that match the text", () => {
    for (const h of lint(AI).hits) expect(AI.slice(h.start, h.end)).toBe(h.text);
  });

  it("computes tell reduction from densities", () => {
    expect(tellReduction(lint(AI), lint(HUMAN))).toBeGreaterThan(0.8);
  });

  it("cites a known source for every tell", () => {
    for (const t of TELLS) {
      expect(t.sources.length, t.id).toBeGreaterThan(0);
      for (const s of t.sources) expect(SOURCES[s], `${t.id} -> ${s}`).toBeDefined();
    }
  });
});

describe("droppedWords", () => {
  it("lists content words the rewrite lost, ignoring inflection", () => {
    const src = "Libraries often become emergency centers, offering shelter and food.";
    const out = "Libraries become emergency centres that offer shelter and food.";
    expect(droppedWords(src, out)).toEqual(["often", "centers"]);
  });
});

describe("keepCheck", () => {
  it("flags dropped list items and hedges, allowing swaps within a hedge group", () => {
    const src = "Libraries often host coding, financial literacy, and language classes. They are places where knowledge, creativity, and community meet.";
    const r = keepCheck(src, "Libraries host coding, financial literacy and language classes. Knowledge and community meet there.");
    expect(r.items).toEqual(["creativity"]);
    expect(r.hedges).toEqual(["often"]);
    expect(keepCheck(src, "Libraries frequently host coding, financial literacy and language classes. Knowledge, creativity and community meet there.")).toEqual({ items: [], hedges: [] });
  });
});
