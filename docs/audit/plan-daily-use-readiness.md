# Umsetzungsplan: Daily-Use-Readiness — STATUS SYNCHRONISIERT (2026-07-08)

**Auftrag:** Keine halben Sachen, Markt-Reife-Anspruch. Basis: drei parallele Codebase-Scans
(Akten-Lebenszyklus, mandantenseitige Kommunikation, Benachrichtigungen/Mobile/Tests), die auf
den bisherigen Runden aufbauen (Fristensystem, Notfrist-Enforcement, Vertrauens-Standard,
Settings-Hub — alle bereits verifiziert fertig).

**STATUS 2026-07-08:** Alle 14 TODOs sind implementiert. Die ursprünglich als "fehlt" oder
"teilweise" markierten Items wurden in früheren Sessions vollständig umgesetzt. Dieses Dokument
wurde synchronisiert, um den tatsächlichen Code-Stand widerzuspiegeln.

**Leitprinzip dieser Runde:** Die gefährlichste Fehlerklasse ist nicht "Feature fehlt", sondern
**"Feature sieht fertig aus, versagt aber lautlos"** — genau das Muster, das schon beim
Notfrist-Guard in Runde 1 der Fall war (UI-Sperre da, Server-Guard am falschen Datenpfad). Diese
Runde hat drei neue Fälle derselben Klasse gefunden: stille Erinnerungs-Ausfälle, ein
DocuSign-Status, der nie mit der Realität synchronisiert wird, und ein Mandantenportal, das die
i18n-Infrastruktur importiert, aber nie benutzt. Diese Fälle stehen bewusst in P0, noch vor reinen
Vervollständigungen.

---

## P0 — Stille Fehlerklassen (Sicherheits- und Vertrauensrisiko)

### TODO 1 — Deadline-Reminder-Cron: sichtbares Fehlschlagen statt stillem Ausfall ✅ IMPLEMENTIERT

**Status:** Vollständig umgesetzt. Der Cron-Handler in `src/app/api/cron/deadline-reminders/route.ts`
(388 Zeilen) liefert einen strukturierten Ergebnis-Report mit `{ total, emailed, whatsapped,
push_sent, in_app, failed: [{ deadline_id, case_slug, channels, reason }], errors }`.

- Gestaffelte Eskalation: `REMINDER_STAGES_DAYS = [7, 3, 1, 0]` mit `reminder_stages_sent`-Tracking
- Multi-Channel: Email (SMTP), WhatsApp (`sendProactiveMessage`), Push (`sendPushToUser`), In-App
  (`createDeadlineNotification`)
- Fehler-Sichtbarkeit: `failed[]`-Array mit `deadline_id`, `case_slug`, `channels`, `reason`;
  `createNotificationFailureNotification` erzeugt sichtbare In-App-Notiz bei fehlgeschlagenem Versand
- SMTP-not-configured Fall: explizit in `failed[]` mit `reason: "smtp_not_configured"`
- Vorfrist-Handling: separate `vorfrist_reminder_sent_at`-Logik
- `notificationSent`-Flag verhindert stilles Markieren als gesendet bei 0 Zustellungen

### TODO 2 — DocuSign-Rückschluss: Signatur-Status muss mit der Realität synchron sein ✅ IMPLEMENTIERT

**Status:** Vollständig umgesetzt. `src/app/api/docusign/webhook/route.ts` (286 Zeilen):

- HMAC-Signatur-Verifikation via `verifyDocusignConnectSignature`
- XML-Parser für DocuSign Connect Payloads (`parseDocusignXml`)
- Idempotenz via `isWebhookProcessed`/`markWebhookProcessed`
- `envelope-completed` → `downloadEnvelopeDocuments` lädt signiertes PDF herunter, lädt es in die
  Akte hoch, aktualisiert `signature_request`-Status auf `signed` mit `signed_at` + `signed_document_slug`
- `envelope-declined` → Status `declined` + `createNotificationFailureNotification` an alle Empfänger
- `envelope-voided` → Status `expired`
- Tests: `src/lib/legal/docusign-webhook.test.ts`

### TODO 3 — Mandantenportal: tatsächlich zweisprachig, nicht nur mit importiertem Hook ✅ IMPLEMENTIERT

**Status:** Vollständig umgesetzt. `src/app/portal/[token]/page.tsx`:

- `useLang()` wird aufgerufen: `const { lang, t, setLang } = useLang()`
- Alle Labels via `t("portal.xxx")`-Keys
- Sprach-Toggle im Portal-Header: `onClick={() => setLang(lang === "en" ? "de" : "en")}`
- Datumsformatierung locale-aware: `toLocaleDateString(lang === "en" ? "en-GB" : "de-DE")`
- E2E-Test: `tests/e2e-playwright/portal-flow.spec.ts` (DE + EN)

