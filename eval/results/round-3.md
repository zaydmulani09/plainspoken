# Eval round 3 (2026-10-31, dev, 3 texts)

Writer openai/gpt-oss-120b, pipeline judge openai/gpt-oss-20b, eval judge qwen/qwen3.8-27b (Groq). Mode: Standard.

| Metric | Result | Target | Met |
| --- | --- | --- | --- |
| Tell reduction (pooled) | 42.9% | >= 80% | no |
| Claim recall | 85.3% (29/34) | >= 98% | no |
| Added claims | 0 in 0 texts | 0 | yes |
| Quality win or tie vs original | 33.3% (1 win, 0 tie, 2 loss) | >= 85% | no |
| Length drift | -7.4% total, 2/3 texts within 10% | within 10% | yes |
| Banned characters in output | 0 | 0 | yes |
| Tell density per 100 words | 6.732 before, 3.845 after | | |
| Sentence length spread (CV) | 0.194 before, 0.187 after | | |
| MATTR (window 50) | 0.9 before, 0.902 after | | |
| Detector: TMR AI text detector (Oxidane/tmr-ai-text-detector), texts flagged AI | 3/3 before, 3/3 after (mean AI probability 0.985 before, 0.981 after) | not a target | |

Not finished: g19-explainer-api, g25-postmortem-cert, c02-essay-social-media, c05-report-sales, c07-blog-productivity
