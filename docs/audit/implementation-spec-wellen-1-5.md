# Implementierungs-Spezifikation: Wellen 1–5 + Nachtrags-Gaps

**Für:** den implementierenden Agenten. Diese Spec ist so geschrieben, dass du ohne Rückfragen
loslegen kannst. Jeder Punkt hat: Ziel, Anker im bestehenden Code (verifiziert, nicht geraten),
Umsetzungsschritte, Akzeptanzkriterien.
**Basis:** [gap-analyse-markt-2026-07-05.md](gap-analyse-markt-2026-07-05.md). Alle Anker wurden
per Grep gegen den aktuellen Stand geprüft.

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

## W1.1 — XRechnung + ZUGFeRD (E-Rechnung, gesetzliche Pflicht)

**Ziel:** Jede erzeugte Rechnung ist wahlweise (a) klassisches PDF, (b) ZUGFeRD 2.3 (PDF/A-3 mit
eingebettetem EN-16931-XML, Profil COMFORT), (c) XRechnung 3.x (reines UBL/CII-XML für
öffentliche Auftraggeber). Zusätzlich: eingehende E-Rechnungen werden geparst.

**Anker im Code:**

- PDF-Erzeugung existiert: `src/lib/invoice-pdf.ts` (+ `invoice-pdf.test.ts`) — darauf aufbauen.
- Rechnungs-Datenmodell: `InvoiceFrontmatter` in `src/lib/legal-types.ts:308`,
  Accessor `invoiceFrontmatter()` (Zeile 408ff).
- Verkäufer-Stammdaten existieren vollständig in den Kanzlei-Settings
  (`loadKanzleiSettings` / `settings/kanzlei`): `kanzleiName`, `kanzleiAdresse`, `ustId`,
  `iban`, `bic`, `zahlungszielTage`, `rechnungFooter` — genau die Pflichtfelder der EN 16931.
- Rechnungserstellung: `src/components/legal/InvoiceQuickCreateDialog.tsx` (RVG-Integration
  Zeile 37ff, markBilled Zeile 398) und `src/app/dashboard/invoicing/page.tsx`.

**Schritte:**

1. Neues Modul `src/lib/e-invoice.ts` (server-only): baut aus `InvoiceFrontmatter` +
   Kanzlei-Settings ein EN-16931-Datenobjekt (Zod-Schema `EInvoiceData`); Pflichtfelder
   validieren (Leitweg-ID für XRechnung → neues optionales Feld `leitwegId` am Kontakt/Mandanten,
   USt-Behandlung: Regelsteuersatz / §19 UStG Kleinunternehmer / Reverse-Charge als enum).
2. XML-Erzeugung: CII-Syntax (ZUGFeRD) + UBL (XRechnung). Bibliothek evaluieren
   (`node-zugferd` o. ä.); wenn keine taugt: Template-basierte XML-Generierung mit
   Schematron-Validierung gegen die offiziellen KoSIT-Regeln im Test.
3. ZUGFeRD: XML als `factur-x.xml` in das bestehende PDF aus `invoice-pdf.ts` einbetten
   (PDF/A-3-Attachment, AFRelationship=Data).
4. API: `POST /api/invoices/[slug]/e-invoice?format=zugferd|xrechnung` (via `createHandler`,
   `action: "brain.read"`, Audit-Event).
5. UI: Format-Auswahl im `InvoiceQuickCreateDialog` + Export-Buttons auf der Invoicing-Seite;
   Kontakt-Formular um `leitwegId` erweitern; Kanzlei-Settings um `kleinunternehmer`-Flag.
6. Empfang: im E-Mail-Import (`api/email-import`) und Upload-Pfad XML-/ZUGFeRD-Anhänge erkennen,
   parsen, als strukturierte Eingangsrechnung (`type: "incoming_invoice"`) ablegen.
7. Neuer Settings-Hub-Eintrag „E-Rechnung“ (`audienceTier: "dach-integration"`).

