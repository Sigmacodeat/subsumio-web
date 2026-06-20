# Audit Report 3: Subsumio SaaS-Applikationsschicht

> **Audit-Datum:** 20. Juni 2026
> **Auditor:** Principal Engineer + QA Lead (Cascade)
> **Audit-Prompt:** `BRAIN_ENGINE_AUDIT_PROMPT_3_SAAS_APPLICATION.md`
> **Codebase:** `/Users/msc/subsumio-web` — Subsumio Web (Next.js 15 + gbrain Engine)
> **Methode:** Vollständige Code-Inspection aller 9 Phasen. Jede Feststellung durch Code-Zeilen belegbar.

---

## 7.1 SaaS-Layer Executive Summary

| Bereich | Score | Status |
|---------|-------|--------|
| **Frontend / Dashboard** | 78% | Beta — funktional, 10/54 per-page Loading + Error-Boundaries für Kern-Seiten, Rest nutzt Fallback |
| **Auth & Security** | 82% | Production-Ready mit Blocker (CSP fehlt) |
| **Billing & Quota** | 75% | Beta — Stripe-Integration korrekt, aber kein Customer Portal, soft-gating only |
| **API-Architektur** | 88% | Production-Ready — createHandler-Guard-Chain exzellent |
| **Collaboration** | 45% | Alpha — Real-time ohne Backend, Comments rudimentär, Approval ok |
| **Deployment** | 70% | Beta — CI/CD ok, aber CSP fehlt, kein Staging |
| **Branding** | 60% | Beta — UI ist clean, aber Env-Vars, Capacitor, Word-Add-In noch SigmaBrain |
| **Accessibility** | 35% | Alpha — nur 10 von 60+ Seiten getestet |
| **Test-Coverage** | 25% | Alpha — 21 Unit-Tests, 7 E2E, aber 0 API-Route-Tests, 0 Dashboard-Tests |
| **Gesamt SaaS Layer** | **64%** | **Beta — Kern-Architektur solide, aber Production-Readiness erfordert P0-Fixes** |

---

## 7.2 Bereich-Weise Detail-Analyse

### 7.2.1 Frontend / Dashboard / Kanzlei-OS

**Status:** Beta

**Befund:**

- **54 Dashboard-Seiten** (`page.tsx` unter `src/app/dashboard/`) — entspricht der Angabe "50+".
- **12 Kern-Komponenten** unter `src/components/dashboard/` — alle vorhanden:
  - `sidebar.tsx` (19893 bytes), `topbar.tsx` (12124 bytes), `command-palette.tsx` (14219 bytes), `agent-builder.tsx` (42062 bytes), `data-table.tsx` (13362 bytes), `model-selector.tsx` (6633 bytes), `search-bar.tsx` (1664 bytes), `stats-card.tsx` (2607 bytes), `page-header.tsx` (1853 bytes), `empty-state.tsx` (1272 bytes), `filter-chip.tsx` (1348 bytes), `skeleton.tsx` (3923 bytes)
- **Dashboard-Layout** (`src/app/dashboard/layout.tsx:60-99`): Sidebar + Topbar + Command Palette (Cmd+K), Theme-Toggle (Light/Dark), Realtime-Init, Industry-Theming. Mobile-Drawer vorhanden.
- **EmptyState-Komponente** (`src/components/dashboard/empty-state.tsx:16-33`): Sauber implementiert mit Icon, Title, Description, Action-Button. Wird in 56 Dateien referenziert (246 Matches).
- **Loading-States:** **11 `loading.tsx`** gefunden (10 per-page + 1 dashboard-level). Pages mit eigenem Loading: agents, brain, cases, contacts, deadlines, invoicing, query, settings, team, vault. Rest (44 Seiten) nutzt Dashboard-Level-Fallback.
- **Error-States:** **11 `error.tsx`** gefunden (10 per-page + 1 dashboard-level). Pages mit eigenem Error-Boundary: agents, brain, cases, contacts, deadlines, invoicing, query, settings, team, vault. Dashboard-Level (`src/app/dashboard/error.tsx:1-44`): Error-Message + Retry-Button, Sentry-Integration in Production. **44 von 54 Seiten** haben keine eigene `error.tsx`.
- **Responsive:** Layout verwendet `md:hidden` für Mobile-Drawer, `flex h-screen` für Desktop. Grundsätzlich responsive, aber nicht pro-Seite verifizierbar ohne Browser-Test.

**Gefundene Issues:**

| # | Issue | Severity | Code-Beleg |
|---|-------|----------|------------|
| F1 | 44 von 54 Seiten haben keine eigene `loading.tsx` | 🟡 | 11 `loading.tsx` gefunden (10 per-page + 1 dashboard-level) |
| F2 | 44 von 54 Seiten haben keine eigene `error.tsx` | 🟡 | 11 `error.tsx` gefunden (10 per-page + 1 dashboard-level) |
| F3 | Kein Undo/Redo für Page-Edits | 🟡 | Nicht in Codebase gefunden |
| F4 | Keine Bulk-Actions in Data Table | 🟡 | `data-table.tsx` — kein `selectedRows`-Property |
| F5 | Keine Custom-Dashboard-Widgets | 🟡 | `page.tsx` ist statisch |
| F6 | Kein Notification-Center | 🟡 | Kein `/dashboard/notifications/` gefunden |

**Empfohlene Aktionen:**
1. Per-page `loading.tsx` für alle 54 Seiten hinzufügen (Skeleton-basiert)
2. Per-page `error.tsx` für kritische Seiten (Cases, Deadlines, Query)
3. Bulk-Actions in `data-table.tsx` implementieren

---

### 7.2.2 Auth & Security

**Status:** Production-Ready mit einem kritischen Blocker

