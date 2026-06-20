# Fix-Prompt: P0 & P1 Audit-Blocker beheben — Subsumio SaaS-Applikationsschicht

> **Grundlage:** Audit Report 3 (`AUDIT_REPORT_3_SAAS_APPLICATION.md`) — Gesamtscore 64% Beta
> **Ziel:** Alle P0-Blocker fixen + P1-Quick-Wins abarbeiten → Production-Ready
> **Modus:** Code-Änderungen im Editor, jede Änderung mit Code-Beleg, keine Mocks

---

## P0-FIXES (Production-Blocker)

### P0-1: CSP-Header in `vercel.json` hinzufügen

**Problem:** `vercel.json` hat X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy — aber **keine Content-Security-Policy**. Das ist die wichtigste XSS-Schutz-Maßnahme.

**Datei:** `/Users/msc/subsumio-web/vercel.json`

**Aktuell (Zeile 12-23):**
```json
{
  "source": "/(.*)",
  "headers": [
    { "key": "X-Frame-Options", "value": "DENY" },
    { "key": "X-Content-Type-Options", "value": "nosniff" },
    { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
    { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
    { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains" }
  ]
}
```

**Ziel:** Füge CSP-Header hinzu. Berücksichtige:
- Next.js braucht `'unsafe-inline'` für Script (oder Nonce-basiert — komplexer, V2)
- Stripe Checkout braucht `https://js.stripe.com` und `https://checkout.stripe.com`
- Vercel Analytics braucht `https://va.vercel-scripts.com`
- Sentry braucht `https://*.sentry.io` (falls konfiguriert)
- PostHog braucht `https://app.posthog.com` und `https://*.posthog.com` (falls konfiguriert)
- Resend/Email-Webhooks brauchen keine zusätzlichen Script-Sources
- WhatsApp Business API braucht keine Script-Sources (server-side only)
- Google Fonts falls verwendet: `https://fonts.googleapis.com` + `https://fonts.gstatic.com`
- Images: `data:`, `blob:`, `https:` (für externe Bilder wie Avatars)
- Connect: `wss:` (für Real-time WebSocket, falls aktiviert)
- Frame: `https://js.stripe.com` (Stripe Checkout iframe)

**Empfohlene CSP (V1 — pragmatic, report-only first oder enforcing):**
```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://va.vercel-scripts.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
img-src 'self' data: blob: https:;
font-src 'self' data: https://fonts.gstatic.com;
connect-src 'self' https://api.stripe.com https://*.sentry.io https://app.posthog.com wss:;
frame-src 'self' https://js.stripe.com https://checkout.stripe.com;
object-src 'none';
base-uri 'self';
form-action 'self' https://checkout.stripe.com;
```

**WICHTIG:** 
- Prüfe ob `next.config.ts` bereits CSP via `headers()` function setzt — falls ja, nicht doppeln
- Prüfe ob es bereits ein `Content-Security-Policy-Report-Only` Header gibt
- Teste nach Änderung: Login, Signup, Dashboard, Stripe Checkout, Query — alle müssen funktionieren
- Falls etwas bricht: erst `Content-Security-Policy-Report-Only` mit gleicher Policy, dann nach Analyse auf `Content-Security-Policy` umstellen

**Akzeptanzkriterien:**
- [ ] CSP-Header in `vercel.json` vorhanden
- [ ] Login + Signup funktionieren
- [ ] Dashboard lädt ohne Console-Errors
- [ ] Stripe Checkout funktioniert (iframe lädt)
- [ ] Vercel Analytics funktioniert (falls aktiviert)
- [ ] Keine CSP-Violations in Browser-Console

---

### P0-2: API-Route Guard-Chain Integration-Tests

**Problem:** 116 API-Routes, 0 Integration-Tests. Die 9-Schicht Guard-Chain (`createHandler`) ist ungetestet.

