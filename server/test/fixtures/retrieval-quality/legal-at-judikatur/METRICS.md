# AT Judikatur Retrieval — Draft Question Metrics

Generated: 2026-07-14T18:40:38.532Z
Draft questions: 36 (plus 20 reviewed gold, seeded together)

> Leakage-free (2026-07-14): no query contains the target decision's Geschäftszahl.
> Draft queries are auto-extracted Rechtssatz keywords — read as word-salad, not yet
> reviewed. SMALL-HAYSTACK CAVEAT: only these 56 decisions + 3 DE distractors are
> seeded — hit@1=100% here does NOT transfer to the real ~10,807-decision corpus,
> it only proves purity + structural correctness. A honest baseline against the full
> corpus requires seeding (or querying) the production DB, not a fresh PGLite engine.

## Overall (jurisdiction=at, keyword-only hybrid search)

| Metric   | Score            |
| -------- | ---------------- |
| hit@1    | 100.0%           |
| hit@3    | 100.0%           |
| MRR      | 1.000            |
| recall@3 | 100.0%           |
| Purity   | 100.0% (0 leaks) |

## Per-Statute Breakdown

| Norm    | n   | hit@1  | hit@3  | MRR   |
| ------- | --- | ------ | ------ | ----- |
| ABGB    | 3   | 100.0% | 100.0% | 1.000 |
| StGB    | 3   | 100.0% | 100.0% | 1.000 |
| StPO    | 3   | 100.0% | 100.0% | 1.000 |
| ZPO     | 3   | 100.0% | 100.0% | 1.000 |
| EO      | 3   | 100.0% | 100.0% | 1.000 |
| UGB     | 3   | 100.0% | 100.0% | 1.000 |
| ASVG    | 3   | 100.0% | 100.0% | 1.000 |
| ArbVG   | 3   | 100.0% | 100.0% | 1.000 |
| KSchG   | 3   | 100.0% | 100.0% | 1.000 |
| MRG     | 3   | 100.0% | 100.0% | 1.000 |
| AußStrG | 3   | 100.0% | 100.0% | 1.000 |
| IO      | 3   | 100.0% | 100.0% | 1.000 |
