# SigmaBrain Legal Engine — Agenten & Analyse-Backend Blueprint

> **Stand:** 12. Juni 2026
> **Fokus:** Backend / Agenten / Analyse — KEIN AFFiNE, KEIN Editor, KEIN Document-Generator
> **Ziel:** Das "perfekte Gehirn" fuer Kanzleien — SigmaBrain als ueberlegene AI-Engine

---

## 1. PHILOSOPHIE: Was ist ein "perfektes Gehirn" fuer eine Kanzlei?

Nicht eine Software, die alles macht. Sondern eine **intelligente Engine**, die:
1. **Akten versteht** (nicht nur speichert)
2. **Fristen findet** (nicht nur berechnet)
3. **Gegner analysiert** (aus oeffentlichen Quellen)
4. **Widersprueche erkennt** (Gap-Analyse)
5. **Argumente vorschlaegt** (strategie, subsumtion)
6. **Mit bestehender Software** kommuniziert (API, Export, Konnektoren)
7. **Ueber Jahre lernt** (Compounding Brain)

**Der Fokus ist auf der Engine, nicht auf dem Frontend.** Das Frontend ist nur ein Interface — leicht austauschbar, leicht programmierbar.

---

## 2. WAS SUBSUMIO WIRKLICH GUT KANN (und wir brauchen)

Subsumio hat **87 Backend-Services**. Die wichtigsten fuer ein "perfektes Gehirn":

### 2.1 Agenten-Skills (Was das Gehirn DENKT)

| # | Skill | Subsumio-Service | SigmaBrain-Status | Prioritaet |
|---|---|---|---|---|
| 1 | **Legal Chat (strategie)** | LegalChatService | 🟡 (generisch) | **KRITISCH** |
| 2 | **Legal Chat (subsumtion)** | LegalChatService | 🟡 (generisch) | **KRITISCH** |
| 3 | **Gegner-Analyse** | GegnerIntelligenceService | ❌ Nicht vorhanden | **KRITISCH** |
| 4 | **Widerspruchs-Erkennung** | ContradictionDetectorService | ❌ Nicht vorhanden | **KRITISCH** |
| 5 | **Beweislage-Analyse** | EvidenceRegisterService | ❌ Nicht vorhanden | **Hoch** |
| 6 | **Kollisionspruefung** | KollisionsPruefungService | ❌ Nicht vorhanden | **Hoch** |
| 7 | **Norm-Klassifikation** | NormClassificationService | 🟡 (statute-lookup) | **Hoch** |
| 8 | **Fristen-Extraktion** | DeadlineAutomationService | ✅ (deadline-extract) | ✅ Done |
| 9 | **Entity-Extraktion** | LegalEntityExtractionService | 🟡 (generisch) | **Hoch** |
| 10 | **Dokument-Klassifikation** | LegalDocumentClassifierService | ❌ Nicht vorhanden | **Hoch** |
| 11 | **Collective Intelligence** | CollectiveIntelligenceService | ❌ Nicht vorhanden | **Mittel** |
| 12 | **Gutachten-Analyse** | GutachtenAnalyseService | ❌ Nicht vorhanden | **Mittel** |

### 2.2 Analyse-Services (Was das Gehirn BERECHNET)

| # | Service | Subsumio | SigmaBrain | Prioritaet |
|---|---|---|---|---|
| 1 | **Case-Analyse** (Findings, Issues, Actors, Tasks) | ✅ (LegalCaseAnalysisData) | ❌ Nicht vorhanden | **KRITISCH** |
| 2 | **Streitwert-Berechnung** | ✅ | ❌ Nicht vorhanden | **Hoch** |
| 3 | **Cost Calculator** (RVG/RATG) | ✅ | ❌ Nicht vorhanden | **Hoch** |
| 4 | **Fristen-Validierung** | ✅ (4-Augen) | ❌ Nicht vorhanden | **Mittel** |
| 5 | **Verfahrensstand-Tracking** | ✅ | ❌ Nicht vorhanden | **Mittel** |
| 6 | **Anwalts-Tagesjournal** | ✅ | ❌ Nicht vorhanden | **Mittel** |

### 2.3 Konnektoren (Was das Gehirn EINLIEST)

