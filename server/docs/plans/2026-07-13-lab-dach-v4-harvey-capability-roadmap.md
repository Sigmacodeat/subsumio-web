# LAB-DACH v4 — Engineering-Roadmap zur DACH-Legal-AI-Plattform

Stand: 2026-07-13

## Ziel und ehrliche Vergleichsbasis

Ziel ist nicht, eine unbekannte private Harvey-Codebasis zu kopieren. Ziel ist:

1. die öffentlich erkennbaren Capability-Klassen einer reifen Legal-AI-Plattform abzudecken,
2. bei DE/AT später CH durch bessere Quellenprovenance, Jurisdiktionstrennung und juristische Evaluation einen messbaren Vorteil aufzubauen,
3. jeden risikoreichen Output nachvollziehbar, reproduzierbar und anwaltlich freigabefähig zu machen.

Die vorhandene Codebasis enthält bereits große Teile der Produktoberfläche: hybride Suche, Agentic Retrieval, Legal Graph, Legal Pipeline, Matter Workspaces, Vault, Review Tables, Workflows, Playbooks, Word/DOCX, Redlining, DMS-Connectoren, SSO/SCIM, ACL/RLS, Audit und Human Review. Der Schwerpunkt dieser Roadmap ist deshalb **Integration, Härtung, Datenqualität und gemessene End-to-End-Qualität**, nicht das Hinzufügen weiterer isolierter Features.

## Aktueller Ist-Stand

### Lokal implementiert, aber noch nicht committed

- Phase 0A Verification States (`server/src/core/verification/states.ts`)
- Cross-Verify fail-closed
- Phase-0A-Integration im Draft-Pfad der Legal Pipeline
- Citation Guardrail v2: präzisere Absatz-/Satzprüfung, Cross-Law-Matching, begründete Unsicherheit
- 56 gezielte Tests grün; TypeScript kompiliert

### Noch offene Fehler in der lokalen Phase-0-Arbeit

- High-Risk-Output bleibt veröffentlichbar, wenn nur Tier-0 lief und Cross-Verify übersprungen wurde.
- `verification_state` wird nur im Draft-Pfad gesetzt, nicht auf jedem relevanten Output und nicht an jeder Export-/Publish-Grenze durchgesetzt.
- Die Legal Grounding Map vertraut dem vom LLM gelieferten `verified: true`; der Validator prüft den Quelltext nicht unabhängig gegen den Corpus.
- Der Tier-0-Draft-Guardrail erhält primär Aktenkontext statt eines präzisen Gesetzes-/Judikatur-Evidence-Bundles.
- `deepseek-chat` ist noch an vielen Stellen als Default oder Fallback verdrahtet.
- Einzelne hart codierte Rechtsregeln/Prompts sind fachlich fehlerhaft oder mischen Jurisdiktionen.

### Noch nicht implementiert

- `server/src/eval/lab-dach/`
- auditierter 105-Fälle-Datensatz
- 20–30 anwaltlich verifizierte LAB-DACH-Goldtasks
- persistente Corpus-Snapshots und Amendment-Abhängigkeiten
- kanonische Tatbestands-/Evidence-Matrix
- drei schlanke, vollständig evaluierte Kernworkflows
- produktionsweite Verification-Policy an allen Export-/Publish-Grenzen

## Unveränderliche Engineering-Regeln

1. Kein risikoreicher Output ohne vollständige Verifikation oder dokumentierte anwaltliche Freigabe.
2. Kein juristischer Quellennachweis ohne Source-ID, Jurisdiktion, Fassungsdatum, Hash und Evidence-Span.
3. Kein `verified: true` darf vom generierenden Modell selbst autoritativ gesetzt werden.
4. Keine fehlende Jurisdiktion darf stillschweigend auf AT, DE oder CH fallen.
5. Keine Prompt-/Retrieval-Optimierung auf dem versiegelten Holdout.
6. Kein Lernen aus ungeprüftem Nutzerfeedback.
7. Keine hart codierte Rechtsregel ohne offizielle Quelle, Gültigkeitszeitraum und juristischen Test.
8. Modelle bleiben austauschbar und werden über Capability Registry + Receipts gepinnt.
9. Ein Feature gilt erst als vorhanden, wenn API, Berechtigungen, Persistenz, UI, Audit und E2E-Test gemeinsam funktionieren.
10. Ein Ticket entspricht einem isolierten Commit; bestehende fremde Worktree-Änderungen werden nicht mitgenommen.