**Akzeptanz:** (a) Erzeugte XRechnung validiert gegen KoSIT-Validator-Regeln (Testfixture mit
Referenz-Rechnung); (b) ZUGFeRD-PDF enthält `factur-x.xml` und bleibt normales lesbares PDF;
(c) fehlende Pflichtfelder (z. B. keine USt-ID) → verständliche Fehlermeldung VOR Erzeugung;
(d) Tests: `e-invoice.test.ts` mit Snapshot der XML-Struktur + Pflichtfeld-Validierungsfälle.

## W1.2 — Sicherheits-Härtung + Security-Review

**Ziel:** Vor Go-Live ein systematischer Sicherheitsdurchgang. Der eigentliche Review läuft über
das `/security-review`-Skill (vom Nutzer zu starten) — DEINE Aufgabe ist die vorbereitende
Härtung der bekannten heißen Stellen:

1. **Portal-Token** (`/api/portal/verify|upload|message`, `api/portal/generate`): Token-Entropie
   ≥128 bit prüfen, Ablauf/Rotation erzwingen, Rate-Limit auf alle Portal-Endpunkte
   (`rateTier` prüfen — Portal ist unauthentifizierter Außenzugang!), Upload: Dateityp-Allowlist +
   Größenlimit + Malware-Scan-Hook, Path-Traversal-Test.
2. **Webhooks:** DocuSign-HMAC-Verifikation existiert (`verifyDocusignConnectSignature`) —
   gleiche Prüfung für WhatsApp-Webhook (X-Hub-Signature-256) verifizieren/nachrüsten; alle
   Webhooks: Replay-Schutz (Timestamp-Fenster) zusätzlich zur Idempotenz.
3. **RBAC-Sweep:** jede `createHandler`-Route hat ein korrektes `action`-Scope; Skript
   `scripts/check-route-actions.ts` schreiben, das alle Routen listet und Routen ohne
   Handler-Wrapper oder ohne `action` failen lässt (CI-Guard, Muster: bestehende
   `scripts/check-*.sh`).
4. **Secrets:** kein Secret im Client-Bundle (`grep` nach `process.env.` in `"use client"`-Dateien
   — nur `NEXT_PUBLIC_*` erlaubt); CRON_SECRET-Vergleich timing-safe.
5. **Ethical-Wall-Durchsetzung** (`src/lib/ethical-wall.ts`): prüfen, dass sie an ALLEN
   Lesepfaden hängt (Suche! Command-Palette! Insights! Export!) — nicht nur am Matter-Kontext.

**Akzeptanz:** CI-Guard für Route-Scopes läuft in `bun run verify`; Portal-Endpunkte haben
Rate-Limits + Upload-Validierung mit Tests; danach `/security-review` durch den Nutzer.

## W1.3 — Playwright-E2E für die kritischen Loops

**Ziel:** Die vier Loops, die in den Audit-Runden mehrfach „sah fertig aus, war es nicht“ waren,
bekommen echte Browser-Tests. Playwright ist konfiguriert (`test:e2e` in package.json,
`tests/e2e-playwright/`).

**Zu bauende Specs** (je ein File unter `tests/e2e-playwright/`):

1. `fristen-sync.spec.ts`: Frist im Akte-Tab anlegen → erscheint in `/dashboard/deadlines` UND
   `/dashboard/fristenbuch` ohne Reload-Tricks; Notfrist auf „erledigt“ ohne Vier-Augen → UI
   zeigt Dialog, direkter API-PATCH → 403.
2. `case-closeout.spec.ts`: Akte mit offener Frist archivieren → Checklisten-Dialog mit Warnung
   → „Trotzdem archivieren“ nötig; Akte ohne offene Posten → keine Warnung.
3. `portal-flow.spec.ts`: Portal-Token öffnen (EN + DE) → Dokument hochladen → erscheint in der
   Akte; abgelaufener Token → saubere Fehlerseite.
4. `invoice-billing.spec.ts`: Rechnung aus Zeiteinträgen erstellen → Einträge zeigen `billed` +
   Rechnungslink; Unbill → Status zurück.
5. `docusign-webhook.spec.ts` (API-level, kein Browser nötig): Mock-`envelope-completed`-Payload
   → signiertes Dokument in Akte + Status `signed`.

