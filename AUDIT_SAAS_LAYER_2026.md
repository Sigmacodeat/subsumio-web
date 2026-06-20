# Subsumio SaaS-Applikationsschicht Audit — 2026-06-19

> **Audit 3 von 3:** Frontend, Auth, Billing, Admin, Deployment & Production Readiness
> Ergänzt Audit 1 (Ingestion-Pipeline) und Audit 2 (Intelligence Layer).

---

## 7.1 SaaS-Layer Executive Summary

| Bereich | Score | Status |
|---------|-------|--------|
| **Gesamt SaaS Layer** | **68%** | Beta — funktional, aber nicht production-hardened |
| Frontend / Dashboard | 72% | Beta |
| Auth & Security | 65% | Beta — solide Fundamente, aber kritische Gaps (CSP, Branding) |
| Billing & Quota | 55% | Alpha — Stripe-Integration funktioniert, aber unvollständig |
| API-Architektur | 82% | Production-nah — Guard-Chain exzellent, Coverage lückenhaft |
| Collaboration | 40% | Alpha — Approval solide, Real-time/Comments rudimentär |
| Deployment & DevOps | 70% | Beta — CI/CD gut, Monitoring/CSP fehlen |
| Branding | 35% | Alpha — 55 SigmaBrain-Vorkommen in 34 Dateien |
| Accessibility | 45% | Alpha — nur 10 von 60+ Seiten getestet |

**Kernurteil:** Die Architektur ist durchdacht und technisch solide. Die 9-Schicht-Guard-Chain, das RBAC-System, die Quota-Atomicity und die Audit-Hash-Chain sind professionell implementiert. Die Blocker für Production-Readiness sind jedoch: **fehlende CSP-Header (P0)**, **unvollständiges Branding (P0)**, **fehlende Test-Coverage für kritische Flows (P1)** und **inkomplette Billing-Features (P1)**.

---

## 7.2 Bereich-Weise Detail-Analyse

### 7.2.1 Frontend / Dashboard / Kanzlei-OS

**Status:** Beta

**Funktionalität:**
- 50+ Dashboard-Seiten unter `src/app/dashboard/` bestätigt (49 Verzeichnisse + `page.tsx` + `layout.tsx` + `error.tsx` + `loading.tsx`)
- Dashboard-Layout mit Sidebar, Topbar, Command Palette (Cmd+K), Theme-Toggle, Mobile-Drawer, Realtime-Init
- Loading-State: zentraler Spinner in `loading.tsx` — kein Skeleton pro Seite
- Error-State: Error-Boundary mit Retry-Button und Sentry-Integration in `error.tsx`
- 45 UI-Komponenten unter `src/components/ui/` (shadcn/ui-Pattern)
- 22 Storybook-Stories für UI-Komponenten
- 1 Unit-Test für UI-Komponenten (`button.test.tsx`)

**Gefundene Issues:**
- **Keine seiten-spezifischen Loading-Skeletons**: Nur zentraler Spinner → Layout-Shift bei Seitenwechsel
- **Kein Undo/Redo** für Brain-Page-Edits (F1 bestätigt)
- **Keine Bulk-Actions** in Data Table (F2 bestätigt)
- **Keine Advanced/Boolean-Search** in Brain (F3 bestätigt)
- **Kein Notification-Center** (F6 bestätigt)
- **`dangerouslySetInnerHTML` in 6 Dateien**: `research/page.tsx` (3×), `admin/mailbox/MailboxClient.tsx`, `assistant/page.tsx`, `contracts/page.tsx`, `settings/security/page.tsx`, `seo/jsonld.tsx` — XSS-Risiko bei Markdown-Rendering, Sanitization prüfen
- **Theme localStorage key**: `gbrain-theme` statt `subsumio-theme` (Branding-Inkonsistenz)
- **Keine Pagination/Infinite-Scroll** auf Listen-Seiten sichtbar
- **Responsive Design**: Sidebar hat Mobile-Drawer, aber keine Tablet-spezifische Layout-Logik

**Test-Coverage:**
- 0 E2E-Tests für einzelne Dashboard-Seiten (nur 4 Seiten in `accessibility.spec.ts`)
- 0 Unit-Tests für Dashboard-Komponenten (Sidebar, Topbar, Command Palette, Data Table etc.)

### 7.2.2 Auth & Security

**Status:** Beta — solide Fundamente, kritische Gaps

**Session-Implementierung** (`src/lib/auth/session-core.ts`):
- ✅ HMAC-SHA-256, Edge-safe (Web Crypto API)
- ✅ 30 Tage TTL, Session-Version für Revocation
- ✅ Revocation-Cache mit 60s TTL via `/api/internal/revocation-check`
- ✅ Cookie-Attributes: `httpOnly`, `secure` (prod), `sameSite`, `maxAge`, `path: "/"`
- ✅ `AUTH_SECRET`-Check: Production → throw, Dev → fallback
- ⚠️ **Revocation fail-open** (`session-core.ts:56`): `catch → return 0` = valid bei Network-Error
- ⚠️ **Kein Refresh-Token**: 30 Tage TTL ohne Rotation

