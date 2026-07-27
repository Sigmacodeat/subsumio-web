# Runbook: Embedding-Model-Sweep (AT-Retrieval-Offensive)

**Datum:** 2026-07-18
**Ziel:** Datengetrieben prüfen, ob ein anderes Embedding-Modell die AT-Retrieval-Schwäche behebt (MRR 0,670 vs. DE 0,842; Hit@5 86,7 %).
**Artefakte:**

- `server/src/eval/dach-legal-retrieval/embedding-model-sweep.ts` (Runner: subset → prepare → run → report)
- `server/src/eval/dach-legal-retrieval/embedding-model-sweep.config.json` (Kandidaten)

## Kandidaten

| ID                 | Modell                                   | Dims | Rolle                                          |
| ------------------ | ---------------------------------------- | ---: | ---------------------------------------------- |
| baseline-te3s-1536 | openrouter:openai/text-embedding-3-small | 1536 | Ist-Stand (Prod)                               |
| te3l-3072          | openrouter:openai/text-embedding-3-large | 3072 | gleicher Provider, stärker                     |
| voyage3l-1024      | voyage:voyage-3-large                    | 1024 | asymmetrisches Retrieval-Modell                |
| zembed1-1280       | zeroentropyai:zembed-1                   | 1280 | Gewinner des internen v0.36-Evals (11/20 Wins) |

## Voraussetzungen (vor Start prüfen)

1. **Embedding-Backlog abgeschlossen** (aktuell 148.646 pending; Baseline-Spalte muss auf dem Subset vollständig sein, sonst Warnung im Run).
2. **SSH-Tunnel zur Prod-DB** (wie im Corpus-Audit): Port 15432 → `DATABASE_URL=postgresql://user:pass@localhost:15432/dbname`.
3. **API-Keys** für alle Kandidaten im Env/der Engine-Config: `OPENROUTER_API_KEY`, `VOYAGE_API_KEY`, `ZEROENTROPY_API_KEY`. Fehlende Keys → Kandidat aus `embedding-model-sweep.config.json` entfernen.
4. **DB-Schreibrechte** (ALTER TABLE content_chunks) für die prepare-Phase.
5. Laufverzeichnis: `cd server` (Fixtures werden relativ zu `test/fixtures` geladen).

## Ablauf

```bash
cd server

# 0. Trockenlauf: Zählungen + Kostenschätzung, keine Writes
DATABASE_URL=... bun run src/eval/dach-legal-retrieval/embedding-model-sweep.ts \
  --phase prepare --dry-run

# 1. Komplettlauf AT (Subset 150k, deterministisch; prepare ist resumable)
DATABASE_URL=... bun run src/eval/dach-legal-retrieval/embedding-model-sweep.ts \
  --jurisdiction at

# 2. Mit DE-Kontrollgruppe + Prod-Reranker (härtet das Ergebnis ab)
DATABASE_URL=... bun run src/eval/dach-legal-retrieval/embedding-model-sweep.ts \
  --jurisdiction at --with-de --llm-rerank --phase run
DATABASE_URL=... bun run src/eval/dach-legal-retrieval/embedding-model-sweep.ts --phase report
```

**Erwartete Kosten/Dauer (Richtwerte, 150k-Chunks-Subset ≈ 50M Token/Modell):**

- te3l-3072: ~$7 · voyage3l-1024: ~$9 · zembed1-1280: ~$5 (Preise aus Config prüfen!)
- ~20–40 Min prepare pro Modell (Rate-Limits abhängig), HNSW-Index zusätzlich einige Minuten.

## Interpretation (wichtig)

- **n=80 AT-Fragen → ±5–10 pp statistisches Rauschen.** Ein MRR-Delta < 0,02 ist kein Sieg. Erst bestätigen: `--llm-rerank` + DE-Kontrollgruppe (`--with-de`).
- Keyword-Arm, Reranker, Dedup sind für alle Kandidaten identisch — gemessen wird ausschließlich der Vektorbeitrag.
- Kandidaten mit `missing_embeddings > 0` im Ergebnis-JSON sind **nicht vergleichbar**.
- Report: `server/src/eval/dach-legal-retrieval/embedding-model-sweep-out/sweep-report.md`.

## Bei einem Sieger

1. Ergebnis in `optimization-config.json` dokumentieren (wie bisherige Sweeps).
2. Entscheidung Re-Embedding Gesamtkorpus (2,07M Chunks — Kosten/Latenz/Downtime-Plan; `embedding_signature` wird vom Embed-Pfad gestempelt).
3. `DEFAULT_EMBEDDING_MODEL` in `server/src/core/ai/defaults.ts` + Doctor-Checks aktualisieren.
4. Danach AT-Goldset erweitern (80 Fragen sind dünn) und Holdout extern versiegeln (offene Audit-Punkte).

## Rollback

```sql
ALTER TABLE content_chunks DROP COLUMN IF EXISTS embedding_te3l;
ALTER TABLE content_chunks DROP COLUMN IF EXISTS embedding_voyage3l;
ALTER TABLE content_chunks DROP COLUMN IF EXISTS embedding_ze1280;
```

## Bekannte Grenzen

- Subset-Messung überschätzt absolute Hit-Raten (kleinerer Distraktor-Raum als 2M Prod-Chunks) — valide ist der **relative** Vergleich, nicht die absolute Zahl.
- Reranker-Modell (zerank-2/DeepSeek) bleibt konstant; ein Sieger-Embedding kann sich mit/ohne Rerank unterschiedlich verhalten — darum beide Läufe.