**Infrastruktur:** Test-Fixtures über die bestehende Engine-API seeden (Brain-Pages anlegen),
nicht über UI-Klickstrecken; `.env.test` mit PGLite-Engine. Wenn Login im Weg ist: Test-User-
Bootstrap-Route hinter `NODE_ENV=test`-Guard.

**Akzeptanz:** `bun run test:e2e` grün, in CI verdrahtet; jeder Spec läuft isoliert (eigene Seeds).

---

# WELLE 2 — Verdrängung (RA-MICRO/Advoware schlagen)

## W2.1 — Einheitlicher digitaler Posteingang mit KI-Triage

**Ziel:** EIN Eingangs-Screen für alles Eingehende. **Wichtig: Die Intake-Seite existiert bereits
substanziell** (`src/app/dashboard/intake/page.tsx`, 1039 Zeilen, Statusmodell
`new|needs_info|conflict_check|accepted|rejected|converted`, Quellen
`whatsapp|portal|web|email|manual`, `api.intake.*` mit `convert`) — **erweitern, nicht neu bauen**
(Regel §0.4).

**Schritte:**

1. Quellen vervollständigen: `IntakeSource` um `bea` und `scan` erweitern. beA-Import
   (`api/legal/bea`-Umfeld) und ein neuer Scan-Upload-Endpunkt (`POST /api/inbox/scan`, nimmt
   PDF-Stapel) erzeugen Intake-Items statt direkt Dokumente.
2. **Triage-Karte pro Item:** KI-Vorschlag (bestehende Pipeline: `analyzeDocument` +
   `legal-case-suggest.ts` für Akten-Matching + Fristextraktion aus der Fristen-Pipeline) wird als
   Vorschlag angezeigt: „→ Akte X (87%), Dokumenttyp: Klageerwiderung, 2 Fristen erkannt“.
   Ein-Klick-Bestätigung führt aus: Dokument in Akte ablegen, Fristen als `review_status:
"unreviewed"` anlegen (Vier-Augen-Kette greift automatisch), Aktivitätseintrag.
3. Mehrdeutigkeit: wie beim E-Mail-Import (`status === "ambiguous"`) — nie stillschweigend
   zuordnen, immer Auswahl anzeigen.
4. Item ohne Akten-Match → bestehender `convert`-Flow (neues Mandat inkl. Konfliktcheck).
5. Posteingang als erster Rundown-Abschnitt ergänzen (RUNDOWN_PROMPT in
   `api/cron/rundown/route.ts`): „N uneingeordnete Eingänge“.
6. Sidebar: Intake-Eintrag umbenennen zu „Posteingang“ (`nav.intake`-Labels), Badge mit
   Ungelesen-Zahl (Muster: bestehende Badge-Logik in `sidebar.tsx`).

**Akzeptanz:** E-Mail, WhatsApp-Dokument, Portal-Upload, beA-Nachricht und Scan landen alle als
Items in EINEM Screen; Ein-Klick-Ablage erzeugt Dokument+Fristen+Audit; kein bestehender
Einzel-Flow (email-import etc.) geht kaputt — die Seiten bleiben, füttern aber denselben Store.
Test: Unit für den Triage-Mapper, E2E für den Bestätigungs-Klickweg.

## W2.2 — beA-Versand produktiv (auf vorhandener Architektur)

**Ziel:** Schriftsatz aus der Akte → Filing-Package → Versand → Zustellnachweis → Fristauslösung.

**Anker:** `src/lib/efiling-architecture.ts` enthält bereits die Architekturentscheidung
(**Partneradapter-Middleware** mit Fallback „validierter Export“) und das komplette Datenmodell
(`FilingPackage`, `FilingDocument` mit Signatur-Status/Checksum, `FilingReceipt`, Approval,
Fristkopplung, Audit). Das ist die Vorgabe — implementiere GEGEN dieses Modell.

**Schritte:**

1. **Stufe 1 — validierter Export (sofort lieferbar, kein Partner nötig):** Filing-Package-Builder
   als UI-Flow im Akt (Dokumente wählen → Empfänger (SAFE-ID) → Pflichtfeld-Validierung nach
   ERVV: Dateinamenskonvention, PDF/A, Größenlimits, XJustiz-Nachrichtenkopf erzeugen) → ZIP-Export
   für manuellen Upload in die beA-Weboberfläche + Package-Status `exported`. Eingang des
   manuell erhaltenen Zustellnachweises: Upload aufs Package → Status `confirmed` → gekoppelte
   Frist beginnt (Fristen-Read-Model, `erv_zustelldatum` existiert schon!).
