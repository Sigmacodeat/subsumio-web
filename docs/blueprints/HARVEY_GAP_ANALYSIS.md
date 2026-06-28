# Harvey vs. Subsumio — Vollständige Gap-Analyse

**Stand:** 2026-06-27 (Code-verified)
**Vergleichsbasis:** Harvey AI Platform (harvey.ai/platform), Harvey Blog "The Brief" April–Juni 2026, gc.ai Review, ZenML LLMOps Case Study

---

## Methodik

Systematischer Feature-Vergleich zwischen der **kompletten Harvey AI Platform** (8 Module: Assistant, Vault, Workflow Agents, Knowledge, Ecosystem, Security & Enterprise, Harvey Academy, Command Center) und der **Subsumio SaaS Platform** (Codebase-Audit vom 2026-06-27).

Jede Gap ist klassifiziert:

- **P0 — KRITISCH** — Harvey-Level ohne dieses Feature nicht erreichbar. Blockierend für Enterprise-Deals.
- **P1 — HOCH** — Signifikante Funktionslücke. Wettbewerbsnachteil bei Pitch-Situationen.
- **P2 — MITTEL** — Nice-to-have für Parität. Nicht blockierend, aber sichtbar.
- **P3 — NIEDRIG** — Langfristige Roadmap. Aktuell nicht relevant für Core-Parität.

---

## Modul-Übersicht: Harvey vs. Subsumio

| Harvey-Modul              | Harvey-Feature-Umfang                                         | Subsumio-Status                                                                          | Parität |
| ------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------- |
| **Assistant**             | Chat, Q&A, Drafting, Research, Multi-Model                    | ✅ Voll implementiert (Chat, Deep Research, Drafting, 10 Modelle)                        | 95%     |
| **Vault**                 | Bulk Review, Review Tables, Due Diligence, Contract Redlining | ✅ Voll implementiert (Vault, Tabular Review, DD, Redlining, Playbooks)                  | 90%     |
| **Workflow Agents**       | Supervisor/Specialist/Critic, Prebuilt + Custom, Conditions   | ✅ Voll implementiert (Agent Builder, Supervisor, Critic, Conditionals)                  | 85%     |
| **Knowledge**             | 500+ Legal Data Sources, Firm Knowledge, Precedent Search     | ⚠️ Teilweise (RIS + Perplexity, Precedent Search, Clause Library)                        | 40%     |
| **Ecosystem**             | Word/Outlook Add-Ins, Mobile, Integrations                    | ✅ Stark (Word + Outlook Add-In, Capacitor Mobile, 15+ Connectors)                       | 80%     |
| **Security & Enterprise** | SOC 2 Type II, ISO 27001, Data Residency, SSO/SAML            | ⚠️ Teilweise (SSO via WorkOS, IP Allowlist, Ethical Wall, Docs — aber keine Zertifikate) | 55%     |
| **Harvey Academy**        | Training, CLE, Onboarding Courses                             | ❌ Fehlend (keine Trainingsplattform, kein Guided Tour)                                  | 5%      |
| **Command Center**        | Analytics, Usage, Adoption                                    | ✅ Voll implementiert (Adoption Analytics, Admin Dashboard, Audit Trail)                 | 90%     |

**Gesamt-Parität: ~70%**

---

## Geschlossene Gaps ✅ (Code-verified 2026-06-27)

### Core Pipeline (20 Gaps — alle geschlossen)