**Dateien:**
- Neue Datei: `src/lib/api-handler.test.ts` — Unit-Test für `createHandler` Guard-Chain
- Neue Datei: `tests/e2e-playwright/api-guard-chain.spec.ts` — E2E-Test für Guard-Chain via HTTP

**Test-Szenarien für `api-handler.test.ts` (Unit):**

1. **Unauthenticated request → 401**
   - POST `/api/pages` ohne Session-Cookie → `401` `{"error":"unauthorized"}`

2. **Authenticated but forbidden → 403**
   - POST `/api/pages` als `client_viewer` → `403` `{"error":"forbidden"}`

3. **CSRF token missing → 403**
   - POST `/api/pages` mit Session aber ohne CSRF-Header → `403` `{"error":"csrf_invalid"}`

4. **CSRF token mismatch → 403**
   - POST `/api/pages` mit Session + falschem CSRF-Header → `403` `{"error":"csrf_invalid"}`

5. **Rate limit exceeded → 429**
   - 121. Request innerhalb 1 Minute (standard tier = 120/min) → `429` mit `Retry-After` header

6. **Quota exceeded → 429 oder 402** (je nach Implementierung)
   - User mit `free` Plan, 101. Query im Monat → Warnung oder Block

7. **Zod validation failed → 400**
   - POST `/api/billing/checkout` mit `{"plan":"invalid"}` → `400` `{"error":"validation_failed"}`

8. **Valid request → 200 + Audit-Log**
   - POST `/api/billing/checkout` mit validem Body → `200` + Audit-Eintrag in DB

9. **Handler throws AppError → structured error**
   - Handler wirft `new AppError("test_error", "Test", 422)` → `422` `{"error":"test_error"}`

10. **Handler throws generic Error → 500**
    - Handler wirft `new Error("boom")` → `500` `{"error":"internal_error"}`

**Test-Szenarien für `api-guard-chain.spec.ts` (E2E/Playwright):**

1. **Unauthenticated → redirect to /login**
   - `page.goto("/dashboard")` → URL enthält `login`
   
2. **API without auth → 401**
   - `request.post("/api/pages", { data: { ... } })` → `401`

3. **API with auth but wrong CSRF → 403**
   - Login, dann POST ohne CSRF-Header → `403`

4. **API with auth + CSRF → success**
   - Login, hole CSRF-Cookie, sende CSRF-Header → `200`

5. **Rate limit on auth endpoint**
   - 6 falsche Login-Versuche → `429` mit `Retry-After`

**Mocking-Strategie:**
- Unit-Tests: Mock `requireEngineContext`, `logAudit`, `validateCsrf` — nur Guard-Chain-Logik testen
- E2E-Tests: Echte HTTP-Requests gegen laufenden Dev-Server (Port 3000)

**Akzeptanzkriterien:**
- [ ] `src/lib/api-handler.test.ts` existiert mit 10+ Test-Cases
- [ ] `tests/e2e-playwright/api-guard-chain.spec.ts` existiert mit 5+ Test-Cases
- [ ] `bun test src/lib/api-handler.test.ts` → alle grün
- [ ] `npx playwright test api-guard-chain` → alle grün

---

### P0-3: Billing-Flow E2E-Test

**Problem:** Stripe Checkout → Webhook → Plan-Update ist komplett ungetestet.

**Dateien:**
- Neue Datei: `tests/e2e-playwright/billing-flow.spec.ts`

**Test-Szenarien:**

1. **Checkout-Route ohne Stripe-Config → 501**
   - POST `/api/billing/checkout` ohne `STRIPE_SECRET_KEY` → `501` `{"error":"billing_not_configured"}`

2. **Checkout-Route mit invalid plan → 400**
   - POST `/api/billing/checkout` mit `{"plan":"enterprise"}` → `400` (Zod: nur "pro" | "team")

3. **Checkout-Route ohne Auth → 401**
   - POST `/api/billing/checkout` ohne Session → `401`

4. **Checkout-Route als client_viewer → 403**
   - Login als client_viewer, POST → `403` (action: "billing.write", nur admin)

