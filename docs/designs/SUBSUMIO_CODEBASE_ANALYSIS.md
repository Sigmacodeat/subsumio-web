# Subsumio Codebase-Analyse — Deep-Dive

> **Stand:** 12. Juni 2026 | `/Users/msc/Sigmacode IDE/subsumio-app/`

---

## 1. WAS IST DIESE CODEBASE?

### Basis: AFFiNE (affine.pro) — Open-Source Notion/Miro Alternative

Die Subsumio-App ist ein **Fork von AFFiNE v0.26.1** mit einer massiven **Legal-Layer** darauf.

```
AFFiNE Basis (Blocksuite Editor, y-octo CRDT, Workspace, Collaboration)
    +
Subsumio Legal Layer (Case Management, RAG, Deadlines, Billing, Compliance)
    +
Subsumio Marketing (next-intl Landing Pages DE/EN)
```

---

## 2. ARCHITEKTUR

| Schicht | Technologie |
|---|---|
| **Marketing** | Next.js 15 App Router, next-intl, Tailwind, Lucide |
| **Web App** | React 19, Blocksuite Editor, Jotai/RxJS State |
| **Legal Dashboard** | 79 Sections (case-assistant module), Legal Chat |
| **Backend** | NestJS 10, Prisma 5, PostgreSQL + pgvector |
| **AI** | OpenAI/Gemini/Mistral Provider-Fabrik |
| **Native** | Rust (tokio, sqlx, napi-rs) — PDF/DOCX/OCR |
| **Mobile** | Capacitor + Swift/Kotlin |
| **Deploy** | Docker, K8s, Vercel |

---

## 3. BACKEND — Das Herzstueck

### 3.1 Verzeichnisstruktur

```
packages/backend/server/src/plugins/
├── auth/               -- OAuth, Session, Passkey
├── copilot/            -- AI Engine
│   ├── embedding/      -- gemini-embedding-001 client
│   ├── context/        -- Workspace RAG
│   ├── tools/          -- doc-semantic-search
│   ├── providers/      -- OpenAI, Gemini, Mistral, Perplexity
│   └── legal-agent.service.ts
├── legal-case/         -- LEGAL CORE
│   ├── legal-rag.service.ts        -- Vector + BM25 + FTS (872 Zeilen)
│   ├── legal-case.service.ts       -- Case CRUD
│   ├── legal-entity-extraction.service.ts
│   ├── legal-document-classifier.service.ts
│   ├── legal-audit.service.ts
│   ├── legal-conflict.service.ts   -- Kollisionspruefung
│   ├── mistral-ocr.service.ts
│   └── azure-document-intelligence.service.ts
├── legal-pdf/          -- PDF Export, Docusign
├── payment/            -- Stripe Subscription
├── calendar/           -- Kalender
└── ...
```

### 3.2 Datenbank-Schema (vereinfacht)

```prisma
model Workspace { id String @id; legalCases LegalCase[] }

model LegalCase {
  id String @id
  workspaceId String
  caseNumber String?
  title String
  status CaseStatus
  clientIds String[]
  opposingParties OpposingParty[]
  assignedAttorneyIds String[]
  deadlines CaseDeadline[]
  documents LegalDocument[]
  evidence Evidence[]
  jurisdiction Jurisdiction // DE, AT, EU
  legalArea String?
  valueInDispute String?
  analysisData LegalCaseAnalysisData?
}

model LegalDocument {
  id String @id
  caseId String
  title String; status DocumentStatus
  chunks LegalDocumentChunkEmbedding[]
  extractedEntities Json?
  paragraphReferences String[]
  detectedJurisdiction Jurisdiction?
  qualityScore Float?
}

model LegalDocumentChunkEmbedding {
  id String @id
  workspaceId String; caseId String; documentId String; chunkIndex Int
  content String; category String; keywords String[]; qualityScore Float
  embedding Unsupported("vector")? // pgvector 768-dim
}

model CaseDeadline {
  id String @id; caseId String
  title String; dueAt DateTime; status DeadlineStatus
  source String; verifiedBy String?
}

model LegalCaseAnalysisData {
  id String @id; workspaceId String; caseId String @unique
  findings Json; tasks Json; blueprint Json?
  issues Json; actors Json; memoryEvents Json
}
```

