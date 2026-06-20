# Subsumio Global Legal-AI Wettbewerbs- und Gap-Analyse

Datum: 2026-06-20  
Scope: Longlist aus `/Users/msc/.codex/attachments/d7430cb2-1fe9-437e-a2c1-dd9d269a357c/pasted-text.txt`, lokaler Code-Scan von `/Users/msc/subsumio-web`, Online-Verifikation von Marktführern und Kategorie-Referenzen.  
Arbeitsprinzip: Keine Annahmen als Fakten. Wo ein Anbieter nicht belastbar online verifiziert wurde, ist er als "zu prüfen" behandelt. Die Produkt-Backlog-Ableitungen beruhen nur auf verifizierten Kategorie-Mustern plus lokalem Code.

## Kurzfazit

Subsumio ist heute kein reiner Chatbot. Im Code existiert bereits ein breites Kanzlei-OS mit Legal-RAG, DACH-Rechtskorpus, Judikatur-Suche, Verträgen, Akten, Fristen, RVG, GoBD, beA-/DATEV-/DocuSign-/WhatsApp-/DMS-Flächen, RBAC, Audit, SCIM und einer eingebetteten GBrain-Engine.

Die stärksten globalen Wettbewerber gewinnen aber nicht über "mehr Chat", sondern über fünf Dinge:

1. Autoritative Rechtsdaten mit citator-ähnlicher Validierung, z. B. Westlaw/CoCounsel, Lexis+ mit Shepard's, vLex/Vincent, Bloomberg Law.
2. Word- und DMS-nahe Vertragsarbeit mit echten Redlines, Playbooks, Clause Banks, Versionierung und institutional knowledge, z. B. Spellbook, DraftWise, Luminance, GC AI, Legora.
3. End-to-end Agenten/Workflow-Ausführung statt einzelner Prompts, z. B. Legora Agent, ContractPodAi/Leah, Ironclad Jurist, Filevine LOIS, Clio Manage AI.
4. CLM- und Matter-Lifecycle-Tiefe: Intake, Approval, Signatur, Renewal, Obligations, Spend/Billing, Matter Graph, Tasks.
5. Defensible Review/E-Discovery mit Messbarkeit, Precision/Recall, privilege review, rationale/citations at scale, z. B. Relativity aiR, Everlaw, DISCO Cecilia, Reveal.

Für Subsumio heißt das: Nicht alles neu bauen. Das Fundament ist da. Die Top-Priorität ist, vorhandene Einzelfunktionen in auditierbare, quellengeerdete Workflows zu verbinden.

## Lokale Code-Inventur

### Bereits stark

| Bereich                            | Code-Belege                                                                                                                                                                                                                                                                                                                              | Bewertung                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Kanzlei-Navigation / Produktumfang | `src/components/dashboard/sidebar.tsx` enthält 50+ Dashboard-Ziele: Assistant, Query, Agents, Akten, Kontakte, Verträge, Research, Analyse, Präzedenzsuche, Fristen, Playbooks, Clause Library, Review Queue, Monitoring, Drafting, RVG, Invoicing, DATEV, Signatur, WhatsApp, beA, DMS, Compliance, Anonymisierung, Word Add-in, Audit. | Breiter als viele Einzel-Tools. Produkt wirkt aber noch wie viele Module statt ein geführter Workspace. |
| API-Surface Legal                  | `src/lib/api.ts` kapselt `conflictCheck`, `analyzeDocument`, `precedentSearch`, `caseScan`, `translate`, `extractObligations`, `judgementsSync`, `tabularReview`, `contractRedline`, Playbooks.                                                                                                                                          | Gute Basis für Workflows.                                                                               |
| Guard Chain                        | `src/lib/api-handler.ts` zentralisiert Auth, RBAC, CSRF, Rate Limit, Quota, Zod, Error Handling, Audit.                                                                                                                                                                                                                                  | Enterprise-taugliches Fundament.                                                                        |
| Multi-Tenant Engine Scope          | `src/lib/engine.ts` leitet User/Org auf Brain-ID und `x-subsumio-source`.                                                                                                                                                                                                                                                                | Wichtiger Vorteil gegenüber einfachen SaaS-Prototypen.                                                  |
| RBAC                               | `src/lib/permissions.ts` mit Rollen und Legal-Actions.                                                                                                                                                                                                                                                                                   | Gut, aber noch keine granularen matter/document policies.                                               |
| DACH-Fristen                       | `src/lib/legal-deadlines.ts` deckt DE/AT/CH Feiertage, Kantone/Bundesländer, Fristverschiebung.                                                                                                                                                                                                                                          | Starker DACH-USP.                                                                                       |
| Judikatur                          | `src/lib/judgements.ts` integriert RIS-OGD, OpenLegalData, OpenCaseLaw.                                                                                                                                                                                                                                                                  | Solide offen zugängliche Basis, aber kein kommerzieller Citator.                                        |
| Grounding                          | `src/app/api/legal/analyze/route.ts` verifiziert zitierte Normen gegen lokalen Korpus.                                                                                                                                                                                                                                                   | Stark, aber nicht systemweit.                                                                           |
| Redline API                        | `src/app/api/legal/contract-redline/route.ts` streamt Redline-Vorschläge mit Playbook/Jurisdiktion/Perspektive.                                                                                                                                                                                                                          | API da, aber UI/Word-/Versionstiefe muss nachziehen.                                                    |
| GBrain Engine                      | `server/src/core/operations.ts` zeigt contract-first Ops, hybrid search, source isolation, upload hardening.                                                                                                                                                                                                                             | Tiefes technisches Fundament für Memory/RAG.                                                            |

