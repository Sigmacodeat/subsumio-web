---
description: Optimiere GBrain Engine / Server Core nach Agency-Level Standards
---

# Engine / Server Core Optimization

## Scope

- `server/src/core/` — 596 Module (Engine, Search, AI, Embedding, etc.)
- `server/src/cli.ts` (2271 Zeilen) — CLI Entry Point
- `server/src/mcp/` — MCP Server (Model Context Protocol)
- `server/src/commands/` — CLI Commands (143 Module)
- `server/src/core/ai/` — AI Gateway (Anthropic, OpenAI, ZeroEntropy)
- `server/src/core/search/` — Hybrid Search Engine (32 Module)
- `server/src/core/minions/` — Background Job Worker (50 Module)
- `server/src/core/legal/` — Legal-spezifische Engine-Logik (13 Module)
- `server/src/core/ingestion/` — Content Ingestion Pipeline (27 Module)
- `server/src/core/facts/` — Facts Extraction (13 Module)
- `server/src/core/cycle/` — Brain Cycle / Dream Cycle (25 Module)
- `server/src/core/skillpack/` — Skill Pack System (27 Module)
- `server/src/core/remediation/` — Auto-Remediation (5 Module)
- `server/src/core/think/` — Think Pipeline (7 Module)
- `server/src/core/extract/` — Extraction Pipeline (2 Module)
- `server/src/core/calibration/` — Search Calibration (11 Module)
- `server/src/schema.sql` — Database Schema (72KB)

## Kern-Komponenten

- `server/src/core/engine.ts` (97.6KB) — BrainEngine Interface & Base Implementation
- `server/src/core/postgres-engine.ts` (266.9KB) — Postgres + pgvector Engine
- `server/src/core/pglite-engine.ts` (245.5KB) — PGLite (WASM Postgres) Engine
- `server/src/core/operations.ts` (228KB) — 47+ Shared Operations (Contract-First)
- `server/src/core/migrate.ts` (264.7KB) — Schema Migrations
- `server/src/core/config.ts` (40.7KB) — Configuration System
- `server/src/core/ai/gateway.ts` (136KB) — AI Gateway (Chat, Embedding, Rerank)
- `server/src/core/search/hybrid.ts` (87.5KB) — Hybrid Search (Vector + Keyword + Graph)
- `server/src/core/search/mode.ts` (50.5KB) — Search Mode Configuration
- `server/src/core/brain-writer.ts` (29KB) — Brain Page Writer
- `server/src/core/context-engine.ts` (22.8KB) — Context Engine
- `server/src/core/sync.ts` (19.7KB) — Multi-Source Sync
- `server/src/core/cycle.ts` (102KB) — Brain Cycle (Synthesize, Patterns, Consolidate)

## Kontext laden

1. Lese `CLAUDE.md` für Architecture Invariants & Cross-Cutting Rules
2. Lese `server/docs/architecture/KEY_FILES.md` für Per-File Details
3. Lese `server/docs/architecture/RETRIEVAL.md` für Search/Retrieval
4. Lese `server/docs/ENGINES.md` für Engine Configuration
5. Lese `server/docs/TESTING.md` für Test-Strategie
6. Lese `server/src/core/types.ts` für Type Definitions
7. Lese `server/src/core/operations.ts` für Operation Contracts

## Architektur-Invariants (MUSS eingehalten werden)

- **Trust Boundary**: `OperationContext.remote` — `false` = trusted CLI, `true` = untrusted MCP
- **Source Isolation**: Jede Read-Op via `sourceScopeOpts(ctx)` — keine Cross-Source Leaks
- **JSONB**: Nie `JSON.stringify` in `::jsonb` cast — raw objects an `engine.executeRaw`
- **Engine Parity**: postgres-engine.ts & pglite-engine.ts in Lockstep — beide updaten
- **Contract-First**: `operations.ts` ist Single Source — CLI + MCP generiert daraus
- **Migrations**: DDL in `MIGRATIONS` Array in `migrate.ts` — nie direktes ALTER TABLE
- **Multi-Source**: Slug uniqueness = `(source_id, slug)` — nicht slug allein
- **Pricing**: Eine kanonische Tabelle in `model-pricing.ts` — keine Duplikate

## Optimierungs-Checkliste

- [ ] **Contract-First**: Neue Operation in `operations.ts` → CLI + MCP automatisch
- [ ] **Engine Parity**: Neue Methode in BOTH postgres-engine.ts AND pglite-engine.ts
- [ ] **Migration**: Schema-Änderung als Eintrag in `MIGRATIONS` Array
- [ ] **Trust Boundary**: `ctx.remote` Check für alle sicherheitsrelevanten Ops
- [ ] **Source Isolation**: `sourceScopeOpts(ctx)` für alle Read-Ops
- [ ] **Error Handling**: `EngineError` Hierarchy, nie bare `Error`
- [ ] **Connection Management**: Pool-Reuse, Cleanup bei Disconnect
- [ ] **Performance**: Query-Pläne analysiert, Index-Strategie, Batch-Operations
- [ ] **Testing**: E2E Tests für Engine Parity (`test/e2e/engine-parity.test.ts`)
- [ ] **Schema Bootstrap**: Neue Columns/Indexe in Bootstrap Probe Set

## Test-Befehle

```bash
# Unit Tests (DATABASE_URL unset)
cd server && bun test

# E2E Tests (benötigt Postgres Container)
cd server && bun run test:e2e

# Full CI Gate (Docker)
cd server && bun run ci:local

# Diff-aware CI (schneller)
cd server && bun run ci:local:diff

# Schema Verification
cd server && bun test test/schema-bootstrap-coverage.test.ts

# Engine Parity
cd server && bun test test/e2e/engine-parity.test.ts

# Model Pricing Drift
cd server && bun test test/model-pricing.test.ts
```

## Agency-Level Standards

- **Operation Contract**: `{ name, description, params, returns, scope, localOnly? }`
- **Handler Pattern**: `async function handle(ctx: OperationContext, params: P): Promise<R>`
- **Error Hierarchy**: `EngineError → { QueryError, SchemaError, ConfigError, ... }`
- **Connection Pool**: `ConnectionManager` mit Health-Checks und Auto-Reconnect
- **Query Builder**: `sqlQuery` Helper für parametrisierte Queries (kein String-Concat)
- **Index Strategy**: GIN für JSONB, IVFFlat/HNSW für Vector, B-Tree für Lookups
- **Batch Operations**: `batchRows` Helper für Bulk-Insert/Update
- **Retry Logic**: `retryWithBackoff` für transiente Fehler
- **Telemetry**: `telemetry.record()` für Query-Metriken, Cache-Hit-Rate, Latency
- **Feature Flags**: `featureFlags.isEnabled('relational_retrieval')` für schrittweise Rollouts
