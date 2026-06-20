# Audit-Prompt 3: Subsumio SaaS-Applikationsschicht — Frontend, Auth, Billing, Admin, Deployment & Production Readiness

> **Zweck:** Dieser Prompt ergänzt Audit 1 (Ingestion-Pipeline) und Audit 2 (Intelligence Layer) und prüft die **komplette SaaS-Applikationsschicht** zwischen Brain-Engine und Endnutzer: Frontend/Dashboard, Auth & Security, Billing & Quota, Admin, DMS, Collaboration, Real-time, Deployment/DevOps, Branding und Accessibility.
>
> **Voraussetzung:** Audit 1 und 2 sind gelesen. Dieser Prompt deckt alles ab, was NICHT Teil der Brain-Engine selbst ist, sondern die Hülle drumherum.

---

## 1. PRÜFUMFANG

### 1.1 Frontend / Dashboard / Kanzlei-OS

Das Dashboard ist das tägliche Arbeitsinstrument für Kanzleien. 50+ Seiten unter `src/app/dashboard/`.

**Dashboard-Seiten (50+):**

| Bereich | Seiten | Funktion |
|---------|--------|----------|
| **Cases** | `cases/` (5 items) | Aktenverwaltung, Case-Detail, Case-Erstellung |
| **Deadlines** | `deadlines/` (3 items) | Fristen-Übersicht, Fristen-Detail, Fristen-Erstellung |
| **Brain** | `brain/` (4 items) | Brain-Pages-Übersicht, Page-Detail, Graph-View, Search |
| **Query** | `query/` (3 items) | Think-Query, Query-History, Query-Detail |
| **Vault** | `vault/` (3 items) | Dokumenten-Vault, Upload, Detail |
| **Contacts** | `contacts/` (3 items) | Kontakt-Verwaltung, Kontakt-Detail, Erstellung |
| **Invoicing** | `invoicing/` (3 items) | Rechnungen, Rechnungs-Detail, Erstellung |
| **Team** | `team/` (3 items) | Team-Verwaltung, Einladungen, Rollen |
| **Settings** | `settings/` (7 items) | Kanzlei-Settings, AI-Modell, Security, SCIM, etc. |
| **Agents** | `agents/` (3 items) | Agent-Builder, Agent-Liste, Agent-Detail |
| **Compliance** | `compliance/` (2 items) | GoBD, Verfahrensdokumentation |
| **Legal** | `anonymize/`, `contracts/`, `drafting/`, `kollisionspruefung/`, `norms/`, `playbooks/`, `rechtsprechung/`, `research/`, `signature/`, `tabular-review/` | Legal-Engine UI |
| **Import/Export** | `email-import/`, `upload/`, `data-export/`, `datev-export/`, `import-kanzlei/` | Daten-Import/Export |
| **Communication** | `whatsapp/`, `bea/`, `connectors/` | Kommunikations-Kanäle |
| **Monitoring** | `monitoring/`, `audit/`, `rag-eval/` | System-Monitoring |
| **Misc** | `api-keys/`, `approvals/`, `assistant/`, `calendar-export/`, `client-portal/`, `controlling/`, `cost-calculator/`, `graph/`, `judgements-sync/`, `mobile/`, `opponents/`, `verfahrensdoku/` | Weitere Features |

**Prüfkriterien pro Dashboard-Seite:**
- [ ] Ist die Seite funktional vollständig? (CRUD wo relevant, List/Detail/Create/Edit/Delete)
- [ ] Gibt es Loading-States? (Skeleton, Spinner)
- [ ] Gibt es Empty-States? (Keine Daten → hilfreiche Message + CTA)
- [ ] Gibt es Error-States? (Error-Boundary, Error-Message, Retry)
- [ ] Ist die Seite responsive? (Mobile, Tablet, Desktop)
- [ ] Ist die Seite accessible? (WCAG 2.1 AA: Kontrast, Focus-Order, ARIA-Labels, Keyboard-Navigation)
- [ ] Sind Form-Validierungen korrekt? (Zod-Schema, Inline-Errors, Submit-Disabled)
- [ ] Ist die Pagination/Infinite-Scroll korrekt? (Große Datenmengen)
- [ ] Sind die Filter/Sort-Funktionen korrekt? (Search, Filter-Chips, Sort)
- [ ] Gibt es Confirmation-Dialoge für destruktive Aktionen? (Delete, Cancel)
- [ ] Ist die Undo/Redo-Funktionalität vorhanden wo relevant?

**Dashboard-Kern-Komponenten:**

| Komponente | Datei | Zeilen | Funktion |
|---|---|---|---|
| **Sidebar** | `components/dashboard/sidebar.tsx` | 19893 | Navigation, Collapse, Active-State |
| **Topbar** | `components/dashboard/topbar.tsx` | 12124 | User-Menu, Notifications, Search |
| **Command Palette** | `components/dashboard/command-palette.tsx` | 14219 | Cmd+K, Quick-Actions, Search |
| **Agent Builder** | `components/dashboard/agent-builder.tsx` | 42062 | Visueller Agent-Editor |
| **Data Table** | `components/dashboard/data-table.tsx` | 13362 | Generische Tabelle mit Sort/Filter/Pagination |
| **Model Selector** | `components/dashboard/model-selector.tsx` | 6633 | AI-Modell-Auswahl |
| **Search Bar** | `components/dashboard/search-bar.tsx` | 1664 | Globale Suche |
| **Stats Card** | `components/dashboard/stats-card.tsx` | 2607 | KPI-Cards |
| **Page Header** | `components/dashboard/page-header.tsx` | 1853 | Einheitlicher Page-Header |
| **Empty State** | `components/dashboard/empty-state.tsx` | 1272 | Empty-State-Komponente |
| **Filter Chip** | `components/dashboard/filter-chip.tsx` | 1348 | Filter-Anzeige |
| **Skeleton** | `components/dashboard/skeleton.tsx` | 3923 | Loading-Skeleton |

**Prüfkriterien Kern-Komponenten:**
- [ ] Ist die Sidebar korrekt? (Navigation, Active-State, Collapse, Mobile-Drawer)
- [ ] Ist die Topbar korrekt? (User-Menu, Notifications, Quick-Search, Brain-Switcher)
- [ ] Ist die Command Palette korrekt? (Cmd+K, Fuzzy-Search, Keyboard-Navigation, Recent-Actions)
- [ ] Ist der Agent Builder korrekt? (Drag-and-Drop, Node-Editor, Validation, Save/Load)
- [ ] Ist die Data Table korrekt? (Sort, Filter, Pagination, Row-Selection, Bulk-Actions)
- [ ] Ist der Model Selector korrekt? (Verfügbare Modelle, Default, Cost-Display)

### 1.2 UI-Komponenten-Bibliothek (shadcn/ui-basiert)

**45 Komponenten** unter `src/components/ui/`:

