---
description: Cross-Bereich Integrationstest nach mehreren /optimize-* + /verify-optimization Durchläufen
---

# Cross-Area Integration Audit

> **Wann ausführen**: NACHDEM mindestens 2 Bereiche mit `/optimize-*` + `/verify-optimization` optimiert wurden.
> Dieser Prompt prüft, dass die einzeln optimierten Bereiche auch ZUSAMMEN funktionieren.

## Abhängigkeits-Matrix

Die 9 Bereiche haben folgende Abhängigkeiten:

```
Frontend ──→ API Layer ──→ Business Logic ──→ Engine
Dashboard ──→ API Layer ──→ Business Logic ──→ Engine
Dashboard ──→ Auth/Security
API Layer ──→ Auth/Security
API Layer ──→ Integrations
Business Logic ──→ Legal Engine
Business Logic ──→ Integrations
Engine ──→ Legal Engine (server/src/core/legal/)
Alle Bereiche ──→ Testing
```

## Phase 1 — Interface-Verifikation

### 1.1 Frontend ↔ API Layer
- [ ] Alle API-Calls aus Frontend nutzen korrekte Endpoints
- [ ] Response-Format matcht Frontend-Typen (keine `any` Casts)
- [ ] Error-Handling: API-Error → Frontend-Toast/Error-State
- [ ] Loading-States: Frontend zeigt Spinner während API-Call

### 1.2 Dashboard ↔ API Layer
- [ ] Alle Dashboard-Seiten nutzen `src/lib/api.ts` (keine direkten fetch-Calls)
- [ ] Mutation Queue (`use-mutation.ts`) wird für alle POST/PUT/DELETE genutzt
- [ ] Brain-Selector State korrekt bei API-Calls (richtiger Brain)
- [ ] Offline-Store queuet API-Calls korrekt

### 1.3 API Layer ↔ Business Logic
- [ ] API Routes rufen Business Logic aus `src/lib/` auf (keine Logik in Routes)
- [ ] Zod-Validation in API Route → typed params an Business Logic
- [ ] Business Logic wirft strukturierte Errors → API Route mapt zu HTTP-Status
- [ ] Audit-Logging wird von API Layer getriggert (nicht von Business Logic)

### 1.4 Business Logic ↔ Engine
- [ ] `engine-proxy.ts` nutzt korrekte Engine-Endpoints
- [ ] Engine-Errors werden zu User-friendly Messages übersetzt
- [ ] Streaming (SSE) von Engine → API → Dashboard korrekt weitergeleitet
- [ ] Source-Isolation: Business Logic respektiert `sourceScopeOpts`

### 1.5 Auth/Security ↔ Alle Bereiche
- [ ] Middleware prüft Auth für JEDEN API-Route
- [ ] Permission-Check in API Layer vor Business Logic-Aufruf
- [ ] CSRF-Token bei allen POST/PUT/DELETE aus Dashboard
- [ ] Rate-Limiting aktiv für kritische Endpoints

## Phase 2 — Datenfluss-Tests

### 2.1 Happy Path (je Bereich-Paar)
Teste den vollständigen Flow:
```
Frontend/Dashboard → API Route → Business Logic → Engine → DB
                ← Response ←              ← Result ←
```

### 2.2 Error Propagation
- [ ] Engine-Error → Business Logic → API Route → Frontend Toast
- [ ] Validation-Error → API Route 400 → Frontend Inline-Error
- [ ] Auth-Error → API Route 401/403 → Frontend Login/Permission-Page
- [ ] Network-Error → Frontend Offline-Store → Auto-Retry bei Online

### 2.3 Realtime & Offline
- [ ] WebSocket-Update von Engine → Dashboard ohne Page-Reload
- [ ] Offline: Mutation wird gequeueed → Online: Mutation wird gesendet
- [ ] Conflict: Zwei Clients editieren gleiches Objekt → Conflict-Resolution

## Phase 3 — Performance-Integration

- [ ] **API Response Time**: P95 < 200ms für Non-AI Endpoints
- [ ] **AI Endpoints**: SSE-Streaming startet < 1s, Tokens fließen < 2s
- [ ] **Dashboard Load**: First Contentful Paint < 1.5s
- [ ] **Bundle Size**: Keine意外的 Bundle-Vergrößerung durch Optimierung
- [ ] **Database Queries**: N+1 Queries eliminiert, EXPLAIN ANALYZE für kritische Queries

## Phase 4 — Security-Integration

- [ ] **Penetration Test**: Manuelle Tests der kritischsten Endpoints
- [ ] **Auth Bypass**: Kann man API ohne Session erreichen?
- [ ] **IDOR**: Kann man fremde Akten/Dokumente über ID-Manipulation erreichen?
- [ ] **XSS**: Werden User-Inputs in allen Bereichen escaped?
- [ ] **CSRF**: Sind alle State-Changing Endpoints geschützt?

## Phase 5 — Final Go/No-Go

```
WENN alle Cross-Area Checks grün:
  → Status: SYSTEM INTEGRATION VERIFIED
  → Alle Bereiche können unabhängig getestet werden
  → Alle Bereiche funktionieren zusammen

WENN Checks rot:
  → Identifiziere welches Bereich-Paar das Problem verursacht
  → Führe spezifisches /optimize-* für den Problem-Bereich aus
  → Danach /verify-optimization
  → Danach erneut /cross-audit
```

## Test-Befehle
```bash
# Full System Build
npm run build

# All Unit Tests
npx vitest run

# All E2E Tests
npx playwright test

# Server E2E
cd server && bun run test:e2e

# Full CI Gate
cd server && bun run ci:local

# TypeScript Check (gesamte Codebase)
npx tsc --noEmit
```
