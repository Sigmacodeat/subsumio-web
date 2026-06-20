# Subsumio Legal-AI Action Todo Plan

Datum: 2026-06-20  
Basis: `docs/audits/LEGAL_AI_GLOBAL_COMPETITIVE_GAP_ANALYSIS_2026-06-20.md`  
Ziel: Die Wettbewerbsanalyse in konkrete Arbeitspakete übersetzen, damit Subsumio vom starken Kanzlei-OS-Fundament zur führenden Legal-AI-Software ausgebaut wird.

## Nordstern

Subsumio soll nicht "noch ein Legal Chatbot" werden, sondern ein quellengeerdetes, agentisches Kanzlei-OS:

1. Jede AI-Antwort ist prüfbar, zitiert, versioniert und auditierbar.
2. Jede wichtige Kanzlei-Arbeit läuft als Workflow: Intake, Kollisionsprüfung, Dokumentanalyse, Drafting, Review, Freigabe, Signatur, Frist, Rechnung.
3. Verträge werden nicht nur zusammengefasst, sondern clause-level geprüft, redlined, versioniert und gegen Playbooks/Fallback-Klauseln verbessert.
4. Bulk Review/Due Diligence ist defensible: Review-Sets, Issue Coding, Hot Docs, Privilege, Sampling, Precision/Recall.
5. Subsumio bleibt DACH-/EU-stark: GoBD, beA, DATEV, RVG, Datenschutz, Sovereign/EU-AI-Governance.

## Umsetzungsstruktur

| Phase   | Ziel                                                        |    Dauer | Ergebnis                                                                                                                                                                |
| ------- | ----------------------------------------------------------- | -------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0 | Fundament stabilisieren                                     |  1 Woche | Ticketstruktur, technische Spezifikationen, Testfixtures, Daten-/Persistenzvertrag (Paket 0B), Auth-Security (Paket 19), Infra-Pflicht (Env, Logger, Errors, Cron-Auth) |
| Phase 1 | Trust Layer + Practice Management Core + Kanzlei Superbrain | 2 Wochen | Systemweite Citation Verification, Source Registry, Practice Management MVP, Kanzlei Superbrain / Legal Context Graph (Paket 31)                                        |
| Phase 2 | Agentic Kanzlei Workflows                                   | 4 Wochen | Workflow Runs, Approval Gates, erste End-to-End-Flows                                                                                                                   |
| Phase 3 | Contract Review Workspace                                   | 4 Wochen | Side-by-side Review, Clause Annotations, Clause Library                                                                                                                 |
| Phase 4 | CLM Light + Intake + Client Portal                          | 4 Wochen | Intake-to-signature-to-obligation Pipeline, Mandantenportal (Paket 18)                                                                                                  |
| Phase 5 | Defensible Bulk Review                                      | 4 Wochen | Review Sets, Issue Coding, Exporte, Validation                                                                                                                          |
| Phase 6 | Governance, Integrationen, Polishing, Marketing             | 3 Wochen | Enterprise Controls, monitoring, UX hardening, Marketing Agent & Lead Funnel (Paket 21)                                                                                 |
| Phase 7 | Document Intelligence, Quality Gates, Business Ops          | 4 Wochen | OCR/large-file ingestion, AI evals, billing/trust-accounting, mobile/offline, content-partner readiness                                                                 |
| Phase 8 | Court, Ethics, Analytics und Migration                      | 5 Wochen | eFiling/beA-Send-Entscheidung, Ethics/Privilege/AML, Litigation Analytics, Co-Editing, Migration Factory                                                                |

Die Phasen können teilweise parallel laufen, aber Phase 1 ist eine harte Dependency für alles, was AI-Output erzeugt. Phase 0 (inkl. Paket 19 Auth Security) ist eine harte Dependency für alle API-Routen.

## Master-Zuordnung (Single Source of Truth)

Diese Tabelle ist die verbindliche Zuordnung von Paket zu Priorität, Auslieferungs-Release und Status. Die "Phasen" oben sind nur die grobe Zeitachse; die Auslieferung erfolgt über die "Releases" unten. Bei Konflikt gilt diese Tabelle. Die Paketnummerierung ist historisch gewachsen (0A/0B nach 0, 5A/7A/10A/13A als Ergänzungen, 27-32 neu) — die **kanonische Lese-/Umsetzungsreihenfolge** ist die Spalte "Release", nicht die Paketnummer.

| Paket | Titel                                                | Priorität | Release |
| ----- | ---------------------------------------------------- | --------- | ------- |
| 0     | Projekt-Setup und Ticketisierung                     | P0        | R0      |
| 0A    | Production-Readiness Gate                            | P0        | R0      |
| 0B    | Datenarchitektur, Persistenz, Migrationen            | P0        | R0      |
| 19    | Auth Security und Account Protection                 | P0/P1     | R0      |
| 28    | Performance, Last-Test und Skalierung                | P0/P1     | R0      |
| 1     | Systemweite Citation Verification                    | P0        | R1      |
| 2     | Source Registry und Rechtsdaten-Freshness            | P0/P1     | R1      |
| 13A   | AI Security, Prompt Injection Defense, Upload Safety | P0/P1     | R1      |
| 14    | AI Quality, Evaluation, Hallucination Governance     | P0/P1     | R1      |
| 20    | Practice Management Core                             | P0/P1     | R1      |
| 31    | Kanzlei Superbrain und Legal Context Graph           | P0/P1     | R1      |
| 32    | Legal Skill System und autonome Brain-Governance     | P0/P1     | R1      |
| 3     | Agentic Workflow Engine                              | P0        | R2      |
| 29    | Notification Center (In-App + Push-Bridge)           | P1        | R2      |
| 4     | Contract Review Workspace                            | P0        | R3      |
| 5     | Word Add-in                                          | P1        | R3      |
| 5A    | Outlook Add-in (E-Mail-zu-Akte)                      | P1        | R3      |
| 13    | Document Intelligence, OCR, Large-File Ingestion     | P0/P1     | R3      |
| 6     | Kanzlei-CLM Light                                    | P1        | R4      |
| 7     | Intake und AI Legal Secretary                        | P1        | R4      |
| 7A    | WhatsApp Legal Chat Härtung                          | P1        | R4      |
| 15    | Billing, Trust Accounting, Spend Controls            | P1        | R4      |
| 8     | Defensible Bulk Review und Due Diligence             | P1        | R5      |
| 9     | Matter Graph und Similar Cases                       | P2        | R5      |
| 10    | Governance, Security, Enterprise Readiness           | P1/P2     | R6      |
| 10A   | DACH-Compliance Härtung                              | P1        | R6      |
| 11    | Integration Marketplace                              | P2        | R6      |
| 12    | UX Polishing und Produktvereinheitlichung            | P1/P2     | R6      |
| 16    | Mobile, PWA, Offline und Push                        | P1/P2     | R6      |
| 17    | Content-Partner und Jurisdiction Expansion           | P2        | R6      |
| 21    | Marketing Agent und Lead Funnel                      | P2        | R6      |
| 27    | Accessibility und Barrierefreiheit (BITV/WCAG/EAA)   | P1        | R6      |
| 30    | Kanzlei Knowledge Management und Precedent Bank      | P1/P2     | R6      |
| 18    | Client Portal und Mandantenkommunikation             | P1        | R4/R6   |
| 22    | Court Filing, beA-Send, ERV/XJustiz                  | P1        | R7      |
| 23    | Legal Ethics, Privilege, Ethical Walls, AML/KYC      | P0/P1     | R7      |
| 24    | Litigation Analytics und Judge/Docket Intelligence   | P1/P2     | R7      |
| 25    | Real-time Co-Editing und Collaboration Room          | P1        | R7      |
| 26    | Migration, Onboarding, Kanzlei-Datenübernahme        | P1        | R7      |

## Implementierungsstatus

Diese Sektion wird laufend aktualisiert, sobald Arbeitspakete umgesetzt werden.

| Ticket      | Status           | Nachweis                                                                                                                                                                                                                           |
| ----------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-PROD-001 | fertig           | `src/middleware.ts` exemptet Provider-Webhooks fuer Billing, WhatsApp, Resend, DocuSign und generische `/api/webhook/*`-Routen von Browser-CSRF. Verifiziert mit `bunx vitest run src/middleware.test.ts` und `bun run typecheck`. |
| P0-PROD-002 | teilweise fertig | Middleware-Grenze ist in `src/middleware.test.ts` getestet: Provider-Webhooks ohne CSRF werden nicht geblockt, normale state-changing APIs bleiben geschuetzt. Route-nahe Signatur/Auth-Tests pro Provider fehlen noch.            |

## Vollständigkeits- und Redundanzcheck vom 2026-06-20

Status nach erneutem Code-Abgleich:

1. Der Plan ist inhaltlich breit genug für die nächsten Ausbaustufen: Trust Layer, Practice Management, Workflows, Contract Review, Intake/Portal/WhatsApp, Bulk Review, Governance, DACH, Integrationen, OCR, Eval, Billing, Mobile, Content-Partner, Court Filing, Ethics, Litigation Analytics, Collaboration und Migration sind abgedeckt.
2. Harte Codepfad-Korrekturen:
   - `src/app/dashboard/court-deadlines` existiert nicht; Court Filing muss auf `src/app/dashboard/deadlines`, `src/lib/legal-deadlines.ts`, `src/app/api/legal/ai-deadlines` und einem neu zu spezifizierenden Filing-Package-Modell aufbauen.
   - `src/lib/anonymize.ts` existiert nicht; Anonymisierung ist aktuell über `src/app/api/legal/anonymize/route.ts` und die allgemeine Upload-/AI-Security-Schicht zu verknüpfen.
   - `src/lib/legal-grounding.ts` existiert bewusst noch nicht; Paket 1 fordert diese Extraktion.
   - `docs/audits/LEGAL_AI_IMPLEMENTATION_STATUS.md` existiert bewusst noch nicht; Paket 0 fordert diese Statusdatei.
3. Redundanzen sind erkannt und als Abhängigkeiten zu behandeln:
   - Paket 10 Governance, Paket 13A AI Security, Paket 19 Auth Security und Paket 23 Legal Ethics überschneiden sich bei Security. Abgrenzung: Paket 19 = Account/Auth, Paket 13A = AI-/Upload-/Webhook-Security, Paket 10 = Enterprise-Governance, Paket 23 = Berufsrecht/Privilege/AML.
   - Paket 7 Intake, Paket 7A WhatsApp und Paket 18 Client Portal überschneiden sich bei Mandantenkommunikation. Abgrenzung: Paket 7 = Intake-Datenmodell, Paket 7A = WhatsApp-Kanal, Paket 18 = Portal-Link/Dokumente/Nachrichten.
   - Paket 9 Matter Graph und Paket 24 Litigation Analytics überschneiden sich bei Gerichts-/Gegnerdaten. Abgrenzung: Paket 9 = interner Matter Graph, Paket 24 = aggregierte Strategie-Analytics mit Source Registry und Sample-Size-Warnungen.
   - Paket 10A DACH und Paket 22 Court Filing überschneiden sich bei beA. Abgrenzung: Paket 10A = bestehende DACH-Compliance härten, Paket 22 = echter Filing-/Receipt-/Court-Forms-Produktstrang.
   - Paket 12 UX Import-Hinweis und Paket 26 Migration überschneiden sich beim Import-Kanzlei-Flow. Abgrenzung: Paket 12 = UI-Vereinheitlichung, Paket 26 = vollständiges Migration Project mit Mapping, Dry Run, Delta-Import und Cutover.
   - Paket 17 Content-Partner, Paket 20 Research/Precedent Search und Paket 30 Kanzlei Knowledge Management überschneiden sich bei Wissen. Abgrenzung: Paket 17 = externe/lizenzierte Inhalte, Paket 20 = operativer Research-Zugang, Paket 30 = kuratiertes internes Kanzlei-Know-how mit Precedent-Governance.
   - Paket 9 Matter Graph, Paket 20 Practice Management, Paket 30 Knowledge Management und Paket 31 Kanzlei Superbrain überschneiden sich bei Wissens-/Graph-Themen. Abgrenzung: Paket 31 = technischer und produktiver Gesamtkontext-Graph über Akten, Dokumente, Kommunikation, Fakten, Aktivitäten, Berechtigungen und Retrieval; Paket 9 = spezielle Matter-Graph-Ansicht/Similar Cases; Paket 20 = Akten-/Kanzleibetrieb; Paket 30 = kuratierte interne Knowledge Assets.
4. Code-Alignment-Hinweis:
   - Viele Code-Startpunkte existieren bereits, aber "existiert" bedeutet nicht "produktionsreif". Der Plan muss daher zwischen "bestehenden Baustein härten" und "neues Modell/API bauen" unterscheiden.
   - Nach heutigem `src/app/api`-Abgleich existieren deutlich mehr API-Routen als zentrale `createHandler()`-Nutzungen; Paket 19 bleibt deshalb als P0/P1 richtig.
   - Viele Pakete führen neue Modelle ein; ohne Paket 0B würden Workflow-, Review-, Filing-, Ethics-, Analytics- und Migration-Daten inkonsistent zwischen Brain-Pages, Frontmatter und relationaler Speicherung verteilt.

Konsequenz:

- Keine Pakete werden gestrichen. Die Überschneidungen bleiben nur dann zulässig, wenn Tickets die Abgrenzung übernehmen und keine zweite Implementierung derselben Basiskomponente erzeugen.

Paket-für-Paket-Prüfergebnis:

| Paket                                    | Status               | Kritischer Abgleich                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0 Projekt-Setup                          | behalten, korrigiert | Epic-Scope auf Pakete 1-32 aktualisiert; Statusdatei ist bewusst neu zu erstellen.                                                                                                                                                                                                                                                                                                                                       |
| 0A Production-Readiness                  | behalten             | Passt zum Codestatus: Webhooks, E2E, Engine-Verify, Secrets und Readiness sind echte Release-Gates.                                                                                                                                                                                                                                                                                                                      |
| 0B Datenarchitektur                      | neu ergänzt          | Schließt die größte Implementierungslücke: Persistenzvertrag, Migrationen, Backups, Restore, Audit-Export und Datenqualität.                                                                                                                                                                                                                                                                                             |
| 1 Citation Verification                  | behalten             | `src/lib/legal-grounding.ts` fehlt bewusst und ist als Extraktion aus bestehendem Analyse-Grounding zu bauen.                                                                                                                                                                                                                                                                                                            |
| 2 Source Registry                        | behalten             | Passt zu `judgements.ts`, Corpus und Sync-Routen; ergänzt fehlende Quellen-/Freshness-Schicht.                                                                                                                                                                                                                                                                                                                           |
| 3 Workflow Engine                        | behalten             | Code-Bausteine `approval.ts`, `realtime.ts`, `idempotency.ts` existieren; neues Workflow-Modell ist nötig.                                                                                                                                                                                                                                                                                                               |
| 4 Contract Review                        | behalten             | Redline Viewer, Playbooks, Clause Library, Version History und Comments existieren; Workspace-Integration fehlt.                                                                                                                                                                                                                                                                                                         |
| 5 Word Add-in                            | behalten             | `word-addin/` existiert; API-/Audit-/Grounding-Anbindung bleibt offen.                                                                                                                                                                                                                                                                                                                                                   |
| 5A Outlook Add-in                        | behalten             | `outlook-addin/`, E-Mail-Import und Parser existieren; Auth, Attachments, Audit und GoBD fehlen als Härtung.                                                                                                                                                                                                                                                                                                             |
| 6 CLM Light                              | behalten             | Signatur, DocuSign und Obligation-Extract existieren; Lifecycle-Modell/Portfolio-Status fehlt.                                                                                                                                                                                                                                                                                                                           |
| 7 Intake                                 | behalten             | Portal/WhatsApp/Client-Portal brauchen gemeinsames Intake-Modell; keine Doppelimplementierung mit Paket 18.                                                                                                                                                                                                                                                                                                              |
| 7A WhatsApp                              | behalten             | Sehr viel Code existiert; eigener Test-/Security-Strang ist berechtigt.                                                                                                                                                                                                                                                                                                                                                  |
| 8 Bulk Review                            | behalten             | Tabular Review und Due-Diligence existieren; defensible Review mit Sampling/Privilege/Exports fehlt.                                                                                                                                                                                                                                                                                                                     |
| 9 Matter Graph                           | behalten             | Graph-API existiert; Scope bleibt interner Matter Graph, nicht Litigation Analytics.                                                                                                                                                                                                                                                                                                                                     |
| 10 Governance                            | behalten             | Enterprise-Governance bleibt getrennt von Account-Security und AI-Security.                                                                                                                                                                                                                                                                                                                                              |
| 10A DACH Compliance                      | behalten             | GoBD, DATEV, beA, RVG, Fristen und Monitoring existieren; Härtung/Regressionstests bleiben nötig.                                                                                                                                                                                                                                                                                                                        |
| 11 Integration Marketplace               | behalten             | Connector-, DMS-, DocuSign-, DATEV- und beA-Bausteine existieren; Admin-/Diagnosefläche fehlt.                                                                                                                                                                                                                                                                                                                           |
| 12 UX Polishing                          | behalten             | Soll keine Businesslogik duplizieren; nur Vereinheitlichung, Navigation, Empty/Loading/Error States.                                                                                                                                                                                                                                                                                                                     |
| 13 Document Intelligence                 | behalten             | Upload/Validation/Virus-Scan existieren; OCR-/Extraction-Quality-Gate fehlt sichtbar.                                                                                                                                                                                                                                                                                                                                    |
| 13A AI Security                          | behalten             | Cross-cutting Security-Paket; nicht mit Paket 19 vermischen.                                                                                                                                                                                                                                                                                                                                                             |
| 14 AI Quality/Eval                       | behalten             | RAG-Eval existiert; muss Release-Gate statt optionaler Admin-Funktion werden.                                                                                                                                                                                                                                                                                                                                            |
| 15 Billing/Controlling                   | behalten             | Invoicing, RVG, Usage und Controlling existieren; Trust/Anderkonto/Spend-Control fehlen als Produktkette.                                                                                                                                                                                                                                                                                                                |
| 16 Mobile/PWA                            | behalten             | PWA/Capacitor/Offline-Bausteine existieren; Smoke Gate, Push und Mobile Capture fehlen.                                                                                                                                                                                                                                                                                                                                  |
| 17 Content-Partner                       | behalten             | Source Registry braucht später lizenz-/partnerfähige Adapter; keine Partner-Claims ohne Vertrag.                                                                                                                                                                                                                                                                                                                         |
| 18 Client Portal                         | behalten             | Portal-APIs und Tokens existieren; Security, DSGVO, Audit und Dokumentfreigabe müssen gehärtet werden.                                                                                                                                                                                                                                                                                                                   |
| 19 Auth Security                         | behalten             | Auth-Code ist umfangreich; zentrale Handler-Abdeckung und Regressionstests bleiben P0/P1.                                                                                                                                                                                                                                                                                                                                |
| 20 Practice Management Core              | behalten             | Viele Kernseiten/APIs existieren; zusammenhängender End-to-End-Teststrang fehlt.                                                                                                                                                                                                                                                                                                                                         |
| 21 Marketing Agent                       | behalten, aber P2    | Existiert im Code; nicht produktkritisch für Legal-AI-Kern, daher nachrangig.                                                                                                                                                                                                                                                                                                                                            |
| 22 Court Filing                          | behalten, korrigiert | Falscher `court-deadlines`-Pfad entfernt; echter beA/ERV-Versand nur nach Architektur-/Zertifizierungsentscheidung.                                                                                                                                                                                                                                                                                                      |
| 23 Legal Ethics                          | behalten, korrigiert | Falscher `src/lib/anonymize.ts`-Pfad ersetzt; Scope ist Berufsrecht/Privilege/AML, nicht allgemeine Security.                                                                                                                                                                                                                                                                                                            |
| 24 Litigation Analytics                  | behalten             | Ergänzt Matter Graph um aggregierte Strategie-Analytics; Source-/Sample-Warnungen sind Pflicht.                                                                                                                                                                                                                                                                                                                          |
| 25 Co-Editing                            | behalten             | Realtime/Comments/Version History existieren; echter Collaboration Room fehlt.                                                                                                                                                                                                                                                                                                                                           |
| 26 Migration                             | behalten             | Import-Kanzlei existiert; Migration Project mit Mapping/Dry Run/Cutover fehlt.                                                                                                                                                                                                                                                                                                                                           |
| 27 Accessibility                         | neu ergänzt          | a11y kommt im Plan bisher nur als fehlschlagender E2E-Test vor; BITV 2.0 / WCAG 2.2 / EAA 2025 brauchen ein eigenes Härtungspaket.                                                                                                                                                                                                                                                                                       |
| 28 Performance/Last                      | neu ergänzt          | Es gibt kein Load-/Stress-/Performance-Budget-Gate; Release 0 (Massenmarkt) verlangt messbare Performance.                                                                                                                                                                                                                                                                                                               |
| 29 Notification Center                   | neu ergänzt          | `/api/notifications/route.ts` existiert, ist aber keinem Paket zugeordnet; In-App-Benachrichtigungen (Fristen, Approvals, Portal, Workflow) sind ungeplant.                                                                                                                                                                                                                                                              |
| 30 Knowledge Management                  | neu ergänzt          | Online-Recherche zu Legal-KM zeigt: Precedent Bank, Best-Work-Curation, Matter Playbooks und After-Action Reviews sind ein eigener Wettbewerbsblock, nicht nur Suche.                                                                                                                                                                                                                                                    |
| 31 Kanzlei Superbrain                    | neu ergänzt          | Der zentrale Differenziator braucht ein eigenes Paket: legal context graph, permission-aware memory, matter context bundles, temporal facts, retrieval explanation und proactive gap detection.                                                                                                                                                                                                                          |
| 32 Legal Skill System / Brain-Governance | neu ergänzt          | Code-Verifikation: `server/` ist ein erweiterter GBrain-Fork (`engine.ts`, `pglite-/postgres-engine.ts`, `search/hybrid.ts`, `facts/`, `cycle.ts`, `minions/`, `skill-catalog.ts`, `check-resolvable.ts`) mit eigener Legal-Schicht (`server/src/core/legal/`, `schema-pack/base/gbrain-legal.yaml`). Skill-System und der selbstwartende Brain-Loop brauchen Authoring, Audit, Human-Oversight und Fork-Sync-Strategie. |

