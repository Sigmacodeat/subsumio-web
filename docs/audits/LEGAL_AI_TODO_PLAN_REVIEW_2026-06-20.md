# Subsumio Legal-AI Todo-Plan Review

Stand: 2026-06-20  
Geprüfte Dateien:

- `docs/audits/LEGAL_AI_ACTION_TODO_PLAN_2026-06-20.md`
- `docs/audits/archive/LEGAL_AI_FOLLOWUP_PLAN_2026-06-20.md`
- `docs/audits/LEGAL_AI_IMPLEMENTATION_STATUS.md`
- `TODOS.md`
- `README.md`
- `playwright.config.ts`
- `.github/workflows/ci.yml`

## Kurzbefund

Die Legal-AI-Planung ist nicht sauber "fertig", obwohl der Hauptplan in seiner
Status-Tabelle `75/75 fertig` meldet. Der bessere aktuelle Befund ist:

1. Viele Bausteine sind im Code vorhanden und getestet.
2. Einige frühere Follow-up-Lücken sind inzwischen teilweise oder ganz überholt.
3. Mehrere große Produktpakete sind trotzdem nur als Modell, API oder isoliertes
   Modul vorhanden, aber noch nicht durchgängig als Nutzerworkflow verdrahtet.
4. Die aktiven Todo-Listen widersprechen sich und sollten konsolidiert werden,
   bevor weitere Statuszeilen als "fertig" markiert werden.

## Entscheidung zu Todo-Listen

Todo-Pläne sollten nicht einfach gelöscht werden, sobald sie "fertig" wirken.
Richtig ist diese Regel:

- Aktive Arbeit gehört in genau eine kanonische Statusdatei.
- Alte Pläne bleiben als Audit-Historie erhalten oder werden nach `docs/audits/archive/`
  verschoben.
- Eine Datei darf erst archiviert werden, wenn alle offenen Punkte entweder
  umgesetzt, bewusst verworfen oder in die kanonische Statusdatei übernommen wurden.
- "Fertig" bedeutet nicht "Datei existiert"; fertig bedeutet: Code ist verdrahtet,
  Nutzerflow ist erreichbar, Tests/Gates laufen und die Produktdoku ist aktualisiert.

Empfehlung:

| Datei                                                      | Rolle                                              | Maßnahme                                                                      |
| ---------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `docs/audits/LEGAL_AI_ACTION_TODO_PLAN_2026-06-20.md`      | Historischer Hauptplan mit Paketstruktur           | Behalten, aber Statusblock nicht mehr als alleinige Wahrheit verwenden.       |
| `docs/audits/archive/LEGAL_AI_FOLLOWUP_PLAN_2026-06-20.md` | Archivierte Gegenprüfung mit echten Lücken         | Ist archiviert; relevante Punkte stehen in der kanonischen Statusdatei.       |
| `docs/audits/LEGAL_AI_IMPLEMENTATION_STATUS.md`            | Kanonische Statusdatei                             | Als aktive Wahrheit pflegen.                                                  |
| `docs/audits/LEGAL_AI_TODO_PLAN_REVIEW_2026-06-20.md`      | Diese bereinigte Bewertung                         | Als aktuelle Entscheidungsgrundlage nutzen.                                   |
| `TODOS.md`                                                 | GBrain-/Server-Follow-ups, teilweise fremder Scope | Nicht mit Subsumio-Produktplan vermischen; separat als Engine-Todo behandeln. |

## Was bereits stark ist

Subsumio hat ein breites Kanzlei-OS-Fundament:

- Dashboard-Flows für Akten, Kontakte, Fristen, Upload, Recherche, Analyse,
  Contract Drafting, Contract Review, Due Diligence, Rechnungen, Zeiterfassung,
  DATEV, beA, DocuSign, DMS, Team, Audit und Einstellungen.
- API-Routen für Legal-Analyse, Suche, Brain/Pages, Matter Context, Workflows,
  Approvals, Portal, Intake, Notifications, WhatsApp, Billing, Usage, SCIM,
  Data Export, Retention und Release Gates.
- Tests für zentrale Risikobereiche: Auth, Webhooks, TOTP, Billing, Upload,
  Legal Chat, RAG-Eval, Release Gate, Ethical Walls, Model Policy, Notification
  Models, Knowledge Assets, a11y-Baseline und Playwright-Flows.
- Eine echte Engine-Schicht unter `server/` mit Search/Retrieval, Brain-Modell,
  Resolver-/Skill-Checks und eigener Verify-Pipeline.

## Was noch fehlt oder neu geprüft werden muss

### P0/P1: Produkt- und Compliance-Gates