| # | Konnektor | Subsumio | SigmaBrain | Prioritaet |
|---|---|---|---|---|
| 1 | **beA** (elektronischer Rechtsverkehr DE) | 🟡 | ❌ Nicht vorhanden | **KRITISCH** |
| 2 | **Rechtsprechung** (RIS, openlegaldata) | ❌ (kein Backend) | 🟡 (generisch) | **KRITISCH** |
| 3 | **Kalender** (Google/Outlook) | ✅ | ✅ (calendar konnektor) | ✅ Done |
| 4 | **DATEV** | 🟡 | ❌ Nicht vorhanden | **Mittel** |
| 5 | **DMS** (iManage, NetDocuments) | ❌ | ❌ Nicht vorhanden | **Mittel** |

---

## 3. ENGINE-ARCHITEKTUR: SigmaBrain als "perfektes Gehirn"

### 3.1 Der Unterschied: Subsumio vs. SigmaBrain Engine

```
Subsumio (AFFiNE + NestJS + Prisma + pgvector):
  Frontend (AFFiNE Editor, 79 Sections)
    -> NestJS API
      -> Prisma ORM
        -> PostgreSQL (Cases, Documents, Deadlines)
        -> pgvector (Embeddings)
        -> BM25 in-memory (Re-Ranking)
        -> FTS (Fallback)

SigmaBrain (Bun + BrainEngine + PGLite/Postgres):
  Frontend (Next.js Dashboard) [leicht, austauschbar]
    -> gbrain serve (REST API)
      -> BrainEngine
        -> PGLite / PostgreSQL (Pages, Chunks, Links)
        -> pgvector (Embeddings)
        -> BM25 + Graph-Traversal + RRF (Hybrid-RAG)
        -> Typed-Edge Graph (persistent, selbstverdrahtend)
        -> Gap-Analyse
        -> Dream Cycle (24/7 Autopilot)
```

**SigmaBrain's Engine ist architektonisch ueberlegen.** Was fehlt sind die **Legal-Skills** und **Analyse-Services**.

### 3.2 Skill-Architektur fuer Legal-Engine

```
skills/
├── legal/
│   ├── think-legal/              # Erweiterung von think fuer Legal
│   ├── deadline-extract/         # Fristen aus Dokumenten (bereits gebaut)
│   ├── case-analyse/             # Case-Analyse (Findings, Issues, Actors)
│   ├── gegner-intelligence/      # Gegner-Analyse (oeffentliche Quellen)
│   ├── contradiction-detector/     # Widerspruchs-Erkennung
│   ├── evidence-analysis/        # Beweislage-Analyse
│   ├── kollisions-pruefung/      # Interessenkonflikt-Pruefung
│   ├── norm-classification/      # Norm-Klassifikation
│   ├── document-classifier/      # Dokument-Klassifikation
│   ├── cost-calculator/          # RVG/RATG Berechnung
│   ├── collective-intelligence/  # Kanzlei-Wissen aggregation
│   ├── opposing-party-research/  # Gegner-Recherche
│   └── audit-export/             # Kanzlei-Audit
├── connectors/
│   ├── bea/                      # beA Import (DE)
│   ├── ris-ogd/                  # Oesterreichische Rechtsprechung
│   ├── openlegaldata/            # Deutsche Rechtsprechung
│   ├── datev/                    # DATEV Export/Import
│   └── court-calendar/           # Gerichtstermine
└── RESOLVER.md                   # Routing-Tabelle
```

---

## 4. PRIORISIERTER ARBEITSPLAN: Backend-first

### 4.1 Phase 1: Legal Chat Engine (2 Wochen)

**Ziel:** Die 6 Legal Chat Modes als SigmaBrain-Skills implementieren