**Guard-Chain (9 Schichten) — verifiziert in `src/lib/api-handler.ts:212-303`:**

```
1. Engine config check     → api-handler.ts:218-219
2. Auth (session → ctx)    → api-handler.ts:233-240 → engine.ts:119-146
3. RBAC (can(user, action))→ engine.ts:129-131 → permissions.ts:120-124
4. CSRF (double-submit)    → api-handler.ts:243-244 → csrf.ts:32-48
5. Rate limit (per-user)   → engine.ts:134-135 → rate-limit-api.ts:38-61
6. Quota (optional)        → engine.ts:138-143 → plans.ts:168-225
7. Zod validation          → api-handler.ts:250-260
8. Handler execution       → api-handler.ts:265
9. Audit log (fire-and-forget) → api-handler.ts:279-292
```

**Session-Implementierung (`src/lib/auth/session-core.ts`):**
- HMAC-SHA-256 via Web Crypto, Edge-safe: `session-core.ts:83-91`
- 30-Tage TTL: `session-core.ts:15` — `SESSION_TTL_SECONDS = 30 * 24 * 3600`
- Revocation: Version-basiert, 60s Cache-Window: `session-core.ts:33-58`
- Cookie: `httpOnly` nicht in `session-core.ts` gesetzt (wird in Login-Route gesetzt)
- AUTH_SECRET-Check: Production → throw, Dev → fallback: `session-core.ts:61-68`

**CSRF (`src/lib/csrf.ts`):**
- Double-Submit Pattern: Cookie `sb_csrf` (non-httpOnly) + Header `x-csrf-token`: `csrf.ts:12-13`
- Timing-safe comparison: `csrf.ts:42-47`
- Exemptions korrekt: login, signup, forgot, reset, 2fa-login, cron, webhook: `middleware.ts:25-33`
- `csrfFetch()` Wrapper für Client: `csrf.ts:64-81`

**Rate-Limiting (`src/lib/auth/rate-limit.ts` + `src/lib/rate-limit-api.ts`):**
- 3 Tiers: standard (120/min), search (60/min), heavy (30/min): `rate-limit-api.ts:17-21`
- Upstash Redis (REST) mit in-memory + file-based Fallback: `rate-limit.ts:95-159`
- Per-User-Key (nicht IP) für authentifizierte Routes: `rate-limit-api.ts:32`
- Per-IP für auth-routes (login, forgot, reset): `auth/login/route.ts:13`

**Password (`src/lib/auth/password.ts`):**
- scrypt mit N=16384, r=8, p=1, KEYLEN=64: `password.ts:10`
- Format: `s2:<salt-hex>:<hash-hex>`: `password.ts:19`
- Timing-safe comparison: `password.ts:27`

**2FA:**
- TOTP Secret encrypted at rest: `store.ts:37` — `twoFactorSecret?: string | null`
- Pending Secret mit 10min Expiry: `store.ts:41-43`
- Backup Codes: SHA-256 hashed, 10 codes, format XXXX-XXXX-XXXX: `backup-codes.ts:11-27`
- Challenge Token: 5min TTL, purpose=2fa_challenge: `tokens.ts:24`

**Encryption (`src/lib/encryption.ts`):**
- AES-256-GCM via Web Crypto: `encryption.ts:43-51`
- Production-Check: throw wenn `SIGMABRAIN_ENCRYPTION_KEY` fehlt: `encryption.ts:14-18`
- Dev-Fallback: `sbplain:` Marker: `encryption.ts:60-62`
- Encrypted fields: openaiKey, anthropicKey, docusignTokens, twoFactorSecret, pendingTwoFactorSecret

**RBAC (`src/lib/permissions.ts`):**
- 4 Rollen: admin, lawyer, assistant, client_viewer: `store.ts:13`
- 30+ Route-Actions: `permissions.ts:48-81`
- `can()` Funktion: `permissions.ts:120-124`
- `auditActionFor()` Mapping: `permissions.ts:135-172`
- client_viewer: Nur `brain.read` + `settings.read`: `permissions.ts:84,94`

**Gefundene Issues:**

| # | Issue | Severity | Code-Beleg |
|---|-------|----------|------------|
| A1 | **Keine CSP (Content-Security-Policy)** | 🔴 P0 | `vercel.json:12-23` — nur X-Frame-Options, HSTS, etc., keine CSP |
| A2 | Revocation fail-open bei Network-Error | 🟡 | `session-core.ts:55-57` — `catch → return 0 = valid` |
| A3 | Session-TTL 30 Tage, kein Refresh-Token | 🟡 | `session-core.ts:15` |
| A4 | Dev-Encryption-Key hardcoded | 🟡 | `encryption.ts:23` — `"subsumio-dev-encryption-key-32chars!"` |
| A5 | Kein Account-Lockout (nur Rate-Limit) | 🟡 | Kein Lockout-Code gefunden |
| A6 | CORS `Access-Control-Allow-Origin: *` | 🟡 | `api-handler.ts:97` — nur für `cors:true` Routes, aber wildcard |

**Empfohlene Aktionen:**
1. **P0:** CSP-Header in `vercel.json` hinzufügen: `default-src 'self'; script-src 'self' 'unsafe-inline'; ...`
2. Revocation fail-open dokumentieren oder fail-closed mit Cache-Verlängerung
3. Account-Lockout nach N fehlgeschlagenen Versuchen implementieren

---

### 7.2.3 API-Architektur

**Status:** Production-Ready

**Befund:**