accordion, avatar, badge, breadcrumb, button, card, checkbox, confirm-dialog, dialog, dropdown-menu, input, label, pagination, progress, select, skeleton, switch, table, tabs, textarea, toast, tooltip.

**Prüfkriterien:**
- [ ] Sind alle Komponenten korrekt implementiert? (shadcn/ui Pattern)
- [ ] Sind alle Komponenten accessible? (ARIA, Keyboard, Focus-Management)
- [ ] Gibt es Storybook-Stories für alle? (22 .stories.tsx-Dateien gefunden)
- [ ] Gibt es Unit-Tests? (button.test.tsx gefunden — weitere?)
- [ ] Ist das Design-System konsistent? (Spacing, Typography, Colors, Shadows)
- [ ] Ist der Dark-Mode korrekt? (globals.css 26536 bytes — Theme-Variablen)
- [ ] Sind die Komponenten Tree-shakeable? (Keine unnötigen Imports)

### 1.3 Auth & Security

**Dateien:**
- `src/lib/auth/session-core.ts` (139 Zeilen) — Edge-safe Session-Primitives
- `src/lib/auth/session.ts` (1756 bytes) — Node.js Session (re-export + helpers)
- `src/lib/auth/store.ts` (538 Zeilen) — User/Org Store mit Postgres + JSON-File Adapter
- `src/lib/auth/tokens.ts` (98 Zeilen) — Action Tokens (reset, verify, invite, 2fa_challenge)
- `src/lib/auth/password.ts` (1109 bytes) — Password Hashing (PBKDF2/scrypt)
- `src/lib/auth/rate-limit.ts` (168 Zeilen) — Sliding-Window Rate Limiter
- `src/lib/auth/backup-codes.ts` (2017 bytes) — 2FA Backup Codes
- `src/lib/auth/revocation-store.ts` (2516 bytes) — Session Revocation
- `src/lib/csrf.ts` (82 Zeilen) — CSRF Double-Submit
- `src/lib/encryption.ts` (138 Zeilen) — AES-256-GCM At-Rest Encryption
- `src/middleware.ts` (85 Zeilen) — Edge Middleware (Auth + CSRF)
- `src/lib/permissions.ts` (173 Zeilen) — RBAC Matrix
- `src/lib/scim.ts` (129 matches) — SCIM 2.0 für Enterprise SSO

**Auth-Architektur:**

```
Client → Middleware (Edge) → Session-Cookie Verification → CSRF Check → Route Handler → RBAC → Rate-Limit → Quota → Handler
```

**Prüfkriterien Session:**
- [ ] Ist die Session-Implementierung korrekt? (HMAC-SHA-256, Edge-safe, 30 Tage TTL)
- [ ] Ist die Session-Revocation korrekt? (Version-basiert, 60s Cache-Window, `/api/internal/revocation-check`)
- [ ] Ist das Fail-Open-Verhalten bei Revocation-Check-Fehler akzeptabel? (Zeile 56: `catch → return 0` = valid)
- [ ] Ist die Session-Cookie-Sicherheit korrekt? (httpOnly, secure, sameSite, maxAge, path)
- [ ] Ist der AUTH_SECRET-Check korrekt? (Production: throw, Dev: fallback)

**Prüfkriterien Password:**
- [ ] Ist das Password-Hashing korrekt? (PBKDF2/scrypt, Salt, Iterations)
- [ ] Ist die Password-Policy korrekt? (Min-Length, Complexity)
- [ ] Ist die Password-Reset-Flow korrekt? (Token mit purpose=reset, bind an password-hash, 1h TTL)
- [ ] Ist die Email-Verification korrekt? (Token mit purpose=verify, bind an email, 48h TTL)

**Prüfkriterien 2FA:**
- [ ] Ist die 2FA-Implementierung korrekt? (TOTP, Base32-Secret, encrypted at rest)
- [ ] Sind die Backup-Codes korrekt? (SHA-256 hashed, consumed on use)
- [ ] Ist der 2FA-Login-Flow korrekt? (Password → 2FA-Challenge-Token → TOTP-Verify)
- [ ] Ist die 2FA-Setup-Flow korrekt? (Pending-Secret, 10min Expiry, QR-Code)

**Prüfkriterien Rate-Limiting:**
- [ ] Ist das Sliding-Window korrekt? (Count + ResetAt, per-IP oder per-User)
- [ ] Ist der Upstash-Redis-Fallback korrekt? (Multi-Instanz, in-memory fallback, file-based persistence)
- [ ] Sind die Rate-Limit-Tiers korrekt? (standard, heavy — welche Limits?)
- [ ] Ist der Fail-Open/Fail-Closed-Tradeoff korrekt? (Brute-Force-Schutz vs. Availability)

**Prüfkriterien CSRF:**
- [ ] Ist das Double-Submit-Pattern korrekt? (Cookie nicht httpOnly, SameSite=lax, Header-Match)
- [ ] Sind die Exemptions korrekt? (login, signup, forgot, reset, 2fa-login, cron, webhook)
- [ ] Ist die Cookie-Generierung korrekt? (Web Crypto, 32 bytes random)

**Prüfkriterien Encryption:**
- [ ] Ist die AES-256-GCM-Implementierung korrekt? (Web Crypto, 32-byte Key, IV/Nonce)
- [ ] Ist der Production-Check korrekt? (throw wenn SIGMABRAIN_ENCRYPTION_KEY fehlt in production)
- [ ] Ist der Dev-Fallback sicher markiert? (`sbenc:` Marker für unencrypted)
- [ ] Welche Felder werden encrypted? (openaiKey, anthropicKey, docusignTokens, twoFactorSecret, pendingTwoFactorSecret)

**Prüfkriterien RBAC:**
- [ ] Ist die Rollen-Matrix korrekt? (admin, lawyer, assistant, client_viewer)
- [ ] Sind die Route-Actions korrekt? (30+ Actions definiert)
- [ ] Ist die `can()`-Funktion korrekt? (User → Role → Action → allowed)
- [ ] Ist die `auditActionFor()`-Mapping korrekt? (Route-Action → Audit-Action)
- [ ] Sind client_viewer-Einschränkungen korrekt? (Nur brain.read + settings.read)

**Prüfkriterien SCIM 2.0:**
- [ ] Ist die SCIM-Implementierung korrekt? (/Users, /Groups, POST/PATCH/PUT/DELETE)
- [ ] Ist die SSO-Integration korrekt? (WorkOS, OAuth2 callback)
- [ ] Ist die User-Provisioning-Korrerektheit gewährleistet? (Create, Update, Deactivate, Delete)
- [ ] Ist die Group-Sync-Korrerektheit gewährleistet? (Group-Membership, Group-Operations)

### 1.4 Billing & Quota