Verwaiste Dashboard-Seiten (existieren, waren keinem Paket zugeordnet — jetzt verankert):

- `src/app/dashboard/kollisionspruefung/` → Paket 20 (Practice Management, Konfliktprüfungs-UI) und Paket 23 (Ethics/Conflict).
- `src/app/dashboard/obligation-tracking/` → Paket 6 (CLM Light, Obligation-Tracking-UI).
- `src/app/dashboard/audit/` → Paket 10 (Governance, Audit-Viewer-UI über bestehender Hash-Chain) und Paket 0B.
- `src/app/dashboard/brain/`, `src/app/dashboard/query/`, `src/app/dashboard/analyze/` → Paket 31 (Kanzlei Superbrain / Context Graph), Paket 20 (Research/Assistant-Verbund) und Paket 1 (Citation Gate).
- `src/app/dashboard/precedent-search/`, `src/app/dashboard/clause-library/`, `src/app/dashboard/playbooks/`, `src/app/dashboard/agents/` → Paket 30 (interne Kanzlei-Wissensbank, Precedents, Best Work, Lessons Learned).

## Paket 0: Projekt-Setup und Ticketisierung

Priorität: P0  
Ziel: Aus diesem Plan ausführbare Tickets machen.

Tasks:

1. Erzeuge GitHub/Linear/Jira Epics für Pakete 1-32 (inkl. 5A, 7A, 10A, 13A, 27-32).
2. Lege pro Paket eine technische Spezifikation unter `docs/designs/` an.
3. Ergänze eine Statusseite `docs/audits/LEGAL_AI_IMPLEMENTATION_STATUS.md`.
4. Definiere globale Done-Kriterien:
   - Unit-Tests für Businesslogik.
   - API-Tests für neue Endpoints.
   - Playwright-Smoke für neue Dashboard-Flows.
   - Audit-Log-Eintrag für jede rechtsrelevante AI-Aktion.
   - Keine AI-Ausgabe ohne Attorney-Review-Hinweis, wenn Citation Gate nicht grün ist.

Akzeptanzkriterium:

- Jedes Paket hat Owner, Scope, Non-Scope, Testplan, Risiko und Release-Kriterium.

## Paket 0B: Datenarchitektur, Persistenz, Migrationen und Betriebsfähigkeit

Priorität: P0  
Ziel: Bevor neue Legal-OS-Modelle implementiert werden, muss klar sein, welche Daten als Brain-Page/Frontmatter, welche relational, welche als Dateiobjekt und welche als Audit-/Event-Log gespeichert werden.  
Code-Startpunkte: `src/lib/schema-init.ts`, `src/lib/migrate.ts`, `src/lib/legal-types.ts`, `src/lib/auth/store.ts`, `src/lib/audit.ts`, `src/app/api/data-export/backup/route.ts`, `src/app/api/data-export/gdpr/route.ts`, `server/src/core/migrate.ts`, `server/src/core/operations.ts`

Warum dieses Paket ergänzt wurde:

- Paket 1-26 definieren viele neue Modelle: Source Registry, Workflow Runs, Review Sets, Filing Packages, Ethics Labels, Litigation Analytics, Collaboration Rooms und Migration Projects.
- Ohne einheitlichen Persistenzvertrag entstehen doppelte Datenmodelle in Brain-Frontmatter, API-Types, Postgres/PGLite und Audit-Logs.
- Legal OS bedeutet: Daten müssen migrierbar, exportierbar, wiederherstellbar, beweisbar und mandantenisoliert sein.

Tasks:

1. Systemweiten Datenklassifikationsvertrag definieren:
   - Brain Page / Frontmatter.
   - relationale Tabelle.
   - Datei-/Blob-Objekt.
   - Event/Audit Log.
   - transienter AI-Run.
2. Modellkatalog für alle neuen Pakete erstellen:
   - `legal_source_registry`.
   - `workflow_run`, `workflow_step`, `workflow_artifact`, `workflow_approval`.
   - `review_set`.
   - `intake_request`.
   - `filing_package`.
   - `privilege_label`, `ethical_wall`, `aml_review`.
   - `litigation_analytics_profile`.
   - `collaboration_room`.
   - `migration_project`.
3. Migration-Strategie:
   - Root-App-Migrationen und `server/`-Migrationen trennen oder orchestrieren.
   - Backward-compatible Rollouts.
   - Rollback/repair path.
   - Fixtures für Demo/Testdaten.
4. Mandantenisolation:
   - org id / brain id / source id überall explizit.
   - keine Cross-Tenant-Leaks bei Suche, Export, Portal, DMS, Analytics.
   - Tests für Tenant Boundary.
5. Backup/Restore:
   - bestehende Backup-Route prüfen.
   - Restore-Test als Release-Gate.
   - Point-in-time-Anforderung dokumentieren.
   - Export aller Audit-/Legal-Artefakte.
6. Datenqualität:
   - required fields je Modell.
   - dedup keys.
   - referential integrity.
   - orphan detection.
   - migration validation reports.
7. Event- und Audit-Kontrakt:
   - jede rechtsrelevante Änderung erzeugt Audit.
   - Hash-/Versionierungsstrategie pro Dokument und AI-Artefakt.
   - Exportierbarer Evidence/Audit Bundle.
8. Observability:
   - strukturierte Logs.
   - Metriken für Jobs, OCR, AI, Syncs, Webhooks, Cron.
   - Alerting für Fristen, Filing, Webhook-Failures, Backup-Failures.

Akzeptanzkriterium:

- Für jedes neue Modell ist vor Implementierung entschieden: Speicherort, Migration, Tenant-Key, Audit-Events, Export/Restore-Verhalten, Testfixtures und Datenqualitätsregeln.

## Paket 0A: Production-Readiness Gate vor Massenmarkt

Priorität: P0  
Ziel: Die am 2026-06-20 geprüften Release-Blocker schließen, bevor Subsumio breit verkauft oder öffentlich als massenmarkt-ready gelauncht wird.  
Audit-Basis: Gesamt-Audit der Root-Next.js-App und `server/` GBrain-Engine-Schicht.

Aktueller Status aus Audit:

- Root-App: `bun run typecheck`, `bun run lint`, `bun run test:unit` und `bun run build` laufen durch.
- Root-E2E: `bun run test:e2e` ist nicht releasefähig; die Suite zeigte viele Failures/Timeouts, unter anderem `engine unreachable`, Mobile-Safari-Failures und Accessibility-Timeouts.
- Engine-Schicht: `server` typecheckt, aber `bun run verify` fällt mit 7/30 Checks durch.
- Worktree/Release-Kontrolle: Viele geänderte, gelöschte und untracked Dateien; kein sauberer Release-Stand.

Tasks:

1. Webhook-CSRF-Blocker beheben:
   - `src/middleware.ts` muss alle echten Provider-Webhooks von Browser-CSRF ausnehmen.
   - Betroffene Pfade mindestens: `/api/billing/webhook`, `/api/whatsapp/webhook`, `/api/email/webhook/resend`, `/api/docusign/webhook`.
   - Jeder Webhook muss danach weiterhin seine eigene Signatur/Auth prüfen.
2. Webhook-Tests ergänzen:
   - Stripe-Signature ohne CSRF-Header erreicht Route und wird bei falscher Signatur abgelehnt.
   - WhatsApp/Resend/DocuSign ohne CSRF-Header erreichen Route und prüfen Provider-Signatur.
3. Engine-Verify reparieren:
   - `cd server && bun run verify` muss grün sein.
   - Pfad-/Monorepo-Probleme in Checks wie `check:source-id-projection`, `check:batch-audit-site`, `check:worker-lock-renewal-shape` beheben.
   - Resolver-/Skill-Warnungen entweder beheben oder bewusst aus dem Release-Gate nehmen, wenn sie nicht produktrelevant sind.
4. E2E-Umgebung stabilisieren:
   - Playwright braucht entweder eine echte Test-Engine oder eine deterministische Mock-Engine.
   - Dashboard-Flows dürfen nicht an `engine unreachable` hängen.
   - Mobile Chrome/Safari und Accessibility-Projekte müssen stabil grün oder explizit aus einem kleineren Smoke-Gate ausgelagert sein.
5. CI-Branch- und Workspace-Layout vereinheitlichen:
   - Root-CI und Engine-CI dürfen nicht gemischt auf `main/develop` vs `master` zeigen.
   - Root-Next.js-Gates und `server/`-Engine-Gates getrennt oder bewusst orchestriert laufen lassen.
6. Secrets-at-rest konsequent machen:
   - TOTP-Secrets (`twoFactorSecret`, `pendingTwoFactorSecret`) verschlüsselt speichern.
   - DocuSign Access/Refresh Tokens verschlüsselt speichern.
   - API-Key-Verschlüsselung beibehalten und Regressionstests ergänzen.
7. Session-Revocation-Policy härten:
   - Edge-Revocation-Fail-Open bewusst entscheiden: fail-closed für Admin/Settings/Security oder dokumentierte 60s-Availability-Policy.
   - Test für revoked session in Middleware-geschützten Bereichen.
8. Healthcheck splitten:
   - `/api/health` als liveness ohne fremde Auth-Abhängigkeit.
   - `/api/readiness` mit Engine-API-Key/Headern, Auth-Store, optional DB/Queue.
   - Kein false-positive "ok", wenn Engine/DB für Produktflows nicht erreichbar sind.
9. Dependency-Audit schließen:
   - `npm audit --omit=dev` meldet aktuell 1 High in `undici`; Upgrade/Override prüfen und fixen.
   - Engine-Audit mit passendem Bun/npm-Lockfile-Workflow definieren.
10. Release-Cut herstellen:

- Dirty Worktree bereinigen.
- Gelöschte/verschobene Marketing- und Content-Routen bewusst dokumentieren.
- Vor Launch: Root-Gates, Engine-Gates, E2E-Smoke und Dependency-Audit alle grün.

11. **Environment-Validation pflicht** — `src/lib/env.ts` und `src/lib/env-validate.ts` (bestehend) müssen alle kritischen Env-Vars beim Start prüfen. Kein Start mit fehlendem `AUTH_SECRET`, `ENGINE_URL`, etc.
12. **Logger-Infrastruktur prüfen** — `src/lib/logger.ts` (bestehend) für strukturiertes Logging in allen API-Routen nutzen. Sentry-Integration (`src/instrumentation.ts`) validieren.
13. **Error-Handling-Infrastruktur prüfen** — `src/lib/errors.ts` (bestehend) mit `AppError`-Klasse. Alle API-Routen müssen `isAppError()` nutzen, keine naked `throw new Error()`.
14. **Cron-Auth härten** — `src/lib/cron-auth.ts` (bestehend) und `src/lib/cron-utils.ts` (bestehend) für alle Cron-Job-Routen (`/api/cron/`) verwenden. Kein ungeschützter Cron-Endpoint.

Akzeptanzkriterium:

- Subsumio gilt erst dann als massenmarkt-production-ready, wenn Root-App, Engine, Webhooks, E2E-Smoke, Dependency-Audit und Readiness-Checks reproduzierbar grün sind und sensible Tokens/Secrets verschlüsselt gespeichert werden.

## Paket 1: Systemweite Citation Verification

Priorität: P0  
Benchmark: Westlaw/CoCounsel, Lexis+ Protégé, vLex, Bloomberg Law  
Code-Startpunkte: `src/app/api/legal/analyze/route.ts`, `src/lib/judgements.ts`, `src/lib/api.ts`, `src/app/api/think/route.ts`, `src/lib/groundedness.ts` (bestehend), `src/lib/ai-act.ts` (bestehend)

Tasks:

1. **Bestehendes `src/lib/groundedness.ts` erweitern** — dort ist bereits `assessGroundedness()` mit `GroundLevel` (high/partial/low) und Badge-Logik. Das einheitliche Schema darauf aufbauen, nicht neu erfinden.
2. **Bestehendes `src/lib/ai-act.ts` integrieren** — `AI_NOTICE`, `AI_BADGE_LABEL`, `AI_FRONTMATTER` sind bereits definiert für EU AI Act Art. 50. In das Citation Gate einbinden.
3. Extrahiere Grounding aus `src/app/api/legal/analyze/route.ts` in `src/lib/legal-grounding.ts`.
4. Baue ein einheitliches Schema:
   - `citations[]`
   - `unverified_citations[]`
   - `source_snippets[]`
   - `grounding_status: verified | partial | unverified`
   - `requires_attorney_review: boolean`
5. Integriere das Schema in:
   - `/api/think`
   - `/api/legal/memo`
   - `/api/legal/contract-draft`
   - `/api/legal/contract-redline`
   - `/api/legal/document-review`
   - `/api/legal/precedent-search`
   - `/api/legal/risk-analysis`
   - `/api/legal/translate` (bestehend, bisher ohne Grounding)
   - `/api/legal/anonymize` (bestehend, bisher ohne Grounding)
   - `/api/legal/case-scanner` (bestehend, bisher ohne Grounding)
   - `/api/legal/summarize` (bestehend, bisher ohne Grounding)
   - `/api/legal/due-diligence` (bestehend, AI-Output ohne Grounding)
   - `/api/legal/tabular-review` (bestehend, AI-Output ohne Grounding)
   - `/api/legal/ai-deadlines` (bestehend, AI-Output ohne Grounding)
6. UI-Badges in Research, Assistant, Drafting, Contracts und Memo anzeigen — bestehende `CitationLink`-Komponente (`src/components/legal/CitationLink.tsx`) als Basis verwenden.
7. Blockiere "final/export/share"-Aktionen optional, wenn `grounding_status=unverified`.
8. **Prompt-Sanitizer pflicht** — `src/lib/prompt-sanitizer.ts` (bestehend) für alle AI-Endpunkte aktivieren, nicht nur für ausgewählte.
9. Testfixtures:
   - korrekte Norm
   - erfundene Norm
   - falscher Paragraph
   - echte Judikaturquelle
   - gemischte Quellen

Akzeptanzkriterium:

- Kein zentraler Legal-AI-Endpoint kann eine Antwort ohne Grounding-Metadaten zurückgeben.

## Paket 2: Source Registry und Rechtsdaten-Freshness

Priorität: P0/P1  
Benchmark: Noxtua/Beck/MANZ, Lexis, TR, vLex  
Code-Startpunkte: `src/lib/judgements.ts`, `law-corpus/`, `law-corpus-split/`, `src/app/api/legal/judgements-sync/route.ts`

Tasks:

1. Neues Modell `legal_source_registry`:
   - source id
   - jurisdiction
   - license/status
   - last sync
   - freshness
   - authority tier
2. Dashboard-Seite oder Panel in Research: Quellenstatus.
3. Sync-Jobs für RIS/OpenLegalData/OpenCaseLaw sichtbarer machen.
4. Corpus-Diff-Log: was wurde seit letztem Sync geändert?
5. Optionaler Adapter-Layer für kommerzielle Quellen vorbereiten.

Akzeptanzkriterium:

- Jede Research-Antwort kann anzeigen, aus welchen Quellen und welchem Stand sie stammt.

## Paket 3: Agentic Workflow Engine

Priorität: P0  
Benchmark: Legora Agent, Leah, Filevine LOIS, Clio Manage AI  
Code-Startpunkte: `src/app/dashboard/agents`, `src/app/api/agents`, `src/app/api/agent-templates/` (bestehend), `src/lib/permissions.ts`, `src/lib/audit.ts`, `src/lib/approval.ts` (bestehend), `src/lib/realtime.ts` (bestehend), `src/lib/idempotency.ts` (bestehend)

Tasks:

1. Neues Datenmodell:
   - `workflow_run`
   - `workflow_step`
   - `workflow_artifact`
   - `workflow_approval`
2. Neue Dashboard-Seite `/dashboard/workflows`.
3. Workflow Runner:
   - geplant
   - läuft
   - wartet auf Freigabe
   - fehlgeschlagen
   - abgeschlossen
4. **Bestehendes Approval-System erweitern** — `src/lib/approval.ts` definiert bereits `AgentActionFrontmatter`, `ActionType` (document_finalize, deadline_create, booking_create, message_send), `REQUIRES_APPROVAL`-Set. Darauf aufbauen, nicht neu anlegen.
5. **Bestehende Agent-Templates nutzen** — `src/app/api/agent-templates/` hat bereits CRUD für Templates. Workflow-Templates als neuen Typ dort integrieren.
6. **Realtime/SSE für Live-Updates** — `src/lib/realtime.ts` und `/api/realtime/sse` existieren. Workflow-Status-Änderungen und Approval-Updates darüber pushen.
7. **Idempotency für Workflow-Steps** — `src/lib/idempotency.ts` (bestehend) für jeden Step-Runner verwenden, um Double-Execution bei Retries zu verhindern.
8. Audit pro Step — bestehende `logAudit()` mit SHA-256-Hash-Chain (`src/lib/audit.ts`) verwenden.
9. Rollenrechte aus `src/lib/permissions.ts` erzwingen — bestehende `can()`-Funktion und `RouteAction`-System erweitern.
10. Erste Templates:

- Neue Akte aus Intake
- Vertrag prüfen
- Klageentwurf vorbereiten
- Fristen aus Dokument extrahieren
- Rechnung aus Zeiterfassung vorbereiten

Akzeptanzkriterium:

- Ein User kann einen Workflow starten, Zwischenschritte sehen, AI-Artefakte prüfen und Freigaben erteilen.

## Paket 4: Contract Review Workspace

Priorität: P0  
Benchmark: Spellbook, DraftWise, Luminance, GC AI, LegalOn  
Code-Startpunkte: `src/app/dashboard/contracts/page.tsx`, `src/app/api/legal/contract-redline/route.ts`, `src/app/dashboard/playbooks` (bestehend, 26KB), `src/app/dashboard/clause-library` (bestehend, 11KB), `src/components/contract-redline-viewer.tsx` (bestehend, 15KB), `src/components/legal/CommentThread.tsx` (bestehend), `src/app/dashboard/version-history/page.tsx` (bestehend), `src/app/api/legal/playbooks/` (bestehend)

Tasks:

1. **Bestehenden Contract Redline Viewer erweitern** — `src/components/contract-redline-viewer.tsx` (15KB) existiert bereits. Side-by-side Diff darauf aufbauen:
   - Original
   - Gegenentwurf
   - AI-Vorschlag
2. **Bestehende Playbook-API nutzen** — `src/app/api/legal/playbooks/` hat bereits CRUD. Playbook-Integration nicht neu bauen, sondern erweitern.
3. **Bestehende Clause Library erweitern** — `src/app/dashboard/clause-library/page.tsx` (11KB) existiert. CRUD-Funktionalität daraus ableiten.
4. **Bestehende Version History verknüpfen** — `src/app/dashboard/version-history/page.tsx` (9KB) existiert. Mit Contract Review verbinden.
5. **Bestehende Comment-Threads integrieren** — `src/components/legal/CommentThread.tsx` und `src/lib/comments.ts` (11KB) für kollaborative Clause-Level-Diskussionen verwenden.
6. Clause Annotation Model:
   - clause id
   - risk level
   - issue
   - playbook rule
   - fallback clause
   - source/rationale
   - accepted/rejected
7. Playbook-Integration:
   - rule -> annotation
   - fallback -> redline
8. Version History (bestehend erweitern):
   - document version
   - accepted changes
   - rejected changes
   - reviewer
9. **Undo/Redo für Redlining** — Clause-Level-Änderungen müssen rückgängig machbar sein (berufsrechtliche Sorgfaltspflicht).
10. Export:

- DOCX/Word Add-in round-trip
- PDF/CSV review report

Akzeptanzkriterium:

- Ein Vertrag kann vollständig geprüft, clause-level redlined, versioniert und exportiert werden.

## Paket 5: Word Add-in als Hauptarbeitsfläche

Priorität: P1  
Benchmark: Spellbook, Legora, DraftWise, GC AI  
Code-Startpunkte: `word-addin/`, `src/app/dashboard/word-addin/page.tsx`, Contract Review APIs

Tasks:

1. Add-in mit Login/Token verbinden.
2. Aus Word markierte Klausel an Contract Review senden.
3. Redline/Kommentar direkt in Word einfügen.
4. Playbook-Auswahl im Add-in.
5. Citation/Grounding-Badges im Add-in anzeigen.
6. Telemetrie/Audit an Subsumio zurückschreiben.

Akzeptanzkriterium:

- Anwalt kann in Word bleiben und Subsumio Review, Redline und Clause Suggestions nutzen.

## Paket 5A: Outlook Add-in — E-Mail-zu-Akte-Workflow

Priorität: P1  
Benchmark: Clio Outlook Integration, NetDocuments Outlook Plugin, iManage Work  
Code-Startpunkte: `outlook-addin/` (bestehend, 269 Zeilen Taskpane), `outlook-addin/src/taskpane.ts`, `src/app/api/email-import/` (bestehend), `src/lib/email/mailbox.ts` (bestehend), `src/lib/email-parser.ts` (bestehend, 7KB)

Warum dieses Paket ergänzt wurde:

- Das Outlook Add-in existiert bereits mit Mail-Import und Brain-Query, ist aber nicht in den Plan integriert.
- E-Mail ist der primäre Kommunikationskanal für Anwälte — E-Mail-zu-Akte ist ein kritischer Daily-Workflow.
- Das Add-in hat bereits Mode-Auswahl (conservative/balanced/tokenmax) und Case-Suggestion-Logic.

Tasks:

1. **Bestehenden Outlook Add-in härten** — `outlook-addin/src/taskpane.ts` hat bereits Connect, Mail-Import, Brain-Query. Auth-Flow mit API-Key-Management (`src/lib/api-keys.ts`) verbinden.
2. E-Mail-Import über `src/app/api/email-import/` und `src/lib/email-parser.ts` erweitern:
   - Anlagen extrahieren und als Dokumente zur Akte hinzufügen.
   - Metadaten (Absender, Datum, Betreff) als Brain-Page-Frontmatter speichern.
   - Kollisionsprüfung gegen Absender/Mandant.
3. Brain-Query im Add-in mit Citation Gate (Paket 1) verbinden.
4. Citation/Grounding-Badges im Add-in anzeigen.
5. Audit-Telemetrie an Subsumio zurückschreiben — `src/lib/audit.ts` verwenden.
6. E-Mail-Archivierung mit GoBD-Hash (`src/lib/gobd.ts`) versehen.
7. Sichere Token-Speicherung — nicht hardcoded `API_BASE`, sondern über `src/lib/api-key-store.ts` mit Verschlüsselung.

Akzeptanzkriterium:

- Ein Anwalt kann aus Outlook heraus E-Mails mit Anlagen in die richtige Akte importieren, Brain-Queries stellen und Audit-Trail erhalten — ohne den Browser zu öffnen.

## Paket 6: Kanzlei-CLM Light

Priorität: P1  
Benchmark: Ironclad, Icertis, Evisort, Sirion, SpotDraft  
Code-Startpunkte: `src/app/dashboard/contracts`, `src/app/dashboard/signature`, `src/app/api/docusign`, `src/app/api/legal/obligation-extract`

Tasks:

1. Contract Lifecycle Status:
   - request
   - draft
   - review
   - approved
   - sent
   - signed
   - active
   - renewal
   - terminated
2. Intake-to-contract request.
3. Approval routing.
4. DocuSign envelope link.
5. Post-signature obligation extraction.
6. Renewal/termination reminders.
7. Contract portfolio dashboard:
   - risk
   - renewals
   - obligations
   - counterparty exposure

Akzeptanzkriterium:

- Ein Vertrag kann von Anfrage bis Signatur und Obligation-Tracking durch Subsumio laufen.

## Paket 7: Intake und AI Legal Secretary

Priorität: P1  
Benchmark: JUPUS, LawDroid, Smith.ai, Eve, EvenUp  
Code-Startpunkte: `src/app/dashboard/client-portal`, `src/app/api/portal`, `src/lib/legal-chat/actions.ts`, WhatsApp routes

Tasks:

1. Gemeinsames Modell `intake_request`.
2. Öffentliche Intake-Formulare pro Rechtsgebiet.
3. WhatsApp/Portal/Web Intake in ein Modell mappen.
4. Auto-Kollisionsprüfung.
5. Auto-Akte als Draft.
6. Dokumentencheckliste.
7. Erstantwort-Entwurf mit Human Approval.
8. RVG-/Kosten-Erstschätzung.

Akzeptanzkriterium:

- Ein Mandant kann digital anfragen, Subsumio triagiert, prüft Konflikt, erstellt eine Akte im Entwurf und schlägt nächste Schritte vor.

## Paket 7A: WhatsApp Legal Chat Härtung

Priorität: P1  
Benchmark: JUPUS WhatsApp, LawDroid, Smith.ai, Eve  
Code-Startpunkte: `src/lib/legal-chat/actions.ts` (bestehend, 1839 Zeilen, 25+ ParsedIntents), `src/lib/whatsapp/` (bestehend, 9 Module), `src/app/api/whatsapp/` (bestehend, 4 Endpoints), `src/app/dashboard/whatsapp/` (bestehend)

Warum dieses Paket ergänzt wurde:

- Der WhatsApp Legal Chat ist das ausgereifteste Mobile-Feature mit 25+ Intents (Fristen, RVG, Aktenanlage, Konfliktprüfung, Zeiterfassung, Auslagen, Notizen, Rechnungen, Brain-Queries, Case-Management).
- Es ist nur lose in Paket 7 (Intake) erwähnt, hat aber eigene Härungs- und Quality-Bedarfe.
- WhatsApp ist in DACH-Kanzleien ein primärer Mandantenkanal.

Tasks:

1. **Intent-Parsing-Qualität sichern** — `ParsedIntent` in `src/lib/legal-chat/actions.ts` hat 25+ Varianten. Unit-Tests für jeden Intent-Typ:
   - `time_entry`, `expense`, `case_note`, `deadline`, `rvg_calc`, `deadline_calc`
   - `conflict_check`, `create_case`, `create_client`, `create_invoice`, `close_case`
   - `list_cases`, `list_tasks`, `list_deadlines`, `today`, `case_summary`
   - `brain_query`, `search`, `financial_overview`, `case_activity`
   - `mark_done`, `document_fetch`, `case_lookup`
   - `help`, `confirm`, `cancel`, `free_text`, `unknown`
2. **Citation Gate für Brain-Query-Intents** — `brain_query` und `search` Intents müssen Grounding-Metadaten zurückgeben (Paket 1).
3. **Konfliktprüfung-Integration vertiefen** — `conflict_check` Intent mit `src/app/api/legal/conflict-check/` und Matter Graph (Paket 9) verbinden.
4. **RVG-/Fristen-Antworten mit Citation Gate** — `rvg_calc` und `deadline_calc` müssen Quellen angeben (RVG-Tabellen, Fristenregeln).
5. **Rate-Limiting und Abuse-Schutz** — bestehendes `src/lib/rate-limit-api.ts` und `src/lib/auth/rate-limit.ts` für WhatsApp-Endpunkte verschärfen.
6. **Audit-Trail für alle WhatsApp-Aktionen** — jeder Intent-Ergebnis muss über `src/lib/audit.ts` geloggt werden.
7. **WhatsApp Flow Endpoints härten** — `src/lib/whatsapp/flow-crypto.ts`, `flow-send.ts`, `flow-definitions.ts` (bestehend) für Flow-Forms (Intake, Kostenrechner) nutzen.
8. **Media-Handling härten** — `src/lib/whatsapp/media.ts` (bestehend) mit Virus-Scan (`src/lib/virus-scan.ts`) verbinden.
9. **Dedup-Queue prüfen** — `src/lib/whatsapp/dedup.ts` (bestehend) für Idempotency bei Webhook-Retrys.

Akzeptanzkriterium:

- WhatsApp Legal Chat ist getestet, auditierbar, rate-limited und alle AI-Antworten haben Citation/Grounding-Metadaten. Media-Uploads werden gescannt.

## Paket 8: Defensible Bulk Review und Due Diligence

Priorität: P1  
Benchmark: Relativity aiR, Everlaw, DISCO Cecilia, Reveal, Kira  
Code-Startpunkte: `src/app/dashboard/tabular-review`, `src/app/api/legal/tabular-review`, `src/app/api/legal/due-diligence`

Tasks:

1. Neues Modell `review_set`.
2. Dokumentauswahl und Fragen/Issues.
3. Issue Coding pro Dokument.
4. Hot Docs und Key Facts.
5. Privilege/Sensitivity Flags.
6. Human validation sample.
7. Precision/Recall-Schätzung.
8. Exporte:
   - CSV
   - PDF Report
   - Privilege Log
   - JSON Audit

Akzeptanzkriterium:

- Bulk Review ist nicht nur Tabelle, sondern defensible Review mit Nachvollziehbarkeit und Qualitätsmetriken.

## Paket 9: Matter Graph und Similar Cases

Priorität: P2  
Benchmark: Filevine LOIS, Bloomberg Litigation Analytics, vLex  
Code-Startpunkte: `src/app/dashboard/graph`, `src/app/api/graph`, GBrain relationale Suche

Tasks:

1. Matter Graph Typen:
   - client
   - opponent
   - court
   - judge
   - contract
   - deadline
   - invoice
   - evidence
   - citation
2. Similar Case Finder:
   - gleiche Rechtsgebiete
   - gleiche Gegner
   - ähnliche Fakten
   - ähnliche Normen
3. Konfliktprüfung gegen Graph erweitern.
4. Timeline aus Matter Graph erzeugen.

Akzeptanzkriterium:

- Subsumio kann ähnliche Akten, relevante Gegner/Kontakte und potenzielle Konflikte graphbasiert erklären.

## Paket 10: Governance, Security und Enterprise Readiness

Priorität: P1/P2  
Benchmark: Noxtua, Relativity, CLM Enterprise Anbieter  
Code-Startpunkte: `src/lib/permissions.ts`, `src/lib/audit.ts` (bestehend, mit SHA-256-Hash-Chain), `src/app/dashboard/settings`, `src/app/api/scim` (bestehend, SCIM 2.0), `src/lib/scim.ts` (bestehend, 742 Zeilen), `src/lib/workos.ts` (bestehend SSO), `src/lib/ai-act.ts` (bestehend), `src/app/api/data-export/gdpr/` (bestehend), `src/app/api/settings/gdpr/` (bestehend), `src/app/api/cron/retention/` (bestehend), `src/lib/model-config.ts` (bestehend), `src/app/dashboard/settings/security/` (bestehend), `src/app/dashboard/settings/scim/` (bestehend), `src/app/dashboard/compliance/` (bestehend)

Tasks:

1. Matter/document-level permissions zusätzlich zu Rollen.
2. AI Provider Policy — auf `src/lib/model-config.ts` aufbauen, das bereits `AI_MODELS` mit Provider, Capabilities und `brainScoped` definiert:
   - erlaubte Modelle (Whitelist aus `AI_MODELS`)
   - EU-only (Mistral + ZeroEntropy bereits als European-markiert)
   - zero-retention
   - no training
3. AI Act Inventory — auf `src/lib/ai-act.ts` aufbauen, das bereits `AI_NOTICE`, `AI_BADGE_LABEL`, `AI_FRONTMATTER` definiert:
   - Feature
   - Zweck
   - Risiko
   - Human oversight
   - Logs
4. AI Management System vorbereiten:
   - ISO/IEC 42001 Mapping.
   - AI-System-Inventar.
   - Risikobewertung je AI-Feature.
   - Rollen/Verantwortlichkeiten.
   - Monitoring und Incident-Prozess.
   - Nachweisführung für Enterprise-Kunden.
5. **Retention Policy — bestehenden Cron-Job erweitern** — `src/app/api/cron/retention/route.ts` existiert. Pro Dokumenttyp konfigurierbare Aufbewahrungsfristen darauf aufbauen.
6. Legal Hold — bestehendes `src/app/dashboard/compliance/retention/` erweitern.
7. **Audit anomaly detection — auf bestehender Hash-Chain aufbauen** — `src/lib/audit.ts` implementiert bereits SHA-256-Hash-Chain für Tamper-Evidence. Anomaly-Detection als Analyse-Layer darüber legen.
8. Admin Security Dashboard — bestehendes `src/app/dashboard/settings/security/` erweitern.
9. **GDPR Data Export / Deletion härten** — `src/app/api/data-export/gdpr/route.ts` und `src/app/api/settings/gdpr/data-deletion/route.ts` existieren. Vollständigkeit prüfen, Regressionstests ergänzen.
10. **SSO/WorkOS-Integration prüfen** — `src/lib/workos.ts` und `src/app/api/auth/sso/` existieren. Enterprise-SSO-Readiness sicherstellen.
11. **API-Key-Management härten** — `src/lib/api-keys.ts`, `src/lib/api-key-store.ts` (mit Verschlüsselung), `src/app/dashboard/api-keys/` existieren. Rotation, Scoping und Audit ergänzen.

Akzeptanzkriterium:

- Enterprise-Kunden können nachvollziehen und steuern, welche AI wo mit welchen Daten arbeitet.

## Paket 10A: DACH-Compliance Härtung

Priorität: P1  
Benchmark: DATEV-Anbindung, beA-Integration, GoBD-Verfahrensdoku, RVG-Systeme  
Code-Startpunkte: `src/lib/gobd.ts` (bestehend), `src/lib/gobd-verfahrensdoku.ts` (bestehend, 5KB), `src/app/dashboard/verfahrensdoku/` (bestehend, 14KB), `src/app/dashboard/datev-export/` (bestehend, 15KB), `src/app/dashboard/bea/` (bestehend, 15KB), `src/app/api/cron/retention/` (bestehend), `src/lib/rvg.ts` (bestehend), `src/app/dashboard/cost-calculator/` (bestehend, 11KB), `src/app/dashboard/controlling/` (bestehend, 10KB), `src/components/gobd-integrity-panel.tsx` (bestehend), `src/lib/legal-deadlines.ts` (bestehend, 505 Zeilen), `src/lib/regulatory-monitors.ts` (bestehend, 285 Zeilen), `src/app/dashboard/monitoring/` (bestehend, 38KB), `src/app/dashboard/compliance/` (bestehend)

Warum dieses Paket ergänzt wurde:

- DACH-Compliance ist der primäre Differentiator von Subsumio. GoBD, DATEV, beA, RVG und Fristenberechnung existieren als Code, sind aber nicht als Release-Strang gehärtet.
- Regulatory Monitoring und Case Scanner sind bedeutende Features (285 + 38KB), die komplett fehlen im Plan.
- Legal Translation und Anonymization existieren, sind aber nicht DACH-Compliance-integriert.

Tasks:

1. **GoBD-Verfahrensdokumentation validieren** — `src/lib/gobd-verfahrensdoku.ts` und `src/app/dashboard/verfahrensdoku/` existieren. Verfahrensdoku-Vollständigkeit prüfen, Export-Fähigkeit sicherstellen, Regressionstests ergänzen.
2. **GoBD-Integrity Panel härten** — `src/components/gobd-integrity-panel.tsx` (bestehend) in Compliance-Dashboard integrieren.
3. **DATEV-Export-Regressionstests** — `src/app/dashboard/datev-export/` (15KB) existiert. Export-Format-Tests mit echten DATEV-Szenarien.
4. **beA-Integration prüfen** — `src/app/dashboard/bea/` (15KB) existiert. Aktuellen Import-/Entwurfs-/Export-Flow testen; echter Versand bleibt Paket 22 und ist ohne zertifizierten/partnerfähigen Versandweg nicht zu claimen.
5. **RVG-Kostenberechnung härten** — `src/lib/rvg.ts` (bestehend) und `src/app/dashboard/cost-calculator/` (11KB). Randwerte testen, Streitwert-Progression, MwSt.
6. **Fristenberechnung Regressionstests** — `src/lib/legal-deadlines.ts` (505 Zeilen, DE/AT/CH) hat bereits Tests. Edge-Cases: Feiertagsverschiebung, Monatsende, Bundesland/Kanton-spezifisch.
7. **Regulatory Monitoring härten** — `src/lib/regulatory-monitors.ts` (285 Zeilen) und `src/app/dashboard/monitoring/` (38KB) existieren. Monitor-Definitionen, Alert-Generierung, Cron-Ausführung testen.
8. **Case Scanner prüfen** — `src/app/api/legal/case-scanner/` und `src/app/api/cron/case-scanner/` (bestehend). Evidence-Threshold, Look-Ahead, Cron-Stabilität.
9. **Legal Translation DACH-spezifisch** — `src/app/api/legal/translate/` (bestehend) für juristische Fachterminologie DE/AT/CH testen.
10. **Legal Anonymization GDPR-konform** — `src/app/api/legal/anonymize/` (bestehend) für DSGVO-konforme Anonymisierung testen.
11. **Retention Cron mit Legal Hold verbinden** — `src/app/api/cron/retention/` (bestehend) mit Legal Hold (Paket 10) integrieren.

Akzeptanzkriterium:

- GoBD-Verfahrensdoku, DATEV-Export, beA-Import/Entwurf/Export, RVG-Berechnung, Fristenberechnung, Regulatory Monitoring und Legal Translation sind regressionstest-gesichert und in das Compliance-Dashboard integriert.

## Paket 11: Integration Marketplace

Priorität: P2  
Benchmark: Clio, Microsoft 365, iManage, NetDocuments  
Code-Startpunkte: `src/app/dashboard/connectors`, `src/app/api/connectors`, `src/lib/dms/` (bestehend, iManage + NetDocuments), `src/app/dashboard/bea/` (bestehend, 14KB), `src/app/dashboard/datev-export/` (bestehend, 15KB), `src/app/api/docusign/` (bestehend, 6 Endpoints), `src/lib/docusign.ts` (bestehend, 305 Zeilen), `src/lib/email/mailbox.ts` (bestehend), `outlook-addin/` (bestehend)

Tasks:

1. Connector Registry mit Status, Auth, Scope, Last Sync.
2. Admin-Diagnose pro Connector.
3. Two-way sync Roadmap:
   - Outlook Calendar
   - Google Calendar
   - iManage — bestehenden `src/lib/dms/imanager.ts` nutzen
   - NetDocuments — bestehenden `src/lib/dms/netdocuments.ts` nutzen
   - DATEV — bestehenden `src/app/dashboard/datev-export/` erweitern
   - beA — bestehenden `src/app/dashboard/bea/` erweitern
   - DocuSign — bestehenden `src/lib/docusign.ts` und `/api/docusign/` erweitern
4. Connector Marketplace UI.
5. **Retry Queue — bestehendes `src/lib/retry.ts` nutzen** — `withRetry()` existiert bereits. Connector-spezifische Retry-Strategien darauf aufbauen.
6. **Idempotency für Connector-Syncs** — `src/lib/idempotency.ts` (bestehend) für jeden Sync-Job verwenden.

Akzeptanzkriterium:

- Integrationen sind nicht nur Buttons, sondern administrierbare, diagnostizierbare Produktflächen.

## Paket 12: UX Polishing und Produktvereinheitlichung

Priorität: P1/P2  
Ziel: Aus vielen guten Einzelmodulen ein geführtes Premium-Produkt machen.

Tasks:

1. Dashboard in "Heute", "Akten", "Workflows", "Research", "Verträge", "Admin" vereinfachen.
2. Jede Seite bekommt:
   - Empty State — bestehende `src/components/dashboard/empty-state.tsx` nutzen
   - Loading State — bestehende `src/components/dashboard/skeleton.tsx` nutzen
   - Error State — bestehende `error.tsx`-Pattern pro Route nutzen
   - Audit/Export affordance
   - Keyboard path
3. **Command Palette erweitern** — `src/components/dashboard/command-palette.tsx` (20KB) existiert bereits. Mit echter Brain-/Matter-Suche verbinden.
4. Saved Views und Filter Presets — `src/components/dashboard/filter-chip.tsx` (bestehend) als Basis.
5. Einheitliche Risk/Citation/Review Badges — `src/lib/groundedness.ts` Badge-Klassen und `src/lib/status-colors.ts` (bestehend) vereinheitlichen.
6. **Industry Packs / Verticals integrieren** — `src/lib/industry-pack.ts` und `src/lib/industry-theme.ts` (bestehend) für branchenspezifische Dashboard-Personalisierung nutzen.
7. **Import Kanzlei-Flow prüfen** — `src/app/dashboard/import-kanzlei/page.tsx` (bestehend, 12KB) in Onboarding-Flow integrieren.

Akzeptanzkriterium:

- Ein neuer Anwalt versteht innerhalb von 10 Minuten, wie er von Akte zu fertigem Ergebnis kommt.

## Paket 13: Document Intelligence, OCR und Large-File Ingestion

Priorität: P0/P1  
Benchmark: Harvey Document Management, EvenUp/Supio document intelligence, Filevine DMS, eDiscovery vendors  
Code-Startpunkte: `src/app/api/upload/route.ts`, `src/lib/upload-validation.ts`, `src/lib/virus-scan.ts`, `server/src/core/extract-document.ts`, `server/skills/document-ingest/SKILL.md`

Warum dieses Paket ergänzt wurde:

- Der Web-Upload ist aktuell auf 50 MB begrenzt und leitet Dateien nach Virenscan an die Engine weiter.
- Die Engine/Skills kennen OCR-Fallbacks, aber die Web-App hat noch kein sichtbares OCR-/Extraction-Quality-Gate.
- Legal-AI ohne zuverlässige OCR ist bei gescannten PDFs, Faxen, Bildern, Anlagenkonvoluten und Kanzlei-Altakten nicht konkurrenzfähig.

Tasks:

1. Upload Pipeline erweitern:
   - Chunked/resumable upload für große PDFs und ZIP-/Ordnerimporte.
   - Upload-Session-Modell mit Status: received, scanned, extracting, ocr, indexed, failed.
   - Duplicate Detection über SHA-256 vor Speicherung/Analyse.
2. OCR/Extraction Status sichtbar machen:
   - Text Layer erkannt.
   - OCR erforderlich.
   - OCR abgeschlossen.
   - OCR confidence.
   - Seiten mit geringer Qualität markieren.
3. Document Classification:
   - Vertrag
   - Schriftsatz
   - Urteil
   - Bescheid
   - Rechnung
   - Korrespondenz
   - Beweis/Anlage
4. Bates-/Anlagenfähigkeit vorbereiten:
   - Seiten-/Anlagen-ID.
   - Seitenreferenzen in Zitaten.
   - Exportierbare Anlagenliste.
5. Extraction Regression Tests:
   - PDF mit Text Layer.
   - gescanntes PDF.
   - Bild/TIFF.
   - beschädigte Datei.
   - sehr große Datei.
6. UI:
   - Upload Queue.
   - Extraction Errors.
   - "Nicht durchsuchbar" Warnung.
   - Re-run OCR.

Akzeptanzkriterium:

- Kein hochgeladenes Rechtsdokument verschwindet als undurchsuchbare Binary-Datei; jedes Dokument hat Extraction-/OCR-Status, Hash, Klassifikation und nachvollziehbare Indexierungsqualität.

## Paket 14: AI Quality, Evaluation und Hallucination Governance

Priorität: P0/P1  
Benchmark: Stanford Legal RAG Hallucination Studien, Relativity validation workflows, enterprise Legal-AI procurement  
Code-Startpunkte: `src/lib/rag-eval.ts`, `src/app/api/rag-eval/route.ts`, `src/lib/groundedness.ts`, `src/lib/ai-act.ts`, `server/docs/eval/`, `server/src/core/eval*`

Warum dieses Paket ergänzt wurde:

- Citation Verification ist notwendig, aber nicht ausreichend. Legal-AI-Anbieter werden an messbarer Qualität, Wiederholbarkeit und menschlicher Review-Fähigkeit gemessen.
- Es existieren bereits RAG-Eval, Groundedness und AI-Act-Bausteine, aber sie sind noch kein zentrales Release-Gate.

Tasks:

1. Eval-Gate definieren:
   - Retrieval Precision@K.
   - Recall@K.
   - MRR.
   - Citation verification rate.
   - Unsupported claim rate.
   - False citation rate.
   - Deadline calculation accuracy.
   - Contract issue detection precision/recall.
2. `src/lib/rag-eval.ts` bereinigen:
   - doppelte `EvalQuery` Definition entfernen.
   - Fixtures versionieren.
   - Jurisdiction-Fixtures für DE/AT/CH trennen.
3. Goldensets bauen:
   - Normenfragen.
   - Fristen.
   - Vertragsklauseln.
   - Schriftsatz-/Memo-Fragen.
   - Bulk-review issue coding.
4. Eval-Dashboard:
   - letzte Runs.
   - Regressionen.
   - Schwellenwerte.
   - Export für Enterprise-Kunden.
5. Human Review Feedback:
   - Anwalt markiert AI-Antwort als korrekt/falsch/unvollständig.
   - Feedback fließt in Eval-Fälle oder Review Queue.
6. Release Gate:
   - Kein Release mit sinkender Citation Verification Rate.
   - Kein Release mit kritischer Deadline-/Normen-Regression.

Akzeptanzkriterium:

- Subsumio kann vor jedem Release beweisen, dass Legal-RAG, Fristen, Citation Gate und Vertragsreview nicht regressieren.

## Paket 13A: AI Security, Prompt Injection Defense und Upload Safety

Priorität: P0/P1  
Benchmark: OWASP LLM Top 10, NIST AI RMF, enterprise AI security procurement  
Code-Startpunkte: `src/lib/prompt-sanitizer.ts` (bestehend), `src/lib/virus-scan.ts` (bestehend, 6KB), `src/lib/upload-validation.ts` (bestehend), `src/app/api/upload/route.ts` (bestehend), `src/lib/sanitize-html.ts` (bestehend), `src/lib/encryption.ts` (bestehend), `src/lib/idempotency.ts` (bestehend)

Warum dieses Paket ergänzt wurde:

- AI-Security ist eine Querschnittsanforderung, die in keinem einzelnen Paket aufgeht.
- Prompt-Sanitizer, Virus-Scan und Upload-Validation existieren, sind aber nicht systemweit durchgesetzt.
- Jedes Paket, das AI-Output erzeugt oder Dateien akzeptiert, muss diese Bausteine nutzen.

Tasks:

1. **Prompt-Sanitizer für alle AI-Endpunkte pflicht** — `src/lib/prompt-sanitizer.ts` (bestehend) muss in jedem AI-Route-Handler ausgeführt werden:
   - `/api/think`
   - `/api/legal/analyze`
   - `/api/legal/memo`
   - `/api/legal/contract-draft`
   - `/api/legal/contract-redline`
   - `/api/legal/document-review`
   - `/api/legal/precedent-search`
   - `/api/legal/risk-analysis`
   - `/api/legal/translate`
   - `/api/legal/anonymize`
   - `/api/legal/summarize`
   - WhatsApp Brain-Query Intent
2. **Virus-Scan für alle Upload-Pfade pflicht** — `src/lib/virus-scan.ts` (bestehend, 6KB) muss in jedem Upload-Flow ausgeführt werden:
   - `/api/upload` (bestehend)
   - Contract Review Uploads (Paket 4)
   - Bulk Review Ingestion (Paket 8)
   - Intake Document Uploads (Paket 7)
   - WhatsApp Media (Paket 7A)
   - E-Mail Anlagen (Paket 5A)
3. **Upload-Validation verschärfen** — `src/lib/upload-validation.ts` (bestehend) für alle Upload-Pfade einheitlich konfigurieren (MIME-Types, Size-Limits, Filename-Sanitizing).
4. **HTML-Sanitization für AI-Output** — `src/lib/sanitize-html.ts` (bestehend) für alle AI-generierten HTML-Ausgaben verwenden.
5. **Idempotency für alle Webhooks und Workflow-Steps** — `src/lib/idempotency.ts` (bestehend) systemweit durchsetzen.
6. **Encryption-at-Rest Regressionstests** — `src/lib/encryption.ts` (bestehend) Tests für TOTP, DocuSign, API-Keys, alle verschlüsselten Felder.
7. **Rate-Limiting für AI-Endpunkte** — `src/lib/rate-limit-api.ts` (bestehend) für alle AI-Endpunkte mit gestaffelten Tiers (standard/heavy).
8. **Security Header Audit** — CORS, CSP, HSTS, X-Frame-Options für alle Routes prüfen.
9. **Penetration-Test-Ready Doku** — Security-Architektur dokumentieren für externe Audits.

Akzeptanzkriterium:

- Jeder AI-Endpunkt hat Prompt-Sanitization, jeder Upload-Pfad hat Virus-Scan, jeder Webhook hat Idempotency, jedes Secret ist encrypted-at-rest. Security-Architektur ist für externe Audits dokumentiert.

## Paket 15: Billing, Trust Accounting, Spend Controls und Kanzlei-Controlling

Priorität: P1  
Benchmark: Clio Manage, MyCase, Smokeball, Aderant, Brightflag, SimpleLegal  
Code-Startpunkte: `src/app/dashboard/invoicing`, `src/app/dashboard/controlling`, `src/app/api/invoices` (bestehend: [slug], remind, send), `src/lib/rvg.ts` (bestehend), `src/lib/billing/plans.ts` (bestehend), `src/app/api/usage/route.ts` (bestehend), `src/lib/invoice-pdf.ts` (bestehend, 6.5KB), `src/lib/invoice-template.ts` (bestehend, 3KB), `src/app/api/time/route.ts` (bestehend, 8KB), `src/app/dashboard/billing/` (bestehend), `src/lib/plans.ts` (bestehend, 223 Zeilen, Quota-Enforcement), `src/lib/legal-types.ts` (TimeEntry, ExpenseEntry), `src/app/dashboard/cost-calculator/` (bestehend, 11KB)

Warum dieses Paket ergänzt wurde:

- Practice-Management-Konkurrenz gewinnt nicht nur über AI, sondern über Geldflüsse: Time, Billing, Trust/IOLTA/Anderkonto, Kosten, LEDES, Mahnungen, Auslastung.
- Subsumio hat RVG, Invoicing, Usage und Controlling-Flächen, aber der Plan muss Kanzlei-Finanzabläufe als Produktkern behandeln.

Tasks:

1. Time/Billing-Kette schließen:
   - Zeiteintrag -> Rechnungsvorschlag -> Freigabe -> Versand -> Zahlung -> Mahnung.
2. Trust-/Anderkonto-Modell prüfen:
   - Mandantengelder getrennt von Honoraren.
   - Ledger.
   - Audit.
   - Export.
3. RVG + Honorarvereinbarung:
   - RVG-Berechnung.
   - Pauschale/Stundensatz.
   - Erfolgshonorar-Hinweis, wenn zulässig/relevant.
4. LEDES-/DATEV-/CSV-Exports erweitern.
5. AI Spend Controls:
   - Kosten pro Matter.
   - Kosten pro User.
   - Kosten pro Workflow.
   - Budget Limits und Warnungen.
6. Matter Budgeting und Profitability:
   - Budget bei Matter-Eröffnung.
   - Forecast vs. Actual.
   - Fixed Fee / Pauschale / Stundensatz-Szenarien.
   - Write-off Tracking.
   - Warnung bei Budgetüberschreitung.
   - Mandantenreport für Kostentransparenz.
7. Kanzlei KPIs:
   - WIP.
   - offene Rechnungen.
   - Auslastung.
   - Fristenrisiko.
   - AI-Zeitersparnis nur als geschätzte, markierte Kennzahl.

Akzeptanzkriterium:

- Ein Kanzlei-Admin kann aus Subsumio heraus Arbeit erfassen, abrechnen, Zahlungen verfolgen, AI-Kosten kontrollieren und DATEV/Accounting-Exports erzeugen.

## Paket 16: Mobile, PWA, Offline und Push

Priorität: P1/P2  
Benchmark: Clio, Filevine, Smokeball, JUPUS intake/mobile workflows  
Code-Startpunkte: `capacitor.config.ts`, `src/components/pwa/sw-register.tsx`, `public/sw.js`, `src/lib/use-offline-sync.ts`, `src/app/dashboard/mobile`, `src/lib/mobile-bridge.ts`

Warum dieses Paket ergänzt wurde:

- Kanzlei-Alltag passiert auch mobil: Fristen, Mandantenkommunikation, Diktate, Belege, Fotos, Push-Erinnerungen.
- Subsumio hat PWA/Capacitor/Offline-Bausteine, aber Mobile ist noch kein klarer Release-Strang.

Tasks:

1. Mobile Smoke Gate:
   - Login.
   - Dashboard.
   - Akten.
   - Upload/Foto.
   - Frist.
   - Push.
2. Offline Queue produktisieren:
   - klare Konfliktauflösung.
   - Retry.
   - User sichtbarer Sync-Status.
3. Push Notifications:
   - Fristen.
   - Approvals.
   - Portal-Nachrichten.
   - Workflow-Blocker.
4. Mobile Capture:
   - Foto zu Akte.
   - Sprachmemo zu Akte.
   - Dokumentenscan.
5. Security:
   - Biometric unlock, wenn verfügbar.
   - Remote logout/session revocation.

Akzeptanzkriterium:

- Kritische Kanzlei-Flows funktionieren auf Mobile/PWA zuverlässig, inklusive Offline-Queue und Push für Fristen/Approvals.

## Paket 17: Content-Partner, Jurisdiction Expansion und Legal Knowledge Marketplace

Priorität: P2  
Benchmark: Noxtua/Beck/MANZ/Swiss-Noxtua, Lexis, Thomson Reuters, vLex, Wolters Kluwer Libra  
Code-Startpunkte: `law-corpus/`, `law-corpus-split/`, `src/lib/judgements.ts`, `src/app/dashboard/research`, `src/content/partners.ts`

Warum dieses Paket ergänzt wurde:

- Die besten Research-Produkte gewinnen über autoritative Daten und Partner. Technik allein ersetzt keine lizenzierten Kommentare, Fachinhalte, Formulare, Muster und Citators.
- Subsumio braucht eine klare Architektur, um DACH/EU-Content zu integrieren, ohne Vendor-Lock-in in den Kern zu bauen.

Tasks:

1. Content Provider Adapter:
   - provider id.
   - jurisdiction.
   - auth.
   - search.
   - retrieve.
   - citation canonicalization.
   - license constraints.
2. Knowledge Pack Modell:
   - Normen.
   - Judikatur.
   - Vertragsmuster.
   - Klauselbibliotheken.
   - Playbooks.
   - Fristenregeln.
3. Partner Readiness:
   - Beck/MANZ/Wolters-Kluwer/vLex/TR/Lexis-ähnliche Schnittstellen abstrakt vorbereiten.
   - Keine Partnernamen als harte Integration claimen, solange keine Lizenz/Partnerschaft besteht.
4. Jurisdiction Expansion:
   - EU law.
   - ECHR/EGMR.
   - CJEU/EuGH.
   - UPC.
   - optional UK/US nur als getrennte Packs.
5. License-aware UI:
   - Quelle verfügbar/nicht verfügbar.
   - Zitierbar/nur intern.
   - Export erlaubt/verboten.

Akzeptanzkriterium:

- Subsumio kann autoritative Rechtsdaten und Knowledge Packs partnerfähig integrieren, ohne die Kernarchitektur oder Citation Gates umzubauen.

## Paket 18: Client Portal und Mandantenkommunikation

Priorität: P1  
Benchmark: Clio Connect, MyCase Client Portal, Smokeball Portal, Filevine Portal  
Code-Startpunkte: `src/app/api/portal/` (bestehend, 5 Endpoints: generate, verify, revoke, message, messages), `src/app/dashboard/client-portal/` (bestehend), `src/lib/portal-token.ts` (bestehend, 144 Zeilen, HMAC-SHA256-signierte Tokens), `src/app/api/portal/generate/route.ts`, `src/app/api/portal/verify/route.ts`, `src/app/api/portal/revoke/route.ts`, `src/app/api/portal/message/route.ts`, `src/app/api/portal/messages/route.ts`

Warum dieses Paket ergänzt wurde:

- Das Client Portal existiert mit 5 API-Endpunkten und einer Dashboard-Seite, ist aber nicht im Plan.
- Mandantenportal ist ein kritischer Differentiator: Anwälte brauchen sichere Dokumentenfreigabe, Nachrichten, Frist-Updates ohne E-Mail.
- Portal-Tokens sind stateless (HMAC-SHA256), kein Login nötig — der Link IST die Berechtigung. Das ist ein Security-Feature, kein Bug.

Tasks:

1. **Bestehende Portal-Token-Infrastruktur härten** — `src/lib/portal-token.ts` hat `signPortalToken()`, `verifyPortalToken()`, `PORTAL_TOKEN_SECRET`. Token-Rotation, Expiry-Policy und Audit ergänzen.
2. **Portal Generate/Verify/Revoke-Flow testen** — Token-Erstellung für genau eine Akte, Verifikation, Widerruf. Regressionstests.
3. **Mandanten-Nachrichten** — `/api/portal/message/` und `/api/portal/messages/` existieren. Nachrichten-Flow testen, Audit-Trail, Read-Receipts.
4. **Dokumentenfreigabe im Portal** — Mandant kann Dokumente einsehen, herunterladen (mit Audit). Kein Upload ohne Anwalt-Freigabe.
5. **Frist- und Status-Updates im Portal** — Mandant sieht relevante Fristen und Aktenstatus (read-only).
6. **Portal-Link-Verwaltung** — Anwalt kann Links generieren, widerrufen, Ablaufzeit setzen. Audit-Log pro Aktion.
7. **DSGVO-Konformität** — Portal-Nachrichten und -Dokumente müssen in GDPR-Export und Retention-Policy einbezogen werden.
8. **Security Review** — Portal-Tokens dürfen nur für die berechtigte Akte gelten. Kein Token-Reuse, kein Cross-Akten-Zugriff. Pen-Test-Ready.

Akzeptanzkriterium:

- Ein Anwalt kann einen sicheren Mandanten-Link generieren, der Mandant kann Dokumente einsehen und Nachrichten senden — alles auditiert, DSGVO-konform, ohne eigenes Login.

## Paket 19: Auth Security und Account Protection

Priorität: P0/P1  
Benchmark: OWASP Auth Cheat Sheet, NIST 800-63B, enterprise SaaS auth standards  
Code-Startpunkte: `src/lib/auth/lockout.ts` (bestehend, 139 Zeilen, 5 Fehlversuche → 30min Lockout), `src/lib/auth/backup-codes.ts` (bestehend, 2FA-Recovery-Codes), `src/lib/auth/password.ts` (bestehend), `src/lib/auth/tokens.ts` (bestehend, 74 Zeilen), `src/lib/auth/rate-limit.ts` (bestehend, 169 Zeilen), `src/lib/auth/session.ts` (bestehend), `src/lib/auth/session-core.ts` (bestehend, Edge-safe), `src/lib/auth/revocation-store.ts` (bestehend), `src/lib/totp.ts` (bestehend, RFC 6238), `src/lib/encryption.ts` (bestehend, AES-256-GCM), `src/lib/csrf.ts` (bestehend), `src/app/api/2fa/` (bestehend, 4 Endpoints), `src/app/api/auth/` (bestehend, 15 Endpunkte)

Warum dieses Paket ergänzt wurde:

- Die Auth-Infrastruktur ist umfangreich (14 Module in `src/lib/auth/`), aber im Plan nur als "Secrets-at-rest" in Paket 0A erwähnt.
- Account-Lockout, 2FA-Backup-Codes, Password-Policy, Session-Revocation und Rate-Limiting sind kritische Security-Features, die gehärtet und getestet sein müssen.
- `src/lib/api-handler.ts` (18KB) als zentraler Guard-Pipeline (Auth → RBAC → CSRF → Rate-Limit → Quota → Validation → Audit) ist nicht im Plan.

Tasks:

1. **Account-Lockout härten** — `src/lib/auth/lockout.ts` hat 5 Fehlversuche → 30min Lockout. Regressionstests, Edge-Cases (gleichzeitige Logins, Lockout-Expiry).
2. **2FA-Backup-Codes testen** — `src/lib/auth/backup-codes.ts` generiert 10 Codes (XXXX-XXXX-XXXX, SHA-256-gehashed). Test: Code-Verbrauch, Code-Erschöpfung, Recovery-Flow.
3. **Password-Policy validieren** — `src/lib/auth/password.ts` prüfen. Mindestlänge, Komplexität, HaveIBeenPwned-Check (optional).
4. **Session-Revocation härten** — `src/lib/auth/revocation-store.ts` und `session-core.ts` (Edge-safe). Fail-closed für Admin/Settings, dokumentierte 60s-Policy für andere Bereiche. Test: Revoked Session in Middleware.
5. **Rate-Limiting verschärfen** — `src/lib/auth/rate-limit.ts` (6KB) für Login, Register, 2FA, Password-Reset. Gestaffelte Tiers.
6. **CSRF-System auditieren** — `src/lib/csrf.ts` (Double-Submit-Token). Alle state-changing Endpunkte abgedeckt? Webhook-Exemptions korrekt?
7. **Central API Handler als Pflicht** — `src/lib/api-handler.ts` (18KB) mit `createHandler()`, `createEngineProxy()`, `createWebhookHandler()`, `createPublicHandler()`. Alle API-Routen müssen diesen Wrapper nutzen. Keine ad-hoc-Handler mehr.
8. **Auth-Flow End-to-End Tests** — Login → 2FA → Session → Logout. Forgot-Password → Reset. SSO → WorkOS. Org-Invite → Join.
9. **Token-Security** — `src/lib/auth/tokens.ts` (2.7KB). Token-Rotation, Expiry, Refresh-Flow.
10. **Audit-Trail für alle Auth-Aktionen** — Login, Logout, 2FA-Enable/Disable, Password-Reset, Lockout, Session-Revocation müssen in `src/lib/audit.ts` geloggt werden.

