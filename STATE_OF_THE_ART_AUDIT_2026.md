# Subsumio — State-of-the-Art Gesamtaudit 2026

**Datum:** 20. Juni 2026  
**Auditor:** Cascade (Principal Engineer / Product Architect / UX Lead / QA Lead)  
**Scope:** Full-Stack — Frontend (`/src`), Engine (`/server`), Mobile (`/mobile`), Word-Add-In (`/word-add-in`), Legacy (`/legacy-admin`)  
**Methode:** Statische Code-Analyse, Competitor-Research, Redundanz-Scan, Architektur-Review

---

## Phase 0 — Executive Summary

| Bereich | Score | Status |
|---------|-------|--------|
| Frontend / Marketing | 8/10 | ✅ Stark |
| Dashboard / Kanzlei-OS | 8/10 | ✅ Feature-complete |
| API Layer | 8.5/10 | ✅ Sehr gut |
| Engine Core (GBrain) | 9/10 | ✅ Weltklasse |
| Auth & Security | 9/10 | ✅ Production-grade |
| Legal Domain Engine | 9/10 | ✅ DACH-USP |
| External Integrations | 7.5/10 | ⚠️ Breit, aber teils Stubs |
| Testing | 5.5/10 | 🔴 Mangelhaft |
| Redundanz / Code-Hygiene | 6/10 | ⚠️ Mittel |
| **Gesamt** | **7.9/10** | **Conditional Go** |

**Kernaussage:** Das System hat sich seit dem letzten Audit (`AUDIT_STATE_OF_THE_ART.md`, 18.06.) massiv weiterentwickelt. 103 API-Routes, 50 Dashboard-Pages, hardened Middleware, zentraler API-Handler mit RBAC/Rate-Limit/Quota — das ist kein Prototyp mehr. Das Backend (GBrain) ist auf Weltklasse-Niveau. **Aber:** Frontend-Testing ist unzureichend, es gibt messbare Redundanzen im API-Client-Layer, und im Competitor-Vergich fehlen uns key Features die Harvey und Legora bereits haben.

---

## Phase 1 — Architektur-Review

### Tech-Stack

| Schicht | Technologie | Bewertung |
|---------|-------------|-----------|
| Framework | Next.js 15.5 (App Router) | State-of-the-Art |
| UI | React 19, Tailwind 4, Radix UI, shadcn/ui | Modern |
| Animation | Framer Motion 12 | Gut |
| State | Zustand 5 + TanStack Query 5 | Gut (aber redundant, siehe Phase 4) |
| Forms | React Hook Form + Zod | Standard |
| Backend | GBrain Engine (PGLite/Postgres) | Exzellent |
| Auth | HMAC-Sessions, scrypt, 2FA TOTP, SSO WorkOS | Production-grade |
| Mobile | Capacitor (iOS + Android) | Vorhanden |
| Deployment | Vercel + Self-hosting | Differenzierung |

### Codebase-Metriken

| Metrik | Wert |
|--------|------|
| Frontend Pages (`src/app/`) | 89 |
| API Routes | 103 |
| Dashboard Pages | 50 |
| Marketing Components | 24 |
| UI Primitives | 24 |
| Lib files (`src/lib/`) | 116 |
| Engine Core files (`server/src/core/`) | 597 |
| Legal Domain files (`server/src/core/legal/`) | 13 |
| Test files (Frontend) | 21 |
| Law Corpus (DE/AT/CH) | 31 Gesetze |

---

## Phase 2 — Competitor Gap Analysis (Research)

### Wettbewerber-Status 2026

#### Harvey AI
- **Status:** Marktführer (US), 100.000+ Anwälte, 1.500 Organisationen
- **Neue Features (2026):**
  - **500+ Pre-built Agents** + Agent Builder (Custom Agents, 25.000+ erstellt)
  - **Vault** — Document Storage + Bulk Analysis
  - **Contract Intelligence** — Playbooks, Redlining, Position Suggestions
  - **Command Center** — Analytics, Benchmarking, Agentic Insights
  - **Shared Spaces** — Cross-Firm Collaboration
  - **Harvey Mobile** — iOS + Android
  - **Ecosystem** — Word-Add-In, DeepJudge Integration
  - **160+ Legal Research Sources**
  - **Multi-Model** — GPT-5.4, Opus 4.8, Model Selector
  - **Harvey Academy** — Training Platform

