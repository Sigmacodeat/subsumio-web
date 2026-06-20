# Subsumio — Lücken-Analyse & Implementierungsplan

**Basierend auf:** `docs/audits/Subsumio_vs_Harvey_Competitive_Production_Audit.md` und `docs/audits/FULL_COMPETITIVE_AUDIT_PROMPT.md`  
**Ziel:** Gegenüberstellung der ursprünglichen Audit-Items mit dem tatsächlichen Codebestand + priorisierter Implementierungsplan.  
**Datum:** 2026-06-19  
**Status:** Planungsdokument — keine Code-Änderungen vorgenommen.  

---

## 1. Gegenüberstellung: Was im ersten Audit-Report fehlte

Nach erneuter Prüfung des Original-Prompts (`FULL_COMPETITIVE_AUDIT_PROMPT.md`) und des Codes wurden folgende Items im ersten Audit-Report nicht explizit behandelt oder zu gering bewertet. Sie werden hier nachgeholt.

### 1.1 Document Analysis & Review — Ergänzungen

| Item | Status | Code-Beleg | Lücke | Fix / Aufwand |
|------|--------|------------|-------|---------------|
| **OCR** | ⚠️ | `src/lib/upload-validation.ts:1-44` erlaubt TIFF/Bilder, aber keine OCR-Engine im Web-Code | Bilder werden vermutlich als Binary/ohne Text extrahiert | OCR-Connector (Tesseract/AWS Textract) für Bilder/PDFs — **M** (3–4 Tage) |
| **Batch-Upload** | ⚠️ | `src/app/dashboard/upload/page.tsx:1-461` hat Einzel-Upload + experimenteller Folder-Upload (Chromium only) | Kein echtes Multi-File-Batch mit Fortschrittsanzeige | Batch-Upload mit Progress + Queue — **M** (2–3 Tage) |
| **Due Diligence / Bulk Review** | ✅ | `src/app/dashboard/tabular-review/page.tsx:1-191`, `src/app/api/legal/tabular-review/route.ts:1-46` | Gut abgedeckt | — |
| **Side-by-Side Vertragsvergleich** | ❌ | Keine dedizierte Compare-Seite außer Marketing-Compare (`/compare`) | Keine document-level Diff-UI | Contract-Compare-Page mit Diff-Engine — **L** (1–2 Wochen) |
| **Summarization** | ✅ | `src/app/api/legal/analyze/route.ts:1-421` (summary + key terms) | Abgedeckt | — |
| **Translation (FR/IT)** | ❌ | `src/lib/use-lang.ts`, `src/content/dashboard.ts` nur DE/EN | Keine FR/IT-Unterstützung | Übersetzungs-Layer + i18n-Keys — **L** (1–2 Wochen) |

### 1.2 Legal Research & RAG — Ergänzungen

| Item | Status | Code-Beleg | Lücke | Fix / Aufwand |
|------|--------|------------|-------|---------------|
| **Citation Verification** | ⚠️ | `src/app/api/legal/analyze/route.ts:1-421` (groundCitations) | Nur in Analyze, nicht im Chat/Research | Grounding-Layer für `/api/think` — **M** (1 Woche) |
| **Legal Chat / Follow-up** | ✅ | `src/lib/legal-chat/actions.ts:1-830` (brain_query) | Vorhanden | — |
| **Playbooks** | ✅ | `src/app/api/legal/playbooks/route.ts:1-124` | Vorhanden (statisch) | — |

### 1.3 Deadline & Calendar — Ergänzungen

| Item | Status | Code-Beleg | Lücke | Fix / Aufwand |
|------|--------|------------|-------|---------------|
| **Reminder System** | ✅ | `src/app/api/cron/deadline-reminders/route.ts:1-139` (E-Mail 3 Tage vor Frist) | Vorhanden, aber Cron muss extern getriggert werden | Vercel-Cron-Job + UI — **S** (4h) |
| **Deadline Dashboard** | ✅ | `src/app/dashboard/deadlines/page.tsx`, `src/components/dashboard/widget-dashboard.tsx` | Vorhanden | — |

### 1.4 Contract Drafting & Automation — Ergänzungen

| Item | Status | Code-Beleg | Lücke | Fix / Aufwand |
|------|--------|------------|-------|---------------|
| **Template Library** | ⚠️ | `src/app/api/legal/contract-draft/route.ts:1-72` (template_slug optional) | Keine UI/CRUD für Templates | Template-CRUD im Dashboard — **M** (3 Tage) |
| **Clause Bank** | ❌ | Nicht gefunden | Keine zentrale Klausel-Sammlung | Clause-Bank-Seite + Brain-Type `clause` — **M** (1 Woche) |
| **Variable Insertion** | ❌ | Nicht im Drafting-Route | Keine Case-Daten-Befüllung | Variable-Resolver in Draft-Engine — **M** (3 Tage) |
| **Word Export / Add-In** | ✅ | `word-addin/` (Manifest + Taskpane), `src/lib/invoice-pdf.ts` | Add-In existiert, aber UI-Integration begrenzt | Add-In-Publish + Store-Submission — **L** (2–3 Wochen) |

### 1.5 Conflict Check & Compliance — Ergänzungen

