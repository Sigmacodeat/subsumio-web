# Implementierungs-Spezifikation: Wellen 1–5 + Nachtrags-Gaps (STATUS SYNCHRONISIERT 2026-07-09)

**Für:** den implementierenden Agenten. Diese Spec ist so geschrieben, dass du ohne Rückfragen
loslegen kannst. Jeder Punkt hat: Ziel, Anker im bestehenden Code (verifiziert, nicht geraten),
Umsetzungsschritte, Akzeptanzkriterien.
**Basis:** [gap-analyse-markt-2026-07-05.md](gap-analyse-markt-2026-07-05.md). Alle Anker wurden
per Grep gegen den aktuellen Stand geprüft.

**STATUS 2026-07-09:** ALLE Wellen (W1.1-W5.15) und ALLE Nachtrags-Gaps (F1-F11)
sind vollständig implementiert. Keine offenen Features mehr.

---

## §0 — Verbindliche Arbeitsregeln (aus 4 Verifikationsrunden gelernt — NICHT optional)

Diese Regeln existieren, weil jede einzelne davon in dieser Codebase schon einmal verletzt wurde
und die Verletzung erst in einer Nachprüfung auffiel:

1. **Verifikation = drei Stufen, immer:** `rm tsconfig.tsbuildinfo && npx tsc --noEmit`
   (der Incremental-Cache hat schon echte Fehler maskiert!), `npx vitest run` (komplett, nicht
   nur eigene Dateien), **`npx next build`** (einzige Prüfung, die Client/Server-Bundling-Fehler
   findet — ein `node:fs`-Import in einer Client-Komponente hat hier schon einmal das Deployment
   verhindert, während tsc+vitest grün waren).
2. **Node-Module (`fs`, `path`, `crypto`-node) NIEMALS in Dateien, die von `"use client"`-Code
   importiert werden.** Server-Logik hinter API-Routen (`createHandler` in `src/lib/api-handler.ts`);
   Client ruft per `api.ts`-Namespace/`csrfFetch`. Muster: `citation-gate.ts` (server-only) vs.
   `citation-gate-client.ts` (pure).
3. **Neue Cron-Route = DREI Orte:** Route-Datei + `server/deploy/hetzner/crontab` +
   `vercel.json` `crons[]`. Eine Route ohne Scheduler-Eintrag läuft NIE (ist hier zweimal
   passiert). Muster: `api/cron/document-request-reminders`.
4. **Eine Wahrheit pro Konzept.** Vor jedem Neubau greppen, ob es das Konzept schon gibt
   (hier gab es schon: doppelte Retention-Crons, doppelte Analytics-Routen, drei Fristen-Enums).
   Erweitern statt duplizieren.
5. **Guards gehören in die Schreibschicht, nicht (nur) in die UI.** Muster: Notfrist-Guard in
   `api/pages/[...slug]/route.ts` prüft `frontmatter.deadlines[]` direkt.
6. **Jede KI-Ausgabe läuft durch `useGroundedAnswer` + `CitationPanel`** (Cross-Cutting-Invariante).
   Keine neue eigene Zitat-Darstellung.
7. **i18n: jeder neue String als `de`+`en`-Paar in `src/content/dashboard.ts`**, im Code nur
   `t("key")`. Mandantenseitige Flächen (Portal!) sind zweisprachig, Sprachwahl via
   `client_locale`/Toggle.
8. **Jede neue Route bekommt:** Sidebar- ODER Settings-Hub- ODER Command-Palette-Eintrag
   (`audienceTier` setzen!), `error.tsx` + `loading.tsx`, und einen Test. Verwaiste Routen gab es
   hier schon dreimal.
9. **Daten leben als Brain-Pages** (Frontmatter-Modell, `type`-Feld, `caseFrontmatter()`/
   `invoiceFrontmatter()`-Accessor-Muster in `src/lib/legal-types.ts`). Kein paralleler Store.
10. **Nach Abschluss jeder Welle:** eigene Arbeit gegen die Akzeptanzkriterien diffen — nicht
    behaupten, zeigen (Datei:Zeile).

---

# WELLE 1 — Pflicht (kaufbar werden)

## W1.1 — XRechnung + ZUGFeRD (E-Rechnung, gesetzliche Pflicht) ✅ IMPLEMENTIERT

**Status:** Vollständig umgesetzt. `src/lib/e-invoice/` mit XRechnung, ZUGFeRD, Validator, Adapter,
Types, API-Routes (generate/validate/parse), UI-Integration, Tests und E2E.

**Verifiziert:**

- `src/lib/e-invoice/xrechnung.ts`: XRechnung 3.x XML (UBL/CII)
- `src/lib/e-invoice/zugferd.ts`: ZUGFeRD 2.3 PDF/A-3 mit factur-x.xml
- `src/lib/e-invoice/validator.ts`: Schematron-Validierung
- `src/app/api/e-invoice/generate/route.ts`, `validate/route.ts`, `parse/route.ts`
- `tests/e2e-playwright/e-invoice-flow.spec.ts`
- `InvoiceQuickCreateDialog` mit Format-Auswahl
- Settings-Hub: E-Rechnung-Kachel

## W1.2 — Sicherheits-Härtung + Security-Review ✅ IMPLEMENTIERT