**Password-Hashing** (`src/lib/auth/password.ts`):
- ✅ Node.js `scrypt` (N=16384, r=8, p=1, KEYLEN=64)
- ✅ Salt: 16 random bytes, `timingSafeEqual` für Verification

**Action-Tokens** (`src/lib/auth/tokens.ts`):
- ✅ Purpose-bound (`reset`, `verify`, `invite`, `2fa_challenge`)
- ✅ Bind-Fragment: Reset → bind an password-hash, Verify → bind an email
- ✅ TTLs: Reset 1h, Verify 48h, Invite 7d, Challenge 5min

**2FA** (`src/lib/auth/backup-codes.ts` + `src/lib/totp.ts`):
- ✅ TOTP mit Base32-Secret, encrypted at rest
- ✅ Backup-Codes: 10 Codes, SHA-256 hashed, no ambiguous chars
- ✅ Pending-Secret mit 10min Expiry

**CSRF** (`src/lib/csrf.ts` + `src/middleware.ts`):
- ✅ Double-Submit-Pattern, timing-safe comparison
- ✅ Exemptions korrekt: login, signup, register, forgot, reset, 2fa-login-verify, cron, webhook
- ✅ `csrfFetch()` wrapper für Client-side

**Rate-Limiting** (`src/lib/auth/rate-limit.ts`):
- ✅ Sliding-Window, Upstash Redis (REST Pipeline), in-memory Fallback
- ✅ File-based persistence für Production-Self-Hosted
- ⚠️ Fail-open bei Upstash-Ausfall (pro-Instanz, nicht instanzübergreifend)

**Encryption** (`src/lib/encryption.ts`):
- ✅ AES-256-GCM via Web Crypto, 12-byte IV
- ✅ Production-Check: throw wenn Key fehlt
- ⚠️ Dev-Encryption-Key hardcoded: `subsumio-dev-encryption-key-32chars!`

**RBAC** (`src/lib/permissions.ts`):
- ✅ 4 Rollen, 30+ Route-Actions, `can()` Funktion
- ✅ `client_viewer` eingeschränkt: nur `brain.read` + `settings.read`
- ⚠️ `invoice.read`/`invoice.write` erlauben `assistant` — prüfen ob gewollt

**SCIM 2.0** (`src/lib/scim.ts`):
- ✅ Vollständige Implementierung (740 Zeilen), WorkOS Directory Sync
- ✅ User-Provisioning: Create, Update, Deactivate (nicht Delete — für Audit-Trail)
- ⚠️ Filter Parser: unparsable filters → pass-all (`return () => true`)

**Gefundene Issues:**
- 🔴 **A1: Keine CSP** — kein Vorkommen im gesamten Codebase. Kritisch.
- 🟡 **A2: Revocation fail-open** bestätigt
- 🟡 **A3: Session-TTL 30 Tage** ohne Refresh-Token
- 🟡 **A4: Kein Account-Lockout**
- 🟡 **A5: Dev-Encryption-Key hardcoded**
- 🟡 **CORS `Access-Control-Allow-Origin: *`** in `api-handler.ts:97`

### 7.2.3 Billing & Quota

**Status:** Alpha — funktional aber unvollständig

**Stripe-Checkout** (`src/app/api/billing/checkout/route.ts`):
- ✅ Über `createHandler` gewrappt (RBAC, Audit)
- ✅ Zod-Schema, Stripe Checkout Session via direct API
- ✅ Referral-Integration, Graceful degradation (501 wenn nicht konfiguriert)

**Stripe-Webhook** (`src/app/api/billing/webhook/route.ts`):
- ✅ Signature-Verification (HMAC-SHA256, timing-safe, 5min tolerance)
- ✅ `checkout.session.completed` (upgrade), `customer.subscription.deleted` (downgrade)
- ⚠️ **Keine Idempotency-Prüfung** explizit
- ❌ **`customer.subscription.updated` nicht behandelt** — Plan-Wechsel wird nicht reflektiert
- ❌ Nur 2 Event-Types behandelt

**Quota-Enforcement** (`src/lib/plans.ts`):
- ✅ Postgres `subsumio_quota` Tabelle, **Atomic check-and-reserve** (BEGIN → UPSERT → SELECT FOR UPDATE)
- ✅ File-based Fallback für Dev, Monthly-Reset via `yyyy-mm` Key
- ✅ 13 API-Routes haben `quota:` Spec
- ⚠️ Soft-Gating only (V1)