- **116 API-Route-Dateien** (`route.ts`) unter `src/app/api/`
- **78 von 116 Routes (67%)** verwenden `createHandler` / `createPublicHandler` / `createWebhookHandler`
- **38 Routes** verwenden manuelle `export async function` — alle legitim:
  - **15 Auth-Routes** (login, signup, forgot, reset, 2fa, sso, logout, me, verify, register) — sie SIND das Auth-System
  - **6 Cron-Routes** — verwenden `CRON_SECRET` Bearer-Auth: z.B. `cron/deadlines/route.ts:163-165`
  - **6 SCIM-Routes** — verwenden `SCIM_BEARER_TOKEN`: `scim/Users/route.ts`, `scim/Groups/route.ts`
  - **4 Webhook-Routes** — verwenden Signature-Verification: `billing/webhook`, `whatsapp/webhook`, `docusign/webhook`, `email/webhook/resend`
  - **3 Public/Special:** `health/route.ts`, `demo/route.ts`, `internal/revocation-check/route.ts`
  - **4 Andere:** `legal/analyze` (internal-secret auth), `marketing-agent` (IP rate-limit), `email/dev-catch` (dev-only), `docusign/auth` (OAuth flow)

**createHandler Guard-Chain (`src/lib/api-handler.ts:200-304`):**
- Alle 9 Schichten korrekt implementiert und in richtiger Reihenfolge
- Zod-Validation für Body und Query: `api-handler.ts:147-193`
- Error-Handling: AppError → strukturierte Response, sonst 500: `api-handler.ts:266-276`
- Audit: fire-and-forget nach erfolgreichem Handler: `api-handler.ts:279-292`
- Cache-Control für GET: `api-handler.ts:295-300`
- maxDuration exportierbar: `api-handler.ts:77`

**Beleg für Audit-Specs (Auswahl):**
- `billing/checkout/route.ts:15-19` — audit mit action, entityType, details
- `legal/contract-draft/route.ts:22-27` — audit mit action, entityType
- `upload/route.ts:10-15` — audit mit quota recording

**Gefundene Issues:**

| # | Issue | Severity | Code-Beleg |
|---|-------|----------|------------|
| API1 | `legal/analyze/route.ts` verwendet manuelle Auth statt createHandler | 🟡 | `legal/analyze/route.ts:264` — `export async function POST` |
| API2 | `email/dev-catch/route.ts` hat keine Audit-Logs | 🟡 | `email/dev-catch/route.ts:41` — manueller Handler |
| API3 | `marketing-agent/route.ts` hat kein Audit | 🟡 | `marketing-agent/route.ts:155` — manueller Handler |

**Empfohlene Aktionen:**
1. `legal/analyze` auf createHandler mit `public: true` oder speziellem Auth-Modus migrieren
2. Dev-only Routes mit `createPublicHandler` wrappen für konsistente Validation

---

### 7.2.4 Billing & Quota

**Status:** Beta

**Stripe-Checkout (`src/app/api/billing/checkout/route.ts`):**
- createHandler-wrapped mit Zod-Schema (`plan: z.enum(["pro", "team"])`): `route.ts:6-8`
- Audit-Spec vorhanden: `route.ts:15-19`
- Stripe Checkout Session via fetch (kein SDK): `route.ts:45-52`
- `client_reference_id`, `customer_email`, `metadata[plan]`, `metadata[user_id]` korrekt gesetzt: `route.ts:36-39`
- Referral-Integration: `metadata[referred_by]` wenn vorhanden: `route.ts:42`
- success/cancel URLs: `route.ts:40-41`

**Stripe-Webhook (`src/app/api/billing/webhook/route.ts`):**
- Signature-Verification: HMAC-SHA256, 5min Tolerance, timing-safe compare: `route.ts:10-24`
- Event-Handling: `checkout.session.completed` → Plan-Update + StripeCustomerId: `route.ts:52-61`
- `customer.subscription.deleted` → Downgrade to free: `route.ts:63-71`
- **Keine Idempotency-Prüfung** — Event könnte doppelt verarbeitet werden

**Plan-Limits (`src/lib/plans.ts`):**
- 4 Pläne: free (200p/100q/1s), pro (25k/2k/1s), team (100k/10k/5s), enterprise (1M/100k/25s): `plans.ts:20-25`
- Quota-Tabelle: `subsumio_quota` mit `brain_id`, `month`, `queries`, `pages`, `uploads`: `plans.ts:81-89`
- Atomic check-and-reserve in Postgres: `plans.ts:185-209` — BEGIN/COMMIT/ROLLBACK
- File-based Fallback für Dev: `plans.ts:222-224`
- **Soft-Gating only (V1):** `plans.ts:7` — "we show usage and warn, we don't cut anyone off"

**Usage-Metering (`src/lib/usage.ts`):**
- `subsumio_usage` Tabelle: `brain_id`, `month`, `queries`: `usage.ts:42-48`
- Per-Query-Counter, per-brainId, per-month: `usage.ts:55-66`
- 12-Monate-Retention im File-Modus: `usage.ts:109-110`

**Gefundene Issues:**

| # | Issue | Severity | Code-Beleg |
|---|-------|----------|------------|
| B1 | Keine Stripe-Webhook-Idempotency | 🟡 | `billing/webhook/route.ts:52-61` — kein Event-ID-Check |
| B2 | Kein Stripe Customer Portal | 🟡 | Kein `/api/billing/portal` Route gefunden |
| B3 | Keine Proration-Logic | 🟡 | Kein `customer.subscription.updated` Handler |
| B4 | Quota soft-gating only | 🟡 | `plans.ts:7` — "V1 is display + soft gating only" |
| B5 | Enterprise-Plan ohne Self-Serve | 🟡 | Kein `enterprise` in `BILLABLE_PLANS`: `plans.ts:18` |

**Empfohlene Aktionen:**
1. Webhook-Idempotency: Event-ID in `subsumio_audit_log` oder separater Tabelle tracken
2. Stripe Customer Portal Integration für Self-Serve Plan-Management
3. `customer.subscription.updated` Handler für Proration