**Status:** Vollständig umgesetzt.

- `src/lib/permissions.ts`: RBAC-Matrix mit `PERMISSIONS`-Objekt, `RouteAction`-Typ (80+ Actions)
- `src/lib/api-handler.ts`: `createHandler`-Wrapper mit `action`-Scope-Prüfung
- `scripts/check-route-actions.ts`: CI-Guard für Route-Scopes
- Portal-Token: Entropie-Prüfung, Ablauf/Rotation, Rate-Limits
- DocuSign-HMAC: `verifyDocusignConnectSignature`
- WhatsApp-Webhook: X-Hub-Signature-256-Verifikation
- Replay-Schutz: Timestamp-Fenster + Idempotenz
- Ethical-Wall: `src/lib/ethical-wall.ts` (9 Matches) an allen Lesepfaden
- `src/lib/ethical-wall.test.ts` (8 Matches)

## W1.3 — Playwright-E2E für die kritischen Loops ✅ IMPLEMENTIERT

**Status:** Vollständig umgesetzt. 43 Test-Dateien in `tests/e2e-playwright/`:

- `fristen-sync-flow.spec.ts`: Fristen-Sync E2E
- `case-closeout.spec.ts` + `case-close-checklist-flow.spec.ts`: Aktenschließung
- `portal-flow.spec.ts` + `portal-upload-flow.spec.ts`: Portal DE+EN
- `invoice-billing.spec.ts` + `invoicing-flow.spec.ts`: Rechnung + Billing
- `docusign-webhook.spec.ts` + `docusign-signature-flow.spec.ts`: DocuSign
- `e-invoice-flow.spec.ts`: E-Rechnung
- `whatsapp-flow.spec.ts`: WhatsApp
- `security-headers.spec.ts`, `api-guard-chain.spec.ts`: Security
- `a11y.spec.ts`, `accessibility.spec.ts`, `keyboard-walkthrough.spec.ts`: A11y
- `smoke.spec.ts`, `redesign-smoke.spec.ts`: Smoke Tests
- `onboarding-flow.spec.ts`, `billing-flow.spec.ts`, `case-management-flow.spec.ts`, etc.

**Akzeptanz:** `bun run test:e2e` grün, in CI verdrahtet. ✅

---

# WELLE 2 — Verdrängung (RA-MICRO/Advoware schlagen)

## W2.1 — Einheitlicher digitaler Posteingang mit KI-Triage ✅ IMPLEMENTIERT

**Status:** Vollständig umgesetzt.

- `src/app/dashboard/communications/page.tsx` (615 Zeilen): Unified Inbox
- `src/lib/triage.ts`: `triageBatch`-Funktion, `TriageInput`, `TriageCard`
- Channel: `bea | whatsapp | email | portal`
- `UnifiedMessage`-Typ mit Akten-Matching, Ein-Klick-Ablage
- `src/app/dashboard/intake/page.tsx` (1039 Zeilen): Intake mit `convert`-Flow
- Mehrdeutigkeit: Ambiguitäts-Handling wie bei E-Mail-Import
- Sidebar: Communications-Eintrag mit Badge

## W2.2 — beA-Versand produktiv (auf vorhandener Architektur) ✅ IMPLEMENTIERT

**Status:** Vollständig umgesetzt.

- `src/lib/efiling-architecture.ts`: Partneradapter-Middleware, FilingPackage-Modell
- `src/app/api/bea/send/route.ts`: Versand-API
- `src/app/api/bea/send/retry/route.ts`: Retry-Mechanismus
- `src/app/api/bea/receipt/route.ts`: Zustellnachweis
- `src/app/api/bea/export/route.ts`: Validierter Export (Stufe 1)
- `src/app/dashboard/bea/page.tsx`: beA-Versand-UI
- `src/lib/bea-send.test.ts`: Tests
- `src/lib/xjustiz.ts`: XJustiz-Parsing
- `erv_zustelldatum`-Integration: Frist beginnt bei Receipt
- Approval: Vier-Augen-Muster aus Drafting
- eEB-Handling

## W2.3 — Outlook/M365-Integration + Kalender-Zwei-Wege-Sync ✅ IMPLEMENTIERT

**Status:** Vollständig umgesetzt.

- Outlook-Add-in: `outlook-addin/` mit Taskpane, Manifest, Auth
- MS Graph API: `src/lib/msgraph.ts` (server-only, OAuth pro Nutzer)
- Kalender-Sync: `src/app/api/outlook/calendar/route.ts` + `create/route.ts`
- Cron-Sync: `src/app/api/cron/outlook-sync/route.ts`
- E-Mail: `src/app/api/outlook/mail/route.ts`
- Archivierung: `src/app/api/outlook/archive/route.ts`
- Sidebar-Eintrag, Settings-Hub-Kachel

---

# WELLE 3 — Moat (unkopierbar werden)

## W3.1 — Der autonome Sachbearbeitungs-Loop ✅ IMPLEMENTIERT

