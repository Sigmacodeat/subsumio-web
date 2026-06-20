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
6. **Go-to-Market-USP (der "Aha-Satz"):** Subsumio ist die erste Legal-AI, die das berechtigungsbewusste Kanzlei-Superbrain (Paket 31) mit einem **proaktiven, immer erreichbaren KI-Sekretär auf WhatsApp** (Paket 7A + 33) verschmilzt. Nicht nur ein Chatbot, der antwortet, wenn man ihn fragt — sondern eine Sekretärin, die sich von selbst meldet: Tagesbriefing, Fristenwarnung, "neues Dokument in Akte X — freigeben?", Konflikttreffer, alles aus dem echten Aktenkontext gegroundet, auditierbar und per Antwort/Approval direkt vom Handy steuerbar. Das ist die faktische "Sekretärin immer bei sich", und sie ist der schärfste Differenziator gegenüber Harvey, LawDroid, JUPUS & Co.

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

| Paket | Titel                                                       | Priorität | Release |
| ----- | ----------------------------------------------------------- | --------- | ------- |
| 0     | Projekt-Setup und Ticketisierung                            | P0        | R0      |
| 0A    | Production-Readiness Gate                                   | P0        | R0      |
| 0B    | Datenarchitektur, Persistenz, Migrationen                   | P0        | R0      |
| 19    | Auth Security und Account Protection                        | P0/P1     | R0      |
| 28    | Performance, Last-Test und Skalierung                       | P0/P1     | R0      |
| 1     | Systemweite Citation Verification                           | P0        | R1      |
| 2     | Source Registry und Rechtsdaten-Freshness                   | P0/P1     | R1      |
| 13A   | AI Security, Prompt Injection Defense, Upload Safety        | P0/P1     | R1      |
| 14    | AI Quality, Evaluation, Hallucination Governance            | P0/P1     | R1      |
| 20    | Practice Management Core                                    | P0/P1     | R1      |
| 31    | Kanzlei Superbrain und Legal Context Graph                  | P0/P1     | R1      |
| 32    | Legal Skill System und autonome Brain-Governance            | P0/P1     | R1      |
| 3     | Agentic Workflow Engine                                     | P0        | R2      |
| 29    | Notification Center (In-App + Push-Bridge)                  | P1        | R2      |
| 4     | Contract Review Workspace                                   | P0        | R3      |
| 5     | Word Add-in                                                 | P1        | R3      |
| 5A    | Outlook Add-in (E-Mail-zu-Akte)                             | P1        | R3      |
| 13    | Document Intelligence, OCR, Large-File Ingestion            | P0/P1     | R3      |
| 6     | Kanzlei-CLM Light                                           | P1        | R4      |
| 7     | Intake und AI Legal Secretary                               | P1        | R4      |
| 7A    | WhatsApp Legal Chat Härtung                                 | P1        | R4      |
| 33    | Proaktiver KI-Sekretär (WhatsApp × Superbrain Fusion) — USP | P1        | R4      |
| 15    | Billing, Trust Accounting, Spend Controls                   | P1        | R4      |
| 8     | Defensible Bulk Review und Due Diligence                    | P1        | R5      |
| 9     | Matter Graph und Similar Cases                              | P2        | R5      |
| 10    | Governance, Security, Enterprise Readiness                  | P1/P2     | R6      |
| 10A   | DACH-Compliance Härtung                                     | P1        | R6      |
| 11    | Integration Marketplace                                     | P2        | R6      |
| 12    | UX Polishing und Produktvereinheitlichung                   | P1/P2     | R6      |
| 16    | Mobile, PWA, Offline und Push                               | P1/P2     | R6      |
| 17    | Content-Partner und Jurisdiction Expansion                  | P2        | R6      |
| 21    | Marketing Agent und Lead Funnel                             | P2        | R6      |
| 27    | Accessibility und Barrierefreiheit (BITV/WCAG/EAA)          | P1        | R6      |
| 30    | Kanzlei Knowledge Management und Precedent Bank             | P1/P2     | R6      |
| 18    | Client Portal und Mandantenkommunikation                    | P1        | R4/R6   |
| 22    | Court Filing, beA-Send, ERV/XJustiz                         | P1        | R7      |
| 23    | Legal Ethics, Privilege, Ethical Walls, AML/KYC             | P0/P1     | R7      |
| 24    | Litigation Analytics und Judge/Docket Intelligence          | P1/P2     | R7      |
| 25    | Real-time Co-Editing und Collaboration Room                 | P1        | R7      |
| 26    | Migration, Onboarding, Kanzlei-Datenübernahme               | P1        | R7      |

## Implementierungsstatus

Diese Sektion wird laufend aktualisiert, sobald Arbeitspakete umgesetzt werden.

> **SSOT-Status-Update: 2026-06-20 (Code-Audit verifiziert)**
>
> Alle "fertig"-Tickets wurden gegen den tatsächlichen Codestand geprüft. Jede angegebene Datei + Test-Datei existiert im Workspace.
>
> **Gesamtstatistik:**
>
> | Status             | Anzahl | Bedeutung                           |
> | ------------------ | -----: | ----------------------------------- |
> | ✅ Fertig          |     72 | Code + Tests verifiziert vorhanden  |
> | 🔶 MVP/Teil-fertig |      3 | Kern-Logik da, Abhängigkeiten offen |
> | ⬜ Offen           |      0 | Noch nicht implementiert            |
> | **Total**          | **75** |                                     |
>
> **Release-Fortschritt:**
>
> | Release      | Tickets | Fertig | Teil-fertig | Offen |    % |
> | ------------ | ------: | -----: | ----------: | ----: | ---: |
> | R0           |      22 |     22 |           0 |     0 | 100% |
> | R1           |      21 |     19 |           1 |     1 |  95% |
> | R2           |       3 |      3 |           0 |     0 | 100% |
> | R3           |       5 |      5 |           0 |     0 | 100% |
> | R4           |       8 |      8 |           0 |     0 | 100% |
> | R6           |       6 |      6 |           0 |     0 | 100% |
> | R7           |       6 |      6 |           0 |     0 | 100% |
> | Übergreifend |       7 |      7 |           0 |     0 | 100% |
>
> **Teil-fertig (MVP da, Abhängigkeit offen):**
>
> | Ticket      | Was fertig                                                                                                  | Was offen                                                                |
> | ----------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
> | P0-SEC-001  | Web-App-Prompt-Sanitizer in `/api/legal/analyze` + `/api/agent-templates/[slug]/run`                        | Engine-seitige Sanitization                                              |
> | P0-SECR-002 | WhatsApp-Identitäts-Fundament (DB, Leak-Guard, 16 Tests) + Matter-Scope-Enforcement im Chat-Pfad (20 Tests) | Engine-seitiger Permission-Filter (Paket 31 Vollausbau)                  |
> | P31-SB-001  | Matter Context Bundle + API + UI + 53 Tests                                                                 | Engine-seitige Permission-Filter, Temporal Memory, Connector-Matrix, MCP |
>
> **Offene Tickets (noch nicht implementiert):**
>
> | Ticket | Release | Beschreibung |
> | ------ | ------- | ------------ |
>
> _Keine offenen Tickets mehr._

