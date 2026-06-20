# Phase 2: Competitive Gap Analysis — Subsumio vs. DACH Legal-AI Market 2026

**Audit-Datum:** 2026-06-20  
**Auditor:** Cascade (Principal Engineer)  
**Status:** Abgeschlossen

---

## 1. Marktüberblick — DACH Legal-AI Landscape 2026

### Tier 1 — Enterprise Generalists (global)
| Anbieter | Valuation / ARR | Fokus | DACH-Präsenz |
| --- | --- | --- | --- |
| **Harvey** | $11B / $190M ARR | Multi-Model Legal AI, Research, Drafting | Gleiss Lutz, Hengeler Mueller, Schoenherr |
| **CoCounsel (Thomson Reuters)** | $200M+/yr R&D | Westlaw-Integration, Research | Enterprise-only |
| **Lexis+ AI (LexisNexis)** | Multi-region rollout | Lexis-Korpus, Protégé Agent | Enterprise-only |
| **Luminance** | ~$1.5B (Series C) | Contract Intelligence, M&A Due Diligence | Big Four, Global Top 100 |

### Tier 2 — DACH-Fokussierte Legal-AI
| Anbieter | Funding | Fokus | Besonderheit |
| --- | --- | --- | --- |
| **Noxtua / Beck-Noxtua** | €80.7M Series B | Legal Drafting + Research | BSI C5, TISAX, ISO 42001, beck-online (60M+ docs), §43e BRAO + §203 StGB |
| **Optimaite Law** | Bootstrapped | Vollständige Kanzleisoftware (Akten, Fristen, RVG, DATEV, Drafting) | On-Premise-Option, Mobile App |
| **Clausa** | Pre-Launch | Deterministische Vertragprüfung (BGB §556a, KSchG) | Symbolische + Neuronale AI, §203-Architektur |
| **Logicc** | €2.5M Seed | Multi-Provider-Aggregator (OpenAI, Anthropic, Google, Mistral) | ISO 27001, generisch |

### Tier 3 — Spezialisierte European Legal-AI
| Anbieter | Fokus | Preis |
| --- | --- | --- |
| **Legartis** (CH) | Contract Review, Risk Scoring, Playbook | Enterprise (~€30k+/year) |
| **Saga** (NL) | Legal Research, Clause Drafting | €99/month |
| **Unplex** (CH) | Agentic Platform mit Vertec/SharePoint/Outlook | Enterprise |
| **Legora** | Document AI, Word Add-in | Enterprise |
| **Lunatec** | Deadline Management & Diarising | Enterprise |

---

## 2. Subsumio Feature-Inventar (Ist-Zustand)

### Dashboard-Module (62 Seiten)
| Kategorie | Module |
| --- | --- |
| **Kern-KI** | Brain, Query, Research, Graph, Sources, RAG-Eval, Norms, Rechtsprechung, Judgements-Sync |
| **Legal Domain** | Deadlines, RVG/Cost-Calculator, Drafting, Tabular-Review, Clause-Library, Playbooks, Kollisionsprüfung, Compliance, Anonymize, Verfahrensdoku |
| **Case Management** | Cases, Contacts, Opponents, Intake, Document-Requests, Obligation-Tracking |
| **Contracts** | Contracts, Signature (DocuSign), Contract-Redline-Viewer |
| **Dokumente** | Upload, Vault, DMS, Email-Import, Import-Kanzlei, Data-Export, Version-History |
| **Kommunikation** | WhatsApp, beA, Email, Notifications, Client-Portal |
| **Verwaltung** | Team, Settings, API-Keys, Billing, Audit-Log, Controlling, Invoicing, DATEV-Export |
| **Agenten** | Agents, Assistant, Approvals, Review-Queue, Workflows, Onboarding |
| **Erweitert** | Monitoring, Mobile, Word-Addin, Calendar-Export, Connectors, Experience, Precedent-Search, Translate, Case-Scanner |

