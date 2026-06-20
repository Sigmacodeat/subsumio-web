# WhatsApp-First Kanzlei OS Completion Audit

Stand: 2026-06-20  
Scope: WhatsApp -> Superbrain -> Kanzlei-OS -> Approval -> Portal/Billing/Matter Context.  
Audit-Fazit: Der technische Spine steht und die wichtigsten operativen Bruecken sind gebaut. Der Workflow ist demo-nahe, aber fuer "vollstaendig produktreif" fehlen noch echte WhatsApp-Template-Policy/E2E und Workflow-Run-Telemetrie.

## Executive Summary

Subsumio hat jetzt eine belastbare Grundlage fuer den USP:

- WhatsApp Webhook mit Signatur, Dedup, Identity, 24h Window.
- Orchestrator-Schicht unter `src/lib/whatsapp-kanzlei-os`.
- Canonical `conversation_event` Pages.
- Risk-/Intent-Matrix.
- Intake Requests als Brain Pages.
- Document Requests als Brain Pages.
- Approval Bridge fuer riskante WhatsApp-Aktionen.
- Approval Execution fuer Akte, Frist, Dokumentenanfrage, Rechnung, Nachricht.
- Intake Workspace mit Conversion zu Akte.
- Document Request Workspace.
- Portal Upload Fulfillment: Upload -> Akte -> Document Request Status.
- Portal Checklist fuer angeforderte Unterlagen mit Upload pro Item.
- Matter Context kennt Document Requests, Intake Requests und Conversation Events als First-Class-Kontext.
- Legacy Legal-Chat-Tools bleiben fuer interne Low-Risk-Kommandos nutzbar.

Aber: Vollstaendig ist der Workflow noch nicht. Der kritische fehlende Teil ist jetzt nicht mehr Draft/Approval/Context, sondern **Outbound-Policy, Workflow-Spur und echte E2E-Betriebsreife**:

1. WhatsApp outbound nutzt noch Text/Template-Ansatz ohne vollstaendige Template-Verwaltung pro Kanzlei.
2. Workflow Runs fehlen als durchgehende Spur ueber received -> approval -> sent -> fulfilled.
3. Mandanten-WhatsApp ist sicher, aber noch nicht interaktiv genug fuer echte Intake-Automation.
4. Echte Meta-/Storage-/Browser-E2E-Verifikation fehlt noch.

Realistischer Reifegrad:

| Bereich | Reife |
|---|---:|
| WhatsApp Inbound Security | 80% |
| Internal Lawyer WhatsApp Commands | 70% |
| Conversation Event / Audit Substrate | 70% |
| Matter Context / Superbrain Context | 80% |
| Intake Request Backend | 80% |
| Document Request Backend | 80% |
| Approval Safety | 80% |
| Approval Execution | 70% |
| Mandantenportal Fulfillment | 80% |
| UI/Operations Workspace | 70% |
| End-to-End Demo Readiness | 80% |

Gesamt: ca. 80% auf dem Weg zum vollstaendigen WhatsApp-first Kanzlei-OS.

## Was bereits da ist

### WhatsApp Eingang

Code:

- `src/app/api/whatsapp/webhook/route.ts`
- `src/lib/whatsapp/types.ts`
- `src/lib/whatsapp/identity.ts`
- `src/lib/whatsapp/window-store.ts`
- `src/lib/whatsapp/dedup.ts`
- `src/lib/whatsapp/media.ts`
- `src/lib/whatsapp/transcribe.ts`

Bewertung:

- Signaturpruefung ist vorhanden.
- Unbekannte/suspendierte/revoked Sender werden abgewiesen.
- 24h Customer Service Window wird getrackt.
- Dedup verhindert doppelte Verarbeitung.
- Voice/Media Pipeline existiert.

Offen:

- Mandanten-Intake fuer unbekannte Nummern ist bewusst noch aus; das ist sicher, aber limitiert Wachstum.
- WhatsApp Template-Management fuer business-initiated outbound ist noch nicht mit Document Requests verdrahtet.

### Orchestrator Spine

Code:

- `src/lib/whatsapp-kanzlei-os/orchestrator.ts`
- `src/lib/whatsapp-kanzlei-os/risk.ts`
- `src/lib/whatsapp-kanzlei-os/events.ts`
- `src/lib/whatsapp-kanzlei-os/approvals.ts`

Bewertung:

- Ein zentraler Pfad ersetzt verstreute Webhook-Logik.
- Jede Message kann als `conversation_event` gespeichert werden.
- Risk-Classification trennt interne Low-Risk-Arbeit von Mandanten-/Critical-Flows.
- Client-Rollen werden nicht in freie AI-Antworten geroutet.

