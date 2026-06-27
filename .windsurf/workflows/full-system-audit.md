---
description: Vollständiger System-Audit — Code-Qualität, Gap-Analyse vs. Konkurrenz, Online-Readiness, Produktionsreife
---

# Full System Audit & Competitive Gap Analysis

> **Wann ausführen**: Wenn du eine vollständige ehrliche Bestandsaufnahme willst.
> Dieser Prompt prüft ALLES: Code-Qualität, Robustheit, Vollständigkeit, Competitive Gaps,
> Online-Readiness und Produktionsreife — in einem Durchgang.
>
> **Dauer**: Dies ist der umfassendste Prompt. Er analysiert die gesamte Codebase
> systematisch und erstellt einen actionable Report mit Prioritäten.

---

## Phase 0 — Vorbereitung

### 0.1 Codebase-Struktur laden

Lese und verifiziere die aktuelle Struktur:

- `src/app/` — Frontend & Dashboard Pages
- `src/app/api/` — API Routes (Anzahl notieren)
- `src/lib/` — Business Logic Module (Anzahl notieren)
- `src/components/` — UI Komponenten
- `server/src/core/` — Engine Core Module (Anzahl notieren)
- `server/src/core/operations.ts` — Operation Contracts
- `server/src/core/engine.ts` — Engine Interface
- `CLAUDE.md` — Architektur-Invariants
- `AUDIT_STATE_OF_THE_ART.md` — Letzter Audit (für Delta)
- `SIGMABRAIN_GAP_ANALYSIS.md` — Letzte Gap-Analyse (für Delta)
- `src/content/competitors.ts` — Feature-Matrix vs. Konkurrenz
- `src/content/compare.ts` — Detaillierter Vergleich (UWG-safe)

### 0.2 Test-Status ermitteln

```bash
npx tsc --noEmit 2>&1 | head -50
npx vitest run 2>&1 | tail -20
npm run build 2>&1 | tail -30
```

Notiere: Wie viele TypeScript-Errors? Wie viele Test-Failures? Build erfolgreich?

---

## Phase 1 — Code-Qualität pro Schicht

### 1.1 Frontend / Marketing (`src/app/` ohne dashboard+api, `src/components/marketing/`)

**Checkliste:**

- [ ] Alle Public Pages haben korrekte Metadata (title, description, OG, Twitter)
- [ ] Structured Data (JSON-LD) auf Landing, Pricing, FAQ
- [ ] `sitemap.ts` deckt ALLE Routen ab
- [ ] `robots.ts` korrekt konfiguriert
- [ ] `manifest.ts` PWA-konform
- [ ] Mobile-responsive auf allen Pages (375px, 768px, 1024px, 1440px)
- [ ] LCP < 2.5s, CLS < 0.1, INP < 200ms (Lighthouse)
- [ ] Keine Google Fonts (next/font self-host für DSGVO)
- [ ] Alle Images via next/image (WebP/AVIF, lazy)
- [ ] i18n: Deutsche Primärsprache, alle Strings ausgelagert oder inline-de
- [ ] Accessibility: WCAG 2.1 AA, ARIA, Keyboard, Focus-States
- [ ] Keine toten Links (interne + externe)

**Score:** \_\_/10

### 1.2 Dashboard / Kanzlei-OS (`src/app/dashboard/`, `src/components/dashboard/`)

**Checkliste:**

- [ ] Alle 51 Dashboard-Seiten haben: Loading State, Empty State, Error State
- [ ] CRUD komplett auf jeder Entität-Seite (Create, Read, Update, Delete)
- [ ] Forms haben Zod-Validation + Inline-Errors + Submit-Loading
- [ ] Data Tables: Sortierung, Filterung, Pagination (wo sinnvoll)
- [ ] Command Palette (Cmd+K) funktioniert und erreicht alle Seiten
- [ ] Sidebar: Active-Indicator, Badge-Counts, Collapsible
- [ ] Dark Mode: Konsistent auf allen Seiten
- [ ] Keyboard Navigation: Tab, Escape, Enter
- [ ] Realtime: WebSocket-Updates (Brain Status, Approvals)
- [ ] Offline: Mutation Queue, Sync-Indikator
- [ ] Industry Themes: Korrekt angewendet
- [ ] Keine `console.log` in Production-Code
- [ ] Keine TODO/FIXME/HACK Kommentare

