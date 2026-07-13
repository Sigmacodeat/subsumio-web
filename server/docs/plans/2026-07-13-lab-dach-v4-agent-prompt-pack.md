# LAB-DACH v4 — Agenten-Prompt-Paket

Stand: 2026-07-13  
Arbeitsgrundlage: `server/docs/plans/2026-07-13-lab-dach-v4-harvey-capability-roadmap.md`

## Verwendung

Die Agenten werden nacheinander ausgeführt. Jeder Agent erhält genau einen Prompt, arbeitet nur in seinem Ticket-Scope, bewahrt fremde Worktree-Änderungen und erstellt genau einen isolierten Commit. Bei einem Blocker stoppt er mit Diagnose, statt angrenzende Architektur selbständig umzubauen.

Nicht in fremde Commits aufnehmen: `law-corpus/at/uwg.md`, `src/lib/whatsapp/*` und `src/lib/legal-chat/actions.ts`, sofern das Ticket sie nicht ausdrücklich freigibt.

Reihenfolge:

`0.1 → 0.2 → 0.3 → 0.4 → 1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6 → 3.x → 4.x → 5.1 → 5.2 → 5.3 → 5.4 → 6.x/7.x/8.x → 9.x → 10.x`

## Globaler Vorspann für jeden Agenten

```
Arbeite im bestehenden Repository /Users/msc/subsumio-web.
Lies zuerst die Roadmap, den aktuellen Git-Status und die betroffenen Dateien.
Fremde Worktree-Änderungen gehören dem Nutzer und müssen erhalten bleiben.
Nutze apply_patch für Edits. Keine destruktiven Git-Befehle, keine Deployments,
keine Secrets und keine Änderungen an Produktionsdaten.

Arbeite ausschließlich im genannten Ticket. Führe danach git diff --check,
ticketbezogene Tests und npx tsc --noEmit --pretty false aus. Staging darf
ausschließlich Ticket-Dateien enthalten. Erzeuge genau einen isolierten Commit.
Wenn ein Acceptance Criterion nicht erfüllbar ist, stoppe und melde den Blocker.
```

---

## Agent 0.1 — Worktree-Audit und v3-Commit

```
Rolle: Senior Release Engineer für den Legal-AI-Trust-Layer.
Ticket: T0.1 — Dirty-Worktree-Audit und Scope-Sicherung.

Prüfe die begonnenen Phase-0A-Änderungen in:
- server/src/core/citation-guardrail.ts
- server/src/core/citation-guardrail-v2.test.ts
- server/src/core/think/cross-verify.ts
- server/src/core/minions/handlers/legal-pipeline.ts
- server/src/core/verification/*

Entferne nur veraltete Kommentare/Logs, die noch fail-open oder “best effort”
suggerieren. Prüfe, ob Tests die aktuelle Semantik abbilden. Ergänze bei Bedarf
ein kurzes Rollout-Dokument unter server/docs/.

Nicht anfassen: law-corpus/at/uwg.md, src/lib/whatsapp/*,
src/lib/legal-chat/actions.ts und sonstige fremde Änderungen. Keine neuen Features.

Acceptance:
- git diff --check grün
- gezielte Verification-/Guardrail-Tests grün
- TypeScript grün
- nur v3-relevante Dateien im Commit

Commit:
fix(legal): stabilize fail-closed verification v3
```

## Agent 0.2 — High-Risk ohne Cross-Verify blockieren

```
Rolle: Formaler Safety-Engineer.
Ticket: T0.2 — High-Risk ohne Tier-1 konsequent sperren.

Behebe resolveVerificationState(): Bei risk_level=high und
!cross_verify_ran muss der Zustand NEEDS_HUMAN_REVIEW mit
publish_allowed=false sein. VERIFIED_WITH_WARNINGS ist in diesem Zweig verboten.

Pflichtmatrix:
- high + Guardrail-only => NEEDS_HUMAN_REVIEW, nicht publishbar
- high + Cross-Verify-only => NEEDS_HUMAN_REVIEW, nicht publishbar
- high + beide übersprungen => NEEDS_HUMAN_REVIEW oder BLOCKED
- Timeout, Parsefehler, Providerfehler => kein VERIFIED-State
- high + beide erfolgreich => nur dann VERIFIED* nach Policy

Korrigiere den bisherigen gegenteiligen Test und ergänze eine vollständige Matrix
aus risk_level × guardrail × cross_verify × error. Ein vom Aufrufer gesetztes
publish_allowed darf die Policy nicht überschreiben.

Erlaubter Scope: server/src/core/verification/* und minimal nötige Callsite-Typen.
Commit:
fix(legal): block high-risk output without cross verification
```