| #   | Gap                              | Implementierung                                                                |
| --- | -------------------------------- | ------------------------------------------------------------------------------ |
| 1   | Retry bei Validation-Fail        | `legal-pipeline.ts` — Validation returnt `string[]`, 1 Retry                   |
| 2   | Layer 5 erhält Layer 3+4 Outputs | `runDraftLayer` bekommt `forensicReport`, `damageTable`, `deadlineCalendar`    |
| 3   | Parallele Map-Batches            | `Promise.allSettled` statt sequenzieller Loop                                  |
| 4   | §-Verifikation gegen RIS         | `perplexity_research` in `allowedTools` für 3 Specialists                      |
| 5   | Critic erhält Original-Akt       | `runCriticLayer` bekommt `partSlugs`                                           |
| 6   | Review Tables                    | `ReviewTable.tsx` — Zellen-Level-Zitate, Multi-Color-Flagging, Ask-Over-Review |
| 7   | Agentic Search                   | Iterative Search-Anweisungen in 5 Specialist-Prompts                           |
| 8   | Knowledge Sources                | `knowledge-sources.ts` — RIS-Connector mit Caching + Rate-Limiting             |
| 9   | Chronology Builder               | `chronology-builder.ts` + `ChronologyTimeline.tsx` — Timeline, Filter, Export  |
| 10  | Custom Writing Styles            | `writing-styles.ts` — 5 Preset-Styles + Custom, CRUD API                       |
| 11  | Batch Document Editing           | `batch-edit.ts` — 6 Operationen, Dry-Run                                       |
| 12  | DMS Integration                  | `src/lib/dms/` — iManage + NetDocuments                                        |
| 13  | Word-Export                      | `docx-export.ts` — echte .docx via JSZip (OOXML)                               |
| 14  | Permissions & Governance         | `pipeline-permissions.ts` — 5 Rollen, 8 Permissions                            |
| 15  | Eval Framework                   | `eval-framework.ts` — Leave-one-out-Validation                                 |
| 16  | Human-in-the-Loop Checkpoint     | `pause_for_review` + `resume_from_layer`                                       |
| 17  | Cost Guard                       | `BudgetTracker` in `legal-pipeline.ts`, $50 Default-Cap                        |
| 18  | Multi-Model Support              | 10 Modelle (Claude, GPT, Gemini, Mistral, ZeroEntropy)                         |
| 19  | Mobile                           | Capacitor-Integration, Voice Notes, Camera, Biometric, Offline Store           |
| 20  | Ecosystem (Word/Outlook)         | `word-addin/` + `outlook-addin/`                                               |

### SaaS Platform (weitere 25+ Features — code-verified)

| Feature                 | Implementierung                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contract Redlining      | `contract-redline.ts` — Playbook-basiert, Counterparty-Vergleich, SSE-Streaming                                                                                          |
| Clause Library          | `/dashboard/clause-library` — CRUD, Search, Categories, Quick-Create                                                                                                     |
| Playbooks               | `/dashboard/playbooks` — Rules, Deviations, CRUD                                                                                                                         |
| Precedent Search        | `/dashboard/precedent-search` — Jurisdiction-Filter, Internal+External                                                                                                   |
| Due Diligence           | `due-diligence.ts` — Checklist-driven, Risk Scoring, M&A/Real Estate/Financing                                                                                           |
| Deep Analysis           | `deep-analysis.ts` — Narrative Reports, Cross-Document Patterns                                                                                                          |
| Agent Builder           | `agent-builder.tsx` — Custom Agents, Steps, Specialists, Run Dialog                                                                                                      |
| Supervisor Handler      | `supervisor.ts` — Task Decomposition, Wave Execution, Critic Review                                                                                                      |
| Workflow Engine         | `workflow.ts` — Templates, Conditions, Step Status                                                                                                                       |
| SSO/SAML                | `workos.ts` — WorkOS Integration (Microsoft, Google, SAML)                                                                                                               |
| IP Allow-listing        | `middleware.ts` — Env-driven, CIDR support                                                                                                                               |
| Data Residency          | `ethical-wall.ts` — Provider Region Policy, Privilege-based Filtering                                                                                                    |
| Ethical Wall            | `ethical-wall.ts` — Blocked Users, Conflict Check                                                                                                                        |
| Adoption Analytics      | `adoption-analytics.ts` — Usage Trends, Feature Usage, User Breakdown                                                                                                    |
| Admin Dashboard         | `/admin` — Users, MRR, Plans, Referrals, Audit Trail                                                                                                                     |
| Pricing Page            | 4 Tiers (Free/Pro/Team/Enterprise), Monthly/Annual, FAQ                                                                                                                  |
| Self-Service Signup     | Free tier, no credit card, DE+EN                                                                                                                                         |
| 15+ Connectors          | Google Drive, Gmail, Notion, GitHub, Slack, Calendar, Dropbox, Asana, Jira, MS365 (Outlook/OneDrive/SharePoint), beA, Legal-Judgements, Swiss-Judgements, Advokat-Import |
| Auto-Playbook API       | `/api/legal/auto-playbook` — Extract clause positions from contracts                                                                                                     |
| Portfolio Insights      | `/dashboard/portfolio-insights`                                                                                                                                          |
| Shared Spaces           | `/dashboard/shared-spaces` — Cross-Org                                                                                                                                   |
| Litigation Analytics    | `/dashboard/rechtsprechung/analytics`                                                                                                                                    |
| WhatsApp Integration    | `whatsapp-event-bus.ts` — 625 lines                                                                                                                                      |
| beA Integration         | `bea-import.ts` connector                                                                                                                                                |
| DocuSign                | Signature integration                                                                                                                                                    |
| DATEV Export            | `/dashboard/datev-export`                                                                                                                                                |
| Verfahrensdokumentation | `/dashboard/verfahrensdoku`                                                                                                                                              |
| Kollisionsprüfung       | `/dashboard/kollisionspruefung`                                                                                                                                          |
| Client Portal           | `/dashboard/client-portal`                                                                                                                                               |
| Security Docs           | 12 docs (SOC2, IR, Backup, DR, Vendor, Risk, Asset, Pen-Test Prep, etc.)                                                                                                 |
| AT+CH Law Corpus        | 21 AT statutes, 3+ CH statutes in `law-corpus/`                                                                                                                          |
| Bilingual (DE+EN)       | Legal pages, pricing, signup, dashboard i18n                                                                                                                             |
| CI Gates + Bundle Size  | 13 CI jobs, Playwright E2E (23 spec files)                                                                                                                               |

