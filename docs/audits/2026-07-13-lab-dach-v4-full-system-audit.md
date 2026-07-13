# LAB-DACH v4 — Gesamt-Audit nach T0–T10

**Auditdatum:** 2026-07-13  
**Scope:** aktueller Worktree `/Users/msc/subsumio-web`  
**Ergebnis:** technisch belastbare Basis, aber noch kein vollständig produktionsreifes Harvey-Parity-System.

## Durchgeführte Checks

- TypeScript: `npx tsc --noEmit --pretty false` — grün.
- Relevante Pipeline-, Gold-Task-, Rubric- und CH/Public-Benchmark-Tests: 135 pass, 0 fail.
- Breiter Epic-3/7/8/10-Testlauf: 432 pass, 0 fail.
- `git diff --check` — sauber.
- LAB-DACH Mock-CLI mit einem Goldtask — ausführbar; Receipt, Report und JSON werden geschrieben.
- Live-CLI — fail-closed geprüft; kein Mock wird mehr als Live-Ergebnis ausgegeben.

## Während des Audits korrigiert

1. Workflow-Filter und Resume/Rerun konnten den Workflow-Scope umgehen. Layer-IDs bleiben jetzt autoritativ; Resume/Rerun darf nur noch Layer innerhalb des gewählten Workflows aktivieren.
2. Die bisher hardcodierten `on_child_fail: "continue"`-Werte der optionalen Pipeline-Layer werden jetzt aus dem Layer-Registry aufgelöst. Mandatory-Layer bleiben fail-closed.
3. Der LAB-DACH-Harness verwendete im Nicht-Mock-Modus ebenfalls `mockChatFn`; Modell- und Provider-Overrides wurden ignoriert. Nicht-Mock-Läufe werden jetzt ohne injizierten echten Provider-Adapter abgewiesen, statt falsche Live-Messwerte zu erzeugen. Modell/Provider werden korrekt an den Harness weitergereicht.

## Status nach Bereichen

### Grün / tragfähige Basis

- T0 Verification States, Receipts und Backend-Grounding-Validierung.
- T2 Goldtask-/Challenge-/Qrels-Struktur und fail-closed Rubric-Judge.
- T3 Corpus-/Snapshot-/Source-Lifecycle-Grundlagen und Migrationen statisch geprüft.
- T5.1–T5.4 Workflow-Definitionen, Layer-Registry und Mandatory-Failure-Policy.
- T8 Queue-Reliability-, Cost-, SLO-, DR-, Model- und Prompt-Registry-Bausteine als Code plus Unit-Tests.
- Tenant-Scope der Receipt-API: `brain_id` wird gegen den authentifizierten Kontext geprüft; Receipt-Lookups sind brain-scoped.

### Gelb / vor Epic 6 beziehungsweise vor Pilotbetrieb nachzuziehen

- **T1.3:** Es existieren Grounding-Map-, Issues- und Dependency-Graph-Bausteine, aber noch kein eindeutig zentraler Claim–Evidence-Graph als verbindlicher Vertrag für alle drei Workflows. Das muss vor UI-/Export-Freigabe vereinheitlicht werden.
- **T1.4/T1.5:** Jurisdiktions- und Rule-Receipt-Strukturen existieren, aber die Mega-Pipeline enthält weiterhin viele inline Jurisdiktions-/Modell-/Rechtsregeln. Die Registry ist daher noch nicht überall Single Source of Truth.
- **T8:** Model- und Prompt-Registry sind implementiert und getestet, aber nicht jeder direkte Modell-/Prompt-Call-Site ist daran angebunden. Insbesondere die Pipeline und einige allgemeine Think-/Search-Pfade enthalten weiterhin direkte Modell-IDs.
- **Persistenz:** Die neuen Stores und Migrationen wurden typisiert und statisch geprüft, aber nicht gegen eine isolierte echte PostgreSQL-Testdatenbank migriert und round-trip-verifiziert. Das ist vor Deployment Pflicht.
- **LAB-DACH live:** Der Harness ist aktuell bewusst nur offline/mock sicher. Ein echter Gateway-Adapter inklusive Judge-Modellrouting, Token-/Kostenmessung und Providerfehlern fehlt noch.
- **CH:** Die CH-Goldtasks sind explizit `draft` und warten auf Schweizer fachjuristische Prüfung. Sie dürfen nicht als validierte Gold-Benchmark-Ergebnisse publiziert werden.
- **Holdout:** Dev/Test/Qrels/Challenge referenzieren den Holdout nicht mehr. Der Holdout liegt aber weiterhin im Repository und ist damit für Personen/Agenten mit Repozugriff sichtbar. Für einen belastbaren öffentlichen Benchmark muss er außerhalb des normalen Source-/Training-Zugriffs versiegelt werden.
- **Goldtask-Metadaten:** Mehrere Goldtask-Dateien tragen Review-/As-of-Daten vom 2026-07-15, obwohl der Auditstand 2026-07-13 ist. Vor Benchmark-Veröffentlichung müssen diese Zeitstempel fachlich bestätigt oder korrigiert werden; zukünftige Review-Daten sind keine belastbare Provenienz.

