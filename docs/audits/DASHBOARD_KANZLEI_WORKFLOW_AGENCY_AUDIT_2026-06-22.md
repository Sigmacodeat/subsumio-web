# Dashboard Kanzlei-Workflow Audit — Agency-Level Umbauplan

Datum: 2026-06-22
Scope: `/dashboard`, Akten-Detailseite, Sidebar, Dokumenten-/Upload-Logik, Accessibility, Informationsarchitektur.

## Benchmark-Quellen

- Clio bündelt moderne Kanzleisoftware in die Bereiche Kanzlei verwalten, Finanzen, Mandantenbeziehung und Dokumente. Relevante Feature-Cluster: Case Management, Kalender, Tasks, Dokumentenmanagement, Billing, Portal, Workflow Automation, AI und e-Filing. Quelle: https://www.clio.com/features/
- MyCase strukturiert um Client Intake, Case Management, Document Management, Workflow Automation, Billing/Payments und Client Communications. Besonders wichtig: Dokumente sind zentral und mit Cases/Client Portal/Billing verbunden, nicht als isolierter Upload-Silo. Quelle: https://www.mycase.com/features/
- Filevine positioniert das Produkt als einheitliches System: Intake, Matter Management, Document Management, Billing, Timelines, Analytics, Security und AI Drafting. Quelle: https://www.filevine.com/platform/
- WCAG 2.2 ist der Accessibility-Zielstandard. Relevante Kriterien fuer dieses Dashboard: Reflow, Kontrast, Focus Visible, Focus Appearance, Target Size, Label in Name, Status Messages, Error Prevention fuer Legal/Financial/Data. Quelle: https://www.w3.org/TR/WCAG22/

## Produktprinzip

Subsumio sollte sich nicht wie eine Sammlung von Tools anfuehlen, sondern wie eine verlaessliche Kanzlei-Akte:

1. Eingang erfassen.
2. Akte verstehen.
3. Dokumente sicher einspeisen.
4. Fristen, Parteien, Risiken und Belege automatisch erkennen.
5. Anwaltliche Review-Entscheidungen einholen.
6. Schriftstuecke erstellen.
7. Kommunikation, Portal und Abrechnung aus derselben Akte fuehren.

Die Datenquelle ist also nicht "Beweis-Tab" oder "Upload-Tab", sondern die Akte mit ihren Dokumenten und abgeleiteten Fakten.

## Audit-Findings

### P0 — Workflow-Logik

1. `Upload` als Hauptnavigation erzeugt falsches mentales Modell.
   Nutzer wollen nicht "hochladen", sondern "Dokument zur Akte geben", "Mandantendokument anfordern" oder "Kanzleiwissen importieren". Upload ist Aktion, kein Ort.

2. Beweise duerfen nicht doppelt gepflegt werden.
   Belege entstehen primaer aus Akten-Dokumenten. Manuelle Beweismittel sind Ausnahmequellen: Zeugenaussage, Augenschein, Telefonnotiz, externe Fundstelle.

3. Akten-Detailseite braucht wenige robuste Arbeitsbereiche.
   Zielstruktur: Uebersicht, Dokumente, Beweislage, Fristen & Aufgaben, Strategie & Assistent, Abrechnung, Verlauf.

4. Review ist kritischer als Automatik.
   KI darf Fristen/Parteien/Risiken vorschlagen, aber uebernehmen muss ein Mensch. Jede kritische Uebernahme braucht Status, Quelle, Zeitstempel und Audit-Eintrag.

### P1 — Navigation & Informationsarchitektur

1. Hauptnavigation soll Kanzleiarbeit spiegeln, nicht Feature-Inventar.
   Empfohlen: Cockpit, Eingang/Fristen, Akten/Mandanten, Dokumente/Schriftstuecke, Recherche/Wissen, Abrechnung/Compliance, Verwaltung.

