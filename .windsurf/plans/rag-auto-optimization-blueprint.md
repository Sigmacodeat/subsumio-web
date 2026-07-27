# Blueprint — RAG Auto-Optimization Dashboard & Auto-Ingestion neuer Gesetze

## 1) Ziel des Systems (User-Sicht)

Im Admin-Dashboard einen einzigen Knopf "RAG Optimieren", der:

1. Die aktuelle Retrieval-Qualität misst (Baseline).
2. Automatisch die wirkungsvollsten Hebel ausprobiert (HNSW, Hybrid-Gewichte, Reranker, Synonyme).
3. Nur Verbesserungen über einem menschlich genehmigten Gate in Produktion übernimmt.
4. Täglich prüft, ob offizielle Quellen neue Novellen/Gesetze veröffentlicht haben, diese einpflegt und neu bewertet.

Ziel: Subsumio muss mit minimalem manuellem Aufwand bei maximalem Recall bleiben — auch wenn jeden Tag neue Gesetze dazukommen.

## 2) Bestehende Bausteine

- `src/app/dashboard/rag-eval/page.tsx` + `/api/rag-eval` — UI für einfache RAG-Evals (24 Fixtures, P/R@10, MRR, History, Baseline).
- `src/lib/rag-eval.ts` — Eval-Engine mit Fixtures.
- `server/src/core/legal/corpus-quality-report.ts` — Daily Corpus Quality Report (Pages, Chunks, Embedding-Coverage, Stale, Orphans, Search-Telemetrie, Snapshots, Amendments, Hallucination).
- `server/scripts/daily-ops.ts` — Cron-tauglicher Orchestrator für Quality-Report, Trend-Vergleich, Novella-Check (dry-run), DACH-Eval, Slack.
- `server/src/core/legal/novella-detection.ts` — DetectNovella + runNovellaCheck: vergleicht Hash der offiziellen Quelle mit gespeichertem Snapshot.
- `server/scripts/incremental-update.ts` — Holt Gesetze aus offiziellen Quellen, erkennt Novellen, markiert affected outputs.
- `server/scripts/ingest-law-corpus.ts` — Fetcht DE (gesetze-im-internet), AT (RIS), CH (Fedlex), EU (EUR-Lex) und schreibt markdown + Frontmatter.
- `server/src/eval/at-legal-retrieval/run.ts` — 60-Fragen AT Legal Retrieval Benchmark, Hit@1/3/5/8 + MRR, optional LLM-Rerank.
- `/.windsurf/workflows/optimize-hnsw-recall.md` — Manuelle CLI-Schleife für HNSW/Hybrid/Rerank.

## 3) Kern-Userflows

### Flow A — Admin: "RAG jetzt optimieren"

1. Öffnet `/dashboard/admin/rag-optimizer`.
2. Sieht aktuelle Baseline (Hit@5, MRR, Latenz, Kosten).
3. Klickt "Run Auto-Optimization".
4. System:
   - Speichert aktuelle Config als `baseline_run`.
   - Führt 1–3 schnelle Sweeps durch (z. B. `hnsw.ef_search`, `llmRerank.topNIn`, Hybrid-Gewicht).
   - Vergleicht jeden Sweep mit Baseline.
   - Zeigt Recommendation-Liste („Wende ef_search=256, topNIn=40 an → erwartet +4.2% Hit@5, +0.3s Latenz, +$0.02/Query“).
5. Admin klickt "Apply & Re-Index".
6. System:
   - Wendet gewählte Config an.
   - Löst `ANALYZE` + `pg_prewarm` aus.
   - Startet abschließenden Benchmark.
   - Speichert neuen `baseline_run`.
7. Bei Recall-Regression: automatischer Rollback zur letzten Baseline.

### Flow B — Nightly Auto-Ingestion

1. Cron `0 3 * * *` ruft `/api/admin/rag-optimizer/auto-ingest`.
2. Für jede aktuelle Quelle (AT/DE/CH/EU):
   - `detectNovellaFromSource(pool, jurisdiction, code)`.
   - Wenn `changed`:
     - Lädt neuen Text (`ingest-law-corpus` pro Statute).
     - Chunked + embedded + indexed im Hintergrund-Job.
     - Markiert `stale_outputs` und `output_dependencies` für Re-Verifikation.
3. Nach Abschluss aller Ingestions:
   - `corpus-quality-report`.
   - Falls sich Chunks/Embeddings signifikant geändert haben: automatisch `Baseline Benchmark` + `Auto-Optimization` im Dry-Run-Modus.
   - Slack/E-Mail Alert mit Summary (Änderungen, neuer Hit@5, Aktion nötig?).

### Flow C — Review & Rollback