2. **Stufe 2 — Partneradapter:** Adapter-Interface `FilingProvider` (send/status/receipt) gegen
   einen beA-Middleware-Anbieter; ENV-konfiguriert; Webhook für Statusrückmeldung (HMAC, Muster
   DocuSign-Webhook).
3. **eEB-Handling:** eingehende eEB-Anforderungen (aus W2.1-Posteingang) als Aufgabe mit
   Ein-Klick „eEB abgeben“ (Stufe 1: generiert das strukturierte eEB-Dokument für manuellen
   Versand; Stufe 2: sendet direkt) — Abgabedatum setzt automatisch das Zustelldatum der
   gekoppelten Frist.
4. **XJustiz-Parsing eingehend:** XML-Anhänge in beA-Nachrichten parsen (Nachrichtentyp,
   Aktenzeichen, Termine) → automatischer Akten-Match + Fristvorschlag im Posteingang.
5. Approval: Versand erfordert Anwalts-Freigabe (Vier-Augen-Muster aus Drafting wiederverwenden).

**Akzeptanz:** Stufe 1 komplett mit Tests (Package-Validierung: falscher Dateiname/kein PDF/A →
Fehler; Receipt-Upload → Frist erzeugt); Stufe-2-Interface fertig mit Mock-Provider-Test;
XJustiz-Parser mit 2-3 Referenz-Fixtures.

## W2.3 — Outlook/M365-Integration + Kalender-Zwei-Wege-Sync

**Ziel:** E-Mails aus Outlook in die Akte, Kalender synchron in beide Richtungen.

**Schritte:**

1. **Outlook-Add-in** (Office.js, analog zum bestehenden Word-Add-in unter
   `src/app/dashboard/word-addin` — dessen Manifest-/Auth-Muster übernehmen): Taskpane mit
   Akten-Suche (bestehende `api.brain.search`), Button „In Akte ablegen“ → E-Mail als
   `.eml` über den bestehenden `api/email-import`-Endpunkt (der hat schon Ambiguitäts-Handling).
2. **Graph-API-Anbindung (serverseitig, OAuth pro Nutzer):** `src/lib/msgraph.ts` (server-only),
   Token-Store analog `docusign.ts`-OAuth-Muster (Refresh-Handling existiert dort als Vorlage).
3. **Kalender-Sync:** Zwei-Wege über Graph-Subscriptions (Webhook bei Änderungen) — Subsumio-
   Termine (aus dem Fristen-Read-Model + `calendar-editor.tsx`-Terminen) → Outlook-Kalender
   (dedizierter Unterkalender „Subsumio“); Outlook-Änderungen an Subsumio-Terminen → zurück.
   Konfliktregel: Fristen (`type: deadline`) sind in Outlook read-only (Quelle der Wahrheit bleibt
   das Fristen-System — §0.4!); nur Termine/Besprechungen sind bidirektional.
4. Google-Kalender als zweiter Provider hinter demselben Interface (`CalendarSyncProvider`).
5. Settings-Hub-Kachel „Microsoft 365“ (`audienceTier: "erweitert"`), Onboarding-Hinweis.

**Akzeptanz:** E-Mail aus Outlook landet mit einem Klick in der richtigen Akte; in Subsumio
angelegter Gerichtstermin erscheint in Outlook; in Outlook verschobener Besprechungstermin
aktualisiert Subsumio; Frist lässt sich in Outlook NICHT verschieben. Tests: Graph-Mock-Unit-Tests
für Sync-Mapper + Konfliktregeln.

---

# WELLE 3 — Moat (unkopierbar werden)

## W3.1 — Der autonome Sachbearbeitungs-Loop

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

## W3.2 — Passive Zeiterfassung (Vollausbau)

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

## W4.1 — FiBu-Anschluss: Bank-Feed, OPOS, eigene Mahnläufe, Zahlungslinks

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