**Usage-Metering** (`src/lib/usage.ts`):
- ✅ Postgres `subsumio_usage` Tabelle, `recordQuery()` fire-and-forget
- ✅ Per-brainId scoped, 12-Monate-Retention

**Gefundene Issues:**
- ❌ **B2: Keine Stripe-Customer-Portal-Integration**
- ❌ **B3: Keine Proration-Logic**
- ❌ **B4: Keine Invoice-Generation via Stripe**
- ❌ **Kein `customer.subscription.updated` Handler**
- 🟡 **B1: Quota soft-gating only** (V1)
- 🟡 **B5: Enterprise ohne Self-Serve**

### 7.2.4 API-Handler-Architektur

**Status:** Production-nah (82%)

**Guard-Chain** (`src/lib/api-handler.ts`):
- ✅ 9-Schicht-Pipeline korrekt: CORS → Engine config → Auth+RBAC+Rate+Quota → CSRF → Zod → Handler → Audit → Cache → CORS
- ✅ `createHandler`, `createPublicHandler`, `createWebhookHandler`
- ✅ Error-Handling: `AppError` → typed response, uncaught → 500
- ✅ Audit: nur bei `response.ok`

**API-Route-Coverage:**
- 68 `route.ts` Dateien, 78 verwenden `createHandler`/`createPublicHandler`/`createWebhookHandler`
- 37 verwenden raw `export async function` — alle korrekt (auth, cron, webhook, SCIM, health)
- ✅ Alle Cron-Routes verwenden `CRON_SECRET`
- ✅ 43 Routes haben `audit:` Spec
- ✅ 13 Routes haben `quota:` Spec
- ⚠️ **25+ Routes ohne Audit-Spec** — keine Audit-Trail für diese Aktionen
- ⚠️ **55+ Routes ohne Quota-Check**

### 7.2.5 Audit-Trail

**Status:** Beta — solide Implementierung

- ✅ Postgres `subsumio_audit_log` mit Hash-Chain (SHA-256)
- ✅ Multi-Tenant-Isolation: `brain_id` pro Row, 4 Indices
- ✅ Dev-Fallback: Brain-Pages mit `type=audit_log`
- ✅ Fire-and-Forget, IP + User Logging
- ⚠️ **Hash-Chain nicht verifizierbar** — keine `verifyHashChain()` Funktion
- ⚠️ **Audit-Log ohne brainId in `createHandler`** — `logAudit()` übergibt keine `brainId` → alle Audits unter `brainId: "system"`

### 7.2.6 Collaboration Features

**Status:** Alpha

**Approval** (`src/lib/approval.ts`):
- ✅ 4 Action-Types, `REQUIRES_APPROVAL` Set, Status flow
- ✅ EU-AI-Act-Annex-III-Compliance, Berufsrechtliche Compliance
- ⚠️ **Keine Server-side Enforcement** — nur Frontmatter-Struktur, keine Middleware die `REQUIRES_APPROVAL` prüft

**Comments** (`src/lib/comments.ts`):
- ✅ Brain-Page-basiert, `addComment()` + `listComments()`
- ⚠️ Kein Delete, keine Reply-Struktur, keine Edit
- ❌ Keine @mention-Notifications (C2)

**Real-time** (`src/lib/realtime.ts`):
- ✅ Native WebSocket, Auto-Reconnect, Message-Queue, Graceful-Degradation
- ❌ **C1: Kein WS-Backend** — `NEXT_PUBLIC_WS_URL` leer → deaktiviert
- ⚠️ Token in URL (logs sichtbar)

### 7.2.7 DMS

**Status:** Beta — Interface sauber, Connectors rudimentär

- ✅ Abstraktes `DMSConnector` Interface, Lazy-loading
- ✅ iManage + NetDocuments Connectors implementieren alle 4 Methoden
- ⚠️ **Kein Error-Handling** für API-Errors, Network-Timeouts, Auth-Failures
- ⚠️ Kein Retry-Logic, kein Content-Fetch-Timeout

### 7.2.8 Marketing / SEO

**Status:** Beta

- ✅ Landing, Pricing, Features, Compare, DE-Seiten (19 items)
- ✅ `sitemap.ts` mit hreflang, `robots.ts` korrekt
- ✅ PWA Manifest korrekt als "Subsumio"
- ⚠️ Sitemap BASE Fallback: `https://subsum.eu` — nicht `subsumio.com`
- ⚠️ `.env.example`: `NEXT_PUBLIC_SITE_URL=https://sigmabrain.com` — falsche Domain

### 7.2.9 Deployment & DevOps

**Status:** Beta

