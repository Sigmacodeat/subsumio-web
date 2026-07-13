---
description: LAB-DACH v2 independent evaluation system (T2.1)
---

# LAB-DACH v2 — Blueprint

## 1. Ziel

`server/src/eval/lab-dach/` als vollständig unabhängiges Evaluationssystem für DACH-Legal-LLMs.
Kein Qualitätsclaim ohne Abschluss des Pilot-Holdouts.

## 2. Kern-Userflows / Akzeptanz T2.1

- **Demo-Task** läuft vollständig offline gegen definierte Tools.
- **Task-Isolation**: Sandbox kann keine fremden Dateien/Secrets lesen und keinen freien Netzwerkzugriff nutzen.
- **Reproduzierbarkeit**: Jeder Run erzeugt einen Receipt mit Hashes für Prompt, Corpus, Tools, Outputs.

## 3. Module (müssen existieren)

- `types.ts` + `validator.ts`: Task-Schema, Kriterien, Validation.
- `sandbox.ts`: Task-Isolation (separates `documents/` + `output/`, Path-Traversal-Schutz, Runtime-Limit).
- `agent-tools.ts`: Definierte Offline-Tools (`search_law`, `read_law`, `read_document`, `write_deliverable`, `list_laws`, `calculate_frist`). Kein Bash, kein Netzwerk.
- `automated-checks.ts`: Deterministische Kriterien (citation_grounded_v2, law_valid, language_german, min_citations, jurisdiction_correct, substantiated_uncertainty, source_provenance).
- `rubric-judge.ts`: Cross-Family LLM-Judge-Adapter mit 5-Strategy JSON-Parser.
- `workflows.ts`: Drei Workflows (Rechtsfrage-Memorandum, Gerichtsakt-Fristen, Schriftsatzentwurf) + Criteria-Evaluation.
- `harness.ts`: Orchestrering Validierung → Sandbox → Workflow → Receipts → Report.
- `scoring.ts`: Aggregate Scoring, Cohen's Kappa, False-Rate, Kosten/Latenz.
- `receipt.ts`: Receipt-Building, SHA-256-Hashes, Persist/Load, Reproduktionscheck.
- `report.ts`: Markdown/JSON-Report aus Aggregate Score.
- `cli.ts`: CLI-Einstiegspunkt für `bun run` (`--mock`, `--task`, `--output`, `--corpus`).
- `sample-tasks.ts` + fixtures.

## 4. Architektur-Entscheidungen

- **Fail-closed**: Hohe Guardrail-Severity blockiert den Workflow.
- **Offline-Default**: Search-Fn = file-based Corpus-Suche; Frist-Fn = `frist-engine` ohne DB/Netzwerk.
- **Reproduzierbarkeit**: Receipt enthält `prompt_hash`, `corpus_hash`, `tool_versions`, `output_hash`, `model_id`, `provider`.
- **Isolation**: Sandbox-Pfade via `resolve(normalize(...))` validiert; nur `documents/` (read-only) + `output/` (write) zugänglich; `getSandboxEnv` gibt keine API-Keys zurück.

## 5. Edge-Cases

- Leerer Output / keine Citations → FAIL mit sauberer Begründung.
- Path-Traversal (`../etc/passwd`) → Exception.
- Runtime-Limit → Exception bei `writeDeliverable`.
- Judge-JSON unparseable → `passed: false`, confidence 0.
- `CH` als Jurisdiction nicht unterstützt → Validation-Error.

## 6. Definition of Done

- [ ] `npx tsc -p server/tsconfig.json` zeigt **keine** `lab-dach`-Fehler.
- [ ] `bun run server/src/eval/lab-dach/cli.ts --mock` führt einen Demo-Task durch und erzeugt Receipt + Report.
- [ ] `bun test` für `server/src/eval/lab-dach/*.test.ts` läuft.
- [ ] Sandbox-Test beweist: Fremde Dateien und API-Keys sind nicht lesbar.
- [ ] Reproduktion via gespeichertem Receipt ist möglich.