---

# EPIC 0 — Aktuelle v3-Arbeit stabilisieren und commitfähig machen

Priorität: P0, sofort. Blockiert alle weiteren Trust-Layer-Arbeiten.

## T0.1 Dirty-Worktree-Audit und Scope-Sicherung

**Ziel:** Die begonnenen v3-Änderungen sauber von nicht zugehörigen Dateien trennen.

**Arbeit:**

- Diff von `citation-guardrail.ts`, `cross-verify.ts`, `legal-pipeline.ts`, `verification/` und Guardrail-v2-Tests reviewen.
- `law-corpus/at/uwg.md` und `src/lib/whatsapp/*` nicht in den v3-Commit aufnehmen.
- Veraltete Kommentare und Logtexte entfernen, die noch „best effort“ suggerieren, obwohl geworfen wird.
- Ein Migrations-/Rollout-Dokument für geänderte Publish-Semantik ergänzen.

**Abnahme:**

- `git diff --check` grün.
- TypeScript grün.
- Nur v3-relevante Dateien staged.
- Ein eigener Commit `fix(legal): enforce fail-closed verification states`.

## T0.2 High-Risk ohne Tier-1 konsequent sperren

**Ziel:** Architekturregel „kein High-Risk-Output bei übersprungener Prüfung“ tatsächlich umsetzen.

**Arbeit:**

- In `resolveVerificationState()` gilt bei `risk_level=high && !cross_verify_ran`: `NEEDS_HUMAN_REVIEW`, `publish_allowed=false`.
- Bestehenden gegenteiligen Test korrigieren.
- Tests für Guardrail-only, Cross-Verify-only, beide übersprungen, Timeout, Parsefehler und Providerfehler.

**Abnahme:**

- Kein High-Risk-Zweig ohne beide Pflichtprüfungen liefert `VERIFIED*`.
- Property-/Matrix-Test deckt alle State-Kombinationen ab.

## T0.3 Verification Policy an allen Output-Grenzen

**Ziel:** Verification State nicht nur speichern, sondern zentral erzwingen.

**Neue Komponente:** `server/src/core/verification/policy.ts`

**Arbeit:**

- Zentrale Funktion `assertOutputActionAllowed(output, action, actor)`.
- Actions: `preview`, `save_draft`, `share_internal`, `export_docx`, `send_client`, `file_court`, `sign`.
- Risikomatrix pro Outputtyp und Action.
- API-Routen für Word-Export, DOCX-Export, DocuSign, Submission Review, Client Sharing und Schriftsatzexport anbinden.
- Anwaltliche Override-Freigabe nur mit Benutzer-ID, Begründung, Timestamp und Audit-Event.

**Abnahme:**

- BLOCKED/VERIFIER_ERROR kann nicht exportiert, versendet oder signiert werden.
- NEEDS_HUMAN_REVIEW kann erst nach expliziter Freigabe weitergegeben werden.
- E2E-Tests auf API-Ebene, nicht nur Unit Tests.

## T0.4 Verification Metadata auf jedem Work Product

**Ziel:** Jeder relevante Output trägt eine unveränderliche Verification Receipt.

**Schema:** State, Checks, Modelle, Prompt-Hashes, Source-Snapshot-Hashes, Zeitpunkte, Flags, Freigaben.

**Abnahme:**

- Draft, Memo, Fristenreport, Vertragsreview, Redline und Schriftsatz besitzen eine Receipt-ID.
- UI zeigt Status und Drill-down.
- Nach Inhaltsänderung wird die alte Verifikation invalidiert.

---

# EPIC 1 — Juristische Datenmodelle statt freier Agententexte

Priorität: P0/P1. Das ist die wichtigste neue Systemschicht für belastbare Subsumtion.

## T1.1 Kanonisches Legal-Issue-Schema

**Neue Dateien:**

- `server/src/core/legal/issues/types.ts`
- `server/src/core/legal/issues/validator.ts`
- `server/src/core/legal/issues/store.ts`

**Strukturen:**

- `LegalIssue`
- `ApplicableRule`
- `RuleElement`
- `ElementAssessment`
- `FactReference`
- `EvidenceSpan`
- `IssueConclusion`

**Pflichtfelder:** jurisdiction, as_of_date, source snapshot, required elements, supporting/opposing facts, missing facts, status und assumptions.

**Abnahme:**

