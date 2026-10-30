// Checks the eval detector on human-written text: passages from English
// Wikipedia articles, at about the eval's text length (180 words) and short
// (the page summary). Stores scores, not text.
// Usage: npx tsx eval/detector-sanity.ts
import { aiProbability, DETECTOR } from "./detector";
import { writeJson } from "./corpus";

const TITLES = ["Bicycle", "Printing_press", "Sourdough", "Lisbon", "Marathon", "Public_library", "Compound_interest", "Strength_training", "Transcontinental_railroad", "Ramen"];
const UA = { "User-Agent": "plainspoken-eval/0.1 (https://github.com/zaydmulani09/plainspoken)" };

async function main() {
  type Score = { words: number; ai: number };
  const rows: { title: string; revision: number; passage: Score; summary: Score }[] = [];
  for (const t of TITLES) {
    const full = await (await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts|revisions&rvprop=ids&explaintext=1&format=json&titles=${t}`, { headers: UA })).json();
    const page = Object.values(full.query.pages)[0] as { extract: string; revisions: { revid: number }[] };
    const passage = page.extract.split(/\s+/).slice(150, 330).join(" ");
    const summary = (await (await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${t}`, { headers: UA })).json()).extract as string;
    const row = {
      title: t,
      revision: page.revisions[0].revid,
      passage: { words: passage.split(/\s+/).length, ai: Math.round((await aiProbability(passage)) * 1000) / 1000 },
      summary: { words: summary.split(/\s+/).length, ai: Math.round((await aiProbability(summary)) * 1000) / 1000 },
    };
    rows.push(row);
    console.log(t, row.passage, row.summary);
  }
  const flag = (k: "passage" | "summary") => rows.filter((r) => r[k].ai > 0.5).length;
  writeJson(new URL("./results/detector-sanity.json", import.meta.url), {
    date: new Date().toISOString().slice(0, 10),
    detector: DETECTOR,
    humanPassagesFlaggedAi: `${flag("passage")}/${rows.length}`,
    humanSummariesFlaggedAi: `${flag("summary")}/${rows.length}`,
    rows,
  });
  console.log(`passages flagged AI: ${flag("passage")}/${rows.length}, summaries flagged AI: ${flag("summary")}/${rows.length}`);
}

main();