```typescript
// skills/legal/think-legal/
// Erweiterung von think fuer Legal-Modi

interface LegalThinkMode {
  mode: 'strategie' | 'subsumtion' | 'gegner' | 'beweislage' | 'fristen' | 'normen';
  caseSlug?: string;           // Akten-Kontext
  jurisdiction: 'de' | 'at' | 'eu';
  query: string;
}

// Strategie-Modus: Rechtsstrategie, Argumentation, Prozesskalkuel
// Subsumtion-Modus: Sachverhalt analysieren, Tatbestand pruefen
// Gegner-Modus: Gegner-Analyse (aus eigenen Faellen + oeffentlichen Quellen)
// Beweislage-Modus: Beweismittel bewerten, Luecken finden
// Fristen-Modus: Fristen-Check, Termin-Management
// Normen-Modus: Gesetzesauslegung, Zitate mit Kontext
```

**Deliverables:**
- [ ] `skills/legal/think-legal/` — 6 Prompt-Templates
- [ ] Integration mit Hybrid-RAG (Akten + Gesetze + Graph)
- [ ] Chunk-Kategorien (sachverhalt, rechtsausfuehrung, urteil, beweis, etc.)
- [ ] Jurisdiction-Filter in Search

### 4.2 Phase 2: Case-Analyse Engine (2 Wochen)

**Ziel:** Automatische Analyse von Akten bei Upload/Update

```typescript
// skills/legal/case-analyse/

interface CaseAnalysis {
  findings: Array<{
    id: string;
    category: 'rechtlich' | 'faktisch' | 'prozessual' | 'finanziell';
    description: string;
    confidence: number;
    sourceDocuments: string[];  // Verweise auf Chunk-IDs
    status: 'open' | 'verified' | 'rejected';
  }>;
  
  issues: Array<{
    id: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    suggestedAction: string;
    deadline?: string;  // Falls handlungsbeduerftig
  }>;
  
  actors: Array<{
    name: string;
    role: 'client' | 'opposing_party' | 'judge' | 'witness' | 'expert';
    entityType: 'person' | 'organization';
    mentions: Array<{ document: string; context: string }>;
  }>;
  
  tasks: Array<{
    id: string;
    description: string;
    priority: 'urgent' | 'high' | 'medium' | 'low';
    assignedTo?: string;  // Anwalt
    deadline?: string;
    status: 'open' | 'in_progress' | 'done';
    sourceDocument?: string;
  }>;
  
  memoryEvents: Array<{
    date: string;
    type: 'frist' | 'termin' | 'schrift' | 'urteil' | 'korrespondenz';
    description: string;
    sourceDocument: string;
  }>;
}
```

**Deliverables:**
- [ ] `skills/legal/case-analyse/` — Prompt + Parser
- [ ] Case-Entity im Graph (LegalCase als Page-Type)
- [ ] Automatic case analysis on document ingest
- [ ] Findings/Issues/Tasks in Page frontmatter speichern

### 4.3 Phase 3: Agenten-Skills (4 Wochen)

**Ziel:** Die 6 wichtigsten Agenten-Skills bauen

```
Woche 1: Gegner-Analyse + Widerspruchs-Erkennung
Woche 2: Beweislage-Analyse + Kollisionspruefung
Woche 3: Norm-Klassifikation + Dokument-Klassifikation
Woche 4: Collective Intelligence + Audit-Export
```

**Jeder Skill:**
- Prompt-Template (system + user)
- Input-Schema (Zod)
- Output-Parser (strukturierte JSON)
- Graph-Integration (Links erzeugen)
- Test-Fixtures

### 4.4 Phase 4: Konnektoren (2 Wochen)

**Ziel:** beA + Rechtsprechung + DATEV

```
Woche 1: beA Import (XML-Parser fuer elektronische Nachrichten)
Woche 2: Rechtsprechungs-Konnektor (RIS-OGD + openlegaldata)
```

### 4.5 Phase 5: Cost Calculator + Streitwert (1 Woche)

**Ziel:** RVG/RATG Berechnung als Skill

```typescript
// skills/legal/cost-calculator/
// RVG-Berechnung (Deutschland) + RATG-Berechnung (Oesterreich)
// Keine Rechtsberatung — nur Kalkulation
```

---

## 5. DASHBOARD — Minimal, funktional, austauschbar

> **Nur was noetig ist.** Kein AFFiNE, kein Editor, kein Document-Generator.

### 5.1 Neue Seiten (Next.js, einfach, schnell)