- Kein `satisfied` ohne mindestens einen verifizierten Evidence-Span.
- `unknown`/`disputed` kann nicht automatisch in ein sicheres Gesamtergebnis umgewandelt werden.
- JSON-Schema und Migrationstests vorhanden.

## T1.2 Legal Grounding Map v2

**Ziel:** LLM-Selbstbestätigung entfernen.

**Arbeit:**

- `MatchedParagraph` erhält `source_slug`, `source_url`, `snapshot_hash`, `valid_from`, `valid_to`, `evidence_start`, `evidence_end`.
- LLM liefert nur Kandidatenstatus `claimed`.
- Backend lädt Quelle selbst, normalisiert Zitat und setzt erst danach `verified`.
- Exaktes Gesetz + Paragraph + Absatz + Satz + Jurisdiktion prüfen.
- Verifikation gegen falsche Quelle, falsche Fassung und gleich nummerierte Fremdnorm testen.

**Abnahme:**

- Manipuliertes `verified: true` wird ignoriert.
- Jede verifizierte Norm ist auf einen unveränderlichen Corpus-Snapshot zurückführbar.

## T1.3 Claim–Evidence-Graph

**Ziel:** Jede materielle Aussage im Output mit Tatsachen- und Rechtsbelegen verbinden.

**Arbeit:**

- Nodes: claim, fact, document span, rule, decision, conclusion.
- Edges: supports, contradicts, defines, applies, distinguishes, overrules.
- Claim-basierte Verifikation statt 24k-Gesamtkontext.
- Evidence Coverage und Contradiction Coverage berechnen.

**Abnahme:**

- UI kann bei jeder Aussage „Warum?“ und die exakte Passage öffnen.
- Verifier bewertet pro Claim nur die zugeordneten Belege.

## T1.4 Jurisdiktions- und Rechtsgebietskonfiguration

**Ziel:** Gemischte Prompts und gefährliche Defaults entfernen.

**Arbeit:**

- Deklarative Config `jurisdiction × practice_area × procedure_type`.
- Fehlende Jurisdiktion = Eingabe-/Review-Block, kein AT-Default.
- AT/DE-Abkürzungskollisionen explizit modellieren, insbesondere `KSchG`.
- Arbeitsrechtsprompts nach AT und DE trennen.
- Rechtsquellenlisten aus Config statt Prompt-Freitext.

**Abnahme:**

- Jurisdiktions-Confusion-Testset mit mindestens 50 negativen Fällen.
- Kein fremdes Gesetz wird ohne explizite EU-/Cross-Border-Regel zugelassen.

## T1.5 Hardcoded-Law-Audit

**Ziel:** Juristische Regeln nicht ungeprüft in TypeScript konservieren.

**Arbeit:**

- Alle gesetzlichen Fristen, Kostenregeln, Anspruchsgrundlagen und Schwellenwerte inventarisieren.
- Fehler wie AHG-Verjährung (§ 6 statt § 1) und OR Art. 127 bereinigen.
- Regeln in versionierte Datensätze mit offizieller Quelle und Tests verschieben.
- Übergangsrecht und Ausnahmen als explizite Bedingungen modellieren.

**Abnahme:**

- Jede Regel hat Source Receipt und juristische Reviewer-ID.
- CI verhindert Rules ohne Quelle/Gültigkeitsdatum.

---

# EPIC 2 — LAB-DACH als unabhängiges Evaluationssystem

Priorität: P0/P1. Kein Qualitätsclaim vor Abschluss des Pilot-Holdouts.

## T2.1 LAB-DACH-Grundgerüst

**Neue Struktur:** `server/src/eval/lab-dach/`

**Module:** types, validator, harness, task isolation, agent tools, judge adapter, automated checks, scoring, receipt, report, CLI.

**Abnahme:**

- Ein Demo-Task läuft vollständig offline gegen definierte Tools.
- Task kann keine fremden Dateien/Secrets lesen und keinen freien Netzwerkzugriff nutzen.
- Run ist anhand Receipt reproduzierbar.

## T2.2 Bestehende 105 Fälle auditieren

**Arbeit:**

- `expected_section` und `expected_conclusion` tatsächlich bewerten.
- Bekannte AT-Fehler als Regression Fixtures aufnehmen.
- Status pro Fall: valid, corrected, removed, disputed.
- Juristischer Review ist externe Pflichtarbeit; Agent darf nur vorbereiten.

