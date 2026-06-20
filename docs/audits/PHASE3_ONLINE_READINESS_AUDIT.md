# Phase 3: Online-Readiness Audit — Subsumio SaaS

**Audit-Datum:** 2026-06-20  
**Auditor:** Cascade (Principal Engineer)  
**Status:** Abgeschlossen

---

## 1. Deployment & Infrastructure

### 1.1 Vercel-Konfiguration
| Check | Status | Detail |
| --- | --- | --- |
| `vercel.json` vorhanden | ✅ | Framework: nextjs, 7 Cron-Jobs definiert |
| Cron-Jobs | ✅ | deadlines (06:00), daily-briefing (06:30), deadline-reminders (07:00), case-law (06:30), regulatory-monitors (06:45), case-scanner (02:00), retention (08:00) |
| Security Headers (vercel.json) | ✅ | X-Frame-Options: DENY, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy |
| Redirects | ✅ | /produkt → /subsumio, /sicherheit → /security (permanent) |

### 1.2 Next.js Konfiguration
| Check | Status | Detail |
| --- | --- | --- |
| `next.config.ts` | ✅ | Bundle-Analyzer, Image-Optimization (AVIF/WebP), CSP, Security Headers |
| Content-Security-Policy | ✅ | default-src 'self', script-src mit Stripe + Vercel Analytics, frame-ancestors 'none' |
| HSTS | ✅ | max-age=31536000; includeSubDomains; preload |
| Permissions-Policy | ✅ | camera=(self), microphone=(), geolocation=(), interest-cohort=() |
| Server External Packages | ✅ | pg (Postgres-Treiber nicht gebundled) |
| React Compiler | ⚠️ | `experimental.reactCompiler: false` — nicht aktiviert (bewusst deaktiviert) |

### 1.3 Environment Validation
| Check | Status | Detail |
| --- | --- | --- |
| `env-validate.ts` | ✅ | 9 Pflicht-Variablen + 2 Optionale, Fail-Fast in Produktion |
| `.env.example` | ✅ | 177 Zeilen, vollständige Dokumentation aller Env-Vars |
| Fail-Fast in Produktion | ✅ | `instrumentation.ts` wirft Error bei fehlenden Pflicht-Vars in `NODE_ENV=production` |
| Sensible Defaults | ✅ | Dev-Modus mit In-Memory-Fallbacks, Produktion mit Postgres-Pflicht |

### 1.4 Health & Readiness Probes
| Check | Status | Detail |
| --- | --- | --- |
| `/api/health` (Liveness) | ✅ | Leichtgewichtiger Check, immer 200 wenn Prozess läuft |
| `/api/readiness` (Deep Probe) | ✅ | Prüft Engine, Auth-Store, Critical Env, Stripe, Sentry, Resend. 503 bei Critical-Down |
| Latenz-Messung | ✅ | Jede Check-Komponente misst Latenz in ms |
| Optional Services | ✅ | Stripe/Sentry/Email als "degraded" nicht "down" |

---

## 2. Monitoring & Error Tracking

| Check | Status | Detail |
| --- | --- | --- |
| Sentry Integration | ✅ | `instrumentation.ts` mit Node.js, Edge und Browser Runtime |
| Sentry Sample Rate | ✅ | Produktion: 10% Traces, Dev: 100% |
| Sentry Error Replays | ✅ | Browser: 10% Error-Replays in Produktion |
| `onRequestError` | ✅ | `Sentry.captureRequestError` in `instrumentation.ts` |
| `error.tsx` Boundary | ✅ | Global Error Boundary mit Sentry-Reporting + Bilingual UI |
| PostHog Analytics | ✅ | Env-Vars vorhanden (`NEXT_PUBLIC_POSTHOG_KEY`), CSP erlaubt `app.posthog.com` |
| Vercel Analytics | ✅ | Automatisch via @vercel/analytics, `va.vercel-scripts.com` in CSP |
| Dashboard Monitoring | ✅ | Eigene `/dashboard/monitoring` Seite |

---

## 3. Security Headers & Middleware

### 3.1 Security Headers (doppelt abgesichert: next.config + vercel.json)
| Header | Wert | Status |
| --- | --- | --- |
| X-Frame-Options | DENY | ✅ |
| Strict-Transport-Security | max-age=31536000+ (preload in next.config) | ✅ |
| X-Content-Type-Options | nosniff | ✅ |
| Referrer-Policy | strict-origin-when-cross-origin | ✅ |
| Permissions-Policy | camera=(self), microphone=(), geolocation=() | ✅ |
| Content-Security-Policy | Vollständig mit Stripe, Sentry, PostHog, Fonts | ✅ |
| frame-ancestors | 'none' | ✅ |