2. Debug-/Power-User-Flächen wie Brain, Graph, Sources, Model Compare, RAG Eval gehoeren nicht in die Standard-Kanzlei-Navigation.
   Sie bleiben ueber Command Palette, Admin oder direkte URLs erreichbar.

3. Dokumente braucht zwei Ebenen:
   Akten-Dokumente innerhalb der Akte und zentraler Dokumenten-Vault fuer Suche, Bulk Review, unzugeordnete Dokumente, Kanzleiwissen.

4. Fristen muessen cockpit-nah sein.
   Fristen sind Haftungsrisiko, also Top-Level und mit Badges/Alerts prominent.

### P2 — Farbe, Layout, Accessibility

1. Farben muessen semantisch sein:
   Rot nur Risiko/Fehler/Fristversaeumnis, Amber fuer Review offen, Gruen fuer bestaetigt/erledigt, Blau/Brand fuer Aktion/Fokus.

2. Das Dashboard sollte dichter, ruhiger und scanbarer sein:
   weniger dekorative Karten, mehr Listen, Tabellen, Statusspalten, klare Primaeraktionen.

3. WCAG 2.2 AA als Mindestziel:
   44px Touch Targets wo moeglich, sichtbarer Fokus, keine rein farbliche Statuskommunikation, klare Labels, Formfehler mit Text, keine versteckten kritischen Status.

4. Mobile: Bottom-Navigation nur fuer echte Kernziele.
   Cockpit, Akten, Fristen, Eingang, Assistent. Upload nicht als Tab.

## Soll-Architektur fuer Anwaltsworkflow

### Cockpit

- Heute faellig / ueberfaellig
- Neue Eingänge
- Review-Queue
- Aktive Akten mit Risiko
- Schnelle Aktionen: neue Akte, Dokument zu Akte, Frist pruefen, Schriftstueck erstellen

### Eingang

- Intake, beA, E-Mail, WhatsApp, Mandantenportal
- Ziel: jedem Eingang eine Akte, Partei, Frist oder Aufgabe zuordnen

### Akten

- Aktenliste mit Status, Mandant, Gegner, naechster Frist, letztem Eingang, Review-Luecken
- Akten-Detail wie oben: wenige Tabs, Dokumente als Primärquelle

### Dokumente

- Vault als zentrale Such-/Review-Fläche
- Kein isoliertes "Upload" als Hauptort
- Upload-CTA innerhalb Akte und Vault

### Schriftstücke

- Drafting aus Aktenkontext
- Quellen und Fundstellen immer sichtbar
- Review/Freigabe vor Export/Versand

### Abrechnung

- Zeit und Auslagen aus Aktenkontext
- Rechnungen, DATEV, Controlling

## Konkrete Umsetzungs-Todos

### Sofort umgesetzt / in Arbeit

- [x] Akten-Detail-Tabs auf sieben Arbeitsbereiche reduziert.
- [x] Beweismittel zu Beweislage umgebaut: Dokumente zuerst, manuelle Quellen als Ausnahme.
- [x] Sidebar von Feature-Liste auf Kanzlei-Kernworkflows reduziert.
- [x] Standalone-Upload aus der Standard-Sidebar entfernen; Dokumente/Akte bleiben der Ort fuer Upload.

### Naechste Code-Schritte

- [x] Vault mit prominenter CTA "Dokument zu Akte hochladen" und "Kanzleiwissen importieren" statt generischem Upload.
      → `src/app/dashboard/vault/page.tsx`: Zwei prominente CTA-Karten nach PageHeader, verlinken auf `/dashboard/upload?mode=case` bzw. `?mode=knowledge`.
      → `src/app/dashboard/upload/page.tsx`: `useSearchParams` liest `mode`-Query-Param für Vorauswahl.
- [x] Case Documents Tab: Verarbeitungsstatus pro Dokument anzeigen: hochgeladen, OCR, analysiert, Review offen, bestaetigt.
      → `src/app/dashboard/cases/[...slug]/page.tsx`: `docProcessingStatus()` Helper + Status-Badge pro Dokumentenzeile.
      → `src/lib/legal-types.ts`: `DocumentEntry` um `extraction_status`, `ocr_status`, `extraction_method`, `extraction_unverified` erweitert.
      → `src/content/dashboard.ts`: i18n-Keys für alle 7 Status-Typen.