**Abnahme:**

- Audit-Protokoll für alle 105 Fälle.
- Alte 95,2%-Metrik wird nicht mehr als Qualitätszahl angezeigt.

## T2.3 20–30 Goldtasks + Challenge Sets

**Arbeit:**

- Zunächst DE/AT, 2–3 eng begrenzte Rechtsgebiete.
- 8–30 atomare Kriterien je nach Tasktyp.
- `required` und `severity` getrennt modellieren.
- Guardrail-Challenge-Set mit 100 absichtlich manipulierten Antworten.
- Retrieval-Qrels mit relevanten und harten negativen Quellen.

**Abnahme:**

- Jeder Goldtask: as_of_date, offizielle Quellen, Rubrik, Referenzoutput, Reviewer.
- Holdout außerhalb des normalen Entwicklungsverzeichnisses.

## T2.4 Einheitlicher verblindeter Judge-Stack

**Ziel:** Alle getesteten Agenten mit derselben Bewertungslogik prüfen.

**Arbeit:**

- Judge kennt Agentenmodell nicht.
- Gleicher Primär-/Sekundärjudge für alle Kandidaten.
- Outputstatus: pass, fail, uncertain, not_judgeable, judge_error.
- Evidence-Zitate in jedem Judge-Verdict.
- Parsefehler fail-closed, keine kreative JSON-Rettung.

**Metriken:** strict_all_pass, critical_all_pass, criterion pass, precision/recall für FAIL, false-pass, false-fail, Kappa, Konfidenzintervalle.

## T2.5 Retrieval-Evaluation

**Metriken:** Recall@k, Precision@k, MRR, nDCG, source-type coverage, passage support rate, negative-authority recall.

**Abnahme:**

- Retrieval und Generation werden getrennt bewertet.
- Top-20-Law-Hit allein gilt nicht als Retrieval-Erfolg.

## T2.6 CI- und Release-Gates

**Arbeit:**

- PR-Smoke: kleine deterministische Suite.
- Nightly: Dev-Set.
- Release: Test-Set + Security/Isolation.
- Holdout nur zu festgelegten Modell-/Produkt-Releases.
- Ergebnisartefakte und Trenddaten persistent speichern.

---

# EPIC 3 — Legal Data Factory und Quellenbreite

Priorität: P1. Parallel zu LAB-DACH, aber keine neue Quelle ohne Eval.

## T3.1 Corpus Receipt und persistente Snapshots

- DB-Tabellen für source, snapshot, paragraph snapshot, amendments und license review.
- SHA-256, parser version, valid_from/to, fetched_at, official URL.
- Aktuelle Frontmatter-Metadaten migrieren.
- Kein In-Memory-Store in Produktion.

## T3.2 Source Lifecycle

Status: discovered → rights_pending → parser_pending → eval_pending → early_access → general_availability → degraded → retired.

Jeder Übergang braucht automatisierte Checks und bei Rechtefragen menschliche Freigabe.

## T3.3 Connector Reliability

- RIS, Gesetze-im-Internet, EUR-Lex, Fedlex und Judikatur-Connectoren mit Health, Retry, Rate Limit, Cursor, Idempotenz und Quarantäne.
- Parser-Golden-Files und Schema-Drift-Erkennung.
- Silent failure verboten.

## T3.4 Stale-Dependency-Graph

- Output → Claim → Source Snapshot Abhängigkeiten speichern.
- Gesetzes-/Judikaturänderung markiert betroffene Outputs.
- Re-Verification Queue statt pauschaler Regeneration.
- Anwalt sieht „betroffen seit“ und Änderungsdiff.

## T3.5 Quellen-Coverage-Matrix

Nicht Zahl der Gesetze messen, sondern Coverage nach Rechtsgebiet und Quellentyp:

- Primärrecht
- Verordnungen
- Höchstgerichtliche Judikatur
- Instanzrechtsprechung
- Materialien
- Behördenpraxis
- offene/lizenzierte Literatur

## T3.6 Rechte- und Lizenzschicht

- License Registry pro Source.
- Scraping-/API-Nutzungsbedingungen dokumentieren.
- Kein geschützter Kommentar ohne Lizenz.
- Verlagspartnerschaften als Business-Track, technisch über gleiche Source API.

---

# EPIC 4 — Retrieval und juristische Recherche auf Frontier-Niveau

Priorität: P1/P2.

## T4.1 Source Router v2