Akzeptanzkriterium:

- Alle Auth-Flows sind regressionstest-gesichert. Account-Lockout, 2FA-Backup-Codes, Session-Revocation und Rate-Limiting funktionieren unter Last. Keine API-Route ohne `createHandler()`-Wrapper.

## Paket 20: Practice Management Core

Priorität: P0/P1  
Benchmark: Clio Manage, Smokeball, MyCase, PracticePanther, Filevine  
Code-Startpunkte: `src/app/dashboard/cases/` (bestehend, 5 Items), `src/app/dashboard/contacts/` (bestehend), `src/app/dashboard/opponents/` (bestehend), `src/app/dashboard/deadlines/` (bestehend), `src/app/dashboard/calendar-export/` (bestehend), `src/app/dashboard/vault/` (bestehend), `src/app/dashboard/review-queue/` (bestehend), `src/app/api/time/route.ts` (bestehend, 8KB, vollständiges Time-Tracking), `src/lib/legal-types.ts` (bestehend, 264 Zeilen: CaseFrontmatter, DeadlineEntry, TimeEntry, ExpenseEntry, EvidenceEntry, StrategyInfo), `src/lib/ai-deadline-detect.ts` (bestehend, 208 Zeilen, Hybrid Regex+AI), `src/lib/legal-deadlines.ts` (bestehend, 505 Zeilen, DE/AT/CH), `src/app/dashboard/research/` (bestehend), `src/app/dashboard/norms/` (bestehend), `src/app/dashboard/rechtsprechung/` (bestehend), `src/app/dashboard/precedent-search/` (bestehend), `src/app/dashboard/drafting/` (bestehend), `src/app/dashboard/assistant/` (bestehend), `src/app/api/legal/statute/` (bestehend), `src/app/api/legal/statute-search/` (bestehend), `src/app/api/legal/judgements-search/` (bestehend), `src/app/api/legal/judgements-sync/` (bestehend), `src/lib/caselaw-dedup.ts` (bestehend), `src/lib/kanzlei-settings.ts` (bestehend), `src/app/api/org/` (bestehend: invite, join, member), `src/app/api/team/` (bestehend: role), `src/app/dashboard/team/` (bestehend)

Warum dieses Paket ergänzt wurde:

- Practice Management ist der Kern eines Kanzlei-OS: Akten, Kontakte, Gegner, Fristen, Zeit, Kalender, Vault, Review-Queue.
- Diese Dashboard-Seiten und APIs existieren, sind aber nicht als zusammenhängendes Paket im Plan.
- `src/lib/legal-types.ts` definiert den gesamten Datenvertrag (CaseFrontmatter mit deadlines, evidence, strategy, timeline, tasks, time_entries, expenses, documents).
- AI Deadline Detection (`ai-deadline-detect.ts`) mit Hybrid Regex+AI für ZPO/BGB/StPO ist ein Alleinstellungsmerkmal.

Tasks:

1. **Cases (Aktenmanagement) härten** — `src/app/dashboard/cases/` (5 Items). CRUD-Vollständigkeit, Status-Übergänge, Akten-Timeline, Verknüpfung mit Kontakten/Gegnern/Gerichten.
2. **Contacts & Opponents** — `src/app/dashboard/contacts/` und `/opponents/`. Kontakt-CRUD, Rollen (client, opponent, lawyer, court), Konfliktprüfung-Integration.
3. **Deadlines Management** — `src/app/dashboard/deadlines/` mit `src/lib/legal-deadlines.ts` (505 Zeilen, DE/AT/CH) und `src/lib/ai-deadline-detect.ts` (Hybrid Regex+AI). Fristen-Erkennung aus Dokumenten, Berechnung, Erinnerung, Audit.
4. **AI Deadline Detection Regressionstests** — `src/lib/ai-deadline-detect.ts` erkennt absolute Daten, relative Fristen, gesetzliche Fristen, Gerichtstermine, Rechtsmittelfristen. Edge-Cases: Feiertage, Bundesland/Kanton, Monatsende.
5. **Time Tracking** — `src/app/api/time/route.ts` (8KB). Zeiterfassung mit billable/non-billable, activity_type (research, drafting, court, meeting, other), lawyer-Zuordnung. Mit Billing (Paket 15) verbinden.
6. **Calendar Export** — `src/app/dashboard/calendar-export/`. ICS-Export für Fristen und Gerichtstermine. Mit Outlook/Google Calendar sync.
7. **Vault** — `src/app/dashboard/vault/`. Sichere Ablage für sensible Mandantendaten. Verschlüsselung-at-rest, Audit-Zugriff.
8. **Review Queue** — `src/app/dashboard/review-queue/`. AI-Outputs zur Überprüfung. Mit Citation Gate (Paket 1) und Approval-System (Paket 3) verbinden.
9. **Research/Norms/Rechtsprechung** — `src/app/dashboard/research/`, `/norms/`, `/rechtsprechung/`, `/precedent-search/`. Mit Source Registry (Paket 2) und Citation Gate (Paket 1) verbinden.
10. **Statute Search & Judgements** — `/api/legal/statute/`, `/api/legal/statute-search/`, `/api/legal/judgements-search/`, `/api/legal/judgements-sync/`. Mit `src/lib/caselaw-dedup.ts` (Dedup) und `src/lib/judgements.ts` verbinden.
11. **Drafting & Assistant** — `src/app/dashboard/drafting/` und `/assistant/`. AI-gestütztes Drafting mit Citation Gate.
12. **Org & Team Management** — `/api/org/` (invite, join, member), `/api/team/` (role), `/dashboard/team/`. Org-Invite-Flow, Rollen-Änderung, Audit.
13. **Kanzlei Settings** — `src/lib/kanzlei-settings.ts`. Firmeneinstellungen (Name, Adresse, RVG-Parameter, beA-Config, DATEV-Config).
14. **Legal Types als Datenvertrag** — `src/lib/legal-types.ts` als Single Source of Truth für CaseFrontmatter, DeadlineEntry, TimeEntry, ExpenseEntry, EvidenceEntry, StrategyInfo. Keine ad-hoc-`as any`-Zugriffe.

Akzeptanzkriterium:

- Akten, Kontakte, Gegner, Fristen, Zeiterfassung, Kalender, Vault und Review-Queue funktionieren als zusammenhängendes Practice-Management-System. AI-Fristenerkennung ist regressionstest-gesichert.

## Paket 21: Marketing Agent, Lead Funnel und SEO/Content-Infrastruktur

Priorität: P2  
Benchmark: HubSpot, Intercom, Drift, Legal marketing automation  
Code-Startpunkte: `src/app/api/marketing-agent/` (bestehend), `src/lib/marketing/leads.ts` (bestehend, 173 Zeilen, Lead-Scoring mit Slack-Notification), `src/components/marketing/` (bestehend, 26 Komponenten), `src/components/seo/` (bestehend), `src/lib/brand.ts` (bestehend), `src/components/brand/` (bestehend, 3 Items), `src/app/about/` (bestehend), `src/content/` (bestehend: dashboard.ts, docs.ts, download.ts, partners.ts, site.ts, pricing.ts)

Warum dieses Paket ergänzt wurde:

- Der Marketing Agent mit AI-Lead-Scoring (low/medium/high/enterprise) und Slack-Notification existiert, ist aber nicht im Plan.
- 26 Marketing-Komponenten (Landing, Features, Pricing, Security, Partners, Solution, Vertical, Live-Demo, etc.) sind nicht referenziert.
- SEO- und Brand-Infrastruktur existieren, müssen aber für organische Kundengewinnung gehärtet werden.

Tasks:

1. **Marketing Agent härten** — `/api/marketing-agent/` mit `src/lib/marketing/leads.ts`. Lead-Scoring (low/medium/high/enterprise), Transcript-Speicherung, Slack-Notification, E-Mail-Notification.
2. **Lead Funnel testen** — Lead-Erfassung → Scoring → Notification → CRM-Export. DSGVO-Consent (`consent: true` ist Pflichtfeld).
3. **Marketing Pages SEO-audit** — 26 Komponenten in `src/components/marketing/`. Meta-Tags, OpenGraph, Schema.org, Sitemap, robots.txt.
4. **Brand Theming** — `src/lib/brand.ts` und `src/components/brand/` (3 Items). White-Label-Fähigkeit für Enterprise-Kunden.
5. **Content Management** — `src/content/` (dashboard.ts, docs.ts, download.ts, partners.ts, site.ts, pricing.ts). Content-Struktur für mehrsprachige Pages.
6. **Live Demo** — `src/components/marketing/live-demo.tsx`. Demo-Flow ohne Auth, mit Lead-Capture.
7. **Analytics & Conversion Tracking** — Event-Tracking für Sign-up, Demo-Request, Pricing-View. Privacy-first (keine Third-Party-Cookies).

Akzeptanzkriterium:

- Marketing Agent, Lead Funnel und alle Marketing-Pages sind getestet, SEO-optimiert und DSGVO-konform. Lead-Scoring funktioniert und benachrichtigt Sales via Slack + E-Mail.

## Paket 22: Court Filing, beA-Send, ERV/XJustiz und Court Forms

Priorität: P1  
Benchmark: Clio File/eFiling, etablierte Kanzleisoftware, beA/ERV/XJustiz-Workflows  
Code-Startpunkte: `src/app/dashboard/bea/page.tsx`, `src/app/dashboard/deadlines`, `src/lib/legal-deadlines.ts`, `src/lib/audit.ts`, `src/lib/approval.ts`, `src/app/api/legal/ai-deadlines`

Warum dieses Paket ergänzt wurde:

- Der Code sagt aktuell ehrlich: `src/app/dashboard/bea/page.tsx` importiert und erstellt Entwürfe, versendet aber nicht über beA.
- Internationale Praxismanagement-Konkurrenz integriert Court-Filing direkt in Matter-Workflows.
- Für DACH ist der Unterschied zwischen "Entwurf erzeugen" und "gerichtsfest einreichen, Eingang quittieren, Frist schließen" produktentscheidend.

Tasks:

1. Architekturentscheidung beA/ERV:
   - Direkte zertifizierte beA-Anbindung nur, wenn rechtlich/technisch realistisch.
   - Sonst Partner-/Adaptermodell mit klarer UI: import, prepare, export, send-via-certified-provider.
   - Keine Marketing-Claims auf echten Versand, solange kein zertifizierter Versandweg besteht.
2. Filing Package Modell:
   - matter id
   - court/recipient
   - documents
   - attachments
   - signature requirement
   - deadline link
   - approval status
   - filing receipt
3. XJustiz/ERV/strukturierte Gerichtsformate vorbereiten:
   - Metadatenmodell
   - Validierung
   - XML-/ZIP-Paketexport
   - Receipt Import
4. Court Forms und Formularautomatisierung:
   - jurisdiction
   - form type
   - required fields
   - source/version
   - validation errors
5. Filing Approval Gate:
   - Nutzung von `src/lib/approval.ts`
   - Vier-Augen-Prüfung optional
   - keine AI-generierte Einreichung ohne Human Approval
6. Fristenkopplung:
   - Filing erzeugt/erledigt Frist
   - Eingangsnachweis wird auditierbar gespeichert
   - Reminder, wenn Filing-Paket offen bleibt
7. Audit und Beweisbarkeit:
   - Hash aller eingereichten Dateien
   - Filing receipt
   - User, Timestamp, Version
   - Exportierbarer Filing Report

Akzeptanzkriterium:

- Subsumio kann gerichtliche Einreichungen mindestens als validiertes, freigegebenes und receipt-fähiges Filing Package vorbereiten; echter beA/ERV-Versand wird nur nach zertifiziertem/partnerfähigem Versandweg aktiviert.

## Paket 23: Legal Ethics, Privilege, Ethical Walls und AML/KYC

Priorität: P0/P1  
Benchmark: Intapp Conflicts/Intake, Enterprise-Legal-Governance, bar-rule-konforme AI-Nutzung  
Code-Startpunkte: `src/app/api/legal/conflict-check/`, `src/app/api/legal/anonymize/route.ts`, `src/lib/permissions.ts`, `src/lib/audit.ts`, `src/lib/model-config.ts`, `src/lib/ai-act.ts`, `server/skills/aml-screener/SKILL.md`, `src/app/dashboard/compliance`

Warum dieses Paket ergänzt wurde:

- Kollisionsprüfung existiert, aber ein vollständiges berufsrechtliches Schutzsystem ist mehr als ein Konflikt-Endpoint.
- Aktuelle Legal-AI-Risiken drehen sich stark um Vertraulichkeit, Privilege/Legal Professional Privilege, AI-Provider-Datenverarbeitung und unzulässige Offenlegung.
- AML/KYC ist für viele Mandatsannahmen ein Pflichtprozess, nicht nur ein optionales Add-on.

Tasks:

1. Privilege-/Confidentiality-Labels:
   - privileged
   - work product / anwaltliches Arbeitsergebnis
   - confidential
   - client secret
   - public
   - unknown
2. AI-Use Guardrails:
   - Provider erlaubt/verboten je Matter und Dokumentlabel.
   - EU-only/zero-retention/no-training Regeln technisch erzwingen.
   - Warnung/Blockade bei sensiblen Labels und ungeeignetem Modell.
3. Ethical Walls:
   - Matter-level access groups.
   - Konfliktparteien.
   - gesperrte User/Teams.
   - Break-glass nur mit Audit und Begründung.
4. Konfliktprüfung erweitern:
   - Personen, Firmen, wirtschaftlich Berechtigte, Gegner, verbundene Unternehmen.
   - Similar-name/fuzzy matching.
   - frühere Mandate.
   - adverse party history.
5. AML/KYC Intake:
   - Mandantentyp.
   - wirtschaftlich Berechtigte.
   - PEP/Sanktions-/Risikoprüfung über Adapter.
   - Review-Status und Freigabe.
6. Privilege Waiver Prevention:
   - Warnung vor Teilen/Exportieren/externem Provider.
   - Redaction/Anonymisierung vorschlagen.
   - Sharing-Logs.
7. Policy Dashboard:
   - welche Matters dürfen welche AI verwenden?
   - offene Conflict/AML Reviews.
   - Ethical Wall Verstöße/Break-glass Events.
8. Client-AI-Disclosure und Einwilligungslogik:
   - je Kanzlei/Matter konfigurierbar.
   - AI-Nutzung gegenüber Mandanten dokumentieren, wenn berufsrechtlich, vertraglich oder policy-seitig erforderlich.
   - Mandanten-Einwilligung oder Ablehnung versioniert speichern.
   - AI-generierte Arbeit und menschliche Prüfung in Mandantenkommunikation sauber trennen.
   - Billing-Hinweis: keine ungeprüfte Weitergabe von AI-Zeitersparnis oder AI-Kosten ohne Kanzlei-Policy.

Akzeptanzkriterium:

- Vor Mandatsannahme und vor sensibler AI-Nutzung kann Subsumio Konflikt, AML/KYC, Zugriffswand, Provider-Policy und Privilege-Risiko technisch prüfen und auditierbar erzwingen.

## Paket 24: Litigation Analytics, Judge/Docket Intelligence und Strategie

Priorität: P1/P2  
Benchmark: Lex Machina, Bloomberg Litigation Analytics, Trellis, vLex Analytics  
Code-Startpunkte: `src/lib/judgements.ts`, `src/app/dashboard/research`, `src/app/dashboard/graph`, `src/app/api/graph`, `src/lib/regulatory-monitors.ts`, `law-corpus/`, `law-corpus-split/`

Warum dieses Paket ergänzt wurde:

- Matter Graph und Similar Cases sind im Plan, aber echte Prozessstrategie braucht Analytics über Gerichte, Richter, Gegner, Kanzleien, Verfahrensarten, Dauer und Outcomes.
- Wettbewerber verkaufen nicht nur Recherche, sondern Vorhersage- und Strategieintelligenz aus bereinigten Docket-/Judgment-Daten.
- Für DACH muss das vorsichtig und quellenbewusst gebaut werden, weil Datenverfügbarkeit und Lizenzierung je Jurisdiktion stark variieren.

Tasks:

1. Litigation Analytics Datenmodell:
   - court
   - chamber/senate
   - judge
   - party
   - counsel/law firm
   - claim type
   - motion/application type
   - outcome
   - duration
   - damages/costs, wenn verfügbar
2. Analytics Source Registry:
   - Herkunft.
   - Lizenz.
   - Abdeckung.
   - Aktualität.
   - Confidence.
3. Judge/Court Profile:
   - typische Verfahrensdauer.
   - häufige Rechtsgebiete.
   - Entscheidungsmuster nur mit Quellenlage.
   - keine Scheingenauigkeit bei kleinen Samples.
4. Opponent/Counsel Intelligence:
   - bekannte Gegenparteien.
   - Kanzleien.
   - ähnliche Verfahren.
   - Strategiehinweise mit Citation Gate.
5. Strategy Memo Generator:
   - Chancen/Risiken.
   - relevante Präzedenzfälle.
   - Dauer-/Kostenannahmen.
   - Beweis-/Antragsstrategie.
   - Pflicht: Quellen, Sample Size, Datenlücken.
6. UI:
   - Matter Graph -> Analytics Panel.
   - Research -> Judge/Court/Opponent Tabs.
   - Exportierbares Strategy Briefing.

Akzeptanzkriterium:

- Subsumio kann für streitige Matters eine quellen- und datenbewusste Prozessstrategie erzeugen, inklusive Gericht/Richter/Gegner-Analytics, Sample-Size-Warnungen und exportierbarem Strategy Memo.

## Paket 25: Real-time Co-Editing und Matter Collaboration Room

Priorität: P1  
Benchmark: Filevine real-time collaboration, Microsoft 365/Word co-authoring, NetDocuments/iManage Collaboration  
Code-Startpunkte: `src/components/legal/CommentThread.tsx`, `src/lib/comments.ts`, `src/lib/realtime.ts`, `src/app/api/realtime/sse`, `src/app/dashboard/version-history`, `src/components/contract-redline-viewer.tsx`

Warum dieses Paket ergänzt wurde:

- Kommentare, Realtime-SSE und Version History existieren, aber echte gleichzeitige Bearbeitung mit Version Locks, Rollen und Client-/Co-Counsel-Räumen ist noch kein Arbeitspaket.
- Kanzleien verlieren enorm viel Zeit durch E-Mail-Versionen, unklare Redlines und nicht nachvollziehbare Abstimmung.

Tasks:

1. Collaboration Room Modell:
   - matter id
   - participants
   - role/access
   - document set
   - open tasks
   - comments
   - audit events
2. Real-time Presence:
   - online users.
   - active document.
   - cursor/selection optional.
   - typing/comment indicators.
3. Version Control:
   - immutable baselines.
   - checked-out/locked state.
   - compare/merge.
   - accepted/rejected change history.
4. Secure External Sharing:
   - client/co-counsel invite.
   - expiry.
   - watermarked exports.
   - granular permissions.
5. Redline Collaboration:
   - clause comments.
   - assignments.
   - approval status.
   - thread resolution.
6. Audit:
   - every comment, change, export, share, approval.
   - integration with `src/lib/audit.ts`.

Akzeptanzkriterium:

- Mehrere interne und externe Beteiligte können an einem Matter-Dokumentraum arbeiten, Änderungen/Kommentare nachvollziehen, Versionen vergleichen und Freigaben auditierbar abschließen.

## Paket 26: Migration, Onboarding und Kanzlei-Datenübernahme als Produkt

Priorität: P1  
Benchmark: Clio Data Migration, MyCase/Smokeball Onboarding, DMS/Practice-Management-Wechselprozesse  
Code-Startpunkte: `src/app/dashboard/import-kanzlei/page.tsx`, `src/app/dashboard/onboarding`, `src/app/api/onboarding`, `src/lib/provision.ts`, `src/lib/industry-pack.ts`, `src/app/api/upload/route.ts`

Warum dieses Paket ergänzt wurde:

- Der bestehende Import-Kanzlei-Flow ist im UX-Paket erwähnt, aber Massenadoption scheitert praktisch oft an Migration, Mapping, Datenqualität und parallelem Betrieb.
- Große Wettbewerber behandeln Migration als eigenes Verkaufsargument und Customer-Success-Produkt.

Tasks:

1. Migration Project Modell:
   - source system.
   - entities.
   - mapping.
   - validation.
   - dry run.
   - final cutover.
   - rollback/export.
2. Import Adapter:
   - CSV/Excel.
   - Clio/MyCase-ähnliche Exporte.
   - DATEV/Accounting Exporte.
   - DMS Ordnerstruktur.
   - RA-MICRO/Advoware/AnNoText/andere DACH-Systeme nur als Adapter-Ziele nach realen Exportformaten.