## W4.2 — Mahnverfahren + Zwangsvollstreckung

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

## W4.3 — Fachrechner-Pakete

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

## W4.4 — Schweizer QR-Rechnung

In `invoice-pdf.ts`: bei `rechtsraum: "ch"` (Kanzlei-Setting existiert) Swiss-QR-Bill-Teil
(Payload nach SIX-Implementation-Guidelines, QR-IBAN-Support, Referenznummer QRR/SCOR) als
unterer Rechnungsabschnitt. Unit-Tests gegen SIX-Beispiel-Payloads.
**Akzeptanz:** Payload validiert gegen 2 offizielle Beispiel-Fixtures.

---

# WELLE 5 — Skalierung & Ökosystem (kompakter — je Feature ein Absatz, gleiche Regeln)

**W5.1 Portal-Chatbot (gated+grounded):** Chat-Tab im Portal (`portal/[token]/page.tsx`);
serverseitig NUR auf portal-freigegebene Inhalte der einen Akte scoped (Source-Isolation +
`ethical-wall.ts` + Privilege-Filter VOR dem Retrieval, nicht danach); jede Antwort grounded;
Eskalations-Button erzeugt Nachricht an Anwalt. Harte Testfälle: Fragen nach anderen
Akten/internen Notizen → Verweigerung (adversarial Fixtures Pflicht).

**W5.2 Massenverfahren:** Bulk-Import (CSV→N Akten mit gemeinsamem `mandate_id`-Klammer-Muster,
existiert), Batch-Drafting (ein Template × N Akten via Supervisor-Job mit Budget-Cap),
Batch-Filing-Packages (W2.2), Portfolio-Board (Status-Matrix über die Klammer). Akzeptanz:
100-Akten-Fixture end-to-end unter Budget.

**W5.3 Red-Team-Agent:** Neuer Agent-Typ in `specialist-defs.ts` (server/): nimmt Drafting-Entwurf

- Akten-Kontext, argumentiert Gegenposition mit Grounding gegen Judgements-Korpus; Output als
  Anmerkungsliste im Strategy-Tab (Insight-Karten-Typ `red_team`). Approval-frei (nur lesend),
  Budget-Cap.

**W5.4 Entscheider-Analytics:** Aggregation über Judgements-DB (Gericht/Kammer: Verfahrensdauer,
Ausgang, Zitierhäufigkeit); NUR veröffentlichte Entscheidungen, Opt-in-Flag in Settings,
Disclaimer-Pflicht in der UI; KEINE Einzelrichter-Profile ohne vorherige Rechtsprüfung
(Konfig-Schalter `judge_level: false` als Default).

**W5.5 Peer-Benchmarking:** Anonymisierte Aggregate (Realisationsquote, Durchlaufzeit je
Rechtsgebiet) via Opt-in-Export an zentralen Aggregations-Endpunkt; k-Anonymität ≥5 Kanzleien pro
Vergleichsgruppe, sonst kein Wert angezeigt; Anzeige in `controlling`-Seite als Vergleichslinie.

**W5.6 Dokumenten-Interviews:** Interview-Definition (Fragen+Bedingungen, JSON-Schema) am
Template (`templates`-Modell erweitern); Portal-Ausfüllstrecke (Muster: Document-Request-
Fulfillment); Antworten → Variablen-Substitution → fertiges Dokument in der Akte,
`review_status: unreviewed`.

**W5.7 Self-Hosted-Paket (D1):** `docs/deploy/self-hosted.md` + Compose-Profil aus dem
Hetzner-Deploy generalisieren; Lizenz-Check-Endpunkt; AVV-Template in docs. Kein neuer Code-Pfad —
Dokumentation + Parametrisierung.

**W5.8 Ethical-Wall-UI (D2):** Verwaltungs-Panel im Akt (Overview „Mehr“-Menü): blocked_users
setzen/entfernen (schreibt `permissions` der Case-Page), Zugriffs-Audit-Ansicht; Settings-Hub-
Kachel. Enforcement existiert — NUR UI + Audit-Sicht bauen.