- ✅ 6 Cron-Jobs, Security-Headers (X-Frame-Options, HSTS, etc.)
- ✅ CI/CD (ci.yml, e2e.yml, heavy-tests.yml), Husky hooks
- ✅ `.env.example` 147 Zeilen, `env-validate.ts` mit Production-Checks
- ❌ **E1: Keine CSP** (P0)
- 🟡 Kein aktives Monitoring (Sentry optional, lazy-imported)
- 🟡 Kein Staging dokumentiert
- ⚠️ Env-Vars verwenden `SIGMABRAIN_*` Prefix

### 7.2.10 Branding-Konsistenz

**Status:** Alpha — 55 Vorkommen in 34 Dateien

**Bestätigt:**
- 🔴 **D1: 55 Vorkommen "SigmaBrain" in 34 Dateien** unter `src/` — exakt wie im Prompt angegeben
- 🟡 **D2: Env-Vars verwenden `SIGMABRAIN_*` Prefix** — `SIGMABRAIN_DATA_DIR`, `SIGMABRAIN_AUTH_DATABASE_URL`, `SIGMABRAIN_ENCRYPTION_KEY`, `SIGMABRAIN_API_URL`, `SIGMABRAIN_WEB_API_KEY`, `SIGMABRAIN_INTERNAL_SECRET`
- 🟡 **D3: Capacitor App-ID `com.sigmabrain.app`** — `capacitor.config.ts:15`, appName "Sigmabrain", server url `sigmabrain.com`
- 🟡 **D4: Word-Add-In verwendet "SigmaBrain"** — `manifest.xml`: Id `sigmabrain-word-addin`, ProviderName `SigmaBrain`, DisplayName `SigmaBrain für Word`, alle URLs `sigmabrain.com`, alle Labels `SigmaBrain`
- ✅ **D5: Audit-Tabelle heißt `subsumio_audit_log`** — korrekt
- ✅ **D6: Usage-Tabelle heißt `subsumio_usage`** — korrekt
- ⚠️ **Zusätzliche Branding-Issues:**
  - `src/lib/audit.ts:2`: Kommentar "Audit-Trail Logger für SigmaBrain"
  - `src/lib/realtime.ts:7`: Kommentar "Real-time Sync Layer für SigmaBrain"
  - `src/lib/comments.ts:2`: Kommentar "Kommentar-Thread System für SigmaBrain"
  - `src/lib/dms/index.ts:2`: Kommentar "DMS Abstrakter Konnektor für SigmaBrain"
  - `src/lib/dms/imanager.ts:2`: Kommentar "iManage Work API Konnektor für SigmaBrain"
  - `src/lib/dms/netdocuments.ts:2`: Kommentar "NetDocuments API Konnektor für SigmaBrain"
  - `src/app/dashboard/layout.tsx:16`: localStorage key `gbrain-theme`
  - `.env.example:1`: "Sigmabrain Web-App"
  - `.env.example:8`: `NEXT_PUBLIC_SITE_URL=https://sigmabrain.com`
  - `src/lib/env-validate.ts`: alle Env-Specs verwenden `SIGMABRAIN_*` Namen

### 7.2.11 Accessibility (WCAG 2.1 AA)

**Status:** Alpha

- ✅ `a11y.spec.ts`: 6 public pages mit axe-core (wcag2a, wcag2aa, wcag21aa)
- ✅ `accessibility.spec.ts`: 6 public pages + 4 dashboard pages mit axe-core
- ✅ `test-results/.last-run.json`: `"status": "passed"` — Tests waren grün
- ❌ **Nur 10 von 60+ Seiten getestet** — 50+ Dashboard-Seiten ungetestet
- ❌ Keine Keyboard-Navigation-Tests
- ❌ Keine Screen-Reader-Tests
- ❌ Keine Color-Contrast-Tests (nur axe-core auto-detection)
- ⚠️ Dashboard-Test erstellt User via Signup und testet dann 4 Seiten — fragil, abhängig von DB-Verfügbarkeit

### 7.2.12 PWA / Offline

**Status:** Beta

- ✅ PWA Manifest korrekt (`src/app/manifest.ts`)
- ✅ Offline-Store mit IndexedDB (`src/lib/offline-store.ts`): 3 Object Stores (pages, mutations, chat_history)
- ✅ Mutation Queue: `enqueueMutation`, `getPendingMutations`, `removeMutation`
- ✅ `useOfflineSync` Hook: fetcher + cache + online/offline detection
- ✅ `useNetworkStatus` Hook
- ⚠️ **Kein Service Worker** — Next.js generiert keinen automatisch, kein `sw.js` gefunden
- ⚠️ **Keine Conflict-Resolution** in Mutation Queue — Last-Write-Wins implizit
- ⚠️ **Keine Sync-Trigger-Logik** — `getPendingMutations` existiert, aber keine Funktion die mutations bei Online-Status synced