## Agent 0.3 — Zentrale Verification-Policy

```
Rolle: Backend-Architekt für sicherheitskritische Freigaben.
Ticket: T0.3 — Verification Policy an allen Output-Grenzen.

Implementiere server/src/core/verification/policy.ts mit
assertOutputActionAllowed(output, action, actor).
Actions: preview, save_draft, share_internal, export_docx, send_client,
file_court, sign.

Regeln:
- BLOCKED/VERIFIER_ERROR: kein Export, Versand, Signatur oder Einreichung
- NEEDS_HUMAN_REVIEW: nur nach explizitem anwaltlichem Override
- Override benötigt user_id, Begründung, Timestamp, Output-Hash und Audit-Event
- Inhaltsänderung invalidiert die Receipt
- Preview ist keine Publish-Freigabe

Binde die minimalen Adapter in Word-/DOCX-Export, DocuSign, Submission Review,
Client Sharing und Schriftsatzexport an. Keine Workflow-Neuschreibung.

Acceptance: API-E2E-Tests für jede Action und jeden State, Audit-Event geprüft.
Commit:
feat(legal): enforce verification policy at output boundaries
```

## Agent 0.4 — Verification Receipts

```
Rolle: Datenmodell- und Audit-Engineer.
Ticket: T0.4 — Verification Receipt für jedes Work Product.

Erzeuge Receipt-ID und persistierbare Metadaten für Draft, Memo, Fristenreport,
Vertragsreview, Redline und Schriftsatz: State, Checks, Modelle, Prompt-Hashes,
Source-Snapshot-Hashes, Zeitpunkte, Flags, Freigaben und Output-Hash.

Die Receipt wird nicht vom LLM gesetzt. Inhaltsänderung erzeugt eine neue Receipt
oder invalidiert die alte. UI/API darf den Status nur anzeigen, nicht die Policy umgehen.

Acceptance: Persistenz-Roundtrip, Tamper-Test, Mutationstest, TypeScript.
Commit:
feat(legal): persist verification receipts for work products
```

---

## Agent 1.1 — Kanonisches Legal-Issue-Modell

```
Rolle: Legal-Domain-Model-Engineer.
Ticket: T1.1.

Erstelle server/src/core/legal/issues/{types,validator,store}.ts für
LegalIssue, ApplicableRule, RuleElement, ElementAssessment, FactReference,
EvidenceSpan und IssueConclusion.

Pflichtfelder: jurisdiction, as_of_date, source_snapshot, required_elements,
supporting_facts, opposing_facts, missing_facts, status und assumptions.

Invarianten:
- satisfied ohne verifizierten EvidenceSpan ist ungültig
- unknown/disputed wird nicht automatisch zu einem sicheren Ergebnis
- Jurisdiktion und Stichtag sind Pflicht
- freie Agententexte sind nicht kanonische Wahrheit

Liefere JSON-Schema, Runtime-Validator, Store-Interface und Migrationstests.
Zunächst nur Adapter-Schnittstellen, keine Mega-Pipeline-Neuschreibung.
Commit:
feat(legal): add canonical legal issue model
```

## Agent 1.2 — Grounding Map backend-autoritativ machen

```
Rolle: Evidence-Provenance-Engineer.
Ticket: T1.2.

Erweitere MatchedParagraph um source_slug, source_url, snapshot_hash,
valid_from, valid_to, evidence_start und evidence_end. Das LLM darf nur
claimed liefern. Das Backend lädt/normalisiert die Quelle selbst und setzt
verified nur nach Prüfung von Jurisdiktion, Gesetz, Paragraph, Absatz, Satz,
Fassung und Evidence-Span.

Tests: manipuliertes verified=true, falsche Quelle, falsche Fassung,
gleich nummerierte Fremdnorm und nicht zusammenhängender Evidence-Span.
Erlaubter Scope: Grounding-Map-Validator, Corpus-Lookup-Adapter, Tests,
minimaler Draft-Adapter.
Commit:
fix(legal): make grounding verification backend-authoritative
```

## Agent 1.3 — Claim-Evidence-Graph