| Thema              | Aktueller Befund                                                                          | Nächster Schritt                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Kanonischer Status | Hauptplan behauptet historisch `100%`, Follow-up-Plan widerspricht.                       | `LEGAL_AI_IMPLEMENTATION_STATUS.md` ist jetzt die einzige aktive Statusdatei.                                   |
| Release Gate       | `src/lib/release-gate.ts`, `/api/release-gate` und Tests existieren.                      | In CI prüfen, ob Gate wirklich blockierend für Web-App-Releases läuft.                                          |
| Accessibility      | Playwright-a11y-Tests und `a11y-baseline.ts` existieren.                                  | Sicherstellen, dass `bun run test:e2e` in CI zuverlässig alle a11y-Projekte ausführt und Ergebnisse blockieren. |
| Performance/Last   | Performance-Budgets und Lasttest-Szenarien existieren.                                    | Einen echten Staging-Lauf dokumentieren; generierte k6-Skripte allein sind kein Lasttest.                       |
| EU-/AI-Policy      | Org-Model-Policy API und Settings-Model-Route existieren.                                 | UI und Admin-Dokumentation für `eu_only` prüfen/ergänzen.                                                       |
| At-rest Encryption | App kann Daten nicht sinnvoll feldverschlüsseln, wenn Suche/Embeddings Klartext brauchen. | Produktions-Hosting-Doku muss Postgres/Disk-Encryption-at-rest bestätigen.                                      |

### Verdrahtung statt Neubau

| Modul                                   | Befund                               | Risiko                                                                          |
| --------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| `src/lib/efiling-architecture.ts`       | Modell + Tests existieren.           | Prüfen, ob `dashboard/bea` und Approval-Flows dieses Modell wirklich verwenden. |
| `src/lib/migration-project.ts`          | Lifecycle-Modell + Tests existieren. | Prüfen, ob `dashboard/import-kanzlei` damit verbunden ist.                      |
| `src/lib/whatsapp-event-bus.ts`         | Event-Bus und Tests existieren.      | Prüfen, ob Cron-Routen und WhatsApp-Outbound komplett darüber laufen.           |
| `src/lib/whatsapp/briefing-feedback.ts` | Feedback-Modul + Tests existieren.   | Prüfen, ob Webhook-Inbound Feedback wirklich persistiert und Metriken speist.   |
| `src/lib/facts-forget-decay.ts`         | App-Layer-Modul existiert.           | Klären, ob aktiv genutzt oder als alte Referenz markieren.                      |

### Große Produktpakete mit Restarbeit

Diese Pakete sind nach Dateilage und Planvergleich nicht als vollständig
produktfertig zu betrachten, solange keine End-to-End-Verifikation dokumentiert ist:

- Workflow Engine: relationaler Workflow-Run, Approval-Gates und UI/API-End-to-End.
- Contract Review Workspace: echter Workspace mit Redlines, Kommentaren,
  Versionen, Playbooks und Export-Roundtrip.
- Bulk Review / Due Diligence: Review-Sets, Issue Coding, Privilege, Sampling,
  Export und Validierung.
- Word/Outlook Add-ins: produktive Auth, sichere Speicherung, Attachments,
  Grounding, Audit und Kanzlei-Kontext.
- CLM Light: Lifecycle/Portfolio-Status, Obligation Tracking, Signature Flow.
- Trust Accounting / Spend Controls: Anderkonto/IOLTA-artiges Ledger,
  matterbezogenes AI-Spend-Tracking.
- Litigation Analytics: Richter-/Gerichts-/Outcome-Analytics statt nur Suche.
- Co-Editing: Presence, Cursor, Typing und echte synchrone Bearbeitung.
- Knowledge Management: Curated/Gold-Standard/Owner-Governance als sichtbarer
  Produktflow, nicht nur Suchmodell.

## Saubere Definition von "fertig"

Ein Paket darf erst als fertig gelten, wenn alle Punkte erfüllt sind:

1. Datenmodell und Migration/Persistenz sind definiert.
2. API oder Serveroperation ist implementiert und tenant-/matter-sicher.
3. UI-Flow ist für echte Nutzer erreichbar.
4. Audit-Log, Berechtigungen und Datenschutzregeln greifen.
5. Unit-, API- und, wo passend, Playwright-Smoke-Test existieren.
6. CI führt die relevanten Tests/Gates blockierend aus.
7. Produktdoku und interne Statusdatei sind aktualisiert.

## Konkreter Aufräumplan

1. `LEGAL_AI_IMPLEMENTATION_STATUS.md` ist die einzige aktive Statusdatei.
2. Relevante Punkte aus `LEGAL_AI_FOLLOWUP_PLAN_2026-06-20.md` sind in drei
   Gruppen übertragen: produktnah, teilweise/verdrahten, offen.
3. `LEGAL_AI_FOLLOWUP_PLAN_2026-06-20.md` liegt unter `docs/audits/archive/`
   und bleibt als Audit-Historie erhalten.
4. `TODOS.md` getrennt halten, weil es überwiegend Engine/GBrain-Follow-ups
   enthält und nicht der Subsumio-Produktplan ist.
5. Für jede neue Statusänderung einen kurzen Nachweis verlangen:
   betroffene Dateien, Tests/Gates, erreichbarer Nutzerflow.
