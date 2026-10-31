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

The full 42-text evaluation is running. Tuning rounds on the 8-text dev set, with their numbers, are in [eval/ROUNDS.md](eval/ROUNDS.md).

## Detector

Not measured yet for the final pipeline. The detector and its sanity check are in [eval/detector.ts](eval/detector.ts) and [eval/results/detector-sanity.json](eval/results/detector-sanity.json).

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