```
Rolle: Graph- und Explainability-Engineer.
Ticket: T1.3.

Implementiere Nodes claim, fact, document_span, rule, decision, conclusion
und Edges supports, contradicts, defines, applies, distinguishes, overrules.
Berechne Evidence Coverage und Contradiction Coverage pro Output.

Der Verifier erhält claim-spezifische Evidence Bundles. Jeder Claim zeigt auf
eine exakte Passage und Quelle. Nutze vorhandene Knowledge-/Citation-Graphen.

Acceptance: “Warum?”-Pfad per API, missing evidence bleibt unknown,
Tests für supporting, contradicting und stale evidence.
Commit:
feat(legal): add claim evidence graph and coverage
```

## Agent 1.4 — Jurisdiktions- und Rechtsgebietskonfiguration

```
Rolle: DACH-Legal-Configuration-Engineer.
Ticket: T1.4.

Erstelle deklarative Config für jurisdiction × practice_area × procedure_type.
Entferne relevante stille AT-Defaults. Fehlende oder widersprüchliche Jurisdiktion
erzeugt Intake-/Review-Block. Trenne AT/DE/CH-Abkürzungen, besonders KSchG.
Arbeitsrechtsprompts dürfen keine fremde Prozessordnung einschleusen.

Quellenlisten und zulässige Normfamilien kommen aus Config, nicht aus Prompt-Freitext.
Erstelle mindestens 50 negative Confusion-Fälle.
Commit:
feat(legal): make jurisdiction and practice area explicit
```

## Agent 1.5 — Hardcoded-Law-Audit

```
Rolle: Juristische Datenqualitäts- und Rules-Engineer.
Ticket: T1.5.

Inventarisiere hart codierte Fristen, Anspruchsgrundlagen, Schwellenwerte und
Kostenregeln. Prüfe insbesondere bekannte AHG- und OR-Fristenfehler. Verschiebe
Regeln in versionierte Datensätze mit offizieller URL, Fassungsdatum,
Gültigkeitszeitraum, Ausnahmebedingungen und Reviewer-ID.

Baue CI-Validierung: Regel ohne Source Receipt oder valid_from/to schlägt fehl.
Keine Regel nur aufgrund einer Modellantwort ändern.
Commit:
fix(legal): move hardcoded legal rules into sourced datasets
```

---

## Agent 2.1 — LAB-DACH Harness

```
Rolle: Evaluation-Platform-Engineer.
Ticket: T2.1.

Erstelle server/src/eval/lab-dach/ mit types, validator, harness, task-isolation,
agent-tools, judge-adapter, automated-checks, scoring, receipt, report und CLI.

Ein Demo-Task muss offline reproduzierbar laufen. Kein Zugriff auf fremde Dateien,
Secrets oder freien Netzwerkzugriff. Jede Ausführung pinnt Dataset-Version,
Code-Revision, Modell/Provider, Prompt-Hashes und Tool-Versionen.

Tests für Isolation und Receipt. Keine Qualitätsbehauptung aus dem Demo-Task.
Commit:
feat(eval): add isolated LAB-DACH benchmark harness
```

## Agent 2.2 — 105 Legacy-Fälle auditieren

```
Rolle: Evaluation-Audit-Engineer.
Ticket: T2.2.

Prüfe jeden vorhandenen Fall: expected_section, expected_conclusion,
Jurisdiktion, Stichtag, Quelle, Rubrik und bekannte Fehler. Speichere
valid/corrected/removed/disputed. Baue fehlerhafte AT-Fälle als Regression
Fixtures ein. Der Agent darf Review vorbereiten, aber keine juristische
Freigabe fingieren. Alte 95,2% erst nach Audit wieder ausgeben.
Commit:
chore(eval): audit and classify LAB-DACH legacy cases
```

## Agent 2.3 — Goldtasks und Challenge Sets

```
Rolle: Benchmark- und Rubric-Engineer.
Ticket: T2.3.

Erstelle 20–30 anwaltlich reviewbare Goldtasks für zwei bis drei begrenzte
DE/AT-Rechtsgebiete. Je Task: 8–30 atomare Kriterien, required/severity,
as_of_date, offizielle Quellen, Referenzoutput, Reviewer und Rubrik.

Erstelle 100 manipulierte Guardrail-Fälle und Retrieval-Qrels mit relevanten
sowie harten negativen Quellen. Holdout bleibt außerhalb des Entwicklungssets
und darf nicht zum Prompt-Tuning verwendet werden.
Commit:
feat(eval): add LAB-DACH gold and challenge task format
```

