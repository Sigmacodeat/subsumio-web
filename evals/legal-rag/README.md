# Legal-RAG Eval (v0.43)

Benchmark für Legal-RAG-Qualität in SigmaBrain.

## Was das beweist

Dieser Eval misst, wie gut SigmaBrain's Brain (Knowledge Graph + Hybrid RAG + Agent Workspace) **legal-spezifische Fragen** beantwortet:

| Dimension | Was gemessen wird |
|---|---|
| **statute_citation_precision** | §-Zitate korrekt identifiziert? |
| **case_reference_recall** | Akten-Verweise gefunden? |
| **deadline_extraction_accuracy** | Fristen korrekt extrahiert? |
| **judgement_retrieval** | Rechtsprechung gefunden? |
| **risk_detection** | Risiken identifiziert? |

## Methodik

### Fixtures

`fixtures.jsonl` — 10 hand-authored Legal-Fragen (DE/AT), 3 Schwierigkeitsgrade:

- **easy**: Direkte §-Zitate (Verjährung, Klageerwiderung)
- **medium**: Akten-bezogene Fragen (Fristen, Evidence)
- **hard**: Rechtsprechung + aktuelle Entwicklungen (EuGH, BAG)

Jede Fixture hat:
- `expected_statutes` — erwartete §-Zitate
- `expected_cases` — erwartete Akten-Slugs
- `expected_deadlines` — erwartete Fristen
- `expected_judgements` — erwartete Rechtsprechung
- `expected_risks` — erwartete Risiken
- `dimensions` — welche Eval-Dimensionen aktiv sind

### Scoring

Lenient substring match: Wenn die Agent-Antwort "§ 199 BGB" enthält, zählt es als Treffer für `expected_statutes: ["§ 199 BGB"]`.

Per-dimension: `found / expected.length`  
Macro-average: Mittelwert über alle aktiven Dimensions pro Fixture.

## Usage

```bash
# Mit Default-Modell (claude-haiku-4-5)
node evals/legal-rag/runner.mjs

# Mit bestimmtem Modell
node evals/legal-rag/runner.mjs --model claude-opus-4 --brain acme-law
```

## Erwartete Scores (Baseline)

| Dimension | Baseline (Haiku) | Ziel (Opus) |
|---|---|---|
| statute_citation_precision | 70% | 90% |
| case_reference_recall | 60% | 85% |
| deadline_extraction_accuracy | 65% | 90% |
| judgement_retrieval | 40% | 75% |
| risk_detection | 55% | 80% |
| **MACRO AVERAGE** | **58%** | **84%** |

## Adding Fixtures

```jsonl
{"question": "...", "expected_statutes": ["..."], "dimensions": ["..."], "difficulty": "easy"}
```
