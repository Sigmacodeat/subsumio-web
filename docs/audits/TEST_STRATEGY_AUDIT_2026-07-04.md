# Test Strategy Audit & Blueprint — 04.07.2026

## 1. Ist-Zustand: Quantitative Analyse

### Test-Inventory

| Layer                   | Files    | Test Cases | CI Integration             | Status                           |
| ----------------------- | -------- | ---------- | -------------------------- | -------------------------------- |
| Unit Tests (Vitest)     | 235      | ~4.697     | ✅ `test:unit` in `ci.yml` | Überrepräsentiert                |
| Integration Tests       | 1        | 15         | ✅ in `test:unit`          | **Kritisch unterrepräsentiert**  |
| E2E Playwright          | 33 specs | ~200       | ⚠️ Nur a11y-Subset in CI   | Unvollständig in CI              |
| E2E Workflow Simulation | 1        | 42 steps   | ❌ Standalone, nicht in CI | **Orphaned**                     |
| API Route Tests         | 5        | ~20        | ✅ in `test:unit`          | 5 von 283 Routes getestet (1.8%) |
| Server E2E (Tier 1+2)   | 2        | ~50        | ✅ in `e2e.yml`            | OK                               |
| Heavy/Load Tests        | 3        | 3          | ❌ Manuell                 | OK für manuelle Runs             |

### Mock-Usage

| Pattern                    | Files | % aller Tests | Bewertung                                                            |
| -------------------------- | ----- | ------------- | -------------------------------------------------------------------- |
| `vi.mock` (Module-Mocking) | 48    | 20%           | Hoch — testet Implementation, nicht Verhalten                        |
| `globalThis.fetch` mock    | 69    | 29%           | Sehr hoch — testet "wird API gerufen?" nicht "funktioniert Feature?" |
| `vi.mock("@/lib/engine")`  | 13    | 5.5%          | Kritisch — Engine ist Kern des Systems                               |
| In-memory Stores           | ~30   | 12.8%         | OK für Unit Tests                                                    |

### Top-5 meist-gemockte Files

1. `api-handler.test.ts` — 29 `vi.mock` calls
2. `api.test.ts` — 26 `vi.mock` calls
3. `use-mutation.test.ts` — 17 `vi.mock` calls
4. `legal-grounding.test.ts` — 11 `vi.mock` calls
5. `citation-gate.test.ts` — 9 `vi.mock` calls

### Test-Case-Verteilung (Top 10)

| File                                | Test Cases | Problem                                                                 |
| ----------------------------------- | ---------- | ----------------------------------------------------------------------- |
| `legal-chat/actions.test.ts`        | 171        | 171 String-Matching-Tests für `parseIntent` — sollten table-driven sein |
| `legal-deadlines.test.ts`           | 137        | Gut, aber isoliert — keine Pipeline-Integration                         |
| `matter-context.test.ts`            | 126        | Hohe Mock-Dichte                                                        |
| `datev-export.test.ts`              | 120        | Isoliert — kein Export→Import Round-Trip                                |
| `legal-chat/actions-stress.test.ts` | 114        | Stress-Tests für parseIntent — überflüssig wenn table-driven            |
| `extraction-status.test.ts`         | 86         | OK                                                                      |
| `data-classification.test.ts`       | 78         | OK                                                                      |
| `rag-eval.test.ts`                  | 68         | OK                                                                      |
| `portal-token.test.ts`              | 67         | OK                                                                      |
| `regulatory-monitors.test.ts`       | 66         | OK                                                                      |

## 2. Kernprobleme

### P1: Testing Trophy ist invertiert

**Best Practice** (Kent C. Dodds, Guillermo Rauch):

> "Write tests. Not too many. Mostly integration."

**Ist-Zustand**:

- 4.697 Unit Tests, 15 Integration Tests, ~200 E2E Tests
- Verhältnis: 99.6% Unit / 0.3% Integration / 0.1% E2E
- **Sollte sein**: ~40% Unit / 45% Integration / 15% E2E

### P2: API-Endpoint-Tests mit hohem Mock-Aufwand statt Pipeline-Tests

**Beispiel `pipeline-sync.test.ts`**:

- Mockt `fetch` um Engine-API zu simulieren
- Testt: Parse Markdown → Dedup → Materialize
- **Testet NICHT**: Materialized Deadline → Digest → Topbar Notification → Calendar Export
- **Besser**: Pipeline-Integration-Test der alle Stufen durchläuft

**Beispiel `legal-workflows.integration.test.ts`**:

- Testt RVG + Deadlines + AI Detection isoliert
- **Testet NICHT**: Case → Deadline → Cost → Invoice → PDF Export als zusammenhängender Workflow

### P3: E2E Workflow Simulation ist orphaned

`e2e-workflow-simulation.ts` (42 Schritte) ist ein eigenständiges Script:

- Startet eigenen Mock-Engine auf Port 3999
- Läuft nicht in Vitest, nicht in Playwright, nicht in CI
- **Verschenktes Potenzial**: Dies ist der richtige Ansatz, aber nicht integriert

### P4: 283 API Routes, nur 5 getestet (1.8%)