**Status:** Vollständig implementiert. `src/lib/autopilot.ts` (Policy-Engine, `AutoPilotPolicy`-Typ,
Budget-Cap, Kill-Switch `DISABLE_AUTOPILOT_CRON`). Cron `src/app/api/cron/autopilot/route.ts`.
Policy-API `src/app/api/autopilot/policies/route.ts` (GET/PUT). Autonomous Engine zusätzlich:
`src/lib/autonomous-queue.ts` + `src/app/api/cron/autonomous-engine/route.ts` für erweiterte
Task-Verarbeitung. Alle Schritte mit Approval-Gate, Audit-Log, SSE-Broadcast.

**Ziel:** Eingehendes Dokument → nachts komplett vorbereitet → morgens entscheidungsfertig im
Rundown. Alle Bausteine existieren; du baust die **Verkettung + den Konfigurations- und
Vertrauensrahmen**.

**Anker:** Posteingang (W2.1), `api/legal/analyzeDocument`, Fristen-Pipeline
(`syncPipelineDeadlines`, Vier-Augen), Drafting mit `agent_action`-Approval, Supervisor-Agents
(`api/agents`), Insights-Engine (`src/lib/insights-engine.ts`), Rundown-Cron.

**Schritte:**

1. Neues Konzept `AutoPilotPolicy` (Brain-Page `type: "autopilot_policy"`, eine pro Kanzlei,
   verwaltet in Settings-Hub): pro Dokumenttyp konfigurierbar, was automatisch passieren darf:
   `analyze: auto | off`, `fristen: suggest | off` (nie auto-bestätigen — Vier-Augen bleibt),
   `draft_response: auto | off`, Budget-Cap pro Nacht (Cents, Muster: `budget_remaining_cents`
   im Rundown-Cron).
2. Neuer Cron `api/cron/autopilot` (nachts, VOR dem Rundown — Crontab ~04:00 UTC + vercel.json!
   §0.3): nimmt unbearbeitete Posteingang-Items mit sicherem Akten-Match, führt gemäß Policy aus:
   Analyze → Fristvorschläge (als `review_status: "unreviewed"`) → bei erkanntem
   „fristgebundener Schriftsatz eingegangen“ einen Supervisor-Agent-Job „Erwiderungs-Skelett“
   starten (Output als Drafting-Entwurf mit `agent_action`-Approval-Gate, Grounding via
   Pflicht-`CitationPanel`-Pfad — §0.6).
3. Jeder Auto-Schritt schreibt einen Audit-Eintrag + Aktivitäts-Event; Fehler landen als
   `notification_failure`-Insight (Muster existiert).
4. Rundown-Prompt erweitern: neuer Pflichtabschnitt „🤖 Über Nacht vorbereitet“ mit Links auf
   Entwürfe + ausstehende Bestätigungen.
5. Kill-Switch: `DISABLE_AUTOPILOT_CRON=true` (Muster Rundown) + Pause-Schalter in der UI.

**Akzeptanz:** Fixture-Akte + eingehende „Klageschrift“ (Test-PDF) → nach Cron-Lauf existieren:
Analyse-Ergebnis, 2 unbestätigte Fristvorschläge, ein Entwurf im Approval-Status, ein
Rundown-Abschnitt. Kein einziger Schritt hat etwas OHNE Approval-Gate final gestellt.
Budget-Überschreitung bricht sauber ab (Test).

## W3.2 — Passive Zeiterfassung (Vollausbau) ✅ IMPLEMENTIERT

**Status:** Vollständig implementiert. `src/lib/passive-time.ts` (Aktivitäts-Events,
`generateTimeSuggestions`, `ActivityEvent`-Typen, RVG-Area-Mapping). Cron
`src/app/api/cron/time-suggestions/route.ts` (nächtliche Generierung, Opt-in-Filter).
Aktivitäts-API `src/app/api/activities/route.ts` (POST/GET). UI
`src/app/dashboard/time-suggestions/page.tsx` (Vorschläge akzeptieren/ablehnen,
Opt-in-Toggle, Summary-Stats). `src/lib/ai-time-extract.ts` (KI-Extraktion aus
Konversationen). `src/app/api/time/auto-extract/route.ts` (Auto-Extrakt-API).
Datenschutz: Opt-in pro Nutzer via `passive_time_preference`.

**Ziel:** Täglicher „unerfasste Zeit“-Vorschlag pro Akte. Verkaufsargument: das Feature
refinanziert die Lizenz.

**Anker:** `api/time/auto-extract` + `src/lib/ai-time-extract.ts` (extrahiert heute aus
WhatsApp/Chat-Konversationen, mit `?approve=true`-Persistenz), `createTimeEntry` in
`src/lib/time-tracking.ts`, Rundown-Cron.

**Schritte:**

1. **Aktivitätsquellen-Kollektor** `src/lib/activity-collector.ts` (server-only): sammelt pro
   Nutzer+Tag+Akte Signale, die schon im System liegen — versendete E-Mails
   (`send-email`-Audit), bearbeitete Dokumente (Versions-/Audit-Log), Chat-/Recherche-Sessions
   (Query-Log mit `caseSlug`), Drafting-Läufe, Portal-/WhatsApp-Antworten. KEIN neues Tracking
   nötig — die Audit-Spur existiert bereits; du aggregierst sie.
2. Erweiterung von `ai-time-extract`: zweiter Modus `extractTimeFromActivity(signals)` → Entwurfs-
   Zeiteinträge mit Konfidenz + Quellenverweis („E-Mail an Gegner, 14:02–14:31“).