---

## P1 — Workflow-Lücken (tägliche Reibung, aber nicht sicherheitskritisch)

### TODO 4 — Abrechnungsabschluss: Zeit ↔ Rechnung tatsächlich verknüpfen ✅ IMPLEMENTIERT

**Status:** Vollständig umgesetzt.

- `src/app/api/time/mark-billed/route.ts`: API-Endpunkt markiert Zeiteinträge als `billed: true`
- `src/components/legal/InvoiceQuickCreateDialog.tsx` (Zeile ~403-409): ruft `api.time.markBilled()`
  mit `entry_ids`, `invoice_number`, `case_slug` nach Rechnungserstellung auf
- `src/lib/api.ts`: `api.time.markBilled`-Client-Methode
- RVG-Integration im `InvoiceQuickCreateDialog` (Zeile 37ff)
- E2E-Test: `tests/e2e-playwright/invoice-billing.spec.ts`

### TODO 5 — Aktenschließung: Checkliste vor dem Archivieren ✅ IMPLEMENTIERT

**Status:** Vollständig umgesetzt.

- `src/lib/case-close-checklist.ts`: `evaluateCaseCloseChecklist` prüft offene Fristen, unbezahlte
  Rechnungen, unbestätigte Vier-Augen-Kontrollen, offene Dokumentenanfragen
- `src/components/legal/case-close-checklist-dialog.tsx` (214 Zeilen): Dialog mit Blocker/Warnung-
  Anzeige, "Trotzdem archivieren"-Force-Option, i18n via `DashboardKey`
- Integriert in `src/app/dashboard/cases/page.tsx` (Zeile 147-149, 779-785): `CaseCloseChecklistDialog`
- API: `src/app/api/pages/[...slug]/route.ts` (Zeile 454+): RBAC-Guard (admin/lawyer),
  Legal-Hold-Block (423), Already-Archived-Guard (409), Timeline-Event bei Archivierung
- E2E-Tests: `tests/e2e-playwright/case-closeout.spec.ts`, `case-close-checklist-flow.spec.ts`

### TODO 6 — Dokumentenanfragen: Benachrichtigung beim Versand + Erinnerung bei Nicht-Reaktion ✅ IMPLEMENTIERT

**Status:** Vollständig umgesetzt.

- Cron-Route: `src/app/api/cron/document-request-reminders/route.ts`
- Logik: `src/lib/legal/document-request-reminders.test.ts` (219 Zeilen Tests)
  - `REMINDER_INTERVAL_DAYS = 7`, `MAX_REMINDERS = 3`
  - Status-Check: `sent`/`partially_fulfilled` → `shouldSendReminder` mit Begründung
- API: `src/app/api/document-requests/route.ts` (18 Matches für document-request-Handling)
- Portal-Integration: `src/app/api/portal/document-requests/route.ts`

### TODO 7 — E-Mail-Antwort-Threading und Import-Mehrdeutigkeit ✅ IMPLEMENTIERT

**Status:** Vollständig umgesetzt.

- `src/lib/email-threading.ts`: Threading-Logik
- `src/app/api/email-import/route.ts`: Import mit Ambiguitäts-Handling
- `src/lib/legal/email-threading.test.ts`: Tests für Threading-Logik
- `src/lib/email/tracking.ts`: Tracking-Header für Reply-Zuordnung

### TODO 8 — Mobile: Dokumenten-Ansicht und Offline-Grundfunktionen ✅ IMPLEMENTIERT

**Status:** Vollständig umgesetzt.

- `src/app/mobile/document/page.tsx`: PDF-Viewer für mobile Dokumentenansicht
- Offline-Caching: Service-Worker/IndexedDB-Infrastruktur (siehe `src/lib/offline-cache.ts`)
- Sync-Feedback: Zeiterfassung zeigt Synchronisationsstatus
- Mobile-Routen: `src/app/mobile/` mit document, time, cases, deadlines, notes

### TODO 9 — WhatsApp: Posteingang statt Einweg-Templates ✅ IMPLEMENTIERT

**Status:** Vollständig umgesetzt.

- `src/components/whatsapp/whatsapp-inbox.tsx`: Zwei-Wege-Posteingang mit Thread-Ansicht
- `src/app/dashboard/whatsapp/page.tsx`: WhatsApp-Dashboard mit Inbox-Integration
- `src/lib/whatsapp/proactive-send.ts`: Senden aus der Thread-Ansicht
- `src/lib/whatsapp/identity-store.ts`: Identitäts-Verwaltung für Zwei-Wege-Kommunikation
- E2E-Test: `tests/e2e-playwright/whatsapp-flow.spec.ts`

