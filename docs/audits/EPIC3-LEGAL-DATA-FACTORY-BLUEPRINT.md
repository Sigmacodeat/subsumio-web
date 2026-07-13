# EPIC 3 — Legal Data Factory und Quellenbreite

**Priorität:** P1 | **Parallel zu LAB-DACH** | **Keine neue Quelle ohne Eval**

## 1. Ziel des Systems

Eine produktionsreife Data Factory, die jede Rechtsquelle (Gesetze, Verordnungen, Judikatur, Materialien, Literatur) über einen definierten Lifecycle von Discovery bis Retirement verwaltet — mit persistenten Snapshots, Amendment-Tracking, License-Registry und Stale-Dependency-Graph.

**Kernprinzipien:**

- Kein In-Memory-Store in Produktion
- Silent failure verboten
- Jede Quelle hat Provenance (SHA-256, parser_version, official URL, fetched_at)
- Output → Claim → Source Snapshot Abhängigkeiten sind nachverfolgbar
- Rechtefragen brauchen menschliche Freigabe

## 2. Bestandsaufnahme (vorhanden)

| Komponente                                           | Status | Datei                                          |
| ---------------------------------------------------- | ------ | ---------------------------------------------- |
| CorpusReceipt Schema                                 | ✅     | `server/src/core/legal/corpus-receipt.ts`      |
| SnapshotStore (DB)                                   | ✅     | `server/src/core/legal/snapshot-store.ts`      |
| Migration 004 (snapshots, amendments, stale_outputs) | ✅     | `server/migrations/004_corpus_snapshots.sql`   |
| WorkProductReceipt                                   | ✅     | `src/lib/work-product-receipts.ts`             |
| Connector Base (retry, rate-limit, cursor)           | ✅     | `server/src/core/ingestion/connectors/base.ts` |
| Connector Health (in-memory)                         | ✅     | `src/lib/statute-freshness.ts`                 |
| Connector Coverage Matrix (DMS/MS365/Google)         | ✅     | `src/lib/connector-coverage.ts`                |
| Statute Freshness Pipeline                           | ✅     | `src/lib/statute-freshness.ts`                 |
| LegalIssue SourceSnapshot                            | ✅     | `server/src/core/legal/issues/types.ts`        |

## 3. Was fehlt (6 Work Packages)

### T3.1 Corpus Receipt und persistente Snapshots

- **Fehlt:** `sources` DB-Tabelle mit Lifecycle-State, `source_license_reviews` Tabelle
- **Fehlt:** `output_dependencies` Tabelle (Output → Claim → Snapshot Graph)
- **Fehlt:** Frontmatter → Receipt Migration Script
- **Bestand:** corpus-receipt.ts, snapshot-store.ts, migration 004

### T3.2 Source Lifecycle

- **Fehlt:** State Machine: discovered → rights_pending → parser_pending → eval_pending → early_access → general_availability → degraded → retired
- **Fehlt:** Transition validation, automated checks, human approval gates

### T3.3 Connector Reliability

- **Fehlt:** Parser Golden Files, Schema-Drift-Erkennung
- **Fehlt:** Quarantäne-Mechanismus
- **Fehlt:** Idempotency Keys
- **Fehlt:** Silent-failure prohibition (structured error logging)
- **Bestand:** BaseConnector mit retry, rate-limit, cursor, healthCheck

### T3.4 Stale-Dependency-Graph

- **Fehlt:** Output → Claim → Source Snapshot Abhängigkeiten in DB
- **Fehlt:** Re-Verification Queue (statt pauschaler Regeneration)
- **Fehlt:** Änderungsdiff für Anwalt ("betroffen seit")
- **Bestand:** stale_outputs table, markStale(), markStaleByCorpusSlug()

### T3.5 Quellen-Coverage-Matrix

- **Fehlt:** Legal source coverage matrix (Primärrecht, Verordnungen, OGH-Judikatur, Instanzrechtsprechung, Materialien, Behördenpraxis, Literatur)
- **Bestand:** connector-coverage.ts (DMS/MS365/Google — nicht Legal Sources)

### T3.6 Rechte- und Lizenzschicht