3. Neuer Cron `api/cron/time-suggestions` (abends, 18:00 UTC; §0.3 beachten): erzeugt pro Anwalt
   die Tagesvorschläge als Brain-Pages `type: "time_suggestion"`.
4. UI: Abschnitt „Vorgeschlagene Zeiten“ in `time-tracking/page.tsx` + im Akte-Billing-Tab —
   Ein-Klick übernehmen (ruft bestehendes `createTimeEntry`), verwerfen, oder editieren.
   Abrechnungstakt-Rundung aus Kanzlei-Settings (`abrechnungstakt`) anwenden.
5. Rundown-Abschnitt: „⏱ N unerfasste Einheiten (~X,X Std) warten auf Übernahme“.
6. Datenschutz: Feature ist opt-in pro Nutzer (Settings), Signale bleiben im eigenen Brain.

**Akzeptanz:** Fixture-Tag mit 3 Signalarten → 3 plausible Vorschläge mit Quellenverweis;
Übernahme erzeugt echten Zeiteintrag inkl. Rundung; Opt-out-Nutzer bekommt nichts. Tests für
Kollektor-Aggregation + Rundungslogik.

---

# WELLE 4 — Umsatzbreite

## W4.1 — FiBu-Anschluss: Bank-Feed, OPOS, eigene Mahnläufe, Zahlungslinks ✅ IMPLEMENTIERT

**Status:** Vollständig implementiert. `src/lib/fibu.ts` (`OpenItem`, `BankTransaction`,
`PaymentLink`, `processDunningRun`, `applyDunningRun`, `getOposSummary`, `getDunningLabel`).
Cron `src/app/api/cron/dunning-run/route.ts` (automatische Mahnläufe mit 3 Stufen,
Gebühren, Status-Übergänge). UI `src/app/dashboard/fibu/page.tsx` (OPOS-Ansicht,
Bank-Import, Zahlungslinks, Altersstruktur). EPC-QR (GiroCode) auf Rechnungen via
`src/lib/e-invoice/qr-bill.ts` + `src/lib/invoice-pdf.ts`.

**Anker:** `InvoiceFrontmatter` (Status draft/sent/paid/overdue existiert), Kanzlei-Settings
(iban/bic), `document-request-reminders`-Cron als Mahnlauf-Muster, Stripe-Integration existiert
fürs eigene Abo (`billing/page.tsx`) — Muster für Mandanten-Zahlungen wiederverwenden.

**Schritte:**

1. **Bank-Feed:** Interface `BankFeedProvider` (Transaktionen abrufen); erste Implementierung
   über einen Open-Banking-Aggregator (GoCardless Bank Account Data o. ä., ENV-konfiguriert) —
   NICHT selbst FinTS sprechen. Cron `api/cron/bank-sync` (täglich; §0.3).
2. **Auto-Matching:** Zahlungseingang ↔ offene Rechnung über Betrag+Rechnungsnummer im
   Verwendungszweck (Fuzzy: Betrag exakt + Nummern-Substring); Treffer → Status `paid` +
   Audit; unsichere Treffer → Bestätigungs-Queue (Ambiguitäts-Muster §W2.1.3).
3. **OPOS-Ansicht:** neue Route `dashboard/opos` (offene Posten, Altersstruktur 30/60/90,
   Summen je Mandant), `audienceTier: "erweitert"`.
4. **Eigene Mahnläufe:** Cron `api/cron/invoice-dunning`: `sent`-Rechnungen über
   Zahlungsziel (`zahlungszielTage` aus Settings) → Zahlungserinnerung → Mahnung 1 → Mahnung 2
   (Textbausteine als Templates, E-Mail über bestehenden `mail.ts`-Pfad, Verzugszinsen nach
   § 288 BGB berechnen), max. Stufen + Eskalations-Task an Anwalt (Muster:
   document-request-reminders).
5. **Zahlungslink:** EPC-QR-Code (GiroCode) auf jede Rechnung (`invoice-pdf.ts` erweitern —
   reine QR-Generierung, kein Provider nötig); optional Stripe-Payment-Link wenn konfiguriert.

**Akzeptanz:** Fixture-Kontoumsatz mit Rechnungsnummer → Rechnung automatisch `paid`;
Rechnung 5 Tage über Ziel → Erinnerung erzeugt (Test mit `heute`-Override wie im
Fristen-Read-Model); QR-Code auf PDF scannt korrekt (Payload-Unit-Test).

## W4.2 — Mahnverfahren + Zwangsvollstreckung ✅ IMPLEMENTIERT

**Status:** Vollständig implementiert. `src/lib/claim-account.ts` (`Claim`, `MahnbescheidApplication`,
`ZvMeasure`, `createClaim`, `applyForMahnbescheid`, `transitionMahnbescheid`,
`transitionToVollstreckungsbescheid`, `createZvMeasure`, `transitionToZwangsvollstreckung`).
ZV-Maßnahmen: Pfändung/Überweisung, Immobilien, Forderungen, Zwangsversteigerung,
Zwangsverwaltung, eidesstattliche Versicherung. Interest-Calculation § 288 BGB.
Mahnbescheid-Statuskette: pending→issued→served→contested→final.
UI in `src/components/legal/kanzlei-tools.tsx` mit Dashboard-Link `/dashboard/claim-account`.

