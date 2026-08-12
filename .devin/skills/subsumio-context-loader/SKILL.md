---
name: subsumio-context-loader
description: Subsumio Context-Loader — weiss pro Task-Typ welche Dateien ZUERST zu lesen sind, damit du nicht erst suchen musst wenn du stossest. Vor dem Blueprint aufrufen.
argument-hint: "[task-typ]"
allowed-tools:
  - read
  - grep
  - glob
triggers:
  - user
  - model
---

# Subsumio Context-Loader

Weiß pro Task-Typ, welche Dateien ZUERST zu lesen sind — BEVOR du planst
oder den Blueprint schreibst. Verhindert Kontext-Blindheit: du lädst
proaktiv den ganzen relevanten Bereich, statt erst zu suchen wenn du stossest.

## Ablauf

1. Bestimme den Task-Typ (vom User genannt oder aus der Aufgabenstellung
   inferiert).
2. Lade ALLE gelisteten Dateien des Task-Typs parallel (read-Aufrufe
   bündeln).
3. Falls ein Task-Typ nicht passt → "Other" und selbständig ähnliche
   Dateien identifizieren (grep nach Stichwort, Nachbar-Dateien).
4. Nach dem Laden: `/fullstack-blueprint` aufrufen.

## Task-Typ → Datei-Liste

### Corpus-Steward Feature
- `src/lib/corpus-steward.ts` — Kern-Logik (parseDoc, diffLines, etc.)
- `src/lib/corpus-index.ts` — Disk + Memory Index
- `src/lib/corpus-import-queue.ts` — Import-Queue (markiereZumImport)
- `src/lib/corpus-schema.ts` — Frontmatter-Validierung
- `src/lib/corpus-meta.ts` — Metadaten
- `src/app/api/admin/corpus-files/*/route.ts` — alle API-Routes
- `src/components/dashboard/corpus-steward/CorpusStewardTab.tsx` — Haupt-UI
- `src/components/dashboard/corpus-steward/PublishBanner.tsx` — Banner

### Chat / AI-Output Feature
- `src/lib/api.ts` — API-Client (think, query, etc.)
- `src/lib/use-grounded-answer.ts` — Grounding-Hook (Invariant!)
- `src/lib/citation-gate.ts` + `citation-gate-client.ts`
- `src/components/chat/*` — alle Chat-Komponenten
- `src/components/chat/chat-grounding.test.tsx` — Invariant-Test
- `src/lib/use-grounded-answer.test.ts` — Invariant-Test

### Auth / Session Feature
- `src/lib/auth/server.ts` — Session-Server
- `src/lib/auth/session.ts` + `session-core.ts`
- `src/lib/auth/store.ts` — Session-Store
- `src/lib/auth/tokens.ts` — Token-Logik
- `src/lib/auth/password.ts` + `lockout.ts` + `rate-limit.ts`
- `src/lib/auth/api-key-auth.ts`
- `src/app/api/auth/*/route.ts` — alle Auth-Routes
- `src/components/auth/*` — Auth-UI
- `src/lib/queries/auth.ts` — React Query Hooks

### Engine / Schema-Änderung
- `server/src/core/migrate.ts` — MIGRATIONS-Array
- `server/src/core/operations.ts` — Contract (Single Source)
- `server/src/core/engine-factory.ts` — Engine-Auswahl
- `server/src/core/pglite-engine.ts` — PGLite-Adapter
- `server/src/core/postgres-engine.ts` — Postgres-Adapter
- `test/e2e/engine-parity.test.ts` — Parity-Test
- `test/schema-bootstrap-coverage.test.ts` — Schema-Coverage
- `scripts/check-jsonb-pattern.sh` — JSONB-Guard

### Billing / Credits Feature
- `src/lib/billing/credits.ts` + `credit-constants.ts`
- `src/lib/billing/plans.ts` + `dunning.ts`
- `src/core/model-pricing.ts` (falls Engine-Seite) — kanonische Pricing
- `test/model-pricing.test.ts` — Drift-Guard
- `src/app/api/billing/*/route.ts` — alle Billing-Routes

### ACL / Permissions Feature
- `src/lib/permissions.ts` — RBAC
- `src/app/api/acls/*/route.ts` — alle ACL-Routes
- `src/components/dashboard/acl-settings.tsx` — ACL-UI

### BEA / Steuer Feature
- `src/lib/bea-import.ts` + `bea-send.ts`
- `src/app/api/bea/*/route.ts` — alle BEA-Routes
- `src/lib/bea-import.test.ts` + `bea-send.test.ts`

### Act-Import Feature
- `src/lib/act-import.ts` + `act-import-server.ts`
- `src/app/api/act-imports/*/route.ts`
- `src/lib/act-import.test.ts`

### Agent / Copilot Feature
- `src/lib/agent-conditionals.ts`
- `src/app/api/agents/*/route.ts`
- `src/app/api/agent-templates/*/route.ts`
- `src/components/copilot/*`

### Admin / Audit Feature
- `src/lib/audit.ts` + `audit-chain-verification.ts` + `audit-labels.ts`
- `src/app/api/admin/*/route.ts` (bereichsspezifisch)
- `src/components/admin/*`

## Output

Kein Output-Block — dieser Skill lädt nur Dateien. Nach dem Laden
automatisch `/fullstack-blueprint` aufrufen (oder vom User explizit).

Falls Task-Typ unklar: frage den User kurz welcher Bereich, sonst
identifiziere selbst via grep nach Stichworten in der Aufgabenstellung.
