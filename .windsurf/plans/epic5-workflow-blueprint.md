# EPIC 5 — Legal Workflow Evaluation & Pipeline Modularization

## Blueprint v1.0 — 14.07.2026

---

## 1) Ziel des Systems (User-Sicht)

Drei eigenständige, evaluierte Legal-Workflows ersetzen den monolithischen Mega-Pipeline-Ansatz:

| Workflow                                       | Input                               | Output                                                            | DoD                                                                                                                              |
| ---------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **A: Rechtsfrage → Kurzmemorandum**            | Freie Rechtsfrage + Jurisdiktion    | Strukturiertes Memo mit Quellen, Gegenansicht, Claim-Verification | Jede wesentliche Aussage hat Quelle; fehlende Fakten & Gegenargumente sichtbar; keine Freigabe ohne vollständige Verifikation    |
| **B: Gerichtsakt → Fristen- und Risikoreport** | Gerichtsakt (PDF/DOCX)              | Fristenreport + Risikoreport                                      | Startdatum, Fristregel, Kalender, Hemmung/Unterbrechung, Unsicherheit separat nachvollziehbar; Anwalt bestätigt kritische Inputs |
| **C: Schriftsatzentwurf**                      | Bestätigte Fakten/Issues + Template | DOCX mit Quellen, Gegenargumenten, Verification Receipt           | Keine ungeprüften Behauptungen im DOCX; Quellen klickbar; Verification Receipt eingebettet/exportiert                            |

Zusätzlich: **T5.4 Modularisierung** der bestehenden 27-Layer Mega-Pipeline in aktivierbare Layer via Workflow-Definitionen + Feature Flags.

---

## 2) Kern-Userflows

### Workflow A — Rechtsfrage → Kurzmemorandum

1. **Intake**: User stellt Rechtsfrage (freitext), wählt Jurisdiktion (AT/DE/CH)
2. **Jurisdiction/Date**: System bestimmt anwendbares Recht + Stand der Rechtsprechung
3. **Issues**: System identifiziert rechtliche Teilfragen (Tatbestandsmerkmale)
4. **Research**: Hybrid Search + agentic retrieval loop → relevante §§ + Judikatur
5. **Element Matrix**: pro Tatbestandsmerkmal → erfüllt/nicht erfüllt/unklar + Quelle
6. **Counterview**: Opponent-Simulator generiert Gegenargumente
7. **Memo**: Strukturiertes Memo (Frage → kurze Antwort → ausführliche Begründung → Gegenansicht → offene Punkte)
8. **Claim Verification**: Tier-0 Guardrail + Tier-1 Cross-Verify → jede Aussage hat Quelle
9. **Review**: Anwalt prüft → Freigabe oder Rücklauf

### Workflow B — Gerichtsakt → Fristen- und Risikoreport

1. **Document Inventory**: Akte wird importiert, Dokumente klassifiziert
2. **Parties/Roles**: Parteien und Rollen extrahiert (Kläger/Beklagter/Zeuge)
3. **Chronology**: Ereignis-Chronologie aus Akte erstellt
4. **Service/Events**: Zustellungen und verfahrensrelevante Events identifiziert
5. **Deterministic Deadline Calculation**: Frist-Engine berechnet Fristen (§-basiert, deterministisch)
6. **Risks**: Risiken identifiziert (Verjährung, versäumte Fristen, Beweisnot)
7. **Review**: Anwalt bestätigt kritische Inputs (Startdatum, Zustellungsdatum) → Freigabe

### Workflow C — Schriftsatzentwurf

1. **Confirmed Facts/Issues**: aus Workflow A/B oder manuell bestätigt
2. **Template/Playbook**: jurisdiction-aware Template-Auswahl (Klage, Klagebeantwortung, Berufung, etc.)
3. **Draft**: Legal Drafter generiert Entwurf
4. **Source Insertion**: jede Aussage gets §-Quelle zugewiesen
5. **Counterarguments**: Opponent-Simulator → Gegenargumente → Rebuttal
6. **Claim Verification**: Guardrail + Cross-Verify → keine ungeprüften Behauptungen
7. **Lawyer Review**: Anwalt prüft und freigibt
8. **DOCX Export**: Export mit klickbaren Quellen + eingebettetem Verification Receipt

---

## 3) Architektur-Entscheidungen

### 3.1 Pipeline Layer Registry (neu)

Statt monolithischem `shouldRunLayer(n)` mit hardcoded Layer-Nummern:

```typescript
interface LayerDeclaration {
  id: string; // e.g. "forensic-analyst"
  layerNumber: number; // 3
  name: string; // "Forensic Analyst"
  specialist: string; // "forensic-analyst"
  inputs: string[]; // ["on_table", "entities", "allTexts"]
  outputs: string[]; // ["forensic_report"]
  sideEffects: string[]; // ["writePage:forensic-reports/{case_slug}"]
  risk: "low" | "medium" | "high";
  timeout: number; // seconds
  failurePolicy: "fail" | "continue" | "retry_once";
  mandatory: boolean; // if true, on_child_fail must NOT be "continue"
  description: string;
}
```

### 3.2 Workflow Definition (neu)

