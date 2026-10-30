// Fails if any tracked or new file contains an em dash, en dash, or another
// Unicode dash variant. Run in CI and before every commit.
// The pattern uses \u{...} escapes so this file passes its own check.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const banned = /[\u{2012}-\u{2015}\u{2E3A}\u{2E3B}\u{FE58}\u{FE63}\u{FF0D}]/u;
const files = execSync("git ls-files --cached --others --exclude-standard", { encoding: "utf8" })
  .split("\n")
  .filter((f) => f && !/\.(png|jpg|jpeg|gif|ico|woff2?)$/i.test(f));

let bad = 0;
for (const f of files) {
  let text;
  try {
    text = readFileSync(f, "utf8");
  } catch {
    continue;
  }
  text.split("\n").forEach((line, i) => {
    if (banned.test(line)) {
      bad++;
      console.log(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`);
    }
  });
}
if (bad) {
  console.error(`\n${bad} line(s) contain em/en dashes.`);
  process.exit(1);
}
console.log(`dash check: ${files.length} files clean`);
