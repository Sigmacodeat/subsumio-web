# EPIC 8 — Plattformzuverlässigkeit und Model Operations

> Status: **In Implementierung** — 2026-07-13
> Priorität: P1/P2

## Ziel (User-Sicht)

Die Plattform muss **betrieblich zuverlässig** sein: Modelle werden explizit
mit allen Compliance- und Capability-Metadaten geführt, Prompts sind
versioniert und rollback-fähig, jeder Workflow-Turn erzeugt einen
kostenbaren Receipt, die Job-Queue hat formelle Retry-Klassen und DLQ,
SLOs pro Kernworkflow sind messbar, und Backups + Restore-Drill sind
implementiert — nicht nur geplant.

---

## T8.1 Model Capability Registry

### Ziel

Ein zentrales Registry, das jedes Modell mit allen für Routing- und
Compliance-Entscheidungen relevanten Metadaten führt. Kein stiller
Fallback auf ein Modell mit geringerer Compliance oder Capability.

### Datenmodell

```
ModelCapabilityEntry {
  id: string                    // "openrouter:deepseek/deepseek-chat"
  display_name: string
  provider: string              // "openrouter" | "anthropic" | ...
  snapshot: string              // "v4-flash-2026-07" | "2026-05-28"
  context_window: number        // max input+output tokens
  supports_tools: boolean
  supports_json: boolean        // structured output / JSON mode
  supports_thinking: boolean    // extended reasoning
  supports_vision: boolean
  supports_prompt_caching: boolean
  data_residency: "eu" | "non_eu"
  zdr: boolean                  // zero data retention
  pricing: { input: number, output: number }  // USD per 1M tokens
  tier: "utility" | "reasoning" | "deep" | "subagent"
  status: "active" | "deprecated" | "retired"
  deprecated_by?: string        // id of replacement model
}

FallbackPolicy {
  allowed: boolean              // is fallback to this model allowed?
  reason: string                // "lower_capability" | "lower_compliance" | ...
}
```

### Architektur

- **Server-side**: `server/src/core/model-registry.ts` — vereinigt
  `model-pricing.ts` + `capabilities.ts` + `model-config.ts` TIER_DEFAULTS
  in einer strukturierten Registry
- **No-silent-fallback**: `resolveModelWithFallback()` prüft
  Capability- und Compliance-Level des Fallback-Modells.
  Wenn Fallback-Modell niedrigere Capability oder Compliance → THROW, nicht
  silent downgraden
- **deepseek-chat Migration**: Explizite V4-Route in TIER_DEFAULTS,
  `deepseek-chat` wird auf `deepseek:deepseek-chat-v4-flash` aufgelöst
- **Frontend**: `src/lib/model-config.ts` erweitert mit `snapshot`, `zdr`,
  `supports_json`, `supports_thinking`

### Edge Cases

- Modell retired mid-session → Registry gibt `status: "retired"` zurück,
  Runtime weigert sich, neues Modell muss konfiguriert werden
- EU-only org + Modell wechselt zu non_eu → Block via `isModelAllowedForPolicy`
- Fallback-Modell fehlt in Registry → THROW (nicht silent auf "unknown")

### Definition of Done

- [ ] `ModelCapabilityRegistry` mit allen Feldern
- [ ] `resolveModelWithFallback()` mit no-silent-downgrade
- [ ] `deepseek-chat` → explizite V4-Route
- [ ] Tests: Registry-Lookup, Fallback-Block, EU-Policy, Deprecated-Modell

---

## T8.2 Prompt Registry

### Ziel

Versionierte Prompts mit Hash, Owner, Eval-Status und Rollback.
Produktivprompt nur nach Dev/Test-Gate.

### Datenmodell

```
PromptEntry {
  id: string                    // "think:legal-mode:v3"
  name: string                  // logical name: "think.legal.system"
  version: string               // semver: "3.1.0"
  content: string               // full prompt text
  hash: string                  // SHA-256 of content
  owner: string                 // team or person responsible
  eval_status: "draft" | "tested" | "promoted" | "rolled_back"
  eval_results?: {
    pass_rate: number
    hallucination_rate: number
    tested_at: string
    fixture_version: string
  }
  promoted_at?: string
  rolled_back_at?: string
  rollback_reason?: string
  previous_version?: string
  created_at: string
}
```