## Agent 2.4 — Verblindeter Judge

```
Rolle: Evaluation-Methodology-Engineer.
Ticket: T2.4.

Implementiere einen einheitlichen verblindeten Judge. Der Judge kennt Modell und
Agentenname nicht. Zustände: pass, fail, uncertain, not_judgeable, judge_error.
Jedes Verdict enthält Evidenzzitate. Parsefehler sind fail-closed.

Metriken: strict_all_pass, critical_all_pass, criterion pass, FAIL precision/
recall, false-pass, false-fail, Kappa und Konfidenzintervalle.
Commit:
feat(eval): add blinded LAB-DACH judge and scoring
```

## Agent 2.5 — Retrieval-Evaluation

```
Rolle: Search-Quality-Engineer.
Ticket: T2.5.

Trenne Retrieval von Generation. Implementiere Recall@k, Precision@k, MRR,
nDCG, source-type coverage, passage support rate und negative-authority recall.
Prüfe relevante Passage, richtige Fassung und Jurisdiktion separat.
Commit:
feat(eval): measure legal retrieval independently from generation
```

## Agent 2.6 — CI-/Release-Gates

```
Rolle: CI- und Release-Quality-Engineer.
Ticket: T2.6.

Verdrahte PR-Smoke, Nightly-Dev-Set, Release-Test-Set sowie Security-/Isolation-
Gates. Holdout nur bei festgelegten Releases. Speichere Receipts, Rohresultate,
Aggregationen und Trends persistent. Fehlende Quellen, Judge-Error oder
Regression müssen fail-closed sein.
Commit:
ci(eval): enforce LAB-DACH quality and release gates
```

---

## Agent 3.x — Legal Data Factory

```
Rolle: Legal-Data-Platform-Engineer.
Arbeite genau an einem Ticket: T3.1, T3.2, T3.3, T3.4, T3.5 oder T3.6.

T3.1: Persistente Source-/Snapshot-/Paragraph-/Amendment-/License-Tabellen mit
SHA-256, Parser-Version, valid_from/to, fetched_at und offizieller URL.
T3.2: Lifecycle discovered → rights_pending → parser_pending → eval_pending →
early_access → general_availability → degraded → retired.
T3.3: RIS, Gesetze-im-Internet, EUR-Lex, Fedlex und Judikatur mit Health, Retry,
Rate Limit, Cursor, Idempotenz, Quarantäne, Golden-Files und Drift-Erkennung.
T3.4: Output → Claim → Snapshot-Abhängigkeiten, Änderungsdiff, Re-Verification-Queue.
T3.5: Coverage-Matrix nach Jurisdiktion, Rechtsgebiet und Quellentyp.
T3.6: License Registry, Rights Review und technische Sperre nicht freigegebener Quellen.

Keine neue Quelle ohne Provenance und Evalstatus. Keine In-Memory-only-Produktionspfade.
Migrationen und Tests sind Pflicht. Commit: feat(data): <ticket-kurzname>
```

## Agent 4.x — Retrieval

```
Rolle: Legal-Search- und Retrieval-Engineer.
Arbeite genau an einem Ticket: T4.1, T4.2, T4.3, T4.4 oder T4.5.

T4.1: Source Router nach Intent, Jurisdiktion, Rechtsgebiet und Stichtag.
T4.2: Citation Identity Resolver für Gesetz, ECLI, GZ, BGH, OGH, BVerfG,
EuGH und Literatur; Fuzzy Match nur Candidate Generation.
T4.3: Precedent Treatment confirmed/restricted/distinguished/overruled/obsolete
und aktive Suche nach Gegenjudikatur/Negative Authority.
T4.4: Claim-spezifische Evidence Bundles, Tokenbudget, Source-Type-Diversität,
Explain-Mode mit Ausschlussgründen.
T4.5: Permission-aware Firm Knowledge, Matters, Memos, Klauseln, Playbooks,
Ethical Walls und Need-to-Know mit Negativtests.

Generation darf Retrieval-Lücken nicht kaschieren. Falsche Jurisdiktion,
Fassung oder fehlende Gegenansicht muss sichtbar bleiben.
Commit: feat(search): <ticket-kurzname>
```

---

## Agent 5.1 — Rechtsfrage zu Kurzmemorandum

