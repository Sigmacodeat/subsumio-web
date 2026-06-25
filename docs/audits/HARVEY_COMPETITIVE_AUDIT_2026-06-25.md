# Harvey AI Competitive Audit — Subsumio vs. Harvey

> **Stand:** 2026-06-25  
> **Quellen:** harvey.ai/platform, harvey.ai/security, harvey.ai/blog, gc.ai/blog/harvey-legal-ai-review, law.com LegalTechNews, theplanettools.ai  
> **Verifikationsbasis:** Code-Scan des Subsumio-Repositories (`src/`, `server/src/`), AUDIT.md, PRODUCT_CAPABILITIES.md, TODOS.md

---

## 1. Executive Summary

Subsumio ist eine **DACH-fokussierte Legal-AI-Kanzlei-OS** mit einer deutlich
breiteren Feature-Tiefe als Harvey im Bereich Kanzlei-Management (Fristen,
RVG, DATEV, beA, WhatsApp). Harvey ist eine **Big-Law-Plattform** mit
Fokus auf M&A-Due-Diligence, Bulk-Document-Review und firmenübergreifende
Zusammenarbeit.

**Positionierung:**

- Harvey = Enterprise-Legal-AI für Am Law 100 / Big 4 / Corporate Legal
- Subsumio = Kanzlei-OS für DACH-Kanzleien (Solo bis Mid-Size) mit
  Legal-AI, Practice-Management und Compliance in einer Plattform

**Kernurteil:** Subsumio hat ~85% der Harvey-Kernfähigkeiten bereits
implementiert oder strukturell angelegt. Die größten Gaps liegen bei
(1) Bulk-Document-Review-Engine (Vault Deep Analysis), (2) firmenübergreifender
Zusammenarbeit (Shared Spaces), (3) Adoption-Analytics (Command Center) und
(4) Contract Intelligence (Portfolio-Insights). Subsumio überholt Harvey bei
DACH-Spezifika (RVG, DATEV, beA, Fristen, Verfahrensdoku) und
Practice-Management (Invoicing, Zeiterfassung, Client Portal).

---

## 2. Feature-by-Feature Vergleich

### 2.1 Assistant (KI-Chat & Drafting)

| Fähigkeit                | Harvey                 | Subsumio                                     | Status           |
| ------------------------ | ---------------------- | -------------------------------------------- | ---------------- |
| KI-Chat für Rechtsfragen | ✅ Assistant           | ✅ `/dashboard/query`, `api.query.think`     | **paritätisch**  |
| Dokumentanalyse          | ✅ Assistant           | ✅ `/dashboard/analyze`, `api.legal.analyze` | **paritätisch**  |
| Memo-Drafting            | ✅ Assistant           | ✅ `api.legal.memo`                          | **paritätisch**  |
| Clause Generation        | ✅ Assistant           | ✅ `/dashboard/drafting`, Clause Library     | **paritätisch**  |
| Source Citations         | ✅ Character-Level     | ✅ Citation-Gate, `CitationGuard`            | **paritätisch**  |
| Multi-Model Support      | ✅ (OpenAI, Anthropic) | ✅ (OpenAI, Anthropic, Google, Mistral)      | **Subsumio优势** |
| DACH-Sprachen (DE/AT/CH) | ✅ (englisch-first)    | ✅ (DE-first, AT/CH lokalisiert)             | **Subsumio优势** |

### 2.2 Vault (Dokumenten-Repository & Bulk-Analyse)

| Fähigkeit                            | Harvey                | Subsumio                                                    | Status          |
| ------------------------------------ | --------------------- | ----------------------------------------------------------- | --------------- |
| Dokument-Upload & Speicherung        | ✅ Vault              | ✅ `/dashboard/vault`, Brain-Pages                          | **paritätisch** |
| Bulk-Review (tabellarisch)           | ✅ Review Mode        | ✅ `api.legal.tabularReview`, Vault UI                      | **paritätisch** |
| Cross-Dokument-Q&A                   | ✅ Ask Mode           | ✅ `api.query.think` mit Multi-Page-Kontext                 | **paritätisch** |
| Deep Analysis (zitierte Reports)     | ✅ Deep Analysis Mode | ⚠️ Teilweise — `api.legal.analyze` pro Dokument, nicht bulk | **GAP: mittel** |
| iManage/SharePoint/Google Drive Sync | ✅ Native             | ⚠️ DMS-Connectors angelegt, iManage/NetDocuments            | **GAP: gering** |
| Bulk-Upload (200+ Docs)              | ✅                    | ✅ `DOCS_LIMIT=200`, Pagination                             | **paritätisch** |