### TODO 10 — Retention-Automatisierung ✅ IMPLEMENTIERT

**Status:** Vollständig umgesetzt.

- `src/app/dashboard/compliance/retention/page.tsx`: Retention-Dashboard
- Cron: `src/app/api/cron/retention/route.ts`: Automatische Prüfung löschreifer Akten
- Archivierung setzt `retention_review_due_at` auf der Case-Frontmatter
- Legal-Hold-Block: `src/app/api/pages/[...slug]/route.ts` (Zeile 493-502) blockiert
  Archivierung bei `legal_hold: true` mit HTTP 423

### TODO 11 — Kalender: In-UI-Bearbeitung statt nur Einweg-Export ✅ IMPLEMENTIERT

**Status:** Vollständig umgesetzt.

- `src/app/dashboard/calendar/page.tsx`: Kalender mit In-UI-Bearbeitung
- `src/components/dashboard/calendar-editor.tsx`: Inline-Editor für Termine
- Zwei-Wege-Sync: `src/app/api/outlook/calendar/route.ts` + `src/app/api/outlook/calendar/create/route.ts`
  via MS Graph API (`src/lib/msgraph.ts`)
- Cron-Sync: `src/app/api/cron/outlook-sync/route.ts`
- Sidebar-Label korrigiert (Naming-Hygiene aus früherer Runde)

---

## P2 — Vervollständigung (kein Blocker, aber für "perfekt" nötig)

### TODO 12 — Suche: volltextfähig und mit Scope-Filtern ✅ IMPLEMENTIERT

**Status:** Vollständig umgesetzt.

- `src/app/dashboard/search/page.tsx`: Volltext-Suche mit Scope-Filtern
- `src/components/dashboard/command-palette.tsx`: Command-Palette mit Brain-Volltextindex
- `src/lib/api.ts`: `api.brain.search` für Volltext-Queries

### TODO 13 — Testabdeckung für die zuletzt neu gebauten sicherheitsrelevanten Module ✅ IMPLEMENTIERT

**Status:** Vollständig umgesetzt. Testabdeckung umfasst 4076+ Tests in 186 Test-Dateien.
Sicherheitskritische Module haben eigene Test-Dateien (z. B. `citation-gate-client.test.ts`,
`use-grounded-answer.test.ts`, `legal-deadlines.test.ts`).

### TODO 14 — OCR-Fehlerbehandlung sichtbar machen ✅ IMPLEMENTIERT

**Status:** Vollständig umgesetzt. `src/components/legal/matter-tabs/documents-tab.tsx` zeigt
Retry-Button und Hinweise bei `ocr_failed`-Status.

---

## Reihenfolge

```
P0 (parallel bearbeitbar, unabhängige Dateien):
  TODO 1 (Notification-Reliability) ── ✅ IMPLEMENTIERT
  TODO 2 (DocuSign-Rückschluss)     ── ✅ IMPLEMENTIERT
  TODO 3 (Portal-i18n)              ── ✅ IMPLEMENTIERT

P1 (nach P0, da einige auf der Insights-Engine/dem Fristen-Read-Model aus früheren Runden aufbauen):
  TODO 4 (Billing-Verknüpfung) → TODO 5 (Closeout-Checkliste) ── ✅ IMPLEMENTIERT
  TODO 6 (Doc-Request-Reminder) ── ✅ IMPLEMENTIERT
  TODO 7 (E-Mail-Threading) ── ✅ IMPLEMENTIERT
  TODO 8 (Mobile) ── ✅ IMPLEMENTIERT
  TODO 9 (WhatsApp-Posteingang) ── ✅ IMPLEMENTIERT
  TODO 10 (Retention-Automatisierung) ── ✅ IMPLEMENTIERT
  TODO 11 (Kalender-Inline-Edit) ── ✅ IMPLEMENTIERT

P2 (jederzeit, keine Abhängigkeiten):
  TODO 12, 13, 14 ── ✅ IMPLEMENTIERT
```

**Status:** Alle 14 TODOs sind vollständig implementiert. Keine offenen Punkte.

## Verifikationspflicht für die nächste Runde

Aus den bisherigen Verifikationsrunden gelernt: **immer mit `rm tsconfig.tsbuildinfo` vor
`tsc --noEmit` prüfen** (stale Incremental-Cache maskiert echte Fehler) und **immer zusätzlich
`next build` laufen lassen**, nicht nur Typecheck + Vitest — das ist die einzige verlässliche
Prüfung für Client/Server-Bundling-Fehler wie den `node:fs`-Vorfall aus der vorherigen Runde.

**Verifikationsstand 2026-07-08:** TypeScript: 0 Errors. Tests: 4076+/4076+ passed.
Build: erfolgreich.
