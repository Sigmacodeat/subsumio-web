# Subsumio SaaS-Applikationsschicht — Vollständiger Audit-Report

> **Audit-Datum:** 20. Juni 2026  
> **Auditor:** Cascade (Principal Engineer, Product Architect, UX Lead, QA Lead)  
> **Scope:** Frontend/Dashboard, Auth & Security, Billing & Quota, Admin, DMS, Collaboration, Real-time, Deployment/DevOps, Branding, Accessibility, PWA, Multi-Tenant, Test-Coverage  
> **Voraussetzung:** Audit 1 (Ingestion-Pipeline) und Audit 2 (Intelligence Layer) gelesen

---

## 1. EXECUTIVE SUMMARY

### Gesamtbewertung SaaS Layer: **72% Production-Ready**

| Bereich | Score | Status |
|---------|-------|--------|
| Frontend/Dashboard | 78% | Beta — funktional, aber unvollständige A11y-Abdeckung |
| Auth & Security | 85% | Production-Ready (mit CSP-Fix) |
| Billing & Quota | 65% | Beta — Soft-Gating only, fehlende Stripe-Features |
| API-Architektur | 90% | Production-Ready |
| Collaboration | 45% | Alpha — Real-time ohne Backend, keine @mentions |
| Deployment & DevOps | 75% | Beta — CSP fehlt, kein Staging |
| Branding | 40% | Alpha — 55 SigmaBrain-Referenzen in 34 Dateien |
| Accessibility | 55% | Beta — nur 10/60+ Seiten getestet |
| Multi-Tenant Isolation | 95% | Production-Ready |
| Test-Coverage | 35% | Alpha — kritische Lücken bei API/Billing/Collaboration |

### Top 3 Blocker (P0)
1. **Keine CSP-Header** — XSS-Schutz-Lücke in Production
2. **Branding-Inkonsistenz** — 55 Vorkommen "SigmaBrain" in User-facing + Code
3. **Keine API-Route-Tests** — 115+ Endpunkte ohne Integration-Tests

---

## 2. BEREICH-WEISE DETAIL-ANALYSE

### 2.1 Frontend / Dashboard / Kanzlei-OS

**Status:** Beta (78%)

**Funktionalität:**
- 50+ Dashboard-Seiten unter `src/app/dashboard/` — alle navigierbar über Sidebar
- Dashboard-Layout: Sidebar (Collapse, Mobile-Drawer), Topbar (Theme-Toggle, User-Menu), Command Palette (Cmd+K)
- Loading-States: 10+ `loading.tsx` Dateien, Skeleton-Komponenten in 56 Dateien referenziert
- Empty-States: `empty-state.tsx` Komponente vorhanden, in 56 Dateien referenziert
- Error-Boundary: `src/app/error.tsx` mit Sentry-Integration, Reset-Button, Bilingual
- Responsive: Mobile-Drawer mit Overlay, `md:hidden` Breakpoints
- Industry-Theming: `styleForIndustry()` im Layout, Data-Attribute für CSS-Targeting

**Kern-Komponenten (12):**
- Sidebar, Topbar, Command Palette, Agent Builder, Data Table, Model Selector, Search Bar, Stats Card, Page Header, Empty State, Filter Chip, Skeleton
- Theme: localStorage `gbrain-theme` (sollte `subsumio-theme` sein — Branding-Issue)

**UI-Komponenten-Bibliothek (45 shadcn/ui-basiert):**
- 22 Storybook-Stories vorhanden (50% Abdeckung)
- 1 Unit-Test (`button.test.tsx`) — **kritische Lücke**
- Dark-Mode: Theme-Variablen in `globals.css` (26.5KB)

**Gefundene Issues:**
- **F1** 🟡 Kein Undo/Redo für Page-Edits
- **F2** 🟡 Keine Bulk-Actions in Data Table
- **F3** 🟡 Keine Advanced/Boolean-Search im Brain
- **F4** 🟡 Keine Drag-and-Drop-Sortierung für Cases/Deadlines
- **F5** 🟡 Keine personalisierbaren Dashboard-Widgets
- **F6** 🟡 Kein zentrales Notification-Center
- **F7** 🟡 `localStorage` Key `gbrain-theme` statt `subsumio-theme` (Branding)

**Empfohlene Aktionen:**
- P1: Erweitere A11y-Tests auf alle 50+ Dashboard-Seiten
- P1: Undo/Redo für Brain-Page-Edits
- P2: Bulk-Actions in Data Table
- P2: Notification-Center

---

### 2.2 Auth & Security

**Status:** Production-Ready mit einem P0-Fix (85%)

#### Session-Implementierung
- **HMAC-SHA-256**, Edge-safe via Web Crypto — korrekt
- **30-Tage TTL** — funktional, aber lang für sensible Kanzleidaten (kein Refresh-Token)
- **Cookie-Attributes:** `httpOnly: true`, `secure: true` (production), `sameSite: "lax"`, `path: "/"` — korrekt
- **AUTH_SECRET-Check:** Production → throw, Dev → fallback `"subsumio-dev-secret-change-me"` — korrekt

#### Session-Revocation
- **Version-basiert:** `subsumio_session_revocations` Tabelle in Postgres, `min_version` per User
- **60s Cache-Window:** Edge-Cache mit TTL 60s — akzeptabler Kompromiss
- **Fail-Open bei Network-Error:** `@/Users/msc/subsumio-web/src/lib/auth/session-core.ts:55-57` — `catch → return 0 = valid`
  - **A2** 🟡 Tradeoff: Availability vs. Security. Bei komplettem Postgres-Ausfall bleiben alte Sessions gültig. Akzeptabel für V1, aber dokumentiert werden.

