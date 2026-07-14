# AT Legal Retrieval — Draft Question Metrics

Generated: 2026-07-14T10:04:29.524Z
Total draft questions: 150
Batch size: 25

## Per-Batch Metrics (jurisdiction=at)

> Haystack: ONLY this batch's target §§ + distractors (small corpus → optimistic). The Per-Domain Summary below seeds ALL entries into one engine — the harder, more realistic number. Quote the Per-Domain values.

| Batch | Domain | n | hit@1 | hit@3 | MRR | Purity |
|-------|--------|---|-------|-------|-----|--------|
| 1 | Zivilrecht/Schadenersatz | 25 | 92.0% | 100.0% | 0.960 | 100.0% |
| 2 | Mietrecht, Arbeitsrecht | 25 | 72.0% | 96.0% | 0.843 | 100.0% |
| 3 | Arbeitsrecht, Gesellschaftsrecht | 25 | 72.0% | 96.0% | 0.820 | 100.0% |
| 4 | Gesellschaftsrecht, Insolvenzrecht, Strafrecht | 25 | 84.0% | 100.0% | 0.913 | 100.0% |
| 5 | Strafrecht, Zivilverfahren/Exekution | 25 | 64.0% | 100.0% | 0.813 | 100.0% |
| 6 | Zivilverfahren/Exekution, Verwaltung/Verfassung, Konsumentenschutz/E-Commerce | 25 | 68.0% | 88.0% | 0.783 | 100.0% |

## Per-Domain Summary

> Haystack: all 166 draft + reviewed gold refs in one engine — the citable baseline.

| Domain | n | hit@1 | hit@3 | MRR |
|--------|---|-------|-------|-----|
| Zivilrecht/Schadenersatz | 25 | 64.0% | 88.0% | 0.765 |
| Mietrecht | 15 | 66.7% | 100.0% | 0.822 |
| Arbeitsrecht | 20 | 50.0% | 80.0% | 0.682 |
| Gesellschaftsrecht | 20 | 50.0% | 85.0% | 0.660 |
| Insolvenzrecht | 15 | 66.7% | 100.0% | 0.822 |
| Strafrecht | 20 | 85.0% | 95.0% | 0.900 |
| Zivilverfahren/Exekution | 15 | 46.7% | 80.0% | 0.633 |
| Verwaltung/Verfassung | 10 | 60.0% | 80.0% | 0.700 |
| Konsumentenschutz/E-Commerce | 10 | 50.0% | 80.0% | 0.633 |

## Overall Jurisdiction Purity (jurisdiction=at)

- Total questions: 150
- Leaks: 0
- Purity: 100.0%