**Dateien:**
- `src/lib/billing/plans.ts` (89 Zeilen) — Plan-Definitionen (free, pro, team, enterprise)
- `src/lib/plans.ts` (234 Zeilen) — Plan-Limits + Quota-Enforcement
- `src/lib/usage.ts` (147 Zeilen) — Usage-Metering (monthly query counters)
- `src/app/api/billing/checkout/route.ts` (61 Zeilen) — Stripe Checkout
- `src/app/api/billing/webhook/route.ts` — Stripe Webhook

**Pläne:**

| Plan | Preis | Pages | Queries/Mon | Seats |
|------|-------|-------|-------------|-------|
| Free | 0€ | 200 | 100 | 1 |
| Pro | 290€/Mon | 25.000 | 2.000 | 1 |
| Team | 490€/Seat/Mon | 100.000 | 10.000/Seat | 5 |
| Enterprise | Custom | 1.000.000 | 100.000 | 25 |

**Prüfkriterien Billing:**
- [ ] Ist die Stripe-Checkout-Integration korrekt? (Checkout Session, customer_email, client_reference_id, metadata)
- [ ] Ist die Stripe-Webhook-Integration korrekt? (Signature-Verification, Event-Handling, Idempotency)
- [ ] Ist die Plan-Upgrade/Downgrade-Logik korrekt? (Proration, immediate vs. end-of-period)
- [ ] Ist die Plan-Limit-Enforcement korrekt? (Soft-Gating: warn, nicht cut-off — V1)
- [ ] Ist die Quota-Enforcement korrekt? (Postgres + JSON-File, monthly reset, per-brainId)
- [ ] Ist die Usage-Metering korrekt? (Per-Query-Counter, per-brainId, per-month)
- [ ] Ist die Referral-Integration korrekt? (referralCode, referredBy, Stripe metadata)
- [ ] Ist die Enterprise-Plan-Logik korrekt? (Custom pricing, SCIM, 25 seats)

**Prüfkriterien Quota:**
- [ ] Ist die Quota-Tabelle korrekt? (subsumio_usage: brain_id, month, queries)
- [ ] Ist die Quota-Check-Korrekteith gewährleistet? (Vor Handler-Execution, nicht danach)
- [ ] Ist die Quota-Over-Handling korrekt? (Warnung, nicht Block — V1 soft gating)
- [ ] Ist die Monthly-Reset-Logik korrekt? (yyyy-mm Key, automatischer Roll-over)

### 1.5 Audit-Trail

**Datei:** `src/lib/audit.ts` (222 Zeilen)

**Prüfkriterien:**
- [ ] Ist die Audit-Log-Implementierung korrekt? (Postgres `subsumio_audit_log` Tabelle)
- [ ] Ist die Hash-Chain korrekt? (SHA-256 über prev_hash + data → tamper-evidence)
- [ ] Ist die Multi-Tenant-Isolation korrekt? (brain_id pro Row, Index auf brain_id)
- [ ] Ist das Dev-Fallback korrekt? (Brain-Pages mit type=audit_log)
- [ ] Sind die Audit-Actions vollständig? (AuditAction Type, audit-labels.ts)
- [ ] Ist die Fire-and-Forget-Logik korrekt? (Audit nach Handler-Execution, nicht blockierend)
- [ ] Ist die IP-Logging korrekt? (X-Forwarded-For, Request-IP)
- [ ] Ist die User-Logging korrekt? (user_id, user_email aus Session)

### 1.6 API-Handler-Architektur

**Datei:** `src/lib/api-handler.ts` (445 Zeilen)

**Guard-Chain (9 Schichten):**
1. Engine config check
2. Auth (session → EngineContext)
3. RBAC (can(user, action))
4. CSRF (double-submit token)
5. Rate limit (per-user, tier-based)
6. Quota (optional)
7. Input validation (Zod schema → typed body)
8. Handler execution
9. Audit log (after successful handler, fire-and-forget)

**Prüfkriterien:**
- [ ] Ist die Guard-Chain korrekt? (Reihenfolge, Short-Circuit, Error-Response)
- [ ] Ist die Zod-Validation korrekt? (Body, Query, typed output)
- [ ] Ist die Error-Handling korrekt? (AppError, ValidationError, RateLimitError, QuotaError)
- [ ] Ist die Rate-Limit-Integration korrekt? (Tier-basiert, per-user)
- [ ] Ist die Quota-Integration korrekt? (Vor Handler, nicht danach)
- [ ] Ist die Audit-Integration korrekt? (Nach Handler, fire-and-forget)
- [ ] Ist die CSRF-Integration korrekt? (Skip für exempt routes)
- [ ] Ist die maxDuration-Konfiguration korrekt? (Vercel Function Timeout)

### 1.7 DMS (Document Management System)

**Dateien:**
- `src/lib/dms/index.ts` (54 Zeilen) — Abstraktes Interface
- `src/lib/dms/imanager.ts` (4091 bytes) — iManage Connector
- `src/lib/dms/netdocuments.ts` (4526 bytes) — NetDocuments Connector

**Prüfkriterien:**
- [ ] Ist das DMS-Interface korrekt? (search, getDocument, getFolderContents, importToBrain)
- [ ] Ist der iManage-Connector korrekt? (API-Auth, Search, Document-Fetch, Import)
- [ ] Ist der NetDocuments-Connector korrekt? (API-Auth, Search, Document-Fetch, Import)
- [ ] Ist die Konfiguration korrekt? (DMS_PROVIDER, DMS_BASE_URL, DMS_API_KEY/CLIENT_ID/SECRET)
- [ ] Ist die Import-to-Brain-Funktion korrekt? (DMSDocument → Brain-Page via Engine)
- [ ] Ist das Error-Handling korrekt? (API-Errors, Network-Timeouts, Auth-Failures)

### 1.8 Collaboration Features

**Dateien:**
- `src/lib/approval.ts` (80 Zeilen) — Vier-Augen-Freigabe
- `src/lib/comments.ts` — Kommentierung
- `src/lib/realtime.ts` (135 Zeilen) — WebSocket Real-time Sync

**Prüfkriterien Approval:**
- [ ] Ist die Vier-Augen-Freigabe korrekt? (pending → approved/rejected, target_slug, proposed_by, decided_by)
- [ ] Sind die Action-Types korrekt? (document_finalize, deadline_create, booking_create, message_send)
- [ ] Ist die `REQUIRES_APPROVAL`-Set korrekt? (Alle 4 Action-Types require approval)
- [ ] Ist die EU-AI-Act-Annex-III-Compliance korrekt? (Human oversight für risikoreiche Aktionen)
- [ ] Ist die Berufsrechtliche-Compliance korrekt? (Anwaltliche Letztverantwortung)