---

## Offene Gaps — Detailanalyse

### P0 — KRITISCH (Blockierend für Enterprise-Parität)

#### GAP-01: SOC 2 Type II Zertifizierung

- **Harvey:** SOC 2 Type II + ISO 27001 zertifiziert
- **Subsumio:** Security-Policies dokumentiert (12 docs), aber **keine externe Zertifizierung**
- **Lücke:** Enterprise-Kunden (≥20 Seats) fordern SOC 2 Type II als Deal-Blocker
- **Aufwand:** Extern (8.000–30.000 €), 3–6 Monate Audit
- **Typ:** Extern — Auditor needed (Drata, Vanta, oder manuell)

#### GAP-02: ISO 27001 Zertifizierung

- **Harvey:** ISO 27001 zertifiziert
- **Subsumio:** ISMS-Dokumentation in `docs/security/` vorhanden, aber **keine Zertifizierung**
- **Lücke:** EU-Enterprise und öffentliche Hand fordern ISO 27001
- **Aufwand:** Extern (10.000–25.000 €), 3–6 Monate
- **Typ:** Extern — Auditor needed

#### GAP-03: Penetration Testing

- **Harvey:** Regelmäßige Pen-Tests durch Dritte
- **Subsumio:** Pen-Test Prep dokumentiert (`PEN_TEST_PREP.md`), aber **kein externer Test durchgeführt**
- **Lücke:** Security Questionnaire fordert Pen-Test-Report
- **Aufwand:** Extern (2.000–10.000 €), 2–4 Wochen
- **Typ:** Extern — Third-party pen-tester

#### GAP-04: Iterative Agentic Search (Deep Research Loop)

- **Harvey:** "Harvey writes and iteratively refines targeted searches over your uploaded sources, expanding context until it has sufficient information to answer"
- **Subsumio:** Specialists nutzen `query` und `search` als **einmalige Calls**. Keine iterative Verfeinerung mit Re-Query.
- **Lücke:** Harvey's Agent sucht → bewertet Treffer → verfeinert Query → sucht erneut. Unsere Agents machen einen Pass.
- **Aufwand:** ~2–3 Tage (Search-Loop in Specialist-System-Prompt oder als Tool-Bundle)
- **Typ:** Code

#### GAP-05: 500+ Legal Data Sources

- **Harvey:** "500+ legal data sources across the globe" — kuratierte Rechtsdatenbanken, Fallrecht, Gesetze
- **Subsumio:** RIS-Connector (AT) + Perplexity (Web) + `law-corpus/` (AT: 21, CH: 3+, DE: 19+, EU: 4). Keine direkten API-Verbindungen zu Beck-Online, LexisNexis, Juris, Oracle.
- **Lücke:** Harvey hat direkte API-Integrationen. Wir haben RIS + Web-Search.
- **Aufwand:** ~5–10 Tage (Beck-Online API + LexisNexis API + Juris API + weitere DACH-Quellen)
- **Typ:** Code + API-Verträge