3. Mapping Wizard:
   - contacts.
   - matters.
   - deadlines.
   - tasks.
   - documents.
   - invoices/time entries.
4. Data Quality Gate:
   - Duplikate.
   - fehlende Mandantenbeziehung.
   - ungültige Fristen.
   - defekte Dokumente.
   - OCR/Indexierungsstatus.
5. Parallelbetrieb:
   - Read-only import.
   - Delta import.
   - Cutover checklist.
   - Audit report für Kanzlei.
6. Onboarding Analytics:
   - importierte Datensätze.
   - Fehler.
   - offene Mappings.
   - time-to-first-matter.

Akzeptanzkriterium:

- Eine Kanzlei kann strukturiert aus einem Altsystem in Subsumio wechseln: mit Mapping, Dry Run, Validierung, Delta-Import, Cutover-Report und messbarem Onboarding-Fortschritt.

## Paket 27: Accessibility und Barrierefreiheit

Priorität: P1  
Benchmark: BITV 2.0, WCAG 2.2 AA, European Accessibility Act (EAA, ab 28.06.2025), Section 508  
Code-Startpunkte: `src/app/dashboard/layout.tsx`, `src/components/dashboard/`, bestehende E2E-Accessibility-Projekte (in `tests/`/Playwright), `src/components/ui/` (shadcn/Radix-Basis)

Warum dieses Paket ergänzt wurde:

- Accessibility kommt im gesamten Plan bisher nur als fehlschlagender E2E-Test (`Accessibility-Timeouts`) vor, nicht als Produktanforderung.
- DACH-Behörden, Versicherer und größere Mandanten verlangen zunehmend Barrierefreiheit; der European Accessibility Act macht sie für viele B2B-Dienste ab 2025 verbindlich.
- Radix/shadcn liefern eine gute a11y-Basis, aber komplexe Eigenbau-Flows (Redline-Viewer, Tabular Review, Command Palette, Kanban/Drag-Drop) müssen explizit geprüft werden.

Tasks:

1. **a11y-Baseline-Audit** — Automatisiert (axe-core/Playwright) über alle Dashboard-Hauptflows; Findings nach WCAG-2.2-AA-Kriterien kategorisieren.
2. **Keyboard-Only-Navigation** — Jeder kritische Flow (Akte, Frist, Upload, Review, Approval, Workflow) ohne Maus bedienbar; Fokus-Reihenfolge und sichtbarer Fokus-Ring.
3. **Screenreader-Support** — ARIA-Rollen/Labels für Eigenbau-Komponenten (`contract-redline-viewer.tsx`, `command-palette.tsx`, Drag-Drop, Charts). Live-Regions für async AI-Status.
4. **Kontrast und Skalierung** — Farbkontraste (inkl. Risk/Citation/Status-Badges aus `status-colors.ts`/`groundedness.ts`) gegen AA prüfen; 200%-Zoom und reduzierte Bewegung respektieren (`prefers-reduced-motion`).
5. **Formulare und Fehler** — Label-Zuordnung, Fehlermeldungen programmatisch verknüpft, Empty/Loading/Error-States (Paket 12) a11y-konform.
6. **a11y als CI-Gate** — Playwright-Accessibility-Projekt aus dem instabilen E2E-Block (Paket 0A) in ein stabiles, blockierendes Smoke-Gate überführen.
7. **VPAT/Konformitätserklärung** — Barrierefreiheitserklärung dokumentieren (Pflicht für EAA/öffentliche Stellen).

Akzeptanzkriterium:

- Kritische Kanzlei-Flows erfüllen WCAG 2.2 AA, sind vollständig per Tastatur und Screenreader bedienbar, und ein blockierendes a11y-CI-Gate verhindert Regressionen.

## Paket 28: Performance, Last-Test und Skalierung

Priorität: P0/P1  
Benchmark: Core Web Vitals, k6/Artillery-Lasttests, SLO/SLA-getriebene SaaS-Operations  
Code-Startpunkte: `src/lib/logger.ts`, `src/instrumentation.ts` (Sentry), `src/lib/engine.ts`, `src/app/api/health/`, `src/app/api/readiness/` (aus Paket 0A), `server/` Engine-Schicht, `src/lib/realtime.ts` (SSE-Last)

Warum dieses Paket ergänzt wurde:

- Release 0 deklariert "massenmarkt-production-ready", aber es gibt kein Performance-, Last- oder Skalierungs-Gate. Observability (Paket 0B) misst, testet aber nicht unter Last.
- Legal-AI-Flows (OCR, große PDFs, Bulk Review, Embeddings, SSE-Streams) sind ressourcenintensiv und müssen unter realistischer Last definierte Antwortzeiten halten.

Tasks:

1. **Performance-Budgets definieren** — Core Web Vitals (LCP/INP/CLS) für Marketing- und Dashboard-Seiten; Budget pro kritischer Route.
2. **API-SLOs** — p50/p95/p99-Latenz und Fehlerbudget pro AI-/Such-/Upload-Endpunkt; SSE-Verbindungsstabilität (`realtime.ts`).
3. **Lasttests** — k6/Artillery-Szenarien: gleichzeitige Nutzer, Bulk-Upload, paralleles Bulk-Review, viele offene SSE-Streams, Cron-Lastspitzen.
4. **Skalierungsverhalten** — DB-Connection-Pooling (PGLite vs. Postgres), Engine-Throughput, Queue-/Worker-Backpressure, Rate-Limit-Tiers gegenprüfen.
5. **Frontend-Performance** — Bundle-Size-Budget, Code-Splitting, Lazy-Loading großer Komponenten (Redline-Viewer 15KB, Command Palette 20KB, Monitoring 38KB).
6. **Performance-Regression-Gate** — Lighthouse-CI + Lasttest-Schwellen als blockierendes Release-Gate; keine Verschlechterung über definierten Schwellen.

Akzeptanzkriterium:

- Subsumio hält unter realistischer Last definierte p95-Latenzen und Core-Web-Vitals-Budgets; Performance-Regressionen blockieren das Release reproduzierbar.

## Paket 29: Notification Center (In-App-Benachrichtigungen)

Priorität: P1  
Benchmark: Clio, Filevine, MyCase Benachrichtigungszentren  
Code-Startpunkte: `src/app/api/notifications/route.ts` (bestehend), `src/lib/realtime.ts` (bestehend), `src/app/api/realtime/sse` (bestehend), `src/app/dashboard/layout.tsx`, Paket 16 (Push-Bridge)

Warum dieses Paket ergänzt wurde:

- `/api/notifications/route.ts` existiert bereits, ist aber keinem Paket zugeordnet. Im Plan tauchen Benachrichtigungen nur als Push (Paket 16) und als Klammerzusatz in Paket 12 auf.
- Ein Kanzlei-OS braucht ein zentrales In-App-Benachrichtigungszentrum, das Fristen, Approvals, Portal-Nachrichten, Workflow-Blocker und Filing-Receipts bündelt — als Single Point of Truth, auf den die mobile Push-Bridge (Paket 16) nur aufsetzt.

Tasks:

1. **Notification-Datenmodell** — typisierte Notifications (`deadline`, `approval`, `portal_message`, `workflow_blocked`, `filing_receipt`, `system`), mit read/unread, Empfänger, Matter-/Org-Bezug, Tenant-Key (Paket 0B).
2. **Bestehende `/api/notifications` härten** — CRUD, Mark-as-read, Bulk-Aktionen, Pagination; über `createHandler()` (Paket 19) absichern.
3. **Notification-Bell im Dashboard-Layout** — Ungelesen-Badge, Dropdown, Deep-Link zur Quelle; a11y-konform (Paket 27).
4. **Realtime-Zustellung** — Neue Notifications via `realtime.ts`/SSE pushen; Workflow-/Approval-/Portal-Events als Producer anbinden.
5. **Push-Bridge** — Dieselben Events an Mobile-Push (Paket 16) weiterreichen; ein Event-Bus, zwei Kanäle (In-App + Push), keine Doppellogik.
6. **Präferenzen** — Pro Nutzer/Kanal konfigurierbar (welche Typen, E-Mail-Digest optional); DSGVO-konform.
7. **Audit** — Sicherheitsrelevante Benachrichtigungen (Approval, Filing, Lockout) über `src/lib/audit.ts` protokollieren.

Akzeptanzkriterium:

- Fristen, Approvals, Portal-Nachrichten, Workflow-Blocker und Filing-Receipts erscheinen als getestete, tenant-isolierte In-App-Benachrichtigungen mit Realtime-Zustellung, Präferenzen und gemeinsamer Push-Bridge.

## Paket 30: Kanzlei Knowledge Management, Precedent Bank und Best Work

Priorität: P1/P2  
Benchmark: Harvey Legal Knowledge Management, DraftWise Knowledge Management, Aderant KM, iManage Knowledge Unlocked, Clio AI Knowledge Management  
Code-Startpunkte: `src/app/dashboard/precedent-search/`, `src/app/api/legal/precedent-search/route.ts`, `src/app/dashboard/clause-library/`, `src/app/dashboard/playbooks/`, `src/app/dashboard/agents/`, `src/app/dashboard/graph/`, `src/app/dashboard/query/`, `src/lib/types.ts` (`PrecedentSearchResponse`), `src/content/features.ts`

Warum dieses Paket ergänzt wurde:

- Online-Recherche zeigt: Moderne Legal-AI- und Kanzlei-OS-Produkte gewinnen nicht nur durch Suche, sondern durch kuratiertes internes Wissen: Precedents, Best Work, Matter Playbooks, Deal-/Litigation-Datenbanken, Expertise-Verzeichnisse und Lessons Learned.
- Subsumio hat Precedent Search, Clause Library, Playbooks, Agenten und Wissensgraph-Bausteine, aber noch kein eigenes Knowledge-Management-Produktpaket.
- Ohne Kuratierung wird "Wissensgraph" schnell nur Volltextsuche mit hübscher Oberfläche; beste Kanzlei-Software muss Wissen bewerten, freigeben, versionieren und wiederverwenden.

Tasks:

1. Knowledge Asset Modell:
   - precedent document.
   - clause / fallback clause.
   - playbook.
   - checklist.
   - memo / research note.
   - matter after-action review.
   - expertise tag / responsible owner.
2. Best-Work-Curation:
   - Anwälte markieren Dokumente als Gold Standard.
   - Review/Freigabe durch Knowledge Owner.
   - Gültigkeit nach Jurisdiktion, Rechtsgebiet, Dokumenttyp und Datum.
   - Deprecation/Archive-Status.
3. Precedent Governance:
   - Versionierung.
   - Quelle/Matter-Bezug.
   - Confidentiality/Privilege Labels aus Paket 23.
   - License/Export-Regeln aus Paket 17.
   - Citation/Grounding aus Paket 1.
4. Matter Playbooks:
   - typische Schritte.
   - Fristen.
   - Checklisten.
   - Dokumentmuster.
   - Risiken und Lessons Learned.
5. Expertise Directory:
   - wer hat ähnliche Matters bearbeitet?
   - welche Kanzlei-internen Experten gibt es?
   - keine personenbezogenen Leistungsrankings ohne klare Kanzlei-Policy.
6. Search und Reuse:
   - Precedent Search filtert nach Freigabestatus, Aktualität, Rechtsgebiet, Jurisdiktion, Dokumenttyp.
   - Drafting/Contract Review kann freigegebene Precedents und Klauseln direkt verwenden.
   - Agenten dürfen nur freigegebene Knowledge Assets als autoritativ behandeln.
7. Knowledge Analytics:
   - häufig genutzte Precedents.
   - veraltete Assets.
   - Wissenslücken.
   - Feedback aus Review Queue und Contract Review.

Akzeptanzkriterium:

- Subsumio kann internes Kanzleiwissen nicht nur durchsuchen, sondern als freigegebene, versionierte und governance-konforme Knowledge Assets kuratieren, wiederverwenden und in Drafting/Review/Workflows einspielen.

## Paket 31: Kanzlei Superbrain, Legal Context Graph und Akten-Gedächtnis

Priorität: P0/P1  
Benchmark: NetDocuments Legal Context Graph, iManage Knowledge Work Platform, Harvey/iManage Knowledge Integration, DraftWise/iManage, GBrain-Core als eigener Differenziator  
Code-Startpunkte: `server/src/core/search/`, `server/src/core/think/`, `server/src/core/context-engine.ts`, `server/src/core/contextual-retrieval-service.ts`, `server/src/core/brain-registry.ts`, `server/src/core/brain-resolver.ts`, `server/src/core/ingestion/`, `server/src/core/facts/`, `server/src/core/trajectory.ts`, `server/src/core/search/eval.ts`, `server/src/commands/eval-retrieval-quality.ts`, `server/src/commands/whoknows.ts`, `server/src/commands/eval-whoknows.ts`, `server/src/core/schema-pack/base/gbrain-legal.yaml`, `src/app/dashboard/brain/`, `src/app/dashboard/query/`, `src/app/dashboard/graph/`, `src/app/api/search/route.ts`, `src/app/api/think/route.ts`, `src/app/api/brains/route.ts`

Warum dieses Paket ergänzt wurde:

- Das Kanzlei-Superbrain ist der eigentliche Differenziator: nicht nur Dokumentenspeicher, nicht nur Chat, sondern ein lebendes, berechtigungsbewusstes Kanzlei- und Akten-Gedächtnis.
- Der Code hat starke Grundlagen: Hybrid Search, Graph-Signale, Contextual Retrieval, Brain/Source Routing, Facts/Trajectory, Ingestion-Connectoren, Schema Packs und Eval-Bausteine.
- Im Plan waren diese Fähigkeiten über Paket 1, 2, 9, 20, 30 und 0B verstreut. Ohne eigenes Kernpaket droht das Superbrain nur Infrastruktur zu bleiben statt Produktversprechen.
- "Perfekt auf alle Informationen zugreifen" darf kein unprüfbarer Claim sein. Produktreif heißt: vollständiger Ingestion-Status, erklärbare Retrieval-Auswahl, Berechtigungsfilter, Quellenbelege, Aktualität, Lückenanzeige und messbare Recall-/Precision-Gates.

Tasks:

1. Legal Context Graph Modell:
   - Akte/Matter.
   - Mandant, Gegner, Gericht, Richter, Anwälte, Zeugen, Dritte.
   - Dokumente, E-Mails, WhatsApp, Portal-Nachrichten, Notizen, Fristen, Rechnungen, Aufgaben.
   - Fakten, Behauptungen, Beweise, Normen, Judikatur, Klauseln, Obligationen.
   - Aktivitäten: wer hat wann was geändert, freigegeben, exportiert, gesendet.
   - Berechtigungen, Privilege Labels, Ethical Walls und Retention/Legal Hold.
2. Brain/Source/Matter Routing als Produktkonzept:
   - Kanzlei-Brain.
   - Akten-Brain.
   - persönlicher Arbeitskontext.
   - externe/lizenzierte Quellen.
   - Import-/DMS-/E-Mail-/WhatsApp-Quellen.
   - Cross-Brain-Federation nur mit expliziter User-/Policy-Entscheidung.
3. Permission-aware Retrieval:
   - jeder Such-/Think-/Agent-Call muss Org, Brain, Source, Matter, User, Rolle und Ethical-Wall-Kontext berücksichtigen.
   - keine Treffer aus gesperrten Akten.
   - keine privilegierten Inhalte in falschen Kontexten.
   - Tests für Cross-Tenant-, Cross-Matter- und Portal-Leaks.
4. Matter Context Bundle:
   - "Was muss die AI wissen, bevor sie in dieser Akte handelt?"
   - aktuelle Fakten.
   - relevante Dokumente.
   - offene Fristen.
   - letzte Kommunikation.
   - zuständige Personen.
   - Freigaben/Blocker.
   - geltende Playbooks/Policies.
5. Temporal Memory und Faktenhistorie:
   - Fakten mit Datum, Quelle, Confidence, Gültigkeit und Supersession.
   - Timeline pro Akte.
   - "Was hat sich seit dem letzten Review geändert?"
   - Widerspruchserkennung zwischen alten und neuen Fakten.
   - Anbindung an bestehende `facts/`- und `trajectory`-Bausteine.
6. Retrieval Explainability:
   - warum wurde dieses Dokument/Faktum gezogen?
   - Quelle, Chunk/Page, Score, Search-Modus, Graph-Signal, Recency.
   - "nicht gefunden" und "Datenlücke" explizit anzeigen.
   - UI in Brain/Query/Assistant.
7. Completeness und Coverage:
   - pro Akte: welche Quellen sind angebunden?
   - DMS-Sync aktuell?
   - E-Mail/Outlook aktuell?
   - WhatsApp/Portal aktuell?
   - OCR vollständig?
   - Index frisch?
   - Warnung bei unvollständigem Matter Context.
8. Proaktive Gap Detection:
   - fehlende Vollmacht.
   - fehlende Anlagen.
   - fehlende Fristbestätigung.
   - unklare Gegenseite.
   - ungeprüfte neue Dokumente.
   - widersprüchliche Fakten.
   - Knowledge Asset veraltet oder nicht freigegeben.
9. Query Modes für Kanzlei-Alltag:
   - Conservative: nur freigegebene/hochvertrauenswürdige Quellen.
   - Balanced: interne Akten + freigegebene Quellen.
   - Deep Matter: gesamte Akte inklusive Historie und Kommunikation.
   - External Law: Rechtsquellen/Partnerquellen.
   - Admin Audit: Audit-/Aktivitätskontext.
10. Superbrain Eval Gate:

- Matter Recall@K.
- Entity Resolution Precision.
- Source Leakage Rate = 0 für gesperrte Quellen.
- Freshness Accuracy.
- Contradiction Detection Recall.
- "Unknown/Insufficient Context" Rate bei bewusst unvollständigen Akten.

11. User Experience:

- Brain Dashboard: Quellenabdeckung, Indexstatus, Frische, Qualitätswerte.
- Aktenansicht: "Akte verstanden?"-Panel mit Fakten, Lücken, Risiken, zuletzt geändert.
- Query/Assistant: Quellen- und Lückenanzeige neben jeder Antwort.
- Graph: vom statischen Graphen zum lebenden Context Graph.

12. Betriebs- und Datenschutzgrenzen:

- kein "alles wird überall gesucht" als Default.
- Speichern, Vergessen, Retention und Legal Hold je Quelle/Matter.
- Exportierbarer Brain Evidence Report für Enterprise-/Audit-Kunden.

13. Entity Resolution und Canonicalization:

- Personen/Firmen/Mandanten/Gegner/Gerichte/Richter über Schreibweisen hinweg zusammenführen.
- Aliase und frühere Namen.
- Dublettenprüfung beim Import.
- Konfliktprüfung und Matter Graph nutzen dieselbe Identitätsschicht.
- human-review queue für unsichere Matches.

14. Experience- und Who-knows-Layer:

- wer hat ähnliche Matters, Gerichte, Gegner, Vertragstypen oder Rechtsfragen bearbeitet?
- Verbindung zu `whoknows`-/Experience-Bausteinen.
- Suche nach Kanzlei-Erfahrung ohne personenbezogene Leistungsrankings.
- Expertensignale nur mit Kanzlei-Policy und Berechtigung anzeigen.

15. Feedback- und Korrekturloop:

- Anwalt markiert Treffer als relevant/irrelevant/veraltet/falsch.
- Korrekturen werden als Knowledge-/Fact-Updates versioniert.
- keine heimliche Modell-Training-Nutzung.
- Feedback fließt in Eval-Fälle und Retrieval-Ranking ein.

16. Connector-Coverage-Matrix:

- DMS: iManage, NetDocuments.
- Microsoft 365: Outlook, OneDrive/SharePoint/Teams, Calendar.
- Google Workspace: Gmail, Drive, Calendar.
- Kanzlei-/DACH-Quellen: beA-Import, DATEV, lokale Ordner, Uploads.
- pro Quelle: Auth-Status, letzter Sync, Fehler, indexierte Dokumente, OCR-Quote, permission sync.

17. Matter Context API Contract:

- eine interne API, die AI/Agents/Workflows konsistent mit Matter Context versorgt.
- kein Endpoint baut seinen eigenen Kontext ad hoc zusammen.
- Budget-/Token-Policy pro Query Mode.
- deterministische Testfixtures für gleiche Frage, gleicher Kontext, gleiche Quellen.

18. Bestehende Engine-Eval-Harness wiederverwenden statt neu bauen:

- auf `server/src/core/eval/`, `eval-capture.ts`, `routing-eval.ts`, `search/eval.ts`, `eval-contradictions/`, `calibration/` aufsetzen.
- LongMemEval und BrainBench (`gbrain-evals`) als Baseline; Subsumio-Legal-Goldensets ergänzen.
- Superbrain-Eval-Gate (Task 10) in dieselbe Pipeline wie Paket 14 hängen, kein zweiter Eval-Stack.

19. Multi-Tenant-Architekturentscheidung (P0, Fork-Kernrisiko):