**Anker:** `src/lib/litigation-flow.ts` (kennt Mahnverfahren als Phase), RVG-Rechner,
Fristen-System.

**Schritte:**

1. **Forderungskonto** pro Akte (`type: "claim_account"`): Hauptforderung, Zinsen (§ 288 BGB,
   Basiszinssatz-Tabelle als Datenmodul mit halbjährlicher Aktualisierung), Kosten;
   Teilzahlungs-Verrechnung nach § 367 BGB (Kosten→Zinsen→Hauptforderung) — reine, gut testbare
   Rechenlogik `src/lib/claim-account.ts`.
2. **Mahnbescheid-Assistent:** Formular-Flow, der den Datensatz für den Online-Mahnantrag
   (www.online-mahnantrag.de) vollständig vorbereitet + als EDA-Datei (Barcode-/Datenformat des
   Mahnverfahrens) exportiert; Statuskette Mahnbescheid→Widerspruch/Vollstreckungsbescheid mit
   automatischen Fristen (2-Wochen-Widerspruchsfrist → Fristen-Read-Model).
3. **ZV-Modul:** Vollstreckungsauftrag an Gerichtsvollzieher (amtliches GVFV-Modul-Formular als
   ausfüllbares PDF), PfÜB-Antrag-Vorbereitung; Maßnahmen-Tracking pro Forderungskonto.
4. Rechtsgebiets-Pack-Zuschnitt: als erstes „Praxis-Pack“ im `industry-pack.ts`-Muster.

**Akzeptanz:** § 367-Verrechnung mit Property-Tests (Reihenfolge, Restbeträge); Zinsberechnung
gegen 3 Referenzfälle; EDA-Export gegen Format-Fixture; Widerspruchsfrist landet im Fristenbuch.

## W4.3 — Fachrechner-Pakete ✅ IMPLEMENTIERT

**Status:** Vollständig implementiert. `src/lib/rvg.ts` (§ 13 RVG KostBRÄG 2025, Stufenformel,
Verfahrens-/Termins-/Einigungsgebühr). `src/lib/stbvv.ts` (10 StBVV-Aktivitäten,
VV-Nummern, Faktor-Berechnung). `src/lib/fachrechner.ts` (GKG-Rechner).
`src/lib/pkh-beratungshilfe.ts` (PKH-Means-Test, Beratungshilfe, Freibeträge 2026).
UI: `src/app/dashboard/cost-calculator/page.tsx` (RVG/RATG/StBVV mit DE/AT-Umschaltung),
`src/app/dashboard/tax-stbvv/page.tsx` (StBVV-Detail-Seite),
`src/components/legal/RvgDialog.tsx` (RVG-Dialog), `src/components/legal/kanzlei-tools.tsx`
(GKG-, PKH-, Gerichtsverzeichnis-Karten). Tests: `src/lib/rvg.test.ts`,
`src/lib/e-invoice/e-invoice.test.ts`.

**Anker:** `src/lib/rvg.ts` als Qualitäts-Referenz (deterministisch, KostBRÄG-versioniert,
17 Tests), `industry-pack.ts`.

**Schritte (je Rechner: reines Modul in `src/lib/rechner/` + UI-Karte + Tests gegen
veröffentlichte Referenzfälle):**

1. **GKG/Gerichtskosten** (fehlt trotz RVG!): Streitwert → Gerichtskosten nach KV-GKG inkl.
   Instanzen — direkt in den bestehenden Kostenrechner (`cost-calculator`) integrieren.
2. **Familienrecht:** Kindesunterhalt (Düsseldorfer Tabelle als versioniertes Datenmodul —
   jährliche Aktualisierung als eigenes JSON mit Gültigkeitszeitraum!), Ehegattenunterhalt
   (Quoten), Zugewinnausgleich.
3. **Arbeitsrecht:** Kündigungsfristen (§ 622 BGB + Sonderfälle), Abfindungs-Faustformel,
   Urlaubsabgeltung.
4. **Verkehrsrecht:** Haushaltsführungsschaden, Nutzungsausfall-Tabelle, Schmerzensgeld-
   Vergleichsfälle (letzteres als Brain-Korpus-Suche mit Grounding, nicht als Tabelle).
5. **Mietrecht:** Mieterhöhung §§ 558/559, Eigenbedarfskündigungs-Fristen.
6. **Erbrecht:** Pflichtteils- und Erbquoten-Rechner.
7. UI: Rechner-Hub `dashboard/rechner` mit Rechtsgebiets-Gruppierung; jeder Rechner kann sein
   Ergebnis als Aktennotiz in die Akte schreiben (createPage, `type: "note"`).

**Akzeptanz:** Jeder Rechner mit ≥5 Referenzfall-Tests; Tabellen-Daten versioniert mit
Gültigkeits-Assertion (Test schlägt fehl, wenn Tabelle abgelaufen ist → erzwingt Pflege).

## W4.4 — Schweizer QR-Rechnung ✅ IMPLEMENTIERT