**Prüfkriterien Comments:**
- [ ] Ist die Kommentierungs-Funktion korrekt? (Create, Read, Delete, Reply)
- [ ] Ist die Page-Level-Kommentierung korrekt? (Brain-Page → Comments)
- [ ] Ist die User-Attribution korrekt? (Author, Timestamp)
- [ ] Ist die Notification korrekt? (@mention → Notification)

**Prüfkriterien Real-time:**
- [ ] Ist die WebSocket-Implementierung korrekt? (Native WS, Auto-Reconnect, Exponential Backoff)
- [ ] Sind die Events korrekt? (case.updated, deadline.changed, note.added, invoice.created)
- [ ] Ist die Auth korrekt? (Token-based WS-Auth)
- [ ] Ist das Graceful-Degradation korrekt? (Kein WS-URL → skip, Max-Reconnect → give up)
- [ ] Ist die Message-Queue korrekt? (Pending messages while disconnected)

### 1.9 Marketing / Landing Pages / SEO

**Seiten unter `src/app/`:**
- `page.tsx` (1064 bytes) — Landing Page
- `pricing/` — Pricing Page
- `features/` — Features Page
- `compare/` — Comparison Page
- `de/` (19 items) — Deutsche Landing Pages
- `docs/` — Documentation
- `download/` — Download Page
- `partners/` — Partner Page
- `security/` — Security Page
- `imprint/` — Impressum
- `privacy/` — Datenschutz
- `terms/` — AGB
- `whatsapp/` — WhatsApp Landing
- `join/` — Join/Onboarding
- `portal/` — Client Portal Landing
- `subsumio/` — Brand Page

**Prüfkriterien:**
- [ ] Ist die Landing-Page korrekt? (Hero, Features, CTA, Social Proof)
- [ ] Ist die Pricing-Page korrekt? (Plan-Vergleich, Features, CTA, FAQ)
- [ ] Ist die SEO-Optimierung korrekt? (Metadata, sitemap.ts, robots.ts, OpenGraph, Structured Data)
- [ ] Ist die i18n korrekt? (DE/EN, `de/` Subdirectory, hreflang)
- [ ] Ist die Performance korrekt? (LCP, FID, CLS, Image-Optimization)
- [ ] Ist die Conversion-Optimierung korrekt? (CTA-Placement, Form-Design, Trust-Signals)
- [ ] Sind rechtliche Seiten korrekt? (Impressum, Datenschutz, AGB — DSGVO-konform)

### 1.10 Deployment & DevOps

**Dateien:**
- `vercel.json` (25 Zeilen) — Vercel Config (Crons, Headers)
- `.github/workflows/` — CI/CD (ci.yml, e2e.yml, heavy-tests.yml)
- `server/deploy/` — Server Deployment
- `playwright.config.ts` — E2E Config
- `vitest.config.ts` — Unit Test Config
- `.env.example` — Environment Variables

**Prüfkriterien Vercel:**
- [ ] Sind die Cron-Jobs korrekt? (6 Crons: deadlines, deadline-reminders, case-law, regulatory-monitors, case-scanner, retention)
- [ ] Sind die Security-Headers korrekt? (X-Frame-Options: DENY, X-Content-Type-Options: nosniff, HSTS, Referrer-Policy, Permissions-Policy)
- [ ] Ist die Cron-Auth korrekt? (CRON_SECRET Header)

**Prüfkriterien CI/CD:**
- [ ] Ist die CI-Pipeline korrekt? (Lint, Type-Check, Unit-Tests, E2E)
- [ ] Ist die E2E-Pipeline korrekt? (Playwright, Multi-Browser)
- [ ] Ist die Heavy-Tests-Pipeline korrekt? (Load-Tests, Stress-Tests)
- [ ] Ist das Pre-Commit-Hook korrekt? (Husky: lint-staged, type-check)
- [ ] Ist das Pre-Push-Hook korrekt? (Husky: tests)

**Prüfkriterien Environment:**
- [ ] Sind alle Required-Env-Vars dokumentiert? (.env.example)
- [ ] Ist die Env-Validation korrekt? (env-validate.ts — production checks)
- [ ] Sind Secrets korrekt gehandhabt? (Nie committed, Vercel Env Vars)

### 1.11 Branding-Konsistenz

**Bekanntes Problem:** 55 Vorkommen von "sigmabrain"/"SigmaBrain"/"SIGMABRAIN" in 34 Dateien unter `src/`.

**Prüfkriterien:**
- [ ] Wie viele Dateien verwenden noch "SigmaBrain" statt "Subsumio"?
- [ ] Sind User-facing Strings alle auf "Subsumio" geändert?
- [ ] Sind Code-internalen Bezeichner (Env-Vars: `SIGMABRAIN_*`) geändert oder dokumentiert als Backward-Compat?
- [ ] Ist die Capacitor-App-ID korrekt? (`com.sigmabrain.app` → `com.subsumio.app`?)
- [ ] Ist das Word-Add-In Branding korrekt? (Manifest, UI-Text)
- [ ] Sind Email-Templates korrekt? (From, Subject, Body)
- [ ] Ist die Domain korrekt? (sigmabrain.com → subsumio.com?)

### 1.12 Accessibility (WCAG 2.1 AA)

**Dateien:**
- `tests/e2e-playwright/a11y.spec.ts` — A11y E2E Tests
- `tests/e2e-playwright/accessibility.spec.ts` — Accessibility E2E Tests
- `test-results/` — Test Results (mit Screenshots von Fehlern)

**Prüfkriterien:**
- [ ] Sind die A11y-Tests korrekt? (axe-core, WCAG 2.1 AA)
- [ ] Werden alle Dashboard-Seiten getestet?
- [ ] Werden alle Interaktionen getestet? (Keyboard, Screen-Reader)
- [ ] Sind die Test-Results korrekt? (test-results/ hat fehlgeschlagene Tests — Screenshots)
- [ ] Ist die Color-Contrast-Korrektur gewährleistet? (WCAG 1.4.3)
- [ ] Ist die Focus-Order korrekt? (WCAG 2.4.3)
- [ ] Sind ARIA-Labels korrekt? (WCAG 4.1.2)
- [ ] Ist die Keyboard-Navigation korrekt? (WCAG 2.1.1)

### 1.13 PWA / Offline

**Dateien:**
- `src/lib/use-offline-sync.ts` — Offline Sync Hook
- `src/lib/offline-store.ts` — Offline Store
- `src/app/manifest.ts` — PWA Manifest
- `src/components/pwa/` — PWA Komponenten

**Prüfkriterien:**
- [ ] Ist die PWA-Implementierung korrekt? (Manifest, Service-Worker, Install-Prompt)
- [ ] Ist die Offline-Sync korrekt? (Local mutations → Queue → Sync on online)
- [ ] Ist der Offline-Store korrekt? (IndexedDB/localStorage, Conflict-Resolution)
- [ ] Ist die Cache-Strategie korrekt? (Cache-First für Static, Network-First für Dynamic)
- [ ] Ist die Install-Prompt korrekt? (BeforeInstallPrompt, iOS Instructions)