| Item | Status | Code-Beleg | Lücke | Fix / Aufwand |
|------|--------|------------|-------|---------------|
| **Party Matching** | ❌ | `src/app/api/legal/conflict-check/route.ts:1-38` nur Name-Check | Keine Entity-Graph-Abfrage über Cases/Kontakte | Erweiterte Kollisionsprüfung — **L** (2 Wochen) |
| **Retention Policy** | ⚠️ | `src/lib/gobd.ts:14-15` (10 Jahre), `src/app/dashboard/upload/page.tsx` (GoBD-Stamp) | Keine granular pro Dokumenttyp | Retention-Policy-Engine pro Type — **M** (3 Tage) |

### 2.1 Onboarding & First Run — Ergänzungen

| Item | Status | Code-Beleg | Lücke | Fix / Aufwand |
|------|--------|------------|-------|---------------|
| **Signup Flow** | ✅ | `tests/e2e-playwright/auth-flow.spec.ts`, `src/app/api/auth/signup` | Vorhanden | — |
| **Demo Brain** | ✅ | `src/app/api/demo/route.ts:1-52` | Vorhanden (read-only, rate-limited) | — |
| **Trial System** | ⚠️ | `src/lib/plans.ts:1-124` | Free-Trial-Logik vorhanden, aber nicht im Audit erwähnt | Trial-Status in UI sichtbarer machen — **S** (4h) |

### 2.2 Dashboard & Navigation — Ergänzungen

| Item | Status | Code-Beleg | Lücke | Fix / Aufwand |
|------|--------|------------|-------|---------------|
| **Custom Dashboard** | ✅ | `src/components/dashboard/widget-dashboard.tsx:1-538` | Vorhanden | — |
| **Command Palette** | ✅ | `src/components/dashboard/command-palette.tsx:1-308` | Vorhanden | — |
| **Global Search** | ⚠️ | Command Palette sucht nur Seiten, nicht Inhalte | Keine globale Inhaltssuche | Brain-Search in Command Palette — **M** (3 Tage) |
| **Dark Mode** | ✅ | `src/components/dashboard/topbar.tsx` (Sun/Moon, Theme-Prop) | Vorhanden | — |
| **Mobile Responsive** | ⚠️ | `playwright.config.ts:16-22` (Mobile Chrome/Safari), aber `mobile/` scheint separat/reduziert | Keine native Mobile-App-Smoke-Tests | Mobile-Build + CI-Smoke — **L** (1–2 Wochen) |
| **Keyboard Navigation** | ✅ | `a11y.spec.ts`, `accessibility.spec.ts` | Vorhanden | — |

### 2.3 Collaboration & Real-time — Ergänzungen

| Item | Status | Code-Beleg | Lücke | Fix / Aufwand |
|------|--------|------------|-------|---------------|
| **Multi-User / Team Roles** | ✅ | `src/lib/permissions.ts:1-173`, `src/app/dashboard/settings/page.tsx` (team tab) | Vorhanden | — |
| **Real-time Updates** | ✅ | `src/components/dashboard/topbar.tsx:113` (`useRealtime`), `src/lib/realtime.ts` | Vorhanden (SSE/WS) | — |
| **Comments & Threads** | ✅ | `src/lib/comments.ts:1-355` | Vorhanden | — |
| **@Mentions** | ✅ | `src/lib/comments.ts:161-168` | Vorhanden | — |
| **Activity Feed** | ✅ | `src/components/dashboard/widget-dashboard.tsx:155-213` (Recent Activity) | Vorhanden | — |
| **Assignment** | ⚠️ | `src/app/dashboard/cases/[slug]/page.tsx` (own_lawyer, opponent, client) | Keine explizite Task/Assignment-Engine außer Tasks-Tab | Assignment-Notifications + Owner-Filter — **S** (1 Tag) |

### 2.4 Notifications — Ergänzungen

| Item | Status | Code-Beleg | Lücke | Fix / Aufwand |
|------|--------|------------|-------|---------------|
| **In-App Notifications** | ✅ | `src/components/dashboard/topbar.tsx:71-142`, `src/lib/comments.ts:170-355` | Vorhanden | — |
| **Email Notifications** | ✅ | `src/app/api/cron/deadline-reminders/route.ts:1-139` | Vorhanden (Cron) | — |
| **Push Notifications** | ❌ | Nicht gefunden | Keine Web-Push | Web-Push-Adapter für kritische Fristen — **M** (1 Woche) |
| **Notification Preferences** | ❌ | `src/app/dashboard/settings/page.tsx` keine Notification-Tab | User kann Kanäle nicht steuern | Notification-Preferences-Tab + Settings — **M** (3 Tage) |

### 3.1 API Architecture — Ergänzungen

| Item | Status | Code-Beleg | Lücke | Fix / Aufwand |
|------|--------|------------|-------|---------------|
| **Guard Chain** | ✅ | `src/lib/api-handler.ts:1-445` | Vorhanden | — |
| **Error Handling** | ✅ | `src/lib/api-response.ts`, `src/lib/errors.ts` | Vorhanden | — |
| **Idempotency** | ⚠️ | `src/lib/docusign.ts:270-283` (Webhook dedup), `src/app/api/billing/webhook/route.ts` | Keine generische Idempotency-Key-Unterstützung | Idempotency-Key Middleware — **M** (3 Tage) |
| **Pagination** | ✅ | `src/app/api/legal/playbooks/route.ts:6-11`, `src/lib/api-handler.ts` | Vorhanden | — |
| **Caching** | ✅ | `src/lib/api-handler.ts:294-300` (Cache-Control) | Vorhanden | — |
| **Versioning** | ❌ | Keine API-Versionierung | Keine `/api/v1/...` | API-Versioning-Strategy — **L** (1 Woche) |
| **Rate Limiting** | ✅ | `src/lib/auth/rate-limit.ts`, `src/lib/api-handler.ts` | Vorhanden | — |