### API-Endpunkte (80+ Routen)
- Auth (15), Legal (25), Matter-Context (11), Docusign (6), SCIM (6), Connectors (4), Email (5), Org (4), Cron (7), Portal (5), Billing (3), DMS (3), Invoices (3), Time (3), WhatsApp (4), Agents (2), u.v.m.

### Engine-Core
- GBrain-basiert: Fact Extraction, Consolidation, Embedding, Hybrid Search
- Dream-Cycle: Embed → Synthesize → Extract → Consolidate
- Multi-Model: OpenAI, Anthropic, ZeroEntropy
- Search Modes: conservative, balanced, tokenmax

### Security & Compliance
- JWT-Sessions mit Revocation Store
- API-Key-Auth für externe Clients
- RBAC (admin, lawyer, assistant, client_viewer)
- CSRF-Schutz (Double-Submit Cookie)
- Rate-Limiting (standard/heavy/search)
- Quota-Management (pages, queries, seats)
- Audit-Logging (GoBD-konform, 75+ Action-Types)
- SCIM Directory Sync (SAML/SSO-ready)
- 2FA-Endpunkte vorhanden

### Integrations
- DocuSign (OAuth + JWT, Webhook mit HMAC + Idempotency)
- WhatsApp (Webhook, Signature-Verification, Deduplication, 24h-Window)
- Stripe Billing (Checkout, Portal, Webhook)
- DATEV-Export (SKR03, SKR04, SKR49)
- beA-Integration
- E-Mail-Import (SMTP)

---

## 3. Feature-Matrix: Subsumio vs. Wettbewerber