```
Rolle: Workflow-Engineer für juristische Research-Memos.
Ticket: T5.1.

Integriere Intake → Jurisdiktion/Stichtag → Issues → Recherche → Elementmatrix
→ Gegenansicht → Memo → Claim Verification → Review.

DoD: Jede wesentliche Aussage hat einen verifizierten Beleg; fehlende Fakten,
Annahmen und Gegenargumente sind sichtbar; unvollständige Verifikation blockiert
Freigabe; Receipt und Audit-Events sind vollständig. Nutze LegalIssue und
ClaimEvidence, keinen neuen freien Parallelzustand.
Commit:
feat(workflow): add evaluated legal research memo workflow
```

## Agent 5.2 — Fristen- und Risikoreport

```
Rolle: Legal-Deadline- und Deterministic-Calculation-Engineer.
Ticket: T5.2.

Integriere Dokumentinventar → Rollen → Chronologie → Zustellung/Ereignis →
deterministische Fristberechnung → Risiken → Review.

Jede Frist zeigt Ausgangsdatum, Regelquelle, Kalender, Hemmung/Unterbrechung,
Annahmen und Unsicherheit. Kritische Eingaben benötigen anwaltliche Bestätigung.
LLM darf extrahieren, aber Fristen nicht allein festlegen.
Commit:
feat(workflow): add auditable deadline risk workflow
```

## Agent 5.3 — Schriftsatzentwurf bis DOCX

```
Rolle: Legal-Drafting- und Document-Engineering-Engineer.
Ticket: T5.3.

Integriere bestätigte Facts/Issues → Template/Playbook → Draft → Quellen →
Gegenargumente → Claim Verification → Anwaltsreview → DOCX.

Kein ungeprüfter Claim im exportierten Dokument. Quellen sind anklickbar,
Receipt wird mitgeführt, Änderungen invalidieren betroffene Claims. Prüfe
DOCX-Roundtrip mit Track Changes, Fußnoten und Zitierlinks anhand von Fixtures.
Commit:
feat(workflow): add verified pleading draft workflow
```

## Agent 5.4 — Mega-Pipeline modularisieren

```
Rolle: Pipeline-Architekt.
Ticket: T5.4.

Mache die vorhandene Mega-Pipeline über Workflowdefinitionen/Feature Flags
modular. Jeder Layer deklariert Inputs, Outputs, Side Effects, Risk, Timeout
und Failure Policy. Pflichtprüfer dürfen nicht als optionale Child-Tasks
weiterlaufen. Regressionstests schützen bestehende Ergebnisse. Zuerst einen
Workflow als Referenz umstellen, keine Big-Bang-Neuschreibung.
Commit:
refactor(pipeline): make legal workflow layers explicit and fail-closed
```

---

## Agent 6.x — Work Product und Anwalts-UX

```
Rolle: Product- und Frontend/Backend-Integration-Engineer.
Arbeite genau an T6.1, T6.2, T6.3, T6.4 oder T6.5.

T6.1: Source-first Split View, Claim-Accept/Reject/Edit, Tatbestandsmatrix,
Aktenbeleg und Rechtsquelle.
T6.2: DOCX-Roundtrip für Kommentare, Fußnoten, Track Changes, Inhaltsverzeichnis,
Randnummern und Zitierlinks; nur betroffene Claims invalidieren.
T6.3: Redline/Playbook-Abweichung, Begründung, Risiko und Approval mit Goldverträgen.
T6.4: Vault/Review Tables für große Mengen mit Streaming, Pagination, Resume,
Partial Failure und Originalspan-Links.
T6.5: Matter-Sharing, Kommentare, Assignments, Freigaben, Versionskonflikte,
scoped externe Nutzer.

Vorhandene Komponenten wiederverwenden. UI darf Policy/Receipt nicht umgehen.
API, Berechtigung, Persistenz, Audit und E2E-Test sind gemeinsam DoD.
Commit: feat(product): <ticket-kurzname>
```

## Agent 7.x — Security und Governance

```
Rolle: Security- und Compliance-Engineer.
Arbeite genau an T7.1, T7.2, T7.3, T7.4 oder T7.5.

T7.1: Tenant-, Matter-, Source-, ACL-, RLS- und DMS-Isolation einschließlich
indirekter Prompt-Injection aus Dokumenten.
T7.2: SAML/OIDC/WorkOS/SCIM-Lifecycle; Deprovisioning widerruft Sessions,
Tokens, Shares und DMS-Zugriffe; korrekten Vitest-Runner verwenden.
T7.3: EU/CH-Region, Retention, Legal Hold, Export/Delete, Encryption, Key Rotation,
ZDR/No-Training pro Provider.
T7.4: Hashverkettete Audit-Events und unabhängige Verifikation.
T7.5: Threat Model, SBOM, Dependency/SAST/DAST/Secret Scans und Pentest-Backlog.

Jede Änderung erhält Negativtests. Keine Sicherheitszusage ohne reproduzierbaren Test.
Commit: feat(security): <ticket-kurzname>
```