### 3.3 Legal RAG Service (872 Zeilen) — Technische Details

**Pipeline:**
1. **Chunking** -> **Embedding** (gemini-embedding-001, 768-dim) -> **pgvector**
2. **Search:** Vector similarity (`embedding <=> queryVec`) mit threshold 0.6
3. **Re-Ranking:** BM25 in-memory (k=1.5, b=0.75, 55% Gewicht)
4. **Fallback:** PostgreSQL full-text search (german tsvector)
5. **Cache:** 5-Minuten in-memory TTL

**Konstanten:**
```typescript
DEFAULT_THRESHOLD = 0.6; DEFAULT_TOP_K = 12;
RERANK_CANDIDATE_MULTIPLIER = 3;
BM25_K1 = 1.5; BM25_B = 0.75;
RERANK_BM25_WEIGHT = 0.55; // 55% BM25 + 45% Vector
```

### 3.4 87 Backend-Services (laut Audit)

| Kategorie | Services |
|---|---|
| AI | LegalChat, CopilotWorkflow, NormClassification, ContradictionDetector, EvidenceRegister, CollectiveIntelligence, GegnerIntelligence |
| Dokumente | DocumentProcessing, DocumentGenerator, DocumentVersioning, DocumentNormExtractor, LegalPdfExport, MistralOcr, AzureDocIntelligence |
| Fristen | DeadlineAutomation, DeadlineAlert, Kalender, Gerichstermin, Fristenkontrolle, TerminAutomation |
| Finanzen | Rechnung, TimeTracking, CostCalculator, AustriaCostCalculator, DATEVExport, Treuhandkonto |
| Compliance | DSGVOCompliance, GwGCompliance, AuditExport, KanzleiRuleValidation |
| Kommunikation | Email, MandantenNotification, MandantenPortal, BeAConnector, AIEmailDrafting |
| Sonstige | Aktennotiz, Vollmacht, Wiedervorlage, Verfahrensstand, KollisionsPruefung, AnwaltsReminder, AnwaltsTagesjournal |

---

## 4. FRONTEND — Legal Dashboard

### 4.1 Module: case-assistant

```
packages/frontend/core/src/modules/case-assistant/
├── services/
│   ├── legal-chat.ts              -- 3.734 Zeilen! Legal Chat Engine
│   ├── legal-rag-sync.service.ts  -- Backend-RAG Sync
│   ├── knowledge-graph.ts         -- Norm-Graph (nur Normen, in-memory)
│   ├── legal-norms.ts
│   ├── case-assistant.ts
│   ├── deadline-manager.ts
│   ├── evidence-manager.ts
│   ├── contradiction-detector.ts
│   ├── cost-calculator.ts
│   ├── dsgvo-compliance.ts
│   ├── gegner-intelligence.ts
│   └── kollisions-pruefung.ts
├── components/sections/
│   ├── panel.tsx
│   ├── premium-chat-section.tsx
│   ├── client-matter-section.tsx
│   ├── cockpit-section.tsx
│   ├── document-generator-section.tsx
│   ├── contradiction-section.tsx
│   ├── evidence-section.tsx
│   ├── norm-search-section.tsx
│   ├── rechnung-section.tsx
│   └── ... (70+ weitere = 79 Sections)
└── types.ts  -- 3.329 Zeilen
```

### 4.2 Legal Chat Engine (3.734 Zeilen)

**6 Legal Chat Modes:**
- `strategie` -- Rechtsstrategie
- `subsumtion` -- Subsumtion
- `gegner` -- Gegner-Analyse
- `beweislage` -- Beweismittel
- `fristen` -- Fristen
- `normen` -- Gesetze

**Chunk-Kategorien:** sachverhalt, rechtsausfuehrung, begruendung, urteil, antrag, klageschrift, berufung, korrespondenz, mahnung, beweis, zeuge, gutachten, protokoll, frist, bescheid, anklageschrift, strafanzeige