### P1 — HOCH (Signifikante Funktionslücke)

#### GAP-06: SharePoint Live-Sync (Webhook + Tenant Consent)

- **Harvey:** Vollständige SharePoint-Integration mit Live-Sync
- **Subsumio:** `MicrosoftSharePointConnector` existiert (`microsoft-365.ts`), aber:
  - Keine Live-Tenant-Consent-Flow
  - Keine Webhook-Erneuerung
  - Keine Provider-E2E-Tests
  - Status: `beta` in `connector-coverage.ts`
- **Lücke:** SharePoint-Connector ist Code-Complete, aber nicht Production-Ready
- **Aufwand:** ~3–5 Tage (OAuth Consent Flow + Webhook Registration + E2E Tests)
- **Typ:** Code

#### GAP-07: Auto-Playbook Cron (Automated Update Loop)

- **Harvey:** Playbooks lernen automatisch aus ausgehandelten Verträgen
- **Subsumio:** Auto-Playbook API existiert (`/api/legal/auto-playbook`), aber **keine cron-job-logic** für automatische Updates
- **Lücke:** API ist manuell triggert, nicht automatisiert
- **Aufwand:** ~1–2 Tage (Cron-Job + Scheduler + Staging-Queue)
- **Typ:** Code

#### GAP-08: Guided Onboarding Tour

- **Harvey:** "Harvey Academy" — strukturiertes Training, CLE-kompatibel
- **Subsumio:** `/dashboard/onboarding` page existiert, aber **kein Guided Tour Code** (keine Step-by-Step-UI-Tour, keine Tooltips, keine Progress-Tracking)
- **Lücke:** Neue Nutzer haben keine geführte Einführung
- **Aufwand:** ~2–3 Tage (Tour-Component + Step-Definitions + Progress-State)
- **Typ:** Code

#### GAP-09: Template Library (Document Templates)

- **Harvey:** Vorgefertigte Document Templates pro Practice Area
- **Subsumio:** Clause Library existiert (einzelne Klauseln), aber **keine vollständige Document Template Library** (keine kompletten Verträge, Klageschriften, Schriftsätze als Templates)
- **Lücke:** Clause Library = Bausteine. Template Library = komplette Dokumente.
- **Aufwand:** ~3–5 Tage (Template CRUD UI + Brain-Page-Type `document_template` + Kanzlei-spezifische Templates)
- **Typ:** Code

#### GAP-10: ROI Calculator (Self-Service)

- **Harvey:** Harvey bietet ROI-Calculators und Case Studies
- **Subsumio:** Kein ROI-Calculator auf der Website. Kein Self-Service-Tool für Kanzleien zur Berechnung der Einsparung.
- **Lücke:** Marketing-Feature, fehlt im Funnel
- **Aufwand:** ~1–2 Tage (Interactive Component + Pricing Logic)
- **Typ:** Code

#### GAP-11: Blog / Content Marketing Pages

- **Harvey:** Extensive Content-Marketing (Blog, Case Studies, Whitepapers)
- **Subsumio:** Keine Blog-Seiten, keine Case Studies, keine Whitepaper-Pages
- **Lücke:** SEO-Feature, fehlt im Inbound-Funnel
- **Aufwand:** ~2–3 Tage (Blog-Route + MDX-Rendering + 3–5 Starter-Artikel)
- **Typ:** Code + Content

#### GAP-12: Harvey Academy / Training Platform

- **Harvey:** "Harvey Academy" — strukturierte Trainingskurse, CLE-kompatibel
- **Subsumio:** Keine Trainingsplattform, keine CLE-Kurse, keine Video-Tutorials
- **Lücke:** Enterprise-Kunden fordern Onboarding-Schulungen
- **Aufwand:** ~5–7 Tage (Course-System + Video-Embed + Progress-Tracking + Zertifikate)
- **Typ:** Code + Content

### P2 — MITTEL (Nice-to-have für Parität)

#### GAP-13: Box Integration

