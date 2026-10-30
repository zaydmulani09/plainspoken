# Eval round 2 (2026-10-30, dev, 5 texts)

Writer openai/gpt-oss-120b, pipeline judge openai/gpt-oss-20b, eval judge qwen/qwen3.8-27b (Groq). Mode: Standard.

| Metric | Result | Target | Met |
| --- | --- | --- | --- |
| Tell reduction (pooled) | 55.8% | >= 80% | no |
| Claim recall | 85.0% (51/60) | >= 98% | no |
| Added claims | 3 in 2 texts | 0 | no |
| Quality win or tie vs original | 60.0% (2 win, 1 tie, 2 loss) | >= 85% | no |
| Length drift | -11.0% total, 3/5 texts within 10% | within 10% | no |
| Banned characters in output | 0 | 0 | yes |
| Tell density per 100 words | 4.862 before, 2.147 after | | |
| Sentence length spread (CV) | 0.227 before, 0.248 after | | |
| MATTR (window 50) | 0.864 before, 0.865 after | | |
| Detector: TMR AI text detector (Oxidane/tmr-ai-text-detector), texts flagged AI | 5/5 before, 5/5 after (mean AI probability 0.984 before, 0.975 after) | not a target | |

Not finished: c02-essay-social-media, c05-report-sales, c07-blog-productivity
