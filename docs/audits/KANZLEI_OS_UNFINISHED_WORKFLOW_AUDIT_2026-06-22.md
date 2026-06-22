# Kanzlei OS Unfinished Workflow Audit

Datum: 2026-06-22
Scope: Dashboard, API-Routen, WhatsApp-Kanzlei-OS, Connector-Coverage, beA, DATEV, Dokumente, Abrechnung, Mandantenkommunikation.

## Kurzfazit

Technisch ist der zuletzt gebaute WhatsApp-Ausbau konsistent verdrahtet:

- Parser und Risk-Layer erkennen dieselben neuen Alltagsbefehle.
- Medium-Risk-Aenderungen laufen fuer interne Kanzleirollen in den bestehenden JA/NEIN-Bestaetigungsflow.
- Scope-Schutz laeuft zentral ueber `resolveAuthorizedCase`.
- Typecheck, fokussierter Lint, fokussierte WhatsApp/Legal-Chat-Tests und Production-Build laufen durch.

Trotzdem ist die OS-Software nicht "100% production-ready" im strengen Kanzlei-Sinn. Die naechste Baustelle ist nicht noch mehr Dashboard-UI, sondern echte End-to-End-Integrationen und Abschluss der operativen Rundlaeufe: Microsoft-365-Live-Consent/Provider-E2E, beA-Live-Prozess, SMTP/Mailbox, Zahlungs-/Mahnlauf, DMS-Push und Provider-E2E.

## Aktuelle Verifikation

- `bun run typecheck` erfolgreich.
- `cd server && bun run typecheck` erfolgreich.
- `bun run lint -- src/lib/legal-chat/actions.ts src/lib/legal-chat/actions.test.ts src/lib/whatsapp-kanzlei-os/risk.ts src/lib/whatsapp-kanzlei-os/risk.test.ts` erfolgreich.
- `bun run lint -- src/lib/connector-coverage.ts src/lib/connector-coverage.test.ts src/lib/datev-import.ts src/lib/datev-import.test.ts src/app/api/datev/import/route.ts` erfolgreich.
- `bun run lint -- src/lib/bea-import.ts src/lib/bea-import.test.ts src/app/api/bea/import/route.ts` erfolgreich.
- `bun run test:unit -- src/lib/legal-chat/actions.test.ts src/lib/legal-chat/actions-stress.test.ts src/lib/whatsapp-kanzlei-os/risk.test.ts src/lib/whatsapp-kanzlei-os/orchestrator.test.ts src/lib/whatsapp-kanzlei-os/approvals.test.ts src/lib/legal-chat/matter-scope-enforcement.test.ts src/lib/legal-chat/calc-grounding.test.ts` erfolgreich: 7 Files, 311 Tests.
- `bun run test:unit -- src/lib/connector-coverage.test.ts src/lib/datev-import.test.ts` erfolgreich: 2 Files, 61 Tests.
- `bun run test:unit -- src/lib/bea-import.test.ts src/lib/datev-import.test.ts src/lib/connector-coverage.test.ts` erfolgreich: 3 Files, 79 Tests.
- `bun test server/test/microsoft-365-connectors.test.ts server/test/admin-connectors.test.ts` erfolgreich: 10 Tests.
- `bun run build` erfolgreich: 118 Seiten generiert.

## Strukturierter Code-Befund

### 1. Connector-Coverage ist die groesste offene Baustelle

Quelle: `src/lib/connector-coverage.ts`.

Aktueller Matrix-Stand aus Code nach Hardening:

- 18 Connectoren total.
- 15 `available`.
- 3 `beta`.
- 0 `planned`.
- 4 Coverage-Gaps.
- 0 High-Severity-Gaps.

Abgeschlossen/hochgestuft:

1. Microsoft 365 ist nicht mehr komplett `planned`.
   Neu: Engine-Connectoren `ms365-sharepoint`, `ms365-onedrive`, `ms365-outlook` mit Microsoft-Graph-Delta-Sync.
   Status: `beta`, weil Live-Tenant-Consent, Provider-E2E und Webhook-Erneuerung noch Launch-Gates bleiben.

2. DATEV ist nicht mehr `planned`.
   Neu: API-Route `/api/datev/import` importiert DATEV-Buchungsstapel-CSV, persistiert Importlauf plus einzelne Buchungen und audit-loggt den Connector-Sync.
   Status: `available`, mit Medium-Limitation fuer fehlende direkte DATEV-API und fehlenden Rueckexport.

Medium:

3. Microsoft 365 ist beta, nicht final production-ready.
   Wirkung: Outlook/SharePoint/OneDrive koennen technisch delta-synchronisieren; Launch braucht echten Tenant-Test, Consent, Scopes, Secrets und Reconciliation.

