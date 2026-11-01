# Eval round 5 (2026-10-31, all, 42 texts)

Writer openai/gpt-oss-120b, pipeline judge openai/gpt-oss-20b, eval judge qwen/qwen3.8-27b (Groq, and OVHcloud AI Endpoints for 212 of the 322 calls counted in 28 texts). Mode: Standard.

| Metric | Result | Target | Met |
| --- | --- | --- | --- |
| Tell reduction (pooled) | 45.2% | >= 80% | no |
| Claim recall | 85.7% (611/713) | >= 98% | no |
| Added claims | 46 in 21 texts | 0 | no |
| Quality win or tie vs original | 73.8% (16 win, 15 tie, 11 loss) | >= 85% | no |
| Length drift | -4.9% total, 36/42 texts within 10% | within 10% | yes |
| Banned characters in output | 0 | 0 | yes |
| Tell density per 100 words | 4.412 before, 2.417 after | | |
| Sentence length spread (CV) | 0.332 before, 0.342 after | | |
| MATTR (window 50) | 0.863 before, 0.86 after | | |
| Detector: TMR AI text detector (Oxidane/tmr-ai-text-detector), texts flagged AI | 42/42 before, 41/42 after (mean AI probability 0.983 before, 0.941 after) | not a target | |

Fallbacks: 14 original.


