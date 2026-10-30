# Tuning rounds

Rounds 1 to 6 run on the 8-text dev set (`--set dev`). The final run uses all 42 texts with the shipped prompts and is the only source for the README numbers. Each round's full output is in `eval/results/round-N.json`.

## Round 1

Baseline pipeline. Pairwise judged in one random order.

| Metric | Result | Target |
| --- | --- | --- |
| Tell reduction | 42.8% | >= 80% |
| Claim recall | 94.2% (81/86) | >= 98% |
| Added claims | 0 | 0 |
| Win or tie | 37.5% | >= 85% |
| Length drift | -8.6% | within 10% |

Findings, read from the outputs:
- One paragraph of c05 came back identical to the source. The writer returned drafts as objects, the parser dropped them, and the source paragraph was then used as the only draft. It passed every meaning check.
- Rewrites kept stock words ("fosters", "vital") and broke long sentences into strings of short ones, which the pair judge scored below the source.
- g02 drifted from a formal LinkedIn register into a chatty one; 4 claims were judged "changed".
- The pipeline judge (gpt-oss-20b at low effort) missed a dropped claim in g19.

## Round 2

Changes:
- Drafts wrapped in objects are unwrapped; an empty reply is retried once; the source is never used as a draft.
- A draft must keep the meaning and bring tell density to 35% of the source (or 2 per 100 words) before it can win; otherwise it goes back for a repair that lists the remaining tells.
- Meaning judge: medium effort was tried first and dropped (see below).
- Writer prompt: plain everyday words with examples, keep the prose flowing, keep the source register.
- Pair judge sees both orders; a verdict that flips with the order is a tie.
- Writer moved from qwen3.8-27b to gpt-oss-120b after a one-paragraph A/B on g09: qwen's drafts were choppy and dropped list items; 120b kept them and read more naturally. The eval judge moved to qwen3.8-27b (reasoning on), so it is a different model family from both pipeline models.
- Meaning judge at low effort with a small token budget. At medium effort it reserved so much of Groq's per-minute token window that one paragraph took over six minutes.
- Draft typography (dashes, odd hyphens) is cleaned in code instead of costing a repair round. A lone dash becomes a colon.
- Groups of three copied from the source do not count toward the tell gate, and only abstract groups of three count as a tell at all.

Results (5 of 8 texts; c02, c05 and c07 hit provider errors and the round was stopped):

| Metric | Result | Target |
| --- | --- | --- |
| Tell reduction | 55.8% | >= 80% |
| Claim recall | 85.0% (51/60) | >= 98% |
| Added claims | 3 in 2 texts | 0 |
| Win or tie | 60.0% | >= 85% |
| Length drift | -11.0% | within 10% |

Findings:
- The pipeline's low-effort judge passed drafts that dropped a hedge ("often"), a list item ("creativity", "data-driven", "problem-solving"), or added a detail ("alter a patient's trajectory"). The stricter eval judge caught them.
- The writer cut ordinal markers (First, Second, Finally) as signposting; the pair judge preferred the source's structure in g02.
- Repairs that were told to change nothing else produced stilted sentences ("launched immediately an investigation") in g25.
- Drafts run short.

## Round 3

Changes:
- The meaning judge gets, per draft, the source words the draft no longer uses (function words aside), and is told to check each one that could carry meaning.
- Writer prompt keeps ordinal markers and "often"-type hedges; repairs may rewrite the sentences they touch.
- Length: the writer is asked for 7% either side; drafts fail outside 14%.
- Eval runs one text at a time with the live route's paragraph concurrency, so its timings match a live run.
