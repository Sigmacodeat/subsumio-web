---
description: Iterative HNSW / Hybrid Recall-Optimierung für Legal RAG
---

# HNSW Recall Optimization Workflow

> Ziel: Systematisch die Recall-Kennzahlen (Hit@K, MRR) des legalen RAG-Retrievals steigern, bis ein produktionsreifer Grenzwert erreicht ist. Orientiert sich an State-of-the-Art Legal-AI-Systemen (Harvey, CoCounsel, vLex Cloud): dense + sparse + rerank + query expansion + citation-aware ranking.

## Scope

- `server/src/core/search/hybrid.ts` — Hybrid Search & RRF/Rerank-Pipeline
- `server/src/core/search/embedding-column.ts` — Embedding-Spalten-Auflösung
- `server/src/eval/at-legal-retrieval/run.ts` — AT Legal Retrieval Benchmark
- `server/src/eval/de-legal-retrieval/run.ts` — DE Legal Retrieval Benchmark (optional)
- `server/scripts/full-embedding-quality-audit.ts` — Embedding-Qualitäts-Audit
- `server/scripts/chunk-quality-audit.ts` — Chunk-Text-Qualitäts-Audit
- `server/scripts/chunk-quality-fix.ts` — Chunk-Fixes / Re-Chunking
- `server/scripts/re-embed-model.ts` — Re-Embedding bei Modellwechsel
- `server/scripts/ab-test-models.ts` — A/B/Sweep-Harness
- `server/src/core/legal/corpus-quality-report.ts` — `daily-ops` für Trend-Tracking

## Vorbedingungen

1. `source_id` in `content_chunks` zu 100% gesetzt, `idx_chunks_source_id` gebaut.
2. HNSW-Index auf der tatsächlich genutzten Embedding-Spalte (`embedding` als Default) fertig und `ANALYZE`/`pg_prewarm` durchgeführt.
3. `hnsw.ef_search` initial auf `200` gesetzt (`ALTER DATABASE sigmabrain SET hnsw.ef_search = '200';`).
4. Keine `chunk_text` mit "Volltext nicht abrufbar", keine NULL-Embeddings, keine verwaisten Chunks/Pages.

## Phase 1 — Baseline messen

1. **AT-Benchmark mit LLM-Rerank laufen lassen**:

   ```bash
   bun run server/src/eval/at-legal-retrieval/run.ts --llm-rerank
   ```
   - Ergebnisdateien: `/tmp/at-legal-rerank-baseline.jsonl` (oder default).
   - Metriken erfassen: `Hit@1`, `Hit@3`, `Hit@5`, `Hit@8`, `MRR`.
   - Pro-Source/Pro-Area Breakdown erzeugen (z. B. `law-at`, `at-judikatur`, `at-judikatur-vwgh`).

2. **Datenqualität parallel prüfen**:

   ```bash
   bun run server/scripts/full-embedding-quality-audit.ts
   bun run server/scripts/chunk-quality-audit.ts
   ```
   - Ziel: sicherstellen, dass keine falschen Modelle/Dimensionen oder leere Chunks versteckt die Metriken drücken.

3. **Baseline snapshot** in `~/.gbrain/recall-sweep/` speichern mit Zeitstempel.

## Phase 2 — Misses kategorisieren

Für jede Frage im Benchmark-Fixture, die nicht in `Hit@5` liegt:

- **Quelle**: Welches `source_id` hätte ranken müssen? (`law-at`, `at-judikatur-*`, `law-eu`, …)
- **Typ**: Ist die richtige Antwort überhaupt im Index? (Indexierungsproblem) Oder im Top-20 aber nicht Top-5? (Ranking-Problem) Oder ganz fehlend? (Coverage-Problem)
- **Rank**: Top-20, Top-50, gar nicht? Mit `EXPLAIN ANALYZE` prüfen, ob der HNSW-Index überhaupt verwendet wird.
- **Verwandtheit**: Semantische Lücke (Synonyme, Abkürzungen, Paragraphennummern) vs. exakte Keyword-Lücke?
- **Temporal**: Treffer durch `asOfDate`/`source_id` fälschlich herausgefiltert?