Offen:

- Matter Resolver ist noch einfach: `caseSlugFromText` statt echter Aktenauflösung/Fuzzy Choices.
- Workflow Run (`workflow_run`) wird noch nicht erzeugt.
- Events werden geschrieben, aber es gibt noch keine Akten-Timeline UI fuer `conversation_event`.

### Intake Request

Code:

- `src/lib/intake.ts`
- `src/app/api/intake/route.ts`
- `src/lib/api.ts` (`api.intake.*`)

Bewertung:

- Intake als Brain/Page-Typ existiert.
- WhatsApp Client-Role Nachrichten erzeugen Intake Requests.
- API kann Intake listen, erstellen, patchen.
- Missing Documents werden grob inferred.

Neu umgesetzt:

- Dashboard Workspace fuer Intake Queue.
- Manuelle Intake-Erstellung, Statuspflege und Missing-Document-Pflege.
- Conversion zu `legal_case`.
- Conflict-Gate: Conversion erfordert `conflict_check_status=clear`.

Offen:

- Keine rechtsgebietsspezifischen Intake-Fragen.
- Kein Mandanten-Consent/Datenschutz-Opt-in Flow.

### Document Request

Code:

- `src/lib/document-requests.ts`
- `src/app/api/document-requests/route.ts`
- `src/lib/api.ts` (`api.documentRequests.*`)

Bewertung:

- Document Request als Brain/Page-Typ existiert.
- Interne WhatsApp-Anfrage erzeugt Draft plus Approval.
- Portal Token kann beim Draft erzeugt werden.
- Items wie Vollmacht/Bescheid/Zustellnachweis werden erkannt.

Neu umgesetzt:

- Document Request Dashboard.
- Portal-Link-Erzeugung mit Brain-Kontext.
- Portal Upload kann Dokumente an die Akte haengen.
- `received_document_slug` wird automatisch gesetzt.
- Statuswechsel zu `partially_fulfilled` oder `fulfilled` erfolgt beim Upload.

Offen:

- WhatsApp Template-Policy fuer Versand ausserhalb des 24h-Fensters ist noch nicht voll konfigurierbar.

### Approval

Code:

- `src/lib/approval.ts`
- `src/app/api/approvals/route.ts`
- `src/app/dashboard/approvals/page.tsx`

Bewertung:

- Neue Action Types existieren:
  - `case_create`
  - `case_close`
  - `invoice_create`
  - `client_message_send`
  - `document_request_send`
  - `deadline_confirm`
- Approval Payload kann Source Event, Workflow und Target Slug tragen.
- Dashboard zeigt Freigaben.

Neu umgesetzt:

- `PATCH /api/approvals` kann bei `execute=true` freigegebene Actions ausfuehren.
- `POST /api/approvals/execute` existiert als expliziter Executor.
- Dashboard nutzt "Freigeben & ausfuehren".
- Execution Status/Result/Error werden an der Approval Page gespeichert.
- `document_request_send`, `case_create`, `deadline_confirm`, `invoice_create`, `case_close` und Nachrichten-Actions haben Ausfuehrungspfade.

Offen:

- Einige Execution-Pfade sind bewusst konservativ und brauchen echte E2E-Seeds.
- WhatsApp Template-Versand ausserhalb 24h braucht Kanzlei-Konfiguration.

### Portal

Code:

- `src/app/portal/[token]/page.tsx`
- `src/app/api/portal/*`
- `src/lib/portal-token.ts`

Bewertung:

- Case-scoped Portal Token existiert.
- Portal kann Aktenstatus, Dokumentliste, Fristen und Nachrichten anzeigen.
- Mandant kann Nachrichten senden.

Neu umgesetzt:

- Public Portal Case API nutzt den Brain-Kontext aus signierten Tokens.
- Portal-Nachrichten nutzen serverseitige Engine-Headers statt Browser-Session.
- Public Portal Upload nutzt Upload-Pipeline und Engine Upload.
- Upload -> Case Documents -> Case Communication -> `document_request.items[].received_document_slug`.
- Document Request Status wechselt automatisch zu `partially_fulfilled` oder `fulfilled`.

Offen:

- Kein oeffentlicher Dokumenten-Download fuer interne Dokument-Slugs.

### Billing / Time

Code:

- `src/lib/time-tracking.ts`
- `src/app/api/time/*`
- `src/app/dashboard/invoicing/page.tsx`
- `src/lib/legal-chat/actions.ts`

Bewertung:

- Interne WhatsApp-Zeitbuchung ist ueber Legacy Legal Chat vorhanden.
- Offene Leistungen und Invoice-Drafts existieren.

