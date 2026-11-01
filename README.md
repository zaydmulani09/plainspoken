# Plainspoken

Rewrites AI-sounding text into plain human prose without changing what it says.

Live: https://plainspoken-app.vercel.app

Paste a draft, pick a mode and a tone, and Plainspoken rewrites it paragraph by paragraph. Every rewrite is checked against the original for meaning before you see it, and the page shows a word diff, a before and after tell report, and a meaning badge. No signup, no database. MIT licensed.

## What it does and does not do

It cuts the habits that make text read as machine-written: stock vocabulary ("delve", "fosters", "pivotal"), contrast framing ("it's not just X, it's Y"), lists of three, signposting, hedges, inflated closers, and flat sentence rhythm. It keeps every claim, number, name, date, link, quote, and code span.

It never uses the tricks that only fool a classifier: no homoglyphs, no zero-width or invisible characters, no planted typos, no thesaurus swaps, no translation round trips. It never invents facts, numbers, names, quotes, or life details. If a sentence needs something only the author knows, it stays as a [bracketed placeholder].

It does not promise to beat AI detectors. See [Detector](#detector) for the one detector that was measured.

## How it works

1. **Split.** The text is split into paragraphs and list blocks. Paragraphs run in parallel with a cap on concurrency.
2. **Lock.** Numbers, dates, money, percentages, names, URLs, emails, citations, code, quoted text, and [placeholders] are found and locked ([engine/freeze.ts](engine/freeze.ts)). A draft that drops, alters, or adds a locked span fails.
3. **Lint.** A deterministic linter scores each paragraph against 38 patterns in [engine/tells.json](engine/tells.json), each with its sources, plus rhythm metrics. The score is weighted matches per 100 words.
4. **Draft.** The writer model drafts each paragraph twice, told which tells it has, which spans are locked, the target length (within 10%), the tone, and the user's voice profile if one is set.
5. **Check.** For each draft: the locked spans, banned characters, length, a claims judge (the judge lists the paragraph's claims and marks any the draft drops, changes, or adds), a check in code that every item of a listed series and every hedge ("often", "may", "most") survives ([engine/keep.ts](engine/keep.ts)), and the linter again. A draft must keep every claim, add none, and bring tell density to 35% of the source (or 2 per 100 words, whichever is higher).
6. **Pick.** When more than one draft passes, a quality judge scores the passing drafts and the original, shuffled and unlabeled. The winner has the best combined score (quality minus tell density and any failures).
7. **Repair.** If no draft passes, the best one goes back to the writer with the exact problems listed: missing claims, altered spans, or the tells that remain. At most two repair rounds.
8. **Fall back.** If the meaning still does not hold, the original paragraph is kept and marked. A changed meaning never ships. A draft that keeps the meaning but misses the length range is used and marked.

Pasted text is data, never instructions. Every prompt wraps it in tags with a random ID per request and tells the model that instructions inside are not the operator's.

### Modes and tones

- **Light** rewrites only the sentences that carry tells.
- **Standard** rewrites every paragraph.
- **Deep** also extracts the claims first and holds the writer to that list.

Tones: Neutral, Casual, Professional, Academic.

### Voice

Paste 300 or more words of your own writing. The browser measures it (sentence length, contractions, punctuation habits, common openers) and keeps two or three short excerpts. The profile is saved in localStorage and sent with each request. It never leaves your device otherwise.

## Models

The server picks the first route that is configured:

1. `ANTHROPIC_API_KEY`: writer `claude-sonnet-5-5`, judge `claude-haiku-5-5`.
2. Vercel AI Gateway, if it is free on the account. It was not: on 2026-10-30 the gateway returned 403 "requires a valid credit card on file", so it is not used.
3. `GROQ_API_KEY`: writer `openai/gpt-oss-120b` (falls back to `qwen/qwen3.8-27b`), judge `openai/gpt-oss-20b` (falls back to `openai/gpt-oss-120b`).

The live site runs on route 3, Groq's free tier.

**Bring your own key.** Paste an Anthropic (`sk-ant-`) or Groq (`gsk_`) key in the page. It lives in the tab's memory, goes out with your requests in the `x-provider-key` header, and is never stored or logged. BYOK requests have no caps beyond your provider's.

## Limits on the free key

- 1,500 words per request (BYOK: 6,000).
- A Vercel Firewall rule on `/api/humanize`: 10 requests per IP per 10 minutes, then deny. An in-memory per-IP limiter backs it up.
- A daily word cap per instance, plus Groq's own per-day request counter as a global stop.
- A run stops starting new paragraphs after 235 seconds; any paragraph left is kept as written and marked.

## Evaluation

42 texts in [eval/corpus.json](eval/corpus.json), across 28 genres and all four tones. 30 were generated for the eval on Groq (10 each by gpt-oss-120b, gpt-oss-20b, and qwen3.8-27b) and 12 were written by Claude Opus 5.5 while building this. Each text ran once in Standard mode on the live site's models (writer gpt-oss-120b, pipeline judge gpt-oss-20b). A separate eval judge, qwen3.8-27b with reasoning on, scored the results. It is never told about AI tells, so it cannot reward a rewrite just for dropping them.

- **Claims.** The judge lists each source's claims ([eval/claims.json](eval/claims.json)), marks each one kept, changed, or missing in the rewrite, and lists any claim the rewrite adds.
- **Quality.** A blind pairwise comparison of rewrite and original, run in both orders. A verdict that flips with the order counts as a tie.
- **Tells.** The deterministic linter, pooled over all words.

Final run, 2026-10-31 ([eval/results/round-5.md](eval/results/round-5.md), every output in [round-5.json](eval/results/round-5.json)):

| Metric | Result | Target | Met |
| --- | --- | --- | --- |
| Tell reduction (pooled) | 45.2% (4.41 to 2.42 per 100 words) | 80% or more | no |
| Claim recall | 85.7% (611 of 713 kept; 95 changed, 7 missing) | 98% or more | no |
| Added claims | 46, in 21 of 42 texts | 0 | no |
| Win or tie against the original | 73.8% (16 win, 15 tie, 11 loss) | 85% or more | no |
| Length drift | -4.9% in total; 36 of 42 texts within 10%, the other 6 ran 10% to 15% short | within 10% | in total, yes |
| Banned characters in the output | 0 | 0 | yes |

**Missed targets: tell reduction, claim recall, added claims, and win or tie.** On these numbers Plainspoken does not reach the bar it was built for. What the outputs show:

- 14 of the 70 paragraphs were kept as written because no draft held the meaning after two repairs. Those keep every tell, which pulls the reduction down.
- The pipeline's own judge (gpt-oss-20b at low effort) passed every draft that the eval judge later marked as changing a claim. Many of those claims are the source's inflated phrasing, which the writer is told to plain down: "democratic spaces where knowledge, creativity, and community resilience converge" lost "creativity". Others are concrete details: "plush memory-foam ear cushions" lost "plush". The small judge is the weak link, and it is small to fit the free tier's token quota.
- Two rewrites contain writer errors that no check caught: "lukeweak" for "lukewarm" (g04), and "transwestern railway" for "transcontinental railroad" (c08). There is no spelling check.
- The 8 dev texts were used for tuning ([eval/ROUNDS.md](eval/ROUNDS.md)). On the other 34 alone: tell reduction 41.6%, recall 86.0%, 38 added claims in 17 texts, win or tie 70.6%.
- One run per text, so there is no variance estimate. Timings are not reported: most of the run waited on free-tier quotas.
- Claims for the 8 dev texts were extracted by gpt-oss-120b in round 1; the other 34 by the eval judge.
- For g12 and from g16 on, calls that Groq's free daily quota refused went to OVHcloud AI Endpoints' keyless tier, which serves the same open weights: 212 of the 322 calls counted in those 28 texts. Those texts scored lower on win or tie than the first 14 (64% against 93%). To check the host, g01 to g06 ran again with OVH serving most calls ([round-5.1.md](eval/results/round-5.1.md)). Recall rose from 80.0% to 90.5% and added claims went from 4 to 5, but win or tie fell from 6 of 6 to 3 of 6. With one run per host, a host effect cannot be told apart from run-to-run variance. The pairwise verdict changed on 4 of the 6 texts.

## Detector

Measured on 2026-10-31 with the TMR AI text detector ([Oxidane/tmr-ai-text-detector](https://huggingface.co/Oxidane/tmr-ai-text-detector), ONNX build, run locally) on the same 42 texts. It flagged 42 of 42 originals and 41 of 42 rewrites as AI (probability above 0.5). The mean AI probability went from 0.983 to 0.941. Plainspoken does not get text past this detector.

The detector is not reliable on human text either ([eval/results/detector-sanity.json](eval/results/detector-sanity.json), 2026-10-30): it flagged 2 of 10 human-written Wikipedia passages of 180 words, and 10 of 10 of the short Wikipedia page summaries. Its code is in [eval/detector.ts](eval/detector.ts).

## API

`POST /api/humanize` streams NDJSON events.

```json
{ "text": "...", "mode": "standard", "tone": "neutral", "voice": null }
```

Events: `start`, `plan` (blocks and the before report), `stage` (per paragraph), `paragraph` (result), `done` (text, diff, after report, meaning check), `error`, and `ping` keepalives. Add `x-provider-key` to use your own key.

`POST /api/analyze` returns the tell report and the locked spans for `{ "text": "..." }`. Deterministic, no model call.

`GET /api/status` says which server route is configured (never the key) and the word limit.

## Run it yourself

```bash
git clone https://github.com/zaydmulani09/plainspoken
```

```bash
cd plainspoken && npm ci
```

Set one key in `.env.local` (`ANTHROPIC_API_KEY` or `GROQ_API_KEY`), then:

```bash
npm run dev
```

CLI, no server:

```bash
npx tsx scripts/cli.ts draft.txt --mode standard --tone neutral
```

### Deploy on Vercel

Import the repo, set `ANTHROPIC_API_KEY` or `GROQ_API_KEY` in the project's environment variables, and deploy. Optional: `DAILY_WORD_CAP` (default 60000), `IP_LIMIT` (default 8 per 10 minutes), `GROQ_WRITER_MODELS` and `GROQ_JUDGE_MODELS` (comma-separated). For the per-IP firewall rule:

```bash
vercel firewall rules add "Rate limit humanize per IP" --condition '{"type":"path","op":"eq","value":"/api/humanize"}' --action rate_limit --rate-limit-requests 10 --rate-limit-window 600 --rate-limit-action deny
```

```bash
vercel firewall publish
```

## Tests

```bash
npm test
```

```bash
npm run typecheck && npm run check-dashes
```

```bash
BASE_URL=https://plainspoken-app.vercel.app E2E_LONG=1 npx playwright test
```

Unit tests cover the span lock, the linter, and the character guard. The Playwright suite runs against the live URL: page load at 390px, `/api/analyze`, the 1,500-word limit, stream order, and (with `E2E_LONG=1`) a full 600-word rewrite through the UI. CI runs typecheck, unit tests, the dash check, and a build on every push, and the live e2e on pushes to main.

## License

MIT