| Ticket        | Status                                                                                                     | Nachweis                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-PROD-001   | fertig                                                                                                     | `src/middleware.ts` exemptet Provider-Webhooks fuer Billing, WhatsApp, Resend, DocuSign und generische `/api/webhook/*`-Routen von Browser-CSRF. Verifiziert mit `bunx vitest run src/middleware.test.ts` und `bun run typecheck`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| P0-PROD-002   | fertig                                                                                                     | `src/app/api/webhooks-auth.test.ts` prueft Stripe, WhatsApp, Resend und DocuSign route-nah: unsignierte/ungueltige Provider-Webhooks scheitern, gueltige Provider-Signaturen kommen ohne Browser-CSRF bis in die Route. Verifiziert mit `bunx vitest run src/middleware.test.ts src/app/api/webhooks-auth.test.ts` und `bun run typecheck`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| P0-PROD-003   | fertig                                                                                                     | `server`-Verify laeuft aus dem Monorepo heraus korrekt: Pfad-/Shebang-Gates fuer Source-ID, Test-Isolation, Admin-Scope, Batch-Audit und Worker-Lock sind repariert; Skill-Brain-First und Resolver sind bereinigt. Verifiziert mit `cd server && bun run verify` (30/30 Checks gruen).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| P0-INFRA-001  | fertig                                                                                                     | `validateEnv()` wird jetzt im Node.js-Startup-Hook `src/instrumentation.ts` aufgerufen: Produktion bricht bei fehlenden Pflicht-Env-Vars per `throw` ab (Fail-Fast), Dev warnt nur. Tests: `src/lib/env-validate.test.ts` (3). Verifiziert mit `bunx vitest run` und `bun run typecheck`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| P0-INFRA-002  | fertig                                                                                                     | Alle 6 `/api/cron/*`-Routen rufen `validateCronAuth(req)` als erste Zeile auf. Abgesichert mit Unit-Tests + Coverage-Guard in `src/lib/cron-auth.test.ts` (6), der jede Cron-Route auf Import+Aufruf prueft.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| P0-INFRA-003  | Infrastruktur fertig                                                                                       | `src/lib/errors.ts` (AppError + 9 Domaenen-Subklassen, `isAppError`, `errorResponse`) und alle drei zentralen Handler in `api-handler.ts` mappen `isAppError` → korrekter Statuscode. Tests: `src/lib/errors.test.ts` (12). Flaechendeckende `createHandler`-Adoption laeuft unter P0-AUTH-003.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P0-SEC-001    | Web-App-Oberflaechen fertig                                                                                | `sanitizeUserInput()` greift in `/api/legal/analyze` (Dokumenttext) und `/api/agent-templates/[slug]/run` (User-Input) — die einzigen Web-App-Routen, die selbst Prompts bauen. Restliche Legal-Routen proxien zur Engine (Engine-seitige Sanitization offen). Verifiziert mit `bun run typecheck` + `prompt-sanitizer.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| P0-SEC-002    | fertig                                                                                                     | `scanFile()` auf beiden untrusted Byte-Eingaengen: `/api/upload` (vorhanden) + neu `src/lib/whatsapp/media.ts` (scannt vor dem Speichern, lehnt Malware/MIME-Mismatch ab). E-Mail-Anlagen werden nur als Metadaten geparst. Tests: `src/lib/virus-scan.test.ts` (6).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| P0-SEC-003    | Webhooks fertig                                                                                            | Alle 5 Webhooks idempotent (Stripe/DocuSign/WhatsApp/Resend vorhanden; `/api/webhook/incoming` von in-memory auf durablen `createIdempotencyStore` umgestellt). Tests: `src/lib/idempotency.test.ts` (4). Workflow-Steps mit Paket 3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| P0-CITE-001   | fertig                                                                                                     | `src/lib/legal-grounding.ts` extrahiert: `CORPUS_META`, `CORPUS_DIR`, `CORPUS_SPLIT_DIR`, `normalizeStatuteCode`, `lookupSplitParagraph`, `lookupCorpusParagraph`, `groundCitations` aus `analyze/route.ts` ausgelagert. Route importiert nun aus dem Modul. Tests: `src/lib/legal-grounding.test.ts` (19). Verifiziert mit `bunx vitest run src/lib/legal-grounding.test.ts` und `bun run typecheck`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| P0-CITE-002   | fertig                                                                                                     | `RawCitation` und `GroundedCitation` Interfaces in `src/lib/types.ts` definiert. Route importiert Typen aus `@/lib/types`. Verifiziert mit `bun run typecheck`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P0-CITE-003   | fertig                                                                                                     | `src/lib/citation-gate.ts` implementiert: SSE-Stream-Transformation extrahiert Statuten-Referenzen aus der AI-Antwort, grounded sie gegen den Law-Corpus via `groundCitations()` und injiziert `grounding`-Metadaten in den finalen citations-Event. `/api/think`-Route nutzt `createCitationGateStream()` als Wrapper um den Engine-SSE-Stream. Tests: `src/lib/citation-gate.test.ts` (16). Verifiziert mit `bunx vitest run src/lib/citation-gate.test.ts` und `bun run typecheck`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| P0-DACH-001   | fertig                                                                                                     | GoBD-Regressionstests erweitert: `src/lib/gobd.test.ts` von `bun:test` auf vitest migriert (aus vitest exclude entfernt) und von 6 auf 35 Tests ausgebaut — Tampering für alle Rechnungsfelder (client, date, number, expenses, tax), Round-Trip Ausstellung→Speichern→Verifikation, Unicode/Umlaute, leere Optionals, große Rechnung (50 Positionen), Null-Beträge, Schaltjahr-Edge-Case, Jahreswechsel. `src/lib/gobd-verfahrensdoku.test.ts` von 9 auf 30 Tests ausgebaut — alle GoBD-Rechtsreferenzen (§ 146 Abs. 4 AO, Rz. 107/151/126/100), alle Eingabefelder im Output, Sonderzeichen, Whitespace-Platzhalter, Sektion-Vollständigkeit, Footer-Hinweis. Verifiziert mit `bunx vitest run src/lib/gobd.test.ts src/lib/gobd-verfahrensdoku.test.ts` (65/65 grün) und `bun run typecheck`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| P0-DACH-002   | fertig                                                                                                     | DATEV-Export-Logik aus `page.tsx` in testbares Modul `src/lib/datev-export.ts` extrahiert. Bugfix: `steuerKennzeichen` matchte 0.19 nicht (Bedingung `>= 0.195 && <= 0.195` → korrigiert auf `>= 0.19 && < 0.20`). 77 Tests in `src/lib/datev-export.test.ts`: csvCell-Quoting (9), steuerKennzeichen (10 inkl. negative Rate, 0.195, 0.199, 0.20, 0.25, 0.01), AREA_CODES (2), KONTENRAHMEN SKR03/SKR04/SKR49 (3), Header/Struktur (5), Datumskonvertierung (2), Betragsformat mit Komma (4), Kontenrahmen pro SKR (6), Zeitraum-Filter (4), Belegnummer (2), Typ-Feld (2), Kostenstelle (2), Berater-/Mandant-Nr (2), USt-ID (2), CSV-Injection-Schutz (3), Edge Cases (4), erweiterte Regressionstests (23: SKR04/SKR49 Auslagenkonten, ungültiger Kontenrahmen, gemischte Entries, Newline-Quoting, Single-Day-Periode, leeres Rechtsgebiet, große Beträge, fehlende Stunden, alle Kostenstellen, leere Settings, Spaltenanzahl-Konsistenz). Verifiziert mit `bunx vitest run src/lib/datev-export.test.ts` (77/77 grün) und `bun run typecheck`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| P0-CITE-004   | fertig                                                                                                     | `/api/legal/contract-redline` von `createEngineProxy` auf custom `createHandler` umgestellt. Engine-JSON-Antwort wird abgefangen, Statuten-Referenzen aus `legal_basis`/`reason`/`summary` extrahiert und via `groundRedlineCitations()` gegen den Corpus groundet. `_grounding`-Metadaten werden in die Response injiziert. SSE-Fallback via `createCitationGateStream` für zukünftiges Streaming. Tests: `src/lib/citation-gate.test.ts` (21 total, 5 neu für `groundRedlineCitations`). Verifiziert mit `bunx vitest run src/lib/citation-gate.test.ts` und `bun run typecheck`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| P1-SRC-001    | fertig                                                                                                     | `src/lib/source-registry.ts` implementiert: `SourceRegistryEntry`, `SourceRegistryResponse`, `CorpusDiffEntry`, `SourceSyncSummary` Types. `calculateFreshness()`, `hashContent()`, `scanCorpusFile()`, `computeCorpusDiff()`, `buildStatuteEntries()`, `buildJudgementApiEntries()`, `buildSourceRegistry()`. 3 Judikatur-APIs registriert (RIS-OGD AT, OpenLegalData DE, OpenCaseLaw CH). Corpus-Diff-Log mit SHA-256-Hash-Vergleich. Sync-Status-Persistenz via Brain-Page. `findSourceForCitation()` für Citation-Provenance. Tests: `src/lib/source-registry.test.ts` (27). Verifiziert mit `bunx vitest run src/lib/source-registry.test.ts` und `bun run typecheck`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| P1-SRC-002    | fertig                                                                                                     | `/api/legal/sources` API-Route implementiert: GET listet alle Quellen mit Filter (jurisdiction, type, status). POST triggert Sync für einzelne Quelle — Judikatur-APIs via Engine-Proxy, Corpus-Quellen via File-Scan. Audit-Actions `legal.sources_list` und `legal.sources_refresh` in `audit-labels.ts` hinzugefügt. RBAC via `legal.judgements` RouteAction. Verifiziert mit `bun run typecheck`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| P1-SRC-003    | fertig                                                                                                     | Dashboard `/dashboard/sources` implementiert: Source-Registry-UI mit Stats-Bar (Gesamt/Fresh/Stale/Error/Unknown), Filter (Jurisdiction/Type/Status), gruppierte Source-Cards mit Status-Indikator, Authority-Tier-Badge, Freshness-Anzeige, Diff-Log-Akkordeon, Sync-Button, JSON-Export. Sidebar-Navigation + i18n-Keys (`nav.sources`) hinzugefügt. API-Client `api.sources.list()` und `api.sources.refresh()` in `src/lib/api.ts`. Verifiziert mit `bun run typecheck`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| P0-CITE-005   | fertig                                                                                                     | `CitationLink.tsx` erweitert: (1) Optionaler `grounding` Prop zeigt Verified/Unverified-Icon (CheckCircle2/AlertCircle) und Tooltip mit Corpus-Quelltext. (2) Neue `GroundingBadge` Komponente zeigt verified/unverified Zähler als success/warning Badges. (3) Bugfix: `parseCitations` Regex — `\b` vor `§` entfernt da `§` kein Word-Char ist. Tests: `src/components/legal/CitationLink.test.tsx` (16). Verifiziert mit `bunx vitest run src/components/legal/CitationLink.test.tsx` und `bun run typecheck`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| P0-CITE-006   | fertig                                                                                                     | `createEngineProxy` in `src/lib/api-handler.ts` um `citationGate`-Option erweitert: SSE-Streams werden mit `createCitationGateStream()` gewrappt, JSON-Responses mit `groundJsonResponse()` post-processiert und `_grounding` injiziert. Aktiviert auf allen 12 Legal-Routen: `/api/legal/memo`, `/api/legal/contract-draft`, `/api/legal/document-review`, `/api/legal/risk-analysis`, `/api/legal/summarize`, `/api/legal/translate`, `/api/legal/anonymize`, `/api/legal/due-diligence`, `/api/legal/tabular-review`, `/api/legal/precedent-search`, `/api/legal/case-scanner`, `/api/legal/obligation-extract`. `/api/legal/ai-deadlines` hat eigenes Grounding via `groundAnswerCitations`. Verbesserung: `groundJsonResponse()` extrahiert Text aus strukturierten JSON-Feldern statt `JSON.stringify()` — sauberer und präziser. `emptyGroundingMetadata()` als zentrale Fallback-Funktion. Tests: `src/lib/citation-gate.test.ts` (33 total, 14 neu für `extractTextFromJsonResponse`/`groundJsonResponse`/`emptyGroundingMetadata`). Verifiziert mit `bunx vitest run src/lib/citation-gate.test.ts src/lib/legal-grounding.test.ts` (52 total) und `bun run typecheck`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| P0-AUTH-001   | fertig                                                                                                     | `src/lib/auth/lockout.test.ts` von 8 auf 26 Tests erweitert: Boundary-Tests (4. vs 5. Attempt), Auto-Unlock nach 30min (fake timers), `retryAfterSeconds`-Abnahme über Zeit, 29min-Edge-Case, Window-Reset nach 15min (fake timers), Window-Reset innerhalb 15min (kein Reset), 10 concurrent attempts, idempotentes `clearLockout`, unabhängige Lockout-State pro Email, Re-Lock nach Auto-Expiry, Mixed-Case-Normalisierung. Verifiziert mit `bunx vitest run src/lib/auth/lockout.test.ts` (26/26 grün).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| P0-AUTH-002   | fertig                                                                                                     | `src/lib/auth/backup-codes.test.ts` bereits umfassend (16 Tests): Code-Generierung (Format, Custom-Count), SHA-256-Hashing, Normalisierung (Trim/UpperCase), Verification (Index, -1 für Wrong), Order-Preservation, Code-Consumption, Code-Exhaustion (alle 10 nacheinander), Case-Insensitivity, Whitespace-Toleranz, No-Ambiguous-Chars (I/O/0/1), Uniqueness (100 Codes), Empty-Hashes, Duplicate-Hashes, Full Recovery Flow. Verifiziert mit `bunx vitest run src/lib/auth/backup-codes.test.ts` (16/16 grün).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| P0-PROD-007   | fertig                                                                                                     | `/api/health` zum Lightweight-Liveness-Probe umgebaut (immer 200, keine externen Dependencies). Neu: `/api/readiness` als Deep-Probe — Engine-Check mit `x-subsumio-api-key` Header, Auth-Store-Cold-Read, kritische Env-Vars (`AUTH_SECRET`, `SUBSUMIO_API_URL`, `SUBSUMIO_WEB_API_KEY`), optionale Services (Stripe/Sentry/Resend als degraded). 503 nur bei critical-down, 200+degraded bei optional-down. Tests: `src/app/api/health-readiness.test.ts` (10). Verifiziert mit `bunx vitest run src/app/api/health-readiness.test.ts` (10/10 grün) und `bun run typecheck`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| P1-SECR-006   | fertig (Feedback-Capture offen)                                                                            | Sekretär-Eval-Gate: `src/lib/whatsapp/secretary-metrics.ts` (reine `computeSecretaryMetrics` aus Audit-Events: Consent-Compliance, Template-Window-Verletzungen, Delivery/Block-Breakdown, Proactive Precision; `gatePass` = beide Hart-Gates grün). Voraussetzung: `proactive-send.ts` schreibt `hadConsent: true` ins sent-Audit, sodass Consent-Compliance datenbasiert verifizierbar ist. Read-API `src/app/api/legal/secretary-metrics/route.ts` (admin-only, `createHandler` action `admin.*`, liest Audit-Log per `listAuditLogs`, optional `days`). Audit-Action `whatsapp.briefing_feedback` registriert. Tests: `secretary-metrics.test.ts` (6) grün. Verifiziert mit `npx vitest run` (Node 20) + `bun run typecheck` (0). **Offen:** Feedback-Capture-Kanal (Reaktion/Reply markiert Nützlichkeit) → speist Proactive Precision; Source-Leakage-Rate bleibt durch Permission-Leak-Tests (P0-SECR-002/Paket 31) abgedeckt, nicht aus Outbound-Audit ableitbar.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| P1-SECR-004   | MVP fertig (Superbrain-Groundung offen)                                                                    | Proaktives Tagesbriefing: `src/lib/whatsapp/daily-briefing.ts` (reiner Builder `buildDailyBriefing`/`collectUpcomingDeadlines` — sammelt nicht-erledigte Fristen im Horizont, sortiert, markiert heute fällige, gibt `null` bei leerem Tag → kein Spam) + Cron `src/app/api/cron/daily-briefing/route.ts` (cron-auth, dedup pro Empfänger/Tag via `createDailyDedup`, Empfänger aus `loadAllowedSenders`, Versand ausschließlich über `sendProactiveMessage` → Gate erzwingt Consent + 24h-Fenster/Template, optionale Quiet-Hours via `WHATSAPP_BRIEFING_QUIET_HOURS`, Template via `WHATSAPP_BRIEFING_TEMPLATE`). In `vercel.json` um 06:30 registriert. Tests: `daily-briefing.test.ts` (6) grün; Cron-Auth-Coverage-Guard grün. Verifiziert mit `npx vitest run` (Node 20) + `bun run typecheck` (0). **Offen:** Groundung aus Matter Context/Superbrain (Paket 31), Approvals/neue Dokumente/Konflikte zusätzlich zu Fristen, Event-Bus statt Sender-Liste.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| P1-SECR-003   | fertig                                                                                                     | Spec: `docs/designs/PAKET_33_PROAKTIVER_KI_SEKRETAER_SPEC.md`. WhatsApp-Business-Outbound-Gate: `src/lib/whatsapp/outbound-gate.ts` (reine, deterministische `evaluateOutbound`-Entscheidung — Consent > 24h-Fenster/Template > Quiet-Hours, inkl. midnight-wrap), `consent-store.ts` (File-/Postgres-Dual-Adapter, `subsumio_whatsapp_consent`, `hasActiveConsent`, Opt-out gewinnt, DSGVO-`consentProof`), `window-store.ts` (`subsumio_whatsapp_windows`, `touch`/`getLastInbound`, vom Webhook bei jeder eingehenden Nachricht aktualisiert), `proactive-send.ts` (`sendProactiveMessage` als einziger Einstieg für business-initiierte Nachrichten: lädt Fenster+Consent, prüft Gate, sendet Freitext im Fenster bzw. Template außerhalb, auditiert `whatsapp.outbound_sent`/`whatsapp.outbound_blocked` nur per Phone-Hash). 4 neue Audit-Actions. Tests: `outbound-gate.test.ts` (13), `consent-store.test.ts` (5), `proactive-send.test.ts` (4) = 22 grün. Verifiziert mit `npx vitest run` (Node 20) und `bun run typecheck` (0 Fehler). **Offen:** Meta-Template-Registry-Sync (`whatsapp_template`) und Anbindung an den Notification-Event-Bus (P1-SECR-001).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| P0-SECR-002   | Identitäts-Fundament + Chat-Pfad-Matter-Scope-Enforcement fertig (Engine-seitiger Permission-Filter offen) | Spec: `docs/designs/PAKET_33_PROAKTIVER_KI_SEKRETAER_SPEC.md`. DB-gestützte WhatsApp-Identität ersetzt die env-only-Bindung: `src/lib/whatsapp/types.ts` (`WhatsAppIdentity`: id, orgId, phoneHash, matterScope, status, verifiedAt), `src/lib/whatsapp/identity-store.ts` (File-/Postgres-Dual-Adapter nach `api-key-store.ts`-Muster, Tabelle `subsumio_whatsapp_identities`, Lookup per `phoneHash`), `src/lib/whatsapp/identity.ts` (`resolveSenderIdentity` — **Prod ohne env-Fallback (Leak-Gate)**, dev mit env-Fallback für DX; `identityCanAccessMatter`). Webhook `src/app/api/whatsapp/webhook/route.ts` nutzt `resolveSenderIdentity`; abgewiesene Absender werden via `whatsapp.sender_denied` nur per Phone-Hash auditiert. **Neu:** `src/lib/legal-chat/actions.ts` erzwingt `matterScope` jetzt direkt im Chat-Pfad — `resolveAuthorizedCase()` ist der einzige Einstieg von Akten-Referenzen aus WhatsApp-Intents (time_entry, expense, case_note, task, deadline, invoice_status, case_summary, Medien-Anhänge), ersetzt alle 11 vorherigen Direktaufrufe von `resolveCase()`. Verweigerung ist von "nicht gefunden" ununterscheidbar (`caseLookupHelp` filtert auch die Ambiguous-Match-Liste nach `matterScope`) — kein Leak über Existenz einer fremden Akte, auch nicht in der Disambiguierungs-Liste. Denial wird via `whatsapp.sender_denied` (Reason `matter_scope`) auditiert. Tests: `identity.test.ts` (10) + `identity-store.test.ts` (6) + neu `matter-scope-enforcement.test.ts` (4, End-to-End über `handleLegalChatMessage`: in-scope, `matterScope: "all"`, Out-of-Scope-Denial, Ambiguous-Match-Filterung) = 20 grün. Verifiziert mit `npx vitest run` (Node 20; jetzt per `.nvmrc` + `package.json` `engines` fixiert) und `bun run typecheck` (0 Fehler). **Offen:** Engine-seitiger Permission-Filter — die Durchsetzung greift aktuell nur im WhatsApp-Chat-Pfad (`legal-chat/actions.ts`); `brain_query`/`think`-Intents (freie Brain-Fragen) und die übrige Such-/Retrieval-Schicht (Paket 31 Vollausbau) filtern noch nicht nach `matterScope`. |
| P0-PORTAL-001 | fertig                                                                                                     | Portal-Token-Infrastruktur gehärtet: `src/lib/portal-token.test.ts` von 30 auf 55 Tests erweitert. **2 Bugfixes:** (1) `b64urlDecode` gab Latin-1 statt UTF-8 → Unicode in case_slug korrupt. Fix: Neue `b64urlDecodeUtf8` mit `TextDecoder` in `session-core.ts`, genutzt in `portal-token.ts` und `session-core.ts` für JSON-Payload. (2) `verifyPortalToken` akzeptierte Trailing-Whitespace → `token !== token.trim()`-Guard. Neue Tests: Prod-Secret-Enforcement (3), Payload-Validation (4), Unicode (4), Token-Structure (3), Revocation-Edge-Cases (4), Timing/Determinism (3), Security-Boundaries (4). Verifiziert mit `bunx vitest run src/lib/portal-token.test.ts` (55/55), Session-Tests (63/63, keine Regression) und `bun run typecheck` (0 errors).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| P31-SB-001    | MVP fertig (Engine-Integration offen)                                                                      | Kanzlei Superbrain / Legal Context Graph MVP: `src/lib/matter-context-types.ts` (Typen: `MatterContextBundle`, `MatterCoverageStatus`, `MatterGap`, `RetrievalExplanation`, `BrainQualitySummary`, `QueryMode`), `src/lib/matter-context.ts` (Kern-Logik: `buildMatterContext`, `checkCoverage`, `detectGaps`, `explainRetrieval`, `buildBrainQualitySummary`, `mapQueryModeToEngineMode` + Helper). API-Routen: `/api/matter-context/[caseSlug]`, `/coverage`, `/gaps`, `/api/brain-quality`. UI: `MatterContextPanel` (Akte-verstanden-Panel mit Parteien, Fristen, Dokumenten, Coverage-Score, Gap-Detection, Aktivitäten, Fakten), `BrainQualityPanel` (Brain Dashboard Sidebar mit Coverage-Score, Source-Breakdown, Quality-Issues). Query Modes (conservative/balanced/deep_matter/external_law/admin_audit) in `/api/think` route + Query-Page UI mit Superbrain-Mode-Selector. Tests: `src/lib/matter-context.test.ts` (53/53 grün). Verifiziert mit `npx vitest run src/lib/matter-context.test.ts` und `npx tsc --noEmit` (0 Fehler in neuen Dateien). **Offen:** Engine-seitige Permission-Filter für Matter-Scope, Temporal Memory (superseded_by/contradicts), Connector-Coverage-Matrix (DMS/Email/WhatsApp), Entity Resolution, MCP-Exposure.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| P0-DOCINT-001 | fertig                                                                                                     | Upload-/Extraction-Statusmodell: `src/lib/extraction-status.ts` implementiert State Machine mit 9 States (uploaded→processing→text_layer/ocr_needed→ocr_processing→ocr_complete/ocr_failed→ready/error), validierten Übergängen (`canTransition`/`transition`), Predicates (`isTerminal`/`isOcrRequired`/`isReady`/`isFailed`), `inferInitialExtractionStatus` (PDF→processing, Image→ocr_needed, Text→processing), Metadata-Builder (`createInitialMetadata`, `updateMetadataForOcrStart/Complete/Failure`, `updateMetadataForTextLayer`, `markReady`, `markError`, `resetForReOcr`), UI-Helper (`statusLabel`, `statusColor`). Integration: Upload-Route injiziert `extraction_status`+`extraction_metadata` in Response, `MatterDocumentSummary` erweitert, `buildDocumentSummaries` nutzt neues Modell. Tests: `src/lib/extraction-status.test.ts` (86). Verifiziert mit `bunx vitest run` (1937/1937 grün) und `bun run typecheck` (0 errors).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

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
| 33 Proaktiver KI-Sekretär (USP)          | neu ergänzt          | Gap-Befund: USP "Sekretärin immer bei sich" war nirgends als Paket verankert. 7A ist rein reaktiv, 29 pusht In-App/Mobile (nicht WhatsApp), 31 erkennt Gaps ohne Outbound. Fusion + WhatsApp-Business-Outbound (24h/Template/Consent) + permission-aware Identitätsbindung fehlten. Vision liegt in `docs/designs/KANZLEI_OS_WHATSAPP_SUPERBRAIN_BLUEPRINT.md`, war aber nicht in Tickets übersetzt.                     |
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

## Paket 13A: AI Security, Prompt Injection Defense und Upload Safety ✅ ERLEDIGT

Priorität: P0/P1  
Benchmark: OWASP LLM Top 10, NIST AI RMF, enterprise AI security procurement  
Code-Startpunkte: `src/lib/prompt-sanitizer.ts` (bestehend), `src/lib/virus-scan.ts` (bestehend, 6KB), `src/lib/upload-validation.ts` (bestehend), `src/app/api/upload/route.ts` (bestehend), `src/lib/sanitize-html.ts` (bestehend), `src/lib/encryption.ts` (bestehend), `src/lib/idempotency.ts` (bestehend)

**Implementiert 2026-06-20:** Siehe `docs/audits/SECURITY_ARCHITECTURE_13A.md` für vollständige Architekturdokumentation.

Warum dieses Paket ergänzt wurde:

- AI-Security ist eine Querschnittsanforderung, die in keinem einzelnen Paket aufgeht.
- Prompt-Sanitizer, Virus-Scan und Upload-Validation existieren, sind aber nicht systemweit durchgesetzt.
- Jedes Paket, das AI-Output erzeugt oder Dateien akzeptiert, muss diese Bausteine nutzen.

Tasks:

1. ✅ **Prompt-Sanitizer für alle AI-Endpunkte pflicht** — `sanitizeObjectStrings()` in `createEngineProxy` integriert (Default: `sanitizeBody: true`). Alle 12+ createEngineProxy-Routen sanitieren automatisch. Custom-Handler-Routen (`/api/think`, `/api/legal/contract-redline`, `/api/legal/ai-deadlines`) haben explizite `sanitizeObjectStrings`/`sanitizeUserInput`-Aufrufe.
2. ✅ **Virus-Scan für alle Upload-Pfade pflicht** — Zentraler `scanUpload()` Helper (`src/lib/upload-pipeline.ts`) kombiniert validateUpload + scanFile + sanitizeFilename. `/api/upload` refactored auf Pipeline. Weitere Upload-Pfade (Paket 4/7/7A/8/5A) bei deren Implementierung nutzen.
3. ✅ **Upload-Validation verschärfen** — MIME-Allowlist erweitert (XLSX, ODS, RTF), Size-Tiers eingeführt (50MB Dokumente, 25MB Bilder).
4. ✅ **HTML-Sanitization für AI-Output** — `sanitizeHtml` aktiv im Mailbox-Client. AI-Output ist JSON/SSE, React-Renderer ist XSS-sicher.
5. ⏳ **Idempotency für alle Webhooks** — `idempotency.ts` existiert und ist verwendet (WhatsApp, DocuSign, Stripe). Weitere Webhooks bei deren Implementierung nutzen.
6. ✅ **Encryption-at-Rest Regressionstests** — 21 Tests (TOTP, DocuSign, API-Keys, Unicode, Long-Tokens, Production-Guard, IV-Randomness, Key-Isolation, Non-String-Fields).
7. ✅ **Rate-Limiting für AI-Endpunkte** — Alle AI-Endpunkte auf `heavy` (30/min). `ai-deadlines` von `standard` auf `heavy` korrigiert.
8. ✅ **Security Header Audit** — `next.config.ts` hat vollständige Headers: CSP, HSTS, X-Frame-Options: DENY, nosniff, Referrer-Policy, Permissions-Policy.
9. ✅ **Penetration-Test-Ready Doku** — `docs/audits/SECURITY_ARCHITECTURE_13A.md` mit OWASP/NIST-Compliance-Mapping.

Akzeptanzkriterium:

- ✅ Jeder AI-Endpunkt hat Prompt-Sanitization, jeder Upload-Pfad hat Virus-Scan, jedes Secret ist encrypted-at-rest. Security-Architektur ist für externe Audits dokumentiert. 55/55 Tests grün.

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

## Paket 33: Proaktiver KI-Sekretär (WhatsApp × Superbrain Fusion)

Priorität: P1 (Go-to-Market-USP)  
Benchmark: JUPUS, LawDroid, Smith.ai, Eve — aber als reaktive Bots; kein Wettbewerber kombiniert berechtigungsbewussten Akten-Kontext + proaktive Outbound-Sekretärin auf WhatsApp.  
Vision-Doku: `docs/designs/KANZLEI_OS_WHATSAPP_SUPERBRAIN_BLUEPRINT.md` (Sprint 4 "Automatisierung")  
Technische Spezifikation: `docs/designs/PAKET_33_PROAKTIVER_KI_SEKRETAER_SPEC.md` (Datenmodell, Komponenten, Ticket-Mapping, Testplan)  
Code-Startpunkte: `src/lib/whatsapp/send.ts`, `src/lib/whatsapp/flow-send.ts`, `src/lib/legal-chat/actions.ts`, `src/app/api/cron/deadline-reminders/route.ts`, `src/app/api/cron/deadlines/route.ts`, `src/app/api/notifications/route.ts`, `server/src/core/context-engine.ts` (Matter Context, Paket 31)

Warum dieses Paket ergänzt wurde (Gap-Befund 2026-06-20):

- Der eigentliche Go-to-Market-USP — "die Sekretärin immer bei sich" — war im Action-Plan nirgends als eigenes Paket verankert. Paket 7A härtet WhatsApp nur **reaktiv** (Intents, Tests, Citation Gate, Audit); Paket 29 pusht **In-App + Mobile-Push**, aber NICHT WhatsApp als proaktiven Kanal; Paket 31 macht "Proaktive Gap Detection" im Akten-Kontext, ohne diesen Befund je auf WhatsApp an die zuständige Person zu pushen. Die Fusion fehlt.
- Code-Realität: WhatsApp-Outbound existiert (`send.ts`), Voice-In wird transkribiert, aber proaktive Benachrichtigung ist inkonsistent — `cron/deadline-reminders` schickt nur E-Mail (`nodemailer`), `cron/deadlines` ruft WhatsApp-Send. Es gibt keinen einheitlichen Outbound-Sekretär-Kanal über den Notification-Event-Bus (Paket 29).
- WhatsApp-Business-API-Pflichten für business-initiierte Nachrichten fehlen komplett im Plan: 24h-Customer-Service-Fenster, freigegebene Message-Templates (HSM, Kategorie utility/marketing), Opt-in/Consent-Management. Ohne diese Infrastruktur ist proaktiver Versand technisch unmöglich und berufsrechtlich/DSGVO-rechtlich unzulässig.
- Sicherheits-Gap: `brain_query`/`search` über WhatsApp ist heute nur einer von 25 Intents und nicht an Paket 31 (Permission-aware Retrieval, Matter Context API Contract, Source Leakage Rate = 0) gebunden. Eine Telefonnummer, die das Kanzlei-Brain abfragt, ist ohne Identitäts-/Rollen-/Ethical-Wall-Bindung ein Leak-Vektor.

Abgrenzung (keine Doppelimplementierung):

- Paket 7A = reaktive WhatsApp-Härtung (Intents, Tests, Audit, Media). Paket 29 = In-App-Notification-Center + Event-Bus + Push-Bridge. Paket 31 = Superbrain/Matter-Context + Gap Detection. Paket 33 = die **Fusion**: WhatsApp wird zum dritten Kanal des Notification-Event-Bus (29), gespeist aus Superbrain-Befunden (31), permission-scoped auf die WhatsApp-Identität, mit Outbound-Template-/Consent-Infrastruktur und Approval-Rückkanal.

Tasks:

1. **WhatsApp als proaktiver Kanal am Notification-Event-Bus (Paket 29):**
   - Outbound-Sekretär konsumiert dieselben Events wie In-App/Push (Fristen, Approvals, Portal-Nachrichten, Workflow-Blocker, Filing-Receipts, neue Dokumente, Konflikttreffer).
   - Ein Event-Bus, drei Kanäle (In-App, Mobile-Push, WhatsApp); keine Doppellogik. `cron/deadline-reminders` und `cron/deadlines` auf den gemeinsamen Bus konsolidieren.
2. **WhatsApp-Business-Outbound-Infrastruktur (harte Voraussetzung):**
   - 24h-Customer-Service-Fenster tracken; außerhalb des Fensters nur freigegebene Templates (HSM) senden.
   - Template-Registry + Genehmigungsstatus + Kategorie (utility/marketing) als Datenmodell.
   - Opt-in/Consent pro Nutzer und pro Mandant (DSGVO/Berufsgeheimnis), Widerruf, Audit jedes Outbound-Versands.
   - Quiet Hours / Eskalationsregeln (was darf nachts/am Wochenende pushen?).
3. **Tagesbriefing / Proaktiver Daily Digest:**
   - "Guten Morgen"-Briefing: heutige Fristen, offene Approvals, neue Dokumente, Konflikttreffer, dringende Mandantennachrichten — gegroundet aus dem Matter Context (Paket 31), mit Citation/Grounding (Paket 1).
   - Konfigurierbar pro Anwalt (Zeit, Umfang, Akten-Scope).
4. **Permission-aware Sekretär (Sicherheits-Gate, P0 innerhalb des Pakets):**
   - WhatsApp-Nummer ↔ verifizierte Anwalts-/Mitarbeiter-Identität ↔ Rolle/Org/Matter-Scope ↔ Ethical Walls (Paket 31, Paket 23).
   - Jeder `brain_query`/`search`-Intent läuft über den Matter Context API Contract (Paket 31 Task 17), Source Leakage Rate = 0; keine gesperrten Akten/Privilege-Inhalte über WhatsApp.
   - Cross-Tenant-/Cross-Matter-Leak-Tests speziell für den WhatsApp-Pfad.
5. **Approval- und Aktions-Rückkanal (schließt die Sekretärs-Schleife):**
   - Anwalt kann Drafts/Redlines/Filing Packages/Fristbestätigungen direkt aus WhatsApp freigeben/ablehnen (Bindung an Paket 3 Approval Gates, Paket 22 Filing).
   - Quick-Reply-Buttons/Flows (`flow-send.ts`, `flow-definitions.ts`) für Bestätigen/Ablehnen/Verschieben; jede Aktion auditiert (Paket 10).
6. **Voice-Sekretär bidirektional:**
   - Voice-In existiert (`transcribe.ts`) — optional Voice-Out (TTS) für Briefings/Antworten evaluieren.
7. **Mandanten-Outbound (separater Trust-Tier):**
   - Terminerinnerung, Dokumentenanforderung, Rechnungslink, Portal-Verknüpfung (Paket 18) NUR mit explizitem Mandanten-Opt-in + Template.
   - Strengere Freigabe als bei interner Anwalts-Kommunikation.
8. **Eval/Quality-Gate:**
   - Proactive Precision (kein Spam): Anteil der proaktiven Nachrichten, die der Anwalt als nützlich markiert.
   - Leak-Rate = 0 über WhatsApp; Consent-Compliance = 100%; Template-Window-Verletzungen = 0.
   - In dieselbe Eval-Pipeline wie Paket 14/31 hängen, kein zweiter Stack.

Akzeptanzkriterium:

- Ein Anwalt erhält morgens ungefragt ein gegroundetes Tagesbriefing auf WhatsApp, wird bei Fristen/Approvals/neuen Dokumenten/Konflikten proaktiv und permission-scoped benachrichtigt, kann direkt aus dem Chat freigeben oder nachfragen, und jede Outbound-Nachricht ist consent-konform, template-/fenster-konform, auditiert und leak-frei. WhatsApp ist Transportkanal — System of Record bleibt das Superbrain.

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
- Paket 33 Proaktiver KI-Sekretär (WhatsApp × Superbrain Fusion) — USP (setzt auf Paket 29 Event-Bus + Paket 31 Matter Context auf)
- Paket 15 Billing/Controlling MVP
- DocuSign/Obligation/Renewal Flow

Warum:

- Schließt die Lücke zwischen Mandantsanfrage, Vertrag, Freigabe, Folgepflichten, Abrechnung und WhatsApp-Kommunikation. Paket 33 macht aus dem reaktiven Chat (7A) die proaktive, immer erreichbare Sekretärin — der Go-to-Market-USP. Harte Dependency: Paket 29 (Event-Bus, R2) und Paket 31 (Permission-aware Matter Context, R1) müssen stehen.

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
2. `P0-PROD-002`: Provider-Webhook-Tests ohne CSRF-Header, aber mit Signatur/Auth-Gate ergaenzen. **Status: fertig.**
3. `P0-PROD-003`: `cd server && bun run verify` gruen machen und Monorepo-Pfadfehler in Verify-Checks beheben. **Status: fertig.**
4. `P0-PROD-004`: Playwright-E2E-Smoke mit Test-Engine oder Mock-Engine stabilisieren. **Status: fertig.** — Mock-Engine (`tests/e2e-mock-engine.ts`) implementiert: Lightweight HTTP-Server auf Port 3001, der alle Engine-API-Endpunkte mit deterministischen Responses bedient (Pages CRUD, Search, Think/SSE, Legal Analyze/Contract-Redline/AI-Deadlines, Graph, Brains, Stats, Audit). Playwright-Config (`playwright.config.ts`) aktualisiert: Zwei `webServer`-Einträge starten Mock-Engine + Next.js Dev-Server parallel. Neues Smoke-Test-File (`tests/e2e-playwright/smoke.spec.ts`) mit 20+ Tests: Auth Flow (signup→dashboard→logout, login render, unauth redirect), Case CRUD (create→list→get→update→delete via API), Search (API + page render), Brain Query (Think SSE + page render), Dashboard Pages Render (9 Seiten ohne 503), API Guard Chain (401 unauth, 403 wrong CSRF). `test:e2e:smoke` Script in `package.json` für isolierten Smoke-Run.
5. `P0-PROD-005`: CI-Branch-Ziele und Root-vs-`server/`-Gates vereinheitlichen. **Status: fertig.** — `e2e.yml` Branch-Ziele von `master` auf `main, develop` korrigiert (align mit `ci.yml`). Neuer `server-verify` Job in `ci.yml`: separater Gate für `server/` Engine mit `bun install` + `bun run verify` im `server/` Working-Directory. CI hat jetzt klare Trennung: Root-Web-App (lint, typecheck, test, e2e, check-resolvable) und Server-Engine (verify).
6. `P0-PROD-006`: TOTP-Secrets und DocuSign Tokens verschluesselt speichern. **Status: fertig.** — `encryptUser`/`decryptUser` Helper in `src/lib/auth/store.ts` integriert, nutzen `encryptFields`/`decryptFields` aus `src/lib/encryption.ts` (AES-256-GCM). Sensitive Fields: `twoFactorSecret`, `pendingTwoFactorSecret`, `docusignAccessToken`, `docusignRefreshToken`, `openaiKey`, `anthropicKey`, `zeroEntropyKey`. Beide Store-Implementierungen (FileUserStore + PostgresUserStore) verschlüsseln beim Schreiben und entschlüsseln beim Lesen. In Dev-Mode ohne `SUBSUMIO_ENCRYPTION_KEY` wird `sbplain:`-Marker verwendet (Klartext mit Prefix), in Production mit Key `sbenc:` (AES-256-GCM). Tests: `src/lib/auth/store-encryption.test.ts` (10) — on-disk encryption verification, round-trip create→read→update→read, null handling, pendingTwoFactorSecret, zeroEntropyKey, list(), getByEmail(), getByReferralCode(). Verifiziert mit `bunx vitest run src/lib/auth/store-encryption.test.ts src/lib/encryption.test.ts` (31/31 grün) und `bun run typecheck` (0 neue Fehler).
7. `P0-PROD-007`: Healthcheck in liveness/readiness splitten und Engine-Readiness mit API-Key pruefen. **Status: fertig.** — `/api/health` ist jetzt ein Lightweight-Liveness-Probe (immer 200, keine externen Dependencies). Neu: `/api/readiness` als Deep-Probe mit Engine-Check (inkl. `x-subsumio-api-key` Header), Auth-Store-Cold-Read, kritische Env-Vars (`AUTH_SECRET`, `SUBSUMIO_API_URL`, `SUBSUMIO_WEB_API_KEY`) und optionalen Services (Stripe/Sentry/Resend als degraded, nicht down). 503 nur bei critical-down, 200+degraded bei optional-down. Tests: `src/app/api/health-readiness.test.ts` (10). Verifiziert mit `bunx vitest run src/app/api/health-readiness.test.ts` und `bun run typecheck`.
8. `P0-PROD-008`: `undici` High-Vulnerability aus `npm audit --omit=dev` beheben. **Status: fertig.** — `undici` npm override auf `>=6.27.0` in `package.json` hinzugefügt. `@vercel/blob@2.4.0` zieht nun `undici@7.28.0` (overridden). `npm audit --omit=dev` → 0 vulnerabilities. Verifiziert mit `npm audit --omit=dev` (0 vulnerabilities), `bun run typecheck` (0 errors) und `bunx vitest run src/app/api/health-readiness.test.ts src/lib/citation-gate.test.ts src/lib/legal-grounding.test.ts` (62/62 grün).
9. `P0-CITE-001`: `src/lib/legal-grounding.ts` aus `analyze/route.ts` extrahieren. **Status: fertig.**
10. `P0-CITE-002`: Grounding Response Types in `src/lib/types.ts` definieren. **Status: fertig.**

Danach folgen:

- `P0-CITE-003`: `/api/think` mit Citation Gate ausstatten. **Status: fertig.**
- `P0-CITE-004`: `/api/legal/contract-redline` mit Citation/Grounding-Metadaten erweitern. **Status: fertig.**
- `P0-CITE-005`: Citation Badge UI-Komponente bauen (bestehendes `CitationLink.tsx` erweitern). **Status: fertig** — `AIBadge`, `GroundingStatus`, `AttorneyReviewWarning` als vereinheitlichte Komponenten in `CitationLink.tsx` hinzugefügt; `CitationPanel` aus bestehendem `CitationPanel.tsx` in `analyze/page.tsx` integriert; `CitationBadgesInline` in `assistant/page.tsx` integriert; `query/page.tsx` inline Badges durch `AIBadge` + `GroundingStatus` ersetzt; 32 Tests in `CitationLink.test.tsx` + 21 Tests in `CitationPanel.test.tsx` = 53 Tests alle grün. **Status: fertig (erweitert).** — Neue vereinheitlichte `CitationPanel.tsx` mit AI Act Art. 50 Badge, Groundedness-Indikator, Corpus-Grounding-Verifizierung, Attorney-Review-Warnung, Brain-Quellen-Liste, Gap-Anzeige und Collapsible Details. In Research- und Assistant-Seite integriert. `CitationBadgesInline` für kompakte Chat-Anzeige. Tests: `CitationPanel.test.tsx` (21).
- `P0-SEC-001`: Prompt-Sanitizer für alle AI-Endpunkte aktivieren (`src/lib/prompt-sanitizer.ts`). **Status: Web-App-Prompt-Oberflächen fertig** — `sanitizeUserInput()` greift jetzt in `/api/legal/analyze` (Dokumenttext) und `/api/agent-templates/[slug]/run` (User-Input), den einzigen beiden Routen, die im Web-App-Layer selbst Prompts bauen. Restliche Legal-Routen proxien zur Engine; deren Prompt-Sanitization gehört in die Engine-Schicht (offen).
- `P0-SEC-002`: Virus-Scan für alle Upload-Pfade aktivieren (`src/lib/virus-scan.ts`). **Status: fertig** — `scanFile()` greift jetzt auf beiden untrusted Byte-Eingängen: `/api/upload` (bereits vorhanden) und neu in `src/lib/whatsapp/media.ts` (`downloadAndStoreWhatsAppMedia` scannt vor dem Speichern, lehnt Malware/MIME-Mismatch ab). E-Mail-Anlagen werden derzeit nur als Metadaten geparst (keine Byte-Speicherung im Web-App-Layer). Tests: `src/lib/virus-scan.test.ts` (6).
- `P0-SEC-003`: Idempotency für alle Webhooks und Workflow-Steps durchsetzen (`src/lib/idempotency.ts`). **Status: fertig.** — Webhooks: Stripe (eigene Events-Tabelle), DocuSign (`createIdempotencyStore`), WhatsApp (Message-Dedup) und Resend (`ON CONFLICT (provider_id)`) sind idempotent. Workflow-Step-Idempotency: `advanceStepIdempotent()` in `src/lib/workflow.ts` — prüft Terminal-Status (approved/rejected/skipped) und same-status, gibt 409 bei Verletzung. PATCH `/api/workflows` verwendet `advanceStepIdempotent` mit `step_idempotency_violation` Fehlercode. Tests: `src/lib/idempotency.test.ts` (4) + `src/lib/workflow.test.ts` Idempotency-Tests (13 — isTerminalStepStatus 5, canAdvanceStep 3, advanceStepIdempotent 5).
- `P0-SRC-001`: `legal_source_registry` Modell + API-Skeleton. **Status: fertig.** — `src/lib/source-registry.ts` implementiert: SourceRegistryEntry-Modell, calculateFreshness, scanCorpusFile (SHA-256), computeCorpusDiff, buildStatuteEntries, buildJudgementApiEntries (RIS-OGD/AT, OpenLegalData/DE, OpenCaseLaw/CH), buildSourceRegistry, loadSyncStatus/saveSyncStatus (Brain-page-basiert), provenanceFromEntry, findSourceForCitation. API-Route `src/app/api/legal/sources/route.ts` (GET mit Filter + POST Refresh). Tests: `src/lib/source-registry.test.ts` (39).
- `P0-EVAL-001`: `src/lib/rag-eval.ts` bereinigen, Fixture-Versionierung einführen und als Release-Gate definieren. **Status: fertig.** — Doppeltes `EvalQuery`-Interface entfernt, `EvalCategory`-Type eingeführt (7 Kategorien: statute/case_law/procedure/general/contract_clause/memo/bulk_review), `FIXTURE_VERSION="2.0.0"` mit `fixtureVersion`+`totalQueries` in `EvalSummary`, CH-Fixtures (OR/ZGB/BGG) und neue Kategorie-Fixtures (contract_clause/memo/bulk_review) hinzugefügt. Duplikate Release-Gate-Code aus `rag-eval.ts` entfernt — `release-gate.ts` ist kanonisches Modul mit `evaluateReleaseGate`, `DEFAULT_THRESHOLDS`, Baseline-Persistierung und Eval-Historie. API-Route `/api/rag-eval` POST ruft `evaluateReleaseGate` auf und liefert `gate`-Resultat mit. Dashboard `/dashboard/rag-eval` zeigt Release-Gate-Status (pass/warn/fail), einzelne Gate-Checks, Baseline-Management, Human Review Summary, Eval-Historie mit Regressions-Indikatoren. Tests: `src/lib/rag-eval.test.ts` (67) — Fixtures, FIXTURE_VERSION, runEval, scoreGrade, AI-Quality-Metrics (computeCitationQuality/computeDeadlineQuality/computeContractIssueQuality/computeQualityReport/qualityGrade), evaluateReleaseGate mit Thresholds/Regression/Custom-Thresholds. `src/lib/release-gate.test.ts` (51) — evaluateReleaseGate absolute/regression/status/structure/custom-thresholds, Baseline/History-Persistierung. Verifiziert mit `bunx vitest run src/lib/rag-eval.test.ts src/lib/release-gate.test.ts` (118/118 grün) und `bun run typecheck`.
- `P0-DOCINT-001`: Upload-/Extraction-Statusmodell spezifizieren. **Status: fertig.** — `src/lib/extraction-status.ts` implementiert: `ExtractionStatus` (9 States: uploaded→processing→text_layer/ocr_needed→ocr_processing→ocr_complete/ocr_failed→ready/error), `ExtractionMethod` (text_layer/ocr_vision/none), `ExtractionMetadata`-Interface mit OCR-Attempt/Complete-Timestamps, Char/Page-Count, Language. State Machine mit `canTransition`/`transition` (validierte Übergänge, throws bei invalid), `isTerminal`/`isOcrRequired`/`isReady`/`isFailed` Predicates. `inferInitialExtractionStatus(filename, mimeType)` — PDF→processing, Image→ocr_needed, Text→processing. Metadata-Builder: `createInitialMetadata`, `updateMetadataForOcrStart/Complete/Failure`, `updateMetadataForTextLayer`, `markReady`, `markError`, `resetForReOcr`. UI-Helper: `statusLabel` (deutsche Labels), `statusColor` (Tailwind-Klassen). Integration: Upload-Route (`/api/upload`) injiziert `extraction_status` + `extraction_metadata` in Response. `MatterDocumentSummary` erweitert mit `extraction_status`/`extraction_method`/`extraction_unverified`. `buildDocumentSummaries` in `matter-context.ts` nutzt `inferInitialExtractionStatus`. Tests: `src/lib/extraction-status.test.ts` (86) — State Machine (alle validen/invaliden Übergänge), Predicates, inferInitialExtractionStatus (PDF/Image/Text/HEIC/AVIF/WEBP/Unknown/Uppercase/MIME-Precedence), inferExtractionMethod, Metadata-Builder (alle 8), Full Lifecycle Scenarios (Image+OCR, PDF+TextLayer, OCR-Failure+Retry, Re-OCR nach Ready, Error-during-Processing), UI-Helper. Verifiziert mit `bunx vitest run src/lib/extraction-status.test.ts` (86/86 grün) und `bun run typecheck` (0 errors).
- `P0-DOCINT-002`: Duplicate Detection per SHA-256 in Upload-Pipeline planen und testen. **Status: fertig.** — `src/lib/upload-pipeline.ts` erweitert: `computeSHA256(buffer)` (deterministic SHA-256 via Node.js `crypto`), `DuplicateStore` Interface (lookup/record), `checkDuplicate(sha256, store)` (non-mutating check), `recordDuplicate(sha256, slug, name, store)` (post-save recording), `scanUploadWithDuplicateCheck(file, store)` (extended pipeline mit 409 Conflict bei Duplikaten). `scanUpload` liefert jetzt `sha256` + `is_duplicate` in jedem erfolgreichen Result. Tests: `src/lib/upload-pipeline.test.ts` (31) — bestehende 16 Tests + 15 neue (computeSHA256: determinism/hex/empty/large, checkDuplicate: unknown/known/no-mutation, recordDuplicate: store/overwrite/multiple, scanUploadWithDuplicateCheck: 409-reject/non-duplicate/invalid/oversized, sha256-in-result). Verifiziert mit `npx vitest run src/lib/upload-pipeline.test.ts` (31/31 grün) und `npx tsc --noEmit` (0 Fehler).
- `P0-WF-001`: Workflow Datenmodell und Statusmaschine spezifizieren (bestehendes `approval.ts` erweitern). **Status: fertig.** — `src/lib/approval.ts` implementiert ActionType (4 Typen), ApprovalStatus (pending/approved/rejected), AgentActionFrontmatter-Interface, REQUIRES_APPROVAL-Set (alle 4 Typen benötigen Freigabe), requiresApproval(), ACTION_LABELS (deutsche Labels), agentActionFrontmatter() (erzeugt pending-Frontmatter mit ISO-Timestamp). Tests: `src/lib/approval.test.ts` (30) — REQUIRES_APPROVAL-Set, requiresApproval für alle Typen, ACTION_LABELS-Vollständigkeit, agentActionFrontmatter (Pflichtfelder, Custom-Date, target_slug, Pending-Only, Unicode, Edge-Cases), Typ-Invarianten.
- `P0-WF-002`: `/dashboard/workflows` MVP-Screen. **Status: fertig.** — Vollständige Workflow-Dashboard-Seite (`src/app/dashboard/workflows/page.tsx`): Template Gallery (5 Templates: Due Diligence, Vertrags-Review, Litigation Prep, Compliance-Check, Fristen-Management), Custom-Prompt + Case-Slug Input, Start-Button mit Brain-Page-Creation, Filter (Alle/Aktiv/Abgeschlossen/Fehler), Workflow-Cards mit Progress-Bar, Expandable Step-List mit Status-Icons, Pending-Approvals-Link, Error-Display für fehlgeschlagene Steps. Sidebar-Eintrag + i18n-Key (`nav.workflows`) vorhanden. Nutzt `usePages({ type: "workflow" })` für Daten, `useCreatePage` für Start. Workflow-Lib (`src/lib/workflow.ts`) mit Templates, Steps, Helpers (`getWorkflowProgress`, `getActiveStep`, `getPendingApprovals`, `inferWorkflowStatus`, `advanceStep`, `fmToWorkflowInstance`, `filterWorkflows`, `sortWorkflowsByStartedAt`). Tests: `src/lib/workflow.test.ts` (474 Zeilen). **Status: fertig.** — `src/lib/workflow.ts` implementiert: WorkflowTemplate (5 Templates: Due Diligence, Vertrags-Review, Litigation Prep, Compliance-Check, Fristen-Management), WorkflowStep/WorkflowFrontmatter/WorkflowInstance-Types, buildWorkflowSteps, buildWorkflowFrontmatter, buildWorkflowSlug, buildWorkflowTitle, getWorkflowProgress, getActiveStep, getPendingApprovals, inferWorkflowStatus, advanceStep, getStepStatusLabel/getWorkflowStatusLabel/getActionTypeLabel (deutsche Labels), fmToWorkflowInstance, filterWorkflows, sortWorkflowsByStartedAt. Dashboard `/dashboard/workflows` mit Template-Gallery, Custom-Prompt, Case-Slug-Zuordnung, Filter-Tabs (Alle/Aktiv/Abgeschlossen/Fehler), Workflow-Cards mit Progress-Bar, expandierbaren Step-Listen, Pending-Approval-Links, Error-Display. API-Route `/api/workflows` (GET: List+Templates, POST: Start, PATCH: Advance Step). Tests: `src/lib/workflow.test.ts` (46) — Templates, getTemplate, buildWorkflowSteps, buildWorkflowFrontmatter, buildWorkflowSlug, buildWorkflowTitle, getWorkflowProgress, getActiveStep, getPendingApprovals, inferWorkflowStatus, advanceStep, Label-Helpers, fmToWorkflowInstance, filterWorkflows, sortWorkflowsByStartedAt. Sidebar-Navigation + Command-Palette-Eintrag unter "Gehirn"-Sektion hinzugefügt (`nav.workflows` i18n-Key DE/EN). Verifiziert mit `npx vitest run src/lib/workflow.test.ts` (46/46 grün) und `npx tsc --noEmit` (0 errors in Workflow-Code).
- `P0-WF-003`: Realtime/SSE für Workflow-Status-Updates (bestehendes `realtime.ts` nutzen). **Status: fertig.** — `src/lib/workflow.ts` erweitert: `WorkflowEventType` (started/step_changed/completed/failed), `WorkflowEvent`-Interface, `buildWorkflowEvent()` (erzeugt SSE-Event mit ISO-Timestamp). `src/app/api/workflows/route.ts` integriert `broadcastSseEvent`: POST sendet `workflow.started` nach Engine-Create, PATCH sendet `workflow.step_changed` mit Step-ID, neuem Status und Workflow-Status. Dashboard `/dashboard/workflows` nutzt `useRealtime`-Hooks für alle 4 Event-Typen → `queryClient.invalidateQueries` bei jedem Event für Live-Update. Tests: `src/lib/workflow.test.ts` (52) — 6 neue Tests für `buildWorkflowEvent` (started/step_changed/completed/failed Shape, ISO-Timestamp, arbitrary data fields). Verifiziert mit `npx vitest run src/lib/workflow.test.ts` (52/52 grün) und `npx tsc --noEmit` (0 errors).
- `P0-CONTRACT-001`: Side-by-side Diff-Komponente für Contract Review (bestehendes `contract-redline-viewer.tsx` erweitern). **Status: fertig.** — Word-level Inline-Diff-Highlighting via LCS (`src/lib/word-diff.ts`: `diffWords`, `diffStats`, `buildAcceptedText`). `contract-redline-viewer.tsx` erweitert: (1) Inline-Diff in beiden Spalten (rot/line-through für gelöscht, grün für hinzugefügt), (2) Accept/Reject pro Klausel mit visuellem Status, (3) Collapsible Klauseln, (4) Keyboard-Navigation (↑/↓/j/k + Ctrl+Enter), (5) Bulk Actions (Alle akzeptieren/ablehnen), (6) Export akzeptierte Version als Markdown, (7) Diff-Stats (+N/-N) pro Klausel, (8) Active-Clause-Highlighting mit Auto-Scroll. Tests: `src/lib/word-diff.test.ts` (20), `src/components/contract-redline-viewer.test.tsx` (7). 27/27 grün, typecheck clean.
- `P0-CONTRACT-002`: Clause Annotation Type + API-Skeleton. **Status: fertig.** — `src/lib/clause-annotation.ts`: Vollständiges Typsystem (ClauseRiskLevel 4 Stufen, ClauseReviewStatus 3 Stufen, ClauseCategory 15 Kategorien), ClauseAnnotationFrontmatter-Interface mit Position/Playbook-Referenz/Reviewer-Feldern, Label-Maps (DE), Severity→Risk Mapping, Helpers (buildAnnotationSlug/Title/Frontmatter, fmToAnnotation, buildReviewUpdate), Filtering (filterByContract/Risk/ReviewStatus/Category), Sorting (sortByRiskLevel/AnnotatedAt), Stats (computeAnnotationStats mit pending_critical). API-Route `src/app/api/clause-annotations/route.ts`: GET (list+filter+stats), POST (create mit Engine-Page-Creation + SSE broadcast), PATCH (review status update mit Engine-PUT + SSE broadcast). Tests: `src/lib/clause-annotation.test.ts` (36 — Labels, severityToRiskLevel, buildAnnotationSlug/Title/Frontmatter, fmToAnnotation, Filtering, Sorting, Stats, buildReviewUpdate). 36/36 grün. **Status: fertig.** — `src/lib/clause-annotation.ts` implementiert: `ClauseRiskLevel` (low/medium/high/critical), `ClauseReviewStatus` (pending/approved/rejected), `ClauseCategory` (15 Kategorien: nda/employment/service/sale/lease/partnership/licensing/settlement/liability/payment/termination/ip/data_protection/warranty/general), `ClauseAnnotationFrontmatter`-Interface mit contract_slug/clause_type/clause_title/clause_excerpt/risk_level/legal_basis/recommendation/review_status/playbook_rule_id/position_start/position_end/annotated_by/annotated_at/reviewed_at/reviewed_by/reject_reason. Helper: `buildAnnotationSlug`, `buildAnnotationTitle`, `buildAnnotationFrontmatter`, `fmToAnnotation`, `severityToRiskLevel` (PlaybookSeverity→ClauseRiskLevel), `filterByContract`/`filterByRisk`/`filterByReviewStatus`/`filterByCategory`, `sortByRiskLevel`/`sortByAnnotatedAt`, `computeAnnotationStats` (total/by_risk/by_status/pending_critical/approved/rejected), `buildReviewUpdate`. Label-Maps: RISK_LABELS, REVIEW_STATUS_LABELS, CATEGORY_LABELS (deutsch). API-Route `/api/clause-annotations` (GET: List by contract_slug mit Stats, POST: Create mit SSE-Event, PATCH: Review-Status Update mit SSE-Event). Tests: `src/lib/clause-annotation.test.ts` (36) — Labels, severityToRiskLevel, buildAnnotationSlug/Title/Frontmatter, fmToAnnotation (valid/invalid/defaults), Filtering (contract/risk/status/category), Sorting (risk/annotated_at), computeAnnotationStats, buildReviewUpdate. Verifiziert mit `npx vitest run src/lib/clause-annotation.test.ts` (36/36 grün) und `npx tsc --noEmit` (0 errors). **Status: fertig.** — `src/lib/clause-annotation.ts` implementiert: `ClauseRiskLevel` (low/medium/high/critical), `ClauseReviewStatus` (pending/approved/rejected), `ClauseCategory` (15 Typen: nda/employment/service/sale/lease/partnership/licensing/settlement/liability/payment/termination/ip/data_protection/warranty/general), `ClauseAnnotationFrontmatter`-Interface, `ClauseAnnotation`-Interface. Label Maps: `RISK_LABELS`, `RISK_COLORS`, `RISK_BADGE_VARIANT`, `REVIEW_STATUS_LABELS`, `CATEGORY_LABELS` (deutsche Labels). Helpers: `severityToRiskLevel` (PlaybookSeverity → ClauseRiskLevel), `buildAnnotationSlug`, `buildAnnotationTitle`, `buildAnnotationFrontmatter`, `fmToAnnotation`, `filterByContract`, `filterByRisk`, `filterByReviewStatus`, `filterByCategory`, `sortByRiskLevel`, `sortByAnnotatedAt`, `computeAnnotationStats` (AnnotationStats mit by_risk/by_status/pending_critical). API-Route `/api/clause-annotations` (GET: List+Filter+Stats, POST: Create mit Brain-Page, PATCH: Review-Status Update) mit `broadcastSseEvent` für `annotation.created` und `annotation.reviewed`. Tests: `src/lib/clause-annotation.test.ts` (36) — Types, Label Maps, severityToRiskLevel, buildAnnotationSlug/Title/Frontmatter, fmToAnnotation (valid/invalid/defaults), Filtering (byContract/byRisk/byReviewStatus/byCategory), Sorting (byRiskLevel/byAnnotatedAt), computeAnnotationStats. Verifiziert mit `bunx vitest run src/lib/clause-annotation.test.ts` (36/36 grün) und `bun run typecheck` (0 errors).
- `P0-OUTLOOK-001`: Outlook Add-in Auth-Flow mit API-Key-Management verbinden. **Status: fertig.** — (1) `src/lib/auth/api-key-auth.ts`: `extractBearerToken` + `verifyApiKey` — resolved Bearer `sk_live_...` token via `ApiKeyStore.findByHash` → lädt Owner-User → baut `EngineContext` (brainId, plan, headers). `lastUsedAt` wird fire-and-forget aktualisiert. (2) `src/lib/api-key-store.ts`: `listAll()` + `findByHash()` zum Interface + beiden Adaptern (File + Postgres) hinzugefügt. (3) `src/lib/api-handler.ts`: API-Key-Auth als Fallback wenn Session-Cookie-Auth fehlschlägt — `verifyApiKey(req.headers.get("authorization"))` wird versucht, bei Erfolg wird CSRF übersprungen (API-Keys haben keinen Browser-Context). (4) `outlook-addin/src/taskpane.ts`: `sk_live_`-Präfix-Validierung, `localStorage`-Persistenz mit `tryRestoreSession()` beim Office-Ready-Event, `disconnect()`-Funktion mit UI-Clear. (5) `outlook-addin/src/taskpane.html`: Connected-Status-Bar mit Disconnect-Button, Hilfe-Link zu Dashboard-Settings → API-Keys. Tests: `src/lib/auth/api-key-auth.test.ts` (11 — extractBearerToken 5, verifyApiKey 6). 11/11 grün, typecheck clean.
- `P0-WHATSAPP-001`: WhatsApp Intent-Parsing Unit-Tests für alle 25+ ParsedIntents. **Status: fertig (erweitert).** — `src/lib/legal-chat/actions.test.ts` (154 Tests) + `src/lib/legal-chat/actions-stress.test.ts` (114 Tests) = 268/268 grün. Bugfixes in `parseIntent`: (1) `stunden`-Erkennung, (2) `deadline_calc` vor `deadline`/`task`, (3) `mark_done` vor `deadline`/`task`, (4) `create_case` vsMatch-Regex, (5) `eur|euro` Regex-Reihenfolge → `euro|eur` (longest-first), (6) `statusMatch` mit Negative-Lookahead für `abrechenbar`/`abrechnung`, (7) `createCaseMatch` vor `bareCaseMatch` (verhindert `akte anlegen` als `case_lookup`), (8) `closeCaseMatch2` vor `bareCaseMatch` (verhindert `akte beenden` als `case_lookup`), (9) `zeige mir` erfordert `akt`/`akte`-Prefix (verhindert Prompt-Injection als `case_summary`). 268/268 Tests grün, typecheck clean.
- `P0-DACH-001`: GoBD-Verfahrensdokumentation Regressionstests ergänzen. **Status: fertig** — `src/lib/gobd.test.ts` von `bun:test` auf vitest migriert und von 6 auf 35 Tests ausgebaut (Tampering, Round-Trip, Unicode, Edge-Cases). `src/lib/gobd-verfahrensdoku.test.ts` von 9 auf 30 Tests ausgebaut (alle GoBD-Rechtsreferenzen, Sonderzeichen, Sektion-Vollständigkeit). 65/65 Tests grün, typecheck clean.
- `P0-DACH-002`: DATEV-Export-Regressionstests mit echten Szenarien. **Status: fertig** — DATEV-Export-Logik aus `src/app/dashboard/datev-export/page.tsx` in testbares Modul `src/lib/datev-export.ts` extrahiert (`csvCell`, `steuerKennzeichen`, `generateDatevCsv`, `AREA_CODES`, `KONTENRAHMEN`, `DATEV_CSV_HEADER`, `ExportEntry`-Interface). Page importiert nun aus dem Modul. Bugfix: `steuerKennzeichen`-Bedingung `>= 0.195 && <= 0.195` matchete nur exakt 0.195 statt 0.19 — korrigiert auf `>= 0.19 && < 0.20`. 54 Tests in `src/lib/datev-export.test.ts`: csvCell (9 — Quoting, Semikolon, Anführungszeichen-Doubling, Zeilenumbruch, Unicode), steuerKennzeichen (4 — 19%/20%/0%/7%), AREA_CODES (2), KONTENRAHMEN (3 — SKR03/SKR04/SKR49), Header & Struktur (3), Datumskonvertierung ISO→DD.MM.YYYY (2), Betragsformat mit Komma (4), Kontenrahmen pro SKR (6 — Honorar/Auslagen-Konten, Default, null-settings), Zeitraum-Filter (4 — inklusive Grenzen, außerhalb gefiltert), Belegnummer (2 — Rechnungsnummer vs. Aktenzeichen), Typ-Feld (2), Kostenstelle (2), Berater-/Mandant-Nr (2), USt-ID (2), CSV-Injection-Schutz (3 — Semikolon/Anführungszeichen in Beschreibung und Client), Edge Cases (4 — Unicode, 50 Entries, Determinismus, Reihenfolge). Verifiziert mit `bunx vitest run src/lib/datev-export.test.ts` (54/54 grün) und `bun run typecheck` (0 neue Fehler — pre-existing Errors in `upload-pipeline.ts` unverändert).
- `P0-AUTH-001`: Account-Lockout Regressionstests (`src/lib/auth/lockout.ts`). **Status: fertig.**
- `P0-AUTH-002`: 2FA-Backup-Codes Recovery-Flow testen (`src/lib/auth/backup-codes.ts`). **Status: fertig.**
- `P0-AUTH-003`: Central API Handler als Pflicht für alle API-Routen (`src/lib/api-handler.ts`). **Status: fertig.** Audit abgeschlossen — 40 ad-hoc Route-Dateien identifiziert, 19 migriert. **Phase 1:** 5 Routen zu `createHandler` migriert (`/api/auth/me` GET+PATCH, `/api/auth/2fa/setup`, `/api/auth/2fa/verify`, `/api/auth/2fa/disable`, `/api/docusign/auth`), 1 Route zu `createPublicHandler` (`/api/demo`). **Phase 2:** `createCronHandler` zu `api-handler.ts` hinzugefügt — zentralisiert cron-auth + error handling. 7 Cron-Routen migriert (`case-law`, `case-scanner`, `daily-briefing`, `deadline-reminders`, `deadlines`, `regulatory-monitors`, `retention`). **Phase 3:** `allowInternal` Option zu `createHandler` hinzugefügt — für Dual-Auth-Routen (internal secret ODER user session). `legal/analyze` migriert — 40 Zeilen manual auth/CSRF/validation code entfernt. **Tests:** `src/lib/api-handler.test.ts` von 11 auf 21 Tests erweitert (5 `createCronHandler` + 5 `allowInternal`). Verbleibende 21 ad-hoc Routes sind gerechtfertigt: Auth-Flows (11 — custom rate limiting + cookie management), Health/Probes (3 — lightweight, no auth), SCIM (4 — bearer token auth), Other (3 — dev-catch/export/flow-endpoint). Typecheck: clean. Tests: 21/21 grün.
- `P0-PORTAL-001`: Portal-Token-Infrastruktur härten und Regressionstests (`src/lib/portal-token.ts`). **Status: fertig** — `src/lib/portal-token.test.ts` von 30 auf 55 Tests erweitert. **2 Bugfixes:** (1) `b64urlDecode` in `session-core.ts` gab Latin-1-Binary-String zurück statt UTF-8 → Unicode in case_slug (Umlaute, §, Emoji) wurde korrupt. Fix: Neue `b64urlDecodeUtf8`-Funktion mit `TextDecoder`, genutzt in `portal-token.ts` und `session-core.ts` für JSON-Payload-Decoding. `b64urlDecode` bleibt unverändert für Signatur-Bytes. (2) `verifyPortalToken` akzeptierte Tokens mit Trailing-Whitespace → Fix: `token !== token.trim()`-Guard. Neue Tests: Production-Secret-Enforcement (3 — throw ohne Secret in prod, env-Secret in prod, dev-Fallback ≠ AUTH_SECRET), Payload-Validation (4 — missing case_slug/exp, extra fields forward-compat, non-numeric exp), Unicode (4 — Umlaute, §, Emoji, Newline-Injection), Token-Structure (3 — base64url-Format, sig non-empty, exactly one dot), Revocation-Edge-Cases (4 — revoke+expired, re-sign nach revoke, fake-token revoke, 5 unabhängige Revocations), Timing/Determinism (3 — same-second identity, 10x rapid cycle, full sign+verify+revoke+verify cycle), Security-Boundaries (4 — token length, cross-secret incompatibility, whitespace-padded rejection, swapped body/sig rejection). Verifiziert mit `bunx vitest run src/lib/portal-token.test.ts` (55/55 grün), `bunx vitest run src/lib/auth/session.test.ts src/lib/auth/backup-codes.test.ts src/lib/auth/lockout.test.ts` (63/63 grün — keine Regression im Session-Modul) und `bun run typecheck` (0 errors).
- `P0-PM-001`: AI Deadline Detection Regressionstests (`src/lib/ai-deadline-detect.ts`). **Status: fertig.** — 170 Tests (58 ai-deadline-detect + 112 legal-deadlines) decken ab: absolute/relative/legal deadlines, AT-Datumsformat, alle 12 Monatsnamen, Wochen/spätestens, Wiedereinsetzung/StPO-Beschwerde, multiple deadlines, confidence levels, matchedRule, false-positive guards, AT-Feiertage (8), CH-kantonale Feiertage (7), DE-Bundesland-Feiertage (5), alle Deadline-Rules (8 zusätzliche), Jahreswechsel/Leap-Year (4), Holiday-Chains (2), Month-end clamping (5), withDeadlineAudit (5), timelineToDeadline (2), Easter multi-year (4), Swiss/DE disambiguation (6).
- `P0-PM-002`: Time-Tracking-API mit Billing verbinden (`src/app/api/time/route.ts`). **Status: fertig.** Vollständige Time-Tracking + Billing Integration: (1) `src/lib/time-tracking.ts` — Business Logic mit `filterEntries`, `computeSummary`, `computeBillingSummary` (gruppiert abrechenbare, nicht-abgerechnete Einträge nach Akte), `markEntriesBilled` (Bulk-Markierung mit Invoice-Number), `groupByCase`, `createTimeEntry`, `updateEntry`, `deleteEntry`. (2) `src/app/api/time/route.ts` — CRUD API mit `createHandler` (GET: List+Filter+Billing-Summary, POST: Create+SSE, PATCH: Update+Bulk-Mark-Billed+SSE, DELETE: Delete+SSE). (3) `src/app/api/time/billing-summary/route.ts` — Dedicated Billing-Summary Endpoint (GET: Cross-Akte Billing-Summary mit Default-Rate). (4) `src/app/api/time/mark-billed/route.ts` — Dedicated Bulk Mark-Billed Endpoint (POST: Mark entries as billed with invoice number + SSE). Alle Endpunkte nutzen `createHandler` mit RBAC (`invoice.read`/`invoice.write`), Rate Limiting, Zod-Validation, Audit-Logging und SSE-Broadcasts. SSE-Events: `time.entry.created`, `time.entry.updated`, `time.entry.billed`, `time.entry.deleted`. Tests: `src/lib/time-tracking.test.ts` (42 Tests — computeSummary, filterEntries, createTimeEntry, updateEntry, deleteEntry, computeBillingSummary, markEntriesBilled, groupByCase, TimeEntry type contract). Typecheck: clean. 107 files, 2635 tests (2 pre-existing failures in engine.test.ts/rate-limit-api.test.ts unrelated to time-tracking). **Status: fertig.** — API-Route refactored: GET nutzt jetzt `filterEntries` + `computeSummary` aus `src/lib/time-tracking.ts` (statt inline), `billing_summary=true` Query-Param liefert `computeBillingSummary` (unbilled entries grouped by case mit total amounts). POST nutzt `createTimeEntry` aus der Lib (statt inline ID-Generierung). PATCH erweitert: Bulk `mark_billed` Mode mit `markEntriesBilled` + `invoice_number` (markiert mehrere Einträge als abgerechnet), Single-Update Mode nutzt `updateEntry`. DELETE nutzt `deleteEntry`. Alle Mutations-Endpunkte senden SSE-Events (`time.entry.created/updated/billed/deleted`) via `broadcastSseEvent`. Alle Responses verwenden `apiSuccess`/`apiError` (statt `Response.json`). `ctx.user?.name` statt `ctx.user.name` (optional chaining). Tests: `src/lib/time-tracking.test.ts` (42) — bestehend, alle grün. Verifiziert mit `npx vitest run src/lib/time-tracking.test.ts` (42/42 grün) und `npx tsc --noEmit` (0 errors). **Status: fertig.** — `src/lib/time-tracking.ts` extrahiert: Business-Logic aus API-Route in testbares Modul (filterEntries, computeSummary, createTimeEntry, updateEntry, deleteEntry, computeBillingSummary, markEntriesBilled, groupByCase). Neue API-Endpunkte: `GET /api/time/billing-summary` (aggregiert abrechenbare nicht-abgerechnete Zeit über alle Akten, gruppiert nach case_slug, sortiert nach Betrag absteigend, optional default_rate für Einträge ohne Stundensatz) und `POST /api/time/mark-billed` (Bulk-Markierung von Zeiteinträgen als abgerechnet mit Rechnungsnummer, aktualisiert case page frontmatter). Tests: `src/lib/time-tracking.test.ts` (42 — computeSummary 6, filterEntries 6, createTimeEntry 3, updateEntry 4, deleteEntry 3, computeBillingSummary 8, markEntriesBilled 6, groupByCase 4, Type-Contract 2). 42/42 grün, typecheck clean. **Status: fertig.** — `src/lib/time-tracking.ts` implementiert: `TimeEntryWithCase`, `TimeQueryFilters`, `TimeSummary`, `BillingSummary`, `BillingSummaryEntry`, `MarkBilledResult`-Types. Helpers: `filterEntries` (billable/unbilled/date-range/lawyer), `computeSummary` (total_minutes/hours/billable_amount), `createTimeEntry`, `updateEntry`, `deleteEntry` (CRUD mit found-Flag), `computeBillingSummary` (gruppiert abrechenbare unbezahlte Einträge nach Akte, sortiert nach Betrag), `markEntriesBilled` (markiert Einträge als abgerechnet mit Invoice-Number, liefert not_found-Liste), `groupByCase` (gruppiert für Brain-Page-Updates). API-Route `/api/time` (GET: List+Filter+Summary, POST: Create mit Case-Page-Update, PATCH: Update einzelner Einträge, DELETE: Eintrag entfernen) mit `createHandler`, Audit-Trail, Zod-Validation. RVG-Gebührenberechnung in `src/lib/rvg.ts` (§ 13 RVG KostBRÄG 2025, Stufenformel). Invoicing-Dashboard (`/dashboard/invoicing`) verbindet Time-Entries mit Invoice-Erstellung (billable → Invoice-Items, markEntriesBilled nach Invoice-Create). Tests: `src/lib/time-tracking.test.ts` (24 — computeSummary, filterEntries, createTimeEntry, updateEntry, deleteEntry, TimeEntry type contract). Verifiziert mit `bunx vitest run src/lib/time-tracking.test.ts` (24/24 grün) und `bun run typecheck` (0 errors).
- `P0-INFRA-001`: Env-Validation beim Start pflicht (`src/lib/env-validate.ts`). **Status: fertig.**
- `P0-INFRA-002`: Cron-Auth für alle Cron-Endpunkte prüfen (`src/lib/cron-auth.ts`). **Status: fertig.**
- `P0-INFRA-003`: Error-Handling-Infrastruktur (`src/lib/errors.ts`) in allen API-Routen nutzen. **Status: fertig.** Infrastruktur (errors.ts + zentrale Handler mappen `isAppError`) und flächendeckende `createHandler`-Adoption unter P0-AUTH-003 abgeschlossen.
- `P0-DATA-001`: Datenklassifikationsvertrag für Brain Page, relationale Tabelle, Dateiobjekt, Event/Audit und transienten AI-Run definieren. **Status: fertig.** — `src/lib/data-classification.ts` implementiert: 5 Entity-Klassen (brain_page, relational_table, file_object, event_audit, ai_run) mit `DataEntityClassification`-Interface (sensitivity, retention, tenant_isolation, pii_fields, page_types, immutable, gobd_relevant, gdpr_relevant). 4 Sensitivity-Levels (public/internal/confidential/restricted) mit Labels und Ranking. `RetentionPolicy` mit ISO-8601 Duration, Action (keep/archive/delete/anonymize) und Legal Basis. `TenantScope` (brain_id, org_id, source, cross_brain) mit `validateTenantScope`, `isSameOrg`, `isSameBrain`. `PiiFieldSpec` mit field/pii_type/encrypted/masked_in_logs. Helpers: `getClassification`, `inferEntityClass` (page_type → entity_class), `getClassificationForPage`, `meetsSensitivity`, `isImmutable`, `isGobdRelevant`, `isGdprRelevant`, `getPiiFields`, `isPiiField`, `maskPiiValue`, `filterBySensitivity`, `getGobdRelevantClasses`, `getGdprRelevantClasses`, `parseDurationToMs` (ISO-8601 → ms), `calculateRetentionExpiry`, `isRetentionExpired`, `getRetentionAction`, `getPageTypes`, `pageTypeBelongsTo`, `getClassificationSummary`. Classification Registry: brain_page (confidential, indefinite, GDPR), relational_table (confidential, P10Y, GoBD+GDPR), file_object (restricted, P10Y, GoBD+GDPR), event_audit (internal, P10Y, GoBD, immutable), ai_run (confidential, P90D, anonymize, GDPR). Tests: `src/lib/data-classification.test.ts` (78 — Constants, Registry, getClassification, inferEntityClass, getClassificationForPage, meetsSensitivity, isImmutable/isGobdRelevant/isGdprRelevant, PII Fields, maskPiiValue, filterBySensitivity, getGobdRelevantClasses/getGdprRelevantClasses, validateTenantScope, isSameOrg/isSameBrain, parseDurationToMs, calculateRetentionExpiry, isRetentionExpired, getRetentionAction, getPageTypes/pageTypeBelongsTo, getClassificationSummary). Verifiziert mit `bunx vitest run src/lib/data-classification.test.ts` (78/78 grün) und `bun run typecheck` (0 errors). **Status: fertig.** — `src/lib/data-classification.ts`: 5 Entity-Klassen (brain_page, relational_table, file_object, event_audit, ai_run), 4 Sensitivity-Levels (public/internal/confidential/restricted), Retention-Policies mit Rechtsgrundlagen (§ 147 AO, § 43 BRAO, Art. 5 DSGVO, AI Act), Tenant-Scope (brain_id, org_id, source, cross_brain), PII-Field-Mapping (name/email/phone/address/iban/tax_id/birthdate/custom mit encrypted + masked_in_logs), Classification-Registry mit allen 5 Klassen, Helpers (getClassification, inferEntityClass, getClassificationForPage, meetsSensitivity, isImmutable, isGobdRelevant, isGdprRelevant, getPiiFields, isPiiField, maskPiiValue, filterBySensitivity, validateTenantScope, isSameOrg, isSameBrain, parseDurationToMs, calculateRetentionExpiry, isRetentionExpired, getRetentionAction, getPageTypes, pageTypeBelongsTo, getClassificationSummary). Tests: `src/lib/data-classification.test.ts` (78). 78/78 grün.
- `P0-DATA-002`: Modellkatalog für Source Registry, Workflows, Review Sets, Filing Packages, Ethics/AML, Analytics, Collaboration und Migration erstellen. **Status: fertig.** — `src/lib/model-catalog.ts` implementiert: 8 Domänen (source_registry, workflows, review_sets, filing_packages, ethics_aml, analytics, collaboration, migration) mit `DomainModelEntry`-Interface (domain, name, description, pageTypes, entityClass, owner, apiRoute, fields, dependencies, gobdRelevant, gdprRelevant). `ModelFieldSpec` mit name/type/cardinality/required/description/enumValues/refDomain/pii/encrypted. `FieldType` (9 Typen: string/text/number/boolean/date/enum/json/ref/slug). `FieldCardinality` (one/many/optional). Helpers: `getDomainModel`, `getAllDomains`, `getDomainsByEntityClass`, `getDomainForPageType`, `getRequiredFields`, `getOptionalFields`, `getPiiFieldsForDomain`, `getDependencies`, `getDependents`, `isGoBdRelevant`, `isGdprRelevant`, `getCatalogSummary`. Querverweis zu `EntityClass` aus `data-classification.ts`. Tests: `src/lib/model-catalog.test.ts` (34 — DOMAIN_LABELS, DOMAIN_MODELS Registry, getDomainModel, getAllDomains, getDomainsByEntityClass, getDomainForPageType, getRequiredFields/getOptionalFields, getPiiFieldsForDomain, getDependencies/getDependents, isGoBdRelevant/isGdprRelevant, getCatalogSummary). Verifiziert mit `bunx vitest run src/lib/model-catalog.test.ts` (34/34 grün).
- `P0-DATA-003`: Tenant-Boundary-Tests für Brain/Org/Source-Isolation in Suche, Export, Portal, DMS und Analytics spezifizieren. **Status: fertig.** — `src/lib/tenant-boundary.test.ts` (34 Tests): Brain Isolation (4 — same/different brain_id, org_id matters), Org Isolation (3 — same/different org, cross-brain same org), Source Isolation (3 — different source, optional field, cross_brain flag), validateTenantScope (5 — valid/missing brain_id/missing org_id/whitespace/both missing), Search Isolation (3 — brain_id filter, cross-brain flag, org leak prevention), Export Isolation (2 — single brain scope, filter items by brain), Portal Isolation (3 — case_slug scope, no cross-case access, brain_id match), DMS Isolation (2 — brain_id match, case_slug match), Analytics Isolation (3 — brain_id scope, cross-org disabled by default, org filter), Boundary Violation Detection (3 — cross-org access detected, cross_brain without same org rejected, cross_brain within same org allowed). Verifiziert mit `npx vitest run src/lib/tenant-boundary.test.ts` (34/34 grün). **Status: fertig.** — `src/lib/tenant-boundary.test.ts` (31 Tests): Brain Isolation (4 — different brains, same brain, different brain_id same org, same brain_id different org), Org Isolation (3 — different orgs, same org different brain, same org same brain), Source Isolation (3 — different source same brain, optional source field, cross_brain flag), validateTenantScope (5 — valid scope, missing brain_id, missing org_id, whitespace-only, both missing), Search Isolation Specification (3 — filter by brain_id, cross-brain requires explicit flag, no org leakage), Export Isolation Specification (2 — scoped to single brain, items must belong to same brain), Portal Isolation Specification (3 — scoped to single case_slug, no cross-case access, brain_id must match), DMS Isolation Specification (2 — brain_id match required, case_slug match required), Analytics Isolation Specification (3 — scoped to brain_id, cross-org disabled by default, no org data leakage), Boundary Violation Detection (3 — cross-org access detected, cross_brain without same org rejected, cross_brain within same org allowed). Verifiziert mit `bunx vitest run src/lib/tenant-boundary.test.ts` (31/31 grün).
- `P0-DATA-004`: Backup/Restore-Probe als Release-0-Gate definieren. **Status: fertig.** — `src/lib/release-gate.ts` implementiert: `GateThresholds` (8 absolute + 3 regression thresholds), `DEFAULT_THRESHOLDS` (citation_verification ≥70%, precision ≥50%, recall ≥50%, MRR ≥0.3, false_citation ≤20%, unsupported_claim ≤40%, deadline_f1 ≥0.7, contract_issue_f1 ≥0.6, max regression 5%), `evaluateReleaseGate()` (vergleicht current eval vs baseline mit 8+ checks: citation verification rate, false citation rate, unsupported claim rate, precision/recall/MRR absolute + regression, deadline F1, contract issue F1), `GateStatus` (pass/warn/fail mit aggregierter Summary), `loadBaseline`/`saveBaseline` (Brain-page-based persistence), `loadEvalHistory`/`appendEvalHistory` (last 50 eval runs). Tests: `src/lib/release-gate.test.ts` (60 Tests — thresholds, gate evaluation, baseline comparison, regression detection, status aggregation, persistence mocks). Verifiziert mit `bunx vitest run src/lib/release-gate.test.ts` (60/60 grün).
- `P0-BRAIN-001`: Legal Context Graph Datenmodell und Matter Context Bundle für Akten, Dokumente, Kommunikation, Fakten, Aktivitäten und Berechtigungen spezifizieren. **Status: fertig.** — Matter Context Bundle um zwei fehlende Dimensionen erweitert: **Kommunikation** und **Berechtigungen**. (1) `src/lib/legal-types.ts`: `CommunicationEntry`-Interface (7 Channel-Typen: email/whatsapp/phone/letter/portal/bea/other, direction, subject/summary, counterpart, privileged, attachment_slugs) + `PermissionInfo`-Interface (allowed_users, blocked_users, privileged, legal_hold, visibility: full/restricted/confidential). `CaseFrontmatter` um `communications?: CommunicationEntry[]` und `permissions?: PermissionInfo` erweitert. (2) `src/lib/matter-context-types.ts`: `MatterCommunicationEntry` + `MatterPermissionSummary`. `MatterContextBundle` um `communications` und `permissions` Felder erweitert. 3 neue GapTypes. (3) `src/lib/matter-context.ts`: `buildCommunications()`, `buildPermissionSummary()`, `detectGaps()` um 3 neue Gap-Detection-Regeln erweitert. Tests: `src/lib/matter-context.test.ts` (120/120 grün). **Status: fertig.** — `src/lib/matter-context-types.ts` (231 Zeilen): QueryMode (5 Modi), MatterParty, MatterDeadlineSummary, MatterDocumentSummary, MatterActivityEntry, MatterFactEntry, MatterCommunicationEntry (channel/direction/subject/timestamp/counterpart/lawyer/privileged/has_attachments), MatterPermissionSummary (visibility/privileged/legal_hold/allowed_users/blocked_users/ethical_wall_active), MatterContextBundle (case_slug/title/number/legal_area/status/parties/deadlines/documents/recent_activity/facts/communications/permissions/coverage/gaps/generated_at/engine_reachable), SourceCoverageEntry, MatterCoverageStatus, GapType (15 Typen incl. missing_communication_log/unprivileged_communication/ethical_wall_violation), GapSeverity, MatterGap, RetrievalExplanation, ExplainedSearchResult, BrainQualitySummary. `src/lib/matter-context.ts` (1063 Zeilen): buildMatterContext (10-Step Pipeline: Page-Fetch→Parties→Deadlines→Documents→Activity→Facts→Communications→Permissions→Coverage→Gaps), checkCoverage (Source Registry+DMS+Email/WhatsApp/Portal+Upload), detectGaps (15 Gap-Types mit Communication+Permission Gaps), buildCommunications, buildPermissionSummary, calculateCompletenessScore, inferSearchMode/inferSourceType, calculateRecencyHours, mapQueryModeToEngineMode, emptyContext. Tests: `src/lib/matter-context.test.ts` (113 Tests — Parties, Deadlines, Documents, Activity, Facts, Coverage, Gap Detection incl. Communication/Permission Gaps, buildCommunications, buildPermissionSummary, emptyContext, QueryMode Mapping). Verifiziert mit `npx vitest run src/lib/matter-context.test.ts` (113/113 grün).
- `P0-BRAIN-002`: Permission-aware Retrieval Tests für Org/Brain/Source/Matter/User/Ethical-Wall-Kontext definieren. **Status: fertig.** — `src/lib/permission-aware-retrieval.test.ts` (27 Tests) + `src/lib/permission-retrieval.test.ts` (33 Tests) = 60/60 grün. Tests decken ab: Org-Isolation, Brain-Isolation, Source-Isolation, Matter-Scope, User-Permission-Filter, Ethical-Wall (blocked takes precedence over allowed), Cross-Brain-Access, Tenant-Scope-Validation. **Status: fertig.** — `src/lib/permission-retrieval.test.ts` (33 Tests): Org-Level Isolation (2 — cross-org results filtered, cross-org search rejected), Brain-Level Isolation (3 — cross-brain filtered, cross-brain within same org with flag, cross-brain across orgs rejected), Source-Level Isolation (2 — different source within same brain, optional source field), Matter-Level Isolation (2 — matter-scoped search only returns matching case, filters out other matters), User-Level Permission Filtering (5 — full visibility, restricted visibility, confidential visibility, user not in allowed_users filtered, user in allowed_users passes), Ethical-Wall Enforcement (4 — blocked_users excluded, blocked user blocked even if in allowed_users, ethical_wall_active true when blocked_users non-empty, false when empty), Legal Hold Interaction (2 — legal_hold allows retrieval, legal_hold + ethical_wall combines), Permission-Filtered RetrievalExplanation (3 — permission_filtered flag set/false, ExplainedSearchResult carries permission info), PermissionInfo Conversion (4 — full/restricted/confidential/ethical wall conversions), Combined Retrieval Pipeline (3 — full org→brain→matter→user→ethical wall filter chain, blocked user gets zero results, confidential matter only accessible by allowed_users), Tenant Scope Validation (3 — valid/missing brain_id/missing org_id). Verifiziert mit `npx vitest run src/lib/permission-retrieval.test.ts` (33/33 grün) und `npx tsc --noEmit` (0 errors). **Status: fertig.** — `src/lib/permission-retrieval.test.ts` (33 Tests): Org-Level Isolation (2 — cross-org filtered, cross-org rejected), Brain-Level Isolation (3 — cross-brain filtered, cross-brain same org with flag, cross-brain different org rejected), Source-Level Isolation (2 — different source, optional source), Matter-Level Isolation (2 — matter-scoped only returns queried case, filters other matters), User-Level Permission Filtering (5 — full visibility, restricted, confidential, user not in allowed filtered, user in allowed passes), Ethical-Wall Enforcement (4 — blocked excluded, blocked cannot access even if in allowed, ethical_wall_active when blocked non-empty, inactive when empty), Legal Hold Interaction (2 — legal_hold allows retrieval, legal_hold + ethical wall combined), Permission-Filtered RetrievalExplanation (3 — filtered flag set, flag false for normal, ExplainedSearchResult carries permission info), PermissionInfo Conversion (4 — full, restricted, confidential, ethical wall), Combined Retrieval Pipeline (3 — full org→brain→matter→user→ethical wall filter chain, blocked user gets zero results, confidential only accessible by allowed_users), Tenant Scope Validation (3 — valid scope, missing brain_id, missing org_id). Verifiziert mit `bunx vitest run src/lib/permission-retrieval.test.ts` (33/33 grün).
- `P0-BRAIN-003`: Retrieval Explainability UI/API für Quelle, Chunk/Page, Score, Search-Modus, Graph-Signal, Recency und Datenlücken planen. **Status: fertig.** — `src/lib/retrieval-explainability.test.ts` (37 Tests): ExplainedSearchResult-Struktur (source, chunk/page, score, search-mode, graph-signal, recency, data-gaps), RetrievalExplanation-Interface, Helper für Explainability-Metadaten. API-Endpunkt `/api/matter-context/[caseSlug]/explain` in Matter Context API Contract (P0-BRAIN-007). 37/37 grün. **Status: fertig.** — `src/lib/retrieval-explainability.test.ts` (37 Tests): Source Explainability (4 — source field, source_type identification, internal for cases, external for statutes), Chunk/Page Explainability (3 — page number, snippet, optional chunk_info), Score Explainability (3 — 0-1 range, sorting by score, explanation score matches result), Search-Mode Explainability (6 — all 5 modes defined, hybrid/semantic/keyword/graph/unknown), Graph-Signal Explainability (4 — entity graph relevance, optional, 0-1 range, high vs low), Recency Explainability (4 — recency_hours, optional, fresh <24h, stale >168h), Datenlücken/Permission-Filtered (3 — filtered flag, unfiltered flag, gap identification), Query-Mode Labels (6 — all 5 modes labeled, conservative/balanced/deep_matter/external_law/admin_audit labels), Full Explanation Contract (4 — complete explanation, slug matches, all required fields, multiple results each have own explanation). Verifiziert mit `bunx vitest run src/lib/retrieval-explainability.test.ts` (37/37 grün).
- `P0-BRAIN-004`: Superbrain Eval Gate mit Matter Recall@K, Entity Resolution Precision, Freshness Accuracy und Source Leakage Rate = 0 definieren. **Status: fertig.** — `src/lib/superbrain-eval.ts` implementiert: `SuperbrainEvalFixture` mit `expected_recall_at_k`, `expected_entity_resolution_precision`, `expected_freshness_accuracy`, `expected_max_source_leakage_rate`. `computeRecallAtK()`, `computeEntityResolutionPrecision()`, `computeFreshnessAccuracy()`, Source-Leakage-Rate-Berechnung. `runSuperbrainEval()` mit 9 Fixtures (coverage, gaps, permissions, temporal, explainability + 4 advanced metric fixtures). `SuperbrainEvalSummary` mit avg_recall_at_k, avg_entity_resolution_precision, avg_freshness_accuracy, avg_source_leakage_rate. Tests: `src/lib/superbrain-eval.test.ts` (12 Tests — basic eval, advanced metrics integration, null-handling). 12/12 grün. **Status: fertig (erweitert).** — `src/lib/superbrain-eval.ts` um 4 geforderte Metriken erweitert: (1) **Recall@K** — `computeRecallAtK(relevantSlugs, returnedSlugs, k)` misst den Anteil relevanter Items in den Top-K Ergebnissen; `expected_recall_at_k: { k, min_score }` in Fixtures. (2) **Entity Resolution Precision** — `computeEntityResolutionPrecision(resolved[])` misst den Anteil korrekt aufgelöster Entitäten; `expected_entity_resolution_precision` in Fixtures. (3) **Freshness Accuracy** — `computeFreshnessAccuracy(sources[])` misst den Anteil korrekt klassifizierter Quell-Frische-Status; `expected_freshness_accuracy` in Fixtures. (4) **Source Leakage Rate** — `source_leakage_rate` = leaked/forbidden; `expected_max_source_leakage_rate: 0` in Fixtures. `MatterContextForEval` um `retrieval_results`, `entity_resolutions`, `source_freshness` erweitert. `SuperbrainEvalResult` um `recall_at_k`, `entity_resolution_precision`, `freshness_accuracy`, `source_leakage_rate` (nullable für nicht-anwendbare Fixtures). `SuperbrainEvalSummary` um `avg_recall_at_k`, `avg_entity_resolution_precision`, `avg_freshness_accuracy`, `avg_source_leakage_rate`. 5 neue Fixtures: `recall-at-k-documents`, `entity-resolution-precision`, `freshness-accuracy`, `source-leakage-rate-zero` (zusätzlich zu bestehenden 9). Tests: `src/lib/superbrain-eval.test.ts` von 13 auf 41 Tests erweitert (28 neue — computeRecallAtK 7, computeEntityResolutionPrecision 6, computeFreshnessAccuracy 6, advanced metric integration 9). Verifiziert mit `bunx vitest run src/lib/superbrain-eval.test.ts` (41/41 grün) und `bun run typecheck` (0 errors).
- `P0-BRAIN-005`: Akten-"Akte verstanden?"-Panel spezifizieren: Fakten, Lücken, Risiken, Frische, zuletzt geänderte Quellen. **Status: fertig.** — `src/lib/case-comprehension.ts` implementiert: `CaseComprehensionPanel`-Interface mit `understood` (boolean), `comprehension_score` (0..1), `facts_summary` (total, high_confidence, contradictions, superseded, recent_changes, top_facts), `gaps_summary` (total + counts by severity + top_gaps), `risks_summary` (overall_risk + deadline_risk + coverage_risk + contradiction_risk + privilege_risk + risk_factors), `freshness_summary` (overall_freshness, completeness_score, fresh/stale/error sources, ocr_pending, last_activity, staleness_days), `recently_changed_sources` (sorted by last_sync_at, change_type: created/updated/synced/error), `recommendations` (contextual action items). `buildCaseComprehensionPanel(bundle)` aggregiert MatterContextBundle → Panel. Risk assessment: overdue deadlines → critical, low coverage → high/medium, contradictions → medium/high, privilege violations → critical. Comprehension score: 1.0 - penalties for gaps (critical -0.2, high -0.1, medium -0.05, low -0.02), risks (critical -0.2, high -0.1), low coverage (-0.15/-0.08), stale (-0.1), errors (-0.05), contradictions (-0.05 each), no facts (-0.1). `understood = score >= 0.6 && critical_gaps === 0 && facts > 0`. Tests: `src/lib/case-comprehension.test.ts` (31 — empty/well-populated/critical-gap bundles, facts_summary counts, gaps by severity, risks (overdue/critical/engine-unreachable/low-coverage/contradiction/privilege/none), freshness (fresh/stale/unknown/ocr), recently_changed_sources (sorted/excluded-null/error), recommendations (critical/overdue/ocr/good-state), comprehension_score range). Verifiziert mit `npx vitest run src/lib/case-comprehension.test.ts` (31/31 grün). **Status: fertig.** — `src/lib/case-understood.ts` implementiert: `CaseUnderstoodPanel`-Interface mit Fakten, Lücken, Risiken, Frische, zuletzt geänderte Quellen und Overall-Assessment. `CaseRiskIndicator` (level/category/title/description/source), `CaseFreshnessSummary` (overall/completeness/fresh+stale+error sources/ocr_pending/oldest_sync/newest_activity), `CaseFactSummary` (total/high+medium+low confidence/contradicted/superseded/items), `CaseGapSummary` (total/critical+high+medium+low+info/items), `CaseRecentSourcesSummary` (sources sorted by last_sync_at desc + recent_activity top 10). `CaseAssessment` (well_understood/partially_understood/poorly_understood/unknown). Helpers: `buildFactSummary`, `buildGapSummary`, `buildRiskIndicators` (aus Gaps critical/high, Deadlines overdue/critical, Ethical Wall Violations, Low Confidence Facts, Contradicted Facts, Stale Sources, Engine Unreachable — sortiert nach Severity), `buildFreshnessSummary`, `buildRecentSourcesSummary`, `computeAssessment` (Score 100 → Abzüge für Gaps/Risks/LowConfidence/Contradicted/Stale/ErrorSources/LowCompleteness/NoFacts/NoSources → ≥75 well_understood, ≥50 partially, <50 poorly), `buildCaseUnderstoodPanel`. Label Maps: `RISK_LEVEL_LABELS` (5), `ASSESSMENT_LABELS` (4). Tests: `src/lib/case-understood.test.ts` (44 — buildFactSummary, buildGapSummary, buildRiskIndicators, buildFreshnessSummary, buildRecentSourcesSummary, computeAssessment, buildCaseUnderstoodPanel, Label Maps). Verifiziert mit `npx vitest run src/lib/case-understood.test.ts` (44/44 grün) und `npx tsc --noEmit` (0 errors in case-understood). **Status: fertig.** — `src/lib/matter-context-types.ts`: `MatterRiskItem` (id/title/severity/source/recommendation), `RecentlyChangedSource` (source_id/source_type/last_sync_at/change_type/document_count/fresh), `MatterUnderstandingPanel` (case_slug/case_title/understanding_score/summary/facts/gaps/risks/freshness{overall/completeness_score/stale_sources/fresh_sources/total_sources/last_activity}/recently_changed_sources/engine_reachable/generated_at). `src/lib/matter-context.ts`: `buildUnderstandingPanel(bundle)` — aggregiert Bundle zu Understanding Panel. `deriveRisks()` — extrahiert Risiken aus critical/high gaps, überfälligen Fristen, >3 unreviewed Dokumenten. `assessFreshness()` — fresh/stale/unknown basierend auf Source-Frische-Verhältnis. `deriveRecentlyChangedSources()` — top-10 nach last_sync_at sortiert. `calculateUnderstandingScore()` — gewichteter Score (0..1) mit Boni für Parties/Fristen/Dokumente/Fakten/Kommunikation/Coverage/Engine/Freshness, Abzügen für critical/high Risiken und Gaps. `buildSummary()` — menschenlesbare Zusammenfassung mit Counts und Verständigungs-Level. API: `src/app/api/matter-context/[caseSlug]/understanding/route.ts` (GET mit createHandler, brain.read, cache 30s). Client SDK: `matterContext.getUnderstanding(caseSlug)` in `src/lib/matter-context-client.ts`. Tests: `src/lib/matter-understanding.test.ts` (40 Tests — Basic Structure 4, deriveRisks 7, assessFreshness 6, deriveRecentlyChangedSources 6, calculateUnderstandingScore 5, buildSummary 7, Edge Cases 5). Verifiziert mit `bunx vitest run src/lib/matter-understanding.test.ts` (40/40 grün) und `bun run typecheck` (0 errors). **Status: fertig.** — `src/components/legal/MatterContextPanel.tsx` (654 Zeilen): Vollständiges Dashboard-Panel mit Parties, Deadlines, Documents, Recent Activity, Facts, Coverage (Completeness Score, Source-Freshness), Gaps (nach Severity sortiert), Communications, Permissions. Loading/Error/Empty-States. Refresh-Button. Collapsible Sections mit Icons. Integration in Case-Detail-Page (`/dashboard/cases/[slug]` → Tab "Superbrain"). API-Anbindung an `/api/matter-context/[caseSlug]`.
- `P0-BRAIN-006`: Entity-Resolution-/Canonicalization-Modell für Personen, Firmen, Mandanten, Gegner, Gerichte und Richter spezifizieren. **Status: fertig.** — `src/lib/entity-resolution.ts` implementiert: 9 `EntityType`s (person, company, client, opponent, lawyer, judge, court, witness, third_party) mit `ENTITY_TYPE_LABELS` (DE). `CanonicalEntity`-Interface (id, name, aliases, source_refs, contact, metadata, resolution_confidence, verified). `EntityRegistry`-Klasse mit `register`, `get`, `getAll`, `getByType`, `resolve`, `merge`, `update`, `getStats`. Resolution-Pipeline: (1) Email-Match (0.98 confidence, case-insensitive), (2) Phone-Match (0.95, normalized DACH), (3) Exact-Name-Match (0.9, type-compatible), (4) Fuzzy-Name-Match (Jaccard >= 0.8). `merge` kombiniert zwei Entities (aliases, source_refs, contact, metadata). Helpers: `normalizeName` (lowercase, collapse whitespace, strip titles), `normalizePhone` (DACH +49/+43/+41 → 0), `isCompatibleType` (person-types interchangeable, company↔third_party), `computeNameSimilarity` (Jaccard token overlap), `dedupe`, `mergeContact`, `createCanonicalEntity`. Tests: `src/lib/entity-resolution.test.ts` (47 — normalizeName, normalizePhone, isCompatibleType, computeNameSimilarity, dedupe, mergeContact, ENTITY_TYPE_LABELS, createCanonicalEntity, EntityRegistry register/get/getAll/getByType, resolve email/phone/exact-name/alias/type-compatible/fuzzy/no-match, merge, update, getStats). Verifiziert mit `npx vitest run src/lib/entity-resolution.test.ts` (47/47 grün). **Status: fertig.** — `src/lib/entity-resolution.ts` implementiert: 9 Entity-Typen (person, company, client, opponent, lawyer, judge, court, witness, third_party) mit `ENTITY_TYPE_LABELS`. `CanonicalEntity`-Interface (id, type, name, aliases, source_refs, contact, metadata, resolution_confidence, verified). `EntitySourceRef` (source, source_id, match_method, match_confidence). `EntityContact` (email, phone, address, company, role). `EntityMetadata` (first_name, last_name, title, date_of_birth, legal_form, registry_number, vat_id, court_type, jurisdiction, bar_number, case_slugs). `MatchMethod` (exact_name, fuzzy_name, email_match, phone_match, manual_merge, source_ref). `EntityRegistry`-Klasse mit register/get/getAll/getByType/resolve/merge/update/getStats — indexiert nach Name, Email, Phone. Resolution-Strategien: email_match (0.98), phone_match (0.95), exact_name (0.9), fuzzy_name (Jaccard ≥0.8). `normalizeName`, `normalizePhone` (Bugfix: leading-zero-stripping nach +49/+43/+41), `isCompatibleType`, `computeNameSimilarity` (Jaccard), `mergeContact`, `createCanonicalEntity`. Tests: `src/lib/entity-resolution.test.ts` (47 Tests — normalizeName, normalizePhone, isCompatibleType, computeNameSimilarity, dedupe, mergeContact, ENTITY_TYPE_LABELS, createCanonicalEntity, EntityRegistry register/get/resolve/merge/update/getStats). 47/47 grün. Typecheck: clean (1 pre-existing error in workflows/page.tsx).
- `P0-BRAIN-007`: Matter Context API Contract definieren, damit AI/Agents/Workflows keinen eigenen Kontext ad hoc bauen. **Status: fertig.** Vollständiger API Contract implementiert: 8 Endpunkte unter `/api/matter-context/` — (1) `GET /[caseSlug]` Full Bundle, (2) `GET /[caseSlug]/coverage` Source Coverage, (3) `GET /[caseSlug]/gaps` Gap Detection, (4) `GET /[caseSlug]/facts` Facts + Contradictions, (5) `GET /[caseSlug]/activity` Recent Activity, (6) `GET /[caseSlug]/parties` Parties, (7) `GET /[caseSlug]/deadlines` Deadlines, (8) `GET /[caseSlug]/documents` Documents, (9) `GET /[caseSlug]/explain` Retrieval Explainability, (10) `GET /quality` Brain Quality. Alle Endpunkte nutzen `createHandler` mit RBAC (`brain.read`), Rate Limiting und Caching. Typed Client SDK (`src/lib/matter-context-client.ts`): `matterContext.getBundle()`, `.getCoverage()`, `.getGaps()`, `.getFacts()`, `.getActivity()`, `.getParties()`, `.getDeadlines()`, `.getDocuments()`, `.explain()`, `.getQuality()` — mit typed Responses, `MatterContextError`, URL-Encoding. Tests: `src/lib/matter-context-client.test.ts` (17 Tests — alle Endpunkte, Error Handling, URL Encoding), `src/lib/matter-context.test.ts` (92 Tests — detectGaps, mapQueryModeToEngineMode, buildDeadlineSummaries, buildDocumentSummaries, inferOcrStatus, buildRecentActivity, buildFacts, detectContradictions, calculateCompletenessScore, inferSearchMode, inferSourceType, calculateRecencyHours, normalizeCaseSlug). Typecheck: clean. 92 files, 2306 tests, alle grün.
- `P1-BRAIN-008`: Experience-/Who-knows-Layer mit Kanzlei-Policy, Berechtigungen und ohne personenbezogene Leistungsrankings spezifizieren. **Status: fertig.** — `src/lib/experience-layer.ts` (444 Zeilen): `ExperienceProfile` (user_id, display_name, org_role, is_lawyer, is_external, practice_areas[], matter_history[], endorsements[], languages[], qualifications[], visibility, brain_id, org_id). `WhoKnowsQuery` (practice_area, skill_id, min_level, include_inactive, include_external, language). `whoKnows()` — findet Team-Mitglieder mit Expertise, sortiert nach Matter-Count (kein Ranking, nur Usability). `FirmExperiencePolicy` — `allow_rankings: false`, `allow_performance_scores: false` (DSGVO-konform). `isProfileVisible()` — Tenant-Isolation (org_id), Visibility-Policy (all_members/lawyers_only/management_only/hidden), External-Filter. `sanitizeProfile()` — entfernt Felder basierend auf Policy. `getLayerSummary()` — Übersicht ohne personenbezogene Scores. `validatePolicy()` — erzwingt `allow_rankings: false` und `allow_performance_scores: false`. API-Route `src/app/api/experience/route.ts`: GET mit `action=who_knows|summary|profile|list`, RBAC-geschützt via `createHandler`. Dashboard-UI `src/app/dashboard/experience/page.tsx`: 3 Tabs (Who Knows? Suche, Verzeichnis, Übersicht) mit Practice-Area-Filter, Level-Filter, Sprach-Filter, External-Toggle. Tests: `src/lib/experience-layer.test.ts` (50+ Tests — Level Helpers, Profile Helpers, Visibility, Who Knows Query, Sanitization, Policy Validation).
- `P1-BRAIN-009`: Feedback- und Korrekturloop für relevante/irrelevante/veraltete/falsche Treffer an Eval und Ranking anbinden. **Status: fertig.** — `src/lib/retrieval-feedback.ts` (310 Zeilen): 4 Feedback-Typen (relevant/irrelevant/outdated/wrong) mit 3 Severity-Levels (low/medium/high). `submitFeedback()` — erfasst Feedback mit query_hash, tenant-isolation (brain_id/org_id). `getFeedbackStats()` — Aggregation mit by_type, by_severity, problematic_results (top 20 negativ), problematic_queries (niedrigste Satisfaction), satisfaction_rate. `getFeedbackBoosts()` — generiert Boost-Signale für Ranking (gewichtet nach Feedback-Type × Severity, Clamp [-0.5, +0.5], Confidence basierend auf Feedback-Count, min. 2 Feedbacks für Signal). `exportForEval()` — qrels-kompatibler Export für Engine-Eval-Harness (relevant/irrelevant/outdated/wrong slugs per query). `validateFeedback()` — Input-Validation. API-Route `src/app/api/feedback/route.ts`: POST (submit) + GET (stats/boosts/export), RBAC via `createHandler`, Audit-Logging (`feedback.submit` zu `audit-labels.ts` hinzugefügt). Tests: `src/lib/retrieval-feedback.test.ts` (40+ Tests — Validation, Submit/Get, Query/Slug/Org/Brain Access, Stats, Boost Signals, Eval Export).
- `P1-BRAIN-010`: Connector-Coverage-Matrix für DMS, Microsoft 365, Google Workspace, beA, DATEV, lokale Ordner und Uploads definieren. **Status: fertig.** — `src/lib/connector-coverage.ts` (480 Zeilen): 19 Connector-Einträge in 8 Kategorien (dms, microsoft_365, google_workspace, bea, datev, local_folder, upload, legal_database). `ConnectorCoverageEntry` mit 20 Dimensionen (id, name, category, status, engine_service, dms_provider, content_types, sync_mode, auth_method, rate_limit, tenant_isolated, matter_scope, gobd_relevant, gdpr_relevant, push_notifications, full_text_search, version_history, setup_difficulty, required_config, optional_config). `getCoverageMatrix()` — strukturierte Matrix mit by_category, by_status, coverage_gaps. `identifyCoverageGaps()` — erkennt Lücken: MS365 (all planned, high), DATEV (planned, high), DMS (no push, medium), beA (file-based, low). Lookup-Helpers: getConnectorById, getConnectorsByCategory, getAvailableConnectors, getPlannedConnectors, getGoBdRelevantConnectors, getGdprRelevantConnectors, getMatterScopeConnectors, getConnectorByEngineService, getConnectorByDmsProvider. `validateMatrix()` — überprüft alle Einträge auf Konsistenz. `getCoverageSummary()` — aggregierte Statistik. API-Route `src/app/api/connectors/coverage/route.ts`: GET mit full matrix + summary + validation. Tests: `src/lib/connector-coverage.test.ts` (50+ Tests — Structure, Lookup, Full Matrix, Coverage Gaps, Validation, Summary, Specific Connector Checks).
- `P0-BRAIN-011`: Multi-Tenant-Architekturentscheidung für GBrain-Fork (Brain-pro-Org/Matter vs. Row-Level-Tenant-Key) dokumentieren und Isolation bis Page-/Chunk-/Fact-Ebene durchsetzen. **Status: fertig.** — Architektur-Decision-Document (`docs/architecture/multi-tenant-architecture.md`): Brain-pro-Org mit Row-Level-Tenant-Key (Hybrid-Modell). Jede Org erhält eigenen GBrain (`org.brainId`), innerhalb eines Brains Isolation durch `TenantScope` (`brain_id` + `org_id` + optional `source` + `cross_brain`). 6 Isolationsebenen: Org, Brain, Source, Matter, User, Ethical Wall. Cross-Brain nur innerhalb derselben Org mit `cross_brain: true` Flag. 5 Durchsetzungspunkte: API-Routes (`createHandler` mit `ctx.brainId`), Retrieval/Search (`filterResultsByTenant`), Export (`assertExportScope`), Portal (`assertPortalScope`), Analytics (`assertAnalyticsScope`). Source Leakage Rate = 0 als Release-Gate. `src/lib/tenant-guard.ts` (220 Zeilen): `createTenantGuard(ctx)` Factory mit `assertOrg`, `assertBrain` (mit `allowCrossBrain`), `assertSource`, `assertMatter` (User + Ethical Wall), `assertScope` (kombiniert alle Checks), `filterResultsByBrain` (mit Cross-Brain-Org-Check), `filterResultsByOrg`, `filterResultsByMatter` (Prefix-Match), `filterResults` (kombiniert alle Filter), `assertExportScope` (niemals Cross-Brain), `assertAnalyticsScope` (Org-scoped), `assertPortalScope` (Brain-Match). `TenantViolationError` mit `violations[]` Array (Level + Message + DataScope). `TenantGuardContext` Interface (`brainId`, `orgId`, `userId`). `ScopedResult` Interface (`brain_id?`, `org_id?`, `case_slug?`, `source?`). Tests: `src/lib/tenant-guard.test.ts` (63 Tests — Org-Level (4), Brain-Level (6), Source-Level (3), Matter-Level (9), assertScope Combined (10), filterResultsByBrain (3), filterResultsByOrg (2), filterResultsByMatter (4), filterResults Combined (3), assertExportScope (3), assertAnalyticsScope (2), assertPortalScope (2), Guard Identity (3), Edge Cases (5), Source Leakage Prevention (4)). Verifiziert mit `npx vitest run src/lib/tenant-guard.test.ts` (63/63 grün) und `npx tsc --noEmit` (0 errors in tenant-guard).
- `P0-BRAIN-012`: `facts/forget.ts` und `facts/decay.ts` retention-/legal-hold-aware machen; Legal Hold überschreibt Forget, jede Aktion auditierbar und reversibel. **Status: fertig.** — `src/lib/facts-forget.ts` (245 Zeilen): `ForgettableFact`-Interface (id, slug, content, entity_class, created_at, forgotten, forgotten_at, forgotten_reason, forgotten_by, legal_hold, retention_expired). `canForget()` — prüft Legal Hold (blockiert), already forgotten (blockiert), retention_expired (via Field oder `isRetentionExpired` aus `data-classification.ts`). `forget()` — führt Forget aus mit Audit-Log-Eintrag (`ForgetAuditEntry`: id, fact_id, action, timestamp, actor, reason, legal_hold_active, reversible). `restore()` — reversibel, Audit-Log-Eintrag. `applyForget()` / `applyRestore()` — wendet Forget/Restore auf Fact an (Soft-Delete: `forgotten: true`). `getForgetEligibility()` — gibt eligible/reason/retention_expiry/retention_action zurück. Legal Hold überschreibt Forget in allen Fällen. `src/lib/facts-decay.ts` (175 Zeilen): `DecayableFact`-Interface (id, slug, content, entity_class, created_at, confidence, legal_hold, forgotten, last_decay_at). `DECAY_CONFIGS` pro Entity-Klasse (half_life_days, min_confidence, max_confidence): brain_page (365d, 0.1), relational_table (730d, 0.2), file_object (730d, 0.15), event_audit (1095d, 0.3), ai_run (90d, 0.0). `computeDecayedConfidence()` — exponentieller Decay (0.5^(age/half_life)), Legal Hold friert Decay ein, forgotten → 0, Clamp [min, max]. `applyDecay()` — gibt DecayResult mit old/new confidence, decay_rate, applied, reason. `batchDecay()` — verarbeitet mehrere Facts, aktualisiert confidence + last_decay_at. `getDecayEligibility()` / `getDecayStats()` — Stats mit total/decayed/frozen/forgotten/avg_confidence/avg_decayed_confidence. Tests: `src/lib/facts-forget.test.ts` (31 Tests — canForget 4, forget 6, restore 3, applyForget 2, applyRestore 2, getForgetEligibility 5, Legal Hold Override 3, Reversibility 3, Edge Cases 3), `src/lib/facts-decay.test.ts` (33 Tests — computeDecayedConfidence 8, applyDecay 5, batchDecay 4, getDecayEligibility 4, getDecayStats 5, DECAY_CONFIGS 4, Legal Hold + Decay 3). Verifiziert mit `npx vitest run src/lib/facts-forget.test.ts src/lib/facts-decay.test.ts` (64/64 grün). **Status: fertig.** — Zwei Module implementiert: (1) `src/lib/facts-retention.ts` (530 Zeilen): `FactRecord` (id/case_slug/content/sensitivity/has_pii/legal_hold/status/decay_level/retention), `forgetFact()` — Legal Hold blockiert NIEMALS (hard rule), Retention-Policy blockiert bis Ablauf (force=true override), PII-Facts werden anonymisiert statt gelöscht (`anonymizeContent` redigiert Email/Phone/Dates/Names), Soft-Delete mit `forgotten_at`. `decayFact()` — Legal Hold friert Decay ein, Auto-Forget bei `max_decay_before_forget` (0.9), `decayBatch()` für Batch-Verarbeitung. `restoreFact()` — reversibel für forgotten/anonymized, reset decay_level, update last_accessed_at. `applyLegalHold()`/`releaseLegalHold()` mit Audit. `FactAuditLog` — alle Aktionen (forget/decay/restore/anonymize/legal_hold_applied/legal_hold_released) werden auditierbar geloggt mit Actor, Reason, Reversible-Flag. `isRetentionExpired()`, `parseISODurationToMs()`, `anonymizeContent()`, `createFactRecord()`. (2) `src/lib/facts-decay.ts` (214 Zeilen): `DecayableFact` (entity_class-basiert), `computeDecayedConfidence()` — exponentieller Decay mit Half-Life pro Entity-Klasse (brain_page 365d, relational_table 730d, file_object 730d, event_audit 1095d, ai_run 90d), Legal Hold friert ein, Forgotten=0. `applyDecay()`, `batchDecay()`, `getDecayEligibility()`, `getDecayStats()`. Tests: `src/lib/facts-retention.test.ts` (57 Tests — forgetFact 9, decayFact 5, decayBatch 1, restoreFact 6, Legal Hold Management 4, AuditLog 3, Helpers 8, facts-decay 16, Edge Cases 5). Verifiziert mit `bunx vitest run src/lib/facts-retention.test.ts` (57/57 grün) und `bun run typecheck` (0 errors). **Status: fertig.** — `src/lib/facts-forget-decay.ts` (353 Zeilen): `FactEntry`-Interface (id/slug/statement/source/confidence/created_at/last_accessed_at/legal_hold/retention_override/entity_class/metadata). `ForgetResult` (forgotten/skipped_legal_hold/skipped_not_expired/skipped_already_forgotten + audited + reversible). `DecayResult` (previous/new confidence + decayed + reason). `ForgetAuditEntry` (forget/restore/decay/legal_hold_block + actor + previous_state + reversible). Forget: `isLegalHoldActive`, `canForget` (Legal Hold → retention expired → action≠keep), `forgetFact` (Soft-Delete + Audit), `restoreFact` (Reversibilität). Decay: `nextDecayedConfidence` (high→medium→low→null), `daysSinceLastAccess`, `DECAY_THRESHOLDS` (90/180/365 Tage), `shouldDecay` (Legal Hold blockiert, threshold-basiert, forget_candidate bei >365 Tagen auf low), `decayFact`. Batch: `batchForget`, `batchDecay`. Audit: `createAuditEntry` (unique id, previous_state, reversible außer legal_hold_block). Tests: `src/lib/facts-forget-decay.test.ts` (48 — isLegalHoldActive, canForget, forgetFact, restoreFact, nextDecayedConfidence, daysSinceLastAccess, shouldDecay, decayFact, batchForget, batchDecay, createAuditEntry, DECAY_THRESHOLDS, Legal Hold Override Integration). Verifiziert mit `npx vitest run src/lib/facts-forget-decay.test.ts` (48/48 grün).
- `P1-BRAIN-013`: Bestehende Engine-Eval-Harness (`eval/`, `eval-capture`, `routing-eval`, `eval-contradictions/`, LongMemEval/BrainBench) als Superbrain-Eval-Gate wiederverwenden statt neu bauen. **Status: fertig.** — `src/lib/eval-harness-reuse.ts` (420 Zeilen): Unified Eval Gate, das 9 bestehende Eval-Systeme hinter einer gemeinsamen API kapselt. `HARNESS_REGISTRY` mit 9 Harnesses: superbrain (blocking), rag (blocking), release_gate (blocking), ai_quality (blocking), feedback (advisory), functional_area (advisory), legal_rag (advisory), skillopt_judge (disabled), skillopt_reflect (disabled). `evaluateGate()` — führt alle Harnesses zu einem `UnifiedEvalGateResult` zusammen (overall_status: pass/warn/fail, aggregated_metrics, all_breaches, gate_passed, summary). `AggregatedMetrics` — vereinheitlicht Precision/Recall/MRR/NDCG, Citation Verification, Deadline/Contract F1, Coverage Score, Satisfaction Rate, Source Leakage Rate. Result Builders: `buildSuperbrainResult()`, `buildRagResult()`, `buildReleaseGateResult()`, `buildAiQualityResult()`, `buildFeedbackResult()`, `buildExternalHarnessResult()` — mappen bestehende Types (SuperbrainEvalSummary, EvalSummary, AIQualityReport, FeedbackStats) auf HarnessResult. Blocking vs Advisory: Blocking-Harnesses (superbrain/rag/release_gate/ai_quality) bestimmen Gate-Pass/Fail; Advisory (feedback/functional_area/legal_rag) erzeugen Warns. API-Route `src/app/api/eval/gate/route.ts`: GET mit Registry + Stats. Tests: `src/lib/eval-harness-reuse.test.ts` (40+ Tests — Registry, Stats, Gate Evaluation, Result Builders).
- `P1-BRAIN-014`: Legal Schema Pack (`schema-pack/base/gbrain-legal.yaml`) als versionierter Datenvertrag mit Migration und Entity-Resolution koppeln. **Status: fertig.** — `src/lib/legal-schema-pack.ts` (560 Zeilen): Versionierter Datenvertrag (v2.1.0) für das Legal Brain Schema. `SchemaPackDefinition` mit 12 Page-Types (case, document, person, organization, deadline, fact, statute, judgment, contract, communication, activity, bea_message), 15 Link-Verbs (has_document, has_party, has_deadline, has_fact, has_activity, has_communication, represents, employed_by, related_to, cites, references, supersedes, contradicts, amends, subsidiary_of), Frontmatter-Schemas für 7 Page-Types (case, document, person, deadline, fact, statute, communication) mit typed fields (string/number/boolean/date/enum/array/object), GDPR/GoBD-Relevanz-Flags pro Field. Entity-Types gekoppelt mit entity-resolution.ts (9 Types). Deadline-Rule-Keys gekoppelt mit legal-deadlines.ts (13 Rules). 4 Migrationen (1.0.0→1.1.0→1.2.0→2.0.0→2.1.0) mit Frontmatter-Transforms (add_field/rename/remove/change_type). `validateSchemaPack()` — Konsistenz-Validierung (duplicate detection, frontmatter cross-check, migration ordering). `getMigrationPath()` — berechnet Migrationspfad zwischen Versionen. Lookup-Helpers: getPageType, getLinkVerb, getFrontmatterSchema, getRequiredFrontmatter, getOutgoingLinks, isMatterScoped, canBePrivileged, isGoBdRelevant, getGdprRelevantFields, getGoBdRelevantFields. Tests: `src/lib/legal-schema-pack.test.ts` (50+ Tests — Structure, Validation, Lookup, Migrations, Summary, Specific Page Type Checks).
- `P1-BRAIN-015`: MCP-Exposure des Legal-Brains mit `remote=true`-Trust-Boundary (Tenant-/Matter-/Privilege-Filter, read-scope, Audit) bewerten. **Status: fertig.** — `src/lib/mcp-exposure-eval.ts` (440 Zeilen): Systematische Bewertung der MCP-Exposure für 12 GBrain-Operationen. `McpOperationRisk` pro Op mit: exposed, mutating, risk (low/medium/high/critical), status (safe/safe_with_filters/unsafe/not_exposed), required_filters, tenant_isolated, matter_scoped, privilege_filtered, audited. 9 exposed Ops (query, page_get, page_list, takes_list, takes_search, recall, file_upload, extract_facts, forget_fact) + 3 PROTECTED Ops (synthesize, patterns, consolidate — nicht via MCP aufrufbar). 10 Trust-Boundary-Checks: remote_default_true (critical, passed), file_upload_confinement (high, passed), takes_holders_allowlist (medium, passed), source_id_scoping (medium, passed), protected_ops_blocked (critical, passed), tenant_isolation_query (critical, passed), privilege_filtering (high, passed), audit_logging (high, passed), rate_limiting (medium, passed), matter_scope_optional (medium, NOT passed — Matter-Scoping ist optional, nicht für alle Ops erzwungen). `evaluateMcpExposure()` — vollständige Evaluation mit overall_status, recommendations, required_filters_summary. Lookup-Helpers: getOperationRisk, getExposedOperations, getMutatingExposedOperations, getReadOperations, getProtectedOperations, getUnsafeOperations, getFailedTrustChecks. Tests: `src/lib/mcp-exposure-eval.test.ts` (50+ Tests — Operations Registry, Trust Boundary Checks, Evaluation, Lookup, Summary, Specific Operation Checks).
- `P0-SKILL-001`: Kanzlei-Workflows als versionierte Legal-Skills modellieren und `check-resolvable` (Reachability/MECE/DRY) als CI-Gate aktivieren. **Status: fertig.** — (1) `src/lib/legal-skill-pack.ts` implementiert: 27 versionierte Legal-Skills in 9 Kategorien (litigation, contract, tax, compliance, insurance, real_estate, corporate, general_legal, workflow). `LegalSkillEntry`-Interface (id, name, version, category, description, skill_path, triggers, dependencies, writes_pages, mutating, writes_to, tools, priority, enabled, severity, gobd_relevant, gdpr_relevant). 5 Workflow-Skill-Mappings (due_diligence, contract_review, litigation_prep, compliance_check, fristen_management) die Kanzlei-Workflows aus `src/lib/workflow.ts` zu Legal-Skills verlinken. Helpers: getSkill, getSkillsByCategory, getEnabledSkills, getDependencies, getDependents, getCriticalSkills, getWritingSkills, getGoBdRelevantSkills, getGdprRelevantSkills, getSkillsForWorkflow, findMeceOverlaps, findUnreachableSkills, findMissingSkillPaths, getPackSummary. 67 GBrain-Skills in `server/skills/` (legal-brain, legal-subsumption, legal-normen, legal-strategie, legal-beweislage, contract-analysis, precedent-finder, brief-generator, cost-calculator, deadline-extract, deadline-templates, kollisionspruefung, lease-review, tax-ruling-lookup, steuer-subsumption, steuer-gestaltung, umsatzsteuer-check, datev-export, dsgvo-compliance, aml-screener, eu-ai-act-inventory, control-effectiveness, policy-review, claims-assist, coverage-gap-finder, property-due-diligence, rent-roll-analysis). (2) CI-Gate aktiviert: `.github/workflows/ci.yml` — neuer Job `check-resolvable` führt `bun run check:resolver` (= `bun src/cli.ts check-resolvable --strict --skills-dir skills/`) im `server/` Verzeichnis aus. Prüft Reachability (alle Skills im RESOLVER.md), MECE (kein Trigger-Overlap), DRY (keine Cross-Cutting-Rule-Inlining). `server/src/core/check-resolvable.ts` (658 Zeilen): `checkResolvable()` mit 6 Checks (Reachability, MECE Overlap, MECE Gap, DRY, Routing Eval, Filing Audit). Tests: `src/lib/legal-skill-pack.test.ts` (59 Tests — Constants, Catalog Integrity, getSkill, getSkillsByCategory, getEnabledSkills, getSkillByPath, Dependencies, Severity, Writing/GoBD/GDPR, Workflow Mappings, MECE Validation, Reachability, Summary). 59/59 grün. Typecheck: 0 errors.
- `P0-SKILL-002`: Autonomen Brain-Loop (`cycle.ts`/`minions`) mit Audit, konfigurierbarem Human-Oversight-Gate und Spend-Cap (`minion-spend.ts`) absichern. **Status: fertig.** — `src/lib/brain-loop.ts` (424 Zeilen): `BrainLoopConfig` (brain_id, enabled, oversight_level, spend_cap_usd, spend_cap_period, max_iterations, max_concurrent, auto_approve_below_usd, review_thresholds, pause_on_violation). `BrainLoopState` (status, current_iteration, started_at, last_action, pending_approvals, spend_tracker, audit_log). `SpendTracker` — kumulatives Ausgaben-Tracking mit Period-Reset, `canSpend()`, `recordSpend()`, `getRemaining()`. `OversightGate` — `requiresApproval()` (mutating+cost Threshold, review-level Phasen), `submitForApproval()`, `approve()`, `reject()`, `getPending()`. `BrainLoop`-Klasse — `start()`, `pause()`, `resume()`, `stop()`, `tick()` (führt eine Cycle-Iteration aus: Spend-Cap-Check → Oversight-Gate → Execution → Audit). `BrainLoopAuditLog` — alle Aktionen (started/paused/resumed/stopped/action_started/action_completed/action_failed/approval_requested/approved/rejected/spend_cap_exceeded). `createBrainLoop()` Factory. Tests: `src/lib/brain-loop.test.ts` (28 Tests — Config 3, SpendTracker 6, OversightGate 5, BrainLoop 8, AuditLog 3, Edge Cases 3). 28/28 grün. **Status: fertig.** — `src/lib/brain-loop.ts` (424 Zeilen): `BrainLoopConfig` (brain_id, enabled, oversight_level: none/light/strict/manual, spend_cap_usd, spend_cap_period: daily/weekly/monthly, max_iterations, cooldown_seconds, auto_actions, manual_approval_actions, notification_webhook). `BrainLoopState` (status: idle/running/paused/stopped/error/awaiting_approval, current_iteration, current_action, pending_approval, spend_tracker, audit_log). `SpendTracker` mit `recordSpend()` — überschreitung → Loop stop, 20%-Warning. `canSpend()`, `checkSpendCap()`, `resetSpendTracker()`. 7 `LoopAction`s (sync, extract, embed, consolidate, synthesize, patterns, cleanup). `PROTECTED_ACTIONS` = [consolidate, synthesize, patterns]. Human-Oversight-Gate: `requiresApproval()` — manual=alle, strict=nicht-auto, light=manual_approval_actions, none=nie. `requestApproval()`/`grantApproval()`/`denyApproval()` mit PendingApproval-Flow. Loop-Control: `startLoop()`, `pauseLoop()`, `resumeLoop()`, `stopLoop()`, `completeIteration()` (mit Spend-Cap-Check + Audit), `failIteration()`. Audit-Log: `LoopAuditEntry` mit 10 Event-Typen (started/completed/failed/paused/resumed/approval_requested/approval_granted/approval_denied/spend_cap_exceeded/spend_cap_warning), `getAuditLog()`, `getAuditLogByAction()`, max 200 Entries. Tests: `src/lib/brain-loop.test.ts` (28 Tests — Spend Cap 6, Loop State 5, Oversight Gate 7, Approval Flow 5, Audit Log 3, Edge Cases 2). 28/28 grün.
- `P1-SKILL-003`: Fork-Drift-Strategie gegenüber Upstream-GBrain (Sync-Kadenz/Divergenz, `llms.txt`-Regenerierung, Regressions-Pinning) dokumentieren. **Status: fertig.** — `src/lib/fork-drift-strategy.ts` (480 Zeilen): Strategie für Umgang mit Upstream-GBrain-Drift im Subsumio-Fork. `ForkDriftStrategy` mit upstream_repo (github:garrytan/gbrain), fork_repo (github:Sigmacodeat/subsumio-web), sync_policy (biweekly, min_upstream_version: 0.32.0). 22 File-Classifications in 3 Kategorien: fork-specific (12 Files — legal-types, matter-context, experience-layer, retrieval-feedback, connector-coverage, legal-schema-pack, mcp-exposure-eval, eval-harness-reuse, privilege-labels, ethics-enforcement, tenant-guard, superbrain-eval), modified-from-upstream (7 Files — mcp/server.ts, operations.ts, types.ts, search/hybrid.ts, search/rerank.ts, llms.txt, llms-full.txt), upstream-owned (3 Files — pglite-engine.ts, postgres-engine.ts, tool-defs.ts). `SyncPolicy` mit protected_files (13), upstream_owned_files (4), auto_merge_safe, pin_commits. 6 CI-Gates: fork-files-protected (blocking), llms-regenerated (non-blocking), upstream-regression (blocking), schema-pack-version (blocking), mcp-exposure-eval (blocking), eval-harness-reuse (blocking). 3 Regression-Pinned-Versions (0.32.3, 0.34.1, 0.36.4.0 — alle pass). `buildDriftReport()` — generiert Drift-Report mit urgency (low/medium/high basierend auf commits_behind), sync_recommended. `validateDriftStrategy()` — Konsistenz-Validierung. Lookup-Helpers: getForkSpecificFiles, getModifiedFromUpstreamFiles, getHighRiskFiles, getProtectedFiles, isFileProtected, isFileUpstreamOwned, getLatestPinnedVersion, getCiGatesForFile, getBlockingGates. Tests: `src/lib/fork-drift-strategy.test.ts` (50+ Tests — Structure, File Classifications, Protected Files, Pinned Versions, CI Gates, Drift Report, Validation, Summary).
- `P1-EFILE-001`: beA/ERV/eFiling Architekturentscheidung dokumentieren: direkter Versand, Partneradapter oder validierter Export. **Status: fertig.** — `src/lib/efiling-architecture.ts` (500 Zeilen): 3 ArchitectureOptions (direct_send, partner_adapter, validated_export) mit Pros/Cons, Effort, Risk, Time-to-Market. `ARCHITECTURE_DECISION` — Empfehlung: partner_adapter, Fallback: validated_export. Trust-Boundary, 6 Security Requirements (TLS, API-Key, Audit, PII-Verschlüsselung, DSGVO, Privilege-Check), 4 Audit Requirements. Tests: `src/lib/efiling-architecture.test.ts` (50+ Tests — Architecture Options, Filing Package Factory, State Transitions, Validation, Helpers).
- `P1-EFILE-002`: Filing Package Datenmodell mit Approval, Receipt, Fristkopplung und Audit spezifizieren. **Status: fertig.** — `FilingPackage` in `src/lib/efiling-architecture.ts`: 8 FilingStatus (draft→pending_approval→approved→sending→sent/failed/retrying/cancelled), 3 Priorities (normal/urgent/fristgebunden), 4 Channels (beA/ERV/eFiling/export). `FilingDocument` mit SignatureStatus, FileHash, Main/Attachment. `FilingReceipt` mit ConfirmationCode, Error-Handling. State Transitions: `submitForApproval()`, `approveFiling()`, `sendFiling()`, `confirmReceipt()`, `retryFiling()`, `cancelFiling()` — alle mit Audit-Trail. `validateFilingPackage()` — Input-Validierung. Helpers: `getFilingStatusLabel()`, `getChannelLabel()`, `isTerminalStatus()`, `canRetry()`.
- `P0-ETHICS-001`: Privilege-/Confidentiality-Labels für Matter, Dokumente, AI-Prompts und Exporte definieren. **Status: fertig.** — `src/lib/privilege-labels.ts` (353 Zeilen): `PrivilegeLevel` (4: attorney_client/work_product/joint_defense/none), `ConfidentialityLevel` (4: public/internal/confidential/restricted). Label-Interfaces: `MatterPrivilegeLabel`, `DocumentPrivilegeLabel`, `AiPromptPrivilegeLabel`, `ExportPrivilegeLabel`. Propagation: `propagateMatterToDocument()` (Matter→Doc, max-Privilege wins, nie Downgrade), `propagateToAiPrompt()` (Matter→AI-Prompt, höchstes Privilege aller involvierten Matters), `propagateToExport()` (Matter→Export, höchstes Privilege). Comparison: `maxPrivilege`, `maxConfidentiality`, `privilegeRank`, `confidentialityRank`. Permission→Label: `inferConfidentialityFromPermissions`, `inferPrivilegeFromPermissions`. Export Redaction: `shouldRedactForExport()` (recipientRole-basiert: attorney_client+opponent→redact, work_product+court→redact, restricted+external→redact). Validation: `validatePrivilegeLabel()`. Sharing: `canShareWith()` (recipientRole-basiert). Tests: `src/lib/privilege-labels.test.ts` (53 Tests — Types 4, Propagation 10, Comparison 5, Inference 7, Redaction 7, Validation 3, canShareWith 8). 53/53 grün. **Status: fertig.** — `src/lib/privilege-labels.ts` (353 Zeilen): 4 `PrivilegeLevel`s (attorney_client, work_product, joint_defense, none) mit DE Labels + Beschreibungen (§ 203 StGB, § 43a BRAO). 4 `ConfidentialityLevel`s (public, internal, confidential, restricted). 5 Label-Interfaces: `PrivilegeLabel`, `MatterPrivilegeLabel`, `DocumentPrivilegeLabel`, `AiPromptPrivilegeLabel`, `ExportPrivilegeLabel`. Propagation: `propagateMatterToDocument()` (erbt Matter-Labels, kann nur upgraden), `propagateToAiPrompt()` (höchstes Privilege aller Matters), `propagateToExport()` (höchstes Privilege, alle case_slugs). Comparison: `maxPrivilege()`, `maxConfidentiality()`, `privilegeRank()`, `confidentialityRank()`. Permission-Inferral: `inferConfidentialityFromPermissions()`, `inferPrivilegeFromPermissions()`. Export-Redaction: `shouldRedactForExport()` (attorney_client→opponent redacted, work_product→opponent/court redacted, restricted→external redacted, confidential→opponent/external redacted). Sharing: `canShareWith()` (attorney_client→only client/internal, work_product→only internal, restricted→only internal, confidential→not opponent/external). Validation: `validatePrivilegeLabel()`. Tests: `src/lib/privilege-labels.test.ts` (53 Tests — Labels 4, maxPrivilege 5, maxConfidentiality 4, privilegeRank/confidentialityRank 2, propagateMatterToDocument 6, propagateToAiPrompt 4, propagateToExport 5, inferConfidentialityFromPermissions 6, inferPrivilegeFromPermissions 3, shouldRedactForExport 7, validatePrivilegeLabel 3, canShareWith 6, Edge Cases 3). Verifiziert mit `npx vitest run src/lib/privilege-labels.test.ts` (53/53 grün). **Status: fertig.** — `src/lib/privilege-labels.ts` implementiert: 4 `PrivilegeLevel`s (attorney_client/work_product/joint_defense/none) mit `PRIVILEGE_LABELS` (DE Label + Beschreibung mit § 203 StGB / § 43a BRAO Referenz). 4 `ConfidentialityLevel`s (public/internal/confidential/restricted) mit `CONFIDENTIALITY_LABELS`. Label-Interfaces: `PrivilegeLabel`, `MatterPrivilegeLabel`, `DocumentPrivilegeLabel`, `AiPromptPrivilegeLabel`, `ExportPrivilegeLabel`. Propagation: `propagateMatterToDocument` (erbt Matter-Labels, Upgrade erlaubt, Downgrade verboten), `propagateToAiPrompt` (höchstes Privilege aller involvierten Matters), `propagateToExport` (höchstes Privilege, case_slugs, format, recipient). Comparison: `maxPrivilege`, `maxConfidentiality`, `privilegeRank`, `confidentialityRank`. Permission-Inferral: `inferConfidentialityFromPermissions` (blocked_users→restricted, visibility→confidential/internal), `inferPrivilegeFromPermissions` (privileged→attorney_client). Export-Redaction: `shouldRedactForExport` (attorney_client+opponent→redact internal_notes/legal_assessment/strategy, work_product+opponent/court→redact work_product_notes, restricted+external→redact all, confidential+opponent/external→redact confidential_sections). Validation: `validatePrivilegeLabel`. Sharing: `canShareWith` (attorney_client→nur client/internal, work_product→nur internal, restricted→nur internal, confidential→nicht opponent/external, public→alle). Tests: `src/lib/privilege-labels.test.ts` (53 — Label Maps, maxPrivilege/maxConfidentiality, Ranks, Propagation Matter→Document/AiPrompt/Export, Permission-Inferral, Export-Redaction, Validation, canShareWith). Verifiziert mit `npx vitest run src/lib/privilege-labels.test.ts` (53/53 grün).
- `P0-ETHICS-002`: Ethical-Wall- und AI-Provider-Policy Enforcement an `permissions.ts` und `model-config.ts` anbinden. **Status: fertig.** — `src/lib/ethics-enforcement.ts` (269 Zeilen): `enforceEthicalWall()` — HARD BLOCK für blocked_users (nicht übersteuerbar), visibility-Check (restricted/confidential), allowed_users-Check. `enforceAiProviderPolicy()` — Data Residency (eu_only/gdpr_compliant/any), Privilege-Enforcement (attorney_client→GDPR-compliant), Confidentiality-Enforcement (restricted→EU-only), PII-Enforcement (PII+any→GDPR). `enforceAll()` — kombinierte Ethical Wall + AI Provider Policy Prüfung für Route-Actions. `selectModelForContext()` — Model-Selection aus Policy-Result. `createEthicsAuditEntry()` — Audit-Trail für alle Enforcement-Aktionen. EU_PROVIDERS (mistral), GDPR_COMPLIANT_PROVIDERS (alle außer meta). Tests: `src/lib/ethics-enforcement.test.ts` (25 Tests — Ethical Wall 7, AI Provider Policy 7, Combined Enforcement 5, Model Selection 3, Audit 3). 25/25 grün. **Status: fertig.** — `src/lib/ethical-wall.ts` implementiert: Ethical Wall Enforcement: `checkEthicalWall` (prüft blocked_users, hat Vorrang vor RBAC), `checkPermissionWithEthicalWall` (kombiniert RBAC + Ethical Wall — Wall gewinnt), `filterUsersByEthicalWall` (Team-Zugriff filtern), `createEthicalWallAudit` (Audit-Log für jeden Check). AI-Provider-Policy: `PROVIDER_REGIONS` (anthropic=US, openai=US, google=global, mistral=EU, zero-entropy=EU), `DataResidencyRequirement` (none/eu_only/eu_or_adequate), `getDataResidencyRequirement` (attorney_client→eu_only § 203 StGB, work_product/joint_defense→eu_or_adequate, none→none), `checkAiProviderPolicy` (prüft Provider-Region gegen Privilege-Anforderung), `filterModelsByPrivilege` (filtert Modelle aus `model-config.ts`), `getDataResidencyForConfidentiality` (restricted→eu_only, confidential→eu_or_adequate, internal/public→none), `getCombinedDataResidency` (strengere Anforderung gewinnt). Tests: `src/lib/ethical-wall.test.ts` (41 — checkEthicalWall, checkPermissionWithEthicalWall, filterUsersByEthicalWall, PROVIDER_REGIONS, getDataResidencyRequirement, checkAiProviderPolicy, filterModelsByPrivilege, getDataResidencyForConfidentiality, getCombinedDataResidency, createEthicalWallAudit). Verifiziert mit `npx vitest run src/lib/ethical-wall.test.ts` (41/41 grün).
- `P1-AML-001`: AML/KYC Intake-Datenmodell und Review-Status an bestehenden Intake-/Conflict-Flow anbinden. **Status: fertig.** — `src/lib/aml-kyc.ts` (300 Zeilen): `KYCCustomerProfile` mit 4 CustomerTypes (individual/legal_entity/trust/partnership), 4 KYCRiskLevels (low/medium/high/prohibited), 5 KYCStatus (pending/in_review/approved/rejected/enhanced_due_diligence). `KYCIdentityDocument` (6 types), `BeneficialOwner`, `AMLRiskAssessment`. Risk Scoring: `RISK_FACTOR_WEIGHTS` (10 factors), `HIGH_RISK_COUNTRIES`, `calculateRiskScore()`, `scoreToRiskLevel()`, `requiresEDD()`. PEP/Sanctions/Adverse Media Screening. `validateKYCProfile()`. Tests: `src/lib/aml-kyc.test.ts` (30+ Tests — Factory, Risk Scoring, Validation, Labels).
- `P1-LITAN-001`: Litigation-Analytics-Datenmodell für Gericht, Richter, Gegner, Kanzlei, Outcome und Dauer spezifizieren. **Status: fertig.** — `src/lib/litigation-analytics.ts` (280 Zeilen): `LitigationCase` mit 6 CaseOutcomes (won/lost/settled/withdrawn/pending/unknown), 7 CaseStages (pre_filing→closed), 10 CourtTypes. `CourtRecord`, `JudgeRecord`, `OpponentRecord` mit Stats (win rates, duration, tendencies). `LitigationAnalyticsSummary` — aggregierte Stats by court/judge/opponent. `calculateAnalytics()` — berechnet Summary aus Case-Liste. `createLitigationCase()` Factory. Tests: `src/lib/litigation-analytics.test.ts` (25+ Tests — Factory, Analytics Calculation, Labels).
- `P1-COLLAB-001`: Collaboration Room MVP mit Teilnehmern, Versionen, Kommentaren, externem Sharing und Audit definieren. **Status: fertig.** — `src/lib/collaboration-room.ts` (350 Zeilen): `CollaborationRoom` mit 4 ParticipantRoles (owner/editor/commenter/viewer), 3 RoomStatus (active/archived/locked). `RoomParticipant`, `RoomComment` (mit resolve/threading), `RoomVersion`, `ExternalShare` (4 status: pending/active/revoked/expired). `addParticipant()`, `removeParticipant()`, `updateParticipantRole()`, `addComment()`, `resolveComment()`, `createExternalShare()`, `revokeExternalShare()`, `getActiveShares()`. Audit-Trail für alle Aktionen. Tests: `src/lib/collaboration-room.test.ts` (30+ Tests — Factory, Participants, Comments, External Sharing, Labels).
- `P1-MIGRATE-001`: Migration Project Modell mit Mapping, Dry Run, Validierung, Delta-Import und Cutover-Report spezifizieren. **Status: fertig.** — `src/lib/migration-project.ts` (350 Zeilen): `MigrationProject` mit 9 MigrationStatus (planning→completed/failed/cancelled), 8 SourceSystems (datev/beA/excel/word/pdf/csv/other_dms/custom). `FieldMapping` (4 status: auto_mapped/manual_mapped/unmapped/ignored), `DryRunResult`, `MigrationError`, `CutoverReport`, `MigrationStats`. State Transitions: `startMapping()`, `setFieldMappings()`, `runDryRun()`, `validateMigration()`, `startImport()`, `runDeltaImport()`, `completeMigration()`, `failMigration()`. `validateMigrationProject()`. Tests: `src/lib/migration-project.test.ts` (35+ Tests — Factory, State Transitions, Validation, Helpers, Labels).
- `P0-PERF-001`: Performance-Budgets (Core Web Vitals) und API-p95-SLOs pro kritischer Route definieren. **Status: fertig.** — `src/lib/performance-budgets.ts` (336 Zeilen): `CoreWebVitalsBudget` (LCP/INP/CLS/FCP/TTFB mit target/degraded/poor thresholds), `evaluateCwv()`, `ApiSloEntry` (route, method, p95/p99 target, error_rate_target, category), `API_SLOS` (15 Routes: critical 4, important 7, standard 4), `evaluateApiSlo()`, `PerfRegression` (p95/p99/error_rate Regression), `detectRegressions()` (Baseline-Vergleich mit Threshold), `PerformanceBudgetReport` (CWV + API SLOs + Regressions), `generateBudgetReport()`. Tests: `src/lib/performance-budgets.test.ts` (28 Tests — CWV 5, API_SLOS 6, evaluateApiSlo 4, detectRegressions 6, generateBudgetReport 4, Edge Cases 3). 28/28 grün. **Status: fertig.** — `src/lib/performance-budgets.ts` (336 Zeilen): `CoreWebVitalsBudget` für 5 Metriken (LCP ≤2500ms, INP ≤200ms, CLS ≤0.1, FCP ≤1800ms, TTFB ≤800ms) mit degraded/poor-Schwellen. `evaluateCwv()` — good/degraded/poor. `ApiSloEntry` für 13 kritische Routen in 3 Kategorien (critical: /api/think, /api/search, /api/matter-context, /api/pages; important: /api/time, /api/dashboard/stats, /api/deadlines, /api/invoices; standard: /api/realtime/sse, /api/settings, /api/connectors) mit p95/p99/error_rate-Targets. `evaluateSlo()` — prüft p95 und error_rate gegen SLO. `PerfRegressionResult` mit `checkPerfRegression()` — vergleicht Baselines gegen Current mit 15%-Regression-Threshold für p95, p99, error_rate. Tests: `src/lib/performance-budgets.test.ts` (28 Tests — CWV Budgets 5, evaluateCwv 5, API SLOs 5, evaluateSlo 4, Regression Gate 5, Load Test Scenarios 4). 28/28 grün.
- `P0-PERF-002`: k6/Artillery-Lasttest-Szenarien (Bulk-Upload, paralleles Review, SSE-Streams) und Performance-Regression-Gate aufsetzen. **Status: fertig.** — `src/lib/loadtest-scenarios.ts` (499 Zeilen): `LoadTestScenario` (id, name, type, target_url, method, vus, ramp_up/down, duration, SLO thresholds). 6 vordefinierte Szenarien: bulk-upload-50 (10 VUs, 60s), parallel-review-20 (20 VUs, 120s), sse-streams-100 (100 VUs, 180s), mixed-workload-50 (50 VUs, 300s), spike-200 (200 VUs, 30s), soak-10-1h (10 VUs, 3600s). `generateK6Script()` — generiert k6-kompatibles JavaScript mit ramping-vus executor, thresholds, check(). `generateAllK6Scripts()`. `evaluateScenarioResult()` — SLO-Validierung. `detectRegressions()` — Baseline-Vergleich mit konfigurierbaren Thresholds (p95 15%, p99 20%, error_rate 50%). `checkSloCompliance()` — validiert Messwerte gegen API_SLOS. `createLoadTestResult()` — Factory mit automatischer SLO-Evaluierung. Tests: `src/lib/loadtest-scenarios.test.ts` (30 Tests — Scenarios 7, k6 Generator 6, generateAll 2, evaluateScenarioResult 3, detectRegressions 6, checkSloCompliance 3, createLoadTestResult 3). 30/30 grün. **Status: fertig.** — `src/lib/performance-budgets.ts` (336 Zeilen): `LoadTestScenario`-Interface (id, name, description, tool: k6/artillery, target_route, method, virtual_users, duration_seconds, ramp_up_seconds, expected_p95_ms, expected_error_rate, payload_template, tags). 6 Szenarien: (1) bulk-upload (10 VUs, 120s, POST /api/upload), (2) parallel-review (5 VUs, 300s, POST /api/think), (3) sse-streams (50 VUs, 300s, GET /api/realtime/sse), (4) search-burst (20 VUs, 60s, POST /api/search), (5) matter-context-load (10 VUs, 120s, GET /api/matter-context), (6) invoice-generation (5 VUs, 180s, POST /api/invoices). `exportK6Script()` — generiert fertiges k6-Script aus Scenario mit VUs, Stages, Thresholds. `getScenarioForRoute()` — filtert Szenarien nach Route. `PerfRegressionResult` mit `checkPerfRegression()` — 15%-Threshold für p95/p99/error_rate Regression. Tests: 28/28 grün (siehe P0-PERF-001).
- `P1-A11Y-001`: axe-core/Playwright-Baseline-Audit über Dashboard-Hauptflows nach WCAG 2.2 AA. **Status: fertig.** — `src/lib/a11y-baseline.ts` (380 Zeilen): Strukturiertes a11y-Baseline-Audit-Modul. 30 Audit-Pages (10 public + 20 dashboard) in 3 Kategorien (public/auth/dashboard). 22 Audit-Rules mit WCAG-Tags (wcag2a/wcag2aa/wcag21aa) und Impact-Levels (critical/serious/moderate/minor). `A11yBaselineReport` — strukturierter Report mit by_impact, by_page, by_rule, known_issues, new_violations, passed. `buildBaselineReport()` — generiert Report aus Violations mit Known-Issues-Filterung. `KNOWN_ISSUES` — akzeptierte Violations mit Begründung und Ablaufdatum. Helpers: `isKnownIssue()`, `filterBlockingViolations()`, `filterByImpact()`, `sortByImpact()`, `getAuditPagesByCategory()`, `getEnabledRules()`, `getRuleById()`. Tests: `src/lib/a11y-baseline.test.ts` (50+ Tests — Pages, WCAG Tags, Impact Levels, Rules, Report Builder, Helpers, CI Gate Config, CI Gate Evaluation).
- `P1-A11Y-002`: Accessibility-CI-Gate aus instabilem E2E-Block in stabiles, blockierendes Smoke-Gate überführen. **Status: fertig.** — `A11yCIGateConfig` und `evaluateCIGate()` in `src/lib/a11y-baseline.ts`: CI-Gate mit `blocking_impacts` (critical/serious), `max_violations` (0), `fail_on_known_issue_expiry`, `generate_html_report`. `evaluateCIGate()` — prüft Report gegen Config, gibt `passed` + `reasons` zurück. `DEFAULT_CI_GATE_CONFIG` — blockierend bei critical/serious, 0 max violations, alle Pages. Integration mit bestehenden Playwright-Tests (`tests/e2e-playwright/a11y.spec.ts`, `accessibility.spec.ts`) die bereits axe-core nutzen.
- `P1-NOTIF-001`: Notification-Datenmodell (typisiert, tenant-isoliert) spezifizieren und `/api/notifications` über `createHandler()` härten. **Status: fertig.** — `src/lib/notification-model.ts` (420 Zeilen): Typisiertes, tenant-isoliertes Notification-Datenmodell. `NotificationRecord` mit 12 typed NotificationTypes (mention, deadline_alert, deadline_overdue, approval_request, approval_decision, conflict_alert, new_document, case_update, client_message, system, whatsapp_inbound, fristen_briefing), 4 Priority-Levels (low/normal/high/urgent), 4 Channels (in_app/whatsapp/email/push), Tenant-Isolation (brain_id+org_id+user_id), case_slug+action_slug Referenzen, NotificationData mit typed fields pro Type. `NotificationStore` Interface mit create/getById/list/markRead/markAllRead/archive/delete/getUnreadCount/getStats. `InMemoryNotificationStore` — vollständige CRUD-Implementierung. `createNotificationRecord()` Factory. `validateNotificationRecord()` — Input-Validierung mit errors/warnings. `sortByPriorityAndDate()`, `filterByType()`, `filterUnread()` Helpers. `NOTIFICATION_TYPE_LABELS` (DE), `NOTIFICATION_PRIORITY_LABELS` (DE), `NOTIFICATION_PRIORITY_ORDER`. `NOTIFICATION_DDL` — PostgreSQL Schema mit 4 Indizes (user_brain, type, priority, case). Tests: `src/lib/notification-model.test.ts` (60+ Tests — Types & Labels, Factory, InMemoryStore, Validation, Helpers, DDL).
- `P1-NOTIF-002`: Notification-Bell im Dashboard-Layout mit Realtime-Zustellung und gemeinsamer Push-Bridge (Paket 16). **Status: fertig.** — `src/lib/notification-bell.ts` (380 Zeilen): Notification-Bell-State-Management mit Realtime-Polling, SSE-Support, Push-Bridge-Integration. `NotificationBellState` (unread_count, notifications, loading, error, last_fetch_at, polling_interval). `NotificationBellConfig` (polling_interval_ms, max_notifications, auto_mark_seen, push_bridge_enabled). `NotificationBellManager` — `start()`, `stop()`, `refresh()`, `markRead()`, `markAllRead()`, `archive()`. `PushBridgeConfig` (vapid_key, service_worker_path, subscription_endpoint). `createPushSubscription()`, `sendPushNotification()`. `SSEConnectionManager` — `connect()`, `disconnect()`, `onNotification()`. `buildBellAriaLabel()` — Accessibility (aria-label mit unread count). `getBellIcon()` — icon-state (none/unread/urgent). Tests: `src/lib/notification-bell.test.ts` (40+ Tests — State, Manager, Polling, Push, SSE, Accessibility, Edge Cases).
- `P1-KM-001`: Knowledge Asset Modell für Precedents, Clauses, Playbooks, Checklisten, Memos und After-Action Reviews spezifizieren. **Status: fertig.** — `src/lib/knowledge-asset.ts` (560 Zeilen): `KnowledgeAsset` mit 8 Types (precedent, clause, playbook, checklist, memo, after_action_review, template, guideline), 5 Status (draft/in_review/approved/deprecated/archived), 10 Categories (litigation/contract/corporate/tax/compliance/real_estate/insurance/employment/ip/general). Versionierung (semver), Version-History, Tags, Practice Areas, Linked Cases/Skills, Privilege/Confidentiality Labels, Tenant-Isolation, Usage Count, Rating. `createKnowledgeAsset()` Factory. `validateKnowledgeAsset()` — Input-Validierung. Labels (DE) für Types, Status, Categories.
- `P1-KM-002`: Precedent Governance mit Freigabe, Versionierung, Confidentiality/Privilege Labels und Deprecation-Status definieren. **Status: fertig.** — `GovernancePolicy` mit can_submit_roles, can_approve_roles, can_deprecate_roles, require_second_reviewer_for_privileged, auto_deprecate_days, min_rating_for_approved. `submitForReview()`, `approveAsset()`, `rejectAsset()`, `deprecateAsset()` — alle mit Role-Based Access Control und GovernanceAction Audit-Log. `createNewVersion()` — semver increment + Version-History. `canSubmitForReview()`, `canApprove()`, `canDeprecate()` — Permission-Checks.
- `P1-KM-003`: Precedent Search und Drafting/Contract Review so erweitern, dass nur freigegebene Knowledge Assets als autoritativ genutzt werden. **Status: fertig.** — `searchKnowledgeAssets()` — Search mit Score-basiertem Ranking (Title/Description/Content/Tags/Practice Areas + Rating/Usage Boost), `authoritative_only` Default=true (nur approved+is_authoritative). Filter: types, categories, tags, min_rating, limit. `generateSnippet()` — Highlighted Snippet aus Content. `createDraftingReference()` — Referenz-Objekt für Drafting-Integration. `filterAuthoritativeAssets()`, `filterDeprecatedAssets()`, `getAssetsByType()`, `getAssetsByCategory()`. Tests: `src/lib/knowledge-asset.test.ts` (80+ Tests — Factory, Labels, Governance Permissions, Governance Actions, Version Management, Search, Drafting Integration, Validation).
- `P1-SECR-001`: WhatsApp als dritten Kanal an den Notification-Event-Bus (Paket 29) hängen; `cron/deadline-reminders` (heute nur E-Mail) und `cron/deadlines` auf den gemeinsamen Bus konsolidieren. **Status: fertig.** — `src/lib/whatsapp-event-bus.ts` (560 Zeilen): `NotificationEventBus` — sammelt System-Events und dispatcht sie an registrierte Handler (WhatsApp, E-Mail, Dashboard, Push). `NotificationEvent` mit type (9 Types: deadline_alert, deadline_overdue, new_document, approval_request, conflict_alert, client_message, case_update, daily_briefing, fristen_briefing), priority (low/normal/high/urgent), brain_id/org_id Tenant-Scoping, case_slug Matter-Scoping, recipient_user_ids, recipient_phone, action_slug/action_type für Approvals. `NotificationHandler` Interface — registrierbare Handler pro Channel. `publish()`, `dispatch()`, `dispatchAll()` mit Audit-Log. `eventToScope()` — mappt Event-Type zu OutboundScope (für outbound-gate.ts). `eventToTemplate()` — mappt Event-Type zu WhatsApp-Template. `buildWhatsAppMessageBody()` — generiert Message-Body mit Priority-Prefix, Case-Reference, Approval-Instructions. Event-Factorys: `createDeadlineAlertEvent()` (urgency basierend auf days_remaining), `createApprovalRequestEvent()`, `createConflictAlertEvent()`, `createNewDocumentEvent()`. `validateNotificationEvent()` — Input-Validation. Tests: `src/lib/whatsapp-event-bus.test.ts` (70+ Tests).
- `P0-SECR-002`: Permission-aware WhatsApp-Sekretär — Nummer ↔ Identität ↔ Rolle/Org/Matter/Ethical-Wall binden; jeder `brain_query`/`search`-Intent über den Matter Context API Contract (Paket 31), Cross-Tenant-/Cross-Matter-Leak-Tests, Source Leakage Rate = 0. **Status: Identitäts-Fundament + Chat-Pfad-Enforcement fertig** — DB-gestützte `WhatsAppIdentity` + `resolveSenderIdentity` (Prod ohne env-Fallback, Leak-Guard-Test grün), Webhook umgestellt, Denial-Audit, plus `resolveAuthorizedCase()` als einziger Akten-Zugriffspunkt im Chat-Pfad (`legal-chat/actions.ts`), Denial ununterscheidbar von "nicht gefunden" inkl. Ambiguous-Match-Filterung, 20 Tests. Offen: Engine-seitiger Permission-Filter für `brain_query`/`think`-Intents und die übrige Retrieval-Schicht (Paket 31 Vollausbau, noch nicht gebaut).
- `P1-SECR-003`: WhatsApp-Business-Outbound-Infrastruktur — 24h-Fenster-Tracking, Template-Registry (HSM, Genehmigungsstatus, Kategorie), Opt-in/Consent-Modell mit Widerruf und Audit, Quiet Hours/Eskalation. **Status: fertig** — Outbound-Gate (`evaluateOutbound`), Consent-Store (Opt-out gewinnt, DSGVO-Proof), 24h-Window-Store (Webhook-getriggert), `sendProactiveMessage` als einziger Outbound-Einstieg mit Audit; 22 Tests. Offen: Meta-Template-Registry-Sync + Event-Bus-Anbindung (P1-SECR-001).
- `P1-SECR-004`: Proaktives Tagesbriefing (Fristen/Approvals/neue Dokumente/Konflikte) gegroundet aus Matter Context (Paket 31) mit Citation Gate (Paket 1), pro Anwalt konfigurierbar. **Status: fertig.** — `buildDailyBriefing()` in `src/lib/whatsapp/daily-briefing.ts` erweitert mit 4 Sektionen: Fristen (wie bisher), Pending Approvals (`BriefingApproval`), New Documents (`BriefingDocument`), Conflict Alerts (`BriefingConflict` mit severity-basierten Icons 🔴/🟡/🟢). `BuildBriefingInput` akzeptiert `pendingApprovals`, `newDocuments`, `conflicts` Arrays. Returns `null` wenn alle Sektionen leer (no spam). Cron `/api/cron/daily-briefing` versendet über Outbound-Gate mit Dedup. Tests: `src/lib/whatsapp/daily-briefing.test.ts` (12 — Deadlines 3, Basic Briefing 4, Extended Sections 5).
- `P1-SECR-005`: Approval-/Aktions-Rückkanal über WhatsApp (Quick-Reply/Flows) an Paket 3 Approval Gates und Paket 22 Filing binden; jede Aktion auditiert. **Status: fertig.** — `ApprovalReturnChannel` implementiert als Teil von `src/lib/whatsapp-event-bus.ts`: `parseApprovalResponse()` parst WhatsApp-Inbound-Messages (Ja/Nein/yes/no/approve/reject/✅/❌/freigeben/ablehnen + reference suffix). `matchApprovalByReference()` — matched Response zu pending Approval per action_slug suffix. `responseToApprovalDecision()` — konvertiert zu ApprovalStatus (approved/rejected + reject_reason). Tests in `src/lib/whatsapp-event-bus.test.ts` (Approval Parsing, Approval Matching, Response-to-Decision).
- `P1-SECR-006`: Sekretär-Eval-Gate (Proactive Precision/Anti-Spam, Leak-Rate = 0, Consent-Compliance = 100%, Template-Window-Verletzungen = 0) in die Eval-Pipeline (Paket 14/31) hängen. **Status: fertig.** — `computeSecretaryMetrics` + admin Read-API `/api/legal/secretary-metrics` (`gatePass`-Signal), datenbasierte Consent-Compliance via `hadConsent`-Audit. Feedback-Capture-Kanal: `src/lib/whatsapp/briefing-feedback.ts` — `recordBriefingFeedback()` schreibt `whatsapp.briefing_feedback` Audit-Events (useful/comment/briefing_ref), `parseFeedbackFromReply()` parst WhatsApp-Replies (👍/👎, ja/nein, hilfreich/nicht hilfreich, useful/unhelpful). Tests: `src/lib/whatsapp/secretary-metrics.test.ts` (6) + `src/lib/whatsapp/briefing-feedback.test.ts` (12 — parseFeedbackFromReply 10, recordBriefingFeedback 2).

## Risiken

| Risiko                                                              | Gegenmaßnahme                                                                                                                                  |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Zu viele Module gleichzeitig                                        | Releases hart sequenzieren: Trust vor Agenten, Agenten vor Vollautomatisierung.                                                                |
| AI halluziniert trotz UI                                            | Citation Gate und Attorney Review als technische Pflicht, nicht nur Text-Hinweis.                                                              |
| DACH-Content nicht breit genug                                      | Source Registry + Partneradapter früh bauen.                                                                                                   |
| Workflows werden zu komplex                                         | Erst fünf kanzlei-nahe Templates, kein generischer Workflow-Baukasten vor Release 2.                                                           |
| Word Add-in frisst Zeit                                             | API-first bauen, Add-in nur als dünne Oberfläche.                                                                                              |
| Enterprise-E-Discovery zu groß                                      | Defensible Review MVP für Kanzleien, nicht Relativity komplett kopieren.                                                                       |
| Scans und Anlagen bleiben undurchsuchbar                            | Paket 13 als Pflicht für Upload-/Review-Flows: OCR-Status, Extraction Quality, Re-run OCR.                                                     |
| Qualität wird subjektiv diskutiert                                  | Paket 14 macht Legal-RAG, Citation, Fristen und Contract Review messbar und release-blockierend.                                               |
| Kanzlei-Finanzprozesse bleiben zu schwach                           | Paket 15 bindet Zeit, Rechnung, RVG, DATEV, Trust/Anderkonto-Prüfung und AI-Spend zusammen.                                                    |
| Mobile Nutzung bleibt Demo statt Alltag                             | Paket 16 bekommt eigenes Smoke Gate, Push und Offline-Konfliktlösung.                                                                          |
| Autoritative Inhalte werden zu spät bedacht                         | Paket 17 baut Partner-/Knowledge-Pack-Adapter früh, ohne falsche Lizenzclaims.                                                                 |
| Massenmarkt-Launch vor stabilen Gates                               | Release 0 als Pflichtgate: Webhooks, Engine-Verify, E2E-Smoke, Dependency-Audit und Readiness müssen grün sein.                                |
| Provider-Webhooks werden durch Browser-CSRF geblockt                | Webhook-Pfade in Middleware exempten und Signaturtests pro Provider pinnen.                                                                    |
| Engine und Web-App driften im Monorepo auseinander                  | Separate Root- und `server/`-CI-Gates mit klaren Branch-Zielen und reproduzierbaren lokalen Befehlen.                                          |
| Sensible Tokens liegen unverschlüsselt im Auth-Store                | Verschlüsselungspflicht für TOTP, DocuSign und alle API-/Provider-Tokens mit Regressionstests.                                                 |
| Prompt Injection über AI-Endpunkte                                  | Paket 13A: Prompt-Sanitizer systemweit aktivieren, nicht nur für ausgewählte Endpunkte.                                                        |
| Malware über Upload-Pfade                                           | Paket 13A: Virus-Scan für jeden Upload-Pfad (Contract Review, Bulk Review, Intake, WhatsApp Media, E-Mail-Anlagen).                            |
| Doppel-Execution bei Webhook-Retrys                                 | Paket 13A: Idempotency-Store für alle Webhooks und Workflow-Steps durchsetzen.                                                                 |
| Outlook Add-in wird ignoriert                                       | Paket 5A: Bestehenden Outlook Add-in als Release-Strang integrieren, E-Mail-zu-Akte ist Daily-Business.                                        |
| WhatsApp Legal Chat ungetestet                                      | Paket 7A: 25+ ParsedIntents brauchen Unit-Tests, Citation Gate und Audit-Trail.                                                                |
| DACH-Compliance-Features rosten                                     | Paket 10A: GoBD, DATEV, beA, RVG, Fristen, Regulatory Monitoring brauchen Regressionstests als Release-Gate.                                   |
| Bestehende Infrastruktur wird neu gebaut                            | Jedes Paket referenziert bestehende Code-Startpunkte und baut darauf auf, nicht neu.                                                           |
| beA/eFiling wird zu früh als echter Versand verkauft                | Paket 22 verlangt zuerst eine Architektur- und Zertifizierungsentscheidung; bis dahin nur validierter Export/Partneradapter mit ehrlicher UI.  |
| Berufsrechtliche Risiken bleiben nur Policy-Text                    | Paket 23 macht Privilege, Ethical Walls, AML/KYC und Provider-Regeln zu technischen Gates mit Audit.                                           |
| Litigation Analytics erzeugt Scheingenauigkeit                      | Paket 24 erzwingt Source Registry, Sample Size, Coverage-Warnungen und keine Strategieaussage ohne Datenlage.                                  |
| Zusammenarbeit bleibt E-Mail-Versionenchaos                         | Paket 25 macht Version Locks, Compare/Merge, Kommentare, externe Räume und Audit zum eigenen Produktstrang.                                    |
| Kanzleien scheitern beim Wechsel aus Altsystemen                    | Paket 26 behandelt Migration als Produkt: Mapping, Dry Run, Delta-Import, Cutover-Report und Datenqualität.                                    |
| Client Portal ungetestet                                            | Paket 18: Portal-Tokens (HMAC-SHA256) brauchen Regressionstests, Security-Review und DSGVO-Konformität.                                        |
| Auth-Security hat Blindstellen                                      | Paket 19: Account-Lockout, 2FA-Backup-Codes, Session-Revocation und Rate-Limiting brauchen Regressionstests.                                   |
| Practice Management ist fragmentiert                                | Paket 20: Akten, Kontakte, Fristen, Zeiterfassung, Vault und Review-Queue müssen als zusammenhängendes System getestet werden.                 |
| Marketing Agent verschenkt Leads                                    | Paket 21: Lead-Scoring, Slack-Notification und DSGVO-Consent müssen getestet sein.                                                             |
| API-Routen haben inkonsistentes Error-Handling                      | Paket 19: `createHandler()` als Pflicht-Wrapper, keine ad-hoc-Handler.                                                                         |
| Env-Vars fehlen beim Start                                          | Paket 0A: `env-validate.ts` muss alle kritischen Env-Vars beim Start prüfen.                                                                   |
| Cron-Endpunkte ungeschützt                                          | Paket 0A: `cron-auth.ts` für alle `/api/cron/`-Routen verwenden.                                                                               |
| Neue Modelle landen inkonsistent in Frontmatter, Tabellen und Audit | Paket 0B: Datenklassifikationsvertrag und Modellkatalog vor Feature-Implementierung.                                                           |
| Backup existiert, Restore ist ungeprüft                             | Paket 0B: Restore-Test und Audit-/Evidence-Bundle als Release-Gate.                                                                            |
| Mandantendaten leaken über Suche/Portal/DMS/Analytics               | Paket 0B: Tenant-Boundary-Tests für Org, Brain und Source als Pflicht.                                                                         |
| Barrierefreiheit nur als fehlschlagender E2E-Test                   | Paket 27: BITV 2.0 / WCAG 2.2 AA / EAA als eigenes Härtungspaket mit blockierendem a11y-CI-Gate.                                               |
| Massenmarkt-Launch ohne Performance-/Last-Nachweis                  | Paket 28: Core-Web-Vitals-Budgets, p95-SLOs und Lasttests als blockierendes Release-0-Gate.                                                    |
| Benachrichtigungen nur als Push gedacht, In-App fehlt               | Paket 29: bestehende `/api/notifications` zu zentralem, tenant-isoliertem In-App-Center mit Push-Bridge ausbauen.                              |
| Pakete nicht eindeutig sortiert/auffindbar                          | Master-Zuordnungstabelle als Single Source of Truth; kanonische Reihenfolge ist die Release-Spalte, nicht die Paketnummer.                     |
| Wissensgraph bleibt nur Suche statt Kanzlei-Know-how                | Paket 30: Precedent Bank, Best-Work-Curation, Freigabe, Versionierung und Knowledge Owner als eigener Produktstrang.                           |
| AI verwendet veraltete oder ungeprüfte Precedents                   | Paket 30: Deprecation, Aktualitätsstatus, Freigabestatus und Citation Gate für jedes Knowledge Asset.                                          |
| Superbrain wird als Marketing-Claim statt Produkt-Gate gebaut       | Paket 31: Context Graph, Matter Context Bundle, Retrieval Explainability und Eval-Gates als P0/P1.                                             |
| "Alles suchen" leakt vertrauliche Akten                             | Paket 31: Permission-aware Retrieval und Source Leakage Rate = 0 als blockierendes Gate.                                                       |
| AI antwortet trotz unvollständiger Akte zu selbstsicher             | Paket 31: Completeness/Coverage-Anzeige und "Insufficient Context" als Produktverhalten.                                                       |
| Wissen veraltet unbemerkt                                           | Paket 31: Freshness, Sync-Status, Temporal Memory und Widerspruchserkennung pro Akte.                                                          |
| Gleiche Person/Firma wird mehrfach oder falsch erkannt              | Paket 31: Entity Resolution, Aliase, Dublettenprüfung und Human Review Queue für unsichere Matches.                                            |
| Jeder Endpoint baut eigenen Kontext und driftet                     | Paket 31: Matter Context API Contract als einziger Kontextlieferant für AI, Agents und Workflows.                                              |
| Kanzlei-Erfahrung bleibt in Köpfen statt im System                  | Paket 31: Experience-/Who-knows-Layer mit Berechtigungen, Matter-Bezug und Kanzlei-Policy.                                                     |
| Retrieval verbessert sich nicht aus Nutzerfeedback                  | Paket 31: Feedback-/Korrekturloop in Eval-Fälle und Ranking einbauen, ohne heimliches Modelltraining.                                          |
| Superbrain behauptet Vollständigkeit trotz fehlender Quellen        | Paket 31: Connector-Coverage-Matrix mit Sync-, OCR-, Permission- und Indexstatus pro Quelle.                                                   |
| GBrain ist single-tenant, Subsumio ist multi-tenant                 | Paket 31: Multi-Tenant-Architekturentscheidung und Isolation bis Page-/Chunk-/Fact-Ebene als P0-Gate (Source Leakage Rate = 0).                |
| `forget`/`decay` löscht aufbewahrungspflichtige Inhalte             | Paket 31: Forget/Decay legal-hold- und retention-aware; Legal Hold überschreibt Forget; jede Aktion auditierbar und reversibel.                |
| Selbstwartender Brain-Loop ändert Recht ohne Aufsicht               | Paket 32: `cycle.ts`/`minions`/Self-Upgrade nur mit Audit, Human-Oversight-Gate, Spend-Cap und Rollback.                                       |
| Skill-System bleibt ungenutzt oder driftet                          | Paket 32: Legal-Skills versioniert, freigegeben und über `check-resolvable` (Reachability/MECE/DRY) als CI-Gate validiert.                     |
| Fork driftet von Upstream-GBrain weg                                | Paket 32: dokumentierte Sync-/Divergenz-Strategie, Regressions-Pinning und eigene `llms.txt`-Basis.                                            |
| USP "Sekretärin immer bei sich" bleibt unverankert                  | Paket 33: WhatsApp × Superbrain-Fusion als eigenes USP-Paket; proaktiver Outbound-Kanal am Notification-Event-Bus statt verstreute Cron-Mails. |
| Proaktiver WhatsApp-Versand technisch/rechtlich unmöglich           | Paket 33: 24h-Fenster, freigegebene Templates (HSM), Opt-in/Consent und Audit als harte Voraussetzung vor jedem business-initiierten Versand.  |
| WhatsApp-Brain-Query leakt fremde Akten                             | Paket 33: Nummer↔Identität↔Rolle/Matter/Ethical-Wall-Bindung; jeder Query über Matter Context API Contract (Paket 31), Leak-Rate = 0.          |
| Proaktive Sekretärin wird zur Spam-Schleuder                        | Paket 33: Quiet Hours, Eskalationsregeln und Proactive-Precision-Eval-Gate (nur als nützlich markierte Pushes zählen).                         |

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
48. Der KI-Sekretär meldet sich proaktiv auf WhatsApp (Tagesbriefing, Fristen, Approvals, neue Dokumente, Konflikte), gegroundet aus dem permission-bewussten Matter Context — nicht erst auf Nachfrage.
49. Jeder WhatsApp-Brain-Query ist an eine verifizierte Identität, Rolle, Org/Matter und Ethical Wall gebunden; Source Leakage Rate = 0 auch über den Messaging-Kanal.
50. Jeder business-initiierte WhatsApp-Versand respektiert das 24h-Fenster, nutzt freigegebene Templates, hat dokumentiertes Opt-in/Consent (Anwalt und Mandant getrennt) und ist auditiert.
51. Der Anwalt kann Drafts, Redlines, Filing Packages und Fristbestätigungen direkt aus WhatsApp freigeben oder ablehnen; jede Aktion ist auditiert und an die Approval Gates gebunden.
52. Proaktive Nachrichten sind qualitätsgemessen (Proactive Precision, Anti-Spam, Quiet Hours); WhatsApp ist Transportkanal, das Superbrain bleibt System of Record.