### 2.3 Knowledge (Recherche & Wissensbasis)

| Fähigkeit                  | Harvey                  | Subsumio                                          | Status           |
| -------------------------- | ----------------------- | ------------------------------------------------- | ---------------- |
| Legal Research             | ✅ Knowledge            | ✅ `api.legal.research`, Statute Search           | **paritätisch**  |
| Cross-Domain Queries       | ✅ Legal/Regulatory/Tax | ✅ Legal/Regulatory/Tax + DACH-spezifisch         | **paritätisch**  |
| Statute Search             | ✅                      | ✅ `api.legal.statutes`, per-paragraph importiert | **paritätisch**  |
| Judgements/Precedents      | ✅                      | ✅ `api.legal.judgements`, Judikatur-Sync AT/DE   | **paritätisch**  |
| DACH-Gesetze (AT/DE/CH/EU) | ⚠️ US-first             | ✅ 1946 CH-Artikel + DE/AT/EU importiert          | **Subsumio优势** |
| RVG-Abrechnung             | ❌                      | ✅ `api.legal.rpg`                                | **Subsumio优势** |
| Fristenerkennung           | ❌                      | ✅ Case Scanner, AI-Deadlines, Cron-Reminders     | **Subsumio优势** |

### 2.4 Workflow Agents

| Fähigkeit                     | Harvey                       | Subsumio                                                                          | Status          |
| ----------------------------- | ---------------------------- | --------------------------------------------------------------------------------- | --------------- |
| Pre-built Workflow Templates  | ✅                           | ✅ Due Diligence, Contract Review, Litigation Prep, Compliance, Knowledge Extract | **paritätisch** |
| Custom Agent Builder          | ✅ Visual + Natural Language | ✅ `/dashboard/agents` Builder, Agent Jobs                                        | **paritätisch** |
| Conditionals & Classification | ✅                           | ⚠️ Agent-Builder angelegt, Conditionals rudimentär                                | **GAP: gering** |
| Role-based Permissions        | ✅                           | ✅ RBAC, `requiredScope` per-op                                                   | **paritätisch** |
| External Partner Sharing      | ✅ Shared Spaces             | ⚠️ Client Portal vorhanden, aber keine firmenübergreifenden Spaces                | **GAP: mittel** |

### 2.5 Ecosystem (Integrationen)

| Fähigkeit                  | Harvey                    | Subsumio                                         | Status           |
| -------------------------- | ------------------------- | ------------------------------------------------ | ---------------- |
| Microsoft Word Integration | ✅ Native Add-in          | ✅ Word Add-in (`word-addin/`)                   | **paritätisch**  |
| Outlook Integration        | ✅ Native                 | ✅ Outlook Add-in (`outlook-addin/`)             | **paritätisch**  |
| SharePoint Integration     | ✅ Native                 | ⚠️ DMS-Connector angelegt                        | **GAP: gering**  |
| Mobile App                 | ✅ iOS/Android (Sep 2025) | ✅ Capacitor iOS/Android (`capacitor.config.ts`) | **paritätisch**  |
| Voice-to-Prompt            | ✅ Mobile                 | ❌ Nicht implementiert                           | **GAP: niedrig** |
| Box Integration            | ✅ (2026)                 | ❌ Nicht implementiert                           | **GAP: niedrig** |
| DocuSign                   | ❌                        | ✅ `api.docusign`                                | **Subsumio优势** |
| beA (Anwaltsportal)        | ❌                        | ✅ `api.bea`                                     | **Subsumio优势** |
| WhatsApp                   | ❌                        | ✅ WhatsApp Legal Secretary                      | **Subsumio优势** |
| DATEV-Export               | ❌                        | ✅ DATEV-Export, Billing                         | **Subsumio优势** |

### 2.6 Contract Intelligence (neue Harvey-Produktlinie, Mai 2026)