```
/dashboard/cases              -- Akten-Liste (Tabelle, Filter)
/dashboard/cases/{slug}       -- Akte-Detail (Tabs: Uebersicht, Dokumente, Fristen, Graph)
/dashboard/deadlines          -- Fristen-Timeline (Alle Faellen)
/dashboard/analyse/{slug}     -- Case-Analyse (Findings, Issues, Tasks)
/dashboard/gegner/{slug}      -- Gegner-Analyse
/dashboard/evidence           -- Beweismittel (optional)
```

### 5.2 Case-Detail (Tab-basiert, simpel)

```
Tab "Uebersicht":
  - Meta-Daten (Mandant, Gegner, Gericht, Streitwert)
  - Quick Actions (Upload, Query, Analyse)
  - Aktuelle Findings (AI-generiert, verifizierbar)
  - Naechste Fristen

Tab "Dokumente":
  - Liste aller Dokumente der Akte
  - Filter nach Typ (Schriftsatz, Urteil, Korrespondenz, etc.)
  - Upload-Button

Tab "Fristen":
  - Timeline aller Fristen
  - Warning-Level (gruen/amber/rot)
  - Verifikations-Status (AI extrahiert -> Anwalt verifiziert)

Tab "Graph":
  - Verknuepfte Entitaeten (Mandant, Gegner, Gericht, Normen)
  - Navigation zu verbundenen Akten
```

---

## 6. EMPFEHLUNG

### Was JETZT gebaut werden muss (Reihenfolge)

| # | Was | Warum | Aufwand |
|---|---|---|---|
| 1 | **Legal Chat Modes** (strategie, subsumtion, gegner, beweislage, fristen, normen) | Das ist der Kern — wie das Gehirn denkt | 2 Wochen |
| 2 | **Case-Analyse Engine** (Findings, Issues, Tasks, Actors) | Automatische Intelligenz bei Upload | 2 Wochen |
| 3 | **Gegner-Analyse Skill** | Wettbewerbsdifferenzierung | 1 Woche |
| 4 | **Widerspruchs-Erkennung** | Gap-Analyse fuer Akten | 1 Woche |
| 5 | **beA-Konnektor** | Pflicht fuer DE-Anwaelte | 1 Woche |
| 6 | **Rechtsprechungs-Konnektor** | RIS + openlegaldata | 1 Woche |
| 7 | **Cost Calculator** (RVG/RATG) | Praktischer Mehrwert | 1 Woche |
| 8 | **Kollisionspruefung** | Compliance, Pflicht | 1 Woche |

**Gesamt: 10 Wochen** fuer das "perfekte Gehirn" (Backend + Agenten + Skills)

**DANACH:** Frontend-Seiten bauen (2 Wochen, leicht)

### Was NICHT gebaut werden muss (jetzt)

- ❌ AFFiNE Editor / Blocksuite
- ❌ Document-Generator (Schriftsatz-Templates)
- ❌ Real-time Collaboration (y-octo)
- ❌ Electron Desktop App
- ❌ Mobile Apps
- ❌ Client Portal (Phase 2)
- ❌ DMS-Integration (Phase 2)

---

## 7. ZUSAMMENFASSUNG

| Frage | Antwort |
|---|---|
| Brauchen wir AFFiNE? | **Nein.** Document-Editing ist leicht programmierbar |
| Brauchen wir Subsumio's Frontend? | **Nein.** Frontend ist austauschbar |
| Was brauchen wir von Subsumio? | **Agenten-Logik + Skills + Prompts** |
| Was ist SigmaBrain's Staerke? | **Engine (Graph, Hybrid-RAG, Gap-Analyse)** |
| Was ist der Fokus? | **Backend -> Agenten -> Skills -> dann Frontend** |
| Wie lange? | **10 Wochen** fuer das Gehirn, **2 Wochen** fuer das Frontend |

**Der Plan:**
1. Heute: Legal Chat Modes als Skills starten
2. +2 Wochen: Case-Analyse Engine
3. +4 Wochen: Alle Agenten-Skills
4. +6 Wochen: Konnektoren (beA, Rechtsprechung)
5. +8 Wochen: Cost Calculator + Kollisionspruefung
6. +10 Wochen: Frontend-Seiten

Soll ich mit **Phase 1 (Legal Chat Modes)** beginnen?