### 3.2 Security — Ergänzungen

| Item | Status | Code-Beleg | Lücke | Fix / Aufwand |
|------|--------|------------|-------|---------------|
| **CSP** | ✅ | `next.config.ts:25-59` | Vorhanden (ohne Nonce) | Nonce-CSP — **M** (3 Tage) |
| **CSRF** | ✅ | `src/lib/csrf.ts`, `src/middleware.ts` | Vorhanden | — |
| **XSS** | ✅ | `src/lib/sanitize-html.ts`, `src/lib/prompt-sanitizer.ts` | Vorhanden | — |
| **SQL Injection** | ✅ | `src/lib/audit.ts`, `src/lib/auth/store.ts` (parameterized queries) | Vorhanden | — |
| **Encryption at Rest** | ✅ | `src/lib/encryption.ts` | Vorhanden | — |
| **Encryption in Transit** | ✅ | `next.config.ts:31` (HSTS) | Vorhanden | — |
| **2FA** | ✅ | `src/lib/totp.ts`, `src/lib/auth/backup-codes.ts` | Vorhanden | — |
| **Session Management** | ✅ | `src/lib/auth/session-core.ts` | Vorhanden | — |
| **Account Lockout** | ✅ | `src/lib/auth/lockout.ts:1-149` | Vorhanden (im ersten Audit übersehen) | — |
| **Audit Log** | ✅ | `src/lib/audit.ts` | Vorhanden | — |
| **Secrets Management** | ✅ | `.env.example`, keine hardcoded Secrets | Vorhanden | — |

### 3.3 Data & Storage — Ergänzungen

| Item | Status | Code-Beleg | Lücke | Fix / Aufwand |
|------|--------|------------|-------|---------------|
| **Postgres-Ready** | ✅ | `src/lib/auth/store.ts`, `src/lib/audit.ts`, `src/lib/comments.ts` | Vorhanden | — |
| **Migrations** | ✅ | `server/src/core/migrate.ts`, `src/lib/migrate.ts` | Vorhanden (Engine-seitig) | — |
| **Backup** | ❌ | Keine Backup-UI/-API gefunden | Kein Tenant-Backup/Restore | Backup-Export/Import-Feature — **L** (1–2 Wochen) |
| **Data Export** | ✅ | `src/app/api/data-export/gdpr/route.ts` | Vorhanden | — |
| **File Storage / Versioning** | ⚠️ | `src/lib/dms/` (DMS-Abstraktion), `src/lib/gobd.ts` (Hash) | Keine Versionierung, nur Hash-Evidenz | Versioning-Layer für DMS — **L** (1 Woche) |

### 3.4 Performance & Scalability — Ergänzungen

| Item | Status | Code-Beleg | Lücke | Fix / Aufwand |
|------|--------|------------|-------|---------------|
| **Bundle Size** | ⚠️ | Kein Budget in CI | Kein Bundle-Size-Budget | Lighthouse-CI + Bundle-Check — **M** (2 Tage) |
| **Code Splitting** | ⚠️ | Keine `next/dynamic` imports in Haupt-Dashboard-Seiten gefunden | Keine dynamischen Imports für schwere Komponenten | Dynamic imports für Graph, Widgets, Add-Ins — **M** (3 Tage) |
| **Image Optimization** | ✅ | `next.config.ts:9-14` (avif/webp, remotePatterns) | Vorhanden | — |
| **Database Indexes** | ✅ | `src/lib/audit.ts`, `src/lib/email/mailbox.ts`, `src/lib/auth/store.ts` | Vorhanden | — |
| **Connection Pooling** | ✅ | `src/lib/auth/store.ts` (getSharedPgPool) | Vorhanden | — |
| **Edge Runtime** | ✅ | `src/middleware.ts` (Edge Middleware), `src/lib/auth/session-core.ts` | Vorhanden | — |

### 3.5 Testing & CI/CD — Ergänzungen

| Item | Status | Code-Beleg | Lücke | Fix / Aufwand |
|------|--------|------------|-------|---------------|
| **Unit Tests** | ⚠️ | 24 Test-Dateien, aber keine Dashboard-Page-Tests | Coverage < 80 %, viele UI-Seiten ungetestet | React Testing Library für Dashboard-Komponenten — **M** (1 Woche) |
| **E2E Tests** | ✅ | `tests/e2e-playwright/` (9 Specs) | Vorhanden | — |
| **Accessibility Tests** | ✅ | `a11y.spec.ts`, `accessibility.spec.ts` | Vorhanden | — |
| **Security Scanning** | ❌ | Keine gitleaks/dependency-audit in `.github/workflows/ci.yml` | Keine automatisierte Security-Checks | gitleaks + Dependabot + npm audit in CI — **M** (2–3 Tage) |
| **CI Pipeline** | ✅ | `.github/workflows/ci.yml` (lint, typecheck, unit, e2e) | Vorhanden | — |
| **Deployment** | ✅ | `vercel.json`, Next.js auf Vercel | Vorhanden | — |