5. **Webhook ohne Stripe-Signature → 400**
   - POST `/api/billing/webhook` ohne `stripe-signature` Header → `400`

6. **Webhook mit invalid signature → 400**
   - POST `/api/billing/webhook` mit falschem Signature-Header → `400`

7. **Webhook ohne STRIPE_WEBHOOK_SECRET → 501**
   - POST `/api/billing/webhook` wenn `STRIPE_WEBHOOK_SECRET` nicht gesetzt → `501`

8. **Webhook mit valid signature + checkout.session.completed → Plan-Update**
   - Konstruiere valides Stripe Event JSON
   - Signiere mit `STRIPE_WEBHOOK_SECRET`
   - POST → `200` `{"received":true}`
   - Verifiziere: User-Plan in DB aktualisiert

**Mocking-Strategie:**
- Stripe API nicht mocken — Checkout-Route macht `fetch("https://api.stripe.com/...")` — das wird ohne echte Keys 501 geben (Test 1)
- Webhook-Tests: Konstruiere Event JSON lokal, signiere mit `createHmac("sha256", secret)` — kein Stripe API Call nötig
- Für Test 8: Mock `getStore()` um `update()` zu tracken

**Akzeptanzkriterien:**
- [ ] `tests/e2e-playwright/billing-flow.spec.ts` existiert mit 8 Test-Cases
- [ ] `npx playwright test billing-flow` → alle grün
- [ ] Webhook-Idempotency wird getestet (gleiche Event-ID → nicht doppelt verarbeitet — falls implementiert, sonst als TODO markieren)

---

### P0-4: 2FA-Flow E2E-Test

**Problem:** 2FA (TOTP Setup, Login-Verify, Backup-Codes) ist security-critical und ungetestet.

**Dateien:**
- Neue Datei: `src/lib/totp.test.ts` — Unit-Test für TOTP-Generierung/Verifikation
- Neue Datei: `src/lib/auth/backup-codes.test.ts` — Unit-Test für Backup-Codes
- Neue Datei: `tests/e2e-playwright/two-factor-flow.spec.ts` — E2E-Test für 2FA-Flow

**Unit-Test-Szenarien für `totp.test.ts`:**

1. **generateSecret() → 32-char Base32 string**
   - `generateSecret()` → String der Länge 32, nur `[A-Z2-7]`

2. **generateTOTP() → 6-digit code**
   - `generateTOTP(secret)` → String der Länge 6, nur digits

3. **verifyTOTP() → true für aktuellen Code**
   - `generateTOTP(secret)` → `verifyTOTP(secret, code)` → `true`

4. **verifyTOTP() → false für falschen Code**
   - `verifyTOTP(secret, "000000")` → `false` (wahrscheinlich)

5. **verifyTOTP() → true für Code im ±1 Zeitfenster**
   - Code von `time - 30s` → `true` (1-step tolerance)
   - Code von `time + 30s` → `true` (1-step tolerance)
   - Code von `time - 60s` → `false` (außerhalb tolerance)

6. **generateTOTP() mit verschiedenen digits → korrekte Länge**
   - `digits: 8` → 8-digit code

7. **generateTOTP() mit verschiedenen step → korrekte Periode**
   - `step: 60` → Code ändert sich nur alle 60s

**Unit-Test-Szenarien für `backup-codes.test.ts`:**

1. **generateBackupCodes() → 10 codes im Format XXXX-XXXX-XXXX**
   - 10 codes, jeder 14 chars (4+1+4+1+4), uppercase + digits

2. **hashBackupCode() → SHA-256 hex**
   - `hashBackupCode("ABCD-1234-WXYZ")` → 64-char hex string

3. **verifyBackupCode() → true für korrekten Code**
   - Generate → hash → verify → `true`

4. **verifyBackupCode() → false für falschen Code**
   - `verifyBackupCode(hashed, "WRONG-CODE-HERE")` → `false`