**Score:** \_\_/10

### 1.3 API Layer (`src/app/api/`, `src/lib/api.ts`, `src/middleware.ts`)

**Checkliste:**

- [ ] Jede Route hat Input-Validation (Zod oder manuell)
- [ ] Jede Route prüft Auth (Session + Permission)
- [ ] Jede POST/PUT/DELETE hat CSRF-Schutz
- [ ] Rate-Limiting auf kritischen Endpoints
- [ ] Konsistente Error-Response: `{ error, code, details? }`
- [ ] Konsistente Success-Response: `{ data, meta? }`
- [ ] SSE-Streaming für AI-Endpoints korrekt
- [ ] File-Upload: MIME-Check, Size-Limit, Virus-Scan
- [ ] Audit-Log bei jeder destruktiven Action
- [ ] Middleware: Auth-Check, Security-Headers, Rate-Limit
- [ ] Keine Logik in Routes — nur Validation + Delegation an `src/lib/`
- [ ] CORS korrekt konfiguriert (falls Portal/External)

**Score:** \_\_/10

### 1.4 Business Logic (`src/lib/`)

**Checkliste:**

- [ ] Kein `any` Type — alle Public APIs explizit typisiert
- [ ] Custom Error Classes (nicht bare `Error`)
- [ ] Zod-Schemas für alle externen Inputs
- [ ] Unit-Tests für Kern-Logik (legal-deadlines, rvg, encryption, permissions)
- [ ] Pure Functions wo möglich (keine Side-Effects)
- [ ] Structured Logging (JSON, Request-ID)
- [ ] SQL-Injection-Schutz (parametrisierte Queries)
- [ ] XSS-Schutz (Input-Sanitization, Output-Encoding)
- [ ] Encryption: AES-256-GCM für PII at rest
- [ ] GoBD: Verfahrensdokumentation, Integrität, Audit-Trail
- [ ] DSGVO: Data Minimization, Right to Access/Delete/Export

**Score:** \_\_/10

### 1.5 Engine / Server Core (`server/src/core/`)

**Checkliste (Architektur-Invariants aus CLAUDE.md):**

- [ ] Trust Boundary: `OperationContext.remote` korrekt auf allen Ops
- [ ] Source Isolation: `sourceScopeOpts(ctx)` auf allen Read-Ops
- [ ] JSONB: Kein `JSON.stringify` in `::jsonb` cast
- [ ] Engine Parity: postgres-engine.ts & pglite-engine.ts in Lockstep
- [ ] Contract-First: Neue Ops in `operations.ts` → CLI + MCP generiert
- [ ] Migrations: DDL in `MIGRATIONS` Array
- [ ] Multi-Source: Slug uniqueness = `(source_id, slug)`
- [ ] Pricing: Eine kanonische Tabelle in `model-pricing.ts`
- [ ] Error Hierarchy: `EngineError` Subklassen
- [ ] Connection Management: Pool-Reuse, Cleanup
- [ ] Query Performance: Index-Strategie, Batch-Operations
- [ ] E2E Tests: engine-parity.test.ts grün

**Score:** \_\_/10

### 1.6 Auth & Security (`src/lib/auth/`, `src/lib/permissions.ts`, `src/middleware.ts`)

**Checkliste:**

- [ ] Session: HttpOnly, Secure, SameSite Cookies
- [ ] 2FA/TOTP: RFC 6238 konform, Backup-Codes, Recovery
- [ ] RBAC: Role → Permissions Mapping, Resource-level Checks
- [ ] CSRF: Double-Submit Cookie Pattern
- [ ] Rate Limiting: Sliding Window, Pro-User + Pro-IP
- [ ] Audit Log: Tamper-proof, Append-only
- [ ] Encryption: AES-256-GCM at rest, TLS 1.3 in transit
- [ ] Virus Scan: Vor Speicherung
- [ ] API Keys: Hashed Storage, Scoped, Rotation
- [ ] Security Headers: HSTS, X-Frame-Options, X-Content-Type-Options, CSP
- [ ] DSGVO: Art. 20 Data Export, Right to be Forgotten
- [ ] EU AI Act: Art. 50 AI Output Labeling

