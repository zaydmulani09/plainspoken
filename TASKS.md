# TASKS

Single source of truth for the build. Survives context compaction.

## Decisions (fixed)
- Server model route: Groq (GROQ_API_KEY). No ANTHROPIC_API_KEY in local env or any Vercel project (checked 2026-10-30).
- Vercel AI Gateway: retested 2026-10-30 with the project OIDC token, 403 "requires a valid credit card on file". Not free, not used.
- Groq models on the key (2026-10-30): qwen/qwen3.8-27b, openai/gpt-oss-120b, openai/gpt-oss-20b (plus safeguard/whisper/guard models, unused).
- Writer: qwen/qwen3.8-27b (fallback gpt-oss-120b). Pipeline judge: openai/gpt-oss-20b (fallback gpt-oss-120b). Eval judge: openai/gpt-oss-120b; in eval the pipeline is pinned to qwen + 20b so the eval judge is independent.
- Groq free tier per model: 30 RPM, 1K RPD, 8K TPM, 200K TPD. Admission counts prompt + max tokens; the limiter then books actual usage.
- Anthropic path (server key if ever set, or BYOK): writer claude-sonnet-5-5, judge claude-haiku-5-5, no temperature, effort via output_config, thinking left adaptive.
- Fallback policy: if no draft passes meaning after 2 repairs, keep the original paragraph (never ship a meaning change); a meaning-safe draft that only misses length is kept and flagged.
- Run deadline 235 s (Vercel maxDuration 300); paragraphs not started by then are kept as written and flagged.
- Vercel project: plainspoken-app, live at https://plainspoken-app.vercel.app. Repo: https://github.com/zaydmulani09/plainspoken (public, Git connected).
- Firewall: custom rule "Rate limit humanize per IP", 10 requests / 600 s per IP on /api/humanize, deny. Published 2026-10-30.
- Commits: Zayd Mulani <zaydmulani@gmail.com>, no trailers.
- Node: winget install, not on PATH in this shell; source scratchpad env.sh.

## UI direction (user request 2026-10-30: very Apple, polished, no AI slop; emilkowalski/skills apple-design + emil-design-eng)
- system-ui for controls; ui-serif / New York, then Newsreader, for edited text. Tabular numbers for counts.
- Neutrals #fbfbfd / #1d1d1f, dark #000 / #161617 / #f5f5f7. One accent: #0066cc light, #2997ff dark.
- Translucent sticky toolbar, segmented controls with sliding thumb, :active scale(0.97), hover gated by pointer:fine.
- Reduced motion, reduced transparency, increased contrast handled.

## Open
- [ ] Eval rounds on dev set (max 6), log in eval/ROUNDS.md
- [ ] Final full eval run (42 texts) with shipped prompts
- [ ] README with real eval table, limits, scoring, self-host, Vercel, BYOK
- [ ] Redeploy, live e2e incl. 600-word sample, confirm streaming + limits (413, firewall)
- [ ] CI green on GitHub
- [ ] Final dash grep, TASKS closed, project memory saved

## Done
- Scaffold, engine (text, freeze, tells.json with sources, lint, guard, diff, voice), providers, pipeline, CLI
- API routes: /api/humanize (NDJSON), /api/analyze, /api/status; limits (1,500 words, IP, daily cap)
- UI (Apple direction), headless screenshots desktop + 390px light/dark, no overflow, no console errors
- Unit tests (18), Playwright e2e (5), CI workflow
- Eval corpus: 42 sources from 4 generators (eval/corpus.json), runner + independent judge
- Public repo pushed, Vercel project + GROQ_API_KEY env + production deploy, firewall rule