| Feature | Subsumio | Noxtua | Optimaite | Harvey | Luminance | Lunatec |
| --- | --- | --- | --- | --- | --- | --- |
| **Aktenmanagement** | ✅ Vollständig | ❌ | ✅ Vollständig | ❌ | ❌ | ❌ |
| **Fristenberechnung (DE/AT/CH)** | ✅ Regelbasiert | ❌ | ✅ + Mobile-Push | ❌ | ❌ | ✅ AI-gestützt |
| **RVG-Abrechnung** | ✅ §13 RVG 2025 | ❌ | ✅ Vollständig | ❌ | ❌ | ❌ |
| **Mandantenbuchhaltung** | ⚠️ DATEV-Export | ❌ | ✅ Hauptbuch, Fremdgeld | ❌ | ❌ | ❌ |
| **KI-Drafting** | ✅ Multi-Modell | ✅ beck-online | ✅ Multi-Modell | ✅ Enterprise | ❌ | ❌ |
| **Vertragsanalyse** | ✅ Tabular-Review, Redline | ❌ | ✅ | ✅ | ✅ M&A-scale | ❌ |
| **Contract Redlining** | ✅ Contract-Redline-Viewer | ❌ | ✅ Track Changes | ✅ | ✅ | ❌ |
| **Kollisionsprüfung** | ✅ Eigene Seite | ❌ | ❌ | ❌ | ❌ | ❌ |
| **beA-Integration** | ✅ Eigene Seite + API | ❌ | ✅ | ❌ | ❌ | ❌ |
| **WhatsApp-Bot** | ✅ Full Webhook + Orchestration | ❌ | ❌ | ❌ | ❌ | ❌ |
| **DocuSign-Integration** | ✅ OAuth + JWT + Webhook | ❌ | ✅ E-Sign | ❌ | ❌ | ❌ |
| **Knowledge Brain (RAG)** | ✅ GBrain-basiert | ✅ Eigenes KI-System | ❌ | ✅ | ✅ Pre-trained LLM | ❌ |
| **Multi-Model Support** | ✅ OpenAI, Anthropic, ZeroEntropy | ✅ Sovereign AI | ✅ Multi-Modell | ✅ Multi-Model | ❌ Eigenes LLM | ❌ |
| **Multi-Tenant** | ✅ Org/Team-Modell | ❌ | ✅ | ✅ | ✅ | ❌ |
| **Stripe Billing** | ✅ Checkout + Portal + Webhook | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Quota-Management** | ✅ Pages, Queries, Seats | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Audit-Log (GoBD)** | ✅ 75+ Actions, CSV-Export, Filter | ❌ | ✅ | ❌ | ❌ | ❌ |
| **SCIM/SAML/SSO** | ✅ SCIM-Endpoints | ❌ | ❌ | ✅ Enterprise | ✅ Enterprise | ❌ |
| **2FA** | ✅ Endpunkte vorhanden | ❌ | ❌ | ✅ | ✅ | ❌ |
| **Mobile App** | ✅ Capacitor (iOS/Android) | ❌ | ✅ Native | ❌ | ❌ | ❌ |
| **Word-Add-In** | ✅ Vorhanden | ❌ | ❌ | ❌ | ❌ | ❌ |
| **On-Premise** | ✅ Enterprise-Plan | ❌ Cloud-only | ✅ Vollständig | ❌ | ❌ | ❌ |
| **BSI C5** | ❌ Nicht zertifiziert | ✅ | ❌ | ❌ | ❌ | ❌ |
| **ISO 27001** | ❌ Nicht zertifiziert | ✅ + TISAX + ISO 42001 | ❌ | ✅ | ✅ | ❌ |
| **§203 StGB Architektur** | ⚠️ On-Premise-Option | ✅ Explizit | ⚠️ On-Premise | ❌ | ❌ | ❌ |
| **Data Sovereignty (EU)** | ⚠️ Vercel + User-Hosting | ✅ IONOS/OTC | ✅ DE/EU | ⚠️ Azure EU/DE | ⚠️ UK/EU | ❌ |
| **Preis-Transparenz** | ⚠️ Plans definiert, nicht öffentlich | ✅ Ab €350/Monat | ✅ Öffentlich | ❌ Enterprise | ❌ Enterprise | ❌ |
| **Verfahrensdokumentation** | ✅ Eigene Seite | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Compliance-Management** | ✅ Eigene Seite | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Agenten-Workflows** | ✅ Agents + Approvals + Review-Queue | ❌ | ❌ | ✅ Legal Agents | ❌ | ✅ AI-Agent |
| **Controlling/KPIs** | ✅ Eigene Seite | ❌ | ✅ Echtzeit | ❌ | ❌ | ❌ |
| **Mandantenportal** | ✅ Client-Portal | ❌ | ✅ E-Sign | ❌ | ❌ | ❌ |
| **Clause-Library** | ✅ Eigene Seite | ❌ | ✅ Templates | ❌ | ❌ | ❌ |
| **Precedent-Search** | ✅ Eigene Seite | ✅ beck-online | ✅ RIS | ✅ Westlaw | ❌ | ❌ |

---

## 4. Gap-Analyse — Subsumio vs. Markt

### 4.1 Competitive Advantages (Subsumio-Stärken)

1. **Umfassendste Feature-Suite im SMB/Mid-Market Segment**
   - 62 Dashboard-Module vs. Noxtua (nur Drafting/Research) oder Lunatec (nur Deadlines)
   - Einziger Anbieter mit WhatsApp-Bot + DocuSign + beA + RVG + Fristen + KI-Brain in einer Plattform

2. **Multi-Model-KI mit User-eigenen Keys**
   - OpenAI, Anthropic, ZeroEntropy — User bringt eigene API-Keys mit
   - Kein Vendor-Lock-in bei KI-Modellen (vs. Luminance mit eigenem LLM)

3. **On-Premise-Option**
   - Enterprise-Plan mit Self-Hosting → §203 StGB-Konformität möglich
   - Wettbewerbsvorteil vs. Noxtua (cloud-only) und Harvey (US-hosted)