4. DATEV bleibt dateibasiert.
   Wirkung: Import ist vorhanden; direkte DATEV-API, Beleg-PDF-Roundtrip und Rueckexport fehlen.

5. DMS-Connectoren haben keine Push-Benachrichtigungen.
   Wirkung: Dokumentstatus kann veralten; Sync ist manueller/periodischer statt eventgetrieben.

Low:

6. beA ist dateibasierter Import statt direkter API.
   Wirkung: beA kann im OS sichtbar sein, aber nicht als echter Live-Postkorb mit Zustell-/Sendeprotokoll gelten.

### 2. WhatsApp-Kanzlei-OS ist stark, aber Provider-E2E bleibt Launch-Gate

Abgedeckt:

- Akten suchen, listen, zusammenfassen, anlegen, schliessen.
- Mandant anlegen.
- Zeit, Auslagen, Notizen erfassen.
- Aufgaben/Fristen/Termine anlegen, listen, erledigen, verschieben, delegieren, streichen/absagen.
- Dokumente hochladen, zuordnen, Status abfragen, abrufen, Review setzen.
- Rechnungs-/DATEV-Status abfragen.
- beA-Status aus vorhandenen Brain-Seiten abfragen.
- RVG/Fristberechnung mit Rechtsgrundlage.
- Konfliktcheck.
- Mandanten-/externe Rollen werden gegated.

Noch nicht Code-abschliessbar ohne Provider:

- Meta-Live-Nummer, verifizierte Templates, Opt-in/Opt-out, Retry/Idempotency gegen echte Webhook-Events.
- WhatsApp-Media-Storage im Zielbetrieb.
- Echte Ende-zu-Ende Tests mit Sandbox- und Live-Nummer.

### 3. beA ist als Dateiimport/API sichtbar, aber noch kein echter Live-Postkorb

Vorhanden:

- Dashboard fuer `bea_draft`, `bea_message`, `filing_package`.
- Filing-Package-Status: create/submit/approve/cancel.
- WhatsApp-Statusabfrage `bea`.
- Engine-Connector `bea-import` fuer Watch-Dir/XML-Import.
- Web-API `/api/bea/import` fuer beA-XML Upload: Importlauf plus einzelne `bea_message` Seiten.

Offen:

- Echte beA-Anbindung.
- Automatischer Posteingang.
- Anlagen-Binary-Ablage direkt zur Akte.
- Zustell-/Sendeprotokoll als unveraenderbarer Nachweis.
- Fristvorschlag aus beA-Eingang mit Review-Pflicht.
- Fehler-/Retry-/Reconciliation-Handling.

### 4. DATEV/Abrechnung ist nutzbar, Import ist geschlossen, Rueckkanal bleibt offen

Vorhanden:

- Zeit/Auslagen.
- Rechnungen.
- Rechnung senden/mahnen via SMTP, sofern konfiguriert.
- DATEV-CSV-Export aus gebuchten Zeiten/Auslagen.
- DATEV-Buchungsstapel-Import via `/api/datev/import`.
- Importlauf und einzelne Buchungen werden als Brain-Seiten persistiert.
- WhatsApp-Status `datev`.

Offen:

- Direkte DATEV-API statt Dateiimport.
- Beleg-PDF-Import/Roundtrip.
- DATEV-Rueckexport/Statusabgleich.
- Zahlungseingaenge/Bankabgleich nicht geschlossen.
- Mahnlauf haengt an SMTP-Konfiguration.
- RVG-Rechnung aus Aktenkontext ist noch nicht als voller Freigabe-/Export-Rundlauf geschlossen.
- Fremdgeld/Anderkonto/Trust Accounting ist nicht als harter Kanzlei-Finanzworkflow modelliert.

### 5. Microsoft 365/Outlook ist als Engine-Beta vorhanden, aber Launch-Gate bleibt produktkritisch

Warum Prioritaet:

- Kanzleialltag laeuft faktisch ueber Outlook, Kalender, OneDrive/SharePoint.
- Ohne Outlook/Calendar-Sync bleiben E-Mail, Termine und Dokumente teilweise ausserhalb des OS.
- WhatsApp kann vieles bedienen, aber der Kanzlei-Posteingang ist in vielen Kanzleien Outlook/M365.

Vorhanden:

- `ms365-outlook`: Microsoft Graph Messages Delta.
- `ms365-onedrive`: Microsoft Graph DriveItem Delta.
- `ms365-sharepoint`: Microsoft Graph DriveItem Delta fuer Site/Drive.
- Connector-Registry kennt alle drei Services.

Offen:

- Live-Tenant-Consent und Scope-Konfiguration.
- Provider-E2E mit realem Test-Tenant.
- Push-/Webhook-Erneuerung.
- Kalender-Sync fuer Microsoft 365 ist noch nicht separat modelliert.
- Matter-Mapping und Duplikaterkennung ueber M365-Dateien.

