# LAB-DACH Gold Task Audit — Implementation Blueprint

## Ziel
Behebung von 4 Audit-Befunden zu Holdout-Security, Future-Timestamps, CH-Draft-Status und CI-Guard.

---

## WP1: Holdout aus dem Repo entfernen

### Ziel
Kein Holdout-Klartext im Repo. SHA-256-Manifest zur Integritätsprüfung. Runner lädt Holdout nur bei `--holdout-path`.

### Dateien
- **NEW**: `server/src/eval/lab-dach/holdout/holdout-manifest.json` — Task-IDs + SHA-256 Hashes (bereits generiert)
- **REPLACE**: `server/src/eval/lab-dach/holdout/gold-tasks-holdout.ts` — Stub: exportiert leeres Array + Manifest-Referenz
- **MODIFY**: `server/src/eval/lab-dach/public-benchmark.ts` — entferne `GOLD_HOLDOUT` Import, füge `loadHoldoutTasks(path)` hinzu, `getAllHoldoutTasks()` returns `[]`
- **MODIFY**: `server/src/eval/lab-dach/e2e-harness.ts` — `holdoutPath` Option
- **MODIFY**: `server/src/eval/lab-dach/cli.ts` — `--holdout-path` CLI Flag

### Manifest-Daten (bereits computed)
```json
{
  "seal_hash": "16951aae957cbd9381eecfe99deda5fe07e29654738b7f6285853580ba18ad11",
  "task_count": 7,
  "tasks": [
    { "id": "gold-holdout-001", "hash": "916c89ad..." },
    { "id": "gold-holdout-002", "hash": "fa853c79..." },
    { "id": "gold-holdout-003", "hash": "5a597d60..." },
    { "id": "gold-holdout-004", "hash": "fd3b93e2..." },
    { "id": "gold-holdout-005", "hash": "3aa96d78..." },
    { "id": "gold-holdout-006", "hash": "9ffa5e85..." },
    { "id": "gold-holdout-007", "hash": "c92bbba1..." }
  ]
}
```

### Stub-File (`gold-tasks-holdout.ts`)
```typescript
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Task } from "../types.ts";

export const GOLD_HOLDOUT: Task[] = [];

export const HOLDOUT_MANIFEST_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "holdout-manifest.json"
);

export function loadHoldoutManifest(): HoldoutManifest {
  return JSON.parse(readFileSync(HOLDOUT_MANIFEST_PATH, "utf-8"));
}

export interface HoldoutManifest {
  generated_at: string;
  task_count: number;
  seal_hash: string;
  tasks: Array<{ id: string; title: string; jurisdiction: string; legal_area: string; hash: string }>;
}

export function loadHoldoutTasks(path: string): Task[] {
  const mod = require(path);
  return mod.GOLD_HOLDOUT ?? [];
}
```

### `public-benchmark.ts` Änderungen
- Remove `import { GOLD_HOLDOUT } from "./holdout/gold-tasks-holdout.ts"`
- Import from stub instead: `import { GOLD_HOLDOUT, loadHoldoutTasks, loadHoldoutManifest, type HoldoutManifest } from "./holdout/gold-tasks-holdout.ts"`
- `getAllHoldoutTasks()` returns `GOLD_HOLDOUT` (empty by default)
- Add `loadHoldoutTasksFromPath(path: string): Task[]` that loads external file + verifies against manifest

### `e2e-harness.ts` Änderungen
- Add `holdoutPath?: string` to `runE2E` opts
- If `holdoutPath` provided, load holdout tasks from that path and append to task list

### `cli.ts` Änderungen
- Add `--holdout-path <path>` CLI argument
- Pass to `runE2E` opts

---

## WP2: CI-Guard Test

### Ziel
Test failt, wenn Task-Inhalte mit `split: "holdout"` im Repo-Baum liegen.

### Dateien
- **MODIFY**: `server/src/eval/lab-dach/gold-tasks.test.ts` — neuer Test-Block

### Test-Logik
```typescript
describe("CI-Guard: No holdout cleartext in repo", () => {
  it("no .ts file in lab-dach/ should contain holdout task prompts or reference outputs", () => {
    // Scan all .ts files in server/src/eval/lab-dach/ recursively
    // For each file, check if it contains both `split: "holdout"` AND
    // a `prompt:` field with substantial content (>100 chars)
    // The stub file (gold-tasks-holdout.ts) is exempted — it exports empty array
    // Fail if any violation found
  });

  it("holdout manifest should have 7 entries with valid SHA-256 hashes", () => {
    // Load holdout-manifest.json
    // Verify 7 entries, each with 64-char hex hash
    // Verify seal_hash is 64-char hex
  });
});
```

---

## WP3: Zukunfts-Zeitstempel bereinigen

### Ziel
Alle `reviewed_at` mit Zukunftswert → `null`, `review_status` → `"draft"`.