## Phase 3 — Hebel in Reihenfolge abarbeiten

### 3.1 HNSW-Suchparameter sweepen (schnell, kein Re-Index)

1. Pro Sitzung/Query `hnsw.ef_search` variieren: `64`, `128`, `200`, `256`, `512`.
2. Benchmark pro Wert wiederholen und Latenz vs. Recall plotten.
3. Sweet spot wählen: maximaler Recall bei < 8 s pro Query (bzw. `statement_timeout`-Limit).
4. Gewählten Wert persistieren:
   ```sql
   ALTER DATABASE sigmabrain SET hnsw.ef_search = '<gewählter_wert>';
   ```

### 3.2 HNSW-Build-Parameter prüfen (nur wenn 3.1 nicht reicht)

1. `EXPLAIN ANALYZE` für exemplarische Queries prüfen, ob HNSW-Index scan verwendet wird.
2. Falls Index-Scan fehlt oder Recall unter 85%: Neuen HNSW-Index mit erhöhten `m`/`ef_construction` bauen:
   ```sql
   SET maintenance_work_mem = '4GB';
   SET max_parallel_maintenance_workers = 4;
   CREATE INDEX idx_chunks_embedding_hnsw_v3 ON content_chunks
     USING hnsw (embedding vector_cosine_ops)
     WITH (m = '32', ef_construction = '256');
   ANALYZE content_chunks;
   SELECT pg_prewarm('idx_chunks_embedding_hnsw_v3');
   ```
3. A/B: alten und neuen Index gegenüber testen; den besseren behalten.

### 3.3 Hybrid-Gewichte & RRF tuning

1. In `server/src/core/search/hybrid.ts` prüfen:
   - Werden vector- und keyword-scores richtig normalisiert?
   - RRF-Konstante `k` (typisch 60) liegt im sinnvollen Bereich?
   - Gibt es source-boosts / court-hierarchy-boosts, die falsch gewichtet sind?
2. Parameter sweep über `keyword_weight` / `vector_weight` / `rrf_k` falls konfigurierbar.
3. Messen: reiner Vector vs. reiner Keyword vs. Hybrid -> nachweisen, dass beide Signale arbeiten.

### 3.4 Query Expansion & Synonyme

1. `server/src/core/search/legal-query-expand.ts` prüfen, ob AT/DE/CH-spezifische Synonyme enthalten.
2. Fehlende Muster aus Misses ergänzen, z. B.:
   - `Schadenersatz` ↔ `Schadensersatz` ↔ `Ersatz`
   - `Herausgabe` ↔ `Rückgabe` ↔ `Rückstell`
   - `Verkehrssicherungspflicht` ↔ `Verkehrssicherung` ↔ `Verkehrspflicht`
3. Optional: LLM-basierte Query-Umschreibung (HyDE) im `legalMode` aktivieren, falls vorhanden.

### 3.5 Reranker tuning

1. `llmRerank`-Parameter in `hybrid.ts` prüfen:
   - `topNIn`: Anzahl Chunks, die an den LLM-Reranker übergeben werden (25/50/100).
   - Snippet-Länge pro Chunk (300-500 Zeichen).
   - Modell (DeepSeek V3.2 vs. Claude Sonnet) und Timeout.
2. Benchmark mit `topNIn=50` vs. `topNIn=25`, mit/ohne Rerank vergleichen.
3. Kosten pro Query tracken; Reranker ist teuerster Teil.

### 3.6 Embedding-Modell prüfen/wechseln (teuerster Hebel)

1. Prüfen, ob Query-Embeddings und Index-Embeddings identisches Modell verwenden (`resolveEmbeddingColumn` prüfen).
2. Evaluation mit `bun run server/scripts/ab-test-models.ts` gegen ein alternatives Modell (z. B. `voyage-3-large`, `text-embedding-3-large`):
   - Nur repräsentative 50-100 Fragen; schnelles Ranking-Teil-Ergebnis.