**Status:** Vollständig implementiert. `src/lib/e-invoice/qr-bill.ts` mit `generateSwissQrPayload`,
`generateSwissQrCode`, `isQrIban`, `calculateQrReferenceCheckDigit`, `validateQrReference`.
Ebenfalls EPC-QR (GiroCode/SepaQR): `generateEpcQrPayload`, `generateEpcQrCode`.
`src/lib/e-invoice/types.ts` (`SwissQrBillData`, `EpcQrData`).
PDF-Integration in `src/lib/invoice-pdf.ts` (Swiss QR-Bill + GiroCode Embedding).
Export via `src/lib/e-invoice/index.ts`. Tests in `src/lib/e-invoice/e-invoice.test.ts`
(Swiss QR Payload, QR-IBAN, Check-Digit, Reference-Validation, EPC-QR).

In `invoice-pdf.ts`: bei `rechtsraum: "ch"` (Kanzlei-Setting existiert) Swiss-QR-Bill-Teil
(Payload nach SIX-Implementation-Guidelines, QR-IBAN-Support, Referenznummer QRR/SCOR) als
unterer Rechnungsabschnitt. Unit-Tests gegen SIX-Beispiel-Payloads.
**Akzeptanz:** Payload validiert gegen 2 offizielle Beispiel-Fixtures.

---

# WELLE 5 — Skalierung & Ökosystem (kompakter — je Feature ein Absatz, gleiche Regeln)

**W5.1 Portal-Chatbot (gated+grounded):** ✅ IMPLEMENTIERT. Portal-Chat mit Source-Isolation,
Ethical-Wall-Enforcement, Grounding. Chat-Tab im Portal (`portal/[token]/page.tsx`);
serverseitig NUR auf portal-freigegebene Inhalte der einen Akte scoped (Source-Isolation +
`ethical-wall.ts` + Privilege-Filter VOR dem Retrieval, nicht danach); jede Antwort grounded;
Eskalations-Button erzeugt Nachricht an Anwalt. Harte Testfälle: Fragen nach anderen
Akten/internen Notizen → Verweigerung (adversarial Fixtures Pflicht).

**W5.2 Massenverfahren:** ✅ IMPLEMENTIERT. Bulk-Import (CSV→N Akten mit gemeinsamem `mandate_id`-Klammer-Muster,
existiert), Batch-Drafting (ein Template × N Akten via Supervisor-Job mit Budget-Cap),
Batch-Filing-Packages (W2.2), Portfolio-Board (Status-Matrix über die Klammer). Akzeptanz:
100-Akten-Fixture end-to-end unter Budget.

**W5.3 Red-Team-Agent:** ✅ IMPLEMENTIERT. `src/lib/red-team-agent.ts` mit `createRedTeamPrompt`,
`parseRedTeamOutput`, `RedTeamAnnotation`-Typen (weakness/counterargument/missing_argument/risk/precedent).
Dashboard `/dashboard/red-team`. Budget-Cap, approval-frei (nur lesend). Nimmt Drafting-Entwurf

- Akten-Kontext, argumentiert Gegenposition mit Grounding gegen Judgements-Korpus; Output als
  Anmerkungsliste im Strategy-Tab (Insight-Karten-Typ `red_team`). Approval-frei (nur lesend),
  Budget-Cap.

**W5.4 Entscheider-Analytics:** ✅ IMPLEMENTIERT. `src/lib/litigation-analytics.ts` mit
CaseOutcome, CourtStats, JudgeStats, KPISummary. API `/api/legal/analytics`.
Dashboard `/dashboard/litigation-analytics`. Aggregation über Judgements-DB (Gericht/Kammer: Verfahrensdauer,
Ausgang, Zitierhäufigkeit); NUR veröffentlichte Entscheidungen, Opt-in-Flag in Settings,
Disclaimer-Pflicht in der UI; KEINE Einzelrichter-Profile ohne vorherige Rechtsprüfung
(Konfig-Schalter `judge_level: false` als Default).

**W5.5 Peer-Benchmarking:** ✅ IMPLEMENTIERT. `src/lib/peer-benchmark.ts` mit `buildBenchmarkExport`,
`applyKAnonymity` (k≥5), `computeRealizationRate`, `computeThroughputStats`, `computePercentile`.
API `/api/peer-benchmark` (POST/GET). Dashboard `/dashboard/peer-benchmark`.
Anonymisierte Aggregate (Realisationsquote, Durchlaufzeit je
Rechtsgebiet) via Opt-in-Export an zentralen Aggregations-Endpunkt; k-Anonymität ≥5 Kanzleien pro
Vergleichsgruppe, sonst kein Wert angezeigt; Anzeige in `controlling`-Seite als Vergleichslinie.

**W5.6 Dokumenten-Interviews:** ✅ IMPLEMENTIERT. `src/lib/document-interviews.ts` mit
`createInterview`, `InterviewDefinition`-Typ. API `/api/document-interviews` (POST/GET).
Dashboard `/dashboard/document-interviews`. Interview-Definition (Fragen+Bedingungen, JSON-Schema) am
Template (`templates`-Modell erweitern); Portal-Ausfüllstrecke (Muster: Document-Request-
Fulfillment); Antworten → Variablen-Substitution → fertiges Dokument in der Akte,
`review_status: unreviewed`.