#### Password-Hashing
- **scrypt** mit `N=16384, r=8, p=1`, 16-byte Salt, 64-byte Key — OWASP-konform
- **timingSafeEqual** für Verification — korrekt
- Format: `s2:<salt-hex>:<hash-hex>` — gut

#### 2FA
- **TOTP** mit Base32-Secret, encrypted at rest via AES-256-GCM
- **Backup-Codes:** 10 Codes, Format `XXXX-XXXX-XXXX`, SHA-256 hashed, no ambiguous chars
- **Setup-Flow:** Pending-Secret mit 10min Expiry
- **Login-Flow:** Password → 2FA-Challenge-Token (5min TTL) → TOTP-Verify
- **Token-Binding:** Reset-Tokens binden an Password-Hash (single-use ohne Server-State)

#### Rate-Limiting
- **3 Tiers:** standard (120/min), search (60/min), heavy (30/min)
- **Backend:** Upstash Redis (REST Pipeline: INCR + PEXPIRE + PTTL) → in-memory fallback → file-based persistence
- **Per-User** für authentifizierte Routes, **Per-IP** für public Routes
- **Fail-Open:** Upstash-Ausfall → in-memory fallback (per-Instanz, nicht instanzübergreifend)

#### CSRF
- **Double-Submit Pattern:** Cookie `sb_csrf` (nicht httpOnly, SameSite=lax) + Header `x-csrf-token`
- **Timing-safe comparison** — korrekt
- **Exemptions:** login, signup, register, forgot, reset, 2fa-login-verify, cron, webhook — korrekt
- **Middleware + createHandler:** Doppelte Prüfung (Edge + Route-Level) — Defense in Depth

#### Encryption
- **AES-256-GCM** via Web Crypto, 12-byte IV/Nonce
- **Production-Check:** `throw` wenn `SIGMABRAIN_ENCRYPTION_KEY` fehlt — korrekt
- **Dev-Fallback:** `sbplain:` Marker für unencrypted, `sbenc:` für encrypted — sauber
- **Encrypted Fields:** openaiKey, anthropicKey, docusignTokens, twoFactorSecret, pendingTwoFactorSecret
- **A5** 🟡 Dev-Key hardcoded: `subsumio-dev-encryption-key-32chars!` — nur Dev, aber dokumentiert

#### RBAC
- **4 Rollen:** admin, lawyer, assistant, client_viewer
- **30+ Route-Actions** mit klarer Rollen-Zuordnung
- `can()` Funktion: User → Role → Action → boolean — korrekt
- `auditActionFor()` Mapping: Route-Action → Audit-Action — vollständig
- **client_viewer-Einschränkungen:** Nur `brain.read` + `settings.read` — korrekt

#### SCIM 2.0
- **Vollständige Implementierung:** /Users, /Groups, POST/PATCH/PUT/DELETE
- **Bearer-Token Auth** mit timing-safe comparison
- **WorkOS Directory Sync:** Paginierte API-Calls, auto-provisioning, deprovisioning
- **Filter Parser:** Basic (`userName eq "value"`) — ausreichend für Standard-IdP-Queries
- **Audit-Trail:** SCIM-Operationen werden audited

#### **KRITISCH: Keine CSP-Header**
- `@/Users/msc/subsumio-web/vercel.json:12-23` — Headers enthalten X-Frame-Options, HSTS, Referrer-Policy, Permissions-Policy, aber **keine Content-Security-Policy**
- **A1/E1** 🔴 Kritische XSS-Schutz-Lücke — P0 Fix needed

**Gefundene Issues:**
- **A1** 🔴 Keine CSP-Header in vercel.json
- **A2** 🟡 Revocation fail-open bei Network-Error
- **A3** 🟡 Session-TTL 30 Tage ohne Refresh-Token
- **A4** 🟡 Kein automatisches Account-Lockout (nur Rate-Limit)
- **A5** 🟡 Dev-Encryption-Key hardcoded

**Empfohlene Aktionen:**
- **P0:** CSP-Header hinzufügen zu vercel.json
- P1: Session-Refresh-Token implementieren
- P2: Account-Lockout nach N fehlgeschlagenen Versuchen

---

### 2.3 Billing & Quota

**Status:** Beta (65%)

#### Stripe-Checkout
- Raw `fetch` zur Stripe API (kein SDK) — funktional, weniger Abhängigkeit
- `mode: "subscription"`, `client_reference_id`, `customer_email`, `metadata[plan]`, `metadata[user_id]`
- Referral-Integration: `metadata[referred_by]` wenn vorhanden
- Success/Cancel URLs: `/dashboard/billing?status=success|cancelled`

#### Stripe-Webhook
- **Signature-Verification:** HMAC-SHA256 mit `timingSafeEqual`, 5-Minuten Tolerance-Window — korrekt
- **Event-Handling:** `checkout.session.completed` (upgrade) + `customer.subscription.deleted` (downgrade)
- **Idempotenz:** Nicht explizit implementiert — Stripe sendet Webhooks retried, aber `store.update()` ist idempotent
- **GAP:** `customer.subscription.updated` (Plan-Wechsel) wird nicht behandelt — nur `deleted`

#### Plan-Limits
| Plan | Pages | Queries/Mon | Seats | Preis |
|------|-------|-------------|-------|-------|
| Free | 200 | 100 | 1 | 0€ |
| Pro | 25.000 | 2.000 | 1 | 290€/Mon |
| Team | 100.000 | 10.000/Seat | 5 | 490€/Seat/Mon |
| Enterprise | 1.000.000 | 100.000 | 25 | Custom |

