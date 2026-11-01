# Eval round 5.1 (2026-10-31, ids:g01-blog-writing-things-down,g02-linkedin-failed-launch,g03-college-changed-mind,g04-product-bottle,g05-email-expenses,g06-reddit-cooking, 6 texts)

Writer openai/gpt-oss-120b, pipeline judge openai/gpt-oss-20b, eval judge qwen/qwen3.8-27b (Groq, and OVHcloud AI Endpoints for 35 of the 48 calls counted in 6 texts). Mode: Standard.

| Metric | Result | Target | Met |
| --- | --- | --- | --- |
| Tell reduction (pooled) | 50.0% | >= 80% | no |
| Claim recall | 90.5% (95/105) | >= 98% | no |
| Added claims | 5 in 3 texts | 0 | no |
| Quality win or tie vs original | 50.0% (1 win, 2 tie, 3 loss) | >= 85% | no |
| Length drift | -4.5% total, 6/6 texts within 10% | within 10% | yes |
| Banned characters in output | 0 | 0 | yes |
| Tell density per 100 words | 3.502 before, 1.751 after | | |
| Sentence length spread (CV) | 0.346 before, 0.345 after | | |
| MATTR (window 50) | 0.889 before, 0.879 after | | |
| Detector: TMR AI text detector (Oxidane/tmr-ai-text-detector), texts flagged AI | 6/6 before, 6/6 after (mean AI probability 0.981 before, 0.972 after) | not a target | |

Fallbacks: 2 original.