### 7.2.13 Multi-Tenant-Isolation

**Status:** Production-nah (85%)

- ✅ **Brain-Isolation**: Jeder User hat eigenen `brainId`, Org-Mitglieder teilen `org.brainId`
- ✅ **Engine-Header**: `x-subsumio-source: brainId` — Engine scoped alle Operationen darauf
- ✅ **Org-Membership**: User → `orgId` → shared `org.brainId`, Plan vom Org-Owner
- ✅ **Quota-Isolation**: `subsumio_quota` scoped by `brain_id`
- ✅ **Usage-Isolation**: `subsumio_usage` scoped by `brain_id`
- ✅ **Audit-Isolation**: `subsumio_audit_log` scoped by `brain_id` (aber `createHandler` übergibt nicht `brainId` — siehe 7.2.5)
- ⚠️ **Audit-Trail brainId-Leak**: Audits über `createHandler` landen unter `brainId: "system"` statt Tenant — Multi-Tenant-Isolation für Audit eingeschränkt
- ⚠️ **`engineHeadersForBrain()`** für Cron/Webhooks — trusted server-side, nie request-derived input (korrekt)

---

## 7.3 Gap-Analyse (SaaS-spezifisch)

### Fehlende Frontend-Features

| # | Gap | Severity | Aufwand |
|---|-----|----------|---------|
| F1 | Kein Undo/Redo für Page-Edits | 🟡 | L |
| F2 | Keine Bulk-Actions in Data Table | 🟡 | M |
| F3 | Keine Advanced/Boolean-Search | 🟡 | M |
| F4 | Keine Drag-and-Drop-Reihenfolge | 🟡 | M |
| F5 | Keine Custom-Dashboard-Widgets | 🟡 | L |
| F6 | Kein Notification-Center | 🟡 | M |
| F7 | Keine seiten-spezifischen Loading-Skeletons | 🟡 | S |
| F8 | `dangerouslySetInnerHTML` in 6 Dateien — Sanitization prüfen | 🔴 | S |

### Security-Lücken

| # | Gap | Severity | Aufwand |
|---|-----|----------|---------|
| A1 | Keine CSP-Header | 🔴 | S |
| A2 | Revocation fail-open | 🟡 | S |
| A3 | Session-TTL 30 Tage ohne Refresh | 🟡 | M |
| A4 | Kein Account-Lockout | 🟡 | S |
| A5 | Dev-Encryption-Key hardcoded | 🟡 | S |
| A6 | CORS `Access-Control-Allow-Origin: *` für cors routes | 🟡 | S |
| A7 | SCIM Filter Parser pass-all fallback | 🟡 | S |

### Billing-Lücken

| # | Gap | Severity | Aufwand |
|---|-----|----------|---------|
| B1 | Quota soft-gating only (V1) | 🟡 | M |
| B2 | Keine Stripe-Customer-Portal-Integration | 🟡 | S |
| B3 | Keine Proration-Logic | 🟡 | M |
| B4 | Keine Invoice-Generation via Stripe | 🟡 | M |
| B6 | `customer.subscription.updated` nicht behandelt | 🔴 | S |
| B7 | Keine Idempotency bei Webhook | 🟡 | S |

### Collaboration-Lücken

| # | Gap | Severity | Aufwand |
|---|-----|----------|---------|
| C1 | Real-time ohne WS-Backend | 🟡 | L |
| C2 | Keine @mention-Notifications | 🟡 | M |
| C3 | Keine Activity-Feed | 🟡 | M |
| C4 | Keine Assignment-Workflow | 🟡 | M |
| C5 | Approval ohne Server-side Enforcement | 🟡 | M |
| C6 | Comments: kein Delete, keine Edit | 🟡 | S |

### Branding-Inkonsistenzen

| # | Gap | Severity | Aufwand |
|---|-----|----------|---------|
| D1 | 55 Vorkommen "SigmaBrain" in 34 Dateien | 🔴 | M |
| D2 | Env-Vars `SIGMABRAIN_*` Prefix | 🟡 | L (breaking) |
| D3 | Capacitor App-ID `com.sigmabrain.app` | 🟡 | S |
| D4 | Word-Add-In verwendet "SigmaBrain" | 🟡 | S |
| D7 | `.env.example` Domain `sigmabrain.com` | 🟡 | S |
| D8 | localStorage key `gbrain-theme` | 🟡 | S |
| D9 | Sitemap Fallback `subsum.eu` | 🟡 | S |

### Deployment-Risiken

| # | Gap | Severity | Aufwand |
|---|-----|----------|---------|
| E1 | Keine CSP-Header | 🔴 | S |
| E2 | Kein aktives Monitoring | 🟡 | S |
| E3 | Keine Error-Alerting | 🟡 | S |
| E5 | Kein Staging dokumentiert | 🟡 | S |