- Intent + Jurisdiktion + Rechtsgebiet + Stichtag bestimmen.
- Gesetz, Judikatur, Materialien, Verwaltungspraxis und Kanzleiwissen getrennt suchen.
- Unsichere Jurisdiktion vor Suche klären.

## T4.2 Citation Identity Resolver

- Strukturierter Parser für Gesetzes-, ECLI-, GZ-, BGH-, OGH-, BVerfG-, EuGH- und Literaturzitate.
- Fuzzy Match nur als Candidate Generation; finale Identität deterministisch/semantisch verifizieren.
- Falsch-positive ABGB/BGB- und KSchG-Kollisionen testen.

## T4.3 Precedent Treatment und Bad-Law-Signale

- bestätigt, eingeschränkt, unterschieden, aufgehoben, überholt.
- Zeitgewicht nicht als Ersatz für echte Treatment-Klassifikation.
- Negative Authority und Gegenjudikatur aktiv suchen.

## T4.4 Context Builder

- Claim-spezifische Evidence Bundles statt pauschalem Kontext-Truncation.
- Diversität nach Source Type.
- Tokenbudget pro Claim.
- Quellenrang und Ausschlussgründe im Explain-Modus.

## T4.5 Firm Knowledge

- Permission-aware Suche über frühere Matters, Muster, Memos, Klauseln und Playbooks.
- Ethical Walls, Matter Scope und Need-to-Know durchgehend testen.
- Goldene Beispiele getrennt von bloß ähnlichen Dokumenten behandeln.

---

# EPIC 5 — Drei vollständig evaluierte Kernworkflows

Priorität: P1. Vor weiteren Spezialagenten.

## T5.1 Workflow A: Rechtsfrage → Kurzmemorandum

Schritte: Intake → Jurisdiktion/Stichtag → Issues → Recherche → Elementmatrix → Gegenansicht → Memo → Claim Verification → Review.

**DoD:** Jede wesentliche Aussage hat Quelle; fehlende Fakten und Gegenargumente sichtbar; keine Freigabe bei unvollständiger Verifikation.

## T5.2 Workflow B: Gerichtsakt → Fristen- und Risikoreport

Schritte: Dokumentinventar → Parteien/Rollen → Chronologie → Zustellung/Ereignisse → deterministische Fristberechnung → Risiken → Review.

**DoD:** Ausgangsdatum, Fristregel, Kalender, Hemmung/Unterbrechung und Unsicherheit separat nachvollziehbar; Anwalt bestätigt kritische Eingaben.

## T5.3 Workflow C: Schriftsatzentwurf

Schritte: bestätigte Facts/Issues → Template/Playbook → Draft → Quelleninsertion → Gegenargumente → Claim Verification → Anwaltreview → DOCX.

**DoD:** Kein ungeprüfter Claim im exportierten DOCX; Quellen sind anklickbar; Verification Receipt wird eingebettet/mitexportiert.

## T5.4 Bestehende Mega-Pipeline modularisieren

- 25+ Layer über Feature Flags/Workflowdefinitionen aktivieren.
- Nur benötigte Layer ausführen.
- Jeder Layer deklariert Inputs, Outputs, Side Effects, Risk, Timeout und Failure Policy.
- Keine versteckten `on_child_fail: continue` für Pflichtschritte.

---

# EPIC 6 — Work Product, Vault und anwaltliche UX

Priorität: P2. Viele Komponenten existieren, müssen E2E gehärtet werden.

## T6.1 Source-first Review UI

- Split View: Output, Tatbestandsmatrix, Aktenbeleg, Rechtsquelle.
- Accept/reject/edit pro Claim.
- Unsichere/streitige Elemente priorisieren.

## T6.2 Word/DOCX Roundtrip

- Formatgetreuer Import/Export.
- Kommentare, Fußnoten, Track Changes, Inhaltsverzeichnis, Randnummern und Zitierlinks.
- Änderung invalidiert nur betroffene Claims, nicht blind den gesamten Draft.

## T6.3 Redline und Playbooks

- Klauselklassifikation, Abweichung von Playbook, Vorschlag, Begründung, Risiko, Approval.
- Batch-Evaluation gegen Goldverträge.

## T6.4 Vault/Review Tables Scale

- Große Dokumentmengen, Streaming, Pagination, Jobfortschritt, Resume, Partial Failure.
- Tabellenzelle verlinkt auf Originalspan.
- Ask-over-table muss Berechtigungen und Quellen beibehalten.