---

### 7.2.5 Multi-Tenant-Isolation

**Status:** Production-Ready

**Befund:**

- **brainId-Resolution:** `src/lib/engine.ts:57-79` — User → `user.brainId` oder Org → `org.brainId`
- **Engine-Header:** `x-subsumio-source: brainId` — server-to-server only: `engine.ts:75`
- **Org-Membership:** User mit `orgId` → shared `org.brainId` + Owner's Plan: `engine.ts:66-73`
- **Quota-Isolation:** `subsumio_quota` mit `brain_id` als PK-Teil: `plans.ts:82-89`
- **Usage-Isolation:** `subsumio_usage` mit `brain_id` als PK-Teil: `usage.ts:42-48`
- **Audit-Isolation:** `subsumio_audit_log` mit `brain_id` pro Row + Index: `audit.ts:23-38`
- **brainId nie client-kontrollierbar:** Header wird server-seitig gesetzt: `engine.ts:6` — "the browser can never choose a tenant"
- **Trusted-Server-Helper:** `engineHeadersForBrain()` für Cron/Webhooks: `engine.ts:100-105`

**Gefundene Issues:**

| # | Issue | Severity | Code-Beleg |
|---|-------|----------|------------|
| MT1 | `docusign/webhook/route.ts` verwendet `SIGMABRAIN_BRAIN` als Fallback | 🟡 | `docusign/webhook/route.ts:73` — `process.env.SIGMABRAIN_BRAIN \|\| "default"` |
| MT2 | `listAuditLogs` ohne `brainId`-Filter returned ALL logs | 🟡 | `audit.ts:136` — `if (opts?.brainId)` ist optional |

**Empfohlene Aktionen:**
1. DocuSign-Webhook: Tenant-Auflösung über Envelope-Metadata statt Env-Var
2. `listAuditLogs` sollte `brainId` als Pflicht-Parameter erzwingen

---

### 7.2.6 Collaboration Features

**Status:** Alpha

**Approval (`src/lib/approval.ts`):**
- 4 Action-Types: `document_finalize`, `deadline_create`, `booking_create`, `message_send`: `approval.ts:13-17`
- Alle 4 require approval: `approval.ts:38-43`
- Status: pending → approved/rejected: `approval.ts:19`
- Frontmatter-Schema für Brain-Pages: `approval.ts:62-79`
- EU-AI-Act-Annex-III-Compliance: Human oversight für risikoreiche Aktionen: `approval.ts:5-10`

**Comments (`src/lib/comments.ts`):**
- Create + List implementiert: `comments.ts:31-93`
- Thread-Support via `thread_id`: `comments.ts:52`
- **Keine Delete-Funktion:** Nicht in Code gefunden
- **Keine @mention-Notifications:** Nicht in Code gefunden
- **Keine Reply-Struktur:** Nur flache Liste mit `thread_id`

**Real-time (`src/lib/realtime.ts`):**
- Native WebSocket, kein externe Lib: `realtime.ts:27`
- Auto-Reconnect mit exponentiellem Backoff (max 5 Attempts): `realtime.ts:20-22, 73-81`
- Message-Queue while disconnected: `realtime.ts:31, 97-103`
- Graceful Degradation: `if (!WS_URL) return` — `realtime.ts:35`
- **Kein WS-Backend vorhanden:** `NEXT_PUBLIC_WS_URL` nicht in `.env.example` → Real-time deaktiviert

**Gefundene Issues:**

| # | Issue | Severity | Code-Beleg |
|---|-------|----------|------------|
| C1 | Real-time ohne WS-Backend | 🟡 | `realtime.ts:19` — `NEXT_PUBLIC_WS_URL \|\| ""` |
| C2 | Keine @mention-Notifications | 🟡 | `comments.ts` — keine mention-Logik |
| C3 | Keine Comment-Delete | 🟡 | `comments.ts` — nur `addComment` + `listComments` |
| C4 | Keine Activity-Feed | 🟡 | Kein `/dashboard/activity` gefunden |

**Empfohlene Aktionen:**
1. WS-Backend aufsetzen (Pusher, Ably, oder eigener WS-Server) und `NEXT_PUBLIC_WS_URL` konfigurieren
2. Comment-Delete und Reply-Funktion implementieren
3. @mention-System mit Notification-Queue

---

### 7.2.7 DMS-Integration

**Status:** Beta

**Befund:**

- **Interface** (`src/lib/dms/index.ts:29-36`): `search`, `getDocument`, `getFolderContents`, `importToBrain`
- **2 Connectors:** iManage (`dms/imanager.ts`), NetDocuments (`dms/netdocuments.ts`)
- **Lazy-Loading** zur Vermeidung von Circular Deps: `dms/index.ts:42-45`
- **Konfiguration** via Env-Vars: `DMS_PROVIDER`, `DMS_BASE_URL`, `DMS_API_KEY`/`DMS_CLIENT_ID`/`DMS_CLIENT_SECRET`
- **3 API-Routes** verwenden createHandler: `dms/search`, `dms/import`, `dms/status`

---

### 7.2.8 SCIM / SSO

**Status:** Beta

**Befund:**

- **SCIM 2.0 Implementierung** (`src/lib/scim.ts`): 740 Zeilen, vollständige Type-Definitions, User/Group CRUD
- **Bearer-Token Auth** für inbound SCIM: `scim.ts:11` — `SCIM_BEARER_TOKEN`
- **WorkOS Directory Sync** Client: `scim.ts:8`
- **6 SCIM-API-Routes:** `scim/Users`, `scim/Users/[id]`, `scim/Groups`, `scim/Groups/[id]`, `scim/status`, `scim/sync`
- **SSO via WorkOS:** `src/lib/workos.ts`, `auth/sso/workos/route.ts`, `auth/sso/callback/route.ts`
- **State-CSRF-Schutz** im SSO-Callback: `auth/sso/callback/route.ts:13` — "validiert den State"