**Score:** \_\_/10

### 1.7 Integrations (`src/lib/docusign.ts`, `src/lib/whatsapp/`, `src/lib/email*`)

**Checkliste:**

- [ ] Webhook Verification: Signature-Validation
- [ ] Idempotency: Webhook-Deduplication
- [ ] Retry Logic: Exponential Backoff
- [ ] Rate Limiting: Externe API Limits respektiert
- [ ] Credential Storage: Verschlüsselt (AES-256-GCM)
- [ ] Token Refresh: OAuth Auto-Refresh
- [ ] Sync Status: Progress-Indicator
- [ ] Error Handling: User-friendly Messages

**Score:** \_\_/10

### 1.8 Legal Domain (`src/lib/legal-*.ts`, `law-corpus/`, `server/src/core/legal/`)

**Checkliste:**

- [ ] Fristberechnung: ZPO § 233, BGB §§ 187-193, VwGO § 60
- [ ] Feiertage: Bundesland-spezifisch
- [ ] RVG: § 3, § 13, Anlage 1+2+3
- [ ] AI Fristerkennung: Confidence Score, Human Review
- [ ] Legal Research: Hybrid Search über Gesetze + Urteile
- [ ] Kollisionsprüfung: Mandant vs. Gegner, Historie
- [ ] Groundedness: AI-Responses gegen Quellen validiert
- [ ] law-corpus: DE/AT/CH Gesetzestexte aktuell

**Score:** \_\_/10

### 1.9 Testing (`tests/`, `server/test/`, `*.test.ts`)

**Checkliste:**

- [ ] Unit Test Coverage: >80% Business Logic, >60% UI
- [ ] Integration Tests: Jede API Route
- [ ] E2E Tests: Critical User Flows (Login, Case, Deadline, Drafting)
- [ ] Accessibility Tests: axe-core via Playwright
- [ ] Engine Parity Tests: postgres vs. pglite
- [ ] Schema Bootstrap Tests
- [ ] Model Pricing Drift Tests
- [ ] Test Isolation: Keine Abhängigkeiten
- [ ] CI Integration: Tests bei jedem PR

**Score:** \_\_/10

---

## Phase 2 — Competitive Gap Analysis

### 2.1 Feature-Matrix vs. Konkurrenz

Vergleiche ALLE behaupteten Features aus `src/content/competitors.ts` und
`src/content/compare.ts` mit dem **tatsächlichen Code-Stand**.

**Konkurrenten:**

- **Harvey AI** — Enterprise Legal AI (BigLaw, $1.200/Seat, 20+ Seats min)
- **Legora** — AI Legal Workspace ($100M ARR, Word/Outlook Add-Ins)
- **CoCounsel** (Thomson Reuters) — Research + Westlaw ($639/User)
- **Beck-Noxtua** — Souveräner DE Legal-AI (beck-online, EU-Hosting)
- **Luminance** — M&A/DD (On-Premise möglich, $50k+/Jahr)
- **Spellbook** — Contract Review in Word ($99-199/User)
- **Glean** — Enterprise Knowledge (100+ Connectors, $50/User)
- **Notion AI** — Knowledge in Notion ($10/User Add-on)
- **Subsum.io** — AT Legal Copilot (geschlossene SaaS)

**Für JEDE Zeile in der Feature-Matrix:**

1. Code verifizieren — existiert die Implementierung WIRKLICH?
2. Status setzen: ✅ voll implementiert · 🟡 teilweise · ❌ fehlt · 🔴 behauptet aber nicht da
3. Gap-Größe: KEIN Gap · KLEIN · MITTEL · GROSS · KRITISCH
4. Priorität: P0 (launch-blockierend) · P1 (sollte vor Launch) · P2 (nach Launch) · P3 (nice-to-have)