```typescript
interface PipelineWorkflowDef {
  id: "memo" | "fristen_report" | "schriftsatz";
  label: string;
  description: string;
  layers: string[]; // layer IDs to activate
  featureFlag?: string; // optional flag to enable/disable
  approvalGates: string[]; // layer IDs that require human approval before proceeding
}
```

### 3.3 Failure Policy Fix

**Problem**: Alle 24 `on_child_fail: "continue"` in `runSpecialistLayer` und `runMapReduceLayer` sind hardcoded.

**Lösung**:

- `runSpecialistLayer` und `runMapReduceLayer` erhalten `failurePolicy` Parameter
- Mandatory layers → `on_child_fail: "fail"` (pipeline bricht ab)
- Non-mandatory layers → `on_child_fail: "continue"` (wie bisher, aber explizit)
- Layer Registry deklariert `mandatory` pro Layer

### 3.4 Feature Flag Integration

- Jede Workflow-Definition hat optionales `featureFlag`
- `shouldRunLayer` prüft: (a) layer in workflow.layers, (b) feature flag enabled
- Bestehende `rerun_layers` / `resume_from_layer` Logik bleibt kompatibel

---

## 4) Datenmodell

### Neu: `server/src/core/minions/pipeline-registry.ts`

- `LAYER_REGISTRY: Record<string, LayerDeclaration>` — alle 27+ Layer
- `WORKFLOW_DEFS: Record<string, PipelineWorkflowDef>` — 3 Workflows
- `getWorkflowLayers(workflowId): string[]` — aktivierten Layer für Workflow
- `resolveFailurePolicy(layerId): "fail" | "continue"` — mandatory → fail

### Neu: `server/src/core/minions/workflow-handlers/`

- `memo-handler.ts` — Workflow A
- `fristen-report-handler.ts` — Workflow B
- `schriftsatz-handler.ts` — Workflow C

### Modifiziert: `legal-pipeline.ts`

- `shouldRunLayer` erweitert: prüft `workflow_layers` Set
- `runSpecialistLayer` / `runMapReduceLayer`: `failurePolicy` Parameter
- `LegalPipelineData` erweitert: `workflow_id?: string`

---

## 5) Edge-Cases & Fehlerszenarien

- **Keine Jurisdiktion**: Default "at" (bestehend) + Warning
- **Leere Akte**: Workflow B → "no documents" error, kein Silent-Fail
- **Guardrail Hard Block**: Mandatory layer fail → Pipeline status "needs_human_review"
- **Budget exhausted**: Bestehende BudgetExhausted Logik bleibt
- **Feature Flag disabled**: Layer wird skipped, nicht failed
- **Unbekannter Workflow**: Error "unknown workflow_id"
- **Cross-Workflow Dependencies**: Workflow C benötigt Outputs aus A/B → explizite `depends_on` Prüfung

---

## 6) Definition of Done (pro Workflow)

### T5.1 Workflow A (Memo)

- [ ] Jede wesentliche Aussage hat Quelle (§ oder Judikatur)
- [ ] Fehlende Fakten und Gegenargumente sind explicit sichtbar
- [ ] Claim Verification läuft vor Freigabe
- [ ] Keine Freigabe wenn verification_state ≠ VERIFIED or VERIFIED_WITH_WARNINGS
- [ ] Work Product Receipt wird generiert

### T5.2 Workflow B (Fristen-Report)

- [ ] Startdatum, Fristregel, Kalender, Hemmung/Unterbrechung, Unsicherheit separat traceable
- [ ] Deterministic deadline calculation (frist-engine, nicht LLM)
- [ ] Anwalt bestätigt kritische Inputs (approval gate)
- [ ] Work Product Receipt wird generiert

### T5.3 Workflow C (Schriftsatz)

- [ ] Keine ungeprüften Behauptungen im exportierten DOCX
- [ ] Quellen sind klickbar (Hyperlinks im DOCX)
- [ ] Verification Receipt wird eingebettet/exportiert
- [ ] Counter-Arguments sind im Dokument enthalten

### T5.4 Modularisierung

- [ ] 27+ Layer deklarieren inputs, outputs, side effects, risk, timeout, failure policy
- [ ] Nur benötigte Layer pro Workflow werden ausgeführt
- [ ] Kein hidden `on_child_fail: "continue"` für mandatory steps
- [ ] Feature Flags können Layer aktivieren/deaktivieren

---

## 7) Arbeitspakete (Reihenfolge)

1. **AP1**: Pipeline Layer Registry (`pipeline-registry.ts`) — alle 27 Layer deklarieren
2. **AP2**: Workflow Definitions (`WORKFLOW_DEFS`) — 3 Workflows definieren
3. **AP3**: `legal-pipeline.ts` Modifikation — `shouldRunLayer` + `failurePolicy` + `workflow_id`
4. **AP4**: Workflow A Handler (`memo-handler.ts`)
5. **AP5**: Workflow B Handler (`fristen-report-handler.ts`)
6. **AP6**: Workflow C Handler (`schriftsatz-handler.ts`)
7. **AP7**: Tests — Registry, Workflow Defs, Failure Policy, DoD Verification
8. **AP8**: Self-Audit — alle DoD-Kriterien überprüfen