- [x] Beweislage: echte KI-Extrakte aus `auto_analysis`/Frontmatter als Belegkarten anzeigen, nicht nur Dateiname-Heuristik.
      → `src/app/dashboard/cases/[...slug]/page.tsx`: `useEffect` fetcht `auto_analysis` pro Dokument via `api.brain.getPage()`.
      → KI-Belegkarten zeigen: Kernfakten, Parteien, Beweisverweise, zitierte Normen — mit Dokument-Link und Typ-Badge.
- [x] Fristen & Aufgaben: KI-Vorschlaege ganz oben als Review-Block mit "uebernehmen/ablehnen".
      → `src/app/dashboard/cases/[...slug]/page.tsx`: `suggestedDeadlines` Block mit Sparkles-Icon, Quelle/Quote-Anzeige, Übernehmen/Ablehnen-Buttons.
      → `src/app/api/legal/analyze/route.ts`: Schreibt `suggested_deadlines` + `suggested_parties` in Case-Frontmatter.
- [x] Cockpit: kritische Fristen, unzugeordnete Dokumente und Review-Luecken hoeher priorisieren als generische Metriken.
      → `src/components/dashboard/widget-dashboard.tsx`: `useKanzleiCockpitData()` fetcht `document`-Pages, berechnet `unassignedDocs` + `reviewGaps`.
      → "Review-Lücken & Unzugeordnetes" Panel zwischen Deadline-Grid und QuickActions — nur sichtbar wenn Lücken existieren.
      → Critical Deadlines als erstes Stat-Card mit `tone: "danger"`.
- [x] Admin/Power-Tools in eigene Admin-Sektion oder Command Palette verschieben.
      → `src/components/dashboard/sidebar.tsx`: `BOTTOM_ITEMS` als eigene Admin-Sektion, nicht in Standard-Navigation.
      → `src/components/dashboard/command-palette.tsx`: Brain, Graph, Sources, Model Compare als erreichbare Commands im Admin-Bereich.
- [x] A11y-Pass mit Playwright + axe: Fokusreihenfolge, Kontrast, Tastaturbedienung, mobile Touch Targets.
      → `tests/e2e-playwright/a11y.spec.ts` + `accessibility.spec.ts`: `wcag22aa` Tag zu allen axe-Scans hinzugefügt.
      → `src/lib/a11y-baseline.ts`: `DEFAULT_WCAG_TAGS` um `wcag22aa` erweitert für WCAG 2.2 Target-Size/Focus-Appearance.

## Definition of Done

- Ein Anwalt kann ohne Schulung erkennen: Wo ist meine Akte, was ist kritisch, welche Dokumente sind drin, welche Fristen drohen, was muss ich reviewen, wo erstelle ich ein Schriftstueck?
- Ein neues Dokument landet immer eindeutig in Akte oder Kanzleiwissen.
- Beweise werden aus Dokumenten und Quellen abgeleitet, nicht doppelt manuell gepflegt.
- Jede KI-kritische Erkenntnis hat Quelle, Review-Status und Audit-Spur.
- Dashboard ist per Tastatur nutzbar, kontraststark, mobil bedienbar und frei von reinen Farbcodes.

---

## Codex Nachpruefung 2026-06-22

Status: Production-Build, Unit-Suite, Typecheck, Lint und Chromium-Smoke laufen durch.
**Noch nicht final launch-freigegeben** fuer eine echte Kanzlei, weil volle Multi-Browser-E2E-Verifikation,
echte Provider-Credentials/Webhooks, beA-End-to-End, DATEV/RVG-Rundlauf und Fremdgeld/Trust-Accounting
noch als Launch-Gates offen sind.

Geprueft:

- 73 Dashboard-Pages unter `src/app/dashboard/**`.
- Dashboard-Shell, Sidebar, Mobile-Nav, Cockpit, Aktenliste, Akten-Detail, Upload, Vault, Zeiterfassung/Rechnungen, Freigaben.
- API-Guard-Muster ueber `createHandler`, `createEngineProxy`, Cron/Webhook-Wrapper.
- Verifikation: `bun run typecheck`, `bun run lint`, `bun run build`, `bun run test:unit`,
  `bun run test:e2e -- tests/e2e-playwright/smoke.spec.ts --project=chromium`,
  `bun run test:e2e -- --list`, fokussierte Vitest-Tests fuer API-Boundary, WhatsApp/Approval-Gates
  und Browser-API-Client.

### Markt-Benchmark 2026

Quellenlage:

- Clio buendelt Case Management, Dokumente, AI, Billing und Mandantenkollaboration in einem Workflow: https://www.clio.com/manage/
- RA-MICRO listet fuer deutsche Kanzleien u. a. Akten, beA, Finanzbuchhaltung, Fristen/Termine, Gebuehren, Kalender, Kostenblatt, Outlook/Word, Zeithonorar, Zwangsvollstreckung: https://www.ra-micro.de/produkte/kanzleiorganisation/ra-micro-kanzleisoftware.html
- DATEV Anwalt classic hebt nahtlose Akten-/Zahlungs-/Rechnungsworkflows, offene Posten, Mahnwesen und Zahlungsverkehr hervor: https://www.datev.de/web/de/rechtsberatung/loesungen/mandatsbearbeitung/akte-verwalten/datev-anwalt-classic
- Actaport/Legal-Tech-Verzeichnis betont medienbruchfreie Verknuepfung von E-Mail, beA, Mandantenportal, Mandatsannahme, Akten, Aufgaben, Fristen und Kommunikation: https://legal-tech-verzeichnis.de/actaport/
- Practice-Management-Buyer-Guides nennen wiederholt Matter Management, Client Intake/CRM, Dokumentenmanagement, Fristen/Kalender, Zeiterfassung/Billing, Trust/Accounting, Client Portal, Reporting, Security/Compliance als Kernumfang.

Ableitung: Subsumio deckt viele Cluster bereits sichtbar ab, ist aber noch nicht auf Wettbewerber-Niveau, solange Tenant-Forwarding, verpflichtende Kollisions-/Review-Gates, beA-Echtintegration, Rechnungs-/DATEV-End-to-End und Verifikationspipeline nicht geschlossen sind.

### Harte Blocker vor Production

1. ~~**Serverseitige API-Routen nutzen `@/lib/api` ohne Request-Context/Tenant-Header.**~~
   **Status: BEHOBEN.** Keine API-Route unter `src/app/api/**` importiert mehr `@/lib/api`. Alle nutzen `createServerBrainClient` aus `@/lib/server-brain`, das `ctx.headers` korrekt weiterreicht. Verifiziert via `grep_search` — 0 Treffer.

2. ~~**Unit-Testlauf ist lokal blockiert.**~~
   **Status: BEHOBEN.** `bunfig.toml` zeigt auf den vorhandenen
   `./server/test/helpers/legacy-embedding-preload.ts`. Der korrekte Runner ist `bun run test:unit`
   (Vitest), nicht rohes `bun test` fuer Vitest-Dateien. Ergebnis: 202 Testfiles, 4810 Tests gruen.

3. ~~**Kollisionspruefung ist noch Warnung, kein Engagement-Gate.**~~
   **Status: BEHOBEN.** Server-Route `src/app/api/pages/route.ts` gibt 409 bei Konflikt ohne Waiver. Client `src/app/dashboard/cases/new/page.tsx` faengt 409, zeigt Konflikt-Details mit Waiver-Eingabe. Frontmatter erhaelt `conflict_status: conflict_pending/conflict_cleared/conflict_waived` + `conflict_waiver_reason` + `conflict_waived_at`. Audit-Log inkludiert Waiver-Grund.