### 2.2 Gap-Detail-Analyse

Für jeden Gap mit Priorität P0 oder P1:

| Gap | Konkurrent hat es | Wir haben | Was fehlt genau | Aufwand | Prio |
| --- | ----------------- | --------- | --------------- | ------- | ---- |
| ... | ...               | ...       | ...             | ...     | ...  |

### 2.3 USP-Verifikation

**Unsere behaupteten USPs (aus compare.ts):**

1. ✅ Knowledge Graph + Gap-Analyse — verifizieren im Code
2. ✅ Self-Hosting / On-Premise — verifizieren (PGLite + Postgres)
3. ✅ EU-Datenspeicherung (DSGVO) — verifizieren
4. ✅ Compounding Firm Brain — verifizieren (Dream Cycle)
5. ✅ Cross-Matter Contradiction Surfacing — verifizieren
6. ✅ Per-Seat ab 1 (kein Minimum) — verifizieren (plans.ts)
7. ✅ GoBD-Bausteine — verifizieren (gobd.ts)
8. ✅ beA/eIDAS-Integration — verifizieren (API Routes vorhanden?)
9. ✅ DATEV-Export — verifizieren (API Route vorhanden?)
10. ✅ WhatsApp-Copilot — verifizieren (whatsapp/ Module)
11. ✅ Native Mobile App — verifizieren (Capacitor config)
12. ✅ Offline-Modus — verifizieren (offline-store.ts)
13. ✅ EU AI Act Art. 50 Labeling — verifizieren (ai-act.ts)
14. ✅ DSGVO-Anonymisierung — verifizieren (anonymize API)

**Für jeden USP:** Ist er WIRKLICH im Code implementiert oder nur behauptet?

---

## Phase 3 — Online-Readiness Audit

### 3.1 Deployment-Readiness

- [ ] **Build**: `npm run build` erfolgreich ohne Errors?
- [ ] **TypeScript**: `npx tsc --noEmit` — 0 Errors?
- [ ] **ESLint**: `npx eslint .` — 0 Errors?
- [ ] **Environment Variables**: Alle `.env.example` Variablen dokumentiert?
- [ ] **vercel.json**: Korrekt konfiguriert? Cronjobs zeigen auf existierende Routes?
- [ ] **Docker**: `server/Dockerfile` aktuell und funktional?
- [ ] **Health Check**: `/api/health` Endpoint vorhanden und funktional?
- [ ] **Error Tracking**: Sentry o.ä. konfiguriert?
- [ ] **Analytics**: Privacy-friendly Analytics (Plausible/Umami) konfiguriert?
- [ ] **Monitoring**: Uptime-Monitoring eingerichtet?

### 3.2 Security-Readiness

- [ ] **HTTPS**: TLS 1.3 erzwungen?
- [ ] **Security Headers**: HSTS, CSP, X-Frame-Options, X-Content-Type-Options?
- [ ] **Secrets**: Keine Hardcoded Secrets im Code? (gitleaks check)
- [ ] **Dependencies**: Keine bekannten Vulnerabilities? (`npm audit`)
- [ ] **Rate Limiting**: Aktiv und konfiguriert?
- [ ] **CSRF**: Aktiv für alle POST/PUT/DELETE?
- [ ] **XSS**: Alle User-Inputs escaped?
- [ ] **SQL Injection**: Alle Queries parametrisiert?
- [ ] **File Upload**: MIME-Check, Size-Limit, Virus-Scan?
- [ ] **Session**: HttpOnly, Secure, SameSite?
- [ ] **2FA**: Verfügbar und funktional?
- [ ] **Audit Log**: Aktiv und tamper-proof?

### 3.3 Infrastructure-Readiness