### 1.14 API Routes (115+ Endpoints)

**Unter `src/app/api/`:**

| Bereich | Endpoints | Funktion |
|---------|-----------|----------|
| auth | 15 | login, signup, logout, 2fa, sso, forgot, reset, verify, me |
| legal | 18 | analyze, contract-draft, redline, review, due-diligence, risk, memo, summarize, rvg, statute, etc. |
| scim | 6 | Users, Groups, status, sync |
| billing | 2 | checkout, webhook |
| cron | 6 | deadlines, reminders, case-law, regulatory, case-scanner, retention |
| docusign | 6 | webhook, auth, templates, send, status, callback |
| email | 5 | send, receive, dev-catch, mailbox, templates |
| connectors | 3 | google, dropbox, bea |
| org | 4 | create, invite, members, settings |
| portal | 5 | client-portal endpoints |
| dms | 3 | search, import, folders |
| agents | 2 | list, detail |
| agent-templates | 3 | list, create, detail |
| api-keys | 2 | list, create/revoke |
| settings | 4 | kanzlei, ai-model, security, scim |
| team | 2 | list, invite |
| whatsapp | 2 | webhook, send |
| pages | 2 | list, detail |
| search | 1 | hybrid search |
| think | 1 | think pipeline |
| upload | 1 | file upload |
| usage | 1 | usage metering |
| stats | 1 | dashboard stats |
| audit | 1 | audit log |
| comments | 1 | comments |
| approvals | 1 | approvals |
| brains | 1 | brain management |
| graph | 1 | graph data |
| queries | 1 | query history |
| rag-eval | 1 | RAG evaluation |
| health | 1 | health check |
| internal | 1 | revocation check |
| time | 1 | time tracking |
| data-export | 2 | export, download |
| invoices | 3 | list, create, detail |
| marketing-agent | 1 | marketing agent |
| demo | 1 | demo data |
| webhook | 1 | incoming webhook |

**Prüfkriterien (übergreifend):**
- [ ] Sind alle API-Routes über `createHandler` gewrappt? (Auth + RBAC + CSRF + Rate-Limit + Quota + Audit)
- [ ] Sind alle API-Routes typed? (Zod-Schema für Body + Query)
- [ ] Sind alle API-Routes error-handled? (AppError, ValidationError, etc.)
- [ ] Sind alle API-Routes audited? (AuditSpec in HandlerOptions)
- [ ] Sind alle API-Routes rate-limited? (rateTier: standard | heavy)
- [ ] Sind alle API-Routes quota-checked? (quota: queries | uploads | pages)
- [ ] Sind die Cron-Routes korrekt abgesichert? (CRON_SECRET, nicht Session)
- [ ] Sind die Webhook-Routes korrekt abgesichert? (Signature-Verification, nicht Session)

---

## 2. PRÜFKRITERIEN (übergreifend)

### 2.1 User Experience (UX)

- [ ] Ist der First-Run-Experience korrekt? (Signup → Onboarding → First-Query → Value)
- [ ] Ist der Empty-State-Experience korrekt? (Keine Daten → hilfreiche Message + CTA)
- [ ] Ist der Error-State-Experience korrekt? (Error → Message + Retry + Support-Link)
- [ ] Ist der Loading-State-Experience korrekt? (Skeleton → Content, kein Layout-Shift)
- [ ] Ist die Mobile-Experience korrekt? (Touch-Targets, Swipe-Gestures, Responsive)
- [ ] Ist die Tablet-Experience korrekt? (Zweispaltig, Touch + Keyboard)
- [ ] Ist die Desktop-Experience korrekt? (Multi-Column, Keyboard-Shortcuts, Command-Palette)
- [ ] Ist die Notification-Experience korrekt? (Toast, Email, Push — nicht spammy)
- [ ] Ist die Onboarding-Tour korrekt? (Feature-Tour, Tooltips, Progress)

### 2.2 Performance

- [ ] Ist die LCP (Largest Contentful Paint) < 2.5s?
- [ ] Ist die FID (First Input Delay) < 100ms?
- [ ] Ist die CLS (Cumulative Layout Shift) < 0.1?
- [ ] Ist die Code-Splitting korrekt? (Route-basiert, Lazy-Loading)
- [ ] Ist die Image-Optimization korrekt? (next/image, WebP, AVIF, responsive)
- [ ] Ist die Font-Optimization korrekt? (next/font, subset, preload)
- [ ] Ist die Bundle-Size korrekt? (Keine oversized bundles, Tree-shaking)
- [ ] Ist die SSR/ISR korrekt? (Static wo möglich, Dynamic wo nötig)

### 2.3 Security

- [ ] Ist die XSS-Prevention korrekt? (React auto-escaping, CSP, no dangerouslySetInnerHTML)
- [ ] Ist die SQL-Injection-Prevention korrekt? (Parameterized queries, pg pool)
- [ ] Ist die CSRF-Prevention korrekt? (Double-Submit, SameSite cookies)
- [ ] Ist die XSS-in-Markdown-Prevention korrekt? (Sanitize rendered markdown)
- [ ] Ist die File-Upload-Security korrekt? (MIME-Type check, size limit, virus scan)
- [ ] Ist die Rate-Limiting ausreichend? (Auth: strict, API: tier-based)
- [ ] Ist die Secret-Management korrekt? (Env-Vars, encrypted at rest, never client-side)
- [ ] Ist die CORS korrekt? (Same-Origin, explicit allow-list)
- [ ] Ist die CSP (Content-Security-Policy) korrekt? (vercel.json headers — fehlt CSP!)
- [ ] Sind die Cookie-Attributes korrekt? (httpOnly, secure, sameSite, maxAge)

### 2.4 Data Privacy (DSGVO)

- [ ] Ist die DSGVO-Compliance korrekt? (Einwilligung, Auskunft, Löschung, Berichtigung)
- [ ] Ist die Cookie-Consent korrekt? (RefConsentBanner — § 25 TTDSG)
- [ ] Ist die Data-Export-Funktion korrekt? (Art. 15 DSGVO — Auskunftsersuchen)
- [ ] Ist die Data-Deletion-Funktion korrekt? (Art. 17 DSGVO — Recht auf Vergessenwerden)
- [ ] Ist die Data-Retention-Policy korrekt? (Cron: /api/cron/retention — welche Policy?)
- [ ] Ist die Privacy-Page korrekt? (Datenschutzerklärung, DSGVO-konform)
- [ ] Ist die Terms-Page korrekt? (AGB, rechtliche Rahmenbedingungen)
- [ ] Ist die Imprint-Page korrekt? (Impressum, § 5 TMG / § 14 MStV)

### 2.5 Multi-Tenant-Isolation (SaaS-Layer)