**W5.9 Öffentliche API + Zapier (D3):** OpenAPI-Spec aus den `createHandler`-Zod-Schemas
generieren (Skript), `docs/api/`-Referenz, 5 Kern-Webhooks (case.created, deadline.critical,
invoice.paid, document.received, intake.new) über den bestehenden Realtime-Bus nach außen
(HMAC-signiert); Zapier-App-Definition.

**W5.10 White-Label-Mandanten-PWA (D4):** Portal als installierbare PWA (Manifest pro Kanzlei
mit Logo/Farben aus Kanzlei-Settings), Web-Push für Portal-Ereignisse (Push-Infra existiert in
`push-send.ts`).

**W5.11 PKH/Beratungshilfe (B4):** Formular-Datenmodelle für PKH-Erklärung (amtlicher Vordruck
als ausfüllbares PDF-Mapping), Bedürftigkeitsrechner (Freibeträge-Tabelle versioniert wie
Düsseldorfer Tabelle), Kostenfestsetzungsantrag-Generator auf `rvg.ts` aufsetzend.

**W5.12 RSV/drebis (B5):** Anbieter-Interface `LegalInsuranceProvider` (Deckungsanfrage,
Statusabruf); Deckungsanfrage-Flow aus der Akte (RSV-Felder existieren im Intake); drebis als
erste Implementierung (Partnerschaft nötig — bis dahin: strukturierter E-Mail-Fallback mit
Vorlagen).

**W5.13 Diktat-Loop (B8):** Aufnahme (bestehende Voice-Infrastruktur aus `mobile/note`) →
Whisper-Transkription serverseitig → Korrektur-Queue (`type: "dictation"`, Status
transcribed→corrected→filed) mit Sekretariats-Ansicht → Ablage als Entwurf/Notiz in Akte.

**W5.14 Online-Terminbuchung (B9):** Öffentliche Buchungsseite pro Kanzlei
(`/book/[kanzleiSlug]`), Slot-Verwaltung (Kalender-Sync W2.3 als Frei/Belegt-Quelle),
**Konfliktcheck vor Bestätigung** (Name/Gegner-Abfrage → `checkInternalConflict` — bei Konflikt
keine Buchung, neutrale Meldung!), Erstberatungs-Honorar via Zahlungslink (W4.1),
automatische Intake-Item-Erzeugung (W2.1).

**W5.15 GwG/KYC-Automatisierung (A4):** Provider-Interface Ident-Prüfung (IDnow o. ä.),
Transparenzregister-Abfrage-Flow, Risiko-Score am Mandat, Wiedervorlage bei Dokumentablauf
(bestehende Wiedervorlage-Route `api/legal/wiedervorlage` nutzen!).

---

# §F — Nachtrags-Gaps (bei dieser Spec-Erstellung zusätzlich identifiziert)

Alle per Grep verifiziert als nicht/kaum vorhanden. **Hinweis:** Wiedervorlage-System existiert
bereits (`api/legal/wiedervorlage`) — kein Gap, nur ggf. UI-Sichtbarkeit prüfen.

**F1 — Urlaubsvertretung / Fristen-Übergabe** ⬛ FEHLT. Abwesenheit pro Nutzer (von–bis,
Vertreter); während Abwesenheit: Fristen-Verantwortung + Vier-Augen-Zuständigkeit + Rundown des
Abwesenden laufen an den Vertreter; Rückgabe-Report bei Rückkehr. Haftungsrelevant (unbesetzte
Fristen im Urlaub = klassischer Regressfall). Anker: `second_check_by`, Reminder-Crons,
Team-Modell. Kleines Feature, großer Sicherheitswert — **in Welle 2 vorziehen**.

**F2 — Honorarvereinbarungen + Budget-Alerts** ⬛ FEHLT. Vergütungsmodell pro Akte
(RVG/Stundensatz/Pauschale/Deckelung) statt nur kanzleiweitem Satz; bei Deckelung/Budget:
Insight-Karte + Rundown-Warnung bei 80 %-Verbrauch (Zeitwert × Satz gegen Budget). Anker:
`InvoiceQuickCreateDialog` (kennt RVG/custom bereits), Insights-Engine.

