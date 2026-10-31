# Eval round 4 (2026-10-31, dev, 3 texts)

Writer openai/gpt-oss-120b, pipeline judge openai/gpt-oss-20b, eval judge qwen/qwen3.8-27b (Groq). Mode: Standard.

| Metric | Result | Target | Met |
| --- | --- | --- | --- |
| Tell reduction (pooled) | 35.3% | >= 80% | no |
| Claim recall | 91.2% (31/34) | >= 98% | no |
| Added claims | 0 in 0 texts | 0 | yes |
| Quality win or tie vs original | 66.7% (1 win, 1 tie, 1 loss) | >= 85% | no |
| Length drift | -5.4% total, 3/3 texts within 10% | within 10% | yes |
| Banned characters in output | 0 | 0 | yes |
| Tell density per 100 words | 6.732 before, 4.355 after | | |
| Sentence length spread (CV) | 0.194 before, 0.19 after | | |
| MATTR (window 50) | 0.9 before, 0.893 after | | |
| Detector: TMR AI text detector (Oxidane/tmr-ai-text-detector), texts flagged AI | 3/3 before, 3/3 after (mean AI probability 0.985 before, 0.984 after) | not a target | |

Not finished: g19-explainer-api, g25-postmortem-cert, c02-essay-social-media, c05-report-sales, c07-blog-productivity
