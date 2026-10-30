import { defineConfig } from "@playwright/test";

// Runs against BASE_URL (the live deployment in CI, or a local server).
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 300_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: process.env.BASE_URL ?? "http://localhost:3100", trace: "off" },
});