### Architektur

- **Server-side**: `server/src/core/prompt-registry.ts`
  - `registerPrompt()` — neuen Prompt registrieren (status: "draft")
  - `promotePrompt()` — Dev/Test-Gate: nur wenn eval_results pass_rate ≥ threshold
  - `rollbackPrompt()` — sofortiger Rollback zur vorherigen promoted Version
  - `getActivePrompt(name)` — gibt aktuell promoted Version zurück
  - `listVersions(name)` — alle Versionen mit Eval-Status
- **DB**: `subsumio_prompt_registry` table
- **Integration**: `think/prompt.ts` ruft `getActivePrompt()` statt hardcoded
  Prompt-Strings

### Dev/Test-Gate

```
promotePrompt(name, version) →
  1. Lookup eval_results for this version
  2. If eval_status != "tested" → REJECT ("prompt not tested")
  3. If pass_rate < 0.85 → REJECT ("pass rate below threshold")
  4. If hallucination_rate > 0.10 → REJECT ("hallucination above threshold")
  5. Mark as "promoted", set promoted_at
  6. Previous promoted version → status "rolled_back" (implicit)
```

### Definition of Done

- [ ] `PromptRegistry` mit DB-Store
- [ ] promote/rollback/getActive/listVersions
- [ ] Dev/Test-Gate mit Eval-Threshold
- [ ] Tests: Register, Promote (pass/fail), Rollback, GetActive

---

## T8.3 Workflow Receipts and Cost Ledger

### Ziel

Token je Turn, Cache, Tool Calls, Retry, Latenz, Kosten, Providerfehler.
First-pass und final-pass getrennt.

### Datenmodell

```
TurnReceipt {
  receipt_id: string
  workflow_id: string           // "think" | "subsumption" | "legal-pipeline"
  turn_id: string               // unique per turn
  brain_id: string
  user_id?: string
  jurisdiction?: string

  pass_type: "first_pass" | "final_pass" | "regeneration"

  model_id: string
  provider: string

  tokens: {
    input: number
    output: number
    cache_read: number
    cache_creation: number
  }
  tool_calls: Array<{
    tool: string
    latency_ms: number
    success: boolean
    error?: string
  }>
  retries: number
  latency_ms: number
  cost_usd: number

  provider_error?: string
  guardrail_flags: string[]
  verification_state: string

  created_at: string
}
```

### Architektur

- **Server-side**: `server/src/core/cost-ledger.ts`
  - `recordTurn()` — persist to `subsumio_cost_ledger` table
  - `getLedgerStats()` — aggregated stats per workflow/brain/time-range
  - `getTurnReceipts(workflow_id)` — all turns for a workflow
- **Integration**: `think/index.ts` calls `recordTurn()` after each LLM call
  (first-pass, regeneration, cross-verify)
- **DB**: `subsumio_cost_ledger` table

### Definition of Done

- [ ] `CostLedger` mit DB-Store
- [ ] `recordTurn()` mit first_pass/final_pass/regeneration
- [ ] `getLedgerStats()` aggregation
- [ ] Tests: Record, Stats, First-pass vs final-pass separation

---

## T8.4 Queue Reliability

### Ziel

Idempotenz, Lease/Heartbeat, Retry-Klassen, Dead Letter Queue, Resume,
Cancellation. Pflichtprüfer dürfen nicht als optionaler Child weiterlaufen.

### Erweiterungen

- **Retry-Klassen**: `transient` (conn error, timeout) vs `permanent`
  (logic error, validation) vs `infrastructure` (PgBouncer, pooler)
  → `RetryClass` enum in `types.ts`
- **Dead Letter Queue**: Separate `subsumio_dead_letter_jobs` table
  für jobs die `dead` status erreichen, mit reason und context
- **Mandatory Validators**: `mandatory: true` flag in `MinionJobInput`
  → Wenn mandatory child failed → parent MUSS fail (kein `on_child_fail:
"ignore"` oder `"continue"` erlaubt)
- **Resume**: `resumeJob()` — re-queue a paused job from checkpoint
- **Cancellation**: Bestehende `cancelJob()` erweitert mit
  `cascade_depth` limit und `force` flag