---

### 7.2.9 Deployment & DevOps

**Status:** Beta

**Vercel-Config (`vercel.json`):**
- **6 Cron-Jobs:** deadlines (06:00), deadline-reminders (07:00), case-law (06:30), regulatory-monitors (06:45), case-scanner (02:00), retention (08:00): `vercel.json:4-11`
- **Security-Headers:** X-Frame-Options: DENY, X-Content-Type-Options: nosniff, HSTS (2 Jahre), Referrer-Policy, Permissions-Policy: `vercel.json:12-23`
- **CSP fehlt:** 🔴 Kein Content-Security-Policy Header

**CI/CD:**
- `ci.yml`, `e2e.yml`, `heavy-tests.yml` unter `.github/workflows/`
- Husky Pre-Commit + Pre-Push Hooks: `.husky/pre-commit`, `.husky/pre-push`

**Environment-Validation (`src/lib/env-validate.ts`):**
- 9 Env-Vars geprüft (7 required, 2 optional): `env-validate.ts:13-23`
- Production-Check: `env-validate.ts:38` — `if (spec.required && isProd && !value)`

**Gefundene Issues:**

| # | Issue | Severity | Code-Beleg |
|---|-------|----------|------------|
| E1 | **Keine CSP-Header** | 🔴 P0 | `vercel.json:12-23` — keine CSP |
| E2 | Kein Staging-Environment dokumentiert | 🟡 | Kein `staging` in Config gefunden |
| E3 | Sentry optional, nicht required | 🟡 | `env-validate.ts:22` — `required: false` |

---

### 7.2.10 Branding-Konsistenz

**Status:** Beta — UI ist clean, aber Infrastruktur nicht

**Befund:**

- **55 Vorkommen** von "sigmabrain"/"SigmaBrain"/"SIGMABRAIN" in **34 Dateien** unter `src/`
- **0 Vorkommen** in `.tsx`-Dateien unter `src/app/` — **User-facing UI ist vollständig auf Subsumio gebrandet!**
- **0 Vorkommen** in `.tsx`-Dateien unter `src/components/` — **Komponenten sind clean!**

**Verbleibende SigmaBrain-Vorkommen nach Kategorie:**

| Kategorie | Dateien | Beispiele |
|-----------|---------|-----------|
| **Env-Vars** | 8 | `SIGMABRAIN_API_URL`, `SIGMABRAIN_ENCRYPTION_KEY`, `SIGMABRAIN_AUTH_DATABASE_URL`, `SIGMABRAIN_DATA_DIR`, `SIGMABRAIN_WEB_API_KEY`, `SIGMABRAIN_INTERNAL_SECRET` |
| **Code-Kommentare/JSDoc** | 12 | `audit.ts:2` — "Audit-Trail Logger für SigmaBrain", `comments.ts:2` — "Kommentar-Thread System für SigmaBrain", `realtime.ts:7` — "Real-time Sync Layer für SigmaBrain" |
| **API-Route-Code** | 6 | `legal/analyze/route.ts:17` — `SIGMABRAIN_INTERNAL_SECRET`, `demo/route.ts:16-19` — `SIGMABRAIN_API_URL`, `SIGMABRAIN_DEMO_BRAIN` |
| **Capacitor** | 1 | `capacitor.config.ts:15` — `appId: "com.sigmabrain.app"`, `appName: "Sigmabrain"`, `sigmabrain.com` |
| **Word-Add-In** | 1 | `word-addin/manifest.xml` — 15+ Vorkommen: "SigmaBrain für Word", `sigmabrain.com`, `SigmaBrain.Group` |
| **.env.example** | 1 | `NEXT_PUBLIC_SITE_URL=https://sigmabrain.com`, `SIGMABRAIN_*` Env-Vars |

**Gefundene Issues:**

| # | Issue | Severity | Code-Beleg |
|---|-------|----------|------------|
| D1 | Capacitor App-ID `com.sigmabrain.app` | 🟡 | `capacitor.config.ts:15` |
| D2 | Capacitor appName "Sigmabrain" | 🟡 | `capacitor.config.ts:16` |
| D3 | Capacitor server.url `sigmabrain.com` | 🟡 | `capacitor.config.ts:19` |
| D4 | Word-Add-In Manifest: 15+ SigmaBrain-Vorkommen | 🟡 | `word-addin/manifest.xml:7-84` |
| D5 | .env.example: `NEXT_PUBLIC_SITE_URL=https://sigmabrain.com` | 🟡 | `.env.example:8` |
| D6 | Env-Var-Prefix `SIGMABRAIN_*` (12+ Vars) | 🟡 | `.env.example:28,33,38,45` etc. |
| D7 | Code-Kommentare: "SigmaBrain" in 12+ Dateien | 🟢 | Kosmetisch, nicht user-facing |
| D8 | `kanzlei-flow.spec.ts` verwendet `@sigmabrain.local` in Test-Emails | 🟢 | `kanzlei-flow.spec.ts:11` — kosmetisch, nicht user-facing |

**Empfohlene Aktionen:**
1. **P1:** Capacitor-Config auf `com.subsumio.app` / "Subsumio" / `subsum.io` aktualisieren
2. **P1:** Word-Add-In Manifest vollständig rebranden
3. **P2:** `.env.example` auf `subsum.io` Domain aktualisieren
4. **P2:** Env-Var-Prefix dokumentieren als Backward-Compat oder Migration planen

---

### 7.2.11 Accessibility (WCAG 2.1 AA)

**Status:** Alpha

**Befund:**