1. `/dashboard/admin/rag-optimizer/history` zeigt alle Runs.
2. Admin kann jede Config wiederherstellen („Rollback auf ef_search=200“).
3. Rollback setzt `ALTER DATABASE` / `UPDATE gbrain_config` + Optionen zurück, führt `pg_prewarm` neu aus.

## 4) UI-Elemente & Interaktionen

### Dashboard `/dashboard/admin/rag-optimizer`

- **Header**: Titel "RAG Auto-Optimizer", aktueller Health-Score.
- **Baseline Card**: Hit@1/3/5/8, MRR, Ø Latenz, Kosten/Query, Timestamp.
- **Aktionen**:
  - Button "Run Auto-Optimization" (primary).
  - Button "Run Custom Sweep" (öffnet Parameter-Panel).
  - Button "Auto-Ingest Now" (nur Admin).
- **Parameter-Panel** (nur bei Custom Sweep):
  - `hnsw.ef_search`: [64, 128, 200, 256, 512]
  - `llmRerank.topNIn`: [10, 25, 40, 60]
  - `llmRerank.model`: dropdown
  - `hybrid.keywordWeight`: 0.0–1.0
  - `queryExpansion.enabled`: toggle
  - `sourceIds`: multi-select
- **Ergebnis-Tabelle**: Pro Sweep Config → Δ Hit@5, Δ MRR, Δ Latenz, Δ Kosten, Best-Flag.
- **Recommendation Card**: „Empfohlene Config“ mit Diff und Apply-Button.
- **Job-Status**: Live-Progress für laufende Sweeps (SSE oder Polling).
- **Alert-Banner**: Regression, laufender HNSW-Build, Kostenbudget erschöpft.

### History `/dashboard/admin/rag-optimizer/history`

- Tabelle aller `rag_optimization_runs`.
- Filter: applied/pending/failed.
- Aktionen: View Details, Set as Baseline, Rollback.

### Auto-Ingest Status `/dashboard/admin/rag-optimizer/ingest`

- Queue-Tabelle `law_ingestion_queue`: slug, jurisdiction, status, scheduled, completed, error.
- Zuletzt erkannte Novellen pro Jurisdiction.
- Button "Queue Manual Refresh".

## 5) Datenmodell & State

### Neue Tabellen