- GBrain ist im Ursprung single-tenant (ein Brain-Repo = system of record, eine Markdown-Page pro Datei).
- Verbindlich entscheiden und dokumentieren: Brain-pro-Org, Brain-pro-Matter oder geteiltes Brain mit Row-Level-Tenant-Key.
- Tenant-Key, Org-/Matter-Isolation und Ethical Walls bis auf Page-/Chunk-/Fact-Ebene durchsetzen.
- Cross-Tenant-/Cross-Matter-/Portal-Leak-Tests als blockierendes Gate (Source Leakage Rate = 0).

20. `forget`/`decay` retention- und legal-hold-aware machen (P0, juristischer Konflikt):

- bestehende `server/src/core/facts/forget.ts` und `facts/decay.ts` dürfen nichts vergessen, was unter Aufbewahrungspflicht oder Legal Hold (Paket 10) steht.
- Decay nur für Confidence/Ranking, niemals für rechtlich aufbewahrungspflichtige Inhalte.
- jede Forget-/Decay-Aktion auditierbar (Paket 10) und reversibel; Legal Hold überschreibt Forget.

21. Legal Schema Pack als Datenvertrag besitzen:

- `server/src/core/schema-pack/base/gbrain-legal.yaml` ist Single Source of Truth für Entity-/Fakt-/Beziehungstypen.
- Erweiterungen versioniert, mit Migration (Paket 0B) und Entity-Resolution (Task 13) gekoppelt.
- keine ad-hoc-Entity-Typen außerhalb des Schema Packs.

22. MCP-Exposure des Legal-Brains (Wettbewerbschance):

- bestehenden MCP-Server/`mcp-client.ts` als berechtigungsgesteuerten Zugang für externe Agenten (z. B. Claude/ChatGPT) bewerten.
- strikte Trust-Boundary: `remote = true` erzwingt Tenant-/Matter-/Privilege-Filter und read-scope.
- nur freigegebene, permission-gefilterte Inhalte; Audit jeder externen Abfrage.

Akzeptanzkriterium:

- Subsumio hat ein überprüfbares Kanzlei-Superbrain: Jede AI-/Search-/Agent-Aktion nutzt einen berechtigungsbewussten Matter Context, zeigt Quellen und Datenlücken, respektiert Tenant/Matter/Privilege-Grenzen, vergisst nichts unter Legal Hold und wird über die bestehende Engine-Eval-Harness (Recall/Freshness/Leakage) gemessen.

## Paket 32: Legal Skill System und autonome Brain-Governance

Priorität: P0/P1  
Benchmark: GBrain "thin harness, fat skills"-Architektur, AI Act Human Oversight, ISO/IEC 42001  
Code-Startpunkte: `server/src/core/skill-catalog.ts`, `server/src/core/check-resolvable.ts`, `server/src/core/skill-trigger-index.ts`, `server/skills/`, `server/src/core/skillopt/`, `server/src/core/skillpack/`, `server/src/core/cycle.ts`, `server/src/core/minions/`, `server/src/core/minion-spend.ts`, `server/src/core/remediation/`, `server/src/core/doctor-*`, `server/src/core/self-upgrade.ts`

Warum dieses Paket ergänzt wurde:

- Die eigentliche Intelligenz des GBrain-Forks liegt nicht im Runtime, sondern in "fat skills" (Markdown-Workflows mit Triggern, Checks, Quality-Gates), validiert über `check-resolvable` (Reachability/MECE/DRY). Im Plan kam das Skill-System bisher nicht vor.
- Die Engine ist selbstwartend (`cycle.ts`, `minions/`, `doctor --remediate`, `self-upgrade`). Eine sich selbst verändernde juristische Wissensbasis ist ohne Audit, Human-Oversight und Spend-Cap ein Berufsrechts-, AI-Act- und Betriebsrisiko.
- Als Fork driftet der Code gegenüber dem schnell shippenden Upstream-GBrain (v0.38+); ohne Sync-/Divergenz-Strategie entsteht technische Schuld.

Tasks:

1. Legal Skill Authoring:
   - Kanzlei-Workflows (Fristen, Vertragsreview, Intake, Recherche, Memo) als versionierte Legal-Skills modellieren.
   - jede Skill mit Triggern, Checks, Citation-Gate (Paket 1) und Quality-Gate.
   - `check-resolvable` als CI-Gate: Skill-Baum reachable/MECE/DRY, keine toten oder doppelten Skills.
2. Skill-Governance:
   - Freigabe-/Review-Prozess für neue/geänderte Skills (Knowledge Owner, Paket 30).
   - Versionierung, Deprecation, Audit jeder Skill-Änderung.
3. Autonomer Brain-Loop unter Aufsicht:
   - `cycle.ts`/`minions` dürfen rechtsrelevante Inhalte nicht ohne Audit und konfigurierbares Human-Oversight-Gate verändern.
   - Spend-Cap pro Org/Matter über `minion-spend.ts`/`spend-log.ts`, gekoppelt an Paket 15 Spend Controls.
   - Self-Upgrade/Doctor-Remediation in Produktion nur mit Approval (Paket 3) und Rollback.
4. AI-Management-System-Nachweis:
   - autonome Operationen ins AI-System-Inventar (Paket 10, ISO/IEC 42001) aufnehmen.
   - Incident-/Monitoring-Prozess für fehlerhafte autonome Wissensänderungen.
5. Fork-Drift-Strategie gegenüber Upstream-GBrain:
   - dokumentierte Sync-Kadenz oder bewusste Divergenz mit Begründung.
   - `llms.txt`/`llms-full.txt` mit eigener Repo-Basis regenerieren (siehe `AGENTS.md`).
   - Regressionstests pinnen, bevor Upstream-Änderungen übernommen werden.

Akzeptanzkriterium:

- Kanzlei-Workflows sind als validierte, freigegebene Legal-Skills abgebildet; jede autonome Brain-Operation ist auditiert, oversight- und spend-begrenzt; und es existiert eine dokumentierte Fork-Sync-/Divergenz-Strategie gegenüber Upstream-GBrain.

## Release-Reihenfolge

### Release 0: Production Gate Release

Enthält:

- Paket 0A Production-Readiness Gate (inkl. Env-Validation, Logger, Error-Handling, Cron-Auth)
- Paket 0B Datenarchitektur, Persistenz, Migrationen und Betriebsfähigkeit
- Paket 19 Auth Security (Lockout, 2FA-Backup-Codes, Session-Revocation, Rate-Limiting, CSRF-Audit)
- Webhook-CSRF-Fix
- Engine-Verify grün
- E2E-Smoke mit Engine oder Mock-Engine
- Secrets-at-rest-Fix für TOTP und DocuSign
- Health/readiness Split
- Dependency-Audit grün
- Central API Handler als Pflicht für alle API-Routen
- Paket 28 Performance/Last-Test Gate MVP (Core-Web-Vitals-Budget, p95-SLOs, erste Lasttests)

Warum zuerst:

- Ohne stabile Webhooks, Engine-Gates, E2E und Performance-Gate ist jeder weitere Legal-AI-Flow nicht belastbar verkaufbar.

### Release 1: Trust + Security Release

Enthält:

- Paket 1 Citation Verification
- Paket 2 Source Registry MVP
- Paket 13A AI Security (Prompt-Sanitizer, Virus-Scan, Idempotency systemweit)
- Paket 14 AI Quality/Eval Gate MVP
- Paket 20 Practice Management Core MVP (Cases, Contacts, Deadlines, Time Tracking)
- Paket 31 Kanzlei Superbrain / Legal Context Graph MVP
- Paket 32 Legal Skill System (check-resolvable-Gate) und Brain-Governance-Grundlage
- UI-Badges
- Citation Tests

Warum zuerst:

- Ohne Trust Layer, AI-Security, Superbrain-Kontext und messbare Eval-Gates skaliert jeder weitere AI-Flow Risiko.

### Release 2: Workflow Release

Enthält:

- Paket 3 Workflow Engine MVP
- erste Workflow Templates
- Approval Gates (bestehendes `src/lib/approval.ts` erweitern)
- Audit Trail
- Realtime/SSE für Live-Workflow-Updates (bestehendes `src/lib/realtime.ts` nutzen)
- Paket 29 Notification Center MVP (In-App-Benachrichtigungen für Approvals, Workflow-Blocker, Fristen)

Warum:

- Macht aus Subsumio ein ausführendes Kanzlei-OS, das den Nutzer aktiv über Approvals, Blocker und Fristen informiert.

### Release 3: Contract Release

Enthält:

- Paket 4 Contract Review Workspace
- Paket 5 Word Add-in MVP
- Paket 5A Outlook Add-in MVP (E-Mail-zu-Akte)
- Clause Library
- Version History
- Paket 13 OCR/Document Intelligence MVP für Vertrags- und Anlagenimporte

Warum:

- Vertragsarbeit ist global einer der härtesten und wertvollsten Legal-AI-Märkte. Outlook-Integration ist Daily-Business.

### Release 4: Lifecycle + Communication Release

Enthält:

- Paket 6 CLM Light
- Paket 7 Intake
- Paket 7A WhatsApp Legal Chat Härtung
- Paket 15 Billing/Controlling MVP
- DocuSign/Obligation/Renewal Flow

Warum:

- Schließt die Lücke zwischen Mandantsanfrage, Vertrag, Freigabe, Folgepflichten, Abrechnung und WhatsApp-Kommunikation.

### Release 5: Defensible Review Release

Enthält:

- Paket 8 Bulk Review
- Paket 9 Matter Graph
- Similar Cases
- Quality Metrics

Warum:

- Hebt Subsumio von Produktivitätstool auf belastbares Legal-System.

### Release 6: Enterprise + DACH Release

Enthält:

- Paket 10 Governance
- Paket 10A DACH-Compliance Härtung (GoBD, DATEV, beA, RVG, Regulatory Monitoring)
- Paket 11 Marketplace
- Paket 12 UX polishing (inkl. Widget Dashboard, Notifications)
- Paket 16 Mobile/PWA/Offline/Push
- Paket 17 Content-Partner/Jurisdiction Expansion
- Paket 21 Marketing Agent & Lead Funnel
- Paket 27 Accessibility und Barrierefreiheit (BITV 2.0 / WCAG 2.2 AA / EAA)
- Paket 30 Kanzlei Knowledge Management und Precedent Bank

Warum:

- Macht das Produkt verkaufbar an größere Kanzleien und Legal Teams. DACH-Compliance ist der primäre Differentiator. Marketing Agent treibt organisches Wachstum. Barrierefreiheit ist für Enterprise-/Behörden-Vertrieb zunehmend Pflicht. Knowledge Management macht den Wissensgraphen zur kuratierten Kanzlei-Wissensbasis statt nur zur Suche.

### Release 7: Court, Ethics, Analytics und Migration Release

Enthält:

- Paket 22 Court Filing / beA-Send / ERV/XJustiz / Court Forms
- Paket 23 Legal Ethics, Privilege, Ethical Walls und AML/KYC
- Paket 24 Litigation Analytics und Judge/Docket Intelligence
- Paket 25 Real-time Co-Editing und Matter Collaboration Room
- Paket 26 Migration, Onboarding und Kanzlei-Datenübernahme

Warum:

- Diese Lücken entscheiden, ob Subsumio von "sehr gutes Kanzlei-OS mit AI" zu einer wirklich marktführenden Plattform wird: gerichtsfeste Einreichung, berufsrechtliche Schutzmechanik, strategische Prozessintelligenz, Zusammenarbeit ohne Versionschaos und verlässlicher Wechsel aus Altsystemen.

## Konkrete nächste Tickets

1. `P0-PROD-001`: Webhook-CSRF-Exemptions in `src/middleware.ts` fuer Stripe, WhatsApp, Resend und DocuSign fixen. **Status: fertig.**
2. `P0-PROD-002`: Provider-Webhook-Tests ohne CSRF-Header, aber mit Signatur/Auth-Gate ergaenzen. **Status: teilweise fertig; Middleware-Grenze getestet, route-nahe Provider-Signaturtests offen.**
3. `P0-PROD-003`: `cd server && bun run verify` gruen machen und Monorepo-Pfadfehler in Verify-Checks beheben.
4. `P0-PROD-004`: Playwright-E2E-Smoke mit Test-Engine oder Mock-Engine stabilisieren.
5. `P0-PROD-005`: CI-Branch-Ziele und Root-vs-`server/`-Gates vereinheitlichen.
6. `P0-PROD-006`: TOTP-Secrets und DocuSign Tokens verschluesselt speichern.
7. `P0-PROD-007`: Healthcheck in liveness/readiness splitten und Engine-Readiness mit API-Key pruefen.
8. `P0-PROD-008`: `undici` High-Vulnerability aus `npm audit --omit=dev` beheben.
9. `P0-CITE-001`: `src/lib/legal-grounding.ts` aus `analyze/route.ts` extrahieren.
10. `P0-CITE-002`: Grounding Response Types in `src/lib/types.ts` definieren.

Danach folgen:

- `P0-CITE-003`: `/api/think` mit Citation Gate ausstatten.
- `P0-CITE-004`: `/api/legal/contract-redline` mit Citation/Grounding-Metadaten erweitern.
- `P0-CITE-005`: Citation Badge UI-Komponente bauen (bestehendes `CitationLink.tsx` erweitern).
- `P0-SEC-001`: Prompt-Sanitizer für alle AI-Endpunkte aktivieren (`src/lib/prompt-sanitizer.ts`).
- `P0-SEC-002`: Virus-Scan für alle Upload-Pfade aktivieren (`src/lib/virus-scan.ts`).
- `P0-SEC-003`: Idempotency für alle Webhooks und Workflow-Steps durchsetzen (`src/lib/idempotency.ts`).
- `P0-SRC-001`: `legal_source_registry` Modell + API-Skeleton.
- `P0-EVAL-001`: `src/lib/rag-eval.ts` bereinigen, Fixture-Versionierung einführen und als Release-Gate definieren.
- `P0-DOCINT-001`: Upload-/Extraction-Statusmodell spezifizieren.
- `P0-DOCINT-002`: Duplicate Detection per SHA-256 in Upload-Pipeline planen und testen.
- `P0-WF-001`: Workflow Datenmodell und Statusmaschine spezifizieren (bestehendes `approval.ts` erweitern).
- `P0-WF-002`: `/dashboard/workflows` MVP-Screen.
- `P0-WF-003`: Realtime/SSE für Workflow-Status-Updates (bestehendes `realtime.ts` nutzen).
- `P0-CONTRACT-001`: Side-by-side Diff-Komponente für Contract Review (bestehendes `contract-redline-viewer.tsx` erweitern).
- `P0-CONTRACT-002`: Clause Annotation Type + API-Skeleton.
- `P0-OUTLOOK-001`: Outlook Add-in Auth-Flow mit API-Key-Management verbinden.
- `P0-WHATSAPP-001`: WhatsApp Intent-Parsing Unit-Tests für alle 25+ ParsedIntents.
- `P0-DACH-001`: GoBD-Verfahrensdokumentation Regressionstests ergänzen.
- `P0-DACH-002`: DATEV-Export-Regressionstests mit echten Szenarien.
- `P0-AUTH-001`: Account-Lockout Regressionstests (`src/lib/auth/lockout.ts`).
- `P0-AUTH-002`: 2FA-Backup-Codes Recovery-Flow testen (`src/lib/auth/backup-codes.ts`).
- `P0-AUTH-003`: Central API Handler als Pflicht für alle API-Routen (`src/lib/api-handler.ts`).
- `P0-PORTAL-001`: Portal-Token-Infrastruktur härten und Regressionstests (`src/lib/portal-token.ts`).
- `P0-PM-001`: AI Deadline Detection Regressionstests (`src/lib/ai-deadline-detect.ts`).
- `P0-PM-002`: Time-Tracking-API mit Billing verbinden (`src/app/api/time/route.ts`).
- `P0-INFRA-001`: Env-Validation beim Start pflicht (`src/lib/env-validate.ts`).
- `P0-INFRA-002`: Cron-Auth für alle Cron-Endpunkte prüfen (`src/lib/cron-auth.ts`).
- `P0-INFRA-003`: Error-Handling-Infrastruktur (`src/lib/errors.ts`) in allen API-Routen nutzen.
- `P0-DATA-001`: Datenklassifikationsvertrag für Brain Page, relationale Tabelle, Dateiobjekt, Event/Audit und transienten AI-Run definieren.
- `P0-DATA-002`: Modellkatalog für Source Registry, Workflows, Review Sets, Filing Packages, Ethics/AML, Analytics, Collaboration und Migration erstellen.
- `P0-DATA-003`: Tenant-Boundary-Tests für Brain/Org/Source-Isolation in Suche, Export, Portal, DMS und Analytics spezifizieren.
- `P0-DATA-004`: Backup/Restore-Probe als Release-0-Gate definieren.
- `P0-BRAIN-001`: Legal Context Graph Datenmodell und Matter Context Bundle für Akten, Dokumente, Kommunikation, Fakten, Aktivitäten und Berechtigungen spezifizieren.
- `P0-BRAIN-002`: Permission-aware Retrieval Tests für Org/Brain/Source/Matter/User/Ethical-Wall-Kontext definieren.
- `P0-BRAIN-003`: Retrieval Explainability UI/API für Quelle, Chunk/Page, Score, Search-Modus, Graph-Signal, Recency und Datenlücken planen.
- `P0-BRAIN-004`: Superbrain Eval Gate mit Matter Recall@K, Entity Resolution Precision, Freshness Accuracy und Source Leakage Rate = 0 definieren.
- `P0-BRAIN-005`: Akten-"Akte verstanden?"-Panel spezifizieren: Fakten, Lücken, Risiken, Frische, zuletzt geänderte Quellen.
- `P0-BRAIN-006`: Entity-Resolution-/Canonicalization-Modell für Personen, Firmen, Mandanten, Gegner, Gerichte und Richter spezifizieren.
- `P0-BRAIN-007`: Matter Context API Contract definieren, damit AI/Agents/Workflows keinen eigenen Kontext ad hoc bauen.
- `P1-BRAIN-008`: Experience-/Who-knows-Layer mit Kanzlei-Policy, Berechtigungen und ohne personenbezogene Leistungsrankings spezifizieren.
- `P1-BRAIN-009`: Feedback- und Korrekturloop für relevante/irrelevante/veraltete/falsche Treffer an Eval und Ranking anbinden.
- `P1-BRAIN-010`: Connector-Coverage-Matrix für DMS, Microsoft 365, Google Workspace, beA, DATEV, lokale Ordner und Uploads definieren.
- `P0-BRAIN-011`: Multi-Tenant-Architekturentscheidung für GBrain-Fork (Brain-pro-Org/Matter vs. Row-Level-Tenant-Key) dokumentieren und Isolation bis Page-/Chunk-/Fact-Ebene durchsetzen.
- `P0-BRAIN-012`: `facts/forget.ts` und `facts/decay.ts` retention-/legal-hold-aware machen; Legal Hold überschreibt Forget, jede Aktion auditierbar und reversibel.
- `P1-BRAIN-013`: Bestehende Engine-Eval-Harness (`eval/`, `eval-capture`, `routing-eval`, `eval-contradictions/`, LongMemEval/BrainBench) als Superbrain-Eval-Gate wiederverwenden statt neu bauen.
- `P1-BRAIN-014`: Legal Schema Pack (`schema-pack/base/gbrain-legal.yaml`) als versionierter Datenvertrag mit Migration und Entity-Resolution koppeln.
- `P1-BRAIN-015`: MCP-Exposure des Legal-Brains mit `remote=true`-Trust-Boundary (Tenant-/Matter-/Privilege-Filter, read-scope, Audit) bewerten.
- `P0-SKILL-001`: Kanzlei-Workflows als versionierte Legal-Skills modellieren und `check-resolvable` (Reachability/MECE/DRY) als CI-Gate aktivieren.
- `P0-SKILL-002`: Autonomen Brain-Loop (`cycle.ts`/`minions`) mit Audit, konfigurierbarem Human-Oversight-Gate und Spend-Cap (`minion-spend.ts`) absichern.
- `P1-SKILL-003`: Fork-Drift-Strategie gegenüber Upstream-GBrain (Sync-Kadenz/Divergenz, `llms.txt`-Regenerierung, Regressions-Pinning) dokumentieren.
- `P1-EFILE-001`: beA/ERV/eFiling Architekturentscheidung dokumentieren: direkter Versand, Partneradapter oder validierter Export.
- `P1-EFILE-002`: Filing Package Datenmodell mit Approval, Receipt, Fristkopplung und Audit spezifizieren.
- `P0-ETHICS-001`: Privilege-/Confidentiality-Labels für Matter, Dokumente, AI-Prompts und Exporte definieren.
- `P0-ETHICS-002`: Ethical-Wall- und AI-Provider-Policy Enforcement an `permissions.ts` und `model-config.ts` anbinden.
- `P1-AML-001`: AML/KYC Intake-Datenmodell und Review-Status an bestehenden Intake-/Conflict-Flow anbinden.
- `P1-LITAN-001`: Litigation-Analytics-Datenmodell für Gericht, Richter, Gegner, Kanzlei, Outcome und Dauer spezifizieren.
- `P1-COLLAB-001`: Collaboration Room MVP mit Teilnehmern, Versionen, Kommentaren, externem Sharing und Audit definieren.
- `P1-MIGRATE-001`: Migration Project Modell mit Mapping, Dry Run, Validierung, Delta-Import und Cutover-Report spezifizieren.
- `P0-PERF-001`: Performance-Budgets (Core Web Vitals) und API-p95-SLOs pro kritischer Route definieren.
- `P0-PERF-002`: k6/Artillery-Lasttest-Szenarien (Bulk-Upload, paralleles Review, SSE-Streams) und Performance-Regression-Gate aufsetzen.
- `P1-A11Y-001`: axe-core/Playwright-Baseline-Audit über Dashboard-Hauptflows nach WCAG 2.2 AA.
- `P1-A11Y-002`: Accessibility-CI-Gate aus instabilem E2E-Block in stabiles, blockierendes Smoke-Gate überführen.
- `P1-NOTIF-001`: Notification-Datenmodell (typisiert, tenant-isoliert) spezifizieren und `/api/notifications` über `createHandler()` härten.
- `P1-NOTIF-002`: Notification-Bell im Dashboard-Layout mit Realtime-Zustellung und gemeinsamer Push-Bridge (Paket 16).
- `P1-KM-001`: Knowledge Asset Modell für Precedents, Clauses, Playbooks, Checklisten, Memos und After-Action Reviews spezifizieren.
- `P1-KM-002`: Precedent Governance mit Freigabe, Versionierung, Confidentiality/Privilege Labels und Deprecation-Status definieren.
- `P1-KM-003`: Precedent Search und Drafting/Contract Review so erweitern, dass nur freigegebene Knowledge Assets als autoritativ genutzt werden.

