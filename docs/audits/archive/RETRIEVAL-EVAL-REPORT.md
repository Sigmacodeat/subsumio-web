# Retrieval-Eval Report — AT-Legal Benchmark (80 Fragen)

**Datum:** 2026-08-24 (aktualisiert mit DeepSeek LLM-Reranker)
**Corpus:** 3.644.044 chunks, 24 Quellen, `subsumio_law_v2`
**Benchmark:** `server/test/fixtures/at-legal-retrieval.jsonl` (80 AT-Rechtsfragen, 24 Rechtsgebiete)

---

## Ergebnisse nach Pipeline-Stufe

| Pipeline-Stufe                          | H@1       | H@3       | H@5       | H@8       | MRR       | Zeit   |
| --------------------------------------- | --------- | --------- | --------- | --------- | --------- | ------ |
| IVFFlat probes=1 (Default)              | 15.0%     | 21.3%     | 38.8%     | 45.0%     | 0.226     | 8 min  |
| IVFFlat probes=120                      | 17.5%     | 30.0%     | 43.8%     | 56.3%     | 0.277     | 10 min |
| + bge-reranker-v2-m3 (topNIn=30)        | 20.0%     | 27.5%     | 41.3%     | 48.8%     | 0.273     | 20 min |
| **+ DeepSeek LLM-Reranker (topNIn=30)** | **45.0%** | **62.5%** | **71.3%** | **76.3%** | **0.552** | 15 min |
| + DeepSeek LLM-Reranker (topNIn=50)     | 43.8%     | 55.0%     | 70.0%     | 71.3%     | 0.530     | 16 min |
| Sequential Scan (Ground Truth)          | 16.2%     | 31.2%     | 42.5%     | 57.5%     | 0.273     | 8 min  |

### Recall@K — Candidate Generation Quality (ohne Reranker)

| Metrik        | Wert      | Bedeutung                   |
| ------------- | --------- | --------------------------- |
| Hit@1         | 16.2%     | Gold-Dokument an Position 1 |
| Hit@5         | 45.0%     | Gold-Dokument in Top-5      |
| Hit@10        | 66.2%     | Gold-Dokument in Top-10     |
| Hit@20        | 82.5%     | Gold-Dokument in Top-20     |
| **Recall@30** | **86.2%** | **Gold-Dokument in Top-30** |
| **Recall@50** | **90.0%** | **Gold-Dokument in Top-50** |
| Miss          | 10.0%     | Gar nicht in Top-50         |

### Key Findings (korrigiert)

1. **Recall@30 = 86.2%** — das Gold-Dokument ist in 86% der Fälle in den Top-30. **Das ist ein Ranking-Problem, kein Embedding-Problem.** Das Embedding findet die Dokumente, es ordnet sie nur falsch.
2. **DeepSeek LLM-Reranker ist der Durchbruch** — H@1 von 17.5% → **45.0%** (+27.5pp), H@5 von 43.8% → **71.3%** (+27.5pp). Der LLM listwise-reranking von Top-30 Kandidaten ist deutlich stärker als der bge cross-encoder.
3. **topNIn=30 ist optimal** — topNIn=50 ist leicht schlechter (mehr Noise für den LLM, längere Prompts).
4. **bge-reranker ist schwach für Legal-Domain** — multilingual aber nicht legal-spezifisch. Verschlechtert sogar H@5/8. DeepSeek als generischer LLM versteht juristische Relevanz besser.
5. **IVFFlat probes=120 ≈ Sequential Scan** — kein Recall-Verlust durch ANN-Index.
6. **BM25 fehlt weiterhin** — `paradedb` schema nicht installiert (PG16-Kompatibilität). Fallback auf `ts_rank`. BM25 + DeepSeek-Reranker könnte weiter steigern.
7. **Die bisherigen Ergebnisse sprechen dafür, dass die Candidate Generation bzw. das Embedding-Modell aktuell der dominante Flaschenhals ist** — aber erst nach Ausschöpfung des Ranking-Potenzials. Mit Recall@30=86% ist das Ranking der primäre Hebel.

---

## Starke Rechtsgebiete (H@1 ≥ 30%)

| Rechtsgebiet | n   | H@1  | H@3  | H@5  | MRR   |
| ------------ | --- | ---- | ---- | ---- | ----- |
| GmbHG        | 2   | 100% | 100% | 100% | 1.000 |
| BAO          | 1   | 100% | 100% | 100% | 1.000 |
| StGB         | 5   | 40%  | 80%  | 100% | 0.583 |
| UGB          | 5   | 40%  | 60%  | 60%  | 0.529 |
| EstG         | 2   | 50%  | 50%  | 50%  | 0.500 |
| AktG (AT)    | 2   | 50%  | 50%  | 50%  | 0.500 |

