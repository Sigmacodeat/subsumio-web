# Subsumio Software Repo Audit

Stand: 2026-06-20  
Scope: gesamtes Repository `/Users/msc/subsumio-web`, Todo-/Plan-Inventar,
statischer Repo-Audit und ausgewählte Runtime-Gates. Dieser Audit ist kein
Beweis, dass alle Codepfade vollständig releasefertig sind; Full-E2E über alle
Browser/Projekte und Last-/Staging-Tests bleiben separat offen.

## Antwort auf die Kernfrage

Nein: Es sind nicht alle Todo-Dateien und nicht alle Todo-Punkte perfekt erledigt.

Erledigt ist:

- Der Legal-AI-Hauptplan ist nicht mehr die aktive Statuswahrheit.
- Der Legal-AI-Follow-up-Plan ist archiviert.
- `docs/audits/LEGAL_AI_IMPLEMENTATION_STATUS.md` ist die kanonische Statusdatei.
- `docs/PRODUCT_CAPABILITIES.md` dokumentiert die vorhandenen Produktfähigkeiten.
- `README.md` verlinkt auf Produktfähigkeiten, kanonischen Status und Plan-Review.

Nicht erledigt ist:

- Alle offenen Produktpakete aus dem Legal-AI-Status zu implementieren.
- Alle Engine-/GBrain-Follow-ups aus `TODOS.md` zu schließen.
- Alle offenen Checkboxen in historischen Audit-Prompts, Blueprints und
  Research-Dateien abzuarbeiten.
- Eine vollständige runtime-/E2E-Verifikation aller Features über alle Browser,
  Devices und Projekte.

## Repo-weites Todo-Inventar

Die wichtigsten offenen Checkbox-Quellen:

| Datei                                                         | Offene Checkboxen | Einordnung                                                   |
| ------------------------------------------------------------- | ----------------: | ------------------------------------------------------------ |
| `TODOS.md`                                                    |               291 | Aktive Engine/GBrain-Follow-ups, nicht Subsumio-Produktplan. |
| `docs/audits/BRAIN_ENGINE_AUDIT_PROMPT_2_INTELLIGENCE.md`     |               204 | Audit-Prompt/Checkliste, kein abgeschlossener Produktstatus. |
| `docs/audits/BRAIN_ENGINE_AUDIT_PROMPT_3_SAAS_APPLICATION.md` |               192 | Audit-Prompt/Checkliste.                                     |
| `docs/audits/FULL_COMPETITIVE_AUDIT_PROMPT.md`                |               136 | Competitive-Audit-Prompt.                                    |
| `external-skill-research.md`                                  |                65 | Research-/Ideenliste, kein Lieferumfang.                     |
| `docs/audits/FIX_PROMPT_P0_P1_SAAS_AUDIT.md`                  |                44 | Fix-Prompt/Arbeitsliste.                                     |
| `docs/audits/BRAIN_ENGINE_FULL_AUDIT_PROMPT.md`               |                42 | Audit-Prompt.                                                |
| `docs/audits/FIX_PROMPT_2_P2_SAAS_AUDIT.md`                   |                34 | Fix-Prompt.                                                  |
| `docs/audits/FIX_PROMPT_3_P3_SAAS_AUDIT.md`                   |                28 | Fix-Prompt.                                                  |
| `ENGINE_EXTENSION_BLUEPRINT.md`                               |                26 | Blueprint/Roadmap.                                           |
| `LEGAL_BRAIN_BLUEPRINT.md`                                    |                10 | Legal-Brain-Blueprint mit offenen Abnahmepunkten.            |

Konsequenz: Die Frage "alle Todo-Dateien fertig?" ist klar mit Nein zu
beantworten. Viele Dateien sind bewusst Plan, Prompt, Research oder Blueprint.
Sie sollten nicht als aktive Produkt-Todos behandelt werden, aber sie sind auch
nicht erledigt.

## Aktive vs. historische Dokumente

### Aktiv halten

- `docs/audits/LEGAL_AI_IMPLEMENTATION_STATUS.md`
- `docs/PRODUCT_CAPABILITIES.md`
- `TODOS.md` für Engine/GBrain-Follow-ups
- `README.md`

### Historisch oder sekundär behandeln

- `docs/audits/LEGAL_AI_ACTION_TODO_PLAN_2026-06-20.md`
- `docs/audits/archive/LEGAL_AI_FOLLOWUP_PLAN_2026-06-20.md`
- Root-Auditberichte wie `FULL_SYSTEM_AUDIT_REPORT.md`,
  `SIGMABRAIN_AUDIT_REPORT.md`, `AUDIT_SAAS_LAYER_2026.md`
- Audit-Prompts in `docs/audits/*PROMPT*.md`
- Research-/Blueprint-Dateien wie `external-skill-research.md`,
  `LEGAL_BRAIN_BLUEPRINT.md`, `ENGINE_EXTENSION_BLUEPRINT.md`

Empfehlung: Historische Audit-Prompts und Blueprints nicht löschen, sondern
später mit einem Header `Archiviert / ersetzt durch ...` markieren oder in
einen Archivordner verschieben, sobald ihre relevanten Punkte in aktive Status-
oder Roadmap-Dateien übernommen wurden.

## Produktstatus nach dem Legal-AI-Abgleich

Der kanonische Legal-AI-Status enthält 40 Paketzeilen:

- 16 produktnah / weitgehend verdrahtet.
- 21 teilweise / Verdrahtung fehlt.
- 3 offen / eigener Produktausbau nötig.

Die drei klar offenen Produktpakete:

1. Paket 8: Defensible Bulk Review und Due Diligence.
2. Paket 24: Litigation Analytics und Judge/Docket Intelligence.
3. Paket 25: Real-time Co-Editing und Collaboration Room.