## Risiken

| Risiko                                                              | Gegenmaßnahme                                                                                                                                 |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Zu viele Module gleichzeitig                                        | Releases hart sequenzieren: Trust vor Agenten, Agenten vor Vollautomatisierung.                                                               |
| AI halluziniert trotz UI                                            | Citation Gate und Attorney Review als technische Pflicht, nicht nur Text-Hinweis.                                                             |
| DACH-Content nicht breit genug                                      | Source Registry + Partneradapter früh bauen.                                                                                                  |
| Workflows werden zu komplex                                         | Erst fünf kanzlei-nahe Templates, kein generischer Workflow-Baukasten vor Release 2.                                                          |
| Word Add-in frisst Zeit                                             | API-first bauen, Add-in nur als dünne Oberfläche.                                                                                             |
| Enterprise-E-Discovery zu groß                                      | Defensible Review MVP für Kanzleien, nicht Relativity komplett kopieren.                                                                      |
| Scans und Anlagen bleiben undurchsuchbar                            | Paket 13 als Pflicht für Upload-/Review-Flows: OCR-Status, Extraction Quality, Re-run OCR.                                                    |
| Qualität wird subjektiv diskutiert                                  | Paket 14 macht Legal-RAG, Citation, Fristen und Contract Review messbar und release-blockierend.                                              |
| Kanzlei-Finanzprozesse bleiben zu schwach                           | Paket 15 bindet Zeit, Rechnung, RVG, DATEV, Trust/Anderkonto-Prüfung und AI-Spend zusammen.                                                   |
| Mobile Nutzung bleibt Demo statt Alltag                             | Paket 16 bekommt eigenes Smoke Gate, Push und Offline-Konfliktlösung.                                                                         |
| Autoritative Inhalte werden zu spät bedacht                         | Paket 17 baut Partner-/Knowledge-Pack-Adapter früh, ohne falsche Lizenzclaims.                                                                |
| Massenmarkt-Launch vor stabilen Gates                               | Release 0 als Pflichtgate: Webhooks, Engine-Verify, E2E-Smoke, Dependency-Audit und Readiness müssen grün sein.                               |
| Provider-Webhooks werden durch Browser-CSRF geblockt                | Webhook-Pfade in Middleware exempten und Signaturtests pro Provider pinnen.                                                                   |
| Engine und Web-App driften im Monorepo auseinander                  | Separate Root- und `server/`-CI-Gates mit klaren Branch-Zielen und reproduzierbaren lokalen Befehlen.                                         |
| Sensible Tokens liegen unverschlüsselt im Auth-Store                | Verschlüsselungspflicht für TOTP, DocuSign und alle API-/Provider-Tokens mit Regressionstests.                                                |
| Prompt Injection über AI-Endpunkte                                  | Paket 13A: Prompt-Sanitizer systemweit aktivieren, nicht nur für ausgewählte Endpunkte.                                                       |
| Malware über Upload-Pfade                                           | Paket 13A: Virus-Scan für jeden Upload-Pfad (Contract Review, Bulk Review, Intake, WhatsApp Media, E-Mail-Anlagen).                           |
| Doppel-Execution bei Webhook-Retrys                                 | Paket 13A: Idempotency-Store für alle Webhooks und Workflow-Steps durchsetzen.                                                                |
| Outlook Add-in wird ignoriert                                       | Paket 5A: Bestehenden Outlook Add-in als Release-Strang integrieren, E-Mail-zu-Akte ist Daily-Business.                                       |
| WhatsApp Legal Chat ungetestet                                      | Paket 7A: 25+ ParsedIntents brauchen Unit-Tests, Citation Gate und Audit-Trail.                                                               |
| DACH-Compliance-Features rosten                                     | Paket 10A: GoBD, DATEV, beA, RVG, Fristen, Regulatory Monitoring brauchen Regressionstests als Release-Gate.                                  |
| Bestehende Infrastruktur wird neu gebaut                            | Jedes Paket referenziert bestehende Code-Startpunkte und baut darauf auf, nicht neu.                                                          |
| beA/eFiling wird zu früh als echter Versand verkauft                | Paket 22 verlangt zuerst eine Architektur- und Zertifizierungsentscheidung; bis dahin nur validierter Export/Partneradapter mit ehrlicher UI. |
| Berufsrechtliche Risiken bleiben nur Policy-Text                    | Paket 23 macht Privilege, Ethical Walls, AML/KYC und Provider-Regeln zu technischen Gates mit Audit.                                          |
| Litigation Analytics erzeugt Scheingenauigkeit                      | Paket 24 erzwingt Source Registry, Sample Size, Coverage-Warnungen und keine Strategieaussage ohne Datenlage.                                 |
| Zusammenarbeit bleibt E-Mail-Versionenchaos                         | Paket 25 macht Version Locks, Compare/Merge, Kommentare, externe Räume und Audit zum eigenen Produktstrang.                                   |
| Kanzleien scheitern beim Wechsel aus Altsystemen                    | Paket 26 behandelt Migration als Produkt: Mapping, Dry Run, Delta-Import, Cutover-Report und Datenqualität.                                   |
| Client Portal ungetestet                                            | Paket 18: Portal-Tokens (HMAC-SHA256) brauchen Regressionstests, Security-Review und DSGVO-Konformität.                                       |
| Auth-Security hat Blindstellen                                      | Paket 19: Account-Lockout, 2FA-Backup-Codes, Session-Revocation und Rate-Limiting brauchen Regressionstests.                                  |
| Practice Management ist fragmentiert                                | Paket 20: Akten, Kontakte, Fristen, Zeiterfassung, Vault und Review-Queue müssen als zusammenhängendes System getestet werden.                |
| Marketing Agent verschenkt Leads                                    | Paket 21: Lead-Scoring, Slack-Notification und DSGVO-Consent müssen getestet sein.                                                            |
| API-Routen haben inkonsistentes Error-Handling                      | Paket 19: `createHandler()` als Pflicht-Wrapper, keine ad-hoc-Handler.                                                                        |
| Env-Vars fehlen beim Start                                          | Paket 0A: `env-validate.ts` muss alle kritischen Env-Vars beim Start prüfen.                                                                  |
| Cron-Endpunkte ungeschützt                                          | Paket 0A: `cron-auth.ts` für alle `/api/cron/`-Routen verwenden.                                                                              |
| Neue Modelle landen inkonsistent in Frontmatter, Tabellen und Audit | Paket 0B: Datenklassifikationsvertrag und Modellkatalog vor Feature-Implementierung.                                                          |
| Backup existiert, Restore ist ungeprüft                             | Paket 0B: Restore-Test und Audit-/Evidence-Bundle als Release-Gate.                                                                           |
| Mandantendaten leaken über Suche/Portal/DMS/Analytics               | Paket 0B: Tenant-Boundary-Tests für Org, Brain und Source als Pflicht.                                                                        |
| Barrierefreiheit nur als fehlschlagender E2E-Test                   | Paket 27: BITV 2.0 / WCAG 2.2 AA / EAA als eigenes Härtungspaket mit blockierendem a11y-CI-Gate.                                              |
| Massenmarkt-Launch ohne Performance-/Last-Nachweis                  | Paket 28: Core-Web-Vitals-Budgets, p95-SLOs und Lasttests als blockierendes Release-0-Gate.                                                   |
| Benachrichtigungen nur als Push gedacht, In-App fehlt               | Paket 29: bestehende `/api/notifications` zu zentralem, tenant-isoliertem In-App-Center mit Push-Bridge ausbauen.                             |
| Pakete nicht eindeutig sortiert/auffindbar                          | Master-Zuordnungstabelle als Single Source of Truth; kanonische Reihenfolge ist die Release-Spalte, nicht die Paketnummer.                    |
| Wissensgraph bleibt nur Suche statt Kanzlei-Know-how                | Paket 30: Precedent Bank, Best-Work-Curation, Freigabe, Versionierung und Knowledge Owner als eigener Produktstrang.                          |
| AI verwendet veraltete oder ungeprüfte Precedents                   | Paket 30: Deprecation, Aktualitätsstatus, Freigabestatus und Citation Gate für jedes Knowledge Asset.                                         |
| Superbrain wird als Marketing-Claim statt Produkt-Gate gebaut       | Paket 31: Context Graph, Matter Context Bundle, Retrieval Explainability und Eval-Gates als P0/P1.                                            |
| "Alles suchen" leakt vertrauliche Akten                             | Paket 31: Permission-aware Retrieval und Source Leakage Rate = 0 als blockierendes Gate.                                                      |
| AI antwortet trotz unvollständiger Akte zu selbstsicher             | Paket 31: Completeness/Coverage-Anzeige und "Insufficient Context" als Produktverhalten.                                                      |
| Wissen veraltet unbemerkt                                           | Paket 31: Freshness, Sync-Status, Temporal Memory und Widerspruchserkennung pro Akte.                                                         |
| Gleiche Person/Firma wird mehrfach oder falsch erkannt              | Paket 31: Entity Resolution, Aliase, Dublettenprüfung und Human Review Queue für unsichere Matches.                                           |
| Jeder Endpoint baut eigenen Kontext und driftet                     | Paket 31: Matter Context API Contract als einziger Kontextlieferant für AI, Agents und Workflows.                                             |
| Kanzlei-Erfahrung bleibt in Köpfen statt im System                  | Paket 31: Experience-/Who-knows-Layer mit Berechtigungen, Matter-Bezug und Kanzlei-Policy.                                                    |
| Retrieval verbessert sich nicht aus Nutzerfeedback                  | Paket 31: Feedback-/Korrekturloop in Eval-Fälle und Ranking einbauen, ohne heimliches Modelltraining.                                         |
| Superbrain behauptet Vollständigkeit trotz fehlender Quellen        | Paket 31: Connector-Coverage-Matrix mit Sync-, OCR-, Permission- und Indexstatus pro Quelle.                                                  |
| GBrain ist single-tenant, Subsumio ist multi-tenant                 | Paket 31: Multi-Tenant-Architekturentscheidung und Isolation bis Page-/Chunk-/Fact-Ebene als P0-Gate (Source Leakage Rate = 0).               |
| `forget`/`decay` löscht aufbewahrungspflichtige Inhalte             | Paket 31: Forget/Decay legal-hold- und retention-aware; Legal Hold überschreibt Forget; jede Aktion auditierbar und reversibel.               |
| Selbstwartender Brain-Loop ändert Recht ohne Aufsicht               | Paket 32: `cycle.ts`/`minions`/Self-Upgrade nur mit Audit, Human-Oversight-Gate, Spend-Cap und Rollback.                                      |
| Skill-System bleibt ungenutzt oder driftet                          | Paket 32: Legal-Skills versioniert, freigegeben und über `check-resolvable` (Reachability/MECE/DRY) als CI-Gate validiert.                    |
| Fork driftet von Upstream-GBrain weg                                | Paket 32: dokumentierte Sync-/Divergenz-Strategie, Regressions-Pinning und eigene `llms.txt`-Basis.                                           |

## Definition von "Beste Software" für dieses Projekt

Subsumio ist "beste Software", wenn folgende Prüfungen bestehen:

1. Ein Anwalt kann eine Mandatsanfrage aufnehmen und daraus in einem geführten Flow Akte, Konfliktprüfung, Dokumentenliste und Erstentwurf erzeugen.
2. Jede juristische AI-Ausgabe zeigt Quellenstatus, Zitate und Review-Pflicht.
3. Ein Vertrag kann in Word oder Web clause-level geprüft, redlined, freigegeben und signiert werden.
4. Eine Frist wird aus Dokumenten erkannt, korrekt berechnet, erinnert und auditierbar gespeichert.
5. Eine Due-Diligence- oder Litigation-Dokumentmenge kann mit Review-Set, Issue Coding, Hot Docs und Qualitätsmetriken geprüft werden.
6. Admins können sehen und steuern, welche Daten, Modelle, Quellen, Integrationen und Policies aktiv sind.
7. Alles ist DACH-/EU-kompatibel, mit GoBD, Datenschutz, Audit und Human Oversight.
8. Scans, PDFs, Bilder und große Anlagen werden zuverlässig extrahiert, OCR-geprüft, dedupliziert und durchsuchbar gemacht.
9. Jedes Release hat messbare Legal-AI-Qualitätswerte und blockiert kritische Regressionen.
10. Kanzlei-Finanzprozesse laufen von Zeit/RVG über Rechnung/Zahlung bis DATEV/Controlling sauber durch.
11. Mobile/PWA unterstützt kritische Fristen-, Approval-, Capture- und Offline-Flows.
12. Autoritative Rechtsdaten und Knowledge Packs können lizenz- und quellenbewusst angebunden werden.
13. E-Mails können aus Outlook direkt in die richtige Akte importiert werden, mit Anlagen, Kollisionsprüfung und Audit-Trail.
14. WhatsApp Legal Chat ist getestet, auditierbar und alle AI-Antworten haben Citation/Grounding-Metadaten.
15. GoBD-Verfahrensdokumentation, DATEV-Export, beA-Import/Entwurf/Export, RVG-Berechnung und Regulatory Monitoring sind regressionstest-gesichert; echter beA/ERV-Versand wird nur zertifiziert oder partnerfähig aktiviert.
16. Jeder AI-Endpunkt hat Prompt-Sanitization, jeder Upload-Pfad hat Virus-Scan, jeder Webhook hat Idempotency.
17. Bestehende Code-Infrastruktur (Approval, Realtime, Idempotency, Encryption, Audit Hash-Chain, Groundedness, Command Palette) wird erweitert, nicht neu gebaut.
18. Gerichtliche Einreichungen sind mindestens als validierte Filing Packages mit Approval, Fristkopplung, Hash, Receipt und Export nachvollziehbar; echter Versand wird nur zertifiziert/partnerfähig aktiviert.
19. Privilege, Vertraulichkeit, Ethical Walls, Konfliktprüfung, AML/KYC und AI-Provider-Policies werden technisch erzwungen, nicht nur in Nutzungsbedingungen erwähnt.
20. Streitige Verfahren erhalten quellenbewusste Litigation Analytics mit Gericht/Richter/Gegner-/Outcome-Daten, Sample-Size-Warnungen und Strategy Memo.
21. Interne Teams, Mandanten und Co-Counsel können in einem sicheren Matter Collaboration Room an Dokumenten, Kommentaren, Versionen und Freigaben arbeiten.
22. Kanzleien können aus Altsystemen mit Mapping, Dry Run, Delta-Import, Validierung und Cutover-Report sauber zu Subsumio wechseln.
23. Ein Mandant kann über einen sicheren Portal-Link Dokumente einsehen und Nachrichten senden — ohne Login, auditiert und DSGVO-konform.
24. Account-Lockout, 2FA-Backup-Codes, Session-Revocation und Rate-Limiting sind regressionstest-gesichert. Keine API-Route ohne passenden Handler-Wrapper (`createHandler`, `createWebhookHandler`, `createPublicHandler`).
25. Akten, Kontakte, Gegner, Fristen, Zeiterfassung, Kalender, Vault und Review-Queue funktionieren als zusammenhängendes Practice-Management-System.
26. AI-Fristenerkennung (Hybrid Regex+AI) erkennt absolute Daten, relative Fristen, gesetzliche Fristen und Rechtsmittelfristen zuverlässig für DE/AT/CH.
27. Marketing Agent erfasst Leads mit AI-Scoring, benachrichtigt Sales via Slack + E-Mail und alle Marketing-Pages sind SEO-optimiert und DSGVO-konform.
28. Environment-Validation, Logger, Error-Handling und Cron-Auth sind als Infrastruktur-Pflicht in jeder API-Route aktiv.
29. Jedes neue Legal-OS-Modell hat vor Implementierung einen klaren Speicherort, Tenant-Key, Migration, Audit-Events, Export-/Restore-Verhalten und Datenqualitätsregeln.
30. Kritische Kanzlei-Flows erfüllen WCAG 2.2 AA, sind per Tastatur und Screenreader bedienbar, und ein blockierendes a11y-CI-Gate verhindert Regressionen.
31. Subsumio hält unter realistischer Last definierte p95-Latenzen und Core-Web-Vitals-Budgets; Performance-Regressionen blockieren das Release.
32. Fristen, Approvals, Portal-Nachrichten, Workflow-Blocker und Filing-Receipts erscheinen als tenant-isolierte In-App-Benachrichtigungen mit Realtime-Zustellung und gemeinsamer Push-Bridge.
33. Internes Kanzleiwissen wird als freigegebene, versionierte und governance-konforme Knowledge Assets kuratiert und in Precedent Search, Drafting, Contract Review und Workflows wiederverwendet.
34. AI darf interne Precedents nur dann als autoritativ verwenden, wenn Freigabestatus, Aktualität, Confidentiality/Privilege Labels und Citation/Grounding passen.
35. Jede AI-/Search-/Agent-Aktion nutzt einen berechtigungsbewussten Matter Context und darf keine gesperrten Akten, Quellen oder Privilege-Bereiche leaken.
36. Das Kanzlei-Superbrain zeigt pro Akte Quellenabdeckung, Indexfrische, OCR-/Sync-Status, Fakten, Widersprüche, Lücken und zuletzt geänderte Informationen.
37. Jede Superbrain-Antwort erklärt, warum Quellen/Fakten gewählt wurden, welche Daten fehlen und wann der Kontext zuletzt aktualisiert wurde.
38. Superbrain-Qualität wird messbar: Matter Recall@K, Entity Resolution Precision, Freshness Accuracy, Contradiction Detection und Source Leakage Rate = 0.
39. Personen, Firmen, Mandanten, Gegner, Gerichte und Richter werden kanonisch aufgelöst; unsichere Matches gehen in Human Review.
40. AI, Agents und Workflows beziehen Kontext über einen einheitlichen Matter Context API Contract, nicht über ad-hoc-Zusammenbau.
41. Das Superbrain beantwortet "wer weiß dazu etwas?" über einen berechtigungs- und policy-gesteuerten Experience-/Who-knows-Layer.
42. Nutzerfeedback zu Treffern und Fakten verbessert Retrieval/Evals nachvollziehbar, ohne heimliches Training auf Mandantendaten.
43. Jede Quelle im Superbrain hat sichtbaren Auth-, Sync-, OCR-, Permission- und Indexstatus.
44. Die Multi-Tenant-Architektur des GBrain-Forks ist verbindlich entschieden und isoliert Org/Matter/Privilege bis auf Page-/Chunk-/Fact-Ebene; Cross-Tenant-Leaks sind als Gate ausgeschlossen.
45. `forget`/`decay` löscht nie Inhalte unter Aufbewahrungspflicht oder Legal Hold; jede Aktion ist auditierbar und reversibel.
46. Kanzlei-Workflows sind als versionierte, freigegebene Legal-Skills abgebildet und über `check-resolvable` (Reachability/MECE/DRY) als CI-Gate validiert.
47. Jede autonome Brain-Operation (`cycle`/`minions`/Self-Upgrade) ist auditiert, oversight- und spend-begrenzt; es existiert eine dokumentierte Fork-Sync-/Divergenz-Strategie gegenüber Upstream-GBrain.