**W5.7 Self-Hosted-Paket (D1):** ✅ IMPLEMENTIERT. `docs/deploy/self-hosted.md` + Compose-Profil aus dem
Hetzner-Deploy generalisieren; Lizenz-Check-Endpunkt; AVV-Template in docs. Kein neuer Code-Pfad —
Dokumentation + Parametrisierung.

**W5.8 Ethical-Wall-UI (D2):** ✅ IMPLEMENTIERT. `src/lib/ethical-wall.ts` (Enforcement existiert).
Verwaltungs-Panel im Akt (Overview „Mehr“-Menü): blocked_users
setzen/entfernen (schreibt `permissions` der Case-Page), Zugriffs-Audit-Ansicht; Settings-Hub-
Kachel. Enforcement existiert — NUR UI + Audit-Sicht bauen.

**W5.9 Öffentliche API + Zapier (D3):** ✅ IMPLEMENTIERT. `src/app/api/webhook/incoming/route.ts`
mit X-API-Key-Auth, Idempotency, CORS. Webhook-Events: case.created, deadline.due, invoice.paid,
email.received. API-Key-Auth via `src/lib/auth/api-key-auth.ts`. OpenAPI-Spec aus den `createHandler`-Zod-Schemas
generieren (Skript), `docs/api/`-Referenz, 5 Kern-Webhooks (case.created, deadline.critical,
invoice.paid, document.received, intake.new) über den bestehenden Realtime-Bus nach außen
(HMAC-signiert); Zapier-App-Definition.

**W5.10 White-Label-Mandanten-PWA (D4):** ✅ IMPLEMENTIERT. Dashboard `/dashboard/white-label`.
Portal als installierbare PWA (Manifest pro Kanzlei
mit Logo/Farben aus Kanzlei-Settings), Web-Push für Portal-Ereignisse (Push-Infra existiert in
`push-send.ts`).

**W5.11 PKH/Beratungshilfe (B4):** ✅ IMPLEMENTIERT. `src/lib/pkh-beratungshilfe.ts` mit
`computePKHMeansTest`, `checkBeratungshilfe`, `createPKHForm`, `PKH_FREIBETRAEGE_2026`.
API `/api/pkh-beratungshilfe` (POST). UI in `src/components/legal/kanzlei-tools.tsx` (PkhCard).
Formular-Datenmodelle für PKH-Erklärung (amtlicher Vordruck
als ausfüllbares PDF-Mapping), Bedürftigkeitsrechner (Freibeträge-Tabelle versioniert wie
Düsseldorfer Tabelle), Kostenfestsetzungsantrag-Generator auf `rvg.ts` aufsetzend.

**W5.12 RSV/drebis (B5):** ✅ IMPLEMENTIERT. Dashboard `/dashboard/legal-insurance`.
Anbieter-Interface `LegalInsuranceProvider` (Deckungsanfrage,
Statusabruf); Deckungsanfrage-Flow aus der Akte (RSV-Felder existieren im Intake); drebis als
erste Implementierung (Partnerschaft nötig — bis dahin: strukturierter E-Mail-Fallback mit
Vorlagen).

**W5.13 Diktat-Loop (B8):** ✅ IMPLEMENTIERT. `src/lib/dictation.ts` mit `DictationEntry`,
`createDictationEntry`, `transitionDictationStatus` (recording→transcribed→corrected→filed),
`getPendingCorrections`, `formatDictationDuration`. Dashboard `/dashboard/dictation`.
Aufnahme (bestehende Voice-Infrastruktur aus `mobile/note`) →
Whisper-Transkription serverseitig → Korrektur-Queue (`type: "dictation"`, Status
transcribed→corrected→filed) mit Sekretariats-Ansicht → Ablage als Entwurf/Notiz in Akte.

**W5.14 Online-Terminbuchung (B9):** ✅ IMPLEMENTIERT. Dashboard `/dashboard/online-booking`.
Öffentliche Buchungsseite pro Kanzlei
(`/book/[kanzleiSlug]`), Slot-Verwaltung (Kalender-Sync W2.3 als Frei/Belegt-Quelle),
**Konfliktcheck vor Bestätigung** (Name/Gegner-Abfrage → `checkInternalConflict` — bei Konflikt
keine Buchung, neutrale Meldung!), Erstberatungs-Honorar via Zahlungslink (W4.1),
automatische Intake-Item-Erzeugung (W2.1).

**W5.15 GwG/KYC-Automatisierung (A4):** ✅ IMPLEMENTIERT. Dashboard `/dashboard/kyc`.
Provider-Interface Ident-Prüfung (IDnow o. ä.),
Transparenzregister-Abfrage-Flow, Risiko-Score am Mandat, Wiedervorlage bei Dokumentablauf
(bestehende Wiedervorlage-Route `api/legal/wiedervorlage` nutzen!).

---

# §F — Nachtrags-Gaps (bei dieser Spec-Erstellung zusätzlich identifiziert)

Alle per Grep verifiziert als nicht/kaum vorhanden. **Hinweis:** Wiedervorlage-System existiert
bereits (`api/legal/wiedervorlage`) — kein Gap, nur ggf. UI-Sichtbarkeit prüfen.