Zusätzlich haben viele "teilweise" Pakete noch harte Nachweise offen: CI-Gates,
E2E-Flows, echte Lasttests, Add-in-Auth, Trust Accounting, Migration-UI,
Notification-Pipeline, Knowledge-Governance und CLM-End-to-End.

## Code-/Marker-Befund

Die Suche nach `TODO`, `FIXME`, `HACK`, `XXX`, `not implemented` und
`nicht gebaut` zeigt weiterhin Marker in `src/` und `server/`.

Häufungen liegen insbesondere in:

- `src/lib/connector-coverage.ts`
- `server/src/core/search/mode.ts`
- `server/src/core/by-mention.ts`
- `server/src/commands/doctor.ts`
- `server/src/commands/connector.ts`
- `server/src/core/cycle/extract-atoms.ts`
- `server/src/core/search/hybrid.ts`
- `server/src/core/postgres-engine.ts`
- `server/src/core/engine.ts`

Nicht jeder Marker ist ein Fehler; viele sind bewusst dokumentierte Follow-ups.
Aber sie beweisen, dass das Repo nicht todo-frei ist.

## Worktree-Befund

Der Worktree enthält viele bestehende Änderungen außerhalb dieser Doku-Arbeit,
vor allem in Dashboard-, Marketing-, UI-, Billing- und Model-Config-Dateien.
Diese Änderungen wurden in diesem Audit nicht zurückgesetzt und nicht bewertet.

Für einen echten Release-Abschluss muss zuerst geklärt werden:

- Welche dieser Änderungen gehören zusammen?
- Welche wurden bereits getestet?
- Welche sind nur Design-/Pricing-/Model-Strategie-Arbeit?
- Welche müssen getrennt reviewed werden?

## Verifikation

Ausgeführt und grün:

- `bun run lint`: bestanden, mit 175 bestehenden Warnungen.
- `bun run typecheck`: bestanden.
- `bun run test:unit`: bestanden, 193 Testdateien / 4672 Assertions.
- `cd server && bun run verify`: bestanden, 30/30 Checks grün.
- Fokussierter Chromium-E2E-Block:
  `bunx playwright test tests/e2e-playwright/api-guard-chain.spec.ts tests/e2e-playwright/billing-flow.spec.ts tests/e2e-playwright/kanzlei-flow.spec.ts tests/e2e-playwright/smoke.spec.ts --project=chromium`:
  35 bestanden, 2 bewusst übersprungen.

Zusätzlich gezielt ausgeführt:

- `bunx vitest run src/lib/offline-store.test.ts`: bestanden.
- `bunx vitest run src/lib/model-config.test.ts`: bestanden.
- `bunx playwright test tests/e2e-playwright/smoke.spec.ts --project=chromium -g "signup → dashboard"`:
  bestanden.
- `bunx playwright test tests/e2e-playwright/kanzlei-flow.spec.ts --project=chromium -g "AI deadline detection"`:
  bestanden.
- `bunx prettier --write ...` für die geänderten Test-, Code- und
  Dokumentationsdateien.

Nicht vollständig ausgeführt / noch offen:

- Voller `bun run test:e2e` über alle Playwright-Projekte. Ein erster Lauf wurde
  nach vielen Timeout-/Browser-Projektfehlern abgebrochen; der fokussierte
  Chromium-Kernblock wurde danach stabilisiert und grün verifiziert.
- Firefox-/WebKit-E2E-Stabilisierung.
- echte k6-/Staging-Lasttests.
- manuelle Browserprüfung aller kritischen Dashboard-Flows.

## Gesamtrisiko

| Bereich               | Risiko | Begründung                                                                                                   |
| --------------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| Statuswahrheit        | Mittel | Legal-AI ist jetzt konsolidiert, aber andere Audit-/Todo-Dateien bleiben offen.                              |
| Produktreife          | Hoch   | 21 teilweise Pakete und 3 offene Produktpakete sind dokumentiert.                                            |
| Release-Sicherheit    | Mittel | Lint, Typecheck, Unit, Server-Verify und fokussierter Chromium-E2E sind grün; Full-E2E/Browser-Matrix fehlt. |
| Dokumentationshygiene | Mittel | Viele historische Audits/Blueprints existieren parallel.                                                     |
| Worktree-Hygiene      | Hoch   | Viele uncommitted Änderungen außerhalb dieser Doku-Arbeit.                                                   |

## Empfohlene nächste Schritte

1. Doku-Konsolidierung committen oder als eigenen PR isolieren.
2. Danach den bestehenden großen Frontend-/Pricing-/Model-Worktree separat
   reviewen.
3. Vollständigen `bun run test:e2e` erneut laufen lassen und Firefox/WebKit-
   Projektfehler separat stabilisieren.
4. Die 40 Legal-AI-Paketzeilen priorisieren und pro Paket erst dann auf
   "fertig" setzen, wenn Nutzerflow, Tests und Gate genannt sind.
5. `TODOS.md` nicht mit Subsumio-Produktarbeit vermischen; separat als
   Engine/GBrain-Backlog behandeln.

## Abschlussurteil

Der Todo-/Plan-Überblick ist jetzt sauberer als vorher, aber das gesamte Repo ist
nicht fertig. Die richtige Aussage lautet:

> Die Legal-AI-Dokumentation ist konsolidiert; die Software hat ein starkes
> Fundament; Lint, Typecheck, Unit, Server-Verify und ein fokussierter
> Chromium-E2E-Kernblock sind grün; mehrere Produkt- und Engine-Todos bleiben
> offen; ein vollständiger Release-Audit braucht noch Full-E2E über die gesamte
> Browser-/Projektmatrix und Review der bestehenden uncommitted Codeänderungen.