Offen:

- Document/Approval-Spine ist noch nicht mit Billing Workflow Runs verbunden.
- Invoice Approval fuehrt noch keinen Rechnungsentwurf aus.
- Mark-billed bleibt separater Flow.

## End-to-End Szenarien

### Szenario A: Anwalt bucht Zeit per WhatsApp

Status: weitgehend funktionsfaehig.

Flow:

1. WhatsApp Text/Voice kommt rein.
2. Orchestrator schreibt `conversation_event`.
3. Low-Risk interner Intent wird an `handleLegalChatMessage` delegiert.
4. Pending `chat_action` + WhatsApp-Bestaetigung moeglich.
5. Nach JA schreibt Legacy Action `time_entries` in die Akte.

Risiken:

- Aktenauflösung ist im Legacy Handler besser als im neuen Orchestrator, aber nicht unified.
- Keine zentrale `workflow_run` Spur.

Completion: 75%.

### Szenario B: Mandant schreibt per WhatsApp

Status: sicher und operativ sichtbar, aber noch nicht vollautomatisiert.

Flow:

1. Bekannte Client-Rolle schreibt.
2. Orchestrator schreibt `conversation_event`.
3. Orchestrator erzeugt `intake_request`.
4. Orchestrator erzeugt `agent_action`.
5. Mandant bekommt sichere Empfangsbestaetigung.

Neu umgesetzt:

- Intake UI.
- Conversion zu Akte.

Fehlt:

- Follow-up Fragen.
- Mandanten-Consent.

Completion: 70%.

### Szenario C: Anwalt fordert Dokumente per WhatsApp an

Status: Draft/Approval/Fulfillment technisch vorhanden, Outbound-Policy noch zu haerten.

Flow:

1. Anwalt schreibt: "Fordere bei Akt 2026-014 Vollmacht und Bescheid an".
2. Orchestrator erkennt `document_request`.
3. Document Request Draft wird erstellt.
4. Approval wird erstellt.

Neu umgesetzt:

- Approval kann `document_request_send` ausfuehren.
- Portal Upload erfuellt angefragte Items.
- Fulfillment haengt Dokumente an Akten und setzt Request-Status.

Fehlt:

- Voll konfigurierbarer WhatsApp Template Send ausserhalb 24h.
- Browser-E2E fuer Portal Checklist.

Completion: 75%.

### Szenario D: Frist aus WhatsApp

Status: intern teilweise vorhanden, Approval-Ausfuehrung vorhanden, Orchestrator-Draft noch unvollstaendig.

Vorhanden:

- Legacy Chat kann `deadline` und `deadline_calc`.
- Approval Action Types fuer `deadline_confirm` existieren.

Fehlt:

- Orchestrator leitet High-Risk Fristen noch nicht in strukturierte Deadline-Drafts.
- Kein UI fuer Fristen-Review aus WhatsApp.

Completion: 55%.

### Szenario E: Intake-to-Invoice

Status: strukturell deutlich weiter, aber noch nicht vollstaendig.

Vorhanden:

- Intake Request.
- Case Pages.
- Time Tracking.
- Invoice APIs.
- Approvals.

Fehlt:

- Workflow Run ueber alle Phasen.
- Work log aggregation.
- Matter Context Aktualisierung fuer neue Page-Typen.

Completion: 55%.

## Critical Gaps

### P0-1 Approval Execution Engine

Status: umgesetzt, weiter E2E zu haerten.

Problem:

`agent_action` ist derzeit meist nur Status. Fuer ein Kanzlei-OS muss eine Approval-Entscheidung den naechsten sicheren Schritt ausloesen.

Umsetzung:

- Neues Modul: `src/lib/approval-execution.ts`
- Neue API: `POST /api/approvals/execute`
- `PATCH /api/approvals` optional erweitert: bei `decision=approved` und `execute=true` ausfuehren.

Action-Ausfuehrung:

| action_type | Effekt nach Approval |
|---|---|
| `document_request_send` | Document Request status `sent`, WhatsApp Template/Text senden, Outbox loggen |
| `case_create` | Intake zu `legal_case` konvertieren, Conflict Check Status pruefen |
| `deadline_confirm` | Deadline in Akte schreiben / `review_status=approved` |
| `invoice_create` | Invoice Draft erzeugen |
| `client_message_send` | Mandantennachricht senden oder Portal Message erstellen |
| `case_close` | Akte schliessen |

Akzeptanzkriterien:

- Jede Execution ist idempotent.
- Jede Execution schreibt Audit.
- Rejected fuehrt nie Zielaktion aus.
- Fehlgeschlagene Execution setzt `execution_status=failed`.

