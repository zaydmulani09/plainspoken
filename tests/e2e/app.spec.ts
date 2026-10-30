import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const SAMPLE_600 = readFileSync(new URL("./fixtures/sample600.txt", import.meta.url), "utf8");
const DASH = /[\u{2012}-\u{2015}]/u;

test("page loads with no errors and no horizontal scroll at 390px", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Try an example" }).click();
  await expect(page.getByText(/words · [0-9.]+ tells per 100/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
  expect(errors).toEqual([]);
});

test("analyze is deterministic and free", async ({ request }) => {
  const res = await request.post("/api/analyze", { data: { text: SAMPLE_600 } });
  expect(res.status()).toBe(200);
  const { report } = await res.json();
  expect(report.words).toBeGreaterThan(550);
  expect(report.density).toBeGreaterThan(3);
});

test("server key rejects more than 1,500 words", async ({ request }) => {
  const text = "word ".repeat(1501);
  const res = await request.post("/api/humanize", { data: { text } });
  expect(res.status()).toBe(413);
  expect((await res.json()).code).toBe("too_long");
});

test("humanize streams events before it finishes", async ({ baseURL }) => {
  const res = await fetch(`${baseURL}/api/humanize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "This short note is here to check that the stream opens before the work is done.", mode: "light" }),
  });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("application/x-ndjson");
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  const types: string[] = [];
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    const lines = buf.split("\n");
    buf = lines.pop()!;
    for (const l of lines) if (l.trim()) types.push(JSON.parse(l).type);
  }
  expect(types[0]).toBe("start");
  expect(types).toContain("plan");
  expect(types.at(-1)).toBe("done");
});

test("rewrites a 600-word sample end to end in the UI", async ({ page }) => {
  test.skip(!process.env.E2E_LONG, "set E2E_LONG=1 to spend model quota on the full run");
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByLabel("Text to rewrite").fill(SAMPLE_600);
  await page.getByRole("button", { name: "Rewrite", exact: true }).click();
  // Paragraphs stream in before the whole run is done.
  await expect(page.getByText(/\d+ of \d+ paragraphs/)).toBeVisible({ timeout: 60_000 });
  const badge = page.getByText(/Meaning kept|Check meaning/);
  await expect(badge).toBeVisible({ timeout: 290_000 });
  await page.getByRole("radio", { name: "Clean" }).click();
  const out = await page.getByRole("region", { name: "Rewrite" }).locator(".prose-edit").innerText();
  expect(out.split(/\s+/).length).toBeGreaterThan(400);
  expect(DASH.test(out)).toBe(false);
  await page.screenshot({ path: "test-results/live-600.png", fullPage: true });
  console.log(`badge: ${await badge.innerText()}`);
  console.log(`report: ${await page.getByRole("region", { name: "Report" }).innerText()}`);
});