#### Legora (ehemals Leya)
- **Status:** Europäischer Marktführer, $5.6B Bewertung, $100M+ ARR
- **Neue Features (2026):**
  - **Legora aOS** — Agentic Operating System
  - **Agent** — Agentic Research (Multi-Step Workflows)
  - **Tabular Review** — Clause Extraction at Scale
  - **Monitors** — Regulatory/Caselaw Change Tracking
  - **Portal** — Client Collaboration (branded)
  - **Word + Outlook Add-In**
  - **SOC 2 Type II + ISO 27001 + ISO 42001** zertifiziert
  - **33+ Sprachen**, 800+ Law Firms
  - **Model-agnostic** (OpenAI + Anthropic Routing)
  - **Kunden:** Linklaters, White & Case, Baker McKenzie, Bird & Bird

### Gap-Matrix: Subsumio vs. Wettbewerber

| Feature | Subsumio | Harvey | Legora | Priorität |
|---------|----------|--------|--------|-----------|
| AI Legal Research + Citations | ✅ | ✅ | ✅ | — |
| Contract Drafting + Redlining | ✅ | ✅ | ✅ | — |
| Tabular Review | ✅ | ✅ | ✅ | — |
| Case Management | ✅ | ❌ | ⚠️ | **USP** |
| Deadline Management | ✅ | ❌ | ❌ | **USP** |
| RVG Fee Calculator | ✅ | ❌ | ❌ | **USP** |
| GoBD / Verfahrensdoku | ✅ | ❌ | ❌ | **USP** |
| Self-Hosting / On-Premise | ✅ | ❌ | ❌ | **USP** |
| WhatsApp Integration | ✅ | ❌ | ❌ | **USP** |
| BEA / eIDAS | ✅ | ❌ | ❌ | **USP** |
| DATEV-Export | ✅ | ❌ | ❌ | **USP** |
| Word Add-In | ✅ | ✅ | ✅ | — |
| **Agent Builder / Custom Agents** | ⚠️ Basic | ✅ 500+ | ✅ | **P1** |
| **Playbooks (Contract Rules)** | ❌ | ✅ | ✅ | **P1** |
| **Monitors (Regulatory Tracking)** | ⚠️ Basic | ❌ | ✅ | **P1** |
| **Shared Spaces (Cross-Firm)** | ❌ | ✅ | ⚠️ | **P2** |
| **Command Center / Analytics** | ⚠️ Stats | ✅ | ❌ | **P2** |
| **Outlook Add-In** | ❌ | ❌ | ✅ | **P2** |
| **Multi-Model Selector** | ⚠️ Engine | ✅ | ✅ | **P2** |
| **SOC 2 / ISO 27001** | ❌ | ✅ | ✅ | **P0** |
| **SCIM Directory Sync** | ⚠️ SSO only | ✅ | ✅ | **P1** |
| **Mobile App Parity** | ⚠️ Capacitor | ✅ iOS+Android | ⚠️ | **P2** |
| **Ecosystem / Integrations** | ⚠️ Connectors | ✅ | ✅ | **P2** |
| **Training / Academy** | ❌ | ✅ | ❌ | **P3** |
| **33+ Languages** | ⚠️ DE/EN | ✅ | ✅ | **P2** |

### Was uns fehlt — Priorisiert

#### 🔴 P0 — Blockers for Enterprise
1. **SOC 2 / ISO 27001 Zertifizierung** — Ohne das kein Enterprise-Sales. Harvey und Legora haben beide. (Nicht per Code lösbar — Compliance-Engagement starten.)
2. **E2E Test-Suite grün** — Playwright-Tests failen (a11y violations, login timeout). Vor Public Launch fixen.