```sql
CREATE TABLE rag_optimization_runs (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  run_type TEXT NOT NULL CHECK (run_type IN ('baseline','sweep','auto','ingest','final')),
  status TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed','rolled_back')),
  params JSONB NOT NULL,
  baseline_id INTEGER REFERENCES rag_optimization_runs(id),
  results JSONB,
  cost_estimate_usd NUMERIC,
  latency_p95_ms INTEGER,
  applied_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE rag_sweep_configs (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  param_grid JSONB NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE law_ingestion_queue (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  source_url TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('statute','judgement','regulation')),
  status TEXT NOT NULL CHECK (status IN ('queued','fetching','chunking','embedding','indexing','done','error','skipped')),
  priority INTEGER DEFAULT 0,
  error TEXT,
  retries INTEGER DEFAULT 0,
  scheduled_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### State-Management

- Lange Jobs (Sweeps, Re-Index) laufen als async Hintergrundprozesse (z. B. `child_process` oder Worker-Queue), nicht im Request-Thread.
- Frontend pollt `/api/admin/rag-optimizer/status` oder empfängt SSE `job-progress`.
- Config-Änderungen werden in `gbrain_config` Tabelle persistiert, damit Rollback einfach ist.

## 6) Architektur-Entscheidungen

1. **Backend-Orchestrator `RagOptimizer`**: Eine Klasse in `server/src/core/legal/rag-optimizer.ts`, die Sweeps, Ingestion und Reporting koordiniert — keine Logik im Frontend.
2. **Reusable `at-legal-retrieval/run.ts`**: Der Benchmark wird als Modul-Funktion aufgerufen, nicht nur CLI. Ergebnis-JSON in `rag_optimization_runs.results`.
3. **Immutable Config Runs**: Jede Config ist ein eigener `rag_optimization_run`. Apply erzeugt einen `final` Run, der als aktive Baseline markiert wird.
4. **Safe Defaults**: Auto-Optimization startet mit schnellen, reversiblen Hebeln (`ef_search`, `topNIn`); teure Re-Embeddings/Index-Rebuilds erfordern extra Bestätigung.
5. **Background Jobs**: Lange Operationen (HNSW rebuild, Re-embedding) werden in `law_ingestion_queue` bzw. `rag_optimization_runs` mit Status gepflegt.
6. **Cron + API**: Die Auto-Ingestion läuft per Cron, kann aber über API sofort getriggert werden.

## 7) Edge-Cases & Fehlerszenarien

- **HNSW-Build läuft noch**: Auto-Optimization wird abgelehnt oder in Warteschlange gestellt.
- **Keine Änderung der Novellen**: Ingestion beendet sich nach `detectNovellaFromSource` mit `changed=false`.
- **Download fehlgeschlagen**: Retry-Logik, danach `status=error` + Admin-Alert.
- **Neues Gesetz ohne Embedding-Modell**: Ingestion pausiert, bis Modell verfügbar; kein broken State.
- **Kostenbudget erschöpft**: `llmRerank` Sweeps werden abgebrocht oder auf günstiges Modell umgeleitet.
- **Recall sinkt nach Apply**: Automatischer Rollback innerhalb von 60 Sekunden via vorheriger Baseline.
- **Gleichzeitige Admin-Änderungen**: Optimistic locking auf `rag_optimization_runs` — zweiter Apply wird abgelehnt, solange ein Job läuft.
- **LLM-Rerank Timeout**: Sweep markiert diesen Punkt als `timeout`, nicht als Fehler; Empfehlung berücksichtigt Latenz.

## 8) Implementierungs-Arbeitspakete

### AP1: Backend `RagOptimizer` + Benchmark-API

- `server/src/core/legal/rag-optimizer.ts` (Orchestrator: baseline, sweep, apply, rollback)
- `server/src/app/api/admin/rag-optimizer/route.ts` (POST trigger, GET status, PUT apply)
- `server/src/app/api/admin/rag-optimizer/history/route.ts`
- `server/src/app/api/admin/rag-optimizer/ingest/route.ts`
- Refactor `at-legal-retrieval/run.ts` in exportierbare `runBenchmark(opts)`.

### AP2: Datenbank-Schema

- Migration für `rag_optimization_runs`, `rag_sweep_configs`, `law_ingestion_queue`.
- Indizes: `rag_optimization_runs(status, created_at)`, `law_ingestion_queue(status, scheduled_at)`.

### AP3: Auto-Ingestion-Scheduler

- Erweitere `daily-ops.ts` oder neuer `server/scripts/auto-rag-ops.ts`:
  - `detectNovellaFromSource` für alle aktiven Quellen.
  - Bei Änderung: `law_ingestion_queue` befüllen.
  - Worker: `ingest-law-corpus` pro Statute, chunk, embed, index.
  - Nach Ingestion: `corpus-quality-report` + optional Benchmark-Dry-Run.

### AP4: Frontend Erweiterung

- Neuer Menüpunkt `/dashboard/admin/rag-optimizer`.
- Komponenten: `RunCard`, `SweepTable`, `RecommendationCard`, `JobProgress`, `IngestQueueTable`.
- Wiederverwendung von `PageHeader`, `Button`, `Badge`, Charts aus bestehendem `rag-eval`.

### AP5: Tests

- Unit-Tests für `RagOptimizer` (Mock-Engine).
- Integrationstest: Trigger Sweep → Apply → Rollback.
- Auto-Ingest Dry-Run mit lokalem Test-Snapshot.

## 9) Definition of Done

- [ ] Admin kann per Mausklick eine Auto-Optimization triggern und sieht Ergebnisse im Dashboard.
- [ ] Jede empfohlene Config zeigt erwarteten Recall-Gain, Latenz- und Kosten-Impact.
- [ ] Apply erzeugt einen neuen `rag_optimization_run` und persistiert Config in `gbrain_config`.
- [ ] Rollback zur letzten Baseline ist per Klick möglich.
- [ ] Täglicher Cron erkennt Novellen, queued Ingestion und benachrichtigt bei Änderungen.
- [ ] Nach Auto-Ingestion wird Corpus-Report + Benchmark-Dry-Run ausgeführt.
- [ ] Alle neuen Komponenten haben Tests; TypeScript 0 Fehler.
- [ ] Dokumentation in `CLAUDE.md` oder `docs/` aktualisiert (neuer `/rag-optimizer` Endpoint, Cron-Setup).

## 10) Benchmark-Wettbewerber-Vergleich

- **Harvey**: Internes Eval-Team, A/B-Tests auf echten Kanzlei-Queries, kontinuierliches Feedback. Kein öffentlich bekanntes „One-Click-Auto-Optimize“.
- **CoCounsel / vLex Vincent**: Dashboards für Modellverwaltung, Eval-Reports, Re-Ranker-Tuning — meist manuell gesteuert.
- **Thomson Reuters CoCounsel + Westlaw**: Automatische Updates aus Westlaw, aber menschliche Redaktion prüft neue Gesetze.
- **Fazit**: Vollautomatische Gesetzes-Neuverarbeitung + Auto-Optimierung ist nicht Standard; Subsumio kann hier differenzieren, muss aber menschliche Approval-Gates für teure/kritische Änderungen (Re-Embedding, HNSW-Rebuilds) einbauen.