4. **GoBD-konformes Audit-Log**
   - 75+ Action-Types, CSV-Export, Filter, Detail-Drawer
   - Kaum ein Wettbewerber bietet dies im SMB-Segment

5. **Stripe-basiertes SaaS-Billing**
   - Vollständiges Checkout/Portal/Webhook-System mit Quota-Management
   - Kein Wettbewerber im DACH-Legal-AI-Segment hat vergleichbares Self-Service-Billing

6. **Agenten-Workflow-System**
   - Agents + Approvals + Review-Queue → Human-in-the-Loop
   - Ähnlich wie Harvey's Legal Agents, aber mit GoBD-Audit-Trail

### 4.2 Critical Gaps (Subsumio-Schwächen)

| Gap | Severity | Wettbewerber | Beschreibung |
| --- | --- | --- | --- |
| **BSI C5 Zertifizierung** | 🔴 HIGH | Noxtua | Für öffentliche Auftraggeber und Großkanzleien Pflicht. Subsumio hat keine Zertifizierung. |
| **ISO 27001 Zertifizierung** | 🔴 HIGH | Noxtua, Harvey, Luminance | Standard für Enterprise-Sales. Ohne ISO 27001 kein Enterprise-Deal. |
| **§203 StGB Architektur-Dokumentation** | 🔴 HIGH | Noxtua, Clausa | On-Premise-Option existiert, aber keine öffentliche Architektur-Dokumentation wie bei Noxtua/Clause. |
| **Preis-Transparenz** | 🟡 MEDIUM | Noxtua, Saga, Optimaite | Plans sind definiert (Free/Pro/Team/Enterprise), aber nicht öffentlich auf der Website. |
| **AI-gestützte Fristenerkennung aus Dokumenten** | 🟡 MEDIUM | Lunatec | Subsumio hat regelbasierte Fristenberechnung, aber keine automatische Extraktion aus eingehenden Dokumenten wie Lunatec. |
| **Fristen-Dependencies & Eskalation** | 🟡 MEDIUM | Lunatec | Keine automatische Fristen-Verknüpfung oder Eskalationskaskade (Lawyer → Cover → Partner). |
| **Outlook/Exchange Integration** | 🟡 MEDIUM | Unplex | Keine bi-direktionale Outlook-Synchronisation für Fristen/Kalender. |
| **SharePoint/iManage DMS-Integration** | 🟡 MEDIUM | Unplex, Luminance | Connectors-Seite existiert, aber keine nativen SharePoint/iManage-Anbindungen. |
| **beck-online / RIS Integration** | 🟡 MEDIUM | Noxtua, Optimaite | Judgements-Sync existiert, aber keine exklusive beck-online-Anbindung (60M+ Dokumente). |
| **Public Pricing Page** | 🟡 MEDIUM | Noxtua, Saga | subsumio.com zeigt keine Preise. Wettbewerber haben öffentliche Preisliste. |
| **DSGVO-Verarbeitungsverzeichnis (VVT)** | 🟢 LOW | Optimaite | Compliance-Seite existiert, aber kein automatisiertes VVT. |
| **Mandantenbuchhaltung (Hauptbuch/Fremdgeld)** | 🟢 LOW | Optimaite | DATEV-Export vorhanden, aber keine vollständige Buchhaltung. |
| **Track Changes in Word-Add-In** | 🟢 LOW | Optimaite, Legora | Word-Add-In existiert, aber Track-Changes-Support unklar. |

### 4.3 Unique Selling Points (USP) — Subsumio vs. alle Wettbewerber

1. **WhatsApp-Bot mit KI-Orchestration** — Kein anderer DACH-Legal-AI-Anbieter bietet dies
2. **GBrain Knowledge Engine** — Personal Knowledge Graph mit Fact Extraction & Consolidation
3. **Multi-Model-KI mit User-eigenen Keys** — Kein Vendor-Lock-in, keine KI-Kosten für Subsumio
4. **Vollständige SaaS-Infrastruktur** — Stripe-Billing, Quota, SCIM, 2FA, Audit-Log in einer Plattform
5. **Agent-Workflow-System mit Human-in-the-Loop** — Approvals + Review-Queue + Audit-Trail