### 4.3 Knowledge Graph (370 Zeilen) — Wichtige Limitierung

```typescript
// GraphNodeType: 'norm' | 'case_law' | 'legal_concept' | 'procedure' | 'argument' | 'strategy'
// Aber: NUR Normen werden initialisiert!
// In-Memory only (Map<string, GraphNode>)
// KEINE persistente DB, KEIN Graph-Traversal fuer RAG
```

---

## 5. SUBSUMIO vs. SIGMABRAIN — Direktvergleich

### 5.1 Subsumio hat, SigmaBrain NICHT

| # | Feature | Gewichtung |
|---|---|---|
| 1 | Vollstaendiges Case/Matter Management | **KRITISCH** |
| 2 | Deadline Automation (27 Templates, 7 Jurisdiktionen) | **KRITISCH** |
| 3 | Document Generator (13+ Templates) | **Hoch** |
| 4 | Cost Calculator (RVG/RATG, OEsterreich) | **Hoch** |
| 5 | Kollisionspruefung (Interessenkonflikt) | **Hoch** |
| 6 | Gegner-Intelligence Service | **Hoch** |
| 7 | Client Portal (Mandanten-Self-Service) | **Hoch** |
| 8 | Wiedervorlage / Aktennotizen | **Mittel** |
| 9 | Calendar Integration (Gerichtstermine) | **Mittel** |
| 10 | 4-Augen Fristenkontrolle | **Mittel** |
| 11 | Document Versioning + Review | **Mittel** |
| 12 | E-Signature (Docusign) | **Mittel** |
| 13 | DSGVO/GwG Compliance Services | **Mittel** |
| 14 | Document Classification (AI) | **Mittel** |
| 15 | Trust Account (Treuhand) | **Mittel** |
| 16 | Billing/Invoice (teilweise) | **Mittel** |
| 17 | Real-time Collaboration (y-octo CRDT) | **Niedrig** |

### 5.2 SigmaBrain hat, Subsumio NICHT

| # | Feature | Gewichtung |
|---|---|---|
| 1 | **Selbstverdrahtender Knowledge Graph (persistent, typed edges)** | **KRITISCH** |
| 2 | **Graph-Traversal in RAG** | **KRITISCH** |
| 3 | **Gap-Analyse in Antworten** | **KRITISCH** |
| 4 | **Dream Cycle (24/7 Autopilot)** | **Hoch** |
| 5 | **Hybrid-RAG (Vector + BM25 + Graph + RRF)** | **Hoch** |
| 6 | **Multi-Tenant Source-Isolation (fuzz-getestet)** | **Hoch** |
| 7 | **Open Source Engine** | **Hoch** |
| 8 | **Self-Hosted (PGLite zero-config)** | **Hoch** |
| 9 | **MCP-Server (Agent-Integration)** | **Hoch** |
| 10 | **58+ Skills + RESOLVER.md** | **Mittel** |
| 11 | **Schema-Packs** | **Mittel** |
| 12 | **Gesetzes-Corpus (21 Gesetze, versioniert)** | **Mittel** |
| 13 | **Tausende Tests + BrainBench/LongMemEval** | **Mittel** |
| 14 | **Modell-Agnostisch + CLI** | **Mittel** |
| 15 | **Connector-Ingestion (9 Konnektoren)** | **Mittel** |

### 5.3 RAG-Vergleich

| Aspekt | Subsumio | SigmaBrain |
|---|---|---|
| Vector DB | PostgreSQL + pgvector | PostgreSQL + pgvector (oder PGLite) |
| Embedding | gemini-embedding-001 (768-dim) | Konfigurierbar |
| Keyword | PostgreSQL FTS | BM25 + FTS |
| Re-Ranking | BM25 in-memory (55% Gewicht) | RRF (Reciprocal Rank Fusion) |
| Graph-Traversal | **❌ Nicht vorhanden** | **✅ Typed-Edge-Graph** |
| Gap-Analyse | **❌** | **✅** |
| Jurisdiction-Filter | ✅ DE/AT/EU | ✅ DE/AT |
| Chunk-Categories | ✅ 17 Legal-Kategorien | ✅ Type-basiert |
| Caching | ✅ 5-Min TTL | Query-Cache |