## T6.5 Collaboration

- Matter-/Vault-Sharing, Kommentare, Assignments, Freigaben, Versionskonflikte.
- Externe Nutzer strikt scoped.

---

# EPIC 7 — Enterprise Security, Governance und Compliance

Priorität: P1/P2; parallel mit Kernworkflows.

## T7.1 Tenant-/Matter-Isolation E2E

- RLS, Source Scope, Matter Scope, ACL und DMS-Berechtigungen gemeinsam testen.
- Cross-Tenant- und Cross-Matter-Red-Team-Suite.
- Indirect Prompt Injection über Dokumente testen.

## T7.2 Identity Lifecycle

- SAML/OIDC/WorkOS und SCIM Users/Groups E2E.
- Deprovisioning widerruft Sessions, Tokens, Shares und DMS-Zugriffe.
- Runner-konforme Vitest-Konfiguration herstellen; aktuelle Bun-Ausführung ist für `vi.mock`-Suites ungeeignet.

## T7.3 Data Governance

- Region Pinning EU/CH.
- Retention, Legal Hold, Export/Delete, Encryption, Key Rotation.
- ZDR-/No-Training-Policy pro Modellprovider technisch erzwingen und auditen.

## T7.4 Tamper-evident Audit

- Hashverkettete Events für Retrieval, Modellaufruf, Quelle, Export, Freigabe und Override.
- Admin-Export und unabhängige Verifikation.

## T7.5 Security Assurance

- Threat Model, SBOM, Dependency Scans, SAST/DAST, Secret Scan, Pentest-Backlog.
- ISO-27001/SOC-2-Readiness als separater Organisations-Track.

---

# EPIC 8 — Plattformzuverlässigkeit und Model Operations

Priorität: P1/P2.

## T8.1 Model Capability Registry

- Modell-ID, Provider, Snapshot, Context, Tools, JSON, Thinking, Residency, ZDR, Preis.
- `deepseek-chat` global auf explizite V4-Routen migrieren.
- Kein stiller Fallback auf ein Modell mit geringerer Compliance oder Capability.

## T8.2 Prompt Registry

- Versionierte Prompts, Hash, Owner, Evalstatus, Rollback.
- Produktivprompt nur nach Dev/Test-Gate.

## T8.3 Workflow Receipts und Cost Ledger

- Token je Turn, Cache, Tool Calls, Retry, Latenz, Kosten, Providerfehler.
- First-pass und final-pass getrennt.

## T8.4 Queue Reliability

- Idempotenz, Lease/Heartbeat, Retry-Klassen, Dead Letter Queue, Resume, Cancellation.
- Pflichtprüfer dürfen nicht als optionaler Child weiterlaufen.

## T8.5 Observability/SLO

- Metriken: success, verified, blocked, verifier error, stale source, retrieval miss, cost, latency.
- SLO pro Kernworkflow und Alarmierung.

## T8.6 Backups und Disaster Recovery

- DB, Object Store, Corpus Snapshots, Audit Logs und Evaldaten.
- Restore-Drill mit dokumentiertem RPO/RTO.

---

# EPIC 9 — Kontrolliertes Lernen und Produktverbesserung

Priorität: P2/P3.

## T9.1 Feedback-Triage

- Nutzerfeedback ist Candidate, nie Ground Truth.
- Jurist bestätigt Fehlerklasse und Korrektur.
- Verknüpfung mit Prompt-, Retrieval-, Corpus- oder UI-Ursache.

## T9.2 Regression Mining

- Bestätigte Produktionsfehler werden anonymisierte Dev-Fixtures.
- Kein Mandantendatum in öffentliche/übergreifende Trainingssets.

## T9.3 Model Vetting

- Neue Modelle auf identischem Testset, Security, Kosten, Latenz und Judge-Bias prüfen.
- Shadow Mode vor Traffic-Umschaltung.

## T9.4 Fine-Tuning Gate

Fine-Tuning erst, wenn ein klarer Baseline-Vergleich, genügend bestätigte Daten und ein unveränderter Holdout existieren. Zuerst kleine Komponenten: Reranker, Klassifikator, Citation Parser, Rubric Judge.

---

# EPIC 10 — Skalierung, CH und öffentliche Positionierung

Priorität: P3, nach nachgewiesener DE/AT-Qualität.