### 4.1 External Services — Ergänzungen

| Item | Status | Code-Beleg | Lücke | Fix / Aufwand |
|------|--------|------------|-------|---------------|
| **DocuSign** | ✅ | `src/lib/docusign.ts` | Vorhanden | — |
| **WhatsApp** | ✅ | `src/lib/legal-chat/actions.ts`, `src/app/api/whatsapp/webhook/route.ts` | Vorhanden | — |
| **beA** | ⚠️ | `src/app/dashboard/bea/page.tsx` (nur Drafts) | Kein Send | beA-Connector/XML-Export — **L** (2–3 Wochen) |
| **Email** | ✅ | `src/lib/email/mailbox.ts`, `src/app/admin/mailbox/page.tsx` | Vorhanden | — |
| **DATEV** | ✅ | `src/app/dashboard/datev-export/page.tsx` | Vorhanden | — |
| **Google Calendar** | ❌ | `src/app/dashboard/calendar-export/page.tsx` nur ICS-Export | Kein 2-Way-Sync | Google Calendar API-Connector — **L** (1 Woche) |
| **Outlook** | ⚠️ | `outlook-addin/` existiert, aber nur Add-In-Stub | Kein Calendar/Contact Sync | Outlook-Graph-Connector — **L** (1–2 Wochen) |

### 4.2 Connectors Framework — Ergänzungen

| Item | Status | Code-Beleg | Lücke | Fix / Aufwand |
|------|--------|------------|-------|---------------|
| **Connector Registry** | ✅ | `src/app/dashboard/connectors/page.tsx` | Vorhanden | — |
| **Sync Status** | ✅ | `src/app/dashboard/connectors/page.tsx` | Vorhanden | — |
| **Error Recovery** | ⚠️ | `src/lib/retry.ts` (generisch), aber keine Connector-Retry-Visibility | Keine Retry-Policy-UI | Connector-Retry-Status + Logs — **M** (3 Tage) |
| **Webhook Inbound** | ✅ | `src/app/api/webhook/incoming/route.ts`, `src/lib/api-handler.ts:381-438` | Vorhanden | — |

### 5.1 Austrian/German/Swiss Law — Ergänzungen

| Item | Status | Code-Beleg | Lücke | Fix / Aufwand |
|------|--------|------------|-------|---------------|
| **ABGB/BGB/ZPO/VwGO** | ✅ | `law-corpus/`, `src/lib/legal-deadlines.ts` | Vorhanden | — |
| **RVG** | ✅ | `src/lib/rvg.ts` | Vorhanden | — |
| **Fristen-Engine** | ✅ | `src/lib/legal-deadlines.ts` | Vorhanden | — |
| **Feiertags-Kalender** | ✅ | `src/lib/legal-deadlines.ts:5-246` | Vorhanden | — |
| **Gerichtsstruktur** | ❌ | Nicht gefunden | Keine Gerichtsstruktur-Datenbank/Filter | Gerichtsverzeichnis + Filter — **M** (1 Woche) |

### 5.2 Legal AI Quality — Ergänzungen

| Item | Status | Code-Beleg | Lücke | Fix / Aufwand |
|------|--------|------------|-------|---------------|
| **Hallucination Prevention** | ✅ | `src/app/api/legal/analyze/route.ts` (grounding) | Vorhanden | — |
| **Citation Accuracy** | ⚠️ | Grounding nur in Analyze | Keine Chat-Grounding | — (siehe 1.2) |
| **Legal Reasoning** | ❌ | Kein IRAC/Issue-Spotting-Prompt gefunden | Kein explizites Reasoning-Framework | IRAC-Prompt-Template + Eval — **M** (1 Woche) |
| **Jurisdiction Awareness** | ✅ | `src/app/api/legal/statute/route.ts`, `src/lib/judgements.ts` | Vorhanden | — |
| **Language Quality** | ⚠️ | DE/EN nur | Keine FR/IT, teilweise DE-only | — (siehe 1.1) |

### 5.3 Kanzlei-OS Features — Ergänzungen

| Item | Status | Code-Beleg | Lücke | Fix / Aufwand |
|------|--------|------------|-------|---------------|
| **Mandantenverwaltung** | ⚠️ | `src/app/dashboard/contacts/page.tsx` | Kontakte vorhanden, aber keine vollständige CRM/Mandanten-Historie | Mandanten-CRM-View — **M** (1 Woche) |
| **Aktenverwaltung** | ✅ | `src/app/dashboard/cases/[slug]/page.tsx` | Vorhanden | — |
| **Zeiterfassung** | ✅ | `src/app/dashboard/cases/[slug]/page.tsx` (Timer, Time Entries) | Vorhanden | — |
| **Rechnungsstellung** | ✅ | `src/app/dashboard/invoicing/page.tsx` | Vorhanden | — |
| **Verfahrensdokumentation** | ✅ | `src/lib/gobd-verfahrensdoku.ts`, `src/app/dashboard/verfahrensdoku/page.tsx` | Vorhanden | — |
| **Handakte** | ⚠️ | `src/app/dashboard/vault/page.tsx` | Vault vorhanden, aber keine Index-Struktur wie physische Handakte | Handakte-Index + Ordnerstruktur — **M** (3 Tage) |
| **Korrespondenz** | ✅ | beA-Entwürfe, E-Mail-Import | Vorhanden | — |

