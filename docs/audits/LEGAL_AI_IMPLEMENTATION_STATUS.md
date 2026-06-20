# Subsumio Legal-AI Implementation Status

Stand: 2026-06-20  
Rolle: kanonische Statusdatei für den Legal-AI-/Kanzlei-OS-Ausbau.

Diese Datei ersetzt die widersprüchlichen Statusaussagen aus:

- `docs/audits/LEGAL_AI_ACTION_TODO_PLAN_2026-06-20.md`
- `docs/audits/archive/LEGAL_AI_FOLLOWUP_PLAN_2026-06-20.md`

Der alte Action Plan bleibt als historische Paket- und Release-Struktur erhalten.
Der Follow-up-Plan bleibt als Audit-Historie archiviert. Neue Statusänderungen
werden hier gepflegt.

## Gesamtstatus

Subsumio ist als breites Kanzlei-OS mit Legal-AI-Kern stark angelegt, aber nicht
in allen Paketzeilen vollständig produktfertig. Die vorherige Aussage `75/75
fertig` beschreibt einzelne verifizierte Ticket-IDs, nicht den End-to-End-Status
aller Produktpakete.

Aktueller Status:

| Kategorie                           | Bedeutung                                                                             | Anzahl |
| ----------------------------------- | ------------------------------------------------------------------------------------- | -----: |
| Produktnah / weitgehend verdrahtet  | UI/API/Tests existieren; verbleibend sind Härtung, CI-Gate oder Nachweis              |     16 |
| Teilweise / Verdrahtung fehlt       | Modelle, APIs oder UI existieren, aber kein vollständiger Nutzerflow ist nachgewiesen |     21 |
| Offen / eigener Produktausbau nötig | Kernbausteine fehlen oder sind nur als Vorarbeit vorhanden                            |      3 |
| Gesamt                              | Paketzeilen inkl. 0A/0B/5A/7A/10A/13A/27-33                                           |     40 |

## Status nach Paket