- **2 A11y-Test-Dateien:**
  - `tests/e2e-playwright/a11y.spec.ts`: 6 public pages (`/`, `/de`, `/de/features`, `/de/pricing`, `/de/login`, `/de/signup`)
  - `tests/e2e-playwright/accessibility.spec.ts`: 6 public pages + 4 dashboard pages (`/dashboard`, `/dashboard/query`, `/dashboard/upload`, `/dashboard/settings`)
- **axe-core** mit WCAG-Tags: `wcag2a`, `wcag2aa`, `wcag21aa`: `a11y.spec.ts:12`, `accessibility.spec.ts:23`
- **Filter:** Nur `critical` + `serious` violations geprüft: `a11y.spec.ts:14-16`
- **Test-Results:** `test-results/.last-run.json` — `status: "passed"`, `failedTests: []`
- **Coverage:** 10 von 60+ Seiten getestet = **16%**

**Gefundene Issues:**

| # | Issue | Severity | Code-Beleg |
|---|-------|----------|------------|
| A11y-1 | Nur 4 von 54 Dashboard-Seiten getestet | 🟡 | `accessibility.spec.ts:43` — nur `/dashboard`, `/dashboard/query`, `/dashboard/upload`, `/dashboard/settings` |
| A11y-2 | Moderate/Minor violations nicht geprüft | 🟡 | `a11y.spec.ts:14` — filter nur `critical \|\| serious` |
| A11y-3 | Keine Keyboard-Navigation-Tests | 🟡 | Keine `keyboard`-Tests in E2E |
| A11y-4 | Keine Screen-Reader-Tests | 🟡 | Keine ARIA-Tests in E2E |

**Empfohlene Aktionen:**
1. A11y-Tests auf alle 54 Dashboard-Seiten erweitern
2. Moderate violations einbeziehen
3. Keyboard-Navigation-Tests hinzufügen (Tab-Order, Focus-Trap in Dialogs)

---

### 7.2.12 Test-Coverage

**Status:** Alpha

**Vorhandene Tests (28 Dateien):**

| Test-File | Bereich | Typ |
|---|---|---|
| `src/lib/auth/password.test.ts` | Password Hashing | Unit |
| `src/lib/auth/rate-limit.test.ts` | Rate Limiting | Unit |
| `src/lib/auth/session.test.ts` | Session Management | Unit |
| `src/lib/permissions.test.ts` | RBAC | Unit |
| `src/lib/encryption.test.ts` | Encryption | Unit |
| `src/lib/csrf.test.ts` | CSRF | Unit |
| `src/lib/plans.test.ts` | Plan-Limits/Quota | Unit |
| `src/lib/gobd.test.ts` | GoBD | Unit |
| `src/lib/gobd-verfahrensdoku.test.ts` | Verfahrensdoku | Unit |
| `src/lib/rvg.test.ts` | RVG | Unit |
| `src/lib/legal-deadlines.test.ts` | Fristen | Unit |
| `src/lib/ai-deadline-detect.test.ts` | Fristen-Erkennung | Unit |
| `src/lib/search-params.test.ts` | Search Params | Unit |
| `src/lib/sanitize-html.test.ts` | HTML Sanitization | Unit |
| `src/lib/markdown.test.ts` | Markdown | Unit |
| `src/lib/upload-validation.test.ts` | Upload Validation | Unit |
| `src/lib/kanzlei-settings.test.ts` | Kanzlei Settings | Unit |
| `src/lib/prompt-sanitizer.test.ts` | Prompt Sanitization | Unit |
| `src/lib/industry-pack.test.ts` | Industry Pack | Unit |
| `src/lib/hooks/use-dashboard-form.test.ts` | Dashboard Form Hook | Unit |
| `src/components/ui/button.test.tsx` | Button Component | Unit |
| `tests/e2e-playwright/a11y.spec.ts` | Accessibility | E2E |
| `tests/e2e-playwright/accessibility.spec.ts` | Accessibility | E2E |
| `tests/e2e-playwright/auth-flow.spec.ts` | Auth Flow | E2E |
| `tests/e2e-playwright/upload-flow.spec.ts` | Upload Flow | E2E |
| `tests/e2e-playwright/search-flow.spec.ts` | Search Flow | E2E |
| `tests/e2e-playwright/kanzlei-flow.spec.ts` | Kanzlei Flow (6 Tests: Cases, Drafting, RVG, Deadlines, Contacts, Export) | E2E |
| `tests/e2e/kanzlei-smoke.mjs` | Kanzlei Smoke Test | E2E |

**Fehlende Tests:**

| Bereich | Status | Impact |
|---|---|---|
| API Routes (116) | ❌ 0 Tests | Hoch — keine Integration-Tests für Guard-Chain |
| Dashboard-Seiten (54) | ❌ 0 Tests (nur 4 in A11y) | Hoch — keine UI-Regression-Tests |
| Billing/Checkout-Flow | ❌ | Hoch — Geldfluss ungetestet |
| Stripe-Webhook | ❌ | Hoch — Plan-Update ungetestet |
| SCIM-Endpoints | ❌ | Mittel |
| DMS-Connectors | ❌ | Mittel |
| Real-time/WebSocket | ❌ | Niedrig (deaktiviert) |
| Approval-Workflow | ❌ | Mittel |
| Comments | ❌ | Niedrig |
| Quota-Enforcement | ❌ Unit-Test vorhanden | `plans.test.ts` deckt Quota ab |
| 2FA-Flow | ❌ | Hoch — Security-Critical |
| SSO-Flow (WorkOS) | ❌ | Mittel |
| Password-Reset-Flow | ❌ | Hoch — Security-Critical |
| UI-Komponenten (45) | ❌ Nur 1 von 45 | Mittel |

---