#### 🟠 P1 — High Priority (Competitive Gap)
3. **Agent Builder UI** — Engine hat Agenten-System (`/api/agents`, Supervisor, Subagents), aber kein Builder-UI für Custom Agents wie Harvey's Agent Builder. Dashboard-Page `/dashboard/agents` existiert, ist aber basic.
4. **Contract Playbooks** — Harvey/Legora haben Rule-Based Playbook-Systeme für Contract Review (Position Suggestions, Deviation Flags). Subsumio hat `contract-draft` und `contract-redline` aber keine Playbook-Abstraktion.
5. **Regulatory Monitors** — Legora "Monitors" tracken automatisiert Gesetzesänderungen und neue Judikate. Subsumio hat `/dashboard/monitoring` (Watchlist) und `/api/cron/case-law`, aber nicht als Productized Feature.
6. **SCIM Directory Sync** — SSO via WorkOS vorhanden, aber SCIM (automatisierte User-Provisioning/Deprovisioning) fehlt. Enterprise-Kunden brauchen das.
7. **Audit Log UI** — `/api/audit` existiert mit Daten, aber keine polished Dashboard-UI für Compliance-Officer.

#### 🟡 P2 — Medium Priority
8. **Multi-Model Selector** — Engine unterstützt verschiedene AI-Provider, aber User kann nicht im UI wählen (wie Harvey's Model Selector).
9. **Outlook Add-In** — Legora hat einen; Subsumio nur Word. Für Kanzleien die Outlook nutzen wichtig.
10. **Shared Spaces** — Cross-Firm Collaboration (Harvey). Für Multi-Mandant-Fälle relevant.
11. **Command Center / Analytics** — Harvey hat Benchmarking + Usage Analytics. Subsumio hat Basic Stats.
12. **Dashboard i18n** — Dashboard ist 100% Deutsch. Legora unterstützt 33+ Sprachen. Für internationale Skalierung needed.
13. **Mobile App Parity** — Capacitor-App existiert, aber Feature-Parität mit Web nicht validiert.

#### 🟢 P3 — Nice to Have
14. **Academy / Training Platform** — Harvey Academy für Onboarding.
15. **DeepJudge-like DMS Integrations** — Tiefe DMS-Search-Integration.
16. **Bundle Analyzer** — `@next/bundle-analyzer` für Performance-Monitoring.

---

## Phase 3 — Redundanz-Analyse

### R1 — 🔴 Duplicate API Client Layer (`api.ts` vs `queries/brain.ts`)

**Problem:** Zwei parallele API-Client-Implementierungen für dieselben Endpoints:

| Funktion | `src/lib/api.ts` | `src/lib/queries/brain.ts` |
|----------|------------------|---------------------------|
| Stats | `api.brain.stats()` → `request("/api/stats")` | `API.stats` → `fetch("/api/stats").then(r => r.json())` |
| Search | `api.brain.search()` | `API.search` |
| GetPage | `api.brain.getPage()` | `API.getPage` |
| ListPages | `api.brain.listPages()` | `API.listPages` |
| CreatePage | `api.brain.createPage()` | `API.createPage` (mit csrfFetch) |
| UpdatePage | `api.brain.updatePage()` | `API.updatePage` (mit csrfFetch) |
| DeletePage | `api.brain.deletePage()` | `API.deletePage` (mit csrfFetch) |
| Graph | `api.brain.graph()` | `API.graph` |
| RecentQueries | `api.brain.recentQueries()` | `API.recentQueries` |

**Impact:** 48 Dashboard-Pages importieren `api` aus `@/lib/api`. React Query Hooks in `queries/brain.ts` duplizieren dieselben Calls. Wartungsaufwand verdoppelt, Bug-Fixes müssen an zwei Stellen gemacht werden.

**Außerdem:** `api.ts` hat eigene CSRF-Logik inline (Cookie-Extraction), während `queries/brain.ts` `csrfFetch` nutzt. Inkonsistent.

**Lösung:** `api.ts` als Single Source of Truth, `queries/brain.ts` nutzt `api` intern statt eigene `fetch()`-Calls.

### R2 — 🟠 `engine-proxy.ts` vs `engine.ts` — Parallel Engine-Client

**Problem:** Zwei Module für Engine-Kommunikation:

- `src/lib/engine.ts` — 44 API-Routes nutzen `engineContext()` / `engineHeaders()` / `requireEngineContext()`
- `src/lib/engine-proxy.ts` — Nur 2 Routes nutzen `proxyToEngine()` (Connectors sync/toggle)

Beide definieren `ENGINE_URL` und API-Key-Header unabhängig. `engine-proxy.ts` ist größtenteils tot.

**Lösung:** Connector-Routes auf `engine.ts` migrieren, `engine-proxy.ts` entfernen.

### R3 — 🟠 `legacy-admin/` — Vollständige verwaiste App

**Problem:** `/legacy-admin/` ist eine komplette separate Vite+React-App mit eigener `package.json`, `bun.lock`, 8 Pages und API-Client. Kein Import aus `src/` referenziert sie. Sie ist vollständig verwaist.

**Impact:** ~15 Dateien toter Code, verwirrt Entwickler, bläht Repo aus.

**Lösung:** `legacy-admin/` löschen oder in ein `archive/`-Branch verschieben.

### R4 — 🟡 CSRF-Logik dreifach dupliziert

**Problem:** CSRF-Cookie-Extraction ist an drei Stellen implementiert:

1. `src/lib/csrf.ts` → `csrfFetch()` — kanonisch
2. `src/lib/api.ts` → `request()` — eigene Inline-Implementation
3. `src/lib/api.ts` → `upload.file()` — eigene Inline-Implementation für XHR

**Lösung:** `api.ts` soll `csrfFetch` nutzen (wie es bereits für `think()` gemacht wird).

### R5 — 🟡 Auth-API-Funktionen dupliziert

**Problem:** `src/lib/queries/auth.ts` definiert eigenes `API`-Object mit `login`, `register`, `logout`, `me` — diese duplizieren `api.auth.logout()` und `api.user.me()` aus `src/lib/api.ts`.

**Lösung:** `queries/auth.ts` sollte `api` aus `@/lib/api` importieren.

### R6 — 🟡 `SIGMABRAIN_*` vs `GBRAIN_*` Env-Variablen

**Problem:** Mehrere Module prüfen beide `SIGMABRAIN_API_URL` und `GBRAIN_API_URL` (sowie `SIGMABRAIN_WEB_API_KEY` und `GBRAIN_WEB_API_KEY`). Das ist ein Fork-Relikt — Subsumio nutzt `SIGMABRAIN_*`, aber die `GBRAIN_*` Fallbacks blieben erhalten.

**Impact:** Verwirrend für Deployment-Setup, potenziell falsche Engine-URLs.

**Lösung:** Einheitlich auf `SUBSUMIO_*` oder zumindest `SIGMABRAIN_*` standardisieren, `GBRAIN_*` Fallbacks entfernen (oder in einer zentralen Config-Funktion bündeln).

### R7 — 🟢 Unbenutzte Types und Stubs

- `DMSFolder`, `DMSCredentials` Types deklariert aber nicht genutzt (DMS-Integration ist Stub)
- `ALLOW_FILE_AUTH_IN_PRODUCTION` in `store.ts` definiert aber nie gelesen
- `QueryResponse` Type in `types.ts` exportiert aber nur in `api.ts` genutzt (nicht in `queries/`)
- `export/` API-Ordner existiert aber ist leer (`src/app/api/export/`)

---

## Phase 4 — Layer-by-Layer Assessment

### 4.1 Frontend / Marketing Pages — 8/10

**Stärken:**
- 24 Marketing-Components mit Motion System, Scroll-Reveal, Parallax
- Bilingual (DE/EN) via `src/content/site.ts`
- SEO: sitemap, robots, manifest, JSON-LD, OpenGraph
- Ref-Consent-Banner (DSGVO-konform)
- Trust-Band, FAQ, Pricing-Grid, Compare-Page
- `prefers-reduced-motion` via `MotionConfig`

**Schwächen:**
- `isStandalone = true` in `chrome.tsx` versteckt Solutions/Pricing/Compare im Nav (Frontend Audit C2)
- `TypewriterText` ignoriert `prefers-reduced-motion` (Frontend Audit H4)
- Kein i18n-Framework (hardcoded Strings)

### 4.2 Dashboard / Kanzlei-OS — 8/10

**Stärken:**
- 50 Pages: Cases, Deadlines, RVG, Invoicing, Team, Settings, Compliance, Vault, Portal, Graph, Research, Agents, Approvals, Monitoring, etc.
- Reusable Components: Sidebar, Topbar, DataTable, CommandPalette, EmptyState, PageHeader, Skeleton, StatsCard
- Offline-First: IndexedDB + Mutation Queue
- Error/Loading Boundaries

**Schwächen:**
- 100% Deutsch, kein i18n (blockiert internationale Nutzer)
- Topbar-Dropdowns ohne Click-Outside-to-Close (Frontend Audit C3)
- 50+ Sidebar-Items ohne Suche/Filter (Frontend Audit H5)
- Breadcrumbs nicht verwendet trotz vorhandener Komponente (Frontend Audit H6)
- 7 leere Branchen-Ordner → 404 (Frontend Audit C1)
- Keine Per-Route Error/Loading Boundaries (nur 2 globale)

### 4.3 API Layer — 8.5/10

**Stärken:**
- 103 Routes, domain-gegliedert
- `createHandler` in `api-handler.ts` zentralisiert: Auth → RBAC → CSRF → Rate-Limit → Quota → Validation → Handler → Audit
- SSE-Streaming für `/api/think`
- Cron-Routes mit `CRON_SECRET` Auth
- Health-Endpoint

**Schwächen:**
- `action: "legal.judgements"` in `/api/legal/rvg/route.ts` statt `legal.rvg` (Copy-Paste-Fehler)
- 119 ESLint `no-unused-vars` Warnings
- `engine-proxy.ts` nur von 2 Routes genutzt (Redundanz R2)

### 4.4 Engine Core (GBrain) — 9/10

**Stärken:**
- Contract-first Operations (`operations.ts`, 274KB)
- Dual-Engine: PGLite (embedded) + Postgres (production)
- Hybrid Search: Vector + BM25 + Graph Signals + Rerank
- Dream Cycle: Synthesize, Patterns, Extract Atoms/Facts/Takes, Grade
- Legal Phases: Statute Currency, Deadline Monitor, Case Progression, Precedent Linkage
- Skill System mit Eval, Brain-First, Catalog
- 597 Core-Files, mature

**Schwächen:**
- 436 Unit-Test-Failures (meist key-dependent)
- 16 E2E-Test-File-Failures
- TypeScript-Errors in `scripts/`

### 4.5 Auth & Security — 9/10

**Stärken:**
- scrypt Password Hashing mit timingSafeEqual
- HMAC-SHA256 Sessions mit Revocation Store
- CSRF Double-Submit Cookie
- 2FA TOTP + Backup Codes
- SSO via WorkOS
- RBAC: admin, lawyer, assistant, client_viewer
- Rate Limiting (IP + Email + API-Tier)
- Audit Logging (per-tenant isolated)
- AES-256-GCM Encryption
- SSRF Validation, URL Safety, Content Sanitization

**Schwächen:**
- `ALLOW_FILE_AUTH_IN_PRODUCTION` ungenutzt
- SCIM fehlt (P1)
- Session Revocation ist In-Memory (Single-Node only)

### 4.6 Legal Domain Engine — 9/10

**Stärken:**
- RVG Fee Calculator mit Interpolation
- Legal Deadlines mit DE+AT Feiertagen
- AI Deadline Detection
- GoBD Verfahrensdokumentation
- Law Corpus: 31 Gesetze (DE/AT/CH)
- 16 Legal API-Routes: analyze, anonymize, conflict-check, contract-draft, contract-redline, document-review, due-diligence, judgements-search, judgements-sync, memo, risk-analysis, rvg, statute, summarize, tabular-review
- 4 Legal Dream-Cycle Phases (Statute Currency, Deadline Monitor, Case Progression, Precedent Linkage)
- Anonymizer mit NER

**Schwächen:**
- Kein Playbook-System (P1)
- Kein automatisches Regulatory Change Monitoring als Productized Feature (P1)
- Law Corpus ist manuell gepflegt (kein Auto-Update)

### 4.7 External Integrations — 7.5/10

**Stärken:**
- DocuSign: OAuth + Envelopes + Webhook
- WhatsApp: Cloud API (send/verify/media/types)
- Email: Import, Nodemailer, Resend Webhook
- DMS: iManage, NetDocuments (Stubs)
- Connectors: Sync/Toggle API
- Stripe: Billing + Webhooks
- BEA / eIDAS Integration

**Schwächen:**
- DMS-Integrationen sind Stubs (unbenutzte Types)
- Connector-Sync-Routes nutzen `engine-proxy.ts` statt `engine.ts`
- Kein Outlook-Add-In (nur Word)
- Integration-spezifische E2E-Tests fehlen (API-Keys vorausgesetzt)

### 4.8 Testing — 5.5/10

| Test-Typ | Status | Count |
|----------|--------|-------|
| Frontend Unit (Vitest) | ✅ Pass | 21 files, 213 tests |
| Frontend E2E (Playwright) | ❌ Fail | a11y + login timeout |
| Server Unit (Bun Test) | ⚠️ Mixed | 14.208 pass, 436 fail |
| Server E2E | ⚠️ Mixed | 131 pass, 16 fail |
| Accessibility (axe-core) | ❌ Fail | `landmark-one-main` |
| Visual Regression | ❌ None | — |
| Lighthouse CI | ❌ None | — |

---

## Phase 5 — Edge-Case & Stress-Test Simulation

| Szenario | Status | Risiko |
|----------|--------|--------|
| Leeres Brain (neuer User) | ✅ First-Time Welcome + Getting Started Guide | — |
| 50+ Sidebar-Items | ⚠️ Keine Suche/Filter | Cognitive Overload |
| Offline-Modus | ✅ IndexedDB + Mutation Queue | — |
| Extreme Datenmengen | ⚠️ `LIMIT 5000` in Legal Phases | Performance bei Wachstum |
| Schnelles Klicken | ⚠️ Topbar-Dropdowns bleiben offen | UX-Bug |
| Multi-Tenant Isolation | ✅ `x-subsumio-source` Header | — |
| Rate-Limit exceeded | ✅ 429 Response mit Retry-Info | — |
| Quota exceeded | ✅ Quota-Response | — |
| Session abgelaufen | ✅ Redirect to Login mit `next` Param | — |
| CSRF-Token fehlt | ✅ 403 `csrf_token_invalid` | — |

---

## Phase 6 — Final Scorecard & Recommendations

### Scorecard

| Layer | Score | Gewichtung | Weighted |
|-------|-------|------------|----------|
| Marketing / Public | 8/10 | 10% | 0.80 |
| Dashboard / Kanzlei-OS | 8/10 | 15% | 1.20 |
| API Layer | 8.5/10 | 15% | 1.275 |
| Engine Core | 9/10 | 15% | 1.35 |
| Auth & Security | 9/10 | 10% | 0.90 |
| Legal Domain | 9/10 | 10% | 0.90 |
| Integrations | 7.5/10 | 10% | 0.75 |
| Testing | 5.5/10 | 5% | 0.275 |
| Redundanz / Hygiene | 6/10 | 10% | 0.60 |
| **Gesamt** | | | **8.05/10** |

### P0 — Must Fix Before Launch

1. **E2E Playwright grün** — a11y `landmark-one-main`, Dashboard-Login-Timeout
2. **npm audit high vulnerability** — nodemailer Upgrade auf 9.0.1+
3. **SOC 2 Readiness** — Compliance-Engagement starten (nicht Code)

### P1 — High Priority

4. **Redundanz R1 auflösen** — `api.ts` als Single Source, `queries/brain.ts` refactoren
5. **Redundanz R3 auflösen** — `legacy-admin/` löschen
6. **Agent Builder UI** — Custom Agent Creation im Dashboard
7. **Contract Playbooks** — Rule-Based Contract Review System
8. **Regulatory Monitors** — Productized Feature aus bestehendem Monitoring
9. **SCIM Directory Sync** — WorkOS SCIM aktivieren
10. **Audit Log UI** — Dashboard für Compliance-Officer
11. **Topbar Click-Outside** — UX-Bug fixen
12. **Leere Branchen-Routen** — 404 verhindern

### P2 — Medium Priority

13. **Redundanz R2** — `engine-proxy.ts` entfernen
14. **Redundanz R4** — CSRF-Logik konsolidieren
15. **Multi-Model Selector** — UI für Model-Auswahl
16. **Dashboard i18n** — Mindestens Sidebar/Topbar bilingual
17. **Outlook Add-In** — Für Kanzlei-Workflow
18. **Server Unit-Test Failures** — Mocks für key-dependent Tests
19. **Sidebar Suche/Filter** — Bei 50+ Items
20. **Breadcrumbs im Dashboard** — Vorhandene Komponente nutzen

### P3 — Nice to Have

21. **`GBRAIN_*` Env-Variablen auflösen** — Auf `SIGMABRAIN_*` standardisieren
22. **Unbenutzte Types/Constants aufräumen** — `DMSFolder`, `DMSCredentials`, `ALLOW_FILE_AUTH_IN_PRODUCTION`
23. **Bundle Analyzer** — `@next/bundle-analyzer`
24. **Storybook Coverage** — Für alle UI Primitives
25. **Academy / Training** — Onboarding-Platform

### Go / No-Go

**Go — mit Bedingungen.**

Das Backend ist production-ready für einen kontrollierten Rollout bei DACH-Kanzleien. Das Frontend ist feature-complete und baut sauber. Aber:

1. ⛔ Kein Public Launch bis E2E grün ist
2. ⛔ Kein Enterprise-Sales bis SOC 2 Engagement läuft
3. ⚠️ Redundanzen (R1, R3) vor nächstem Sprint auflösen — sonst technische Schulden

### USP-Verifikation

| USP | Status | Differenzierung |
|-----|--------|-----------------|
| DACH Legal Engine (DE/AT/CH) | ✅ Stark | Einzigartig |
| Self-Hosting / EU Data | ✅ Stark | Einzigartig |
| GoBD / Verfahrensdoku | ✅ Stark | Einzigartig |
| RVG + DATEV | ✅ Stark | Einzigartig |
| WhatsApp Copilot | ✅ Stark | Einzigartig |
| Word Add-In | ✅ Stark | Parity mit Harvey/Legora |
| BEA / eIDAS | ✅ Stark | Einzigartig |
| Case Management + AI Brain | ✅ Stark | Einzigartige Kombination |

---

## Appendix: Redundanz-Übersicht

| ID | Redundanz | Severity | Dateien |
|----|-----------|----------|---------|
| R1 | API-Client Duplikation | 🔴 Hoch | `src/lib/api.ts` vs `src/lib/queries/brain.ts` |
| R2 | Engine-Proxy vs Engine | 🟠 Mittel | `src/lib/engine-proxy.ts` vs `src/lib/engine.ts` |
| R3 | Legacy Admin App | 🟠 Mittel | `legacy-admin/` (15+ Dateien, verwaist) |
| R4 | CSRF-Logik dreifach | 🟡 Niedrig | `csrf.ts`, `api.ts` (2x) |
| R5 | Auth-API Duplikation | 🟡 Niedrig | `queries/auth.ts` vs `api.ts` |
| R6 | Env-Variablen Dual-Naming | 🟡 Niedrig | `SIGMABRAIN_*` vs `GBRAIN_*` |
| R7 | Unbenutzte Types/Stubs | 🟢 Cleanup | `DMSFolder`, `DMSCredentials`, `ALLOW_FILE_AUTH_IN_PRODUCTION` |

---

*Report erstellt von Cascade. Re-run der Tests und Competitor-Research nach Fixes empfohlen.*