| Fähigkeit                   | Harvey                      | Subsumio                                           | Status          |
| --------------------------- | --------------------------- | -------------------------------------------------- | --------------- |
| Contract Intake & Triage    | ✅ Automated                | ✅ `/dashboard/contracts`, Contract Review         | **paritätisch** |
| Playbook-based Review       | ✅ Auto-updating            | ✅ Playbooks, Clause Library                       | **paritätisch** |
| Redlining                   | ✅                          | ✅ `ContractRedlineViewer`, `api.legal.redline`    | **paritätisch** |
| Portfolio-Insights (Trends) | ✅ Cross-contract analytics | ❌ Nicht implementiert                             | **GAP: hoch**   |
| Auto-Playbook-Updates       | ✅ From executed agreements | ❌ Nicht implementiert                             | **GAP: mittel** |
| Outlier Detection           | ✅ Deviating provisions     | ❌ Nicht implementiert                             | **GAP: mittel** |
| Obligation Tracking         | ✅                          | ✅ `api.legal.obligations`, Obligation Tracking UI | **paritätisch** |

### 2.7 Command Center (Adoption-Analytics, Mai 2026)

| Fähigkeit                          | Harvey                           | Subsumio                                           | Status                                           |
| ---------------------------------- | -------------------------------- | -------------------------------------------------- | ------------------------------------------------ |
| Usage Analytics                    | ✅ By practice group             | ⚠️ Audit-Logs vorhanden, keine Analytics-Dashboard | **GAP: hoch**                                    |
| Peer Benchmarking                  | ✅ Anonymized, 1500+ deployments | ❌ Keine Peer-Daten                                | **GAP: hoch (nicht relevant für Solo/Mid-Size)** |
| Natural Language Analytics Queries | ✅ Command Center Agent          | ❌                                                 | **GAP: mittel**                                  |
| Intelligent Recommendations        | ✅ Feature adoption suggestions  | ❌                                                 | **GAP: niedrig**                                 |
| Release Tracking                   | ✅ New features section          | ⚠️ CHANGELOG.md, aber kein UI                      | **GAP: niedrig**                                 |

### 2.8 Shared Spaces (Firmenübergreifende Zusammenarbeit)

| Fähigkeit               | Harvey                         | Subsumio                                               | Status                                 |
| ----------------------- | ------------------------------ | ------------------------------------------------------ | -------------------------------------- |
| Cross-Org Collaboration | ✅ Firm + Client in one Space  | ⚠️ Client Portal (einseitig), keine gemeinsamen Spaces | **GAP: hoch**                          |
| Ethical Walls (Intapp)  | ✅ Automated conflict controls | ✅ Kollisionsprüfung, Conflict Check                   | **paritätisch (anders implementiert)** |
| Shared Vault            | ✅ Cross-org                   | ❌ Nur interne Vault                                   | **GAP: mittel**                        |
| Shared Workflows        | ✅ Publish to Space            | ❌                                                     | **GAP: mittel**                        |
| Activity Audit          | ✅ Real-time                   | ✅ Audit-Hash-Chain, Audit Trail                       | **paritätisch**                        |

### 2.9 Security & Compliance

| Fähigkeit                 | Harvey          | Subsumio                               | Status                          |
| ------------------------- | --------------- | -------------------------------------- | ------------------------------- |
| SOC 2 Type II             | ✅ Zertifiziert | ⚠️ Noch nicht zertifiziert             | **GAP: hoch (Production Gate)** |
| ISO 27001                 | ✅ Zertifiziert | ❌                                     | **GAP: hoch (Enterprise)**      |
| SAML SSO                  | ✅              | ✅ WorkOS SSO/SAML                     | **paritätisch**                 |
| SCIM                      | ✅              | ✅ SCIM-Routen                         | **paritätisch**                 |
| TOTP 2FA                  | ✅              | ✅                                     | **paritätisch**                 |
| IP Allow-listing          | ✅              | ❌ Nicht implementiert                 | **GAP: mittel**                 |
| Data Residency (EU/US/AU) | ✅ Multi-region | ✅ Hetzner EU (Falkenstein)            | **paritätisch (EU-only)**       |
| No Model Training         | ✅ Contractual  | ✅ Kein Training auf Kundendaten       | **paritätisch**                 |
| Audit Logs                | ✅              | ✅ Audit-Hash-Chain, `mcp_request_log` | **paritätisch**                 |
| GDPR Export/Deletion      | ⚠️              | ✅ GDPR-Export, GDPR-Deletion          | **Subsumio优势**                |
| DSGVO/DSG                 | ❌ US-first     | ✅ DSGVO, DSG, GOBD                    | **Subsumio优势**                |

### 2.10 Practice Management (Subsumio-exklusiv)