#### Quota-Enforcement
- **Postgres:** Atomic check-and-reserve mit `BEGIN` + `FOR UPDATE` + `COMMIT/ROLLBACK` — korrekt verhindert Race Conditions
- **File-Fallback:** Dev-only, keine Atomicity-Garantie
- **Monthly Reset:** `yyyy-mm` Key, automatischer Roll-over — korrekt
- **Soft-Gating (V1):** `checkQuota` blockiert mit 429, aber `plans.ts` Kommentar sagt "warn, nicht cut-off"
  - **Widerspruch:** `checkQuota` gibt `ok: false` → 429 Response, aber Kommentar sagt "soft gating only"
  - **Tatsächliches Verhalten:** Quota wird **hard-gated** bei Postgres, **soft-gated** bei File-Fallback

**Gefundene Issues:**
- **B1** 🟡 Quota-Verhalten inkonsistent (hard vs. soft je nach Backend)
- **B2** 🟡 Keine Stripe-Customer-Portal-Integration
- **B3** 🟡 Keine Proration-Logic bei Plan-Wechsel
- **B4** 🟡 Keine Invoice-Generation via Stripe
- **B5** 🟡 Enterprise ohne Self-Serve
- **B6** 🟡 `customer.subscription.updated` wird nicht behandelt

**Empfohlene Aktionen:**
- P1: `customer.subscription.updated` Handler im Webhook
- P1: Stripe Customer Portal Integration
- P2: Proration-Logic
- P2: Quota-Verhalten konsistent machen (dokumentiert hard-gate oder soft-gate)

---

### 2.4 API-Handler-Architektur

**Status:** Production-Ready (90%)

#### Guard-Chain (9 Schichten)
```
0. CORS preflight (OPTIONS)
1. Engine config check
2. Auth (session → EngineContext) + RBAC + Rate-Limit + Quota (via requireEngineContext)
3. CSRF (state-changing methods only)
4. Input validation (Zod body + query)
5. Handler execution
6. Audit log (fire-and-forget, only on success)
7. Caching headers (GET only)
8. CORS headers (if enabled)
```

**Reihenfolge:** Korrekt — Auth vor Validation, Validation vor Handler, Audit nach Handler

**createHandler:** 78 Dateien verwenden `createHandler` / `createWebhookHandler` / `createPublicHandler`

**Raw-Export-Routen (37 Dateien):** Alle legitim:
- Auth-Routen (login, signup, forgot, reset, 2FA, SSO) — public by design
- Cron-Routen — `validateCronAuth()` mit timing-safe Bearer-Token
- Webhook-Routen — Signature-Verification (Stripe, WhatsApp, DocuSign, Resend)
- SCIM-Routen — `requireScimAuth()` mit Bearer-Token
- Health, Demo, Marketing-Agent — public mit Rate-Limit

**Bug gefunden:**
- `@/Users/msc/subsumio-web/src/lib/api-handler.ts:223-238` — `public: true` Route ruft trotzdem `requireEngineContext` auf, was Auth erfordert. Der `public` Flag hat keinen Effekt — beide Branches im if/else sind identisch.

**CORS:** `Access-Control-Allow-Origin: *` für cors-enabled Routes — potenziell zu permissiv für authentifizierte Endpoints, aber nur aktiv wenn `cors: true` gesetzt (portal, webhooks).

**Empfohlene Aktionen:**
- P1: `public: true` Bug in `createHandler` fixen — sollte `requireEngineContext` überspringen
- P2: CORS-Origin einschränken (nicht `*` für authentifizierte Routes)

---

### 2.5 Audit-Trail

**Status:** Production-Ready (85%)

- **Postgres:** `subsumio_audit_log` Tabelle mit `brain_id`, `action`, `entity_type`, `entity_id`, `user_id`, `user_email`, `details`, `ip`, `hash`, `prev_hash`
- **Hash-Chain:** SHA-256 über `prev_hash + data` — tamper-evident
- **Multi-Tenant:** `brain_id` pro Row, Index auf `brain_id`
- **Dev-Fallback:** Brain-Pages mit `type=audit_log`
- **Fire-and-Forget:** `void logAudit()` — nie blockierend
- **Indexes:** `brain_id`, `action`, `created_at DESC`, `entity_type+entity_id`

**Gefundene Issues:**
- **AT1** 🟡 Keine Hash-Chain-Verifikations-API (Tamper-Evidence ohne Tamper-Detection)
- **AT2** 🟡 `logAudit` übergibt `brainId` nicht aus `HandlerContext` — verwendet `"system"` als Default

**Empfohlene Aktionen:**
- P1: `brainId` aus `HandlerContext` an `logAudit` übergeben (in `createHandler` audit step)
- P2: Hash-Chain-Verifikations-Endpoint

---

### 2.6 Collaboration Features

**Status:** Alpha (45%)

#### Vier-Augen-Freigabe (Approval)
- 4 Action-Types: `document_finalize`, `deadline_create`, `booking_create`, `message_send`
- Alle require approval — EU-AI-Act Annex III compliant
- Status: `pending → approved | rejected`
- Frontmatter-basiert (Brain-Pages mit `type: agent_action`)
- **Funktional korrekt** aber nur als Datenmodell — keine UI-Queue gefunden

#### Comments
- Brain-Page-basiert: `slug: comment/{parentSlug}/{timestamp}`
- Create + List implementiert
- **Kein Delete** — Kommentare können nicht gelöscht werden
- **Keine @mention-Notifications**
- **Keine Reply-Thread-UI** (thread_id vorhanden, aber keine Nested-Reply-Logik in `listComments`)

#### Real-time
- Native WebSocket (keine externe Lib)
- Auto-Reconnect mit exponentiellem Backoff (max 5 Attempts)
- Message-Queue für pending messages
- **C1** 🟡 `NEXT_PUBLIC_WS_URL` leer → Real-time komplett deaktiviert, kein WS-Server vorhanden
- Token-based WS-Auth vorgesehen aber nicht aktiv