### 3.2 Middleware (`src/middleware.ts`)
| Check | Status | Detail |
| --- | --- | --- |
| Auth-Guard (Dashboard/Admin) | ✅ | Session-Verifikation via `verifySessionCore`, Redirect zu `/login?next=` |
| Admin-Role-Guard | ✅ | Non-Admin wird zu `/dashboard` redirectet |
| CSRF-Validierung | ✅ | Double-Submit Cookie für alle State-Changing API-Requests |
| CSRF-Exemptions | ✅ | Login, Signup, Forgot, Reset, 2FA, Cron, Webhooks korrekt exempted |
| CSRF-Cookie-Setzung | ✅ | Automatisch bei Dashboard-Zugriff, Secure in Produktion |
| Referral-Consent | ✅ | § 25 TTDSG-konform: Cookie nur nach Consent (RefConsentBanner) |

---

## 4. SEO & Online-Presence

| Check | Status | Detail |
| --- | --- | --- |
| `sitemap.ts` | ✅ | 14 Marketing-Pages × 2 Sprachen (EN/DE) + Auth/Legal Pages, hreflang alternates |
| `robots.ts` | ✅ | Allow: /, Disallow: /dashboard, /admin, /api/ |
| `manifest.ts` (PWA) | ✅ | Installierbar (iOS/Android/Desktop), standalone, icons (192/512/maskable) |
| Metadata (`layout.tsx`) | ✅ | Title-Template, Description, Keywords, OpenGraph, Twitter Cards, Icons |
| `metadataBase` | ✅ | `NEXT_PUBLIC_SITE_URL` mit Fallback `https://subsum.eu` |
| OpenGraph Image | ✅ | `/og-image.png` (1200×630) |
| Twitter Card | ✅ | `summary_large_image` |
| JSON-LD Structured Data | ✅ | Organization, SoftwareApplication, Breadcrumb, FAQPage, Vertical-Software |
| Bilingual (EN/DE) | ✅ | Alle Marketing-Pages in EN + DE, hreflang alternates in sitemap |
| Canonical URLs | ✅ | Via `metadataBase` + Next.js Metadata API |
| Self-hosted Fonts | ✅ | `next/font/google` — keine Runtime-Requests zu Google (GDPR) |
| Apple Web App | ✅ | `appleWebApp.capable: true`, statusBarStyle: black-translucent |

---

## 5. PWA & Offline Support

| Check | Status | Detail |
| --- | --- | --- |
| Service Worker (`sw.js`) | ✅ | v3: Stale-while-revalidate für API, Cache-First für Static, Navigation-Fallback |
| SW Registration | ✅ | Production-only, Progressive Enhancement (nie blockierend) |
| Offline Page | ✅ | `/offline.html` als Navigation-Fallback |
| Background Sync | ✅ | Offline-POST/PUT/PATCH/DELETE → Queue + 202 Response |
| Precache | ✅ | offline.html, icon-192, icon-512 |
| PWA Manifest | ✅ | Vollständig mit Icons, Categories, Display: standalone |
| Installable | ✅ | iOS (Add to Home Screen), Android (Chrome Install), Desktop |

---

## 6. GDPR / DSGVO Compliance

| Check | Status | Detail |
| --- | --- | --- |
| Referral-Consent (§ 25 TTDSG) | ✅ | Banner bei `?ref=`, Accept/Decline, localStorage-Memory |
| Self-hosted Fonts | ✅ | Keine Google-Fonts-Runtime-Requests (keine IP-Leak) |
| Privacy Page | ✅ | `/privacy` + `/de/privacy` |
| Imprint Page | ✅ | `/imprint` + `/de/imprint` (in sitemap) |
| Terms Page | ✅ | `/terms` + `/de/terms` (in sitemap) |
| GDPR Data Export | ✅ | `/api/data-export/gdpr` Endpoint + `/dashboard/data-export` UI |
| Cookie-Consent | ⚠️ | Nur für Referral-Cookies implementiert. Kein allgemeiner Cookie-Consent-Banner für Analytics (PostHog/Vercel). |
| DSGVO-Verarbeitungsverzeichnis | ⚠️ | Compliance-Seite vorhanden, aber kein automatisiertes VVT |
| Data Retention | ✅ | `/api/cron/retention` Cron-Job + `/dashboard/compliance/retention` UI |

---

## 7. Authentication & Session Management

| Check | Status | Detail |
| --- | --- | --- |
| JWT-Sessions | ✅ | HMAC SHA-256, Edge-safe (`session-core.ts`) |
| Session-Revocation | ✅ | Postgres-Backend in Prod, In-Memory in Dev, 60s Cache |
| Session-Versioning | ✅ | Per-User Min-Version für Password-Change/Logout-All |
| 2FA-Endpoints | ✅ | `/api/2fa/*` vorhanden |
| API-Key-Auth | ✅ | Bearer-Token, Hashing, Last-Used-Tracking |
| Rate-Limiting (Auth) | ✅ | Sliding-Window, Upstash Redis + File-Fallback |
| Rate-Limiting (API) | ✅ | 3 Tiers: standard (120/min), heavy (30/min), search (60/min) |
| RBAC | ✅ | 4 Rollen: admin, lawyer, assistant, client_viewer |
| CSRF-Schutz | ✅ | Double-Submit Cookie, Middleware-Level Enforcement |

---

## 8. Billing & SaaS Infrastructure