### Größte lokale Schwächen

| Schwäche                                           | Warum kritisch                                                                                                                                                                               | Wettbewerbsdruck                                                                                  |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Workflows sind zu fragmentiert                     | Viele Module existieren, aber kaum "Führe diese Akte von Intake bis Schriftsatz/Frist/Rechnung" als geführter Agent.                                                                         | Legora, Leah, Filevine LOIS, Clio Manage AI sprechen explizit von ausführenden Agenten/Workflows. |
| Citation Verification nicht überall                | Analyse groundet Normen, aber Chat, Drafting, Research, Redline, Memo und Precedent sollten alle dieselbe Citation-Gate-Schicht nutzen.                                                      | Westlaw/Lexis/vLex/Bloomberg verkaufen trusted/authoritative content als Kernnutzen.              |
| Vertragsarbeit ohne vollständigen Review-Workspace | Redline-API und Contract-Seite existieren, aber clause-level annotations, side-by-side diff, issue queue, fallback clauses, version history und Word round-trip sind noch nicht durchgängig. | Spellbook, DraftWise, Luminance, GC AI, Legora.                                                   |
| CLM fehlt als Lifecycle                            | Intake, Approval, Signature, Renewal und Obligationen existieren teilweise, aber keine zusammenhängende CLM-Pipeline.                                                                        | Ironclad, Icertis, Evisort/Workday, Sirion, SpotDraft, ContractPodAi/Leah.                        |
| E-Discovery/large review fehlt defensible          | Tabular review ist da, aber keine privilege logs, review sampling, precision/recall reports, hot docs, issue coding, production sets.                                                        | Relativity, Everlaw, DISCO, Reveal.                                                               |
| Daten-/Content-Partnerschaften fehlen              | Lokaler/offener Korpus ist gut, aber Beck/MANZ/Wolters-Kluwer/Lexis/TR/vLex zeigen: Content moat zählt.                                                                                      | Noxtua/Beck/MANZ, CASUS/Swiss tools, TR, Lexis, vLex.                                             |
| Marketplace/Integrations noch dünn                 | Connectors existieren, aber kein Integrations-Marketplace, keine tiefen two-way syncs, wenig Admin-Diagnose.                                                                                 | Clio 300+ Integrationen, iManage/NetDocuments/Word/M365-Muster bei Top-Tools.                     |

## Online verifizierte Wettbewerbs-Muster