5. **consumeBackupCode() → entfernt Code aus Array**
   - 10 codes → consume 1 → 9 codes übrig

**E2E-Test-Szenarien für `two-factor-flow.spec.ts`:**

1. **2FA Setup-Flow:**
   - Login als admin
   - POST `/api/auth/2fa/setup` → `200` mit `secret` + `qrUrl`
   - POST `/api/auth/2fa/verify` mit korrektem TOTP → `200` mit `backupCodes`
   - Verifiziere: `user.twoFactorEnabled === true`

2. **2FA Login-Flow:**
   - Login mit Email + Password → `200` mit `requiresTwoFactor: true` + `challengeToken`
   - POST `/api/auth/2fa/login-verify` mit `challengeToken` + TOTP → `200` mit Session-Cookie

3. **2FA Backup-Code Login:**
   - Login mit Email + Password → `requiresTwoFactor: true`
   - POST `/api/auth/2fa/login-verify` mit Backup-Code → `200` mit Session-Cookie
   - Verifiziere: Backup-Code als consumed markiert

4. **2FA Disable:**
   - Login als admin (mit 2FA aktiv)
   - POST `/api/auth/2fa/disable` mit TOTP → `200`
   - Verifiziere: `user.twoFactorEnabled === false`

**Mocking-Strategie:**
- Unit-Tests: Keine Mocks nötig — TOTP ist pure crypto (WebCrypto)
- E2E-Tests: TOTP-Code mit `generateTOTP(secret)` im Test generieren (import aus `src/lib/totp.ts`)
- Backup-Codes: Im Test generate + verify, keine echten DB-Writes nötig für Unit-Tests

**Akzeptanzkriterien:**
- [ ] `src/lib/totp.test.ts` existiert mit 7+ Test-Cases
- [ ] `src/lib/auth/backup-codes.test.ts` existiert mit 5+ Test-Cases
- [ ] `tests/e2e-playwright/two-factor-flow.spec.ts` existiert mit 4+ Test-Cases
- [ ] `bun test src/lib/totp.test.ts` → alle grün
- [ ] `bun test src/lib/auth/backup-codes.test.ts` → alle grün

---

## P1-FIXES (Quick-Wins)

### P1-1: Per-page `loading.tsx` für alle 54 Dashboard-Seiten

**Problem:** 44 von 54 Dashboard-Seiten haben keine eigene `loading.tsx` — Layout-Shift beim Laden.

**Ansatz:** Für jede Dashboard-Seite ohne `loading.tsx` eine Skeleton-basierte Loading-Datei erstellen.

**Pattern (aus bestehenden loading.tsx übernehmen):**
```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
```

**Fehlende loading.tsx (44 Seiten):** Prüfe welche Seiten bereits haben und welche fehlen:
- Bestehend (11): `dashboard/loading.tsx`, `agents/`, `brain/`, `cases/`, `contacts/`, `deadlines/`, `invoicing/`, `query/`, `settings/`, `team/`, `vault/`
- Fehlend (ca. 44): `anonymize/`, `approvals/`, `assistant/`, `bea/`, `brain/` (sub-pages), `calendar-export/`, `client-portal/`, `compliance/`, `connectors/`, `controlling/`, `cost-calculator/`, `data-export/`, `datev-export/`, `docs/`, `drafting/`, `email-import/`, `graph/`, `import-kanzlei/`, `judgements-sync/`, `kollisionspruefung/`, `mobile/`, `monitoring/`, `norms/`, `opponents/`, `playbooks/`, `rechtsprechung/`, `research/`, `signature/`, `tabular-review/`, `upload/`, `verfahrensdoku/`, `whatsapp/`, `audit/`, `api-keys/`, `billing/`, `contracts/`, `rag-eval/`, etc.

**Akzeptanzkriterien:**
- [ ] Jede Dashboard-Seite hat eine `loading.tsx`
- [ ] Loading-States sind Skeleton-basiert (keine Spinner)
- [ ] Kein Layout-Shift beim Navigieren zwischen Seiten