### Test-Coverage-Lücken

| Bereich | Status | Aufwand |
|---------|--------|---------|
| Dashboard-Seiten (50+) | ❌ Keine E2E | L |
| API Routes (68) | ❌ Keine Integration | L |
| Billing/Checkout-Flow | ❌ | M |
| Stripe-Webhook | ❌ | M |
| SCIM-Endpoints | ❌ | M |
| DMS-Connectors | ❌ | M |
| Real-time/WebSocket | ❌ | S |
| Approval-Workflow | ❌ | S |
| Comments | ❌ | S |
| Quota-Enforcement | ❌ | M |
| Audit-Trail (hash-chain) | ❌ | S |
| 2FA-Flow | ❌ | S |
| SSO-Flow | ❌ | M |
| Password-Reset-Flow | ❌ | S |
| Org-Membership | ❌ | S |
| Data-Export | ❌ | S |
| PWA/Offline-Sync | ❌ | S |
| Command-Palette | ❌ | S |
| Agent-Builder | ❌ | L |
| Data-Table | ❌ | M |
| UI-Komponenten (45, nur 1 Test) | ❌ | L |

---

## 7.4 Priorisierte Action-Items

| Priority | Item | Bereich | Aufwand | Impact |
|----------|------|--------|---------|--------|
| **P0** | CSP-Header in `vercel.json` hinzufügen | Security | S | XSS-Schutz, Production-Blocker |
| **P0** | SigmaBrain → Subsumio Branding-Migration (34 Dateien) | Branding | M | Brand-Konsistenz, User-Facing |
| **P0** | Capacitor App-ID + Word-Add-In Manifest rebranden | Branding | S | App-Store-Branding |
| **P0** | `customer.subscription.updated` Handler im Stripe-Webhook | Billing | S | Plan-Wechsel funktioniert |
| **P1** | `dangerouslySetInnerHTML` auf Sanitization prüfen (6 Dateien) | Security | S | XSS-Prevention |
| **P1** | Audit `brainId` in `createHandler` durchreichen | Multi-Tenant | S | Audit-Isolation |
| **P1** | Stripe Customer Portal Integration | Billing | S | Self-Service Plan-Management |
| **P1** | Env-Vars von `SIGMABRAIN_*` auf `SUBSUMIO_*` migrieren (mit Backward-Compat) | Branding | M | Konsistenz |
| **P1** | `.env.example` Domain auf `subsumio.com` korrigieren | Branding | S | Korrekte SEO/Links |
| **P1** | E2E-Tests für kritische Dashboard-Seiten (Cases, Deadlines, Query, Settings) | Testing | L | Regression-Schutz |
| **P1** | Integration-Tests für Billing-Checkout + Webhook | Testing | M | Billing-Safety |
| **P1** | Approval Server-side Enforcement | Collaboration | M | Compliance |
| **P2** | Hash-Chain Verifikation (`verifyHashChain()`) | Audit | S | Tamper-Detection |
| **P2** | Account-Lockout Policy (nach N fehlgeschlagenen Versuchen) | Security | S | Brute-Force-Schutz |
| **P2** | Seiten-spezifische Loading-Skeletons | Frontend | S | UX, kein Layout-Shift |
| **P2** | Comments Delete + Edit | Collaboration | S | UX-Vervollständigung |
| **P2** | DMS Connector Error-Handling + Retry | DMS | S | Robustheit |
| **P2** | Sentry/Monitoring aktiv konfigurieren | Deployment | S | Production-Observability |
| **P2** | A11y-Tests auf alle Dashboard-Seiten ausweiten | Testing | M | WCAG-Compliance |
| **P2** | Service Worker für PWA | PWA | M | Offline-First |
| **P3** | Undo/Redo für Page-Edits | Frontend | L | UX |
| **P3** | Bulk-Actions in Data Table | Frontend | M | UX |
| **P3** | Notification-Center | Frontend | M | UX |
| **P3** | WebSocket Backend für Real-time | Collaboration | L | Live-Collaboration |
| **P3** | Advanced/Boolean-Search | Frontend | M | Power-User |
| **P3** | Stripe Proration + Invoice-Generation | Billing | M | Billing-Vervollständigung |

---

## 7.5 Production-Readiness-Matrix