| Check | Status | Detail |
| --- | --- | --- |
| Stripe Checkout | ✅ | `/api/billing/checkout` mit Plan-Validierung |
| Stripe Portal | ✅ | `/api/billing/portal` mit Customer-ID-Pflicht |
| Stripe Webhook | ✅ | Signature-Verification, Idempotency, Plan-Updates |
| Billing Plans | ✅ | Free/Pro/Team/Enterprise mit Page/Seat-Limits |
| Quota-Management | ✅ | Pages, Queries, Seats — enforced in `requireEngineContext` |
| Usage Display | ✅ | `/dashboard/billing` und `/api/usage` |
| Plan-Upgrade/Downgrade | ✅ | Via Stripe Portal + Webhook-Handling |

---

## 9. Cron Jobs & Background Tasks

| Cron | Schedule | Zweck | Status |
| --- | --- | --- | --- |
| `/api/cron/deadlines` | 06:00 UTC | Fristen-Digest | ✅ |
| `/api/cron/daily-briefing` | 06:30 UTC | WhatsApp Tagesbriefing | ✅ |
| `/api/cron/deadline-reminders` | 07:00 UTC | Fristen-Erinnerungen | ✅ |
| `/api/cron/case-law` | 06:30 UTC | Rechtsprechung-Sync | ✅ |
| `/api/cron/regulatory-monitors` | 06:45 UTC | Regulatory Updates | ✅ |
| `/api/cron/case-scanner` | 02:00 UTC | Case Scanner | ✅ |
| `/api/cron/retention` | 08:00 UTC | Data Retention | ✅ |

**Cron-Auth:** Vercel setzt `CRON_SECRET` als Bearer-Token. Self-hosted: manuell via `Authorization: Bearer $CRON_SECRET`.

---

## 10. Build & Test Status

| Check | Status | Detail |
| --- | --- | --- |
| TypeScript Compilation | ⚠️ | 2 Errors in `.next/types/` (OmitWithTag-Inkompatibilität in `experience/route.ts` und `realtime/sse/route.ts`) |
| ESLint | ⚠️ | 204 Problems (25 Errors, 179 Warnings) — hauptsächlich `no-unused-vars` und `explicit-any` |
| Vitest Tests | ✅ | 190 Test Files, 4651 Tests, alle passed, 61.73s Duration |
| Test Coverage | ✅ | AI-Act, AML-KYC, SCIM, WhatsApp, Auth, Billing, Deadlines, RVG, Legal-Workflows, u.v.m. |

---

## 11. Score-Card Phase 3 — Online Readiness

| Dimension | Score | Max | Begründung |
| --- | --- | --- | --- |
| Deployment Config | 9 | 10 | Vercel.json + next.config vollständig, 7 Crons, Security Headers doppelt |
| Health/Readiness | 9 | 10 | Liveness + Deep Readiness mit Latenz-Messung, Optional-Services als degraded |
| Monitoring/Error Tracking | 8 | 10 | Sentry in 3 Runtimes, PostHog, Vercel Analytics — aber kein Alerting konfiguriert |
| Security Headers | 10 | 10 | CSP, HSTS, X-Frame, X-Content-Type, Referrer-Policy, Permissions-Policy — alle vorhanden |
| Middleware/Auth | 9 | 10 | Auth-Guard, Admin-Guard, CSRF, Session-Verifikation — sehr reif |
| SEO/Online-Presence | 9 | 10 | Sitemap, Robots, Manifest, JSON-LD, OG, Twitter, Bilingual, Self-hosted Fonts |
| PWA/Offline | 8 | 10 | SW v3 mit SWR, Background Sync, Offline Page — aber keine IndexedDB für strukturierte Offline-Daten |
| GDPR/DSGVO | 7 | 10 | Referral-Consent, Privacy/Terms, GDPR Export, Retention — aber kein allgemeiner Cookie-Consent für Analytics |
| Billing/SaaS | 9 | 10 | Stripe Checkout/Portal/Webhook, Quota, Plans — vollständig |
| Cron Jobs | 9 | 10 | 7 Crons mit CRON_SECRET, aber keine Cron-Failure-Alerting |
| Build Status | 7 | 10 | Tests alle grün, aber 2 TS-Errors + 25 ESLint-Errors |
| **Gesamt** | **8.5** | **10** | **Production-ready mit kleinen Einschränkungen** |

---

## 12. Go/No-Go Empfehlung

### ✅ GO — Bedingt Produktionsreif

**Kritische Blocker vor Live-Gang:**
1. **2 TypeScript-Fehler beheben** — `OmitWithTag` in `experience/route.ts` und `realtime/sse/route.ts`
2. **25 ESLint-Errors beheben** — Insbesondere `react-hooks/exhaustive-deps` und `explicit-any`
3. **Allgemeiner Cookie-Consent-Banner** — Für PostHog/Vercel Analytics unter DSGVO/TTDSG

**Empfohlene Verbesserungen (Post-Launch):**
4. Alerting für Sentry/Cron-Failures konfigurieren
5. IndexedDB für strukturierte Offline-Daten (PWA-Erweiterung)
6. DSGVO-Verarbeitungsverzeichnis automatisieren

---

*Nächster Schritt: Phase 4 — Robustheits- & Vollständigkeit-Check*