**F3 — Legal Hold** ◧ Typ-Erwähnungen existieren (`legal-types.ts`), Durchsetzung unklar:
`legal_hold: true` an der Akte MUSS Retention-Cron (`api/cron/retention`) und jede Löschung
blockieren + im Aktenkopf sichtbar sein. Kleiner Eingriff, Compliance-Pflicht bei
US-Bezug/Beweissicherung.

**F4 — Gerichts- und Zuständigkeitsdatenbank** ⬛ FEHLT. Deutsches/österreichisches
Gerichtsverzeichnis als Datenmodul (Adressen, SAFE-IDs für W2.2, Gerichtsstände); Zuständigkeits-
Assistent (PLZ + Streitwert + Materie → örtlich/sachlich zuständiges Gericht) im Akten-Intake.
Füttert außerdem beA-Empfängerwahl.

**F5 — Vollmachten-Verwaltung** ⬛ FEHLT. Vollmacht als Dokumenttyp mit Umfang + Ablaufdatum am
Mandat, Vorlagen-Generierung, E-Signatur via bestehendem DocuSign-Loop, Ablauf-Erinnerung via
Reminder-Muster. Ohne nachweisbare Vollmacht keine beA-Einreichung — koppelt an W2.2.

**F6 — Briefkopf/Rubrum-Generator** ⬛ FEHLT. Kanzlei-Briefkopf (Logo, Standorte) als Settings-
Asset; Rubrum-Autogenerierung aus Akten-Parteien (Kläger/Beklagte/Az/Gericht) als Drafting-
Baustein — jeder generierte Schriftsatz beginnt korrekt formatiert. Anker: Drafting,
`legal-draft-pdf.ts` existiert.

**F7 — Postausgangsbuch** ⬛ FEHLT. Chronologisches, revisionssicheres Register aller Ausgänge
(E-Mail/beA/Post/Fax) mit Zustellnachweis-Verknüpfung — Pendant zum Fristenbuch, gleicher
UI-Bauplan, speist sich aus vorhandenen Audit-Events. Bei Zustellungsstreit Gold wert.

**F8 — Fax-Gateway** ⬛ FEHLT. Ja, wirklich: Gerichte/Behörden faxen noch. Ausgehend über
Provider-API, eingehend als Posteingang-Quelle (W2.1). Niedrige Priorität, hoher
„die verstehen Kanzleien“-Glaubwürdigkeitswert.

**F9 — Mandanten-Bonitätsprüfung** ⬛ FEHLT. Optionaler Bonitäts-Check (Creditreform-API) beim
Intake vor Mandatsannahme + bei Deckelungs-Vereinbarung. Opt-in, DSGVO-Hinweispflicht in der UI.

**F10 — DATEV-Direktanbindung** ◧ CSV-Export existiert. Ausbau: DATEV-Rechnungsdatenservice /
Buchungsdatenservice (API statt Datei) — reduziert den Steuerberater-Roundtrip auf null.
Anker: `datev-export`, `api/datev/import` existiert bereits als Gegenstück.

**F11 — FAO-Fortbildungs-Tracking** ⬛ FEHLT. 15-Stunden-Pflicht (§ 15 FAO) pro Fachanwaltstitel
tracken (Titel existieren im Experience-Profil): Nachweise hochladen, Jahresstand, Warnung im
Q4. Klein, aber jeder Fachanwalt braucht es jedes Jahr.

**Empfohlene Einsortierung der Nachträge:** F1+F3 in Welle 2 (Haftung/Compliance, klein),
F2+F4+F6 in Welle 4 (Alltag/Umsatz), F5 koppelt an W2.2, Rest Welle 5.

---

## Abarbeitungsregel für dich (den implementierenden Agenten)

Pro Welle: (1) Branch pro Feature-Block, (2) nach jedem Block die §0-Dreifach-Verifikation,
(3) Selbst-Diff gegen die Akzeptanzkriterien mit Datei:Zeile-Nachweis in einer kurzen
Abschluss-Notiz unter `docs/audit/` (Muster: die bestehenden `*-verification-*.md`),
(4) neue Crons IMMER an allen drei Orten, (5) bei jedem „das gibt es bestimmt noch nicht“
zuerst greppen — diese Codebase ist größer als du denkst, und jedes Duplikat wird in der
Nachprüfung gefunden.