| Kategorie               | Verifizierte Anbieter                                                                           | Belegbare Features                                                                                                  | Relevanz für Subsumio                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| General Legal AI        | Harvey, Legora, CoCounsel, Lexis+ Protégé                                                       | Research, drafting, review, due diligence, collaboration, DMS/M365/Word, document vaults, workflow/agent direction. | Subsumio braucht einen einheitlichen Workspace, nicht nur Seiten.                                                        |
| Authoritative Research  | CoCounsel/Westlaw, Lexis+ Protégé, vLex Vincent, Bloomberg Law                                  | Trusted legal content, citators, comparative research, dockets, brief analyzer, jurisdiction comparison.            | DACH-Korpus + RIS reicht als MVP, aber Citation-Gate und source freshness müssen systemweit werden.                      |
| Contract AI / Word      | Spellbook, Luminance, DraftWise, GC AI, LegalOn, Legora                                         | Word Add-ins, redlines, playbooks, clause drafting, review, negotiation, firm knowledge.                            | Word Add-in und Contract Review müssen zum Hauptarbeitsplatz werden.                                                     |
| CLM                     | Ironclad/Jurist, Icertis, Evisort/Workday, ContractPodAi/Leah, Sirion, SpotDraft, Juro, Summize | Intake-to-signature, approval routing, renewal, obligations, contract analytics, agentic CLM.                       | Subsumio sollte "Kanzlei-CLM light" bauen: nicht Enterprise-Procurement kopieren, sondern Mandats-/Vertragslebenszyklus. |
| E-Discovery             | Relativity aiR, Everlaw, DISCO Cecilia, Reveal, Logikcull                                       | Large-scale review, evidence Q&A, summaries, issue classification, rationale, privilege, validation.                | Für Litigation/Due Diligence fehlen defensible review primitives.                                                        |
| Practice Management AI  | Clio Manage AI, Filevine LOIS, MyCase IQ, Smokeball AI                                          | Matter-aware actions, tasks, deadlines, billing, document summaries, calendars.                                     | Subsumio hat viele Teile, muss sie matter-aware ausführen lassen.                                                        |
| DACH/Sovereign          | Noxtua/Beck/MANZ/Swiss-Noxtua, BRYTER, CASUS, JUPUS, LAWLIFT                                    | Sovereign infrastructure, publisher content, no-code workflows, intake automation, document automation.             | Subsumio kann über DACH-Kanzlei-OS + Sovereign + GoBD/beA gewinnen.                                                      |
| Intake / Client ops     | JUPUS, LawDroid, Smith.ai, Gideon, Eve/EvenUp                                                   | AI secretary, intake questionnaires, client communication, demand packages, PI case lifecycle.                      | Subsumio hat Client Portal/WhatsApp; daraus muss ein intake-first funnel werden.                                         |
| Regulatory / Compliance | Norm Ai, FiscalNote/Dragonfly, BRYTER, ComplyAdvantage                                          | Regulatory intelligence, AI agents, monitoring, compliance workflows.                                               | Monitoring/Compliance existieren, brauchen source-backed monitors und change diffing.                                    |

## Provider-Abdeckung aus der Longlist

Die Longlist enthält 104 Zeilen, 102 eindeutige Anbieter. SpotDraft und Sirion sind doppelt genannt. Diese Analyse lässt keinen Anbieter weg, sondern triagiert sie nach Produktklasse:

| Anbieter aus Longlist                                                                                                                                                                               | Kategorie                              | Für Backlog relevant als                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Harvey; CoCounsel / Thomson Reuters; Lexis+ AI / Protégé; Legora; vLex Vincent AI; Bloomberg Law AI; Westlaw Precision AI; GC AI                                                                    | General/Research Legal AI              | Workspace, authoritative research, citations, document vault, DMS/Word, agentic workflows                |
| Paxton AI; Midpage; Descrybe.ai; Casetext; Fastcase / Docket Alarm; ROSS Intelligence                                                                                                               | Research                               | Search UX, citations, case summaries; ROSS/Casetext historisch/referenzierend                            |
| AI.Law; Clearbrief; BriefCatch; Litera AI                                                                                                                                                           | Drafting/Litigation Writing            | Brief checking, evidence links, legal writing QA, drafting style                                         |
| Eve; EvenUp; Darrow; Filevine AI / LOIS; Litify                                                                                                                                                     | Plaintiff/case intelligence            | Intake, demand packages, claim discovery, matter graph, case lifecycle                                   |
| Clio Duo/Manage AI; MyCase IQ; Smokeball AI; Lawyaw                                                                                                                                                 | Practice/document management           | Case/task/billing/calendar/doc automation inside practice workflow                                       |
| Spellbook; Luminance; Robin AI; Kira Systems; DraftWise; LegalOn Technologies; LawGeex; Diligen; ThoughtRiver; Eigen Technologies; Ontra; ClauseBase; Henchman; Genie AI; Avvoka; LAWLIFT; LegalFly | Contract AI / drafting / due diligence | Word redline, clause extraction, playbooks, precedent reuse, due diligence charts                        |
| Ironclad AI / Jurist; Icertis AI; Evisort; ContractPodAi/Leah; Sirion; SpotDraft; Summize; Juro AI                                                                                                  | CLM                                    | Intake, approvals, signing, repository, obligations, renewal, analytics                                  |
| Relativity aiR; Everlaw AI; DISCO Cecilia AI; Reveal AI; Logikcull AI                                                                                                                               | E-Discovery                            | Scaled review, privilege, issue coding, evidence Q&A, defensibility                                      |
| jhana; Niyam.ai; NyayGuru; Lexlegis.ai; MikeLegal; SUPACE; SUVAS; Adalat AI                                                                                                                         | India/court/IP                         | Jurisdiction-specific research, court workflows, translation; mostly market-watch unless India expansion |
| iCourt Alpha; Fadada AI; LawGPT/LaWGPT; Xiao Bao / China Legal AI tools                                                                                                                             | China                                  | Jurisdiction/content moat; high-verification-needed                                                      |
| Dragon Law; Zegal; LegeSGPT; Ailytics Legal; Legalese.com                                                                                                                                           | APAC docs/compliance                   | SME document automation, computational contracts, compliance docs                                        |
| Bryter; BRYTER Extract / Assist; Noxtua / Beck-Noxtua / MANZ-Noxtua; CASUS; Swiss-Noxtua; MANZ-Noxtua; Beck-Noxtua; JUPUS; RightNow                                                                 | DACH/EU                                | Sovereign AI, publisher content, workflow automation, intake, claims                                     |
| Andri AI; Wordsmith AI; Lawhive; Neota Logic; Checkbox.ai; Josef Legal; Plexus Gateway                                                                                                              | UK/AU workflow/legal ops               | No-code expert systems, intake, in-house workflows                                                       |
| FiscalNote / Dragonfly; Norm Ai; ComplyAdvantage AI                                                                                                                                                 | Regulatory/compliance                  | Monitoring, policy intelligence, AML/risk                                                                |
| Priori Legal; Brightflag; SimpleLegal; Mitratech; Aderant AI                                                                                                                                        | Legal ops / spend / firm ops           | Matter/spend management, outside counsel, billing analytics                                              |

