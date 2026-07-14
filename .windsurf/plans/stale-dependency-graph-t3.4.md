# Stale Dependency Graph (T3.4) — Implementation Plan

## Status: IN PROGRESS

## Tasks

### 1. Migration v121 — Legal Data Factory Tables in MIGRATIONS array
- Add `corpus_snapshots`, `corpus_amendments`, `stale_outputs`, `corpus_snapshot_paragraphs`, `output_dependencies` tables
- Engine parity: PGLite + Postgres (idempotent SQL, no CONCURRENTLY needed)
- Source: combine DDL from `server/migrations/004_corpus_snapshots.sql` and `server/migrations/006_source_lifecycle.sql`
- Insert as version 121 after v120 in `server/src/core/migrate.ts` MIGRATIONS array

### 2. Novella Detection Module (`server/src/core/legal/novella-detection.ts`)
- `detectNovella(pool, slug, currentText, opts)` — compare content_hash with stored snapshot
- If changed: call `SnapshotStore.storeSnapshot()` with per-§ hashes → get amendments
- For each amendment: call `DependencyGraphStore.markForReVerification(slug, amendmentId, paragraph)`
- Also call `SnapshotStore.markStale()` for legacy stale_outputs table
- Return `NovellaReport` with changed §§ + affected dependency count

### 3. Re-Verification Queue Enhancement
- `DependencyGraphStore.reVerifyAgainstSnapshot(depId, reviewerId, groundCitations, newSnapshotText)` 
- Checks if cited paragraphs still exist in new snapshot text
- Status: `verified` (citations still grounded), `stale` (citations no longer grounded), `failed` (error)
- Records notes with specific § changes

### 4. Attorney Diff Completion
- `DependencyGraphStore.getDiff()` — fetch old/new text previews from `corpus_snapshot_paragraphs`
- Format: "betroffen seit <BGBl-Datum>" using amendment `announcement_date`
- Return structured `AttorneyDiff` with §, alt→neu, affected_since

### 5. Round-Trip Test (`server/test/stale-dependency-graph-roundtrip.test.ts`)
- Uses PostgreSQL test DB on port 5434 (docker-compose.test.yml)
- Flow: seed snapshot → record dependency → simulate § change → novella detection → dependency stale → re-verification → diff
- Gated by DATABASE_URL (skips gracefully without Postgres)
- Also runs on PGLite for parity

### 6. Verification
- `bun run typecheck` green
- Test run green (both PGLite + Postgres if available)