- [ ] **Domain**: Geschaltet? DNS korrekt?
- [ ] **SSL Certificate**: Gültig? Auto-Renewal?
- [ ] **CDN**: Konfiguriert (Vercel Edge / Cloudflare)?
- [ ] **Database**: Postgres/Supabase produktionsbereit?
- [ ] **Backups**: Automatisiert? Retention-Policy?
- [ ] **Email**: SMTP/Resend/Postmark konfiguriert?
- [ ] **File Storage**: S3/Supabase/Local konfiguriert?
- [ ] **WebSocket**: Realtime-Server verfügbar?
- [ ] **Cron Jobs**: Alle Cronjobs funktional? (vercel.json + server)
- [ ] **Stripe**: API Keys live? Webhooks konfiguriert?
- [ ] **AI Providers**: API Keys konfiguriert (Anthropic, OpenAI, ZeroEntropy)?

### 3.4 SaaS-Readiness (Multi-Tenant)

- [ ] **Signup Flow**: Funktioniert end-to-end?
- [ ] **Provisioning**: Neue User → Brain erstellt? Source zugewiesen?
- [ ] **Billing**: Stripe Integration live? Subscription Lifecycle?
- [ ] **Usage Metering**: Wird Usage getrackt und im Dashboard angezeigt?
- [ ] **Team/Org**: Invite-Flow funktioniert? Rollen korrekt?
- [ ] **Data Isolation**: Source-Isolation getestet? Keine Cross-Tenant Leaks?
- [ ] **Data Export**: DSGVO Art. 20 Export funktioniert?
- [ ] **Data Deletion**: DSGVO Right to be Forgotten funktioniert?
- [ ] **Onboarding**: Neue User werden geführt (First-Run Experience)?

### 3.5 Legal/Compliance-Readiness

- [ ] **Impressum**: Korrekt und vollständig?
- [ ] **Datenschutz**: DSGVO-konform? Cookie-Banner?
- [ ] **AGB/Terms**: Aktuell und rechtlich geprüft?
- [ ] **GoBD**: Verfahrensdokumentation verfügbar?
- [ ] **EU AI Act**: Art. 50 AI Output Labeling implementiert?
- [ ] **Berufsrecht**: RA-Kanzlei-Features berufsrechtlich geprüft?
- [ ] **beA**: Integration DACH-konform?
- [ ] **Aufbewahrungsfristen**: 6/10 Jahre konfiguriert?

---

## Phase 4 — Robustheits- & Vollständigkeit-Check

### 4.1 Critical User Flows (alle durchspielen)

| Flow                                             | Status   | Blockers |
| ------------------------------------------------ | -------- | -------- |
| Signup → Onboarding → First Query                | ✅/🟡/❌ | ...      |
| Login → Dashboard → Case Create → Upload → Query | ✅/🟡/❌ | ...      |
| Deadline Detection → Calendar Export             | ✅/🟡/❌ | ...      |
| Contract Draft → Review → Sign (DocuSign)        | ✅/🟡/❌ | ...      |
| Brain Sync → Graph → Contradictions              | ✅/🟡/❌ | ...      |
| Team Invite → Role Assign → Permission Check     | ✅/🟡/❌ | ...      |
| Billing → Stripe → Invoice → DATEV Export        | ✅/🟡/❌ | ...      |
| Offline → Mutation Queue → Online → Sync         | ✅/🟡/❌ | ...      |
| WhatsApp → Brain → Response                      | ✅/🟡/❌ | ...      |
| Mandanten-Portal → Document Share                | ✅/🟡/❌ | ...      |

### 4.2 Error-Handling-Audit

- [ ] Jede API Route hat try/catch
- [ ] Jede API Route gibt strukturierte Errors zurück
- [ ] Frontend zeigt User-friendly Error-Messages (nicht raw JSON)
- [ ] Retry-Buttons bei Errors vorhanden
- [ ] Network-Errors werden graceful gehandhabt
- [ ] 401 → Login-Redirect
- [ ] 403 → Permission-Error-Page
- [ ] 429 → Rate-Limit-Message mit Retry-After
- [ ] 500 → Generic Error + Support-Contact
- [ ] Timeout → Abbrechen-Button

### 4.3 Edge-Case-Audit