## Agent 8.x — Model Operations und Reliability

```
Rolle: Model-Platform- und Reliability-Engineer.
Arbeite genau an T8.1, T8.2, T8.3, T8.4 oder T8.5.

T8.1: Capability Registry mit Modell-ID, Provider, Snapshot, Context, Tools,
JSON, Thinking, Residency, ZDR und Kosten. Alle deepseek-chat-Verwendungen über
explizite V4-Capability-Routen migrieren; keine blinde globale Ersetzung.
T8.2: Prompt Registry mit Version, Hash, Owner, Evalstatus und Rollback.
T8.3: Receipt/Cost Ledger für Tokens, Cache, Tools, Retries, Latenz, Kosten,
Providerfehler; First-/Final-Pass trennen.
T8.4: Queue-Idempotenz, Lease/Heartbeat, Retry-Klassen, DLQ, Resume, Cancellation.
Pflichtprüfer sind nie optional.
T8.5: Observability, SLOs, Fehlerbudgets und Alerting für Retrieval, Verification,
Provider, Queue und Export.

Kein stiller Fallback auf ein schwächeres oder nicht konformes Modell.
Commit: feat(platform): <ticket-kurzname>
```

---

## Agent 9.x — Kontrolliertes Lernen

```
Rolle: ML-Evaluation- und Feedback-Governance-Engineer.
Arbeite genau an T9.1, T9.2 oder T9.3.

T9.1: Feedback-Taxonomie fact_error, source_error, jurisdiction_error,
subsumption_error, drafting_error, UX_error und system_error.
T9.2: Nur menschlich klassifiziertes Feedback darf in Gold-, Regression- oder
Challenge-Sets gelangen; Review-Queue und Provenance.
T9.3: Prompt-/Retrieval-/Model-Experimente nur gegen Dev-Set; versiegeltes
Holdout, Leakage-Checks und Change Reports.

Kein Online-Lernen aus ungeprüften Nutzerkorrekturen und kein Holdout-Tuning.
Commit: feat(eval): govern legal feedback and controlled improvement
```

## Agent 10.x — Skalierung und neue Jurisdiktionen

```
Rolle: Staff Engineer für Plattform-Skalierung.
Arbeite genau an T10.1, T10.2 oder T10.3.

T10.1: Drei Kernworkflows mit gemessenen Quality-, Latency- und Cost-SLOs stabilisieren.
T10.2: CH als eigene Quellen-, Jurisdiktions- und Eval-Erweiterung; keine Kopie
von AT/DE-Regeln.
T10.3: Benchmark-Report mit Methodik, Grenzen, Fehlerklassen,
Konfidenzintervallen und reproduzierbaren Receipts.

Neue Jurisdiktion erst produktiv, wenn Quellen, Lizenz, Retrieval, Regeln,
Goldtasks, Security und Release-Gate vorhanden sind.
Commit: feat(scale): <ticket-kurzname>
```

## Pflichtübergabe jedes Agenten

```
1. Ticket und Ergebnis
2. Geänderte Dateien
3. Bewusst nicht geänderte Dateien
4. Tests/Commands mit Ergebnis
5. Offene Risiken oder Blocker
6. Commit-SHA
7. Nächster freigegebener Agent
```

## Stop-Regeln

Stoppen und melden, wenn eine juristische Quelle, Lizenz oder Reviewer-Freigabe fehlt,
eine fremde Datei benötigt wird, High-Risk weiterhin publishable wäre, ein Test nur
durch Abschwächen der Sicherheitssemantik grün wird, eine Migration mehrere Tickets
erfordert oder ein Modellwechsel Compliance, Kosten oder Outputsemantik verändert.

Die Reihenfolge ist bewusst: sichere Freigabegrenzen → kanonische Evidenz →
unabhängige Evaluation → Retrieval/Workflows → UI/Enterprise-Härtung →
Modelloptimierung. So arbeitet kein Agent an Oberfläche oder Tuning, solange die
juristische Vertrauensbasis noch offen ist.