### 6. Mail/SMS/Kommunikation ist konfigurationsabhaengig

Code-Befunde:

- `src/lib/mail.ts` gibt `mail_not_configured` zurueck, wenn Provider fehlt.
- `src/app/api/invoices/send/route.ts` und `src/app/api/invoices/remind/route.ts` blocken bei `smtp_not_configured`.
- Resend-Webhooks und Mailbox brauchen DB/Secrets.

Wirkung:

- Kommunikationsflows sind korrekt fail-closed, aber nicht automatisch production-ready.
- Launch braucht SMTP/Resend-Setup, Webhook-Secret und E2E-Mailtests.

### 7. Dokumentenworkflow ist gut, aber DMS-Push/OCR-Provider bleiben kritisch

Vorhanden:

- Vault.
- Upload.
- Case-Reconciliation.
- Dokumentstatus.
- WhatsApp-Media-Ablage.
- Dokument-Review-Markierung.

Offen:

- DMS-Push fehlt.
- OCR/Analyse ist teils asynchron und providerabhaengig.
- Dokumentfreigabe ist als Status vorhanden, aber nicht in jedem Schreib-/Versandworkflow zwingend erzwungen.

### 8. UI-Oberflaechenzahl ist hoch; Informationsarchitektur bleibt Wartungsrisiko

Stand:

- 74 Dashboard-Pages.
- 175 API-Routen.

Risiko:

- Viele Spezialseiten sind produktiv wertvoll, aber der Wartungsdruck ist hoch.
- Naechster Cleanup sollte nicht neue Features addieren, sondern kritische Routen/Workflows in robuste Domain-Flows buendeln.

## Priorisierte naechste Baustellen

### P0 — Microsoft 365/Outlook Beta zu Production haerten

Ziel:

- Live-Tenant-Consent einrichten und dokumentieren.
- Provider-E2E fuer Outlook, SharePoint und OneDrive.
- Kalender-Connector ergaenzen.
- Push/Webhook-Erneuerung.
- Matter-Mapping und Duplikaterkennung ueber M365-Dateien.

Warum zuerst:

- Das ist die groesste echte Alltagsluecke. WhatsApp ist unser USP, aber Outlook/M365 ist der normale Kanzlei-Eingang.

### P0 — DATEV-Rundlauf nach Import vervollstaendigen

Ziel:

- DATEV-Import mit Beleg-PDFs und Rechnungs-/Buchungs-Matching verbinden.
- DATEV-Export als nachvollziehbaren Exportlauf persistieren.
- Rechnungen, Zahlungen, Mahnungen und Buchungen mit Statuskette verbinden.

Warum:

- Rechnungs-/Steuerworkflow ist Kanzlei-OS-Kern, nicht Add-on.

### P0 — beA-Live-Prozess

Ziel:

- beA-Eingang ueber Live-/Exportprozess mit Aktenzuordnung.
- Fristvorschlag aus Eingang.
- Anlagen-Binary-Ablage.
- Versandpaket + Freigabe + Protokoll.

Warum:

- Haftungsrelevant. beA darf nicht nur "sichtbar" sein.

### P1 — Provider-E2E fuer WhatsApp/Mail

Ziel:

- Meta Templates + Opt-in/out + Live Webhooks.
- SMTP/Resend.
- Idempotency und Retry.

Warum:

- Code ist stark, aber echte Kommunikation ist nur so gut wie Provider-Betrieb und Zustellnachweis.

### P1 — Review-Gates vereinheitlichen

Ziel:

- Fristen, Dokumente, beA, Rechnungen und Mandantenkommunikation nutzen denselben sichtbaren Review-/Approval-Status.
- Kritische Aktionen koennen nicht versehentlich ohne Freigabe in Versand/Export laufen.

### P2 — UI-/Route-Konsolidierung

Ziel:

- Spezialseiten in Kernworkflows gruppieren.
- Admin/Debug/Research/Power-Tools klar trennen.
- Weniger Seiten, mehr geschlossene Workflows.

## Klare Antwort zur technischen Richtigkeit

Der zuletzt implementierte WhatsApp-Code ist technisch konsistent und lokal verifiziert. Was ich nicht serioes behaupten werde: dass das gesamte OS ohne Live-Provider, volle Multi-Browser-E2E, echte beA/DATEV/M365-Anbindung und produktive Secrets "100% production-ready" ist.

Die naechste beste Engineering-Investition ist nicht noch ein weiterer Chat-Befehl. Es ist der Microsoft-365/Outlook-Connector plus DATEV/beA-Rundlauf, weil damit aus einem starken Kanzlei-Dashboard ein wirklich alltagstragendes Kanzlei-OS wird.
