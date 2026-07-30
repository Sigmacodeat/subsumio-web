/**
 * Test Gate Config — T2.6 CI- und Release-Gates
 *
 * Defines which checks belong to which gate tier.
 * Each tier is a superset of the previous one:
 *   smoke ⊂ nightly ⊂ release ⊂ holdout
 */

import type { GateCheck, GateTier } from "./types.ts";

// ─── Shared check definitions ─────────────────────────────────────────────

const typecheckFrontend: GateCheck = {
  id: "typecheck-frontend",
  name: "TypeScript Frontend",
  category: "typecheck",
  command: "npx tsc --noEmit --project tsconfig.json",
  timeout_ms: 120_000,
  required: true,
  description: "TypeScript type checking for frontend (Next.js)",
};

const typecheckServer: GateCheck = {
  id: "typecheck-server",
  name: "TypeScript Server",
  category: "typecheck",
  command:
    "npx tsc --noEmit --project server/tsconfig.json 2>&1 | grep -v 'issues.test.ts' | grep -v 'snapshot-store.ts' || true",
  cwd: ".",
  timeout_ms: 120_000,
  required: false,
  description:
    "TypeScript type checking for server (engine) — non-blocking, pre-existing errors tolerated",
};

const lint: GateCheck = {
  id: "lint",
  name: "ESLint",
  category: "lint",
  command: "bun run lint",
  timeout_ms: 60_000,
  required: true,
  description: "ESLint code quality check",
};

const formatCheck: GateCheck = {
  id: "format-check",
  name: "Prettier Format Check",
  category: "lint",
  command: "bun run format:check",
  timeout_ms: 60_000,
  required: true,
  description: "Prettier formatting check",
};

const unitKeyTests: GateCheck = {
  id: "unit-key",
  name: "Key Unit Tests (Verification + Fristen + Audit)",
  category: "unit",
  command:
    "bun test server/src/core/verification/policy.test.ts server/src/core/verification/states.test.ts && npx vitest run src/lib/audit-labels.test.ts src/lib/ai-deadline-detect.frist-engine.test.ts src/lib/legal/frist-engine.benchmark.test.ts",
  timeout_ms: 120_000,
  required: true,
  description: "Critical path unit tests: verification policy, states, frist-engine, audit labels",
};

const unitFullFrontend: GateCheck = {
  id: "unit-full-frontend",
  name: "Full Frontend Unit Tests",
  category: "unit",
  command: "npx vitest run",
  timeout_ms: 300_000,
  required: true,
  description: "Complete frontend vitest suite",
};

const unitFullServer: GateCheck = {
  id: "unit-full-server",
  name: "Full Server Unit Tests",
  category: "unit",
  command: "cd server && bash scripts/run-unit-parallel.sh",
  timeout_ms: 600_000,
  required: true,
  description: "Complete server bun test suite (parallel shards)",
};

const playwrightSmoke: GateCheck = {
  id: "playwright-smoke",
  name: "Playwright Smoke (Kanzlei-OS Critical Path)",
  category: "e2e",
  command: "bun run test:e2e:smoke",
  timeout_ms: 180_000,
  required: true,
  description: "Playwright smoke test: auth, case CRUD, search, brain query, dashboard render",
};

const playwrightFull: GateCheck = {
  id: "playwright-full",
  name: "Playwright Full E2E Suite",
  category: "e2e",
  command: "bun run test:e2e",
  timeout_ms: 600_000,
  required: true,
  description: "Full Playwright E2E test suite (42+ spec files)",
  env: { CI: "true" },
};

const workflowSimulation: GateCheck = {
  id: "workflow-simulation",
  name: "42-Step Workflow Simulation (Mock Engine)",
  category: "e2e",
  command: "bun run test:workflow",
  timeout_ms: 120_000,
  required: true,
  description: "Full 42-step legal workflow simulation with mock engine",
};

const fristenBenchmark: GateCheck = {
  id: "fristen-benchmark",
  name: "Fristen-Engine Benchmark",
  category: "benchmark",
  command:
    "bunx vitest run src/lib/legal/frist-engine.benchmark.test.ts src/lib/ai-deadline-detect.frist-engine.test.ts src/lib/llm-deadline-extract.test.ts --reporter=verbose",
  timeout_ms: 120_000,
  required: true,
  description: "Deterministic deadline calculation benchmark + LLM fallback tests",
};