| Bereich | Status | Blocker | Aufwand bis Production-Ready |
|---------|--------|---------|---------------------------|
| **Frontend** | Beta | F8 (XSS-Sanitization), F7 (Skeletons) | S–M |
| **Auth** | Beta | A1 (CSP) | S |
| **Billing** | Alpha | B6 (subscription.updated), B2 (Customer Portal) | S–M |
| **API-Architektur** | Production-nah | Audit brainId-Leak | S |
| **Audit-Trail** | Beta | brainId-Leak, keine Verifikation | S |
| **Collaboration** | Alpha | C5 (Approval Enforcement) | M |
| **DMS** | Beta | Error-Handling fehlt | S |
| **SCIM/SSO** | Beta | Filter Parser pass-all | S |
| **Deployment** | Beta | E1 (CSP), E2 (Monitoring) | S |
| **Branding** | Alpha | D1 (55 Vorkommen), D3 (Capacitor), D4 (Word-Add-In) | M |
| **Accessibility** | Alpha | Nur 10/60+ Seiten getestet | M |
| **DSGVO** | Beta | Data-Export vorhanden, Retention-Cron vorhanden — Cookie-Consent prüfen | S |
| **Multi-Tenant** | Production-nah | Audit brainId-Leak | S |
| **Test-Coverage** | Alpha | 21 Unit-Tests, 3 E2E — kritische Lücken bei API/Billing/Dashboard | L |

---

## 7.6 DSGVO-Compliance Check

| Kriterium | Status | Hinweis |
|-----------|--------|---------|
| Cookie-Consent | ✅ | `RefConsentBanner` — § 25 TTDSG, Referral-Capture nach Consent |
| Data-Export | ✅ | `/api/data-export/gdpr` + `/api/data-export/backup` |
| Data-Deletion | ⚠️ | Retention-Cron vorhanden, aber keine explizite "Recht auf Vergessenwerden" UI |
| Privacy-Page | ✅ | `/privacy` Route vorhanden |
| Terms-Page | ✅ | `/terms` Route vorhanden |
| Imprint-Page | ✅ | `/imprint` Route vorhanden |
| Audit-Trail | ✅ | Hash-chained, tamper-evident |

---

## 7.7 Test-Coverage-Summary

### Vorhandene Tests (21 Unit + 3 E2E)

| Test-File | Bereich | Typ |
|---|---|---|
| `src/lib/auth/password.test.ts` | Password Hashing | Unit |
| `src/lib/auth/rate-limit.test.ts` | Rate Limiting | Unit |
| `src/lib/auth/session.test.ts` | Session Management | Unit |
| `src/lib/csrf.test.ts` | CSRF | Unit |
| `src/lib/encryption.test.ts` | Encryption | Unit |
| `src/lib/permissions.test.ts` | RBAC | Unit |
| `src/lib/plans.test.ts` | Plans/Quota | Unit |
| `src/lib/legal-deadlines.test.ts` | Fristen | Unit |
| `src/lib/ai-deadline-detect.test.ts` | Fristen-Erkennung | Unit |
| `src/lib/gobd.test.ts` | GoBD | Unit |
| `src/lib/gobd-verfahrensdoku.test.ts` | Verfahrensdoku | Unit |
| `src/lib/rvg.test.ts` | RVG | Unit |
| `src/lib/search-params.test.ts` | Search Params | Unit |
| `src/lib/markdown.test.ts` | Markdown | Unit |
| `src/lib/sanitize-html.test.ts` | HTML Sanitization | Unit |
| `src/lib/prompt-sanitizer.test.ts` | Prompt Sanitization | Unit |
| `src/lib/upload-validation.test.ts` | Upload Validation | Unit |
| `src/lib/industry-pack.test.ts` | Industry Pack | Unit |
| `src/lib/kanzlei-settings.test.ts` | Kanzlei Settings | Unit |
| `src/lib/hooks/use-dashboard-form.test.ts` | Dashboard Form Hook | Unit |
| `src/components/ui/button.test.tsx` | Button Component | Unit |
| `tests/e2e-playwright/a11y.spec.ts` | Accessibility (6 pages) | E2E |
| `tests/e2e-playwright/accessibility.spec.ts` | Accessibility (10 pages) | E2E |
| `tests/e2e-playwright/auth-flow.spec.ts` | Auth Flow | E2E |
| `tests/e2e/kanzlei-smoke.mjs` | Kanzlei Smoke | E2E |

### Fehlende Tests (kritisch)

- ❌ Dashboard-Seiten (50+): 0 E2E-Tests
- ❌ API Routes (68): 0 Integration-Tests
- ❌ Billing/Checkout-Flow: 0 Tests
- ❌ Stripe-Webhook: 0 Tests
- ❌ SCIM-Endpoints: 0 Tests
- ❌ DMS-Connectors: 0 Tests
- ❌ Real-time/WebSocket: 0 Tests
- ❌ Approval-Workflow: 0 Tests
- ❌ Comments: 0 Tests
- ❌ Quota-Enforcement: 0 Tests (Unit-Test für `plans.ts` vorhanden, aber keine Integration)
- ❌ Audit-Trail (hash-chain): 0 Tests
- ❌ 2FA-Flow: 0 Tests
- ❌ SSO-Flow: 0 Tests
- ❌ Password-Reset-Flow: 0 Tests
- ❌ Org-Membership: 0 Tests
- ❌ Data-Export: 0 Tests
- ❌ PWA/Offline-Sync: 0 Tests
- ❌ Command-Palette: 0 Tests
- ❌ Agent-Builder: 0 Tests
- ❌ Data-Table: 0 Tests
- ❌ UI-Komponenten: 1/45 getestet