- **Harvey:** Box als DMS-Integration
- **Subsumio:** Nur in `connector-coverage.ts` erwähnt, **keine Implementierung**
- **Aufwand:** ~2 Tage (Box API Connector)
- **Typ:** Code

#### GAP-14: Voice-to-Prompt (Mobile AI Queries)

- **Harvey:** Voice-Input für AI-Queries auf Mobile
- **Subsumio:** Voice-to-Text für Notizen existiert (`mobile/note/page.tsx` — Web Speech API), aber **kein Voice-to-Prompt für AI-Chat-Queries**
- **Aufwand:** ~1–2 Tage (Voice Input → Chat Query → Response)
- **Typ:** Code

#### GAP-15: Co-Editing / Real-time Presence

- **Harvey:** Real-time Collaboration auf Dokumenten
- **Subsumio:** Keine Real-time-Presence, kein Co-Editing
- **Lücke:** Mehrere Anwälte können nicht gleichzeitig an einem Dokument arbeiten
- **Aufwand:** ~5–10 Tage (WebSocket + CRDT/Yjs + Presence-Indicators)
- **Typ:** Code (komplex)

#### GAP-16: Full Litigation Flow

- **Harvey:** End-to-End Litigation Workflow (Filing → Discovery → Trial → Settlement)
- **Subsumio:** Litigation Analytics vorhanden (`/dashboard/rechtsprechung/analytics`), aber **kein vollständiger Litigation-Workflow** (Filing, Discovery, Motion Practice, Trial Prep)
- **Aufwand:** ~5–10 Tage (Workflow-Template + Case-Phases + Document Generation pro Phase)
- **Typ:** Code

#### GAP-17: Trust Accounting

- **Harvey:** Financial Features inkl. Trust Accounting
- **Subsumio:** Kein Trust Accounting (Client Funds, IOLTA, Trust Account Reconciliation)
- **Aufwand:** ~5–7 Tage (Trust Account CRUD + Reconciliation + Compliance Reports)
- **Typ:** Code

#### GAP-18: Defensible Review Sets (Production-Ready)

- **Harvey:** Defensible Review Sets für E-Discovery
- **Subsumio:** Teilweise in Vault/Human-Review, aber **kein formelles Review-Set-Management** mit Privilege Logs, Production Sets, Quality Control
- **Aufwand:** ~3–5 Tage (Review-Set CRUD + Privilege Log + Production Export)
- **Typ:** Code

#### GAP-19: R6 — Enterprise + DACH Features (0/6)

- **Harvey:** Enterprise-Features für große Kanzleien
- **Subsumio:** 0/6 R6-Features implementiert (Details in Roadmap)
- **Aufwand:** ~10–15 Tage gesamt
- **Typ:** Code

#### GAP-20: Inline Ternary Consolidation

- **Harvey:** Saubere Code-Qualität
- **Subsumio:** ~25 inline language switches (DE/EN) als Ternaries — Code-Smell
- **Aufwand:** ~1 Tag (Refactoring)
- **Typ:** Code

#### GAP-21: Meta-Keywords SEO Expansion

- **Harvey:** Extensive SEO
- **Subsumio:** Teilweise implementiert, SEO-Audit gelöscht
- **Aufwand:** ~1 Tag (Meta-Tags + Sitemap)
- **Typ:** Code

### P3 — NIEDRIG (Langfristige Roadmap)

#### GAP-22: R7 — Court, Ethics, Analytics (0/5)

- **Aufwand:** ~10 Tage gesamt
- **Typ:** Code

#### GAP-23: Multi-Language über DE/EN hinaus

- **Harvey:** Multi-Language Support
- **Subsumio:** Nur DE + EN. Keine FR, IT, ES, etc.
- **Aufwand:** ~3–5 Tage pro Sprache
- **Typ:** Code + Translation

#### GAP-24: Data Lifecycle Management (Automated Retention)

- **Harvey:** Automated Data Retention Policies
- **Subsumio:** Custom Retention Policy in Enterprise-Plan erwähnt, aber **keine automatisierte Implementation** (keine automated deletion/archival cron)
- **Aufwand:** ~2–3 Tage (Retention Rules Engine + Cron + Audit Log)
- **Typ:** Code

#### GAP-25: Audit Log Export (SIEM Integration)