### 6.1 Subsumio USPs — Ergänzungen

| Item | Status | Code-Beleg | Lücke | Fix / Aufwand |
|------|--------|------------|-------|---------------|
| **European Law Focus** | ✅ | `law-corpus/` | Vorhanden | — |
| **Multi-Jurisdiction** | ✅ | AT/DE/CH | Vorhanden | — |
| **GoBD Compliance** | ✅ | `src/lib/gobd.ts` | Vorhanden | — |
| **beA Integration** | ⚠️ | Nur Import/Drafts | Kein Send | — (siehe 4.1) |
| **RVG Cost Calculation** | ✅ | `src/lib/rvg.ts` | Vorhanden | — |
| **Self-Hosted Option** | ✅ | `server/` + PGLite | Vorhanden | — |
| **Brain-System** | ✅ | `CLAUDE.md`, `src/lib/engine.ts` | Vorhanden | — |

### 6.2 Wo Harvey besser ist — Ergänzungen

| Item | Status | Code-Beleg | Lücke | Fix / Aufwand |
|------|--------|------------|-------|---------------|
| **Contract Review AI** | ⚠️ | `src/app/api/legal/playbooks/route.ts` (statisch) | Tiefe Klausel-Analyse fehlt | — (siehe 1.4) |
| **Case Law Coverage** | ⚠️ | `src/lib/judgements.ts` (nur DACH) | Kein US/UK | — (siehe 1.2) |
| **Model Quality** | ❓ | Engine-seitig, nicht im Web-Code | Unbekannt, da Engine abstrahiert | Model-Evaluation + Fine-Tuning-Doku — **L** (variiert) |
| **Enterprise Features** | ⚠️ | SCIM vorhanden, aber SAML/SSO fehlt | Kein SAML | SAML-SSO via WorkOS/Auth0 — **L** (2–3 Wochen) |
| **Marketplace** | ❌ | Nicht gefunden | Kein Integration-Marketplace | Connector-Marketplace-UI — **L** (2–3 Wochen) |

### 7.1 Data Scenarios — Ergänzungen

| Item | Status | Code-Beleg | Lücke | Fix / Aufwand |
|------|--------|------------|-------|---------------|
| **Empty Brain** | ✅ | `src/app/dashboard/page.tsx:140-171` | Vorhanden | — |
| **Large Dataset** | ⚠️ | `src/app/api/legal/analyze/route.ts` (80k char limit), `src/app/dashboard/tabular-review/page.tsx` (limit 50) | Keine dokumentierte Performance-Grenze | Pagination/Streaming für große Sets — **M** (3 Tage) |
| **Special Characters** | ⚠️ | `src/lib/sanitize-html.ts`, `src/lib/prompt-sanitizer.ts` | Keine expliziten Tests für Umlaute/Emoji in Dokumenten | Test-Case hinzufügen — **S** (4h) |
| **Corrupt Upload** | ✅ | `src/lib/virus-scan.ts`, `src/lib/upload-validation.ts` | Vorhanden | — |

### 7.2 User Scenarios — Ergänzungen

| Item | Status | Code-Beleg | Lücke | Fix / Aufwand |
|------|--------|------------|-------|---------------|
| **Concurrent Edits** | ❌ | `src/app/dashboard/cases/[slug]/page.tsx` version field, aber kein Locking | Keine Conflict-Resolution | Optimistic Locking — **M** (3 Tage) |
| **Permission Edge** | ✅ | `src/lib/permissions.ts`, `src/lib/api-handler.ts` | Vorhanden | — |
| **Session Expiry** | ⚠️ | `src/lib/auth/session-core.ts` | Edge-Revocation ist best-effort; graceful Recovery nicht getestet | Session-Refresh + Retry — **M** (3 Tage) |
| **Offline Mode** | ⚠️ | `src/lib/offline-store.ts` | Cache + Mutation-Queue vorhanden, aber keine Auto-Sync-UX | Auto-Sync + Pending-Badge — **M** (3 Tage) |

### 7.3 Security Edge Cases — Ergänzungen

| Item | Status | Code-Beleg | Lücke | Fix / Aufwand |
|------|--------|------------|-------|---------------|
| **Path Traversal** | ✅ | `src/lib/sanitizeFilename` in `upload-validation.ts` | Vorhanden | — |
| **SSRF** | ⚠️ | `src/app/api/upload/route.ts` forwarded to `ENGINE_URL` (fixed), aber generische Webhook-Handler ohne URL-Validierung | Keine URL-Allowlist für externe Fetch-APIs | URL-Allowlist + SSRF-Guard — **M** (3 Tage) |
| **ReDoS** | ✅ | `server/src/core/schema-pack/redos-guard.ts` (Engine), `src/lib/ai-deadline-detect.ts` Regexes sind einfach | Engine-seitig abgedeckt, Web-Regexes kurz | — |
| **Mass Assignment** | ⚠️ | `src/app/api/legal/playbooks/route.ts:28` verwendet `.passthrough()` | Zusätzliche Felder könnten gespeichert werden | `.passthrough()` entfernen + striktes Schema — **S** (4h) |

---