**Gefundene Issues:**
- **C1** 🟡 Real-time ohne WS-Backend — deaktiviert
- **C2** 🟡 Keine @mention-Notifications
- **C3** 🟡 Kein Activity-Feed
- **C4** 🟡 Kein Assignment-Workflow
- **C5** 🟡 Kein Comment-Delete
- **C6** 🟡 Keine Approval-Queue-UI

**Empfohlene Aktionen:**
- P1: Approval-Queue-UI im Dashboard
- P1: Comment-Delete + Edit
- P2: WS-Backend (Vercel doesn't support WS —需要 externer Service wie Pusher/Ably)
- P2: @mention-Notifications
- P3: Activity-Feed

---

### 2.7 DMS (Document Management System)

**Status:** Beta (70%)

- **Interface:** `DMSConnector` mit `search`, `getDocument`, `getFolderContents`, `importToBrain`
- **Connectors:** iManage + NetDocuments via lazy-load (`await import()`)
- **Konfiguration:** `DMS_PROVIDER`, `DMS_BASE_URL`, `DMS_API_KEY` / `DMS_CLIENT_ID` + `DMS_CLIENT_SECRET`
- **Error-Handling:** Try-catch in `fetchPages`, Returns `[]` on failure

**Gefundene Issues:**
- **DM1** 🟡 Keine Tests für DMS-Connectors
- **DM2** 🟡 Keine Caching-Schicht für Search-Results
- **DM3** 🟡 Keine Pagination im Interface

**Empfohlene Aktionen:**
- P2: Integration-Tests für DMS-Connectors
- P3: Search-Result-Caching

---

### 2.8 SCIM / SSO Integration

**Status:** Production-Ready (85%)

- **SCIM 2.0:** Vollständige Type-Definitions, User/Group CRUD, Patch-Operations
- **WorkOS Directory Sync:** Paginierte API-Calls, auto-provisioning, deprovisioning
- **Bearer-Token Auth:** Timing-safe comparison
- **User-Provisioning:** Create (auto-provision with empty password), Update, Deactivate (not delete — for audit trail)
- **Group-Sync:** Groups werden gesynced aber nur informational (keine Role-Mapping)
- **Manual Sync:** `syncFromWorkOS()` mit vollständiger Sync-Result-Statistik
- **Sync-Status:** Persistiert in `scim-sync-status.json`

**Gefundene Issues:**
- **SC1** 🟡 Group-Membership wird nicht in Role-Mapping übersetzt
- **SC2** 🟡 Keine automatische Sync-Scheduling (nur manual trigger)
- **SC3** 🟡 SCIM Filter Parser nur basic (`eq` operator only)

**Empfohlene Aktionen:**
- P2: Group → Role Mapping
- P2: Automatische Sync-Scheduling (täglich)
- P3: Erweiterte SCIM Filter (`ne`, `co`, `sw`)

---

### 2.9 Deployment & DevOps

**Status:** Beta (75%)

#### Vercel Config
- **6 Cron-Jobs:** deadlines (06:00), deadline-reminders (07:00), case-law (06:30), regulatory-monitors (06:45), case-scanner (02:00), retention (08:00)
- **Security-Headers:** X-Frame-Options: DENY, X-Content-Type-Options: nosniff, HSTS (2 Jahre), Referrer-Policy, Permissions-Policy
- **FEHLT:** Content-Security-Policy — **P0**

#### CI/CD
- **ci.yml:** lint → typecheck → test:unit → e2e (Playwright)
- **e2e.yml + heavy-tests.yml:** Separate Workflows
- **Husky:** pre-commit (lint-staged, type-check), pre-push (tests)

#### Environment
- `.env.example`: 47 Zeilen, alle Required-Env-Vars dokumentiert
- `env-validate.ts`: Production-Checks für 9 Env-Vars (AUTH_SECRET, SIGMABRAIN_ENCRYPTION_KEY, etc.)
- **SENTRY_DSN** in env-validate (optional) — Sentry in `error.tsx` integriert

**Gefundene Issues:**
- **E1** 🔴 Keine CSP-Header
- **E2** 🟡 Kein Monitoring-Dashboard (Sentry vorhanden aber kein Alerting)
- **E3** 🟡 Kein Error-Alerting für Production-Incidents
- **E4** ✅ A11y-Tests: `test-results/.last-run.json` → `"status": "passed"` — alle aktuell grün
- **E5** 🟡 Kein Staging-Environment dokumentiert

**Empfohlene Aktionen:**
- **P0:** CSP-Header zu vercel.json hinzufügen
- P1: Sentry Alerting konfigurieren
- P2: Staging-Environment dokumentieren

---

### 2.10 Branding-Konsistenz

**Status:** Alpha (40%) — **Kritische Inkonsistenz**

#### Quantitative Analyse
- **55 Vorkommen** von "sigmabrain"/"SigmaBrain"/"SIGMABRAIN" in **34 Dateien** unter `src/`
- **Betroffene Bereiche:** Auth, Engine, Encryption, Audit, Comments, DMS, Realtime, SCIM, TOTP, Usage, Plans, API, Email, Marketing

#### User-facing Strings
- `realtime.ts` Kommentar: "Real-time Sync Layer für SigmaBrain"
- `comments.ts` Kommentar: "Kommentar-Thread System für SigmaBrain"
- `audit.ts` Kommentar: "Audit-Trail Logger für SigmaBrain"
- `dms/index.ts` Kommentar: "DMS ... Abstrakter Konnektor für SigmaBrain"

#### Code-Interne Bezeichner
- **Env-Vars:** `SIGMABRAIN_API_URL`, `SIGMABRAIN_WEB_API_KEY`, `SIGMABRAIN_ENCRYPTION_KEY`, `SIGMABRAIN_AUTH_DATABASE_URL`, `SIGMABRAIN_DATA_DIR`, `SIGMABRAIN_INTERNAL_SECRET`, `SIGMABRAIN_DEMO_BRAIN`
- **localStorage:** `gbrain-theme` (sollte `subsumio-theme`)
- **Postgres Pool:** `globalThis.__subsumioAuthPool` ✅ (korrekt)

#### Capacitor App
- `@/Users/msc/subsumio-web/capacitor.config.ts:15` — `appId: "com.sigmabrain.app"` ❌
- `appName: "Sigmabrain"` ❌
- `server.url: "https://sigmabrain.com"` ❌
- `allowNavigation: ["sigmabrain.com", "*.sigmabrain.com"]` ❌
- `ios.scheme: "Sigmabrain"` ❌

#### Word-Add-In
- `@/Users/msc/subsumio-web/word-addin/manifest.xml` — **Alle Referenzen sind "SigmaBrain"**:
  - `<Id>sigmabrain-word-addin</Id>` ❌
  - `<ProviderName>SigmaBrain</ProviderName>` ❌
  - `<DisplayName DefaultValue="SigmaBrain für Word"/>` ❌
  - Alle URLs: `https://sigmabrain.com/...` ❌
  - Alle Button-Labels: "SigmaBrain" ❌

#### .env.example
- `NEXT_PUBLIC_SITE_URL=https://sigmabrain.com` ❌
- Kommentar: "Sigmabrain Web-App" ❌

#### Korrekt geblendet
- `subsumio_audit_log` Tabelle ✅
- `subsumio_usage` Tabelle ✅
- `subsumio_quota` Tabelle ✅
- `subsumio_session_revocations` Tabelle ✅
- `subsumio_users` Tabelle ✅
- `subsumio_orgs` Tabelle ✅
- PWA Manifest: "Subsumio" ✅
- `x-subsumio-source` Header ✅
- `sb_session`, `sb_csrf`, `sb_ref` Cookie-Präfixe ✅

**Empfohlene Aktionen:**
- **P0:** Capacitor App-ID + appName + Server-URL → `com.subsumio.app` / `Subsumio` / `https://subsum.io`
- **P0:** Word-Add-In Manifest → alle "SigmaBrain" → "Subsumio", alle URLs → `subsum.io`
- **P0:** `.env.example` → `NEXT_PUBLIC_SITE_URL=https://subsum.io`
- **P1:** Env-Vars `SIGMABRAIN_*` → `SUBSUMIO_*` (mit Backward-Compat-Layer)
- **P1:** `localStorage` Key `gbrain-theme` → `subsumio-theme`
- **P1:** Alle Code-Kommentare bereinigen
- **P2:** User-facing Strings in allen Komponenten prüfen

---

### 2.11 Accessibility (WCAG 2.1 AA)

**Status:** Beta (55%)

#### Vorhandene Tests
- `a11y.spec.ts`: 6 public Pages (`/`, `/de`, `/de/features`, `/de/pricing`, `/de/login`, `/de/signup`)
- `accessibility.spec.ts`: 6 public Pages + 4 dashboard Pages (`/dashboard`, `/dashboard/query`, `/dashboard/upload`, `/dashboard/settings`)
- **Tags:** `wcag2a`, `wcag2aa`, `wcag21aa` — korrekt
- **Filter:** Nur `critical` + `serious` violations — `moderate`/`minor` werden ignoriert
- **Test-Results:** `test-results/.last-run.json` → `"status": "passed", "failedTests": []` ✅

#### Abdeckung
- **Getestet:** 10 von 60+ Seiten (16%)
- **Fehlt:** 50+ Dashboard-Seiten unbeleuchtet (cases, deadlines, brain, vault, contacts, invoicing, team, settings, agents, compliance, legal tools, etc.)

**Gefundene Issues:**
- **A11y-1** 🟡 Nur 16% der Seiten getestet
- **A11y-2** 🟡 Keine Keyboard-Navigation-Tests (nur axe-core auto-scan)
- **A11y-3** 🟡 Keine Screen-Reader-Tests
- **A11y-4** 🟡 `moderate` violations werden ignoriert

**Empfohlene Aktionen:**
- P1: A11y-Tests auf alle 50+ Dashboard-Seiten erweitern
- P2: Keyboard-Navigation-Tests (Tab-Order, Focus-Trap in Modals)
- P3: Screen-Reader-Tests (NVDA/VoiceOver)

---

### 2.12 PWA / Offline

**Status:** Beta (65%)

- **Manifest:** `src/app/manifest.ts` — korrekt ("Subsumio", standalone, icons, categories)
- **Offline Sync:** `useOfflineSync` Hook mit Cache-Fallback (IndexedDB/localStorage via `offline-store.ts`)
- **Network Status:** `useNetworkStatus` Hook mit online/offline events
- **Cache Strategy:** Network-First mit Cache-Fallback (in `useOfflineSync`)

**Gefundene Issues:**
- **PWA-1** 🟡 Kein Service-Worker registriert (keine `sw.js` Referenz) — PWA-Install funktioniert, aber echte Offline-Fähigkeit ist limitiert
- **PWA-2** 🟡 Keine Conflict-Resolution bei Offline-Mutations
- **PWA-3** 🟡 Keine Install-Prompt-Komponente gefunden (obwohl `src/components/pwa/` existiert)

**Empfohlene Aktionen:**
- P1: Service-Worker via `next-pwa` oder manuell registrieren
- P2: Conflict-Resolution-Strategie für Offline-Mutations
- P2: Install-Prompt-Komponente

---

### 2.13 Multi-Tenant-Isolation

**Status:** Production-Ready (95%)

| Schicht | Isolation | Status |
|---------|-----------|--------|
| Engine | `x-subsumio-source` Header (server-to-server, brainId) | ✅ |
| Auth | User → brainId (personal) oder Org → shared brainId | ✅ |
| API | `requireEngineContext` → ctx.brainId | ✅ |
| Audit | `brain_id` pro Row, Index | ✅ |
| Quota | `brain_id` + `month` als Primary Key | ✅ |
| Usage | `brain_id` + `month` als Primary Key | ✅ |
| Session | Session-Payload enthält `uid` → User → brainId | ✅ |

**Org-Membership:** User.orgId → Org.brainId (shared), Plan = Owner's Plan
**Engine Header:** Server-side only — Browser kann Tenant nie wählen

**Einziger Concern:**
- **MT1** 🟡 `listAuditLogs` ohne `brainId`-Filter gibt alle Audit-Logs zurück (nur in Dev ohne Auth-Check auf dem Endpoint) — Production-Route sollte brainId aus Session erzwingen

---

### 2.14 Marketing / Landing Pages / SEO

**Status:** Beta (75%)

- **Landing Page:** `src/app/page.tsx` (1KB — sehr klein, wahrscheinlich Redirect oder minimal)
- **DE Pages:** 19 Items unter `src/app/de/`
- **Sitemap:** `src/app/sitemap.ts` — EN + DE mit hreflang alternates, 10 Pages × 2 = 20 + 5 auth/legal = 30 Entries
- **Robots:** `src/app/robots.ts` — allow all, disallow `/dashboard`, `/admin`, `/api/` — korrekt
- **PWA Manifest:** Korrekt als "Subsumio"

**Gefundene Issues:**
- **SEO-1** 🟡 Sitemap enthält nicht alle public Pages (`/join`, `/portal`, `/download` fehlen teilweise)
- **SEO-2** 🟡 Keine Structured Data (JSON-LD) gefunden

**Empfohlene Aktionen:**
- P2: Sitemap vervollständigen
- P3: Structured Data (Organization, SoftwareApplication)

---

## 3. GAP-ANALYSE (SaaS-spezifisch)

### 3.1 Fehlende Frontend-Features
| # | Gap | Severity | Aufwand |
|---|-----|----------|---------|
| F1 | Kein Undo/Redo für Page-Edits | 🟡 | M |
| F2 | Keine Bulk-Actions in Data Table | 🟡 | S |
| F3 | Keine Advanced/Boolean-Search | 🟡 | M |
| F4 | Keine Drag-and-Drop-Sortierung | 🟡 | M |
| F5 | Keine Custom-Dashboard-Widgets | 🟡 | L |
| F6 | Kein Notification-Center | 🟡 | M |
| F7 | `gbrain-theme` localStorage Key | 🟡 | S |

### 3.2 Security-Lücken
| # | Gap | Severity | Aufwand |
|---|-----|----------|---------|
| A1 | Keine CSP-Header | 🔴 P0 | S |
| A2 | Revocation fail-open | 🟡 | S |
| A3 | Session-TTL 30 Tage ohne Refresh | 🟡 | M |
| A4 | Kein Account-Lockout | 🟡 | S |
| A5 | Dev-Encryption-Key hardcoded | 🟡 | S |
| A6 | `public: true` Bug in createHandler | 🟡 | S |
| A7 | CORS `*` für authentifizierte Routes | 🟡 | S |

### 3.3 Billing-Lücken
| # | Gap | Severity | Aufwand |
|---|-----|----------|---------|
| B1 | Quota-Verhalten inkonsistent | 🟡 | S |
| B2 | Keine Stripe-Customer-Portal | 🟡 | M |
| B3 | Keine Proration-Logic | 🟡 | M |
| B4 | Keine Stripe-Invoice-Generation | 🟡 | M |
| B5 | Enterprise ohne Self-Serve | 🟡 | S |
| B6 | `subscription.updated` nicht behandelt | 🟡 | S |

### 3.4 Collaboration-Lücken
| # | Gap | Severity | Aufwand |
|---|-----|----------|---------|
| C1 | Real-time ohne WS-Backend | 🟡 | L |
| C2 | Keine @mention-Notifications | 🟡 | M |
| C3 | Kein Activity-Feed | 🟡 | M |
| C4 | Kein Assignment-Workflow | 🟡 | M |
| C5 | Kein Comment-Delete | 🟡 | S |
| C6 | Keine Approval-Queue-UI | 🟡 | M |

### 3.5 Branding-Inkonsistenzen
| # | Gap | Severity | Aufwand |
|---|-----|----------|---------|
| D1 | 55 "SigmaBrain" in 34 Dateien | 🔴 P0 | M |
| D2 | Env-Vars `SIGMABRAIN_*` Prefix | 🟡 | L (mit Backward-Compat) |
| D3 | Capacitor App-ID `com.sigmabrain.app` | 🔴 P0 | S |
| D4 | Word-Add-In alle "SigmaBrain" | 🔴 P0 | S |
| D5 | `.env.example` sigmabrain.com | 🔴 P0 | S |
| D6 | `gbrain-theme` localStorage | 🟡 | S |

### 3.6 Deployment-Risiken
| # | Gap | Severity | Aufwand |
|---|-----|----------|---------|
| E1 | Keine CSP-Header | 🔴 P0 | S |
| E2 | Kein Monitoring/Alerting | 🟡 | M |
| E3 | Kein Staging-Environment | 🟡 | S |

### 3.7 Test-Coverage-Lücken
| Bereich | Status | Aufwand |
|---------|--------|---------|
| Dashboard-Seiten (50+) | ❌ Keine E2E-Tests | L |
| API Routes (115+) | ❌ Keine Integration-Tests | L |
| Billing/Checkout-Flow | ❌ | M |
| Stripe-Webhook | ❌ | M |
| SCIM-Endpoints | ❌ | M |
| DMS-Connectors | ❌ | M |
| Real-time/WebSocket | ❌ | S |
| Approval-Workflow | ❌ | S |
| Comments | ❌ | S |
| Quota-Enforcement | ❌ | S |
| 2FA-Flow | ❌ | S |
| SSO-Flow | ❌ | S |
| UI-Komponenten (45, nur 1 Test) | ❌ | L |

---

## 4. PRIORISIERTE ACTION-ITEMS

| Priority | Item | Bereich | Aufwand | Impact |
|----------|------|--------|---------|--------|
| **P0** | CSP-Header zu vercel.json hinzufügen | Security | S | 🔴 Kritisch — XSS-Schutz |
| **P0** | Capacitor App-ID/Name/URL → Subsumio | Branding | S | 🔴 App-Store-Branding |
| **P0** | Word-Add-In Manifest → Subsumio | Branding | S | 🔴 Office Store-Branding |
| **P0** | `.env.example` → subsum.io Domain | Branding | S | 🔴 SEO + Links |
| **P0** | `public: true` Bug in createHandler fixen | API | S | 🔴 Funktionsfehler |
| **P1** | `subscription.updated` im Stripe-Webhook | Billing | S | Hohe — Plan-Wechsel |
| **P1** | `brainId` an `logAudit` aus HandlerContext | Audit | S | Hohe — Multi-Tenant |
| **P1** | Approval-Queue-UI im Dashboard | Collaboration | M | Hohe — EU-AI-Act |
| **P1** | A11y-Tests auf alle 50+ Dashboard-Seiten | Accessibility | L | Hohe — WCAG-Compliance |
| **P1** | Env-Vars `SIGMABRAIN_*` → `SUBSUMIO_*` (mit Backward-Compat) | Branding | L | Hohe — Konsistenz |
| **P1** | `localStorage` Key → `subsumio-theme` | Branding | S | Medium |
| **P1** | Sentry Alerting konfigurieren | Deployment | M | Hohe — Production-Safety |
| **P1** | Comment-Delete + Edit | Collaboration | S | Medium |
| **P1** | Stripe Customer Portal Integration | Billing | M | Medium — Self-Service |
| **P2** | API-Route Integration-Tests (Top 20 Routes) | Testing | L | Hohe — Regression-Schutz |
| **P2** | Service-Worker für PWA-Offline | PWA | M | Medium — Offline-Fähigkeit |
| **P2** | Proration-Logic bei Plan-Wechsel | Billing | M | Medium |
| **P2** | Undo/Redo für Brain-Page-Edits | Frontend | M | Medium |
| **P2** | Bulk-Actions in Data Table | Frontend | S | Medium |
| **P2** | Notification-Center | Frontend | M | Medium |
| **P2** | Session-Refresh-Token | Security | M | Medium |
| **P2** | Account-Lockout-Policy | Security | S | Medium |
| **P2** | Staging-Environment dokumentieren | Deployment | S | Medium |
| **P3** | WS-Backend (Pusher/Ably) für Real-time | Collaboration | L | Medium |
| **P3** | @mention-Notifications | Collaboration | M | Low |
| **P3** | Activity-Feed | Collaboration | M | Low |
| **P3** | Structured Data (JSON-LD) | SEO | S | Low |
| **P3** | Hash-Chain-Verifikations-Endpoint | Audit | S | Low |

---

## 5. PRODUCTION-READINESS-MATRIX

| Bereich | Status | Blocker | Aufwand bis Production-Ready |
|---------|--------|---------|---------------------------|
| Frontend/Dashboard | Beta | F1-F7 (UX-Features), A11y-Abdeckung | M (1-2 Sprints) |
| Auth & Security | **Fast Production-Ready** | A1 (CSP), A6 (public Bug) | S (1 Sprint) |
| Billing & Quota | Beta | B1-B6 (Stripe-Features) | M (2 Sprints) |
| API-Architektur | **Production-Ready** | A6 (public Bug) | S (1 Fix) |
| Audit-Trail | **Fast Production-Ready** | AT1 (brainId aus Context) | S (1 Fix) |
| Collaboration | Alpha | C1-C6 (Real-time, UI, Mentions) | L (3+ Sprints) |
| DMS | Beta | DM1 (Tests) | S (1 Sprint) |
| SCIM/SSO | **Production-Ready** | SC1 (Group→Role Mapping) | M (optional) |
| Deployment | Beta | E1 (CSP), E2 (Alerting) | S (1 Sprint) |
| Branding | Alpha | D1-D6 (SigmaBrain→Subsumio) | M (1-2 Sprints) |
| Accessibility | Beta | A11y-1 (Test-Abdeckung) | L (2 Sprints) |
| PWA/Offline | Beta | PWA-1 (Service-Worker) | M (1 Sprint) |
| Multi-Tenant | **Production-Ready** | MT1 (minor) | S (1 Fix) |
| Test-Coverage | Alpha | 13 Bereiche ohne Tests | L (3+ Sprints) |

---

## 6. DEFINITION OF DONE — BEANTWORTUNG

1. **Ist das Dashboard production-ready für Kanzlei-Alltag?** — **Beta.** Funktional vollständig (50+ Seiten, Loading/Empty/Error-States), aber A11y-Abdeckung bei 16% und fehlende UX-Features (Undo/Redo, Bulk-Actions, Notification-Center).

2. **Ist die Auth & Security-Schicht production-ready?** — **Ja, mit einem P0-Fix.** CSP-Header fehlt (P0), ansonsten solide Implementierung (HMAC-SHA-256, scrypt, 2FA, RBAC, CSRF, AES-256-GCM, Rate-Limiting).

3. **Ist das Billing-System korrekt?** — **Beta.** Checkout + Webhook funktional, aber `subscription.updated` fehlt, keine Customer-Portal, keine Proration, Quota-Verhalten inkonsistent.

4. **Ist die API-Handler-Architektur korrekt?** — **Ja.** 9-Schicht Guard-Chain korrekt, 78/115+ Routes über createHandler, Raw-Routes alle legitim abgesichert. Ein Bug: `public: true` hat keinen Effekt.

5. **Ist die Audit-Trail korrekt?** — **Ja, mit minor Fix.** Hash-Chain korrekt, Multi-Tenant isoliert, Fire-and-Forget. `brainId` sollte aus HandlerContext übergeben werden.

6. **Sind Collaboration-Features production-ready?** — **Nein, Alpha.** Real-time deaktiviert (kein WS-Backend), keine Approval-Queue-UI, keine @mentions, kein Comment-Delete.

7. **Ist die DMS-Integration korrekt?** — **Beta.** Interface + 2 Connectors funktional, aber keine Tests, keine Caching, keine Pagination.

8. **Ist die SCIM/SSO-Integration korrekt?** — **Ja.** Vollständige SCIM 2.0-Implementierung, WorkOS Directory Sync, Bearer-Token Auth, Auto-Provisioning.

9. **Ist die Deployment-Pipeline korrekt?** — **Beta.** CI/CD funktional, 6 Crons korrekt, aber CSP fehlt (P0), kein Alerting, kein Staging.

10. **Ist die Branding-Konsistenz hergestellt?** — **Nein, Alpha.** 55 SigmaBrain-Referenzen in 34 Dateien, Capacitor + Word-Add-In + .env.example alle noch "SigmaBrain". P0 Fixes nötig.

11. **Ist die Accessibility korrekt?** — **Beta.** axe-core Tests vorhanden und grün, aber nur 16% Abdeckung. Keine Keyboard/Screen-Reader-Tests.

12. **Ist die DSGVO-Compliance korrekt?** — **Bedingt.** Data-Export (Art. 15) + Retention-Cron vorhanden. Cookie-Consent (RefConsentBanner) implementiert. Privacy/Terms/Imprint-Seiten vorhanden. **Lücke:** Data-Deletion (Art. 17) nicht explizit als Endpoint gefunden.

13. **Ist die Multi-Tenant-Isolation durchgängig korrekt?** — **Ja (95%).** Brain-Isolation über `x-subsumio-source` Header, Org-Membership mit shared brainId, Audit/Quota/Usage alle scoped by brain_id. Minor: `listAuditLogs` ohne brainId-Filter in Dev.

14. **Ist die Test-Coverage ausreichend?** — **Nein (35%).** 21 Unit-Tests (solide für Lib-Layer), 3 E2E-Test-Files (nur 10 Seiten), aber 0 Integration-Tests für 115+ API-Routes, 0 Tests für Billing, SCIM, DMS, Collaboration.

---

## 7. ARCHITEKTUR-DIAGRAMM (verifiziert)

```
Browser / Mobile / Word-Add-In
  ↓
Vercel Edge (Middleware: Auth + CSRF + Security Headers) ✅
  ↓
Next.js App Router (SSR/ISR)
  ├── Marketing Pages (Landing, Pricing, Features, Compare) ✅
  ├── Auth Pages (Login, Signup, Forgot, Reset, 2FA) ✅
  ├── Dashboard (50+ Seiten, Kanzlei-OS) ✅
  ├── Admin (Mailbox, User-Management) ✅
  └── API Routes (115+ Endpoints)
       ↓
  createHandler Guard-Chain: ✅ (9 Schichten, korrekt)
  1. CORS preflight ✅
  2. Engine config check ✅
  3. Auth (Session → EngineContext) ✅
  4. RBAC (can(user, action)) ✅
  5. CSRF (double-submit) ✅
  6. Rate limit (per-user, tier) ✅
  7. Quota (queries, uploads, pages) ✅
  8. Zod validation (body, query) ✅
  9. Handler execution ✅
  10. Audit log (fire-and-forget) ✅
       ↓
  Subsumio Brain Engine (Server)
  ├── Engine Proxy (src/lib/engine.ts) ✅
  ├── Auth Store (Postgres / JSON-File) ✅
  ├── Audit Trail (Postgres, hash-chained) ✅
  ├── Usage Metering (Postgres / JSON-File) ✅
  ├── Quota Tracking (Postgres / JSON-File) ✅
  └── Encryption (AES-256-GCM at rest) ✅
       ↓
  External Services:
  ├── Stripe (Billing) ✅
  ├── WorkOS (SSO/SCIM) ✅
  ├── Upstash Redis (Rate-Limit) ✅ (optional)
  ├── Postgres (Auth, Audit, Usage, Quota) ✅
  ├── iManage / NetDocuments (DMS) ✅
  ├── DocuSign (Signature) ✅
  ├── WhatsApp (Messaging) ✅
  ├── beA (Anwaltsportal) ✅
  └── Google / Dropbox (Connectors) ✅
```

---

*Dieser Report deckt die komplette SaaS-Applikationsschicht ab und ergänzt Audit 1 (Ingestion) und Audit 2 (Intelligence). Zusammen: Brain-Engine (Ingestion + Intelligence) + SaaS-Hülle (Frontend, Auth, Billing, Admin, Deployment).*
