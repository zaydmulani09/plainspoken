# Eval round 1 (2026-10-30, dev, 8 texts)

Writer qwen/qwen3.8-27b, pipeline judge openai/gpt-oss-20b, eval judge openai/gpt-oss-120b (Groq). Mode: Standard. Detector: not measured.

| Metric | Result | Target | Met |
| --- | --- | --- | --- |
| Tell reduction (pooled) | 42.8% | >= 80% | no |
| Claim recall | 94.2% (81/86) | >= 98% | no |
| Added claims | 0 in 0 texts | 0 | yes |
| Quality win or tie vs original | 37.5% (3 win, 0 tie, 5 loss) | >= 85% | no |
| Length drift | -8.6% total, 6/8 texts within 10% | within 10% | yes |
| Banned characters in output | 0 | 0 | yes |
| Tell density per 100 words | 6.797 before, 3.888 after | | |
| Sentence length spread (CV) | 0.246 before, 0.344 after | | |
| MATTR (window 50) | 0.876 before, 0.87 after | | |