**Urteil:** SigmaBrain's RAG ist architektonisch ueberlegen (Graph + RRF + Gap-Analyse). Subsumio's RAG ist solide aber simpler.

---

## 6. WAS KANNEN WIR UEBERNEHMEN?

### 6.1 Direkt uebernehmbar

| Komponente | Wert | Wo in SigmaBrain |
|---|---|---|
| Legal Chat Modes (strategie, subsumtion, gegner, beweislage, fristen, normen) | Sehr hoch | Skills/Think-Prompts |
| Chunk-Kategorien (sachverhalt, rechtsausfuehrung, urteil, etc.) | Hoch | Document-Metadaten |
| Deadline Templates (27 Templates, 7 Jurisdiktionen) | Sehr hoch | skills/deadline-extract/ |
| German BM25 Stop-Words | Mittel | RAG-Engine |
| Cost Calculator (RVG/RATG Formeln) | Hoch | Skill/Service |
| Jurisdiction Filter in RAG | Hoch | search/think |
| Legal Entity Extraction Patterns | Hoch | extract-document.ts |
| Document Quality Scoring | Mittel | Pipeline |

### 6.2 Anpassbar/Portierbar (mit Aufwand)

| Komponente | Wert | Aufwand |
|---|---|---|
| Case Management UI (79 Sections als Referenz) | Sehr hoch | Hoch |
| Deadline Cockpit UI | Hoch | Mittel |
| Evidence Board UI | Mittel | Mittel |
| Norm Search UI | Mittel | Niedrig |
| DSGVO Compliance UI | Mittel | Mittel |
| Kollisionspruefung Business-Logic | Hoch | Mittel |
| Gegner-Intelligence Service-Logik | Hoch | Mittel |
| Document Generator Templates | Hoch | Hoch |

### 6.3 NICHT uebernehmbar

| Komponente | Grund |
|---|---|
| AFFiNE Editor / Blocksuite | Eigenes Format, zu tief verankert |
| Workspace-Engine | Anderes Datenmodell |
| NestJS + Prisma Backend | Komplett andere Architektur |
| Real-time Collaboration (y-octo) | SigmaBrain hat kein Collaborative Editing |
| Electron Desktop App | AFFiNE-Shell |
| Mobile Apps | UniFFI + Capacitor, zu tief verankert |
| Self-Host (Docker) | gbrain serve ist anders |
| Marketing Landing Page (55k Zeilen) | Monolithisch, unbrauchbar |

---

## 7. INTEGRATIONS-STRATEGIE

### 7.1 Option A: SigmaBrain als Backend fuer Subsumio Frontend

```
Subsumio Frontend (AFFiNE + Legal Dashboard)
  -> API Call -> SigmaBrain Engine (gbrain serve)
```

**Moeglich?** Technisch ja, aber:
- Subsumio's Frontend ist tief in AFFiNE's Workspace/Doc-Modell verankert
- SigmaBrain's API (Pages/Chunks/Links/Graph) ist inkompatibel mit Subsumio's Prisma-Schema (LegalCase/LegalDocument/CaseDeadline)
- Mapping-Layer waere riesig und fehleranfaellig
- Subsumio's RAG wuerde komplett ersetzt werden muessen

**Aufwand:** Sehr hoch (3-6 Monate) | **Risiko:** Hoch

### 7.2 Option B: Subsumio-Features auf SigmaBrain portieren (Empfohlen)

```
SigmaBrain Frontend (Next.js Dashboard)
  -> SigmaBrain Engine (BrainEngine + Graph + RAG)
  + Subsumio-Features (portiert: Cases, Deadlines, Evidence, Billing, Compliance)
```

**Was wir portieren:**
1. **Business-Logic** aus Subsumio's Services (nicht die NestJS-Implementation, sondern die Logik)
2. **UI-Komponenten** als Referenz (nicht kopieren, sondern neu bauen)
3. **Prompt-Templates** fuer Legal Chat Modes
4. **Deadline Templates** und Cost Calculator Formeln
5. **Entity Extraction Patterns**