### Betroffene Dateien (alle haben `reviewed_at: "2026-07-15T10:00:00Z"`)
1. `gold-tasks-de-litigation.ts` — `REVIEWER.reviewed_at` + alle `review_status: "approved"` → `"draft"`
2. `gold-tasks-de-criminal.ts` — `R.reviewed_at` + alle `review_status: "approved"` → `"draft"`
3. `gold-tasks-at-litigation.ts` — `R.reviewed_at` + alle `review_status: "approved"` → `"draft"`
4. `gold-tasks-ch.ts` — `REVIEWER.reviewed_at` + alle `review_status: "approved"` → `"draft"`
5. `holdout/gold-tasks-holdout.ts` — wird durch Stub ersetzt (keine Timestamps mehr)

### Type-Änderung
- `ReviewerInfo.reviewed_at`: `string` → `string | null`

### `validateGoldTask` Änderung
- Wenn `review_status === "draft"`: `reviewer.reviewed_at` darf `null` sein
- Wenn `review_status === "approved"`: `reviewer.reviewed_at` muss gesetzt sein
- `review_status` darf `"draft"` oder `"approved"` sein (nicht mehr nur `"approved"`)

### Pro Datei
- Reviewer-Objekt: `reviewed_at: "2026-07-15T10:00:00Z"` → `reviewed_at: null`
- Alle Task-Objekte: `review_status: "approved"` → `review_status: "draft"`
- `reviewed_by` Feld entfernen (wird durch `review_status: "draft"` impliziert)
- `as_of_date` bleibt unverändert (keine Provenienz, sondern Stichtag)

---

## WP4: CH-Goldtasks als Draft in Reports

### Ziel
CH-Tasks in jeder Report-/Publikationsfläche als Draft ausweisen, aus Aggregat-Metriken ausschließen.

### Dateien
- **MODIFY**: `server/src/eval/lab-dach/scoring.ts` — `computeAggregateScore`: CH-Tasks aus Aggregaten ausschließen
- **MODIFY**: `server/src/eval/lab-dach/report.ts` — CH-Tasks als Draft markieren
- **MODIFY**: `server/src/eval/lab-dach/public-benchmark.ts` — `generateMarkdownReport`: CH-Draft-Warning

### `scoring.ts` Änderungen
- `computeAggregateScore`: Filter `task.jurisdiction !== "CH"` für Haupt-Aggregate
- Separate `draft_tasks` Sektion: CH-Tasks werden gelistet aber nicht in `total_tasks`, `all_pass_count` etc. gezählt
- `by_jurisdiction`: CH wird separat als `(draft)` markiert
- Neues Feld: `excluded_draft_count: number` und `excluded_draft_tasks: string[]`

### `report.ts` Änderungen
- `generateFullReport`: Zusätzlicher Header "⚠️ CH tasks excluded from aggregate metrics (draft status)"
- Per-Task Sektion: `[DRAFT]` Marker für CH-Tasks

### `public-benchmark.ts` Änderungen
- `generateMarkdownReport`: Warning falls CH-Tasks in Results enthalten
- `AggregateMetricsExport`: `excluded_draft_tasks` Feld

---

## WP5: Tests aktualisieren

### Dateien
- **MODIFY**: `server/src/eval/lab-dach/gold-tasks.test.ts`

### Änderungen
1. `validateGoldTask` Tests: erlaube `review_status: "draft"` mit `reviewed_at: null`
2. "every gold task should have review_status 'approved'" → `"draft"` (oder split: DE/AT="draft", CH="draft")
3. "every gold task should have reviewer metadata" → `reviewed_at` darf `null` sein für draft
4. Holdout-Tests: `GOLD_HOLDOUT.length` → `0` (Stub), Manifest-Tests stattdessen
5. "every holdout task should have review_status 'approved'" → entfernen (kein Holdout im Repo)
6. "every holdout task should have as_of_date..." → entfernen
7. "should have 2 CH holdout tasks" → entfernen
8. "all task IDs across dev/test + holdout should be unique" → nur dev/test
9. Neue CI-Guard Tests (siehe WP2)
10. Neue Manifest Tests

---

## WP6: Verifikation

- `bun x tsc --noEmit` — 0 errors
- `bun test server/src/eval/lab-dach/gold-tasks.test.ts` — alle Tests grün
- `bun test server/src/eval/lab-dach/` — alle Tests grün
- Manueller Check: `grep -r 'split.*holdout' server/src/eval/lab-dach/*.ts` findet nur Stub

---

## Definition of Done
- [x] Kein Holdout-Klartext im Repo
- [x] CI-Guard aktiv (Test failt bei Holdout-Klartext)
- [x] Keine Zukunfts-Provenienz (reviewed_at=null, status=draft)
- [x] CH überall als draft markiert und aus Aggregat-Metriken ausgeschlossen
- [x] typecheck + Tests grün