- [ ] Ist die Brain-Isolation korrekt? (Jeder User/Org hat eigenen brainId, Engine-Header `x-subsumio-source`)
- [ ] Ist die Org-Membership korrekt? (User → orgId → shared brainId)
- [ ] Ist die Data-Isolation korrekt? (Keine Cross-Org-Leaks in API-Routes)
- [ ] Ist die Audit-Isolation korrekt? (Audit-Log scoped by brain_id)
- [ ] Ist die Quota-Isolation korrekt? (Quota scoped by brain_id)
- [ ] Ist die Usage-Isolation korrekt? (Usage scoped by brain_id)

---

## 3. ARCHITEKTUR-DIAGRAMM (SaaS Layer)

```
Browser / Mobile / Word-Add-In
  ↓
Vercel Edge (Middleware: Auth + CSRF + Security Headers)
  ↓
Next.js App Router (SSR/ISR)
  ├── Marketing Pages (Landing, Pricing, Features, Compare)
  ├── Auth Pages (Login, Signup, Forgot, Reset, 2FA)
  ├── Dashboard (50+ Seiten, Kanzlei-OS)
  ├── Admin (Mailbox, User-Management)
  └── API Routes (115+ Endpoints)
       ↓
  createHandler Guard-Chain:
  1. Engine config check
  2. Auth (Session → EngineContext)
  3. RBAC (can(user, action))
  4. CSRF (double-submit)
  5. Rate limit (per-user, tier)
  6. Quota (queries, uploads, pages)
  7. Zod validation (body, query)
  8. Handler execution
  9. Audit log (fire-and-forget)
       ↓
  Subsumio Brain Engine (Server)
  ├── Engine Proxy (src/lib/engine.ts)
  ├── Auth Store (Postgres / JSON-File)
  ├── Audit Trail (Postgres, hash-chained)
  ├── Usage Metering (Postgres / JSON-File)
  ├── Quota Tracking (Postgres / JSON-File)
  └── Encryption (AES-256-GCM at rest)
       ↓
  External Services:
  ├── Stripe (Billing)
  ├── WorkOS (SSO/SCIM)
  ├── Upstash Redis (Rate-Limit)
  ├── Postgres (Auth, Audit, Usage, Quota)
  ├── iManage / NetDocuments (DMS)
  ├── DocuSign (Signature)
  ├── WhatsApp (Messaging)
  ├── beA (Anwaltsportal)
  └── Google / Dropbox (Connectors)
```

---

## 4. BEKANNTE GAPS & RISIKEN (zu verifizieren)

### 4.1 Frontend/Dashboard Gaps

| # | Gap | Severity | Beschreibung |
|---|-----|----------|--------------|
| F1 | Kein Undo/Redo für Page-Edits | 🟡 | Brain-Pages können editiert werden, aber kein Undo |
| F2 | Keine Bulk-Actions in Data Table | 🟡 | Massen-Aktionen (Bulk-Delete, Bulk-Tag) fehlen |
| F3 | Keine Advanced-Search in Brain | 🟡 | Nur einfache Search, keine Boolean/Filter-Search |
| F4 | Keine Drag-and-Drop-Reihenfolge | 🟡 | Case-Liste, Deadline-Liste nicht sortierbar per Drag |
| F5 | Keine Custom-Dashboard-Widgets | 🟡 | Dashboard ist statisch, keine personalisierbaren Widgets |
| F6 | Keine Notification-Center | 🟡 | Keine zentrale Notification-Übersicht |

### 4.2 Auth & Security Gaps

| # | Gap | Severity | Beschreibung |
|---|-----|----------|--------------|
| A1 | Keine CSP (Content-Security-Policy) | 🔴 | vercel.json hat keine CSP-Header — XSS-Schutz-Lücke |
| A2 | Revocation fail-open | 🟡 | Revocation-Check bei Network-Error → return 0 = valid (Zeile 56) |
| A3 | Session-TTL 30 Tage | 🟡 | Lange Session-Lebensdauer, kein Refresh-Token |
| A4 | Keine Account-Lockout-Policy | 🟡 | Rate-Limit drosselt, aber kein automatisches Lockout |
| A5 | Dev-Encryption-Key hardcoded | 🟡 | `subsumio-dev-encryption-key-32chars!` in encryption.ts |

### 4.3 Billing & Quota Gaps

| # | Gap | Severity | Beschreibung |
|---|-----|----------|--------------|
| B1 | Quota ist soft-gating only | 🟡 | V1: warn, nicht block — User kann über Limit gehen |
| B2 | Keine Stripe-Customer-Portal-Integration | 🟡 | User kann nicht selbst Plan verwalten/kündigen |
| B3 | Keine Proration-Logic | 🟡 | Upgrade/Downgrade-Proration nicht implementiert |
| B4 | Keine Invoice-Generation via Stripe | 🟡 | Invoices sind separat, nicht Stripe-native |
| B5 | Enterprise-Plan ohne Self-Serve | 🟡 | Enterprise erfordert Sales-Contact, kein Self-Serve |

### 4.4 Collaboration Gaps

| # | Gap | Severity | Beschreibung |
|---|-----|----------|--------------|
| C1 | Real-time ohne WS-Backend | 🟡 | WS_URL leer → Real-time deaktiviert, kein WS-Server |
| C2 | Keine @mention-Notifications | 🟡 | Comments haben kein @mention-System |
| C3 | Keine Activity-Feed | 🟡 | Kein zentraler Activity-Stream für Team |
| C4 | Keine Assignment-Workflow | 🟡 | Cases/Deadlines können nicht zugewiesen werden |

### 4.5 Branding Gaps

| # | Gap | Severity | Beschreibung |
|---|-----|----------|--------------|
| D1 | 55 Vorkommen "SigmaBrain" in 34 Dateien | 🔴 | Branding-Inkonsistenz |
| D2 | Env-Vars verwenden `SIGMABRAIN_*` Prefix | 🟡 | `SIGMABRAIN_DATA_DIR`, `SIGMABRAIN_AUTH_DATABASE_URL`, `SIGMABRAIN_ENCRYPTION_KEY` |
| D3 | Capacitor App-ID `com.sigmabrain.app` | 🟡 | App-Store-Branding falsch |
| D4 | Word-Add-In verwendet "SigmaBrain" | 🟡 | Manifest + Code |
| D5 | Audit-Tabelle heißt `subsumio_audit_log` | ✅ | Korrekt! |
| D6 | Usage-Tabelle heißt `subsumio_usage` | ✅ | Korrekt! |

### 4.6 Deployment Gaps