**Was wir NICHT portieren:**
1. AFFiNE Editor/Blocksuite
2. NestJS + Prisma Backend
3. Workspace-Engine
4. y-octo CRDT

**Aufwand:** Mittel (2-3 Monate) | **Risiko:** Niedrig

### 7.3 Option C: Hybride (Coexistenz)

```
Subsumio (Kanzlei-OS fuer Case/Dokumente/Fristen)
  + SigmaBrain (Knowledge-Engine fuer Graph/RAG/Gap-Analyse)
  -> Beide parallel, geteilte Akten via Import/Export
```

**Moeglich?** Ja, aber:
- Daten-Synchronisation ist schwierig
- Zwei Backends zu warten
- Kein einheitliches Erlebnis

**Aufwand:** Hoch (laufend) | **Risiko:** Hoch

---

## 8. EMPFEHLUNG

### Fazit: Subsumio ist NICHT perfekt — aber es hat Features, die SigmaBrain braucht

**Was Subsumio wirklich ist:**
Ein **funktionsreiches Kanzlei-Frontend** auf einer **soliden aber nicht ueberragenden AI-Engine**. Die Staerke liegt im Frontend (79 Sections, vollstaendiges Case Management, Deadline Automation), NICHT im Backend (simpler RAG, kein Graph-Traversal, keine Gap-Analyse).

**Was SigmaBrain wirklich ist:**
Eine **ueberlegene AI-Engine** (Graph + Hybrid-RAG + Gap-Analyse) mit einem **entwicklungsfaehigen Frontend** (Dashboard mit 7 Seiten, noch keine Legal-Features).

**Die goldene Strategie:**

> **SigmaBrain als Engine behalten + Subsumio's Legal-Features portieren = Beste Kombination**

### Konkrete naechste Schritte:

1. **Phase 1 (2 Wochen):** Legal Chat Modes + Chunk-Kategorien als SigmaBrain-Skills
2. **Phase 2 (2 Wochen):** Case-Entity + Case-Seite + Deadline-Timeline
3. **Phase 3 (2 Wochen):** Deadline Templates + Cost Calculator (RVG/RATG)
4. **Phase 4 (2 Wochen):** Kollisionspruefung + Gegner-Intelligence als Skills
5. **Phase 5 (4 Wochen):** Evidence Board + Document Generator (Templates)
6. **Phase 6 (4 Wochen):** DSGVO/GwG Compliance + Client Portal

**Gesamtaufwand:** 14-16 Wochen fuer vollstaendiges Kanzlei-OS auf SigmaBrain

**Das Ergebnis:** Ein Kanzlei-OS, das:
- Das beste Frontend von Subsumio (Case Management, Deadlines, Billing)
- Mit der besten AI-Engine von SigmaBrain (Graph, Hybrid-RAG, Gap-Analyse)
- Als Open Source + Self-Hosted
- Fuer 79 EUR/Monat statt Enterprise-Preisen

---

## Anhang: File-Referenzen

| Datei | Zeilen | Beschreibung |
|---|---|---|
| `packages/backend/server/src/plugins/legal-case/legal-rag.service.ts` | 872 | RAG-Engine (Vector + BM25 + FTS) |
| `packages/frontend/core/src/modules/case-assistant/services/legal-chat.ts` | 3.734 | Legal Chat Frontend |
| `packages/frontend/core/src/modules/case-assistant/services/knowledge-graph.ts` | 370 | Norm-Graph (in-memory) |
| `packages/frontend/core/src/modules/case-assistant/types.ts` | 3.329 | Alle Legal-Types |
| `src/app/[locale]/page.tsx` | 55.029 | Marketing Landing Page |
| `GAP-ANALYSE-KANZLEISOFTWARE.md` | 403 | Feature-Matrix vs. Wettbewerb |
| `PRODUKTIONSAUDIT_SUBSUMIO.md` | 276 | Produktionsreife-Audit |