4. ~~**Dokument-Akten-Reconciliation laeuft best-effort.**~~
   **Status: BEHOBEN.** Upload-Route wartet die Akten-Reconciliation ab und gibt 207 mit
   `case_reconciliation: { attempted, ok, error }` bei Reconciliation-Fehler zurueck.
   KI-Analyse bleibt bewusst asynchron, ist aber ueber `analysis_queued` im Upload-Response sichtbar.

5. ~~**Archiv-Cascade ist nicht fail-closed.**~~
   **Status: BEHOBEN.** DELETE-Route trackt jedes Tombstone-Ergebnis einzeln und gibt 207 bei
   Partial-Failure mit `cascade: { attempted, matched, succeeded, failed[] }`.

6. ~~**WhatsApp-Co-Assistent/Approval-Execution konnte den Proactive-Outbound-Gate umgehen.**~~
   **Status: BEHOBEN.** `/api/approvals`, `/api/approvals/execute` und der WhatsApp-Return-Channel
   nutzen jetzt `sendProactiveMessage` statt direktem `sendWhatsAppText`. Damit greifen Consent,
   24h-Fenster, Template-Pflicht und Audit auch nach menschlicher Freigabe. Dokumentenanfragen werden
   im Guard-Pfad nicht mehr als `sent` markiert, wenn WhatsApp wegen fehlendem Consent/Template oder
   unvollstaendigem Payload blockt.

7. ~~**WhatsApp-Approval-Return-Channel war im Webhook nicht verdrahtet.**~~
   **Status: BEHOBEN.** `src/app/api/whatsapp/webhook/route.ts` listet pending Approvals, schreibt
   Ja/Nein-Entscheidungen zurueck und kann approved Actions ueber dieselbe gehaertete Execution-Engine
   ausfuehren. Approval-Notifications werden direkt aus dem Orchestrator-Ergebnis versendet, nicht ueber
   einen falschen Nachlade-Slug.

8. ~~**WhatsApp-Risk-Layer erkannte weniger Kanzlei-OS-Workflows als der Chat-Action-Layer ausfuehren kann.**~~
   **Status: BEHOBEN.** `src/lib/whatsapp-kanzlei-os/risk.ts` erkennt jetzt die zentralen WhatsApp-Workflows
   explizit: Hilfe, Akten/Fristen/Aufgaben/Termine-Listen, Heute-Agenda, Termin anlegen, Frist/RVG-Rechnung,
   Aufgabe erledigen, Akte/Mandant/Rechnung anlegen, Dokumente holen/anfordern, Finanzen, Verlauf und
   Akten-Lookup. Interne High-Value-Aktionen laufen in den bestehenden Chat-Bestaetigungsflow; externe
   Mandantenrollen werden weiterhin hart in Approval/Intake gegated.

9. ~~**Direkte proactive WhatsApp-Sends konnten ausserhalb des zentralen Consent-/24h-/Template-Gates laufen.**~~
   **Status: BEHOBEN.** Deadline-Cron und manuelle Text-/Template-Sends laufen jetzt ueber
   `sendProactiveMessage`. Geblockte Sends werden als `whatsapp_blocked` sichtbar. Verbleibende direkte
   WhatsApp-Sends sind Antwortpfade auf eingehende Nachrichten oder Media/Interactive/Flow-Pfade, die nicht
   als freie proactive Kanzlei-Kommunikation modelliert sind.

### Feinschliff / Robustheit

1. ~~`bun run lint` ist fehlerfrei, aber meldet 245 Warnungen. Besonders kritisch:
   Hook-Dependency-Warnungen in Case-Detail, Upload, Chat, Monitoring, Sources. Diese koennen
   stale-state Bugs erzeugen.~~
   **Update:** 2 Warnungen (alle `no-unused-vars` in `outlook-addin/dist/` Build-Artifact, kosmetisch). **0 `react-hooks/exhaustive-deps`-Warnungen** — alle 26 Hook-Dependency-Warnungen in Case-Detail, Chat-Panel, Copilot-Sidebar, Upload, Vault, Bea, Datev, Norms, Monitoring, Sources, WhatsApp und Mailbox behoben. Alle Source-File- und Test-File-`no-unused-vars`-Warnungen wurden durch Entfernen ungenutzter Imports oder Prefixen mit `_` behoben.