- `src/app/api/` hat 283 Route-Handler
- Nur 5 haben eigene Tests: `health-readiness`, `docusign/callback`, `handler-adoption`, `webhooks-auth`, `billing/webhook`
- **Aber**: Statt jede Route einzeln zu testen → Pipeline-Tests die mehrere Routes in einem Workflow durchlaufen

### P5: Redundante Unit-Test-Patterns

`parseIntent` hat 171 einzelne `test()` Cases für String-Matching:

```ts
test("'hilfe' → help", () => {
  expect(parseIntent("hilfe")).toEqual({ kind: "help" });
});
test("'help' → help", () => {
  expect(parseIntent("help")).toEqual({ kind: "help" });
});
// ... 169 more
```

**Besser**: Table-driven mit `test.each()` → 1 Test-Block, gleiche Coverage, weniger Code

### P6: Keine Contract Tests

`api.ts` (2.158 Zeilen) definiert den Frontend-API-Client.
Keine Tests verifizieren, dass die Client-Methoden-Signaturen zu den tatsächlichen API-Routes passen.
**Risiko**: API-Route ändert Response-Shape → Client bricht ohne Test-Failure.

## 3. Best-Practice-Framework

### Testing Trophy (Kent C. Dodds)

```
        E2E
       /    \
   Integration  ← Schwerpunkt hier
  /            \
 Unit           \
/                 \
Static Analysis    ← TypeScript, ESLint, gitleaks
```

### Prinzipien für Subsumio

1. **Teste Verhalten, nicht Implementation** — Mocke nicht was du nicht besitzt
2. **Teste die Pipeline, nicht nur Endpoints** — Chain mehrere Stagen zusammen
3. **Integration > Unit** — Bevorzuge Integrationstests die mehrere Module verketten
4. **Table-driven > Individual tests** — `test.each()` für ähnliche Test-Cases
5. **Real implementations > Mocks** — Nutze echte Module wo möglich
6. **Mock Engine für Integration** — Nutze `e2e-mock-engine.ts` auch in Vitest

## 4. Blueprint: Neue Test-Architektur

### 4.1 Pipeline Integration Tests (NEU — Hauptschwerpunkt)

**Ziel**: Teste vollständige Workflows die mehrere Module und API-Routes verketten.

#### Pipeline A: Mandantsaufnahme → Case → Deadlines → Digest

```
Intake erstellen → Conflict Check → Case konvertieren →
Document erstellen → AI Deadline Detection → Deadline berechnen →
Vorfrist berechnen → Status klassifizieren → Digest-Eintrag verifizieren
```

#### Pipeline B: Case → Time Tracking → Invoice → RVG → Export

```
Case erstellen → Time Entry hinzufügen → Time Entry als billed marken →
Invoice erstellen → RVG-Kosten berechnen → Invoice PDF generieren →
DATEV-Export generieren → Export validieren
```

#### Pipeline C: Upload → Virus Scan → OCR → Analysis → Graph

```
File validieren → Virus Scan → SHA256 + Duplicate Check →
Extraction (PDF text_layer / JPG OCR) → AI Analysis →
Suggested Deadlines → Suggested Parties → Case Frontmatter Writeback
```

#### Pipeline D: Legal Chat → Routing → RAG → Citation → Grounding

```
User Query → Intent Parsing → Legal Graph Routing →
RAG Retrieval → Citation Gate → Grounding Check →
Response mit Citations → Chat Session Store
```

#### Pipeline E: Pipeline-Sync → Deadline Materialization → Notification

```
deadline_calendar page (markdown table) → Parse → Dedup →
Materialize als legal_deadline → computeVorfrist →
computeDeadlineStatus → Digest Classification → Topbar Notification
```

### 4.2 Consolidated Unit Tests (REFAKTORING)

**Ziel**: Reduziere redundante Unit-Tests durch table-driven patterns.

- `parseIntent` 171 → ~30 table-driven cases
- `actions-stress.test.ts` 114 → entfernen (in table-driven integriert)
- Ähnliche Patterns in anderen Files identifizieren

### 4.3 Contract Tests (NEU)

**Ziel**: Verifiziere dass Frontend-API-Client zu Backend-Routes passt.

- Teste `api.ts` Methoden-Signaturen gegen API-Route-Handler
- Nutze TypeScript-Typ-Checking + Runtime-Validation
- Teste Response-Shapes für kritische Endpoints

### 4.4 E2E Workflow Simulation in CI (INTEGRATION)

**Ziel**: Integriere die 42-Schritt-Workflow-Simulation in CI.

- Konvertiere zu Vitest-Integration-Test (nutzt Mock Engine)
- Oder: Füge als Playwright-Test hinzu
- CI-Job: `workflow-simulation` in `ci.yml`

## 5. Implementierungs-Reihenfolge

1. **Pipeline Integration Tests** — 5 neue Test-Files, je ~100-200 Zeilen
2. **Consolidated Unit Tests** — Refaktoriere `actions.test.ts` + entferne `actions-stress.test.ts`
3. **E2E Workflow in CI** — Konvertiere `e2e-workflow-simulation.ts` zu Vitest
4. **Contract Tests** — Neue Test-Suite für API-Client ↔ API-Route Konsistenz
5. **CI Pipeline Update** — Neue Jobs für Pipeline-Tests + Workflow-Simulation