- **Harvey:** SIEM-integrable Audit Logs
- **Subsumio:** Audit Trail vorhanden (`AuditTrail` component), aber **kein SIEM-Export** (keine syslog/Splunk/Sumo Logic Integration)
- **Aufwand:** ~1–2 Tage (Webhook + JSON-Export + SIEM Format)
- **Typ:** Code

---

## Priorisierte Implementierungs-Roadmap

### Phase 1 — P0: Harvey-Parität Kern (Blockierend)

| #   | Gap                              | Typ        | Aufwand    | Status            |
| --- | -------------------------------- | ---------- | ---------- | ----------------- |
| 1   | GAP-01: SOC 2 Type II            | Extern     | 3–6 Monate | ❌ Nicht begonnen |
| 2   | GAP-02: ISO 27001                | Extern     | 3–6 Monate | ❌ Nicht begonnen |
| 3   | GAP-03: Penetration Testing      | Extern     | 2–4 Wochen | ❌ Nicht begonnen |
| 4   | GAP-04: Iterative Agentic Search | Code       | 2–3 Tage   | ❌ Nicht begonnen |
| 5   | GAP-05: 500+ Legal Data Sources  | Code + API | 5–10 Tage  | ❌ Nicht begonnen |

### Phase 2 — P1: Wettbewerbsparität (Hohe Priorität)

| #   | Gap                               | Typ            | Aufwand  | Status            |
| --- | --------------------------------- | -------------- | -------- | ----------------- |
| 6   | GAP-06: SharePoint Live-Sync      | Code           | 3–5 Tage | ⚠️ Beta           |
| 7   | GAP-07: Auto-Playbook Cron        | Code           | 1–2 Tage | ❌ Nicht begonnen |
| 8   | GAP-08: Guided Onboarding Tour    | Code           | 2–3 Tage | ❌ Nicht begonnen |
| 9   | GAP-09: Template Library          | Code           | 3–5 Tage | ❌ Nicht begonnen |
| 10  | GAP-10: ROI Calculator            | Code           | 1–2 Tage | ❌ Nicht begonnen |
| 11  | GAP-11: Blog / Content Pages      | Code + Content | 2–3 Tage | ❌ Nicht begonnen |
| 12  | GAP-12: Harvey Academy / Training | Code + Content | 5–7 Tage | ❌ Nicht begonnen |

### Phase 3 — P2: Polish & Parität (Mittel)

| #   | Gap                                | Typ            | Aufwand    | Status            |
| --- | ---------------------------------- | -------------- | ---------- | ----------------- |
| 13  | GAP-13: Box Integration            | Code           | 2 Tage     | ❌                |
| 14  | GAP-14: Voice-to-Prompt Mobile     | Code           | 1–2 Tage   | ❌                |
| 15  | GAP-15: Co-Editing / Presence      | Code (komplex) | 5–10 Tage  | ❌                |
| 16  | GAP-16: Full Litigation Flow       | Code           | 5–10 Tage  | ⚠️ Analytics only |
| 17  | GAP-17: Trust Accounting           | Code           | 5–7 Tage   | ❌                |
| 18  | GAP-18: Defensible Review Sets     | Code           | 3–5 Tage   | ⚠️ Teilweise      |
| 19  | GAP-19: R6 Enterprise + DACH       | Code           | 10–15 Tage | ❌ 0/6            |
| 20  | GAP-20: Inline Ternary Refactoring | Code           | 1 Tag      | ⚠️ ~25 switches   |
| 21  | GAP-21: Meta-Keywords SEO          | Code           | 1 Tag      | ⚠️ Teilweise      |

### Phase 4 — P3: Langfristig (Niedrig)

| #   | Gap                                 | Typ         | Aufwand          | Status |
| --- | ----------------------------------- | ----------- | ---------------- | ------ |
| 22  | GAP-22: R7 Court, Ethics, Analytics | Code        | 10 Tage          | ❌ 0/5 |
| 23  | GAP-23: Multi-Language (FR/IT/ES)   | Code + i18n | 3–5 Tage/Sprache | ❌     |
| 24  | GAP-24: Data Lifecycle Management   | Code        | 2–3 Tage         | ❌     |
| 25  | GAP-25: Audit Log SIEM Export       | Code        | 1–2 Tage         | ❌     |