- [ ] Leere Datenbank → Empty States
- [ ] 10.000+ Pages → Performance akzeptabel?
- [ ] Unicode/Emojis in Queries → korrekte Verarbeitung
- [ ] Sehr lange Dokumente (100MB PDF) → Chunking korrekt?
- [ ] Gleichzeitige Edits → Conflict Resolution
- [ ] Rapid Klicking → Debounce/Disable
- [ ] Tab schließen während Save → Warnung
- [ ] Session abgelaufen mid-Action → Graceful Redirect

---

## Phase 5 — Final Report

### 5.1 Score-Card

| Bereich                  | Score       | Status | Kritische Gaps |
| ------------------------ | ----------- | ------ | -------------- |
| Frontend / Marketing     | \_\_/10     | ...    | ...            |
| Dashboard / Kanzlei-OS   | \_\_/10     | ...    | ...            |
| API Layer                | \_\_/10     | ...    | ...            |
| Business Logic           | \_\_/10     | ...    | ...            |
| Engine / Server Core     | \_\_/10     | ...    | ...            |
| Auth & Security          | \_\_/10     | ...    | ...            |
| Integrations             | \_\_/10     | ...    | ...            |
| Legal Domain             | \_\_/10     | ...    | ...            |
| Testing                  | \_\_/10     | ...    | ...            |
| **Code-Qualität Gesamt** | **\_\_/10** | ...    | ...            |
| **Competitive Position** | **\_\_/10** | ...    | ...            |
| **Online-Readiness**     | **\_\_/10** | ...    | ...            |
| **Robustheit**           | **\_\_/10** | ...    | ...            |
| **GESAMT**               | **\_\_/10** | ...    | ...            |

### 5.2 P0 Blockers (Launch-blockierend)

Liste ALLE P0 Issues auf:

1. ...
2. ...

### 5.3 P1 Issues (Sollten vor Launch behoben werden)

1. ...
2. ...

### 5.4 Competitive Gaps (vs. Konkurrenz)

| Gap | Konkurrent | Unser Status | Prio | Aktionsplan |
| --- | ---------- | ------------ | ---- | ----------- |
| ... | ...        | ...          | ...  | ...         |

### 5.5 USP-Verifikation

| USP | Code verifiziert | Status |
| --- | ---------------- | ------ |
| ... | ...              | ...    |

### 5.6 Online-Readiness Checklist

| Item | Status | Blocker |
| ---- | ------ | ------- |
| ...  | ...    | ...     |

### 5.7 Empfohlene Reihenfolge

```
1. P0 Blocker beheben → /optimize-{bereich} + /verify-optimization
2. P1 Issues beheben → /optimize-{bereich} + /verify-optimization
3. Competitive Gaps schließen → /optimize-{bereich} für jeweiligen Bereich
4. Cross-Area Check → /cross-audit
5. Final Audit → /full-system-audit erneut
```

### 5.8 Go/No-Go Entscheidung

```
WENN P0 = 0 UND Gesamt-Score >= 8/10:
  → Status: PRODUKTIONSREIF FÜR LAUNCH
  → Alle P1 Issues haben Timeline
  → Competitive Position ist dokumentiert und ehrlich

WENN P0 > 0 ODER Gesamt-Score < 8/10:
  → Status: NICHT PRODUKTIONSREIF
  → P0 Blocker AUFLISTEN mit konkreten Aktionsplänen
  → Pro Blocker: Welcher /optimize-* Befehl behebt es?
```

---

## Test-Befehle (vollständige Suite)

```bash
# TypeScript
npx tsc --noEmit

# ESLint
npx eslint . --max-warnings 0

# Frontend Unit Tests
npx vitest run

# Frontend Build
npm run build

# Playwright E2E
npx playwright test

# Server Unit Tests
cd server && bun test

# Server E2E
cd server && bun run test:e2e

# Full CI Gate
cd server && bun run ci:local

# Security Audit
npm audit --audit-level moderate

# Secret Scan
cd server && gitleaks detect --source . --config .gitleaks.toml

# Bundle Analysis
ANALYZE=true npm run build
```
