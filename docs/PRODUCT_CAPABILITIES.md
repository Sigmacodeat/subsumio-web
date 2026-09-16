# Subsumio Produktfähigkeiten

Stand: 2026-09-13 (Revision 7 — Österreich-only Pilot)
Zweck: kompakte, produktorientierte Übersicht darüber, was Subsumio kann,
welche Module im Repository angelegt sind und wo Produktreife noch durch
End-to-End-Verdrahtung nachgewiesen werden muss.

## Positionierung

Subsumio ist das **AI Operating System für Anwaltskanzleien und
Rechtsabteilungen** im DACH-Raum. Auth, DMS, Audit, Billing, AI Engine, Search
und RBAC sind gemeinsame Plattformdienste, aber das aktive Produkt hat nur
eine fachliche Vertikale: Legal.

Das frühere Taxumio-Steuerberaterprodukt ist archiviert. Snapshot, Grenze und
Wiederherstellung sind in `docs/archive/TAXUMIO_ARCHIVE_MANIFEST.md`
dokumentiert.

Der Kernanspruch branchenübergreifend: Antworten und Aktionen sollen aus echtem
Mandantenkontext kommen, belegbar sein, Berechtigungen respektieren und
auditierbar bleiben.

## Hauptmodule

### Kanzlei-OS-Architektur

- **Platform Core:** Auth, DMS, Audit, Billing, AI Engine, Search, RBAC, Upload,
  Realtime, Mobile, WhatsApp, E-Mail, DocuSign und SCIM.
- **Legal Product:** Gesetze, Kanzleigebühren, Fristen, Schriftsätze,
  Aktenführung, Kanzlei-Navigation, Onboarding und Legal Corpus.
- **Legal-only Provisioning:** Neue Nutzer und Brains werden ausschließlich als
  `legal` provisioniert. Alte unbekannte Industry-Metadaten fallen sicher auf
  das Subsumio-Theme zurück.
- **Kanzlei-/Control-Plane-Grenze:** Die Betreiber-Konsole (`/ops`) läuft nur auf
  dem Ops-Host (`ops.subsum.eu`) für Plattform-Betreiber (E-Mail-Allowlist + 2FA);
  ihre APIs sind über `platform.operator` gesichert, das keine Kanzlei-Rolle
  erhält. Nicht benötigte Eval-/Qualitäts-Adapter sind archiviert.
  Kanzlei-Governance-Endpunkte, Engine-Callbacks und Cron-Routen bleiben.
  Grenze und Wiederherstellung:
  `docs/archive/CONTROL_PLANE_ARCHIVE_2026-09-13.md`.
- **Pilot-Fokus:** B2C-Funnels (`/privat`, `/nischen`), die Nicht-DACH-Sprachen
  (it/es/pl/fr/nl), White-Label-PWA, Peer-Benchmark und Marketing-Agent sind
  nicht Teil des Builds. Aktive Sprachen: DE, AT, CH, EN. Grenze und
  Wiederherstellung: `docs/archive/PILOT_FOCUS_ARCHIVE_2026-09-12.md`.
- **Kanonische Dashboard-Flächen:** Recherche-Unterfunktionen und
  Zeiterfassung haben jeweils nur eine aktive App-Router-Seite. Alte URLs
  bleiben als serverseitige Redirects erreichbar. Grenze und Wiederherstellung:
  `docs/archive/DASHBOARD_ALIAS_ARCHIVE_2026-09-13.md`.
  Die Navigation bündelt die fachlichen Module in sechs Kanzlei-Arbeitsräume;
  Detailinventur und nächste Trennkante stehen in
  `docs/KANZLEI_OS_SURFACE_AUDIT_2026-09-13.md`.
- **Österreich-only Go-to-Market:** Die aktive öffentliche Website unterstützt
  ausschließlich `de-AT` unter `/at`. DE/CH/EN-Routen und ungeprefixte
  Seitenduplikate sind archiviert; alte URLs leiten permanent auf die
  entsprechende österreichische Seite. Das Kanzlei-Dashboard, APIs und der
  Mandantenportal-Pfad bleiben unverändert. Grenze und Wiederherstellung:
  `docs/archive/AUSTRIA_ONLY_MARKET_ARCHIVE_2026-09-13.md`.

### Kanzlei-Dashboard (Legal)

Vorhandene Dashboard-Bereiche:

- Akten, neue Akte, Akten-Detailseiten.
- Kontakte, Gegner, Team und Rollen.
- Fristen, Kalenderexport, Case Scanner und AI-Deadlines.
- Upload, Vault, Quellen, Brain, Query, Analyze und Recherche.
- Vertragsentwurf, Contract Review, Clause Library, Playbooks,
  Tabular Review und Due Diligence.
- Invoicing, Billing, Controlling, DATEV-Export und Zeiterfassung.
- Client Portal, Dokumentenanfragen, Intake, Onboarding und Review Queue.
- Audit, Compliance, Retention, Verfahrensdokumentation und Data Export.
- WhatsApp, Word Add-in, beA, DocuSign, DMS-Connectors und API Keys.
- Einstellungen für Kanzlei, Security, AI-Modell und SCIM.
- Litigation Flow, Review Sets, Trust Accounting, Litigation Analytics.

### Legal AI

Subsumio enthält API- und UI-Bausteine für:

- Legal Analyze, Summarize, Translate, Memo und Risk Analysis.
- Contract Drafting, Contract Redline und Document Review.
- Statute Search, Statute Detail, Judgements Search und Judgements Sync.
- RVG-Berechnung, Obligation Extraction und Due Diligence.
- Precedent Search, Playbooks und Clause Annotations.
- Human Review, Citation/AI-Notice-Komponenten und RAG-/Release-Gates.
- Litigation Flow (Phasen, Steps, Transitions), Review Sets (Privilege, Redaction, Bates), Trust Accounting, Litigation Analytics.

### Kanzlei Brain und Retrieval

Das Produkt ist brain-first aufgebaut:

- Dokumente, Seiten, E-Mails und Aktenkontext werden über Brain-/Page-Routen
  und Engine-APIs abfragbar gemacht.
- Matter Context API verbindet Antworten mit aktenbezogenem Kontext.
- Graph- und Search-Routen liefern Beziehungs- und Retrieval-Zugriff.
- RAG-Eval, Brain Quality und Release Gate prüfen Qualität und Regressionen.
- Knowledge-Asset-Modelle unterstützen Precedents, Clauses, Playbooks,
  Checklisten, Memos und After-Action Reviews.

### WhatsApp Legal Secretary

Vorhandene Bausteine:

- WhatsApp Webhook, Identitäten, Send-Route, Status und Flow Endpoint.
- Legal Chat Actions für Kanzlei-OS-Befehle.
- Proaktive Daily Briefings über Cron-Route.
- Outbound-Gate, Consent, 24h-Fenster und Template-/Scope-Logik.
- Event-Bus für Notifications, WhatsApp, E-Mail, Dashboard und Push.
- Approval-Rückkanal, Feedback-Capture und Secretary Metrics.

Produktziel: Anwälte können unterwegs Zeiten, Notizen, Aufgaben, Fristen,
Auslagen, Dokumente, Fotos, Sprachnachrichten und Fragen in den Kanzleikontext
bringen und proaktive Hinweise erhalten.

### Practice Management

Subsumio deckt Kanzleiabläufe in mehreren Schichten ab:

- Intake und Mandatsanlage.
- Kollisionsprüfung und Conflict Check.
- Fristen, Case Scanner und Deadline Reminders.
- Workflows und Approval-Ausführung.
- Kanzlei-Einstellungen, Rollen, Teamverwaltung und Audit Trail.
- Rechnungen, Zahlungserinnerungen, Billing Summary und DATEV-Export.

### Contract und CLM

Vorhandene Fähigkeiten:

- Vertragsentwurf und Vertragsredline.
- Clause Library, Playbooks, Clause Annotations und Version History.
- Obligation Extraction und Obligation Tracking.
- DocuSign Auth, Envelope-Erstellung, Status und Webhook.
- Signature Dashboard.

Noch separat nachzuweisen: durchgängiger CLM-Flow von Intake über Drafting,
Review, Freigabe, Signatur, Obligation und Verlängerung/Frist.

### Mandantenportal

Vorhandene Portal-Funktionen:

- Portal-Token generieren, prüfen und widerrufen.
- Mandantenakte abrufen.
- Nachrichten senden und abrufen.
- Dokumentenanfragen und Upload.
- Client Portal Dashboard.

Wichtig für Produktreife: jede Portalaktion braucht saubere Auditierung,
DSGVO-/Retention-Regeln und klare Matter-Berechtigung.

### Integrationen

Im Repository angelegte Integrationen:

- Deutscher beA-XML-Import, Filing-Pakete und optionaler Versand über eine separat konfigurierte Middleware. Keine native österreichische webERV-Anbindung.
- DocuSign OAuth, Envelopes, Status und Webhook.
- DMS-Suche und Import, inklusive iManage/NetDocuments-Konnektor-Schicht.
- Outlook Add-in und Word Add-in.
- DATEV-Export.
- Stripe Billing und Portal.
- Resend/Nodemailer-Mailbox- und E-Mail-Import-Flows.
- SCIM Users/Groups/Status/Sync.
- Capacitor Mobile/PWA mit Push-/Share-/Biometrie-Bausteinen.

### Governance, Sicherheit und Compliance

Vorhandene Sicherheits- und Compliance-Schichten:

- Session Auth, TOTP 2FA, Recovery, API-Key Rotation.
- Tenant Guard, Matter Permissions und Ethical Walls.
- Org Model Policy, inklusive `eu_only` Modellfilterung.
- Audit Trail, Backup/GDPR Export, Retention und Legal Hold Bausteine.
- Webhook-Signaturprüfungen für externe Provider.
- Upload- und Media-Sicherheitsprüfungen.
- AI Act Notice, Human Review und Release/RAG Quality Gates.
- GoBD-Verfahrensdokumentation und Kanzlei-Stammdaten.

### Betrieb und Qualität

Vorhandene Qualitätsbausteine:

- Vitest Unit Tests.
- Playwright E2E und a11y-Specs.
- Typecheck, Lint, Build und CI-Workflows.
- Server Verify für die Engine.
- Performance Budgets und Lasttest-Szenarien.
- Health, Readiness, Usage, Eval und Monitoring-nahe Routen.

## Bekannte Reifegrade

Diese Übersicht unterscheidet bewusst zwischen "angelegt" und "produktfertig":

| Bereich              | Reifegrad            | Hinweis                                                                            |
| -------------------- | -------------------- | ---------------------------------------------------------------------------------- |
| Kanzlei-OS Core      | produktionsreif      | Legal-only Signup, Navigation, Branding und Brain-Provisioning.                    |
| Kanzlei-Dashboard    | breit angelegt       | Viele Flows vorhanden; End-to-End-Abdeckung pro kritischem Flow prüfen.            |
| Legal-AI APIs        | stark angelegt       | Citation/Grounding und Human Review müssen je Route nachweisbar greifen.           |
| Brain/Retrieval      | Kern vorhanden       | Matter-/Tenant-Scope ist der wichtigste Regressionstest.                           |
| WhatsApp Secretary   | stark ausgebaut      | Outbound, Consent, Feedback und Metrics müssen als kompletter Loop geprüft werden. |
| Billing/DATEV        | angelegt             | Trust Accounting und AI-Spend pro Matter/User sind eigene Restthemen.              |
| Contract/CLM         | teilweise produktnah | Voller CLM-End-to-End-Flow ist noch als Gate zu beweisen.                          |
| Bulk Review          | teilweise            | Defensible Review-Sets, Coding, Sampling und Export brauchen Produktnachweis.      |
| Litigation Analytics | Modell angelegt      | Gericht-/Richter-/Outcome-Analytics als Nutzerprodukt prüfen.                      |
| Co-Editing           | teilweise            | Kommentare/SSE sind da; echte Presence/Cursor/Typing fehlen als Nachweis.          |
| Add-ins              | angelegt             | Auth, Audit, Grounding und sichere Speicherung je Add-in prüfen.                   |

### Grenzen der Kanzleisoftware-Integration

- ADVOKAT ist derzeit eine read-only Datei-/Export-Bridge. Native Synchronisation von Stammdaten, Fristen und Leistungen sowie Write-back benötigen einen Vertrag und die Schnittstellendokumentation des Herstellers.
- beA bezeichnet den deutschen elektronischen Rechtsverkehr. Österreichischer webERV-Versand ist derzeit nicht implementiert.
- Subsumio ergänzt im österreichischen Pilotbetrieb daher die bestehende Kanzleisoftware und ersetzt sie nicht als führendes System.

## Dokumentationsstandard

Neue Funktionen sollten künftig mit diesen Artefakten geliefert werden:

1. Kurzbeschreibung in dieser Datei.
2. Status/Nachweis in der kanonischen Implementation-Statusdatei.
3. API- oder Nutzerdoku, wenn der Flow extern bedient wird.
4. Testnachweis: Unit, API und/oder Playwright.
5. Security-/Privacy-Hinweis, wenn Kanzlei-, Mandanten- oder AI-Daten betroffen sind.