## 7.3 Gap-Analyse (SaaS-spezifisch)

### Fehlende Frontend-Features

| # | Gap | Severity | Aufwand |
|---|-----|----------|---------|
| F1 | 44/54 Seiten ohne `loading.tsx` | 🟡 | M |
| F2 | 44/54 Seiten ohne `error.tsx` | 🟡 | M |
| F3 | Kein Undo/Redo für Page-Edits | 🟡 | L |
| F4 | Keine Bulk-Actions in Data Table | 🟡 | M |
| F5 | Kein Notification-Center | 🟡 | M |
| F6 | Keine Custom-Dashboard-Widgets | 🟡 | L |

### Security-Lücken

| # | Gap | Severity | Aufwand |
|---|-----|----------|---------|
| A1 | **Keine CSP-Header** | 🔴 P0 | S |
| A2 | Revocation fail-open | 🟡 | S |
| A3 | Session-TTL 30 Tage ohne Refresh | 🟡 | M |
| A4 | Dev-Encryption-Key hardcoded | 🟡 | S |
| A5 | Kein Account-Lockout | 🟡 | M |
| A6 | CORS Wildcard für `cors:true` Routes | 🟡 | S |

### Billing-Lücken

| # | Gap | Severity | Aufwand |
|---|-----|----------|---------|
| B1 | Keine Webhook-Idempotency | 🟡 | S |
| B2 | Kein Stripe Customer Portal | 🟡 | M |
| B3 | Keine Proration-Logic | 🟡 | M |
| B4 | Quota soft-gating only | 🟡 | M |
| B5 | Enterprise ohne Self-Serve | 🟡 | S |

### Collaboration-Lücken

| # | Gap | Severity | Aufwand |
|---|-----|----------|---------|
| C1 | Real-time ohne WS-Backend | 🟡 | L |
| C2 | Keine @mention-Notifications | 🟡 | M |
| C3 | Keine Comment-Delete | 🟡 | S |
| C4 | Keine Activity-Feed | 🟡 | M |

### Branding-Inkonsistenzen

| # | Gap | Severity | Aufwand |
|---|-----|----------|---------|
| D1 | Capacitor App-ID/Name/URL | 🟡 | S |
| D2 | Word-Add-In Manifest (15+ Vorkommen) | 🟡 | S |
| D3 | .env.example Domain | 🟡 | S |
| D4 | Env-Var-Prefix `SIGMABRAIN_*` | 🟡 | L (Breaking) |
| D5 | Code-Kommentare "SigmaBrain" | 🟢 | S |

### Deployment-Risiken

| # | Gap | Severity | Aufwand |
|---|-----|----------|---------|
| E1 | **Keine CSP-Header** | 🔴 P0 | S |
| E2 | Kein Staging-Environment | 🟡 | M |
| E3 | Sentry optional | 🟡 | S |

### Test-Coverage-Lücken

| # | Gap | Severity | Aufwand |
|---|-----|----------|---------|
| T1 | 0 API-Route-Tests (116 Routes) | 🔴 | L |
| T2 | 0 Dashboard-Seiten-Tests (54 Seiten) | 🔴 | L |
| T3 | 0 Billing-Flow-Tests | 🔴 | M |
| T4 | 0 2FA-Flow-Tests | 🔴 | M |
| T5 | 44/45 UI-Komponenten ohne Tests | 🟡 | L |

---

## 7.4 Priorisierte Action-Items

| Priority | Item | Bereich | Aufwand | Impact |
|----------|------|--------|---------|--------|
| **P0** | CSP-Header in `vercel.json` hinzufügen | Security | S | XSS-Schutz, Production-Blocker |
| **P0** | API-Route Integration-Tests (zumindest Guard-Chain) | Testing | L | Security-Regression-Schutz |
| **P0** | Billing-Flow E2E-Test (Checkout → Webhook → Plan-Update) | Testing | M | Geldfluss-Verifikation |
| **P0** | 2FA-Flow E2E-Test (Setup → Login → Backup-Code) | Testing | M | Security-Critical |
| **P1** | Per-page `loading.tsx` für alle 54 Dashboard-Seiten | Frontend | M | UX, kein Layout-Shift |
| **P1** | Per-page `error.tsx` für kritische Seiten | Frontend | M | UX, Error-Recovery |
| **P1** | Capacitor-Config rebranden (`com.subsumio.app`) | Branding | S | App-Store-Branding |
| **P1** | Word-Add-In Manifest rebranden | Branding | S | User-facing |
| **P1** | Stripe Webhook-Idempotency | Billing | S | Doppelte Events verhindern |
| **P1** | A11y-Tests auf alle 54 Dashboard-Seiten erweitern | Accessibility | M | WCAG-Compliance |
| **P2** | Stripe Customer Portal Integration | Billing | M | Self-Serve Plan-Management |
| **P2** | `listAuditLogs` brainId als Pflicht-Parameter | Multi-Tenant | S | Data-Isolation |
| **P2** | DocuSign-Webhook Tenant-Auflösung über Metadata | Multi-Tenant | M | Multi-Tenant-Safety |
| **P2** | `.env.example` auf `subsum.io` Domain | Branding | S | Konsistenz |
| **P2** | Account-Lockout nach N fehlgeschlagenen Versuchen | Security | M | Brute-Force-Schutz |
| **P2** | Bulk-Actions in Data Table | Frontend | M | Productivity |
| **P3** | Env-Var-Prefix Migration `SIGMABRAIN_*` → `SUBSUMIO_*` | Branding | L | Breaking-Change, geplant |
| **P3** | WS-Backend für Real-time | Collaboration | L | Live-Sync |
| **P3** | Comment-Delete + @mention | Collaboration | M | Collaboration |
| **P3** | Custom-Dashboard-Widgets | Frontend | L | Personalisierung |