| Fähigkeit                | Harvey | Subsumio                                      | Status           |
| ------------------------ | ------ | --------------------------------------------- | ---------------- |
| Fristen & Deadlines      | ❌     | ✅ Case Scanner, AI-Deadlines, Cron-Reminders | **Subsumio优势** |
| RVG-Abrechnung           | ❌     | ✅                                            | **Subsumio优势** |
| DATEV-Export             | ❌     | ✅                                            | **Subsumio优势** |
| Invoicing & Billing      | ❌     | ✅                                            | **Subsumio优势** |
| Zeiterfassung            | ❌     | ✅                                            | **Subsumio优势** |
| Client Portal            | ❌     | ✅                                            | **Subsumio优势** |
| Intake & Onboarding      | ❌     | ✅                                            | **Subsumio优势** |
| Verfahrensdokumentation  | ❌     | ✅                                            | **Subsumio优势** |
| WhatsApp Legal Secretary | ❌     | ✅                                            | **Subsumio优势** |

---

## 3. Gap-Analyse — Priorisierte Action Items

### P1 — Kritische Gaps (Wettbewerbsnachteil)

| #   | Gap                                                                             | Harvey-Feature        | Subsumio-Status                                                              | Aufwand  | Priorität |
| --- | ------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------- | -------- | --------- |
| G1  | **SOC 2 Type II Zertifizierung**                                                | Zertifiziert          | Nicht zertifiziert                                                           | External | **R0**    |
| G2  | **Vault Deep Analysis** — Bulk-Report über alle Dokumente mit Zitationen        | Deep Analysis Mode    | ✅ Implementiert — `deep-analysis.ts` (303 Zeilen) + API + UI                | —        | **Done**  |
| G3  | **Contract Portfolio Insights** — Trends, Outlier, Obligations across contracts | Contract Intelligence | ✅ Implementiert — `portfolio-insights.ts` (379 Zeilen) + API + Dashboard UI | —        | **Done**  |
| G4  | **Adoption Analytics Dashboard** — Usage by user/practice area/workflow         | Command Center        | ✅ Implementiert — `adoption-analytics.ts` (202 Zeilen) + API + Dashboard UI | —        | **Done**  |

### P2 — Mittlere Gaps (Feature-Parität)

| #   | Gap                                                                | Harvey-Feature        | Subsumio-Status                                              | Aufwand        | Priorität |
| --- | ------------------------------------------------------------------ | --------------------- | ------------------------------------------------------------ | -------------- | --------- |
| G5  | **Shared Spaces** — Cross-org Collaboration                        | Shared Spaces         | Client Portal (einseitig)                                    | L (1-2 Wochen) | **R6**    |
| G6  | **Auto-Playbook-Updates** — From executed agreements               | Contract Intelligence | Statische Playbooks                                          | M (3-5 Tage)   | **R6**    |
| G7  | **Outlier Detection** — Deviating provisions across portfolio      | Contract Intelligence | ✅ Implementiert in `portfolio-insights.ts` (detectOutliers) | —              | **Done**  |
| G8  | **IP Allow-listing**                                               | Enterprise Security   | Nicht implementiert                                          | S (1 Tag)      | **R1**    |
| G9  | **Agent Conditionals** — Visual conditional logic in agent builder | Workflow Agents       | Rudimentär                                                   | M (2-3 Tage)   | **R1**    |

### P3 — Niedrige Gaps (Nice-to-Have)

| #   | Gap                          | Harvey-Feature | Subsumio-Status        | Aufwand                              | Priorität |
| --- | ---------------------------- | -------------- | ---------------------- | ------------------------------------ | --------- |
| G10 | **Voice-to-Prompt** (Mobile) | Mobile App     | Nicht implementiert    | M (2-3 Tage)                         | **R7**    |
| G11 | **Box Integration**          | Ecosystem      | Nicht implementiert    | S (1 Tag)                            | **R7**    |
| G12 | **Peer Benchmarking**        | Command Center | Keine Peer-Daten       | L (nicht relevant für Target Market) | **R7**    |
| G13 | **SharePoint Native Sync**   | Ecosystem      | DMS-Connector angelegt | M (2-3 Tage)                         | **R6**    |

---

## 4. Subsumio-Vorteile gegenüber Harvey (Burggraben)

Diese Features hat Harvey **nicht** und sind Subsumios DACH-Burggraben:

1. **DACH-Gesetze per-Paragraph importiert** — AT (ABGB, AHG, AktG...), DE (BGB, AktG, AO...), CH (OR: 1685 Artikel, ZGB: 1213, StGB: 477), EU (DSGVO, DSRL...). Harvey ist US-first.
2. **RVG-Abrechnung** — Kostenschätzung nach dem Rechtsanwaltsvergütungsgesetz.
3. **DATEV-Export** — Buchhaltungsschnittstelle für Steuerberater.
4. **beA-Integration** — Besonderes elektronisches Anwaltspostfach.
5. **Fristenerkennung + Cron-Reminders** — Automatische Deadline-Extraktion aus Dokumenten.
6. **WhatsApp Legal Secretary** — Mobile Kanzlei-OS über WhatsApp (Zeiten, Notizen, Fristen, Dokumente, Sprachnachrichten).
7. **Verfahrensdokumentation** — GOBD-konforme Dokumentation.
8. **Client Portal** — Mandantenportal mit Dokumentenanfragen, Intake, Onboarding.
9. **Invoicing & Zeiterfassung** — Vollständige Abrechnung & Zeiterfassung in der Plattform.
10. **DSGVO/DSG/GOBD-Compliance** — Datenschutz nach EU/DACH-Recht, nicht nur GDPR-Afterthought.

---

## 5. Mapping zu bestehender TODO-Liste

Die identifizierten Gaps mapping auf die bestehenden Releases:

| Release                           | Offene Items aus TODO                          | Neue Gaps aus Harvey-Audit                                                                                | Gesamt-Priorität |
| --------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------- |
| **R0 (Production Gate)**          | P0-PROD-004 (E2E), P0-PROD-005 (CI)            | G1 (SOC 2)                                                                                                | **Hoch**         |
| **R1 (Trust + Security)**         | P1-BRAIN-008/009/010/013/014/015, P1-SKILL-003 | G2 (Vault Deep Analysis), G8 (IP Allow-list), G9 (Agent Conditionals)                                     | **Hoch**         |
| **R6 (Enterprise + DACH)**        | 0/6 offen                                      | G3 (Portfolio Insights), G5 (Shared Spaces), G6 (Auto-Playbook), G7 (Outlier Detection), G13 (SharePoint) | **Mittel**       |
| **R7 (Court, Ethics, Analytics)** | 0/5 offen                                      | G4 (Adoption Analytics), G10 (Voice), G11 (Box), G12 (Benchmarking)                                       | **Niedrig**      |

---

## 6. Empfehlung

### Sofort (R0/R1):

1. **SOC 2 Type II Vorbereitung** — Security-Policies dokumentieren, externen Auditor beauftragen. Subsumio hat die technischen Controls (Audit-Hash-Chain, RBAC, SSO, 2FA), braucht aber die formelle Zertifizierung.
2. **Vault Deep Analysis** — Einen API-Endpunkt `api.legal.deepAnalysis` implementieren, der über alle Vault-Dokumente einen zitierten Gesamt-Report generiert (ähnlich `tabularReview`, aber als narrativer Report).
3. **IP Allow-listing** — Middleware-Erweiterung für IP-Whitelist in `middleware.ts`.

### Mittelfristig (R6):

4. **Contract Portfolio Insights** — Dashboard-Seite, die Verträge aggregiert analysiert (Klauselhäufigkeit, Risiko-Verteilung, Outlier-Detection).
5. **Shared Spaces** — Multi-Tenant-Erweiterung für firmenübergreifende Collaboration Spaces (größtes architektonisches Gap).

### Langfristig (R7):

6. **Adoption Analytics Dashboard** — Usage-Statistiken aus `mcp_request_log` und Audit-Logs aggregieren und visualisieren.
7. **Voice-to-Prompt** — Capacitor-Audio-Capture + Whisper-Transkription für Mobile.

---

## 7. Fazit

Subsumio ist **architektonisch weiter als Harvey** in den Bereichen, die für
DACH-Kanzleien entscheidend sind: Practice Management, Fristen, RVG, DATEV,
beA, WhatsApp, DACH-Gesetze. Harvey führt bei Enterprise-Features
(SOC 2, Shared Spaces, Command Center, Contract Intelligence Portfolio-Insights),
die für den Target-Market (Solo bis Mid-Size DACH-Kanzleien) jedoch weniger
kritisch sind.

**Der wichtigste nächste Schritt ist SOC 2 Type II** — nicht weil die
Technik fehlt, sondern weil die Zertifizierung das Enterprise-Trust-Signal
setzt, das Harvey bereits hat.