## 2. Priorisierter Implementierungsplan

### Priorisierungs-Logik

- **P0 — Production Blocker / Compliance:** Sicherheits- und Stabilitärisiken, die eine Produktionsfreigabe verhindern sollten.
- **P1 — Quick Wins mit hohem Business-Wert:** ≤ 1 Woche Aufwand, messbare UX-Verbesserung.
- **P2 — Competitive Parity:** Features, die Harvey oder vergleichbare Plattformen als Standard bieten.
- **P3 — Strategic Differentiation:** Langfristige USPs, die Subsumio gegenüber Harvey abheben.

---

### P0 — Production Blocker & Compliance (Sofort)

| # | Feature | Dateien | Abhängigkeiten | Aufwand | Akzeptanzkriterien |
|---|---------|---------|----------------|---------|-------------------|
| 0.1 | **Mass Assignment in Playbooks schließen** | `src/app/api/legal/playbooks/route.ts:28` | — | **S** (4h) | `.passthrough()` entfernen, Schema strikt, Tests für unbekannte Felder |
| 0.2 | **CSP mit Nonce für Dashboard** | `next.config.ts`, `src/middleware.ts`, `src/app/layout.tsx` | — | **M** (3 Tage) | `unsafe-inline` entfernt, nonces generiert, Dashboard funktioniert, CSP-Tests |
| 0.3 | **Encryption-Key Enforcement in Produktion** | `src/lib/encryption.ts`, `.env.example` | — | **S** (4h) | Start blockiert, wenn `SIGMABRAIN_ENCRYPTION_KEY` fehlt; keine `sbplain:` in prod |
| 0.4 | **CSRF-Cookie-Fehler graceful handhaben** | `src/lib/csrf.ts`, `src/lib/api.ts` | — | **S** (4h) | Fehlender/ablaufener Cookie führt zu erneutem Setzen + Retry, nicht 403 |
| 0.5 | **Security Scanning in CI** | `.github/workflows/ci.yml`, `package.json` | gitleaks install | **M** (2 Tage) | CI läuft `gitleaks`, `npm audit`, Dependabot aktiv |
| 0.6 | **Alle API-Routen auf `createHandler` migrieren** | Legacy routes in `src/app/api/**` | — | **L** (1 Woche) | Keine ad-hoc Route-Handler mehr, Audit-Trail lückenlos |

---

### P1 — Quick Wins (≤ 1 Woche, hoher Wert)

| # | Feature | Dateien | Abhängigkeiten | Aufwand | Akzeptanzkriterien |
|---|---------|---------|----------------|---------|-------------------|
| 1.1 | **GoBD-Integritätspanel für alle Dokumente** | `src/components/gobd-integrity-panel.tsx`, `src/app/dashboard/vault/page.tsx`, `src/app/dashboard/cases/[slug]/page.tsx` | — | **S** (4h) | Hash-Soll/Ist-Prüfung sichtbar auf Vault + Case-Dokumenten |
| 1.2 | **Kanzlei-Settings Validierung** | `src/lib/schemas/settings.ts`, `src/app/dashboard/settings/page.tsx`, `src/lib/kanzlei-settings.ts` | — | **S** (4h) | VAT/IBAN/Steuernummer-Validierung im Zod-Schema |
| 1.3 | **Vercel-Cron für Deadline-Reminders** | `vercel.json`, `src/app/api/cron/deadline-reminders/route.ts` | SMTP-Settings | **S** (4h) | Cron läuft täglich, reminders werden verschickt, Status-Log |
| 1.4 | **Timer-Persistenz (client-seitig)** | `src/app/dashboard/cases/[slug]/page.tsx:200-206`, `src/lib/offline-store.ts` | — | **S** (1 Tag) | Laufender Timer überlebt Reload via localStorage/IndexedDB |
| 1.5 | **2FA-Seite in A11y-Scan** | `tests/e2e-playwright/accessibility.spec.ts`, `tests/e2e-playwright/two-factor-flow.spec.ts` | — | **S** (1h) | `/dashboard/settings/security` (2FA) wird gescannt |
| 1.6 | **Trial-Status in UI sichtbar** | `src/lib/plans.ts`, `src/app/dashboard/settings/page.tsx`, `src/app/dashboard/billing/page.tsx` | — | **S** (4h) | Trial-Badge, verbleibende Tage, Upgrade-CTA |
| 1.7 | **Notification-Preferences-Tab** | `src/app/dashboard/settings/page.tsx`, `src/lib/schemas/settings.ts`, `src/lib/kanzlei-settings.ts` | — | **M** (3 Tage) | User kann E-Mail/In-App/Push pro Typ ein-/ausschalten |
| 1.8 | **Assignment-Filter + Notifications** | `src/app/dashboard/cases/[slug]/page.tsx`, `src/lib/comments.ts`, `src/app/dashboard/tasks/page.tsx` | — | **S** (1 Tag) | Task-Owner bekommt Erinnerung, Filter „Meine Aufgaben" |

---

### P2 — Competitive Parity (1–4 Wochen)