---

### P1-2: Per-page `error.tsx` für kritische Dashboard-Seiten

**Problem:** 44 von 54 Dashboard-Seiten haben keine eigene `error.tsx`.

**Priorität:** Nur kritische Seiten (Cases, Deadlines, Query, Brain, Vault, Invoicing, Contacts, Settings, Team, Agents haben bereits). Füge hinzu für:
- `approvals/` — Vier-Augen-Freigabe (critical workflow)
- `compliance/` — GoBD (regulatory)
- `whatsapp/` — Communication
- `bea/` — Communication
- `connectors/` — Integration
- `client-portal/` — External-facing
- `billing/` — Geldfluss
- `audit/` — Compliance

**Pattern (aus `dashboard/error.tsx` übernehmen):**
```tsx
"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <h2 className="text-lg font-semibold">Etwas ist schiefgelaufen</h2>
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <button onClick={reset} className="...">Erneut versuchen</button>
    </div>
  );
}
```

**Akzeptanzkriterien:**
- [ ] Kritische Seiten haben eigene `error.tsx`
- [ ] Error-Boundary zeigt Error-Message + Retry-Button
- [ ] Sentry-Integration in Production (wie dashboard/error.tsx)

---

### P1-3: Capacitor-Config rebranden

**Datei:** `/Users/msc/subsumio-web/capacitor.config.ts`

**Aktuell:**
```ts
appId: "com.sigmabrain.app",
appName: "Sigmabrain",
server: {
  url: process.env.CAP_SERVER_URL || "https://sigmabrain.com",
  allowNavigation: ["sigmabrain.com", "*.sigmabrain.com"],
},
ios: {
  scheme: "Sigmabrain",
},
```

**Ziel:**
```ts
appId: "io.subsum.app",
appName: "Subsumio",
server: {
  url: process.env.CAP_SERVER_URL || "https://subsum.io",
  allowNavigation: ["subsum.io", "*.subsum.io"],
},
ios: {
  scheme: "Subsumio",
},
```

**WICHTIG:** 
- `appId` Änderung ist breaking für bestehende App-Store-Einträge — ggf. Migration-Plan
- Domain `subsum.io` muss am Vercel-Projekt hängen
- Kommentar in Zeile 3 auch aktualisieren: "Sigmabrain" → "Subsumio"

**Akzeptanzkriterien:**
- [ ] `appId` = `io.subsum.app` (oder `com.subsumio.app`)
- [ ] `appName` = `Subsumio`
- [ ] `server.url` = `https://subsum.io`
- [ ] `allowNavigation` = `["subsum.io", "*.subsum.io"]`
- [ ] `ios.scheme` = `Subsumio`
- [ ] Kommentar aktualisiert

---

### P1-4: Word-Add-In Manifest rebranden

**Datei:** `/Users/msc/subsumio-web/word-addin/manifest.xml`

**Alle "SigmaBrain"-Vorkommen ersetzen:**

| Zeile | Aktuell | Ziel |
|-------|---------|------|
| 3 | `<!-- Sigmabrain native shell -->` (in capacitor, nicht hier) | — |
| 7 | `<Id>sigmabrain-word-addin</Id>` | `<Id>subsumio-word-addin</Id>` |
| 9 | `<ProviderName>SigmaBrain</ProviderName>` | `<ProviderName>Subsumio</ProviderName>` |
| 11 | `<DisplayName DefaultValue="SigmaBrain für Word"/>` | `<DisplayName DefaultValue="Subsumio für Word"/>` |
| 12 | `Description ... SigmaBrain ...` | `Description ... Subsumio ...` |
| 13 | `IconUrl ... https://sigmabrain.com/...` | `https://subsum.io/...` |
| 14 | `SupportUrl ... https://sigmabrain.com/support` | `https://subsum.io/support` |
| 16 | `AppDomain ... https://sigmabrain.com` | `https://subsum.io` |
| 22 | `SourceLocation ... https://sigmabrain.com/...` | `https://subsum.io/...` |
| 36 | `Group id="SigmaBrain.Group"` | `Group id="Subsumio.Group"` |
| 43 | `Control ... id="SigmaBrain.OpenPane"` | `id="Subsumio.OpenPane"` |
| 55 | `TaskpaneId>SigmaBrainPane` | `SubsumioPane` |
| 67-69 | `Icon URLs ... sigmabrain.com` | `subsum.io` |
| 72-73 | `Urls ... sigmabrain.com` | `subsum.io` |
| 76-80 | `ShortStrings ... SigmaBrain` | `Subsumio` |
| 83 | `LongStrings ... SigmaBrain` | `Subsumio` |