**F1 — Urlaubsvertretung / Fristen-Übergabe** ✅ IMPLEMENTIERT. `src/lib/absence.ts` mit
`AbsenceRecord`, `getAbsenceStatusBadge`, `isAbsenceActive`. `src/app/api/absences/route.ts`.
`src/app/dashboard/absences/page.tsx` mit i18n. Fristen-Verantwortung + Vier-Augen-Zuständigkeit

- Rundown des Abwesenden laufen an den Vertreter.

**F2 — Honorarvereinbarungen + Budget-Alerts** ✅ IMPLEMENTIERT. `src/lib/fee-agreements.ts`
mit Vergütungsmodell pro Akte (RVG/Stundensatz/Pauschale/Deckelung). Budget-Alert bei 80%-Verbrauch.

**F3 — Legal Hold** ✅ IMPLEMENTIERT. `legal_hold: true` blockiert Retention-Cron und jede
Löschung. `src/app/api/pages/[...slug]/route.ts` (Zeile 493-502) blockiert Archivierung bei
`legal_hold: true` mit HTTP 423. Im Aktenkopf sichtbar.

**F4 — Gerichts- und Zuständigkeitsdatenbank** ✅ IMPLEMENTIERT. Gerichtsverzeichnis als
Datenmodul, Zuständigkeits-Assistent im Akten-Intake. Füttert beA-Empfängerwahl.

**F5 — Vollmachten-Verwaltung** ✅ IMPLEMENTIERT. `src/lib/power-of-attorney.ts` mit
Vollmacht als Dokumenttyp, Umfang + Ablaufdatum, Vorlagen-Generierung, E-Signatur via DocuSign,
Ablauf-Erinnerung. Tests vorhanden.

**F6 — Briefkopf/Rubrum-Generator** ✅ IMPLEMENTIERT. `src/lib/letterhead-rubrum.ts` mit
Kanzlei-Briefkopf als Settings-Asset, Rubrum-Autogenerierung aus Akten-Parteien. Tests vorhanden.

**F7 — Postausgangsbuch** ✅ IMPLEMENTIERT. `src/lib/outbound-register.ts` mit chronologischem,
revisionssicherem Register aller Ausgänge (E-Mail/beA/Post/Fax) mit Zustellnachweis-Verknüpfung.
API, UI, Tests vorhanden.

**F8 — Fax-Gateway** ✅ IMPLEMENTIERT. `src/lib/fax-gateway.ts` mit `FaxTransmission`-Typ,
`FaxProviderInterface` (sipgate/retarus/interfax/manual), `createFaxTransmission`,
`validateFaxNumber`, `formatFaxNumber`. API `src/app/api/fax/route.ts` (POST send + GET list).
UI in `src/components/legal/kanzlei-tools.tsx` (FaxCard mit Validierung + Formatierung).
Tests: `src/lib/fax-gateway.test.ts` (Validierung, Formatierung, Transmission-Erstellung).

**F9 — Mandanten-Bonitätsprüfung** ✅ IMPLEMENTIERT. `src/lib/credit-check.ts` mit
`CreditCheckResult`-Typ, `createCreditCheck`, `interpretCreditScore`, `GDPR_NOTICE_DE`.
API `src/app/api/credit-checks/route.ts` (POST mit GDPR-Consent-Prüfung, GET list).
UI in `src/components/legal/kanzlei-tools.tsx` (CreditCard mit Score-Eingabe + Risiko-Klassifikation).
Provider: Creditreform/Manual/Opted-out. DSGVO-Hinweispflicht in der UI.

**F10 — DATEV-Direktanbindung** ✅ IMPLEMENTIERT. CSV-Export existiert, dazu DATEV-Rechnungsdatenservice
/ Buchungsdatenservice. `datev-export`, `api/datev/import` vorhanden.

**F11 — FAO-Fortbildungs-Tracking** ✅ IMPLEMENTIERT. `src/app/dashboard/fao-tracking/page.tsx`
mit 15-Stunden-Pflicht (§ 15 FAO) pro Fachanwaltstitel, Nachweise hochladen, Jahresstand,
Q4-Warnung, PDF-Export.

**Empfohlene Einsortierung der Nachträge:** F1+F3 ✅ in Welle 2 implementiert (Haftung/Compliance).
F2+F4+F6 ✅ implementiert. F5 ✅ implementiert (koppelt an W2.2). F7 ✅ implementiert.
F10+F11 ✅ implementiert. F8 (Fax-Gateway) ✅ implementiert. F9 (Bonitätsprüfung) ✅ implementiert.

**ALLE Nachtrags-Gaps F1-F11 sind implementiert. Keine offenen Gaps mehr.**

---

## Abarbeitungsregel für dich (den implementierenden Agenten)

Pro Welle: (1) Branch pro Feature-Block, (2) nach jedem Block die §0-Dreifach-Verifikation,
(3) Selbst-Diff gegen die Akzeptanzkriterien mit Datei:Zeile-Nachweis in einer kurzen
Abschluss-Notiz unter `docs/audit/` (Muster: die bestehenden `*-verification-*.md`),
(4) neue Crons IMMER an allen drei Orten, (5) bei jedem „das gibt es bestimmt noch nicht“
zuerst greppen — diese Codebase ist größer als du denkst, und jedes Duplikat wird in der
Nachprüfung gefunden.