## Go/No-Go

**Go:** Weiterentwicklung Richtung Epic 6, sofern der Scope auf produktive Workflows und echte Integrationsprüfungen konzentriert bleibt.  
**No-Go:** Produktive Rechtsausgabe, öffentliche Benchmark-Behauptungen oder „Harvey eingeholt“-Claims vor den gelben Punkten oben. Die Unit-Test-Grünheit beweist keine juristische Richtigkeit und keine echte Provider-/DB-Integration.

## Nächste Schritte — verbindliche Reihenfolge

1. **Epic 6.0 Freeze & Integrationsbranch:** aktuellen Worktree in einem Review-Commit sichern; danach keine parallelen Änderungen an Pipeline-Verträgen ohne Contract-Test.
2. **Epic 6.1 Claim–Evidence Contract:** einen zentralen Typ/Store für Claim, Evidence, Source Snapshot, Support/Contradict und Coverage definieren; Grounding Map, Issues, Receipts und DOCX-Export darauf umstellen.
3. **Epic 6.2 Workflow-Produkte:** Memo, Fristenreport und Schriftsatz als echte API-/UI-Produkte mit Status, Approval Gates, Evidence Coverage und Receipt bauen.
4. **Epic 6.3 Export:** DOCX-Roundtrip mit klickbaren Quellen, Receipt und Blockierung bei unverifizierten Claims; danach visuelle/strukturelle Regressionstests.
5. **Epic 6.4 echte Integration:** Migration 004/006 in isolierter PostgreSQL-Testdatenbank ausführen, Stores round-trippen, Tenant-Isolation und Concurrent-Version-Checks testen.
6. **Epic 6.5 Live-Eval:** Gateway-Adapter für den LAB-DACH-Harness anschließen; `--model`/`--provider` wirklich routen, Kosten-/Latenz-/Token-Receipts erzeugen und Live-Run von Mock-Run strikt unterscheiden.
7. **Epic 7/8 Wiring:** Model Registry, Prompt Registry, Cost Ledger, SLO und Audit Chain an die tatsächlichen Produktionspfade anschließen; reine Unit-Module gelten erst danach als erledigt.
8. **Benchmark-Härtung:** Holdout extern versiegeln, zukünftige Metadaten bereinigen, CH fachjuristisch reviewen, danach erst Release-/Public-Benchmark-Gate ausführen.

## Fortschritt nach dem Audit

Der erste Epic-6.1-Slice wurde anschließend umgesetzt:

- zentraler Claim–Evidence-Graph mit deterministischer Coverage,
- Adapter für Grounding Map und Canonical Legal Issue,
- Receipt-Artefakte und „Warum?“-Erklärung,
- Pipeline-Persistenz als `claim-evidence/<case_slug>`,
- tenant-gebundene Claim-Evidence-API,
- explizite Jurisdiktion in Upload-/Trigger-Pfaden.

Der detaillierte Folgeplan steht in `server/docs/plans/2026-07-13-epic6-legal-work-product-roadmap.md`.