## Priorisierte Feature-Gaps und technische Umsetzung

### P0: Systemweite Legal Grounding & Citation Gate

Problem: `src/app/api/legal/analyze/route.ts` hat Grounding, aber andere AI-Flows können noch ungeerdete Aussagen erzeugen.

Umsetzung:

1. Gemeinsames `src/lib/legal-grounding.ts` extrahieren: citation parsing, statute lookup, judgement lookup, source snippet, verified flag.
2. Auf `/api/think`, `/api/legal/memo`, `/api/legal/contract-draft`, `/api/legal/contract-redline`, `/api/legal/document-review`, `/api/legal/precedent-search` anwenden.
3. Antwortschema überall erweitern: `citations[]`, `unverified_citations[]`, `confidence`, `requires_attorney_review`.
4. UI-Badge in Research/Drafting/Contracts: "verifiziert", "nicht verifiziert", "Quelle öffnen".
5. Eval: Fixtures für erfundene Normen, falsche Paragrafen, korrekte DACH-Zitate.

Aufwand: 1-2 Wochen.  
Benchmark: Westlaw/CoCounsel, Lexis+ Protégé, vLex, Bloomberg Law.

### P0: Matter-Aware Agentic Workflow Layer

Problem: Subsumio hat Module, aber keine ausführenden Kanzlei-Agenten, die einen Vorgang planen, Zwischenschritte ausführen und menschliche Freigaben einholen.

Umsetzung:

1. Neues Domain-Modell `workflow_run`, `workflow_step`, `workflow_artifact`, `approval_gate`.
2. Agent-Templates für: neuer Mandant, neue Akte, Vertrag prüfen, Klageentwurf, Fristen aus Dokument, Rechnungsstellung, Due Diligence.
3. Tool-Rechte aus `src/lib/permissions.ts` nutzen: Agent darf nur Aktionen ausführen, die User/Rolle darf.
4. Jede Aktion in `src/lib/audit.ts` loggen und mit Quellen/Inputs verlinken.
5. Dashboard-Seite "Workflows": laufende Runs, blockierte Freigaben, Audit Trail, Artefakte.

Aufwand: 3-5 Wochen.  
Benchmark: Legora Agent, Leah Agentic CLM, Filevine LOIS, Clio Manage AI.

### P0: Vertrags-Review Workspace

Problem: Redline API existiert, aber Wettbewerber gewinnen im Word-/Review-Kontext.

Umsetzung:

1. Side-by-side diff UI für Original/Gegenentwurf/AI-Vorschlag.
2. Clause-level annotations: risk, playbook rule, fallback text, rationale, source.
3. Clause Library als echter Brain/Page-Type mit CRUD, Tags, jurisdiction, fallback wording, approved_by.
4. Version history: drafts, accepted/rejected suggestions, compare between versions.
5. Word Add-in round-trip: selected clause -> review -> insert redline/comment.

Aufwand: 4-6 Wochen.  
Benchmark: Spellbook, DraftWise, Luminance, GC AI, Legora, LegalOn.

### P1: Kanzlei-CLM Light

Problem: CLM-Marktführer decken Intake-to-signature-to-renewal ab; Subsumio hat Teile, aber keinen Lifecycle.

Umsetzung:

1. Contract object erweitern: lifecycle status, requestor, owner, approvers, counterparty, effective date, renewal date, obligations.
2. Intake form -> draft -> review -> approval -> DocuSign -> obligations -> renewal reminders.
3. Obligation extraction aus `/api/legal/obligation-extract` als post-signature job.
4. Renewal/termination alerts in Monitoring/Deadlines.
5. Contract portfolio dashboard: risk by counterparty, renewal exposure, missing clauses.

Aufwand: 3-4 Wochen.  
Benchmark: Ironclad, Icertis, Evisort/Workday, Sirion, SpotDraft, ContractPodAi/Leah.

### P1: Defensible Bulk Review / Due Diligence

Problem: Tabular Review ist nützlich, aber nicht defensible im E-Discovery/Due-Diligence-Sinn.

Umsetzung:

1. Review set object: documents, questions/issues, reviewer, sample set, status.
2. Issue coding + confidence + rationale per doc.
3. Privilege/sensitivity flags, hot docs, key facts timeline.
4. Export: CSV, JSON, PDF report, privilege log.
5. Quality: sampled human validation, precision/recall estimate, disagreement queue.

Aufwand: 4-6 Wochen.  
Benchmark: Relativity aiR, Everlaw, DISCO Cecilia, Reveal, Kira.

### P1: Intake + AI Legal Secretary

Problem: JUPUS, LawDroid, Smith.ai und plaintiff tools gewinnen früh im Funnel.

Umsetzung:

1. Public/client intake forms mit branching questions pro Rechtsgebiet.
2. WhatsApp + Portal + Web Intake in ein gemeinsames `intake_request` Modell.
3. Auto-Kollisionsprüfung bei Intake und Case Creation.
4. Auto-Akte, Dokumentencheckliste, Honorar-/RVG-Schätzung, Erstantwort-Entwurf.
5. Human approval before client-facing message.

Aufwand: 2-4 Wochen.  
Benchmark: JUPUS, LawDroid, Smith.ai, Eve, EvenUp.

### P2: Research Coverage & Freshness

Problem: DACH-open-data ist gut, aber nicht genug für "weltbeste" Research.

Umsetzung:

1. Source registry: corpus source, license, jurisdiction, freshness, last sync.
2. Automated update jobs for RIS/OpenLegalData/OpenCaseLaw and local law corpus diffs.
3. EU-law/CJEU/ECHR layer prüfen.
4. Optional commercial-content adapter abstrahieren, ohne harte Abhängigkeit: Beck/MANZ/Wolters Kluwer/Lexis/TR/vLex-like connectors.
5. Citation graph: statute -> judgement -> document -> case.

Aufwand: 3-8 Wochen je nach Datenlizenz.  
Benchmark: Noxtua/Beck/MANZ, CoCounsel/Westlaw, Lexis, vLex, Bloomberg.

### P2: No-Code Legal Workflow Builder

Problem: BRYTER/Neota/Checkbox gewinnen, weil Legal-Teams Prozesse selbst bauen können.

Umsetzung:

1. Admin UI für workflow templates: inputs, rules, AI step, approval, output.
2. Rule DSL klein halten: conditions, required docs, jurisdiction, role.
3. Versionierte Templates + test mode.
4. Marketplace: interne Templates für Kanzlei, Contract Review, Compliance, Datenschutz.

Aufwand: 4-8 Wochen.  
Benchmark: BRYTER, Neota, Checkbox, Josef.

### P2: Enterprise Governance

Umsetzung:

1. Matter/document-level policies zusätzlich zu Rollen.
2. Legal-hold/retention per document type.
3. Admin model policy: allowed providers, zero-retention flag, EU-only routing.
4. Security dashboard: SCIM status, SSO, API keys, audit anomalies.
5. AI Act inventory für eingesetzte AI-Features.

Aufwand: 3-5 Wochen.  
Benchmark: Sovereign AI vendors, enterprise CLM/eDiscovery, Noxtua.