---

## 7.8 Architektur-Diagramm (verifiziert)

```
Browser / Mobile / Word-Add-In
  ↓
Vercel Edge (Middleware: Auth + CSRF + Security Headers)  ✅ verifiziert
  ↓
Next.js App Router (SSR/ISR)
  ├── Marketing Pages (Landing, Pricing, Features, Compare)  ✅
  ├── Auth Pages (Login, Signup, Forgot, Reset, 2FA)  ✅
  ├── Dashboard (50+ Seiten, Kanzlei-OS)  ✅
  ├── Admin (Mailbox, User-Management)  ✅
  └── API Routes (68 route.ts, 38 Endpoint-Gruppen)  ✅
       ↓
  createHandler Guard-Chain:  ✅ verifiziert
  1. CORS preflight
  2. Engine config check
  3. Auth + RBAC + Rate-Limit + Quota (requireEngineContext)
  4. CSRF (double-submit, state-changing only)
  5. Zod validation (body + query)
  6. Handler execution
  7. Audit log (fire-and-forget, success only)
  8. Cache headers (GET)
  9. CORS headers
       ↓
  Subsumio Brain Engine (Server)
  ├── Engine Proxy (src/lib/engine.ts)  ✅ x-subsumio-source header
  ├── Auth Store (Postgres / JSON-File)  ✅
  ├── Audit Trail (Postgres, hash-chained)  ✅ (brainId-Leak)
  ├── Usage Metering (Postgres / JSON-File)  ✅
  ├── Quota Tracking (Postgres, atomic)  ✅
  └── Encryption (AES-256-GCM at rest)  ✅
       ↓
  External Services:
  ├── Stripe (Billing)  ✅ (unvollständig)
  ├── WorkOS (SSO/SCIM)  ✅
  ├── Upstash Redis (Rate-Limit)  ✅
  ├── Postgres (Auth, Audit, Usage, Quota)  ✅
  ├── iManage / NetDocuments (DMS)  ✅ (rudimentär)
  ├── DocuSign (Signature)  ✅
  ├── WhatsApp (Messaging)  ✅
  ├── beA (Anwaltsportal)  ✅
  └── Google / Dropbox (Connectors)  ✅
```

---

## 7.9 Definition of Done — Beantwortung

1. **Dashboard production-ready?** → **Nein (Beta)** — funktional, aber keine Skeletons, keine Tests, `dangerouslySetInnerHTML`-Risiko
2. **Auth & Security production-ready?** → **Fast (Beta)** — solide Fundamente, aber CSP fehlt (P0)
3. **Billing korrekt?** → **Nein (Alpha)** — Checkout funktioniert, aber Webhook unvollständig, kein Customer Portal
4. **API-Architektur korrekt?** → **Ja (82%)** — Guard-Chain exzellent, Audit/Quota-Coverage lückenhaft
5. **Audit-Trail korrekt?** → **Beta** — Hash-Chain gut, aber brainId-Leak über `createHandler`
6. **Collaboration production-ready?** → **Nein (Alpha)** — Approval ohne Enforcement, Real-time ohne Backend
7. **DMS-Integration korrekt?** → **Beta** — Interface sauber, Connectors ohne Error-Handling
8. **SCIM/SSO korrekt?** → **Beta** — Vollständig, Filter Parser pass-all fallback
9. **Deployment-Pipeline korrekt?** → **Beta** — CI/CD gut, CSP fehlt, Monitoring optional
10. **Branding konsistent?** → **Nein (Alpha)** — 55 SigmaBrain-Vorkommen, Capacitor + Word-Add-In nicht rebranded
11. **Accessibility korrekt?** → **Alpha** — nur 10/60+ Seiten getestet
12. **DSGVO-Compliance korrekt?** → **Beta** — Cookie-Consent, Data-Export, Retention vorhanden
13. **Multi-Tenant-Isolation korrekt?** → **Production-nah (85%)** — Audit brainId-Leak ist einziger Blocker
14. **Test-Coverage ausreichend?** → **Nein (Alpha)** — 21 Unit + 3 E2E, kritische Lücken bei API/Billing/Dashboard

---

*Audit durchgeführt am 2026-06-19 durch Cascade (Principal Engineer Mode).*
*Audit-Prompt 3 von 3 — SaaS-Applikationsschicht.*