## Schwache Rechtsgebiete (H@1 = 0%)

| Rechtsgebiet | n   | H@3 | H@5 | MRR   | Diagnose                                       |
| ------------ | --- | --- | --- | ----- | ---------------------------------------------- |
| GewO         | 5   | 0%  | 20% | 0.040 | Embedding findet GewO-Chunks nicht             |
| AVG          | 5   | 0%  | 0%  | 0.000 | VAG/AVG Verwechslung, Chunking-Problem         |
| DSG          | 2   | 0%  | 50% | 0.100 | DSG hat wenige Chunks, schwache Vektor-Matches |
| JN           | 3   | 0%  | 33% | 0.067 | Jurisdiktionsnorm — komplexer Query-Typ        |
| ArbVG        | 5   | 20% | 20% | 0.129 | Arbeitsrecht — Embedding-Kluft                 |
| AktG         | 2   | 0%  | 0%  | 0.063 | Aktienrecht — ähnliche Chunks konkurrieren     |

---

## Infrastruktur-Status

| Komponente           | Status   | Details                                                    |
| -------------------- | -------- | ---------------------------------------------------------- |
| Embeddings           | ✅ 100%  | 3.644.044/3.644.044, OpenAI text-embedding-3-small, $29    |
| source_id            | ✅ 100%  | 3.644.044/3.644.044 (v0.42 denormalized)                   |
| IVFFlat-Index        | ✅       | 28 GB, 3600 lists, probes=120 (filtered) / 60 (unfiltered) |
| HNSW-Index           | ❌       | Docker 11.67 GB RAM-Limit, braucht Server mit >16 GB       |
| BM25 (paradedb)      | ❌       | PG16-Kompatibilität, ParadeDB braucht PG17+                |
| BM25 (pg_textsearch) | ❌       | Timescale-Extension, noch nicht installiert                |
| bge-reranker-v2-m3   | ✅ lokal | Python/transformers, CPU-basiert, ~15s/query               |
| LLM-Reranker         | ❌       | Nicht getestet (DeepSeek verfügbar)                        |

---

## Roadmap zu 95% Hit@5

### Phase 1: BM25 (Hypothese: +5-10% H@5 — UNGETESTET)

- **pg_textsearch** (Timescale, Postgres-Lizenz) statt ParadeDB (AGPL)
- PG16-kompatibel, C-basiert, 2.4-6.5x schneller als ParadeDB
- Install: `apt install postgresql-16-pg-textsearch` + BM25-Index auf `chunk_text`
- Aufwand: 30 min, Kosten: $0
- ⚠️ **Prognose, nicht gemessen** — muss nach Implementierung evaluiert werden

### Phase 2: Embedding-Upgrade (Hypothese: +5-15% H@5 — UNGETESTET)

- **voyage-law-2** (domain-spezifisch, CUAD-Benchmark-Sieger)
- Oder **Kanon 2 Embedder** (Legal RAG Bench: +34% retrieval accuracy)
- Vorab-Test: repräsentativer Subset (100 Fragen) mit beiden Modellen vergleichen
- Re-Embedding: 3.6M chunks × $0.06/M tokens ≈ $60
- Aufwand: 2h, Kosten: ~$60
- ⚠️ **Prognose, nicht gemessen** — CUAD ≠ AT-Rechtsdokumente

### Phase 3: HNSW-Index + RAM-Upgrade (ROOT-CAUSE-FIX, nicht nur Performance)

- **Warum das kritisch ist:** `pg_statio_user_indexes` zeigt die entscheidende Zahl:
  - `idx_chunks_embedding` (28 GB): **214.8M disk reads, 16.1M hits → 7.0% Cache-Hit**
  - `idx_chunks_search_vector` (3.7 GB): 10.8M disk reads, 543M hits → 98.0% Cache-Hit
  - `shared_buffers = 2 GB` — der 28 GB Vektor-Index wird zu **93% von der Platte gelesen**.