| # | Feature | Dateien | Abhängigkeiten | Aufwand | Akzeptanzkriterien |
|---|---------|---------|----------------|---------|-------------------|
| 2.1 | **Citation Grounding für Chat/Think** | `src/lib/api.ts`, `src/app/api/legal/analyze/route.ts` (groundCitations extrahieren), neuer `src/app/api/think/route.ts` | Engine-Think-Endpunkt | **M** (1 Woche) | Jede Antwort enthält verifizierte Zitate + Konfidenz; unbekannte Zitate werden markiert |
| 2.2 | **Jurisdiction-Enforcement in allen Legal-Prompts** | `src/app/api/legal/*`, `src/lib/legal-chat/actions.ts` | — | **S** (1 Tag) | Jurisdiction-Parameter im Prompt, Test für AT/DE/CH |
| 2.3 | **Clause Bank + Variable Insertion** | `src/app/dashboard/clauses/page.tsx`, `src/app/api/legal/clauses/route.ts`, `src/app/api/legal/contract-draft/route.ts` | Engine-Template-Engine | **M** (1 Woche) | CRUD für Klauseln, Drafting mit `{{party_a}}`, `{{case_number}}` etc. |
| 2.4 | **Contract Compare / Side-by-Side** | `src/app/dashboard/compare/page.tsx`, `src/app/api/legal/compare/route.ts` | Diff-Engine | **L** (1–2 Wochen) | Zwei Verträge hochladen, Diff-View mit clause-level Markierung |
| 2.5 | **Enhanced Conflict Check (Party-Graph)** | `src/app/api/legal/conflict-check/route.ts`, `src/lib/legal-types.ts`, `src/app/dashboard/kollisionspruefung/page.tsx` | Entity-Index | **L** (2 Wochen) | Prüfung gegen Mandanten, Gegner, Kontakte, Tochtergesellschaften; Report-Export |
| 2.6 | **beA-Import via Drag/Drop XML** | `src/app/dashboard/bea/page.tsx`, `src/app/api/legal/bea/import/route.ts` | XML-Parser | **M** (3 Tage) | XML-Upload erstellt `bea_message` Pages ohne CLI |
| 2.7 | **DATEV Export verbessern (pro Eintrag USt)** | `src/app/dashboard/datev-export/page.tsx:58-62` | — | **M** (3 Tage) | Pro Eintrag USt-Satz, korrekte Steuerkennzeichen |
| 2.8 | **API-Key Scopes & Limits** | `src/lib/api-key-store.ts`, `src/app/dashboard/api-keys/page.tsx`, `src/lib/api-handler.ts` | — | **M** (3 Tage) | Keys können auf Read/Write/Legal beschränkt werden |
| 2.9 | **Global Search in Command Palette** | `src/components/dashboard/command-palette.tsx`, `src/lib/queries/brain.ts` | Brain-Search-API | **M** (3 Tage) | Suche nach Akten, Kontakten, Dokumenten, Fristen aus Cmd+K |
| 2.10 | **Optimistic Locking für Case-Edits** | `src/app/dashboard/cases/[slug]/page.tsx`, `src/lib/api.ts` | Backend-Version-Check | **M** (3 Tage) | 409-Conflict bei gleichzeitigem Speichern, Merge-Dialog |

---

### P3 — Strategic Differentiation (1–3 Monate)

| # | Feature | Dateien | Abhängigkeiten | Aufwand | Akzeptanzkriterien |
|---|---------|---------|----------------|---------|-------------------|
| 3.1 | **Engine-Playbook-Evaluator mit KI-Abweichungsanalyse** | `src/app/api/legal/playbooks/route.ts`, `src/app/api/legal/contract-redline/route.ts`, neuer `src/app/api/legal/playbook-evaluate/route.ts` | Engine-Contract-Review-Model | **L** (3–4 Wochen) | Playbook-Regeln werden gegen Gegnerntext geprüft, clause-level Risiko-Score, Report |
| 3.2 | **Echter beA-Versand (XML-Export)** | `src/app/api/legal/bea/send/route.ts`, `src/app/dashboard/bea/page.tsx` | beA-Zertifikat/Partner | **L** (2–3 Wochen) | Entwurf kann als XML exportiert/beA-konform signiert werden |
| 3.3 | **Live-Cursor / Co-Editing für Verträge** | Neuer `src/app/dashboard/contracts/[slug]/edit/page.tsx`, WebSocket-Room | WebSocket/CRDT | **L** (3–4 Wochen) | Zwei Nutzer sehen Cursor in Echtzeit, Konflikte automatisch aufgelöst |
| 3.4 | **US/UK Case-Law-Integration** | `src/lib/judgements.ts`, `src/app/api/legal/judgements/route.ts` | CourtListener/BAILII API | **L** (1–2 Wochen) | Suche über Common-Law-Quellen, Zitationen verfügbar |
| 3.5 | **Vollständiges Client-Portal** | `src/lib/portal-token.ts`, `src/app/dashboard/client-portal/page.tsx`, neuer `src/app/portal/[token]/page.tsx` | Portal-Auth | **L** (1–2 Wochen) | Mandant sieht freigegebene Dokumente, Fristen, kann kommentieren |
| 3.6 | **Google/Outlook Calendar Sync** | `src/app/api/connectors/calendar/route.ts`, `src/app/dashboard/calendar-export/page.tsx` | OAuth-Connector | **L** (1–2 Wochen) | Zwei-Wege-Sync von Fristen mit Google/Outlook |
| 3.7 | **Backup & Restore für Tenant** | `src/app/api/admin/backup/route.ts`, `src/app/dashboard/settings/page.tsx` | Export-Engine | **L** (1–2 Wochen) | Vollständiger JSON-Export + Import des Brains |
| 3.8 | **Connector-Marketplace / OAuth-Wizard** | `src/app/dashboard/connectors/page.tsx`, `src/app/api/connectors/oauth/route.ts` | OAuth-Apps | **L** (2–3 Wochen) | UI für Google Drive, Dropbox, Notion OAuth ohne CLI |
| 3.9 | **IRAC / Legal Reasoning-Framework** | `src/app/api/legal/memo/route.ts`, `src/app/dashboard/drafting/page.tsx` | Prompt-Engineering | **M** (1 Woche) | Memos folgen IRAC-Struktur, Eval für Reasoning-Qualität |
| 3.10 | **SAML-SSO** | `src/lib/scim.ts`, `src/app/api/auth/saml/route.ts`, `src/app/dashboard/settings/scim/page.tsx` | WorkOS/Auth0 SAML | **L** (2–3 Wochen) | Enterprise-Kanzleien können IdP (Azure AD, Okta) nutzen |