**Akzeptanzkriterien:**
- [ ] 0 Vorkommen von "SigmaBrain" in `manifest.xml`
- [ ] Alle URLs auf `subsum.io` geändert
- [ ] Alle IDs/Labels auf "Subsumio" geändert
- [ ] XML ist valid (keine Syntax-Errors)

---

### P1-5: Stripe Webhook-Idempotency

**Datei:** `/Users/msc/subsumio-web/src/app/api/billing/webhook/route.ts`

**Problem:** Wenn Stripe ein Event erneut sendet (z.B. bei Network-Timeout), wird der Plan-Update doppelt ausgeführt. Keine Event-ID-Tracking.

**Lösung:** Event-ID in Postgres tracken. Vor Verarbeitung prüfen, ob Event bereits verarbeitet wurde.

**Implementierung:**

1. **Neue Tabelle** (in `webhook/route.ts` oder `audit.ts`):
```sql
CREATE TABLE IF NOT EXISTS subsumio_stripe_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
```

2. **In Webhook-Handler (nach Signature-Verification, vor Switch):**
```ts
const eventId = (event as { id?: string }).id;
if (eventId) {
  const pool = getSharedPgPool();
  if (pool) {
    try {
      await pool.query(
        "INSERT INTO subsumio_stripe_events (event_id, event_type) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING event_id",
        [eventId, event.type ?? "unknown"]
      );
      // If no rows returned, event already processed
      // But ON CONFLICT DO NOTHING doesn't return rows on conflict...
      // Better: use INSERT ... ON CONFLICT (event_id) DO UPDATE SET event_id = EXCLUDED.event_id RETURNING (xmax = 0) AS inserted
    } catch {
      // non-fatal — proceed without idempotency (dev mode)
    }
  }
}
```

3. **Dev-Fallback:** Ohne Postgres → in-memory Set mit Event-IDs (nicht persistent, aber besser als nichts)

**Akzeptanzkriterien:**
- [ ] `subsumio_stripe_events` Tabelle wird erstellt (lazy, wie audit/usage)
- [ ] Event-ID wird vor Verarbeitung geprüft
- [ ] Doppelte Events werden erkannt und skipped (`200 {"received": true, "duplicate": true}`)
- [ ] Dev-Modus ohne Postgres hat in-memory Fallback

---

### P1-6: A11y-Tests auf alle Dashboard-Seiten erweitern

**Datei:** `/Users/msc/subsumio-web/tests/e2e-playwright/accessibility.spec.ts`

**Aktuell:** Nur 4 Dashboard-Seiten getestet (`/dashboard`, `/dashboard/query`, `/dashboard/upload`, `/dashboard/settings`)

**Ziel:** Alle 54 Dashboard-Seiten mit axe-core testen.

**Ansatz:** 
1. Liste aller Dashboard-Routes generieren (oder hardcoded Array)
2. Loop über alle Routes mit `axe-core` scan
3. Nur `critical` + `serious` violations prüfen (wie bisher)