| # | Gap | Severity | Beschreibung |
|---|-----|----------|--------------|
| E1 | Keine CSP-Header | 🔴 | vercel.json: X-Frame-Options, HSTS, etc. — aber keine CSP |
| E2 | Keine Monitoring-Integration | 🟡 | Kein Sentry, Datadog, oder ähnliches |
| E3 | Keine Error-Alerting | 🟡 | Kein Error-Alerting für Production-Incidents |
| E4 | test-results/ hat fehlgeschlagene A11y-Tests | 🟡 | Screenshots von Fehlern vorhanden |
| E5 | Kein Staging-Environment dokumentiert | 🟡 | Kein Staging-Setup |

---

## 5. TEST-COVERAGE-PRÜFUNG (SaaS Layer)

### 5.1 Vorhandene Tests

| Test-File | Bereich | Coverage |
|---|---|---|
| `src/lib/auth/password.test.ts` | Password Hashing | ✅ |
| `src/lib/auth/rate-limit.test.ts` | Rate Limiting | ✅ |
| `src/lib/auth/session.test.ts` | Session Management | ✅ |
| `src/lib/permissions.test.ts` | RBAC | ✅ |
| `src/lib/encryption.test.ts` | Encryption | ✅ |
| `src/lib/legal-deadlines.test.ts` | Fristen | ✅ |
| `src/lib/ai-deadline-detect.test.ts` | Fristen-Erkennung | ✅ |
| `src/lib/gobd.test.ts` | GoBD | ✅ |
| `src/lib/gobd-verfahrensdoku.test.ts` | Verfahrensdoku | ✅ |
| `src/lib/rvg.test.ts` | RVG | ✅ |
| `src/lib/search-params.test.ts` | Search Params | ✅ |
| `src/components/ui/button.test.tsx` | Button Component | ✅ |
| `tests/e2e-playwright/a11y.spec.ts` | Accessibility E2E | ✅ |
| `tests/e2e-playwright/accessibility.spec.ts` | Accessibility E2E | ✅ |
| `tests/e2e-playwright/auth-flow.spec.ts` | Auth Flow E2E | ✅ |
| `tests/e2e/kanzlei-smoke.mjs` | Kanzlei Smoke Test | ✅ |

### 5.2 Fehlende Tests

| Bereich | Status |
|---|---|
| Dashboard-Seiten (50+) | ❌ Keine E2E-Tests für einzelne Seiten |
| API Routes (115+) | ❌ Keine Integration-Tests für Routes |
| Billing/Checkout-Flow | ❌ |
| Stripe-Webhook | ❌ |
| SCIM-Endpoints | ❌ |
| DMS-Connectors | ❌ |
| Real-time/WebSocket | ❌ |
| Approval-Workflow | ❌ |
| Comments | ❌ |
| Quota-Enforcement | ❌ |
| Usage-Metering | ❌ |
| Audit-Trail (hash-chain) | ❌ |
| CSRF-Token-Flow | ❌ |
| 2FA-Flow (TOTP, Backup-Codes) | ❌ |
| SSO-Flow (WorkOS) | ❌ |
| Password-Reset-Flow | ❌ |
| Email-Verification-Flow | ❌ |
| Org-Membership | ❌ |
| Data-Export | ❌ |
| PWA/Offline-Sync | ❌ |
| Command-Palette | ❌ |
| Agent-Builder | ❌ |
| Data-Table (Sort/Filter/Pagination) | ❌ |
| UI-Komponenten (45 Komponenten, nur 1 Test) | ❌ |

---

## 6. DEFINITION OF DONE

Der SaaS-Applikationsschicht-Audit ist abgeschlossen, wenn beantwortet ist:

1. **Ist das Dashboard production-ready für Kanzlei-Alltag?** (50+ Seiten, UX, Performance)
2. **Ist die Auth & Security-Schicht production-ready?** (Session, 2FA, RBAC, CSRF, Encryption, Rate-Limit)
3. **Ist das Billing-System korrekt?** (Stripe, Plans, Quota, Usage)
4. **Ist die API-Handler-Architektur korrekt?** (9-Schicht Guard-Chain)
5. **Ist die Audit-Trail korrekt?** (Hash-Chain, Multi-Tenant, Fire-and-Forget)
6. **Sind Collaboration-Features production-ready?** (Approval, Comments, Real-time)
7. **Ist die DMS-Integration korrekt?** (iManage, NetDocuments)
8. **Ist die SCIM/SSO-Integration korrekt?** (WorkOS, Enterprise)
9. **Ist die Deployment-Pipeline korrekt?** (Vercel, CI/CD, Cron-Jobs, Security-Headers)
10. **Ist die Branding-Konsistenz hergestellt?** (SigmaBrain → Subsumio)
11. **Ist die Accessibility korrekt?** (WCAG 2.1 AA, E2E-Tests)
12. **Ist die DSGVO-Compliance korrekt?** (Auskunft, Löschung, Cookie-Consent)
13. **Ist die Multi-Tenant-Isolation durchgängig korrekt?** (brainId, Org, Quota, Audit, Usage)
14. **Ist die Test-Coverage ausreichend?** (Unit, Integration, E2E)

---

## 7. AUSGABEFORMAT

### 7.1 SaaS-Layer Executive Summary
- Gesamtbewertung SaaS Layer (Production-Ready %)
- Frontend/Dashboard Score
- Auth & Security Score
- Billing & Quota Score
- API-Architektur Score
- Collaboration Score
- Deployment Score
- Branding Score
- Accessibility Score

### 7.2 Bereich-Weise Detail-Analyse
Pro Bereich:
- Status (Production-Ready / Beta / Alpha)
- Funktionalität
- Test-Coverage
- Gefundene Issues
- Empfohlene Aktionen

### 7.3 Gap-Analyse (SaaS-spezifisch)
- Fehlende Frontend-Features
- Security-Lücken
- Billing-Lücken
- Collaboration-Lücken
- Branding-Inkonsistenzen
- Deployment-Risiken
- Test-Coverage-Lücken

### 7.4 Priorisierte Action-Items
| Priority | Item | Bereich | Aufwand | Impact |
|----------|------|--------|---------|--------|
| P0 | ... | ... | S/M/L | ... |
| P1 | ... | ... | S/M/L | ... |

### 7.5 Production-Readiness-Matrix
| Bereich | Status | Blocker | Aufwand bis Production-Ready |
|---------|--------|---------|---------------------------|
| Frontend | ❓ | ... | ... |
| Auth | ❓ | ... | ... |
| Billing | ❓ | ... | ... |
| ... | ... | ... | ... |

---

## 8. KONTEXT-DATEIEN

### Frontend / Dashboard
- `src/app/dashboard/` — 50+ Seiten
- `src/app/dashboard/layout.tsx` — Dashboard Layout
- `src/app/dashboard/page.tsx` — Dashboard Home (19201 bytes)
- `src/components/dashboard/` — 12 Kern-Komponenten
- `src/components/ui/` — 45 UI-Komponenten (shadcn/ui)
- `src/app/globals.css` — Theme (26536 bytes)