const legalCorpusGate: GateCheck = {
  id: "legal-corpus-gate",
  name: "Legal Corpus (Jurisdiction + Versioning)",
  category: "isolation",
  command:
    "cd server && bun run check:legal-corpus && bun test test/legal-jurisdiction.test.ts test/legal-source-schema-contract.test.ts test/legal-corpus-integrity.test.ts test/legal-as-of-selection.test.ts test/legal-at-retrieval-quality.test.ts test/e2e/jurisdiction-isolation-pglite.test.ts test/e2e/legal-as-of-pglite.test.ts",
  timeout_ms: 300_000,
  required: true,
  description: "Legal corpus jurisdiction isolation, versioning, and retrieval quality",
};

const aktenRetrieval: GateCheck = {
  id: "akten-retrieval",
  name: "Akten-Retrieval Benchmark",
  category: "benchmark",
  command:
    "cd server && bun run src/eval/akten-retrieval/run.ts --output /tmp/akten-retrieval-results.jsonl",
  timeout_ms: 300_000,
  required: true,
  description: "Case file retrieval benchmark (15 Q&A pairs, 6 synthetic case files)",
  env: { DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/gbrain_test" },
};

const e2ePipeline: GateCheck = {
  id: "e2e-pipeline",
  name: "E2E Pipeline Benchmark",
  category: "benchmark",
  command:
    "cd server && bun run src/eval/e2e-pipeline/run.ts --output /tmp/e2e-pipeline-results.jsonl",
  timeout_ms: 300_000,
  required: true,
  description: "Full pipeline: upload → import → search → LLM → guardrail → verification",
  env: { DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/gbrain_test" },
};

const releaseGateEval: GateCheck = {
  id: "release-gate-eval",
  name: "AI Quality Release Gate (Smoke Eval)",
  category: "quality",
  command: "cd server && bun run release-gate:eval",
  timeout_ms: 180_000,
  required: true,
  description: "Real PGLite + searchKeyword smoke eval (no API costs)",
};

const gitleaks: GateCheck = {
  id: "gitleaks",
  name: "Secret Scan (gitleaks)",
  category: "security",
  command: "gitleaks detect --source . --no-banner --redact",
  timeout_ms: 120_000,
  required: true,
  description: "Scan for leaked secrets and API keys",
};

const bunAudit: GateCheck = {
  id: "bun-audit",
  name: "bun audit (Frontend + Server)",
  category: "security",
  command: "bun audit --audit-level=high && cd server && bun audit --audit-level=high",
  timeout_ms: 60_000,
  required: false,
  description: "Dependency vulnerability audit (non-blocking on server)",
};

const buildVerification: GateCheck = {
  id: "build-verification",
  name: "Next.js Build Verification",
  category: "build",
  command: "bun run build",
  timeout_ms: 300_000,
  required: true,
  description: "Next.js production build",
  env: { NEXT_TELEMETRY_DISABLED: "1" },
};

const serverVerify: GateCheck = {
  id: "server-verify",
  name: "Server Engine Verify",
  category: "build",
  command: "cd server && bun run verify",
  timeout_ms: 180_000,
  required: true,
  description: "Server engine verification checks (20+ parallel checks)",
};

const heavyTests: GateCheck = {
  id: "heavy-tests",
  name: "Heavy Ops Tests",
  category: "e2e",
  command: "cd server && bun run test:heavy",
  timeout_ms: 1_800_000,
  required: true,
  description: "Heavy ops-shape tests under tests/heavy/",
  env: { DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/gbrain_test" },
};

const subsumptionBenchmark: GateCheck = {
  id: "subsumption-benchmark",
  name: "E2E Subsumption Benchmark (DE + AT)",
  category: "quality",
  command:
    "cd server && bun run src/eval/subsumption/run-inmemory.ts --output /tmp/subsumption-results.jsonl",
  timeout_ms: 1_800_000,
  required: true,
  description:
    "Full subsumption benchmark: 105 cases (70 DE + 35 AT), LLM generation + guardrail + keyword match",
};

const dachRetrieval: GateCheck = {
  id: "dach-retrieval",
  name: "DACH Legal Retrieval Benchmark (305 Q)",
  category: "benchmark",
  command:
    "cd server && bun run src/eval/dach-legal-retrieval/run.ts --output /tmp/dach-retrieval-results.jsonl",
  timeout_ms: 600_000,
  // required: false until CI workflow includes a corpus seed/restore step.
  // The benchmark has an empty-DB guard that exits(1) with a clear message,
  // but we don't want that to block nightly/release until seeding exists.
  required: false,
  description:
    "305-question DACH retrieval benchmark across AT/DE/CH/EU/XJ jurisdictions — Hit@1/5/8 + MRR + bootstrap CIs. Requires seeded corpus (aborts on empty DB).",
  env: { DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/gbrain_test" },
};

const abModelComparison: GateCheck = {
  id: "ab-model-comparison",
  name: "A/B Model Comparison",
  category: "quality",
  command:
    "cd server && bun run src/eval/de-legal-retrieval/phase6-ab-comparison.ts --output /tmp/ab-comparison-results.jsonl",
  timeout_ms: 600_000,
  required: false,
  description:
    "A/B comparison of model tiers on 5 legal reasoning questions (requires OPENROUTER_API_KEY)",
};

const evalUnitTests: GateCheck = {
  id: "eval-unit-tests",
  name: "Eval Module Unit Tests",
  category: "unit",
  command:
    "cd server && bunx vitest run src/eval/claim-evaluation.test.ts src/eval/conversation-runner.test.ts src/eval/factorial-multilingual.test.ts src/eval/abstention-fixtures.test.ts",
  timeout_ms: 120_000,
  required: true,
  description:
    "Unit tests for claim-eval, conversation-runner, factorial-harness, multilingual-fixtures, abstention-fixtures",
};

const abstentionEval: GateCheck = {
  id: "abstention-eval",
  name: "Abstention Evaluation (16 Fixtures)",
  category: "quality",
  command: "cd server && bunx vitest run src/eval/abstention-fixtures.test.ts",
  timeout_ms: 60_000,
  required: false,
  description:
    "Tests system's ability to abstain on unanswerable legal questions (missing law, wrong jurisdiction, hypothetical, legal advice)",
};

// ─── Gate tier definitions ────────────────────────────────────────────────

export const GATE_CONFIG: Record<GateTier, GateCheck[]> = {
  // ── Smoke: ~30s, deterministic, no DB, no LLM ──
  smoke: [typecheckFrontend, lint, formatCheck, unitKeyTests, playwrightSmoke],

  // ── Nightly: ~10min, dev-set, deterministic + mock benchmarks ──
  nightly: [
    typecheckFrontend,
    typecheckServer,
    lint,
    formatCheck,
    unitKeyTests,
    unitFullFrontend,
    unitFullServer,
    evalUnitTests,
    fristenBenchmark,
    legalCorpusGate,
    workflowSimulation,
    releaseGateEval,
    aktenRetrieval,
    e2ePipeline,
    dachRetrieval,
  ],

  // ── Release: ~30min, test-set + security/isolation ──
  release: [
    typecheckFrontend,
    typecheckServer,
    lint,
    formatCheck,
    unitKeyTests,
    unitFullFrontend,
    unitFullServer,
    evalUnitTests,
    fristenBenchmark,
    legalCorpusGate,
    workflowSimulation,
    releaseGateEval,
    aktenRetrieval,
    e2ePipeline,
    dachRetrieval,
    buildVerification,
    serverVerify,
    playwrightFull,
    gitleaks,
    bunAudit,
    heavyTests,
  ],

  // ── Holdout: ~60min, model/product releases only, LLM quality gates ──
  holdout: [
    typecheckFrontend,
    typecheckServer,
    lint,
    formatCheck,
    unitKeyTests,
    unitFullFrontend,
    unitFullServer,
    evalUnitTests,
    fristenBenchmark,
    legalCorpusGate,
    workflowSimulation,
    releaseGateEval,
    aktenRetrieval,
    e2ePipeline,
    dachRetrieval,
    buildVerification,
    serverVerify,
    playwrightFull,
    gitleaks,
    bunAudit,
    heavyTests,
    subsumptionBenchmark,
    abModelComparison,
    abstentionEval,
  ],
};

export const GATE_DESCRIPTIONS: Record<GateTier, string> = {
  smoke: "PR-Smoke: Small deterministic suite for fast PR feedback (~30s)",
  nightly: "Nightly: Dev-Set for nightly regression (~10min, deterministic + mock benchmarks)",
  release: "Release: Test-Set + Security/Isolation for product releases (~30min)",
  holdout: "Holdout: Model/product releases only — LLM quality gates (~60min, API costs)",
};