## T10.1 Auf 100, dann 300–500 Goldtasks skalieren

- Nur nach False-Pass-, Goldfehler- und Leakage-Gates.
- Juristenzeit realistisch budgetieren.

## T10.2 CH erst mit Quellen- und Fachexpertise

- Keine Qualitätsbehauptung nach bloßer Anzahl von Gesetzen.
- Schweizer Jurist, Fedlex/Judikatur/Verfahrensrecht und eigenes Challenge Set.

## T10.3 Public Benchmark

- Verdeckter Holdout, Submission Protocol, Raw Receipts, Konfidenzintervalle, Anti-Leakage.
- Kein direkter Harvey-Claim ohne vergleichbares Protokoll.

## T10.4 Verlagspartnerschaften

- MANZ, C.H.BECK, Schulthess/Helbing Lichtenhahn oder andere Rechtepartner.
- Technisch über Source Lifecycle und License Registry integrieren.

---

# Empfohlene Ausführungsreihenfolge für Coding Agents

## Sprint 0 — 3–5 Tage

1. T0.1 Dirty-Worktree-Audit
2. T0.2 High-Risk-State-Bug
3. T0.3 Policy-Grundgerüst + Export-Gate
4. T8.1 DeepSeek-ID-Migration
5. Commit und Deploy erst nach relevanten Tests

## Sprint 1 — 1–2 Wochen

1. T1.1 Legal-Issue-Schema
2. T1.2 Grounding Map v2
3. T1.4 Jurisdiktionsconfig
4. T1.5 Hardcoded-Law-Audit
5. T2.1 LAB-DACH-Grundgerüst

## Sprint 2 — 2 Wochen

1. T2.2 Audit-Tooling für 105 Fälle
2. T2.3 Goldtask-/Challenge-Format
3. T2.4 Judge-Stack
4. T2.5 Retrieval-Eval
5. T3.1 Corpus Receipts + Snapshot Store

## Sprint 3 — 2–3 Wochen

1. T3.2–T3.5 Data Factory
2. T4.1 Source Router
3. T4.2 Citation Identity Resolver
4. T4.4 Claim Context Builder
5. T5.1 Memo-Workflow E2E

## Sprint 4 — 2–3 Wochen

1. T5.2 Fristen-/Risikoworkflow
2. T5.3 Schriftsatzworkflow
3. T6.1 Source-first Review UI
4. T6.2 DOCX Roundtrip
5. Release-Gates mit 20–30 Goldtasks

## Sprint 5+ — parallelisierte Produktreife

- Track A: Vault, Review Tables, Word, Redline
- Track B: Security, DMS, SSO/SCIM, Audit
- Track C: Reliability, Observability, DR
- Track D: Goldtasks, Quellenpartnerschaften und juristische Reviews

---

# Release-Gates

## Gate A — Trust Core

- High-Risk ohne Tier-1 nicht publishable.
- Autoritative Corpus-Verifikation.
- Keine stillen Jurisdiktionsdefaults.
- Hardcoded-Law-Audit für den gewählten Workflow abgeschlossen.

## Gate B — Internal Lawyer Pilot

- Ein Kernworkflow mit mindestens 20 Goldtasks.
- Strict/Critical All-Pass und False-Pass mit Konfidenzintervall.
- 100 % Quellen-Drilldown.
- Human Review und Audit E2E.

## Gate C — Kanzlei-Pilot

- Drei Kernworkflows.
- Matter-/Tenant-Isolation Red Team bestanden.
- DMS/Word/Export E2E.
- SLO, Backups, Incident Runbook und Provider-Compliance.

## Gate D — Breite Vermarktung

- 100+ Goldtasks, getrennte Holdout-Epoche.
- Persistente Data Factory und Stale Alerts.
- Externe Security-/Legal-Review-Arbeit begonnen oder abgeschlossen.
- Keine unbelegten Qualitäts- oder „AI-Anwalt“-Claims.

## Wann ein Bereich als Harvey-paritätsnah gelten darf

Ein Bereich ist erst paritätsnah, wenn alle sechs Ebenen nachgewiesen sind:

1. Funktionalität,
2. juristische Qualität,
3. Berechtigungen/Governance,
4. Skalierung/Zuverlässigkeit,
5. UX/Integration,
6. messbare Evaluation im realistischen Workflow.

Das Vorhandensein einer Datei, Route oder Dashboard-Seite allein zählt nicht als Capability-Parität.