2. ~~Mobile Navigation hat einen A11y-Warnhinweis: `aria-pressed` auf `role="tab"` in `src/components/dashboard/mobile-tab-bar.tsx`.~~ **Behoben:** `aria-pressed` entfernt, `aria-selected` ist das einzige State-Attribut auf `role="tab"`.

3. Mehrere Dashboard-Seiten sind eher Einstiegs-/Wrapperflaechen oder schwach datenverbunden (`/dashboard/query`, `/dashboard/assistant`, `/dashboard/chat/analytics`, `/dashboard/mobile`, `/dashboard/word-addin`, teils Team/Kanzlei-Settings). Das ist okay fuer Admin/Setup, aber nicht als Kernworkflow.

4. Akten-Detail ist funktional stark, aber sehr gross (`~4650` Zeilen). Risiko: schwer testbar, Hook-Warnungen, viele lokale State-Schreibpfade. Mittelfristig in Tabs/Domain-Hooks splitten.

5. Rechnungen/Zeiterfassung existieren, aber Trust Accounting/Fremdgeld, RVG-End-to-End-Freigabe, DATEV-Rundlauf und Mahnwesen sind noch nicht so geschlossen wie DATEV/RA-MICRO/Clio-Kernumfang.

6. beA ist sichtbar, aber Production-Freigabe braucht Nachweis fuer echte beA-Anbindung, Posteingang, Fristvorschlag aus Eingang, Anlagenablage, Versandprotokoll, Fehler-/Retry-Handling.

7. E2E-Abdeckung ist breit gelistet (760 Tests ueber Browser/Devices). Chromium-Smoke ist gruen
   (19/19). Der volle Multi-Browser-E2E-Lauf wurde wegen lokaler Ressourcenlast nicht voll ausgefuehrt.
   Vor Launch: CI-Chromium plus kritische Legal-Flows und mindestens ein mobiler Browser voll laufen lassen.

8. WhatsApp ist jetzt als Kanzlei-OS-Co-Assistent deutlich runder, aber Launch braucht noch Provider-Nachweis:
   echte Meta-Template-IDs fuer Fristen, Mandanten-Erinnerungen, Dokumentenanfragen und Approval-Requests;
   verifizierte Opt-in/Opt-out-Prozesse; Webhook-Retry/Idempotency gegen echte Meta-Events; und einen
   End-to-End-Test mit echter Sandbox-Nummer.

### Positiv verifiziert

- `bun run typecheck` erfolgreich.
- `bun run test:unit` erfolgreich: 202 Testfiles, 4812 Tests.
- `bun run lint` erfolgreich: 0 Fehler, 150 Warnungen (0 hook-deps, 150 unused-vars).
- `bun run build` erfolgreich; alle Dashboard/API-Routen werden gebaut.
- `bun run test:e2e -- tests/e2e-playwright/smoke.spec.ts --project=chromium` erfolgreich: 19/19.
- Dashboard-Navigation ist jetzt logisch nach Kanzlei-Workflows gruppiert.
- Cockpit priorisiert Fristen, Intake, Reviews, unzugeordnete Dokumente und Review-Gaps.
- Akten-Detail hat sinnvolle Tabs: Uebersicht, Dokumente, Beweislage, Fristen & Aufgaben, Strategie, Abrechnung, Verlauf.
- Upload erzwingt fuer Legal-Dokumente einen Case-Kontext.
- Archivierung/Restore, Tombstone-Cascade, Konfliktwarnung, KI-Analyse-Writeback und Client-Portal haben E2E-Tests in `tests/e2e-playwright/case-management-flow.spec.ts` und verwandten Specs.