- **Das ist nicht „gelegentlich kalt".** Das ist permanent disk-bound. Die Bimodalität 20.6s / 1.2s ist OS-Page-Cache-Glück, nicht Postgres-Buffer-Cache. Die 1/80 NO-VEC Rate im Eval entsteht nur weil 80 Queries hintereinander auf derselben Maschine laufen und das OS zufällig die richtigen Seiten hält. Bei verteiltem Produktions-Traffic gibt es diesen Effekt nicht — die Rate wird höher sein.
- **Produktionsbug gefunden:** `at-059` (Asylwerber-Query) fällt deterministisch auf keyword-only zurück (20.6s kalt > 15s `statement_timeout`). In Produktion trifft dieselbe Ausfallrate echte Nutzer — still, ohne Fehler im Report.
- **Fix-Optionen (alle kombinierbar):**
  1. **HNSW-Index:** gewinnt nicht weil der Index in den RAM passt (22 GB Rohvektoren + Graph > 32 GB), sondern weil HNSW pro Query eine Graph-Traversierung von wenigen MB macht statt bei `probes=120` rund 3.3% eines 28 GB Index anzufassen. Hebel = gelesene Seiten pro Query.
  2. **`halfvec` (float16):** Index 28 GB → ~14 GB, Recall-Verlust bei 1536d typischerweise vernachlässigbar. HNSW auf halfvec wird von pgvector 0.8.5 unterstützt.
  3. **Matryoshka-Reduktion auf 512d:** `text-embedding-3-small` ist dafür trainiert. Index → ~9 GB. Kostet ein Re-Embedding, aber die Pipeline existiert bereits.
  4. **Hetzner CCX23 (32 GB RAM):** mehr Buffer-Cache, HNSW baubar.
- **Vorher:** HNSW war als „Phase 3, quasi optional" klassifiziert. **Jetzt:** Root-Cause-Fix für silent vector-arm degradation. Höchste Priorität auf der Qualitätsseite.
- Aufwand: 2h, Kosten: ~€2/Monat (CCX23 vs. aktuellem Server)

### Phase 4: Query Expansion (Hypothese: +5-10% H@5 — UNGETESTET)

- LLM-basierte Query-Reformulierung (User-Sprache → Legal-Terminologie)
- `expandLegalQuery` bereits in `hybrid.ts` implementiert, muss aktiviert werden
- Aufwand: 30 min, Kosten: ~$0.10
- ⚠️ **Prognose, nicht gemessen**

### Roadmap (Hypothesen — zu messen, nicht als Fakten zu lesen)

| Phase                              | H@5 (gemessen) | H@5 (Hypothese) | Kosten | Aufwand | Status  |
| ---------------------------------- | -------------- | --------------- | ------ | ------- | ------- |
| Baseline (IVFFlat probes=120)      | **43.8%**      | —               | $0     | ✅      | ✅ done |
| + DeepSeek-Reranker (topNIn=30)    | **71.3%**      | —               | ~$0.50 | 15 min  | ✅ done |
| + BM25 (pg_textsearch)             | ?              | ~78%            | $0.50  | 30 min  | pending |
| + Query Expansion                  | ?              | ~82%            | $0.60  | 1h      | pending |
| + Embedding-Upgrade (voyage-law-2) | ?              | ~88%            | $60.60 | 3h      | pending |
| + Domain-Finetuning                | ?              | ~95%            | $200+  | 8h+     | pending |

⚠️ **Alle Werte nach "71.3%" sind ungetestete Hypothesen.** Jede Phase muss mit einem Eval gemessen werden bevor die nächste startet.

---

## Determinismus & Messmethodik (2026-08-25)

### Rauschband-Messung (3× gleicher Lauf, Cache AUS)

| Metrik | Mean ± SD     | Runs                |
| ------ | ------------- | ------------------- |
| H@1    | 45.0% ± 1.0pp | 45.0%, 46.2%, 43.8% |
| H@5    | 74.2% ± 2.1pp | 71.2%, 75.0%, 76.2% |
| H@8    | 78.8% ± 1.0pp | 77.5%, 78.8%, 80.0% |
| MRR    | 0.572 ± 0.008 | 0.566, 0.583, 0.568 |

**Schwellen für Signifikanz:** Ein Effekt auf H@5 muss > 4.2pp (2σ) sein um signifikant zu sein. Die SD der **Differenz** zweier Arme ist √2 × grösser ≈ 3.0pp.

### Rausch-Quellen identifiziert

1. **Embedding-API (text-embedding-3-small via OpenRouter):** NICHT deterministisch. 2/10 Runs produzieren leicht andere Vektoren (~1e-5 diff). **Fix:** Persistenter Embedding-Cache in `embedding.ts` (`enableQueryEmbedCache`).
2. **IVFFlat/SQL:** DETERMINISTISCH bei festem Vektor (10/10 identisch).
3. **Fusionsschicht (RRF/Dedup/Boost):** War nicht deterministisch — 7/80 Rangwechsel bei `--reranker none`. **Fix:** `byScoreDescSlugAsc` Tie-Breaker in `hybrid.ts` + `dedup.ts` (Score DESC, (source_id, slug) ASC, chunk_id ASC).
4. **SQL-Keyword-Arme (ts_rank):** `ts_rank` erzeugt massenhaft bit-identische Scores — viel mehr Ties als Cosine. Ohne Tie-Breaker liefert Postgres Zeilen in Planner-Reihenfolge, die mit Parallelität, `work_mem` und Buffer-Zustand variiert. **Fix:** `ORDER BY score DESC, page_id ASC, chunk_id ASC` in allen Keyword-SQL in `postgres-engine.ts` (3 Stellen) + `pglite-engine.ts` (4 Stellen). Engine-Parity gewahrt.
5. **PostgreSQL Statement Timeout:** `at-059` fällt deterministisch auf keyword-only zurück (20.6s kalt > 15s Timeout). **Root Cause:** `idx_chunks_embedding` 28 GB, `shared_buffers` 2 GB → **7.0% Cache-Hit** (214.8M disk reads). Permanent disk-bound, nicht gelegentlich. **Fix:** HNSW + halfvec + RAM (Phase 3).

