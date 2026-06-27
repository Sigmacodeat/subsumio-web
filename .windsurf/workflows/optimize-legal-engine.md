---
description: Optimiere Legal Domain Engine (Fristen, RVG, Recherche, Drafting, Compliance)
---

# Legal Domain Engine Optimization

## Scope

- `src/lib/legal-deadlines.ts` (13.8KB) — Fristberechnung (ZPO § 233, BGB, VwGO)
- `src/lib/legal-types.ts` (6.5KB) — Legal Type Definitions
- `src/lib/ai-deadline-detect.ts` (7.2KB) — AI Fristerkennung aus Dokumenten
- `src/lib/rvg.ts` (2.7KB) — RVG Kostenberechnung
- `src/lib/ai-act.ts` — AI Act Compliance
- `src/lib/groundedness.ts` (2.3KB) — Groundedness Check für AI-Responses
- `src/lib/rag-eval.ts` (9.2KB) — RAG Evaluation
- `src/app/api/legal/` (16 Routes) — Legal API Endpoints
- `src/app/dashboard/drafting/` — Schriftsatz-Drafting
- `src/app/dashboard/cost-calculator/` — Kostenrechner
- `src/app/dashboard/research/` — Legal Research
- `src/app/dashboard/rechtsprechung/` — Rechtsprechung
- `src/app/dashboard/norms/` — Normen
- `src/app/dashboard/kollisionspruefung/` — Kollisionsprüfung
- `src/app/dashboard/deadlines/` — Fristen
- `src/app/dashboard/tabular-review/` — Massen-Review
- `src/app/dashboard/rag-eval/` — RAG-Eval
- `src/components/legal/` (4 Module) — Legal UI Komponenten
- `law-corpus/` — Gesetzestexte (AT, CH, DE)
- `server/src/core/legal/` (13 Module) — Server-side Legal Engine

## Kontext laden

1. Lese `src/lib/legal-deadlines.ts` für Fristberechnung-Logik
2. Lese `src/lib/legal-types.ts` für Type Definitions
3. Lese `src/lib/rvg.ts` für RVG Kostenberechnung
4. Lese `src/lib/ai-deadline-detect.ts` für AI Fristerkennung
5. Lese `law-corpus/` für verfügbare Gesetzestexte
6. Lese `server/src/core/legal/` für Server-side Legal Engine
7. Lese `src/lib/groundedness.ts` für AI Response Validation
8. Lese `src/lib/rag-eval.ts` für RAG Evaluation

## Optimierungs-Checkliste

- [ ] **Fristberechnung**: ZPO § 233 (Notfristen), BGB §§ 187-193, VwGO § 60
- [ ] **Feiertage**: Bundesland-spezifische Feiertagskalender
- [ ] **Fristarten**: Notfrist, Einspruchsfrist, Berufungsfrist, Wiedereinsetzungsfrist
- [ ] **RVG**: RVG § 3 (Wert des Gegenstands), § 13 (Kosten), Anlage 1+2+3
- [ ] **AI Fristerkennung**: Confidence Score, Human Review für Low-Confidence
- [ ] **Legal Research**: Hybrid Search (Vector + Keyword), Gesetzestexte + Urteile
- [ ] **Drafting**: Template-basiert, Variable Substitution, Citation Insertion
- [ ] **Kollisionsprüfung**: Mandant vs. Gegner, Historische Mandate
- [ ] **Groundedness**: AI-Responses gegen Quellen validiert, Citation-Check
- [ ] **RAG Eval**: Precision@k, Recall@k, nDCG@k, Citation Accuracy

## Test-Befehle

```bash
# Legal Logic Tests
npx vitest run src/lib/legal-deadlines.test.ts
npx vitest run src/lib/rvg.test.ts

# RAG Eval
npx vitest run src/lib/rag-eval.test.ts

# AI Deadline Detection
npx vitest run src/lib/ai-deadline-detect.test.ts
```

## Gesetzestexte (law-corpus/)

- **AT** (Österreich): ABGB, AHG, AktG, BAO, BGB (österreichische Version), etc. (18 Dateien)
- **CH** (Schweiz): OR, StGB, ZGB (3 Dateien)
- **DE** (Deutschland): AO, BGB, EstG, etc. (10+ Dateien)