---

## 7.5 Production-Readiness-Matrix

| Bereich | Status | Blocker | Aufwand bis Production-Ready |
|---------|--------|---------|-----------------------------|
| **Frontend** | Beta | 44/54 Seiten ohne Loading-States, 44/54 ohne Error-Boundary | M (1-2 Sprints) |
| **Auth & Security** | Beta | **CSP fehlt (P0)** | S (1 Tag) + M für Lockout |
| **API-Architektur** | ✅ Production-Ready | Keine | — |
| **Billing** | Beta | Keine Idempotency, kein Customer Portal | M (1 Sprint) |
| **Multi-Tenant** | ✅ Production-Ready | Minor: Audit-Filter optional | S |
| **Collaboration** | Alpha | Real-time ohne Backend | L (2+ Sprints) |
| **DMS** | Beta | Keine Tests | S |
| **SCIM/SSO** | Beta | Keine Tests | S |
| **Deployment** | Beta | **CSP fehlt (P0)** | S (1 Tag) |
| **Branding** | Beta | Capacitor + Word-Add-In | S (1-2 Tage) |
| **Accessibility** | Alpha | Nur 16% Coverage | M (1 Sprint) |
| **Test-Coverage** | Alpha | 0 API-Tests, 0 Dashboard-Tests | L (2+ Sprints) |
| **Audit-Trail** | ✅ Production-Ready | Keine | — |
| **Quota/Usage** | ✅ Production-Ready | Soft-gating ist V1-Design | — |

---

## 8. Definition of Done — Beantwortung

| # | Frage | Antwort |
|---|-------|---------|
| 1 | **Dashboard production-ready für Kanzlei-Alltag?** | ⚠️ Beta — funktional, aber Loading/Error-States unzureichend, keine Bulk-Actions |
| 2 | **Auth & Security production-ready?** | ⚠️ Beta — Architektur exzellent, aber **CSP fehlt (P0-Blocker)** |
| 3 | **Billing-System korrekt?** | ⚠️ Beta — Stripe-Checkout + Webhook korrekt, aber keine Idempotency, kein Customer Portal |
| 4 | **API-Handler-Architektur korrekt?** | ✅ Ja — 9-Schicht Guard-Chain ist exzellent implementiert, 67% der Routes verwenden createHandler, restliche 33% sind legitim exempt |
| 5 | **Audit-Trail korrekt?** | ✅ Ja — Hash-Chain (SHA-256), Multi-Tenant-Isolation (brain_id), Fire-and-Forget, Postgres + Dev-Fallback |
| 6 | **Collaboration production-ready?** | ❌ Alpha — Real-time ohne Backend, Comments rudimentär, Approval ok |
| 7 | **DMS-Integration korrekt?** | ✅ Beta — Interface + 2 Connectors + 3 API-Routes, lazy-loading, konfigurierbar |
| 8 | **SCIM/SSO korrekt?** | ✅ Beta — SCIM 2.0 + WorkOS SSO, Bearer-Auth, State-CSRF |
| 9 | **Deployment-Pipeline korrekt?** | ⚠️ Beta — CI/CD ok, 6 Crons ok, aber **CSP fehlt** |
| 10 | **Branding konsistent?** | ⚠️ Beta — UI clean (0 SigmaBrain in .tsx), aber Capacitor + Word-Add-In + Env-Vars noch SigmaBrain |
| 11 | **Accessibility korrekt?** | ❌ Alpha — nur 10/60+ Seiten getestet, keine Keyboard/Screen-Reader-Tests |
| 12 | **DSGVO-Compliance korrekt?** | ✅ Ja — Data-Export (Art. 15), Retention-Cron, Cookie-Consent (§ 25 TTDSG), Privacy/Terms/Imprint-Seiten |
| 13 | **Multi-Tenant-Isolation korrekt?** | ✅ Ja — brainId durch alle Schichten (Engine, Quota, Usage, Audit), Org-Membership, server-only Header |
| 14 | **Test-Coverage ausreichend?** | ❌ Alpha — 28 Tests gesamt (21 Unit + 7 E2E), aber 0 API-Route-Tests, 0 Dashboard-Tests, 1/45 UI-Komponenten-Tests |

---

## 9. Architektur-Stärken

1. **createHandler Guard-Chain** — 9-Schicht-Pipeline ist State-of-the-Art: Engine → Auth → RBAC → CSRF → Rate-Limit → Quota → Zod → Handler → Audit. Jede Schicht short-circuited mit korrektem HTTP-Status.

2. **Multi-Tenant-Isolation** — brainId-Propagation via `x-subsumio-source` Header, server-only gesetzt. Org-Membership wechselt brain + plan. Quota/Usage/Audit alle per brain_id isoliert.

3. **Edge-safe Session** — HMAC-SHA-256 via Web Crypto, keine Node.js-Abhängigkeiten in Middleware. Revocation-Check mit 60s Cache via internem HTTP-Endpoint.

4. **Quota Atomic Check-and-Reserve** — Postgres-Transaction mit `BEGIN/FOR UPDATE/COMMIT/ROLLBACK` verhindert Race-Conditions bei concurrent Requests.

5. **CSRF Double-Submit** — Timing-safe comparison, korrekte Exemptions, `csrfFetch()` Wrapper für Client.

6. **Action Tokens** — Purpose-bound (`reset`/`verify`/`invite`/`2fa_challenge`), bind an State (password-hash/email), korrekte TTLs (1h/48h/7d/5min).

7. **Audit Hash-Chain** — SHA-256 über `prev_hash + data` → tamper-evidence. Per-brain_id isoliert. Fire-and-forget ohne Response-Blockierung.

---

*Ende Audit Report 3 — SaaS-Applikationsschicht*
