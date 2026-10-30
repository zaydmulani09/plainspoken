# TASKS

Single source of truth for the build. Survives context compaction.

## Decisions (fixed)
- Server model route: Groq (GROQ_API_KEY). No ANTHROPIC_API_KEY in local env or any Vercel project (checked 2026-10-30).
- Writer: openai/gpt-oss-120b. Judge: openai/gpt-oss-20b (fallback qwen/qwen3.8-27b). Eval judge: qwen/qwen3.8-27b (independent of pipeline judge and writer).
- Groq free tier: 30 RPM, 1K RPD, 8K TPM, 200K TPD per model. Cached prompt tokens do not count.
- Anthropic path (server key if ever set, or BYOK): writer claude-sonnet-5-5, judge claude-haiku-5-5, no temperature, effort via output_config, thinking left adaptive.
- Vercel project: plainspoken-app (plainspoken.vercel.app is taken). Repo: zaydmulani09/plainspoken.
- Commits: Zayd Mulani <zaydmulani@gmail.com>, no trailers.
- Node: winget install at %LOCALAPPDATA%/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS*/node-v24.20.0-win-x64 (not on PATH in this shell; source scratchpad env.sh).

## UI direction (user request 2026-10-30: very Apple, polished, no AI slop; use emilkowalski/skills apple-design + emil-design-eng)
- system-ui for controls; ui-serif / New York stack for the edited text. Size-specific tracking (-0.02em large, ~0 body), tabular-nums for counts.
- Neutrals: #fbfbfd bg / #1d1d1f text; dark #000 bg, #161617 surfaces, #f5f5f7 text. One accent: Apple link blue (#0066cc light, #2997ff dark). No gradients.
- Translucent sticky toolbar (backdrop-filter blur+saturate), scroll-edge fade instead of hard divider.
- Segmented controls (rounded-rect, not pills) with sliding thumb, transform-only transitions, ease-out cubic-bezier(0.23,1,0.32,1), 150-250ms.
- :active scale(0.97); hover gated by (hover:hover) and (pointer:fine); never scale(0); no transition: all.
- prefers-reduced-motion, prefers-reduced-transparency, prefers-contrast handled.
- Still banned by brief: purple/blue gradients, glass cards, emoji icons, centered hero + 3 cards, pill buttons, italic accent words, 01/02/03 labels, monospace labels, cream bg.

## Open
- [ ] Scaffold Next.js app, git init, public repo
- [ ] engine/tells.json with sources
- [ ] engine: text, freeze, lint, voice, diff, guard
- [ ] providers (Groq, Anthropic, BYOK), pipeline (rewrite, verify, repair), routes /api/humanize (NDJSON stream) and /api/analyze
- [ ] limits: 1,500 words server key, per-IP firewall rule, daily cap
- [ ] eval corpus 40+ texts, eval runner, metrics
- [ ] UI: two panes, controls, streaming progress, highlights, tell report, meaning badge, copy, word counts, light/dark
- [ ] Playwright screenshots desktop + 390px, fix issues
- [ ] unit tests (lint, freeze), CI workflow
- [ ] tuning rounds (max 6), record in eval/ROUNDS.md
- [ ] retest Vercel AI Gateway without payment, record result
- [ ] deploy production, env vars, firewall, live e2e (600-word sample), streaming + limits verified
- [ ] README with real eval table
- [ ] dash grep clean

## Done