### Verbleibende Non-Determinismus nach Fixes

- **0/80 Rangwechsel** nach SQL-Tie-Breaker (vorher 2/80, davor 7/80)
- **1/80 NO-VEC** (`at-059`, deterministisch — PG Statement Timeout bei 7% Cache-Hit)
- **Kalt-Messung-Korrektur:** `DISCARD ALL` resettet nur Session-State, nicht Shared Buffers. Die 1/80 Rate ist eine **warme** Rate (OS-Page-Cache-Glück durch 80 aufeinanderfolgende Queries). Die echte Produktionsrate bei verteiltem Traffic ist höher. Aussagekräftiger als jede Einzelmessung ist die 7.0% Cache-Hit-Rate von `pg_statio_user_indexes`.
- **Reranker-Non-Determinismus** (±2.1pp H@5) — nur mit `--reranker deepseek`, gelöst durch Reranker-Cache

### Instrumentierung

- `onMeta` Callback im Eval-Harness: zeigt `vector_enabled` + `expansion_applied` pro Query
- `⚠️NO-VEC` Flag in Console-Output bei Vektor-Arm-Ausfall
- `--repeat N` Flag für Rauschband-Messung
- `--no-cache` Flag für Cache-freie Läufe
- `--cache-file` für persistenten Reranker-Cache (JSONL, cross-process)
- Embedding-Cache: `enableQueryEmbedCache(cacheFile?)` in `embedding.ts` (default off, eval-only)

---

## Technische Details

### IVFFlat probes-Einstellung

```typescript
// postgres-engine.ts:2337-2340
const ivfflatProbes = hasSourceFilter ? 120 : 60;
await sql.unsafe(`SET LOCAL ivfflat.probes = ${ivfflatProbes}`, []);
```

- Default war `probes=1` (nur 1 Cluster von 3600 = 0.03% der Daten)
- `probes=120` für gefilterte Queries (source_id-Filter braucht mehr Cluster)
- `probes=60` für ungefilterte Queries (≈ sqrt(3600))

### Reranker-Integration

#### bge-reranker-v2-m3 (Cross-Encoder, lokal)

- Python/transformers HTTP-Server auf :8787
- Cross-Encoder: query+document jointly scored
- Fail-open: fällt auf RRF-only zurück wenn Server nicht verfügbar
- Ergebnis: H@1 +2.5%, aber H@5/8 verschlechtert — nicht legal-domänen-spezifisch

#### DeepSeek LLM-Reranker (Listwise, via OpenRouter)

```typescript
// run-retrieval-eval.ts — deepseek rerankerFn
const systemPrompt = `You are a legal document relevance ranker. Given a user
query and a list of document passages, output a JSON array of document indices
sorted from MOST relevant to LEAST relevant to the query.`;
// Truncates each doc to 500 chars, sends top-30 to DeepSeek, parses JSON array
```

- DeepSeek-Chat via OpenRouter API
- Listwise Ranking: alle 30 Kandidaten in einem Prompt, LLM sortiert nach Relevanz
- Temperature=0 für deterministische Ergebnisse
- Kosten: ~$0.002 pro Query (30 docs × 500 chars ≈ 15k input tokens)
- **Ergebnis: H@1 17.5% → 45.0% (+27.5pp), H@5 43.8% → 71.3% (+27.5pp)**

### Benchmark-Quellen

- [Legal RAG Bench (2026)](https://arxiv.org/abs/2603.01710) — Retrieval ist Primary Driver
- [CUAD Embedding Benchmark](https://aimultiple.com/embedding-models) — voyage-law-2 schlägt OpenAI
- [Hybrid Search RAG Production](https://topreviewed.ai/blog/hybrid-search-rag-in-production-bm25-dense-vectors-rrf-with-measured-results) — 72% → 91% mit Hybrid+Reranker
- [pgvector HNSW vs IVFFlat](https://postgresgui.com/blog/pgvector-hnsw-vs-ivfflat) — probes-Tuning schließt Recall-Gap
- [Eldridge Morgan — Hybrid Retrieval in the Wild](https://www.eldridgemorgan.com/insights/hybrid-retrieval-bm25/) — BM25 recovered 96% der Dense-Misses