### P0-2 Intake Workspace

Status: umgesetzt, Playbooks/Consent offen.

Problem:

`intake_request` existiert, aber Anwender koennen ihn nicht operativ bearbeiten.

Umsetzung:

- Neue Seite: `src/app/dashboard/intake/page.tsx`
- Sidebar Nav: "Intake" unter Akten & Fristen oder CRM.
- Funktionen:
  - Liste nach Status.
  - Detailpanel.
  - Missing documents bearbeiten.
  - Conflict Check starten/Status setzen.
  - In Akte konvertieren.
  - Reject/Accept.

Akzeptanzkriterien:

- Intake aus WhatsApp sichtbar.
- Conversion zu Case nur bei `conflict_check_status=clear` oder expliziter Lawyer Override.
- Converted Intake speichert `converted_case_slug`.

### P0-3 Document Request Fulfillment

Status: technisch umgesetzt, Browser-E2E offen.

Problem:

Document Requests koennen nicht durch Mandanten erfuellt werden.

Umsetzung:

- Portal zeigt offene `document_request` fuer die Case als Checklist.
- Public API:
  - `GET /api/portal/case?token=...`
  - `POST /api/portal/upload`
- Upload nutzt bestehende Upload-Pipeline / Engine Upload.
- Nach Upload:
  - Dokument an Akte haengen.
  - `received_document_slug` setzen.
  - Status auf `partially_fulfilled` oder `fulfilled`.

Akzeptanzkriterien:

- Mandant sieht angeforderte Unterlagen.
- Mandant kann pro Item hochladen.
- Kanzlei sieht Fulfillment im Dashboard.
- Matter Context beruecksichtigt neue Dokumente.

### P0-4 WhatsApp Outbound for Approved Requests

Status: teilweise umgesetzt, Template-Policy offen.

Problem:

Document Request Approval sendet noch nichts.

Umsetzung:

- `document_request_send` Execution nutzt `sendWhatsAppText` oder Template.
- Outbound Gate prueft 24h Window.
- Wenn 24h Window geschlossen: nur approved template.
- Message enthaelt Portal-Link und Itemliste.

Akzeptanzkriterien:

- Keine freie Mandantennachricht ausserhalb 24h Window.
- Jede outbound message wird als `chat_outbox` oder `conversation_event` geloggt.
- Sendefehler blockiert Status `sent`.

### P0-5 Matter Context Integration

Status: umgesetzt, E2E-Verifikation offen.

Problem:

Neue Page-Typen muessen first-class im Matter Context sein, damit das Superbrain Fragen wie "Was fehlt noch?" aus echten Kanzlei-Artefakten beantworten kann.

Umsetzung:

- `buildMatterContext` erweitert:
  - `conversation_events`
  - `intake_requests`
  - `document_requests`
- Coverage/Gaps erweitert:
  - offene Document Requests.
  - unfulfilled required docs.
  - pending approvals.
- Client-Vertrag und Tests erweitert.

Akzeptanzkriterien:

- Aktenseite/Matter Context zeigt offene Unterlagen.
- Brain Query kann sagen: "Welche Unterlagen fehlen?"
- Gaps priorisieren fehlende Pflichtdokumente.

## P1 Gaps

### P1-1 Unified Conversation Timeline

- Aktenseite zeigt WhatsApp, Portal, Email, beA, Notizen chronologisch.
- `conversation_event` wird UI-sichtbar.
- Filter: channel, role, risk, status.

### P1-2 Workflow Runs

- Jeder laengere WhatsApp-Flow erzeugt `workflow_run`.
- Steps: received -> resolved -> drafted -> approved -> sent -> fulfilled.
- Workflows-Seite zeigt nicht nur manuelle Templates, sondern echte Runs.

### P1-3 Client Consent and Onboarding

- WhatsApp Client Mode nur nach Kanzlei-Konfiguration.
- Consent Text/Opt-in speichern.
- Unknown Sender optional als Intake, aber nur wenn Feature Flag aktiv.

### P1-4 Template Management

- Dashboard fuer WhatsApp Templates.
- Template IDs je Kanzlei.
- Kategorie: utility/authentication/marketing/service.
- Dry-run validation.

### P1-5 Secretary Metrics

- Time to first response.
- Open intakes.
- Fulfilled/missing document requests.
- Pending approvals.
- WhatsApp cost per matter.

## P2 Gaps

- No-code Intake Playbooks je Rechtsgebiet.
- Mandantenstatus-Updates mit Kanzlei-Freigabe.
- Email/Portal/WhatsApp gemeinsame Conversation API.
- DATEV/Rechnung automatischer nach Case Close.
- Mobile push fuer pending approvals.