---

## 3. Roadmap-Matrix

| Priorität | Kurzfrist (0–4 Wochen) | Mittelfrist (1–3 Monate) | Langfrist (3–6 Monate) |
|-----------|------------------------|--------------------------|------------------------|
| **P0 Blocker** | CSP-Nonce, Mass-Assignment, Encryption, CSRF, Security-CI | API-Handler-Migration abschließen | — |
| **P1 Quick Wins** | GoBD-Panel, Kanzlei-Validierung, Timer-Persistenz, Trial-Status, 2FA-A11y | Notification-Preferences, Assignment | — |
| **P2 Parity** | Grounding für Chat, Jurisdiction-Enforcement, beA-Import, DATEV-USt | Clause Bank, Conflict-Check, Compare-View, API-Key Scopes | Global Search, Optimistic Locking |
| **P3 Differentiation** | — | Playbook-Evaluator, Client-Portal, Case-Law US/UK, Calendar Sync | beA-Send, Live-Co-Editing, SAML, Marketplace |

---

## 4. Abhängigkeiten & Risiken

### Kritische Abhängigkeiten
1. **Engine-Features:** Viele Legal-Features (Playbook-Evaluator, Citation Grounding, IRAC, Compare) erfordern Änderungen oder neue Endpunkte in der gbrain-Engine (`server/`). Ohne Engine-Team müssen diese P3 bleiben.
2. **Externe Zertifikate:** beA-Send und SAML erfordern Zertifikate/Partner-Verträge (Anwaltssignaturkarte, beA-Software, IdP).
3. **OAuth-Apps:** Google/Outlook Calendar Sync, Dropbox, Notion benötigen registrierte OAuth-Apps und Privacy-Policy.

### Risiken
- **Regulatorisch:** beA-Send ohne zertifizierte Komponente ist rechtlich nicht zulässig. Fokus auf XML-Export + Partner-Integration.
- **Security:** CSP-Nonce-Refactor kann kleine JS-Probleme verursachen; muss vollständig E2E-getestet werden.
- **Performance:** Live-Co-Editing und Connector-Syncs können die Engine-Load erhöhen; Monitoring erforderlich.

---

## 5. Empfohlene Vorgehensweise

1. **Sofort (diese Woche):** P0-Items 0.1, 0.3, 0.4, 0.5 und P1-Items 1.1, 1.2, 1.5 implementieren. Das sind Sicherheits- und UX-Quick-Wins.
2. **Nächste 2 Wochen:** P1-Items 1.3, 1.4, 1.6, 1.7, 1.8 + P2-Items 2.1, 2.2, 2.6, 2.7. Diese schließen die wichtigsten Lücken gegenüber Harvey.
3. **Monat 2:** P2-Items 2.3, 2.4, 2.5, 2.8, 2.9, 2.10. Hier entsteht echte Competitive Parity.
4. **Monat 3+:** P3-Items nach Engine-Kapazität und Partner-Verfügbarkeit priorisieren. Top: 3.1 (Playbook-Evaluator), 3.5 (Client-Portal), 3.4 (US/UK Case Law).

---

## 6. Update des Audit-Reports

Dieses Dokument ergänzt den ursprünglichen Audit-Report. Der Gesamt-Score ändert sich durch die neu identifizierten Lücken marginal:

- **PHASE 1:** 90% → 88% (OCR, Translation, Clause Bank, Variable Insertion fehlen)
- **PHASE 2:** 86% → 85% (Global Search, Push Notifications, Notification Preferences fehlen)
- **PHASE 3:** 90% → 89% (API-Versionierung, Bundle-Budget, Security-Scanning fehlen)
- **PHASE 4:** 82% → 81% (Google/Outlook Sync, Connector-OAuth fehlen)
- **PHASE 5:** 92% → 91% (Gerichtsstruktur, IRAC fehlen)
- **PHASE 6:** 86% → 85% (SAML, Marketplace fehlen)
- **PHASE 7:** 84% → 83% (Concurrent-Edit, Session-Expiry-Recovery fehlen)

**Korrigierter GESAMT-SCORE: 86%** (vorher 88%).  
**PRODUCTION READY bleibt ✅**, wenn P0-Items umgesetzt werden.

---

**End of implementation plan.**
