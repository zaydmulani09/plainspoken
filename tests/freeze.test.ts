import { describe, expect, it } from "vitest";
import { checkFrozen, freeze } from "@/engine/freeze";

const kinds = (text: string) => freeze(text).map((f) => [f.kind, f.text]);

describe("freeze", () => {
  it("locks numbers, dates, links, emails, quotes, placeholders, citations and code", () => {
    const text =
      'Revenue grew 14.5% to $2.3 million on March 3, 2025. See https://example.com/report or write to ops@example.com. She said "we ship on Friday" before [your manager] signed off (Smith, 2021). Run `npm test` first.';
    const got = kinds(text);
    expect(got).toContainEqual(["number", "14.5%"]);
    expect(got).toContainEqual(["number", "$2.3 million"]);
    expect(got.some(([k, t]) => k === "date" && t.includes("March 3, 2025"))).toBe(true);
    expect(got).toContainEqual(["url", "https://example.com/report"]);
    expect(got).toContainEqual(["email", "ops@example.com"]);
    expect(got.some(([k, t]) => k === "quote" && t.includes("we ship on Friday"))).toBe(true);
    expect(got).toContainEqual(["placeholder", "[your manager]"]);
    expect(got.some(([k, t]) => k === "citation" && t.includes("Smith, 2021"))).toBe(true);
    expect(got).toContainEqual(["code", "`npm test`"]);
  });

  it("locks multi-word names but not a capitalized first word", () => {
    const got = kinds("Yesterday Priya Shah met the team from Northwind Traders in Boston.");
    const names = got.filter(([k]) => k === "name").map(([, t]) => t);
    expect(names).toContain("Priya Shah");
    expect(names.some((n) => n.includes("Northwind"))).toBe(true);
    expect(names).not.toContain("Yesterday");
  });

  it("returns spans whose offsets match the text", () => {
    const text = "In 2024 the team of 14 moved to Lisbon on 1 June.";
    for (const f of freeze(text)) expect(text.slice(f.start, f.end).trim()).toBe(f.text);
  });
});

describe("checkFrozen", () => {
  const original = "Our team of 14 moved to remote work in March, and Priya Shah started a weekly demo.";

  it("passes a rewrite that keeps every locked span", () => {
    const r = checkFrozen(original, "In March our team of 14 went remote. Priya Shah started a weekly demo.");
    expect(r.ok).toBe(true);
  });

  it("flags a dropped or altered number", () => {
    const r = checkFrozen(original, "Our team of fourteen went remote in March, and Priya Shah started a weekly demo.");
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("14");
  });

  it("flags invented numbers and names", () => {
    const r = checkFrozen(original, "Our team of 14 went remote in March 2023, and Priya Shah and Tom Reed started a weekly demo.");
    expect(r.ok).toBe(false);
    expect(r.added.join(" ")).toMatch(/2023/);
    expect(r.added.join(" ")).toMatch(/Tom Reed/);
  });
});