3. Falls Modellwechsel gewinnt: `re-embed-model.ts` für betroffene `source_id`s ausführen und neuen HNSW bauen.

### 3.7 Chunking & Chunk-Text-Qualität

1. Mit `chunk-quality-audit.ts` auffällige `chunk_text` identifizieren:
   - Zu große/small Chunks
   - Chunks, die am falschen Paragraph/Artikel-Grenzen geteilt sind
   - Urteile ohne `case_number` oder korrekte Metadaten im Chunk-Kontext
2. Bei Bedarf `rechunk-oversized-pages.ts` oder `chunk-quality-fix.ts` laufen lassen.
3. Nach Re-Chunking Embeddings und `search_vector` neu erzeugen.

### 3.8 Citation-aware & Precedent Treatment Ranking

1. `server/src/core/legal/treatment.ts` / `aggregateTreatments()` prüfen:
   - Positive Authority (`bestätigt`, `abgelehnt`, `abgewiesen`) richtig gewichtet?
   - Negative Authority (`aufgehoben durch`, `ersetzt durch`) korrekt gedampft?
2. `citation_status` aus der Citation-Enrichment-Phase als Ranking-Signal verwenden.
3. `findNegativeAuthority()` für Gegenjudikatur-Boosts, falls Zielsystem relevant.

## Phase 4 — A/B-Harness und Iteration

1. **Jeder Hebel** wird als eigener Branch/Parameter-Set getestet.
2. Für jede Änderung:
   - `bun run server/src/eval/at-legal-retrieval/run.ts --llm-rerank`
   - Ergebnisse in JSONL-Datei mit Suffix (z. B. `...-ef200.jsonl`)
3. Mit `server/scripts/ab-test-models.ts` oder einem eigenen `compare-sweep.ts`:
   - `Hit@K`-Delta pro Hebel ausgeben.
   - Konfidenzintervalle anzeigen (wenigstens anhand der Frage-Anzahl).
4. **Stop-Kriterium**:
   - Ziel erreicht: `Hit@5 >= 90%` (oder projektspezifisches Ziel)
   - Oder: Zwei aufeinanderfolgende Iterationen bringen zusammen < 2% Gain.

## Phase 5 — Produktionsreife prüfen

1. Latenz: p95 der Benchmark-Queries < 8 s (`SEARCH_STMT_TIMEOUT_MS` in `connection-manager.ts`).
2. Kosten: Reranker-Kosten pro Query dokumentieren.
3. Indexgröße: `pg_size_pretty(pg_relation_size('idx_chunks_embedding_hnsw_...'))` im Blick behalten.
4. `verify-optimization` durchlaufen:
   - Keine `any`-Types
   - Keine Magic Numbers
   - Relevante Tests grün
   - Keine Mock-Daten

## Verknüpfungen

- `/.windsurf/workflows/verify-optimization.md` — nach jeder Optimierung ausführen.
- `/.windsurf/workflows/optimize-legal-engine.md` — für juristische Domain-Engine (Fristen, RVG, Treatment).
- `/.windsurf/plans/epic4-retrieval-recherche.md` — Langfrist-Roadmap Retrieval.
- `server/scripts/daily-ops.ts` — tägliches `corpus-quality-report` für Trend-Tracking.

## Definition of Done

- [ ] Baseline-Benchmark mit Latenz/Kosten dokumentiert.
- [ ] Misses kategorisiert (Coverage / Ranking / Indexierung / Filter).
- [ ] Mindestens 3 Hebel aus Phase 3 systematisch getestet.
- [ ] A/B-Ergebnisse pro Hebel in JSONL/CSV gespeichert.
- [ ] Gewählte Konfiguration ist reproduzierbar (`hnsw.ef_search`, HNSW-Build-Param, Gewichte, Reranker-TopN).
- [ ] Finaler Benchmark zeigt Ziel-Recall bei akzeptabler Latenz.
- [ ] `verify-optimization` grün.