## Verification Status

Zuletzt verifiziert:

- `bunx vitest run src/lib/portal-fulfillment.test.ts src/lib/document-requests.test.ts src/lib/portal-token.test.ts src/lib/intake-conversion.test.ts src/lib/intake.test.ts src/lib/approval-execution.test.ts src/lib/whatsapp-kanzlei-os/orchestrator.test.ts src/lib/whatsapp-kanzlei-os/approvals.test.ts src/lib/realtime.test.ts`
  - Ergebnis: 92 Tests gruen.
- `bun run typecheck`
  - Ergebnis: gruen.
- ESLint auf beruehrten produktiven Pfaden
  - Ergebnis: keine Fehler.

Noch nicht verifiziert:

- Echter Meta Webhook E2E.
- Echter WhatsApp outbound send.
- Browser-Screenshot fuer Portal Upload und neue Workspaces.
- Echter Upload gegen produktive Engine/Storage.

## Definition of Done fuer "vollstaendig"

Der Workflow gilt erst als vollstaendig, wenn diese Demo ohne manuelle DB/Page-Edits laeuft:

1. Anwalt sendet Voice Note zur Zeitbuchung.
2. Subsumio bucht nach Bestaetigung Zeit in die richtige Akte.
3. Mandant sendet WhatsApp-Text.
4. Subsumio erzeugt Intake, Kanzlei sieht ihn im Intake Workspace.
5. Kanzlei fuehrt Conflict Check aus und konvertiert Intake zu Akte.
6. Anwalt fordert per WhatsApp Unterlagen an.
7. Subsumio erzeugt Document Request Draft und Approval.
8. Anwalt gibt frei.
9. Subsumio sendet WhatsApp/Portal-Link.
10. Mandant laedt Dokument im Portal hoch.
11. Subsumio haengt Dokument an Akte, erfuellt Request Item und aktualisiert Matter Context.
12. Anwalt fragt per WhatsApp: "Was fehlt noch?"
13. Subsumio antwortet quellenbasiert aus Matter Context.
14. Offene Zeit/Auslagen werden zu Rechnungsentwurf.
15. Approval erzeugt finalen Rechnungsentwurf, aber versendet nicht autonom.

Heute funktionieren die Schritte 1-2 teilweise, 3-8 technisch, 10-13 technisch. Die Schritte 9, 14-15 und die echte WhatsApp/Portal-E2E-Verifikation sind die groessten offenen Luecken.

## 14-Tage Vervollstaendigungsplan

### Tag 1-2: WhatsApp Template/Outbound Hardening

- Kanzlei-Template-Konfiguration.
- 24h Window Policy fuer Approved Requests.
- Outbox/conversation event bei jedem Send.

### Tag 3-4: Workflow Runs

- received -> resolved -> drafted -> approved -> sent -> fulfilled.
- Workflows-Seite zeigt echte Runs.

### Tag 5-6: Intake Automation

- Rechtsgebietsspezifische Follow-up Fragen.
- Consent/Opt-in speichern.
- Unknown sender feature flag.

### Tag 7-8: Superbrain Query E2E

- "Was fehlt noch?" mit echten Document Requests testen.
- Quellenbelege fuer offene Unterlagen anzeigen.

### Tag 9-10: Portal/WhatsApp Browser E2E

- Portal Checklist Upload per Browser testen.
- Approved Document Request bis Portal Fulfillment testen.

### Tag 11-12: End-to-End Tests

- Webhook payload tests.
- Approval execute tests.
- Portal fulfillment tests.
- Duplicate event/idempotency tests.

### Tag 13-14: Demo Hardening

- Seed Demo Case.
- Demo script.
- Browser QA fuer WhatsApp Dashboard, Intake, Approvals, Portal.
- Copy fuer USP und Compliance.

## Produkturteil

Nein, der gesamte Workflow ist noch nicht vollstaendig produktreif. Ja, die Codebasis kommt jetzt deutlich in die Naehe: Der zentrale Spine ist da, die Datenmodelle sind nicht redundant, und neue Features nutzen Brain Pages, Portal Tokens, Approvals und bestehende Legal-Chat/Upload-Infrastruktur.

Der naechste harte Produkt-Meilenstein ist nicht "mehr AI", sondern:

> WhatsApp Template Policy + Workflow Runs + echtes E2E.

Approval Execution, Portal Fulfillment, Portal Checklist, Intake Workspace und Matter Context sind jetzt nicht mehr die Hauptblocker, sondern die Basis fuer den naechsten E2E-Haertungsschritt.