### Auth & Security
- `src/lib/auth/session-core.ts` — Edge-safe Session (139 Zeilen)
- `src/lib/auth/session.ts` — Node Session
- `src/lib/auth/store.ts` — User/Org Store (538 Zeilen)
- `src/lib/auth/tokens.ts` — Action Tokens (98 Zeilen)
- `src/lib/auth/password.ts` — Password Hashing
- `src/lib/auth/rate-limit.ts` — Rate Limiter (168 Zeilen)
- `src/lib/auth/backup-codes.ts` — 2FA Backup Codes
- `src/lib/auth/revocation-store.ts` — Session Revocation
- `src/lib/csrf.ts` — CSRF (82 Zeilen)
- `src/lib/encryption.ts` — AES-256-GCM (138 Zeilen)
- `src/middleware.ts` — Edge Middleware (85 Zeilen)
- `src/lib/permissions.ts` — RBAC Matrix (173 Zeilen)
- `src/lib/scim.ts` — SCIM 2.0
- `src/lib/totp.ts` — TOTP
- `src/lib/workos.ts` — WorkOS SSO

### Billing & Quota
- `src/lib/billing/plans.ts` — Plan-Definitionen (89 Zeilen)
- `src/lib/plans.ts` — Plan-Limits + Quota (234 Zeilen)
- `src/lib/usage.ts` — Usage Metering (147 Zeilen)
- `src/app/api/billing/checkout/route.ts` — Stripe Checkout
- `src/app/api/billing/webhook/route.ts` — Stripe Webhook

### API-Architektur
- `src/lib/api-handler.ts` — Central Handler (445 Zeilen)
- `src/lib/api.ts` — API Client
- `src/lib/api-response.ts` — Response Helpers
- `src/lib/engine.ts` — Engine Proxy
- `src/lib/errors.ts` — Error Types
- `src/lib/rate-limit-api.ts` — Rate Limit API Helper

### Audit
- `src/lib/audit.ts` — Audit Trail (222 Zeilen)
- `src/lib/audit-labels.ts` — Audit Labels

### Collaboration
- `src/lib/approval.ts` — Vier-Augen-Freigabe (80 Zeilen)
- `src/lib/comments.ts` — Kommentierung
- `src/lib/realtime.ts` — WebSocket Sync (135 Zeilen)

### DMS
- `src/lib/dms/index.ts` — DMS Interface (54 Zeilen)
- `src/lib/dms/imanager.ts` — iManage Connector
- `src/lib/dms/netdocuments.ts` — NetDocuments Connector

### Marketing / SEO
- `src/app/page.tsx` — Landing Page
- `src/app/pricing/` — Pricing
- `src/app/features/` — Features
- `src/app/compare/` — Compare
- `src/app/de/` — Deutsche Seiten (19 items)
- `src/app/sitemap.ts` — Sitemap
- `src/app/robots.ts` — Robots
- `src/app/manifest.ts` — PWA Manifest
- `src/content/` — Content Files

### Deployment
- `vercel.json` — Vercel Config
- `.github/workflows/` — CI/CD (ci.yml, e2e.yml, heavy-tests.yml)
- `.husky/` — Git Hooks
- `playwright.config.ts` — E2E Config
- `vitest.config.ts` — Unit Test Config
- `.env.example` — Env Vars
- `src/lib/env-validate.ts` — Env Validation

### PWA / Offline
- `src/lib/use-offline-sync.ts` — Offline Sync
- `src/lib/offline-store.ts` — Offline Store
- `src/app/manifest.ts` — PWA Manifest
- `src/components/pwa/` — PWA Components

### Accessibility
- `tests/e2e-playwright/a11y.spec.ts` — A11y Tests
- `tests/e2e-playwright/accessibility.spec.ts` — Accessibility Tests
- `test-results/` — Test Results

### API Routes (115+)
- `src/app/api/` — 38 Endpoint-Gruppen
- `src/app/api/auth/` — 15 Auth-Endpoints
- `src/app/api/legal/` — 18 Legal-Endpoints
- `src/app/api/scim/` — 6 SCIM-Endpoints
- `src/app/api/cron/` — 6 Cron-Endpoints
- `src/app/api/billing/` — 2 Billing-Endpoints
- `src/app/api/docusign/` — 6 DocuSign-Endpoints
- `src/app/api/email/` — 5 Email-Endpoints
- `src/app/api/org/` — 4 Org-Endpoints
- `src/app/api/portal/` — 5 Portal-Endpoints
- `src/app/api/connectors/` — 3 Connector-Endpoints
- `src/app/api/dms/` — 3 DMS-Endpoints
- `src/app/api/settings/` — 4 Settings-Endpoints
- `src/app/api/team/` — 2 Team-Endpoints
- `src/app/api/invoices/` — 3 Invoice-Endpoints
- `src/app/api/agents/` — 2 Agent-Endpoints
- `src/app/api/agent-templates/` — 3 Agent-Template-Endpoints
- `src/app/api/2fa/` — 4 2FA-Endpoints

---

## 9. AUDIT-MODUS

### Phase 1: Frontend-Inspection
Lese alle Dashboard-Seiten und Kern-Komponenten. Prüfe UX-Konsistenz, Loading/Empty/Error-States, Responsive-Design.

### Phase 2: Security-Audit
Trace die komplette Guard-Chain: Middleware → Session → RBAC → CSRF → Rate-Limit → Quota → Handler. Prüfe jede Schicht auf Bypass-Möglichkeiten.

### Phase 3: API-Audit
Prüfe alle 115+ API-Routes: Sind sie über `createHandler` gewrappt? Sind Zod-Schemas korrekt? Sind Audit-Specs vorhanden?

### Phase 4: Billing-Audit
Trace den kompletten Billing-Flow: Checkout → Stripe → Webhook → Plan-Update → Quota-Enforcement.

### Phase 5: Multi-Tenant-Audit
Prüfe brainId-Isolation durch alle Schichten: Auth → API → Engine → Audit → Quota → Usage.

### Phase 6: Branding-Audit
Zähle alle "SigmaBrain"-Vorkommen. Prüfe User-facing Strings, Code-Internal, Env-Vars, App-IDs.

### Phase 7: Accessibility-Audit
Prüfe A11y-Test-Results. Führe axe-core auf allen Dashboard-Seiten aus.

### Phase 8: Test-Coverage-Audit
Prüfe welche der 115+ API-Routes und 50+ Dashboard-Seiten Test-Coverage haben.

### Phase 9: Final Report
Erstelle den Audit-Report im Format aus §7.

---

*Dieser Prompt fokussiert auf die SaaS-Applikationsschicht und ergänzt Audit 1 (Ingestion) und Audit 2 (Intelligence). Zusammen decken alle drei Audits die komplette Subsumio-Plattform ab: Brain-Engine (Ingestion + Intelligence) + SaaS-Hülle (Frontend, Auth, Billing, Admin, Deployment).*