**Pattern:**
```ts
const DASHBOARD_ROUTES = [
  "/dashboard",
  "/dashboard/cases",
  "/dashboard/cases/new",
  "/dashboard/deadlines",
  "/dashboard/brain",
  "/dashboard/query",
  "/dashboard/vault",
  "/dashboard/contacts",
  "/dashboard/invoicing",
  "/dashboard/team",
  "/dashboard/settings",
  "/dashboard/agents",
  "/dashboard/compliance",
  // ... alle 54 Seiten
];

for (const route of DASHBOARD_ROUTES) {
  test(`${route} has no critical a11y violations`, async ({ page }) => {
    // Login first (in test.beforeAll or fixture)
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    const violations = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );
    expect(violations).toEqual([]);
  });
}
```

**WICHTIG:**
- Login vor Tests nötig (Dashboard ist auth-geschützt)
- Einige Seiten brauchen Seed-Data (sonst Empty-State → evtl. andere A11y-Issues)
- Bei 54 Seiten: Test-Dauer ~5-10min — ggf. parallelisieren

**Akzeptanzkriterien:**
- [ ] Alle 54 Dashboard-Seiten in `accessibility.spec.ts` getestet
- [ ] `npx playwright test accessibility` → alle grün (oder dokumentierte Exceptions)
- [ ] Keine `critical` oder `serious` violations

---

## P1-7: `.env.example` Domain aktualisieren

**Datei:** `/Users/msc/subsumio-web/.env.example`

**Änderungen:**

| Zeile | Aktuell | Ziel |
|-------|---------|------|
| 1 | `# ── Sigmabrain Web-App ...` | `# ── Subsumio Web-App ...` |
| 8 | `NEXT_PUBLIC_SITE_URL=https://sigmabrain.com` | `NEXT_PUBLIC_SITE_URL=https://subsum.io` |

**Hinweis:** Env-Var-Namen (`SIGMABRAIN_*`) vorerst BEIBEHALTEN — Renaming ist P3 (breaking change). Nur User-facing Werte ändern.

**Akzeptanzkriterien:**
- [ ] `NEXT_PUBLIC_SITE_URL` = `https://subsum.io`
- [ ] Kommentar auf "Subsumio" geändert
- [ ] Env-Var-Namen unverändert (P3)

---

## ZUSAMMENFASSUNG: Fix-Reihenfolge

| Reihenfolge | Fix | Aufwand | Impact |
|-------------|-----|---------|--------|
| 1 | **P0-1:** CSP-Header | S (30min) | XSS-Schutz |
| 2 | **P0-2:** API Guard-Chain Tests | L (4h) | Security-Regression |
| 3 | **P0-3:** Billing-Flow Tests | M (2h) | Geldfluss-Verifikation |
| 4 | **P0-4:** 2FA-Flow Tests | M (2h) | Security-Critical |
| 5 | **P1-1:** loading.tsx (44 Seiten) | M (2h) | UX |
| 6 | **P1-2:** error.tsx (kritische Seiten) | S (1h) | UX |
| 7 | **P1-3:** Capacitor rebrand | S (15min) | Branding |
| 8 | **P1-4:** Word-Add-In rebrand | S (30min) | Branding |
| 9 | **P1-5:** Webhook-Idempotency | S (1h) | Billing-Safety |
| 10 | **P1-6:** A11y-Tests erweitern | M (2h) | WCAG-Compliance |
| 11 | **P1-7:** .env.example Domain | S (5min) | Branding |

**Gesamtaufwand:** ~15h für alle P0 + P1 Fixes

---

## AUSGABEFORMAT

Pro Fix:
1. **Status:** Done / In Progress / Blocked
2. **Dateien geändert:** Liste mit Zeilenangaben
3. **Code-Beleg:** Vorher/Nachher Diff
4. **Verifikation:** Test-Command + Ergebnis
5. **Edge-Cases:** Was wurde getestet, was nicht

Am Ende:
- **Updated Production-Readiness-Matrix** (welche Bereiche sind jetzt ✅)
- **Updated Gesamtscore** (Ziel: >80% Production-Ready)