---

## 5. Strategic Positioning

### Subsumio's Position im Markt

```
Preis ↑
│
│  Harvey ($50-80/user/mo)    Luminance (€40k+/yr)
│  Noxtua (€350+/mo)
│
│  ┌─────────────────────────────────────────┐
│  │  SUBSUMIO                                │
│  │  • Umfassendste Feature-Suite            │
│  │  • SMB/Mid-Market Fokus                  │
│  │  • Multi-Model + Self-Hosting            │
│  │  • SaaS-Billing + Quota                  │
│  └─────────────────────────────────────────┘
│
│  Saga (€99/mo)    Clausa (Pre-Launch)
│  Logicc (€29-90/user)
│
└──────────────────────────────────────────────→ Feature-Breite
   Narrow (Spezialist)              Broad (Plattform)
```

### Subsumio ist der **einzige Full-Stack Legal-AI SaaS** im DACH-SMB/Mid-Market Segment:
- **Breiter als Noxtua** (Drafting/Research only)
- **SaaS-reifer als Optimaite** (Stripe-Billing, Quota, SCIM, 2FA)
- **Günstiger als Harvey/Luminance** (Self-Service-Billing vs. Enterprise-Sales)
- **KI-flexibler als Luminance** (Multi-Model vs. eigenes LLM)

---

## 6. Priorisierte Empfehlungen

### Must-Have für Enterprise-Readiness (P0)
1. **ISO 27001 Zertifizierung** — Ohne dies kein Enterprise-Deal
2. **BSI C5 Audit** — Für öffentlichen Sektor in DE
3. **§203 StGB Architektur-Dokumentation** — Öffentliches Whitepaper

### Should-Have für Competitive Parity (P1)
4. **Öffentliche Pricing-Page** — subsumio.com/preise
5. **AI-gestützte Fristenerkennung** — Automatische Extraktion aus PDFs/E-Mails
6. **Fristen-Dependencies & Eskalation** — Lawyer → Cover → Partner Kaskade
7. **Outlook-Integration** — Bi-direktionale Kalender/Fristen-Synchronisation

### Nice-to-Have für Differentiation (P2)
8. **SharePoint-Connector** — Für Kanzleien mit Microsoft-Stack
9. **beck-online Integration** — Zugang zu 60M+ Dokumenten
10. **Track Changes im Word-Add-In** — Vollständiges Redlining in Word

---

## 7. Score-Card Phase 2

| Dimension | Score | Max | Begründung |
| --- | --- | --- | --- |
| Feature-Breite | 9 | 10 | Umfassendste Suite im SMB-Segment, wenige Enterprise-Features fehlen |
| Feature-Tiefe | 7 | 10 | Fristen ohne AI-Extraktion, Buchhaltung unvollständig |
| Compliance/Zertifizierung | 3 | 10 | Keine ISO 27001, kein BSI C5, §203 nur über On-Premise |
| Preis-Transparenz | 4 | 10 | Plans definiert, aber nicht öffentlich |
| Integrationen | 7 | 10 | DocuSign, WhatsApp, beA, DATEV — aber kein SharePoint/Outlook |
| KI-Flexibilität | 9 | 10 | Multi-Model mit User-Keys, GBrain-Engine |
| SaaS-Infrastruktur | 8 | 10 | Stripe, Quota, SCIM, 2FA, Audit — sehr reif |
| **Gesamt** | **6.7** | **10** | **Starke Plattform, aber Compliance-Zertifizierungen blockieren Enterprise** |

---

*Nächster Schritt: Phase 3 — Online-Readiness Audit*