| Paket | Titel                                                | Status     | Nächster Nachweis                                                                           |
| ----- | ---------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| 0     | Projekt-Setup und Ticketisierung                     | produktnah | Diese Statusdatei ist angelegt; Ticket-/Owner-System extern nachziehen.                     |
| 0A    | Production-Readiness Gate                            | produktnah | CI muss Web-App, Engine, E2E, a11y und Release-Gate blockierend laufen lassen.              |
| 0B    | Datenarchitektur, Persistenz, Migrationen            | teilweise  | Pro Paket Speicherort festlegen: relational, Brain-Page, Dateiobjekt oder Audit-Event.      |
| 1     | Systemweite Citation Verification                    | teilweise  | Alle rechtsrelevanten AI-Routen auf Citation/Grounding/Human-Review prüfen.                 |
| 2     | Source Registry und Rechtsdaten-Freshness            | teilweise  | Freshness-/Coverage-Anzeige als Nutzerflow und Gate nachweisen.                             |
| 3     | Agentic Workflow Engine                              | teilweise  | Workflow-Run-Modell, Approval-Gates und UI/API-End-to-End belegen.                          |
| 4     | Contract Review Workspace                            | teilweise  | Redline, Clause-Kommentare, Playbooks, Versionen und Export-Roundtrip als Flow prüfen.      |
| 5     | Word Add-in                                          | teilweise  | Auth, Audit, Grounding und Kanzlei-Kontext im Add-in produktiv nachweisen.                  |
| 5A    | Outlook Add-in                                       | teilweise  | Sichere Token-/Credential-Speicherung, Attachments, Audit und E-Mail-zu-Akte prüfen.        |
| 6     | Kanzlei-CLM Light                                    | teilweise  | Intake-to-draft-to-signature-to-obligation Pipeline als E2E-Flow nachweisen.                |
| 7     | Intake und AI Legal Secretary                        | produktnah | Gemeinsames Intake-Modell für Portal/WhatsApp/Dashboard bestätigen.                         |
| 7A    | WhatsApp Legal Chat Härtung                          | produktnah | Grounding für Rechtsauskünfte und Permission-Leak-Regression dauerhaft prüfen.              |
| 8     | Defensible Bulk Review und Due Diligence             | offen      | Review-Sets, Issue Coding, Privilege, Sampling, Export und Validierung bauen/nachweisen.    |
| 9     | Matter Graph und Similar Cases                       | teilweise  | Legal-Entitäten und Similar-Case-Finder als Nutzerprodukt prüfen.                           |
| 10    | Governance, Security, Enterprise Readiness           | produktnah | Admin-Flows, Audit Viewer, SCIM und Policy-Gates E2E prüfen.                                |
| 10A   | DACH-Compliance Härtung                              | produktnah | GoBD/DATEV/beA/RVG/Fristen als Regressionstest-Set bündeln.                                 |
| 11    | Integration Marketplace                              | teilweise  | Connector-Admin, Diagnose, Coverage und Credential-Status vereinheitlichen.                 |
| 12    | UX Polishing und Produktvereinheitlichung            | teilweise  | Dashboard-Navigation, Empty/Loading/Error States und kritische Flows visuell prüfen.        |
| 13    | Document Intelligence, OCR, Large-File Ingestion     | teilweise  | OCR-/Extraction-Quality-Gate und Re-run-OCR als Produktflow nachweisen.                     |
| 13A   | AI Security, Prompt Injection Defense, Upload Safety | produktnah | Prompt-/Upload-/Webhook-Security als blockierende Tests/Gates halten.                       |
| 14    | AI Quality, Evaluation, Hallucination Governance     | produktnah | `evaluateReleaseGate()` in CI/Release-Prozess blockierend bestätigen.                       |
| 15    | Billing, Trust Accounting, Spend Controls            | teilweise  | Trust-/Anderkonto-Ledger und AI-Spend pro Matter/User ergänzen.                             |
| 16    | Mobile, PWA, Offline und Push                        | teilweise  | Push, Offline-Konflikte und Mobile Capture auf echten Geräten prüfen.                       |
| 17    | Content-Partner und Jurisdiction Expansion           | teilweise  | Partner-/Lizenz-Claims erst nach realen Verträgen/Adaptern dokumentieren.                   |
| 18    | Client Portal und Mandantenkommunikation             | produktnah | Portalaktionen auf DSGVO, Audit, Matter-Scope und Dokumentfreigabe prüfen.                  |
| 19    | Auth Security und Account Protection                 | produktnah | Auth-/Webhook-/Session-Regressions als zentrale CI-Gates halten.                            |
| 20    | Practice Management Core                             | produktnah | Akte-Kontakt-Frist-Zeit-Rechnung-End-to-End-Flow als Smoke festhalten.                      |
| 21    | Marketing Agent und Lead Funnel                      | produktnah | Als P2 behalten; nicht als Legal-AI-Kernblocker behandeln.                                  |
| 22    | Court Filing, beA-Send, ERV/XJustiz                  | teilweise  | `efiling-architecture.ts` mit beA/Approval UI verbinden; Versandentscheidung dokumentieren. |
| 23    | Legal Ethics, Privilege, Ethical Walls, AML/KYC      | produktnah | Ethical-Wall-, Privilege-, AML/KYC- und EU-Model-Policy-Flows zusammen testen.              |
| 24    | Litigation Analytics und Judge/Docket Intelligence   | offen      | Richter-/Gerichts-/Outcome-Analytics als eigenes Produktpaket bauen/nachweisen.             |
| 25    | Real-time Co-Editing und Collaboration Room          | offen      | Presence, Cursor, Typing und echte synchrone Bearbeitung ergänzen.                          |
| 26    | Migration, Onboarding, Kanzlei-Datenübernahme        | teilweise  | `migration-project.ts` mit Import-Kanzlei-UI verbinden und Dry-Run/Cutover prüfen.          |
| 27    | Accessibility und Barrierefreiheit                   | produktnah | Playwright/axe in CI blockierend bestätigen; WCAG/BITV/EAA-Report speichern.                |
| 28    | Performance, Last-Test und Skalierung                | teilweise  | Einen echten k6/Staging-Lauf mit Budgets dokumentieren.                                     |
| 29    | Notification Center                                  | teilweise  | CRUD, Bell, Event-Bus, Push und WhatsApp/E-Mail-Bridges als eine Pipeline prüfen.           |
| 30    | Kanzlei Knowledge Management und Precedent Bank      | teilweise  | Curated/Approved/Deprecated Knowledge Assets als sichtbaren Workflow prüfen.                |
| 31    | Kanzlei Superbrain und Legal Context Graph           | produktnah | Matter-Scope, Freshness, Coverage, temporal facts und Retrieval-Erklärung E2E prüfen.       |
| 32    | Legal Skill System und autonome Brain-Governance     | teilweise  | Skill Authoring, Audit, Human Oversight und Fork-Sync-Strategie dokumentieren.              |
| 33    | Proaktiver KI-Sekretär                               | produktnah | Daily Briefing, Feedback, Metrics, Consent und Event-Bus als geschlossenen Loop prüfen.     |

## Sofort offene Top-Arbeiten

1. CI-Realität prüfen: `bun run lint`, `bun run typecheck`, `bun run test:unit`,
   `bun run test:e2e`, Server-Verify, a11y und Release-Gate müssen für den
   relevanten Produktstand laufen.
2. Follow-up-Lücken nicht neu bauen, bevor vorhandene Module aufgerufen werden:
   `efiling-architecture`, `migration-project`, `whatsapp-event-bus`,
   `briefing-feedback`, `facts-forget-decay`.
3. Die vier größten Produktlücken zuerst entscheiden: Bulk Review,
   Litigation Analytics, echtes Co-Editing, Trust Accounting/AI-Spend.
4. Produktdoku aktualisieren, sobald ein Paket den Status wechselt.

## Statusänderungsregel

Ein Paket darf nur hochgestuft werden, wenn der Nachweis in derselben Änderung
genannt wird:

- relevante Dateien,
- erreichbarer Nutzerflow,
- Unit-/API-/E2E-Test oder bewusst begründete Ausnahme,
- Security-/Privacy-/Audit-Prüfung bei Kanzlei- oder Mandantendaten,
- CI-/Release-Gate, falls produktkritisch.