---

## Subsumio-Vorteile vs. Harvey

| Dimension                     | Subsumio                                                               | Harvey                              |
| ----------------------------- | ---------------------------------------------------------------------- | ----------------------------------- |
| **DACH-Fokus**                | AT+DE+CH spezifisch (AHG, StPO, ABGB, DSGVO, 21 AT statutes)           | US-Centric                          |
| **Anti-Hallucination**        | 5-Ebenen-Cross-Layer-Validation + Retry + Grounding                    | Source-Citations (implizit)         |
| **Deterministische Pipeline** | Feste 6-Layer-Sequenz, vorhersehbare Outputs                           | Voll-agentic, nicht-deterministisch |
| **Kostenkontrolle**           | ~$14.50/akt, BudgetTracker ($50 Default-Cap)                           | Nicht public                        |
| **AT-Fristenberechnung**      | 12 AT-spezifische Deadline-Rules                                       | Nicht vorhanden                     |
| **Forensischer Bericht**      | Strukturiert (Kernbefunde A-F, Chronologie, Geldfluss)                 | Generisch                           |
| **EU-Data-Residency**         | Mistral EU-hosted + Provider-Region-Policy + Privilege-based Filtering | US-Hosted (AWS)                     |
| **Pricing Transparency**      | 4 Tiers, transparente Overages, kein Lock-in                           | Custom Pricing, undurchsichtig      |
| **Self-Service Free Tier**    | Kostenlos für immer, keine Kreditkarte                                 | Demo-only                           |
| **Bilingual DE+EN**           | Vollständige i18n                                                      | English-only                        |
| **WhatsApp + beA**            | Native Integration                                                     | Nicht vorhanden                     |
| **DATEV Export**              | Native Integration                                                     | Nicht vorhanden                     |
| **Verfahrensdokumentation**   | Native Dashboard                                                       | Nicht vorhanden                     |
| **Kollisionsprüfung**         | Native Dashboard                                                       | Nicht vorhanden                     |
| **Ethical Wall**              | Code-level Implementation                                              | Nicht dokumentiert                  |
| **Law Corpus**                | 47+ statutes (AT+DE+CH+EU) in `law-corpus/`                            | Nicht öffentlich                    |

---

## Fazit

### Status: 70% Harvey-Parität — Core Pipeline READY, Platform Gaps identifiziert

**Was Subsumio bereits besser macht als Harvey:**

- DACH-Spezifität (AT+DE+CH) mit 12 AT-spezifischen Fristenberechnungs-Regeln
- 5-Ebenen-Anti-Hallucination-Gates + Retry bei Validation-Fail
- Deterministische Pipeline-Architektur (feste 6-Layer-Sequenz)
- EU-Data-Residency (Mistral EU-hosted, Provider-Region-Policy)
- Transparente Pricing (4 Tiers, Self-Service Free Tier)
- Native DACH-Integrations (WhatsApp, beA, DATEV, Verfahrensdokumentation, Kollisionsprüfung)

**Was Subsumio fehlt um Harvey-Level zu erreichen:**

**P0 (Blockierend):**

- SOC 2 Type II + ISO 27001 Zertifizierungen (extern, 3–6 Monate)
- Penetration Testing (extern, 2–4 Wochen)
- Iterative Agentic Search (2–3 Tage Code)
- 500+ Legal Data Sources / direkte API-Integrationen (5–10 Tage Code)

**P1 (Hohe Priorität):**

- SharePoint Live-Sync Production-Ready (3–5 Tage)
- Auto-Playbook Cron (1–2 Tage)
- Guided Onboarding Tour (2–3 Tage)
- Template Library (3–5 Tage)
- ROI Calculator (1–2 Tage)
- Blog / Content Pages (2–3 Tage)
- Harvey Academy / Training Platform (5–7 Tage)

**Gesamtaufwand für P0+P1 (Code):** ~25–40 Entwicklungstage
**Gesamtaufwand für P0 (Extern):** ~20.000–65.000 € + 3–6 Monate

**Empfehlung:** P0-Extern (SOC 2 + ISO 27001 + Pen-Test) parallel starten, P0-Code (Agentic Search + Data Sources) sofort umsetzen. P1 in den nächsten 2–3 Sprints abarbeiten.