### Architektur

- `server/src/core/minions/retry-class.ts` — `classifyError()` → RetryClass
- `server/src/core/minions/dlq.ts` — `DeadLetterStore` mit DB-Store
- `server/src/core/minions/queue.ts` — mandatory validator enforcement
  in `add()`

### Definition of Done

- [ ] `RetryClass` + `classifyError()`
- [ ] `DeadLetterStore` mit DB-Store
- [ ] Mandatory validator enforcement in `add()`
- [ ] `resumeJob()` für paused jobs
- [ ] Tests: Retry classification, DLQ, Mandatory enforcement, Resume

---

## T8.5 Observability/SLO

### Ziel

Metriken: success, verified, blocked, verifier error, stale source,
retrieval miss, cost, latency. SLO pro Kernworkflow und Alarmierung.

### Datenmodell

```
SLODefinition {
  workflow: string              // "think" | "subsumption" | "legal-pipeline"
  metric: string                // "success_rate" | "verified_rate" | ...
  target: number                // 0.95
  window_hours: number          // 24
  severity: "critical" | "warning" | "info"
}

SLOStatus {
  workflow: string
  metric: string
  current_value: number
  target: number
  status: "met" | "breached" | "no_data"
  window_hours: number
}
```

### Architektur

- `src/lib/slo-monitor.ts` — SLO definitions + status computation
- `src/app/api/monitoring/slo/route.ts` — GET endpoint
- `src/app/dashboard/admin/slo/page.tsx` — Admin Dashboard UI
- Integration mit bestehender `guardrail-metrics.ts` und `cost-ledger.ts`

### Kern-Workflows + SLOs

| Workflow       | Metric              | Target | Severity |
| -------------- | ------------------- | ------ | -------- |
| think          | success_rate        | ≥95%   | critical |
| think          | verified_rate       | ≥80%   | warning  |
| think          | blocked_rate        | ≤5%    | warning  |
| think          | verifier_error_rate | ≤2%    | critical |
| think          | avg_latency_ms      | ≤30s   | warning  |
| think          | cost_per_query      | ≤$0.01 | info     |
| subsumption    | success_rate        | ≥90%   | critical |
| legal-pipeline | verified_rate       | ≥85%   | warning  |
| legal-pipeline | stale_source_rate   | ≤5%    | warning  |
| retrieval      | hit_rate            | ≥90%   | critical |

### Definition of Done

- [ ] `SLOMonitor` mit SLO definitions + status computation
- [ ] API endpoint
- [ ] Dashboard UI
- [ ] Tests: SLO computation, breach detection

---

## T8.6 Backups and Disaster Recovery

### Ziel

DB, Object Store, Corpus Snapshots, Audit Logs und Evaldaten.
Restore-Drill mit dokumentiertem RPO/RTO.

### Architektur

- `src/lib/disaster-recovery.ts` — DR orchestration
  - `createBackupManifest()` — list of all backup targets
  - `verifyBackupIntegrity()` — check all targets
  - `restoreFromBackup()` — orchestrate restore
  - `runRestoreDrill()` — automated drill with RPO/RTO measurement
- `src/app/api/admin/dr/route.ts` — GET (status), POST (trigger drill)
- `src/app/dashboard/admin/dr/page.tsx` — Admin Dashboard UI

### Backup Targets

| Target               | Tool           | RPO | RTO |
| -------------------- | -------------- | --- | --- |
| PostgreSQL DB        | restic/pg_dump | 24h | <1h |
| Object Store (files) | restic         | 24h | <1h |
| Corpus Snapshots     | restic         | 7d  | <2h |
| Audit Logs           | restic         | 24h | <1h |
| Eval Data            | restic         | 7d  | <4h |

### Definition of Done

- [ ] `DisasterRecovery` module
- [ ] Backup manifest + integrity check
- [ ] Restore drill orchestration
- [ ] RPO/RTO measurement + documentation
- [ ] API endpoint + Dashboard UI
- [ ] Tests: Manifest, integrity check, drill simulation