- **Fehlt:** License Registry DB-Tabelle
- **Fehlt:** Scraping-/API-Nutzungsbedingungen dokumentiert
- **Fehlt:** License Review Workflow
- **Bestand:** license_status field in CorpusReceipt, OFFICIAL_SOURCE_PATTERNS

## 4. Architektur

```
Discovery → Source Registration (sources table, lifecycle=discovered)
    ↓
Rights Check → License Registry (source_license_reviews)
    ↓ (human approval if non-public)
Parser → Golden File Validation → Schema-Drift Check
    ↓
Eval → Retrieval Benchmark (keine neue Quelle ohne Eval)
    ↓
Early Access → limited tenant access
    ↓
General Availability → all tenants
    ↓
Amendment Detection → Stale Dependency Graph → Re-Verification Queue
    ↓
Degraded / Retirement
```

## 5. DB Schema (Migration 006)

### `sources` — Lifecycle-Managed Source Registry

```sql
CREATE TABLE sources (
  id              TEXT PRIMARY KEY,        -- "law-de", "law-at-judikatur"
  name            TEXT NOT NULL,
  jurisdiction    TEXT NOT NULL,
  source_type     TEXT NOT NULL,           -- primary_legislation, regulation, case_law, materials, authority_practice, literature
  lifecycle_state TEXT NOT NULL DEFAULT 'discovered',
  config          JSONB NOT NULL DEFAULT '{}',
  discovered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by     TEXT,
  approved_at     TIMESTAMPTZ,
  retired_at      TIMESTAMPTZ,
  metadata        JSONB NOT NULL DEFAULT '{}'
);
```

### `source_license_reviews` — License Review Workflow

```sql
CREATE TABLE source_license_reviews (
  id          BIGSERIAL PRIMARY KEY,
  source_id   TEXT NOT NULL REFERENCES sources(id),
  reviewer_id TEXT NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  license_type TEXT NOT NULL,              -- public, open, commercial, restricted
  terms_url   TEXT,
  notes       TEXT,
  approved    BOOLEAN NOT NULL
);
```

### `output_dependencies` — Stale Dependency Graph

```sql
CREATE TABLE output_dependencies (
  id              BIGSERIAL PRIMARY KEY,
  output_id       TEXT NOT NULL,
  output_type     TEXT NOT NULL,
  claim_hash      TEXT,                    -- hash of the specific claim
  source_slug     TEXT NOT NULL,
  snapshot_hash   TEXT NOT NULL,           -- content_hash of the snapshot used
  paragraph_ref   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reverified_at   TIMESTAMPTZ,
  reverify_status TEXT                     -- pending, verified, stale, failed
);
```

### `parser_golden_files` — Schema-Drift Detection

```sql
CREATE TABLE parser_golden_files (
  id              BIGSERIAL PRIMARY KEY,
  source_id       TEXT NOT NULL REFERENCES sources(id),
  parser_version  TEXT NOT NULL,
  fixture_hash    TEXT NOT NULL,
  expected_output_hash TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `connector_quarantine` — Quarantined Items

```sql
CREATE TABLE connector_quarantine (
  id              BIGSERIAL PRIMARY KEY,
  source_id       TEXT NOT NULL,
  item_id         TEXT NOT NULL,
  reason          TEXT NOT NULL,
  quarantined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at     TIMESTAMPTZ,
  released_by     TEXT
);
```

## 6. Definition of Done

- [ ] Migration 006 erstellt und validiert
- [ ] Source Lifecycle Module mit 8 States + Transition Validation
- [ ] License Registry Module mit Review Workflow
- [ ] Parser Golden Files + Schema-Drift Detection
- [ ] Connector Quarantine + Idempotency
- [ ] Output Dependency Graph + Re-Verification Queue
- [ ] Legal Source Coverage Matrix (7 Quellentypen × 4 Jurisdiktionen)
- [ ] Frontmatter → Receipt Migration Script
- [ ] Tests: ≥80 assertions, alle pass
- [ ] TypeScript: 0 errors (frontend + server)
- [ ] Keine Regressionen in bestehenden Tests