## Roadmap

### 0-30 Tage

1. Systemweite Citation-Gate-Bibliothek bauen und in `think`, `memo`, `draft`, `redline`, `document-review` einsetzen.
2. Contract Review UI: side-by-side diff + clause annotations MVP.
3. Auto-Kollisionsprüfung bei Case/Intake.
4. Source registry + freshness UI für Rechtsquellen.
5. E2E-Tests für grounded/unverified citation flows.

### 31-60 Tage

1. Workflow Runs + Approval Gates MVP.
2. Vertrags-CLM-Light: status, approver, signature, obligations, renewal.
3. Intake Request Modell für Portal/WhatsApp/Web.
4. Bulk Review Set mit issue coding, hot docs und CSV/PDF export.
5. Word Add-in tiefer mit Contract Redline verbinden.

### 61-90 Tage

1. Defensible Review: human validation sampling, precision/recall report, privilege log.
2. Citation graph + similar cases.
3. No-code workflow builder MVP.
4. Integration marketplace/admin diagnostics.
5. EU/ECHR/CJEU corpus and monitoring expansion.

## Kritische Build-vs-Buy-Entscheidungen

| Fähigkeit                       | Empfehlung                         | Grund                                                                       |
| ------------------------------- | ---------------------------------- | --------------------------------------------------------------------------- |
| Core Kanzlei-Workflow           | Build                              | Differenzierung und vorhandene Codebasis stark.                             |
| Authoritative legal content     | Partner/Connector                  | Content-Lizenzen sind schwerer als Technik.                                 |
| E-Signature                     | Buy/Integrate                      | DocuSign existiert bereits. Nicht neu bauen.                                |
| OCR/Textract                    | Buy/Integrate                      | Commodity, hohe Randfallkosten.                                             |
| E-Discovery at enterprise scale | Start build, später partnerfähig   | Für Kanzleien MVP bauen; Relativity-Klasse nicht sofort kopieren.           |
| Voice/Reception                 | Partner + eigene Intake-Automation | Smith.ai/JUPUS-Muster, aber Subsumio sollte Ownership ab Intake übernehmen. |

## Quellen

Online verifizierte Primär-/nahe Quellen:

- Harvey: https://www.harvey.ai/ und https://www.harvey.ai/blog/top-harvey-use-cases
- Thomson Reuters CoCounsel/Westlaw: https://legal.thomsonreuters.com/en/products/cocounsel-legal und https://legal.thomsonreuters.com/en/westlaw
- Lexis+ Protégé: https://www.lexisnexis.com/en-us/products/lexis-plus-protege.page
- Legora: https://legora.com/ und https://legora.com/product
- vLex Vincent: https://vlex.com/vincent-ai und https://vlex.com/
- Bloomberg Law AI: https://pro.bloomberglaw.com/products/ai-and-bloomberg-law/
- GC AI: https://gc.ai/
- Spellbook: https://spellbook.com/
- Luminance: https://www.luminance.com/
- Kira/Litera: https://www.litera.com/products/kira
- DraftWise: https://www.draftwise.com/
- Ironclad/Jurist: https://ironcladapp.com/ und https://ironcladapp.com/product/ai-assistant/legal
- Icertis: https://www.icertis.com/ und https://www.icertis.com/products/platform/
- ContractPodAi/Leah: https://leahai.com/ und https://leahai.com/products/agentic-clm
- Relativity aiR: https://www.relativity.com/data-solutions/air/review/
- Everlaw: https://www.everlaw.com/
- DISCO Cecilia: https://csdisco.com/offerings/ediscovery/features-ai
- Reveal: https://www.revealdata.com/
- Noxtua/Beck/MANZ/Swiss-Noxtua: https://www.noxtua.com/, https://www.beck-noxtua.de/en/, https://www.noxtua.com/news/press-releases/manz-noxtua-europes-legal-ai-for-austria
- BRYTER: https://bryter.com/
- JUPUS: https://www.jupus.de/en
- Clio: https://www.clio.com/ und https://www.clio.com/features/legal-ai-software/
- Filevine LOIS: https://www.filevine.com/ und https://www.filevine.com/lois/
- MyCase IQ: https://www.mycase.com/products/legal-ai-software/
- Smokeball AI: https://www.smokeball.com/smokeball-ai

Sekundärquellen wurden nur zur Markt-/Kritik-Einordnung verwendet, nicht als alleinige Feature-Wahrheit.
