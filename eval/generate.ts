// Builds eval/corpus.json: 30 sources generated on Groq by three different
// models with varied prompts and system messages, plus the 12 sources in
// claude-sources.ts. Run once; the output is committed.
// Usage: GROQ_API_KEY=... npx tsx eval/generate.ts
import { existsSync } from "node:fs";
import type { Tone } from "../engine/prompts";
import { groqProvider } from "../engine/providers";
import { CLAUDE_SOURCES } from "./claude-sources";
import { CORPUS_PATH, readJson, writeJson, type Source } from "./corpus";

const MODELS = ["qwen/qwen3.8-27b", "openai/gpt-oss-120b", "openai/gpt-oss-20b"];
const SYSTEMS = ["You are a helpful assistant.", "You are a professional writer who produces polished, engaging content.", "You write clear, friendly content for a general audience."];
const FORMAT = "Plain text paragraphs only: no title, no headings, no markdown, no bullet points.";

const PROMPTS: [string, string, Tone, string][] = [
  ["g01-blog-writing-things-down", "blog post", "casual", "Write a blog post introduction arguing that small teams should write things down. About 150 words."],
  ["g02-linkedin-failed-launch", "social post", "professional", "Write a LinkedIn post about lessons learned from a failed product launch. About 150 words."],
  ["g03-college-changed-mind", "college short answer", "neutral", "Write a college application short answer about a time you changed your mind. Use [bracketed placeholders] for any personal details such as names, places, and dates. About 150 words."],
  ["g04-product-bottle", "product copy", "casual", "Write a product description for a stainless steel water bottle that keeps drinks cold for 24 hours and costs $34. About 120 words."],
  ["g05-email-expenses", "work email", "professional", "Write an email to employees announcing a new expense policy that starts March 1 and requires receipts for anything over $75. About 150 words."],
  ["g06-reddit-cooking", "forum post", "casual", "Write a Reddit post giving advice to college students who want to learn to cook. About 150 words."],
  ["g07-cover-letter-analyst", "cover letter", "professional", "Write one cover letter paragraph for a data analyst applying to a hospital, mentioning SQL and Tableau. About 130 words."],
  ["g08-report-support", "business report", "professional", "Write a quarterly customer support summary: median first response time fell from 9 hours to 4 hours and satisfaction reached 87%. About 150 words."],
  ["g09-essay-libraries", "essay", "neutral", "Write an essay paragraph about the role of public libraries in modern communities. About 170 words."],
  ["g10-travel-lisbon", "travel blog", "casual", "Write a travel blog paragraph about a weekend in Lisbon. About 160 words."],
  ["g11-release-notes", "release notes", "neutral", "Write a release notes paragraph for version 3.2 of a notes app, which adds offline mode and dark mode. About 110 words."],
  ["g12-nursing-statement", "personal statement", "neutral", "Write a personal statement paragraph about why the writer wants to study nursing. Use [bracketed placeholders] for personal details. About 170 words."],
  ["g13-newsletter-garden", "newsletter", "casual", "Write the opening of a monthly newsletter with gardening tips for October. About 140 words."],
  ["g14-academic-sleep", "academic", "academic", "Write an academic paragraph on how sleep affects memory consolidation. Do not cite specific studies. About 160 words."],
  ["g15-apology-shipping", "customer email", "professional", "Write a customer apology email about a delayed shipment of order #48213. About 130 words."],
  ["g16-graduation-speech", "speech", "casual", "Write an excerpt from a high school graduation speech. About 160 words."],
  ["g17-review-ramen", "review", "casual", "Write a restaurant review of a small ramen shop. About 150 words."],
  ["g18-book-review", "review", "neutral", "Write a book review paragraph about a mystery novel. Refer to the book only as [Title] and the author only as [Author]. About 150 words."],
  ["g19-explainer-api", "explainer", "neutral", "Explain what an API is to a complete beginner. About 160 words."],
  ["g20-grant-garden", "grant proposal", "professional", "Write a grant proposal summary for a community garden project requesting $12,000. About 160 words."],
  ["g21-hr-hybrid", "announcement", "professional", "Write an HR announcement about a new hybrid work schedule with three office days a week. About 140 words."],
  ["g22-podcast-freelance", "podcast description", "casual", "Write a podcast episode description about personal finance for freelancers. About 120 words."],
  ["g23-marathon-post", "social post", "casual", "Write a personal social media post about finishing a first marathon. About 120 words."],
  ["g24-history-printing", "history essay", "academic", "Write a history essay paragraph about the impact of the printing press. About 170 words."],
  ["g25-postmortem-cert", "internal memo", "professional", "Write a postmortem summary of a 2-hour outage on June 12 caused by an expired TLS certificate. About 160 words."],
  ["g26-thanks-mentor", "personal note", "casual", "Write a thank-you note to a mentor who helped the writer get their first job. About 110 words."],
  ["g27-fitness-strength", "article", "neutral", "Write the introduction to an article on the benefits of strength training after 40. About 150 words."],
  ["g28-scholarship-challenge", "scholarship essay", "neutral", "Write a scholarship essay paragraph about overcoming a challenge. Use [bracketed placeholders] for personal details. About 170 words."],
  ["g29-faq-password", "help article", "neutral", "Write an FAQ answer explaining how to reset a password on a company portal. About 100 words."],
  ["g30-opinion-remote", "opinion", "neutral", "Write an opinion paragraph on remote work versus working in an office. About 160 words."],
];

async function main() {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set");
  const existing = existsSync(CORPUS_PATH) ? readJson<{ sources: Source[] }>(CORPUS_PATH).sources : [];
  const have = new Map(existing.map((s) => [s.id, s]));
  const out: Source[] = [];
  for (const [k, [id, genre, tone, ask]] of PROMPTS.entries()) {
    if (have.has(id)) {
      out.push(have.get(id)!);
      continue;
    }
    const model = MODELS[k % MODELS.length];
    const system = SYSTEMS[Math.floor(k / MODELS.length) % SYSTEMS.length];
    const prompt = `${ask} ${FORMAT}`;
    // The provider routes by role; pin both roles to this one model.
    const p = groqProvider(key, "server", { writer: [model], judge: [model] });
    const r = await p.call({ role: "writer", system, user: prompt, maxTokens: 1200 });
    out.push({ id, genre, tone, generator: `${model} (Groq, temperature 0.8)`, prompt: `[system] ${system} [user] ${prompt}`, text: r.text.trim() });
    console.log(`${id}: ${model}, ${r.text.trim().split(/\s+/).length} words`);
  }
  for (const s of CLAUDE_SOURCES) out.push({ ...s, generator: "claude-opus-5-5 (written in the build session)" });
  writeJson(CORPUS_PATH, { note: "Eval sources. Non-ASCII characters are JSON escapes.", sources: out });
  console.log(`${out.length} sources`);
}

main();
