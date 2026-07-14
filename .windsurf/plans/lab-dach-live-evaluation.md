# LAB-DACH Live Evaluation Blueprint

## Goal
Enable live LLM evaluation in the LAB-DACH harness with real provider routing, cost tracking from CANONICAL_PRICING, mock/live distinction, and a budget guard.

## Architecture

### Current State
- `e2e-harness.ts`: `runE2E()` with mock mode, fail-closed for live (no chatFn → throw)
- `workflows.ts`: Uses hardcoded `estimateCost()` (VIOLATION — must derive from CANONICAL_PRICING)
- `receipt.ts`: `RunReceipt` missing `mode` field
- `cli.ts`: No `--max-cost-usd`, `--judge-model`, `--judge-provider`, `--split` flags
- `rubric-judge.ts`: Has own `ChatOpts`/`ChatResult` types (simpler than gateway's)

### Changes

#### 1. types.ts — Add `mode` to RunReceipt
- Add `mode: 'live' | 'mock'` field to `RunReceipt` interface
- Add `provider_errors?: string[]` for capturing provider errors

#### 2. gateway-adapter.ts (NEW) — Bridge gateway ↔ harness
- `createGatewayChatFn(modelId, provider)` → returns harness-compatible `chatFn`
- Maps harness `ChatOpts` → gateway `chat()` opts
- Maps gateway `ChatResult` → harness `ChatResult` (extended with `usage` info)
- Tracks per-call: token counts, cost (via `computeTurnCost`), latency
- Returns `GatewayAdapterStats` with cumulative tokens, cost, latency array, errors
- Budget guard: checks cumulative cost against `maxCostUsd` before each call

#### 3. workflows.ts — Replace estimateCost
- Remove `estimateCost()` function (hardcoded prices — VIOLATION)
- Import `computeTurnCost` from `cost-ledger.ts` (derives from CANONICAL_PRICING via model-registry)
- Extend `ChatResult` type in `rubric-judge.ts` to include optional `usage` field
- Use real token counts from `ChatResult.usage` when available, fall back to char/4 estimate
- Compute cost via `computeTurnCost(modelId, tokens)` instead of hardcoded formula

#### 4. receipt.ts — Add mode + p50/p95
- Add `mode` to `buildRunReceipt` opts and output
- Add `latency_p50_ms` and `latency_p95_ms` to receipt (from all LLM calls in the workflow)
- Add `provider_errors` field

#### 5. e2e-harness.ts — Core changes
- Add `mode: 'live' | 'mock'` to `runE2E` opts (required, no default)
- Add `maxCostUsd?: number` to `runE2E` opts
- Add `judgeModelId?` and `judgeProvider?` to `runE2E` opts
- Budget guard: after each task, check cumulative cost, abort with clear error if exceeded
- Track provider errors per task
- Pass `mode` to `buildRunReceipt`
- Fail-closed behavior preserved: no chatFn + not mock → throw

#### 6. cli.ts — New flags + live mode wiring
- Add `--max-cost-usd <n>` flag
- Add `--judge-model <id>` flag
- Add `--judge-provider <p>` flag
- Add `--split <dev|test|holdout>` flag (filter tasks by split)
- Add `--gold-tasks <set>` flag (e.g. `at-litigation`) to select gold task sets
- When not `--mock`: configure gateway, create `createGatewayChatFn()`, pass to `runE2E`
- Print mode prominently in console output

#### 7. report.ts — Mode in header
- Add `**Mode**: LIVE ⚠️` or `**Mode**: MOCK (offline)` to report header
- Add mode to JSON output
- Add cost summary (total cost, tokens) to report

#### 8. Regression test (mock-live-separation.test.ts)
- Test: RunReceipt with mode='mock' can never be confused with mode='live'
- Test: buildRunReceipt always includes mode
- Test: mock chatFn never produces live receipt
- Test: fail-closed behavior (no chatFn + not mock → throws)

## Definition of Done
- [ ] Live run end-to-end with real provider works, receipt complete
- [ ] Mock/Live confusion structurally impossible (test)
- [ ] Fail-closed behavior preserved
- [ ] First live report committed under server/docs/eval-runs/
- [ ] Typecheck + existing tests green
- [ ] No hardcoded prices (all derived from CANONICAL_PRICING)
- [ ] Mock path preserved (not removed)
- [ ] Holdout not used in live run (dev-split only)

## Forbidden
- Hardcoding prices (must use CANONICAL_PRICING via computeTurnCost)
- Removing mock path
- Using holdout split in live run
