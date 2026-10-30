// Headless screenshots of the UI at desktop and phone width, light and dark.
// Usage: node scripts/shots.mjs [baseUrl] [outDir]
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3100";
const out = process.argv[3] ?? "shots";
const browser = await chromium.launch();
const sizes = [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
];
for (const [name, viewport] of sizes) {
  for (const scheme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport, colorScheme: scheme, deviceScaleFactor: 2 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(base, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${out}/${name}-${scheme}-empty.png` });
    await page.getByRole("button", { name: "Try an example" }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/${name}-${scheme}-sample.png`, fullPage: true });
    if (scheme === "light") {
      await page.getByRole("button", { name: "Add your voice" }).click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${out}/${name}-voice.png` });
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Use your key" }).click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${out}/${name}-key.png` });
      await page.keyboard.press("Escape");
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    console.log(`${name} ${scheme}: horizontal overflow ${overflow}px, errors ${errors.length ? errors.join(" | ") : "none"}`);
    await page.close();
  }
}
await browser.close();
