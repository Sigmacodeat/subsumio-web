# Subsumio Engine Audit Report — Phase 1

> **Date:** 2026-06-19  
> **Scope:** Full agency-level audit of engine core, legal domain, think pipeline, search, minions, security, and frontend integration.  
> **Auditor:** Principal Engineer AI  
> **Verdict:** Engine core is production-grade. Legal domain layer is functionally complete but has 3 critical gaps (MCP ops, dream cycle, statute versioning). Security posture is strong with one HMAC rotation gap.

---

## 1. Engine Core

### 1.1 BrainEngine Interface (`server/src/core/engine.ts`)

**Status: ✅ Production-grade**

- **Interface completeness:** 2149 lines, covers pages, chunks, links, takes, facts, search, graph, timeline, files, sources, batch primitives, reserved connections, trajectory, calibration, dream verdicts. All methods have source-scoping opts (`sourceId?`, `sourceIds?`).
- **Type safety:** Full TypeScript typing throughout. `TakeKind` widened from closed union to `string` (v0.38) for schema-pack extensibility — correct design.
- **Batch primitives:** `deletePages`, `resolveSlugsByPaths`, `addLinksBatch`, `addTakesBatch` — all single-batch with caller-owned chunking. `sourceId` is REQUIRED on `deletePages` (asymmetric with `deletePage` which still has optional fallback — noted as v0.42+ TODO).
- **`findDuplicatePage?`:** Optional method for import dedup. Callers must defensively check `?.()` — documented and correct.

**Findings:**
- ✅ No SQL injection risk — interface defines parameterized signatures.
- ✅ Source scoping is threaded through all read/write methods.
- ⚠️ `deletePage` still allows optional `sourceId` (falls back to 'default') — potential cross-source delete if caller forgets to pass it. `deletePages` correctly requires it.

### 1.2 BrainRegistry (`server/src/core/brain-registry.ts`)

**Status: ✅ Production-grade**

- **Concurrency dedup:** `pending` Map of in-flight `Promise<BrainHandle>` prevents duplicate engine initialization for the same brain ID.
- **Lazy init:** Engines are initialized on first `getBrain()` call, not at registry construction.
- **`disconnectAll()`:** Iterates all mounts, calls `engine.disconnect()`, clears maps. Idempotent.
- **Mount validation:** `validateMountId` enforces alphanumeric + hyphens. `loadMounts` parses `mounts.json` with duplicate-path detection.
- **No memory leaks:** Mounts are strongly held only in the `mounts` Map. `disconnectAll` clears both `mounts` and `pending`.

### 1.3 Operations Dispatcher (`server/src/core/operations.ts`)

**Status: ✅ Strong, with one critical gap**

- **91 operations** registered. All route through `sourceScopeOpts(ctx)` for source scoping.
- **`remote` flag:** Enforced consistently. `file_upload` tightens filesystem confinement when `remote=true`. `think` op blocks `save`/`take` for remote callers. Facts visibility filtered to `'world'` for remote.
- **`resolveSourceScope`:** 3-way resolver (`__all__` / explicit / default) with correct trust-boundary logic: `__all__` → full span for local, scoped for remote.
- **`PROTECTED_JOB_NAMES`:** Subagent jobs like `synthesize`, `patterns`, `consolidate` are local-only — MCP cannot submit them.

**🚨 CRITICAL GAP: No legal MCP operations.** The legal domain modules (`contract-draft`, `risk-analysis`, `document-review`, `due-diligence`, `memo`, `summarize`, `analyze-document`, `contract-redline`, `anonymizer`, `split-statute`) are accessible ONLY via:
1. CLI (`gbrain legal ...`) — `server/src/commands/legal.ts`
2. Web API HTTP endpoints — `server/src/commands/web-api.ts` lines 514-698

They are NOT registered as MCP operations. An agent connected via MCP cannot call `contract_draft`, `risk_analysis`, `document_review`, etc. This is the single largest architectural gap — every legal AI competitor exposes these as first-class API operations.

### 1.4 PGLite/Postgres Parity

**Status: ✅ CI-pinned**

- Both engines implement the same `BrainEngine` interface.
- `kind` discriminator (`'postgres' | 'pglite'`) lets consumers branch without `instanceof`.
- `withReservedConnection` is a pass-through on PGLite (single connection) — documented and correct.
- CI runs both engines through the same E2E suite (29 files per the AGENTS.md).

---

## 2. Legal Domain Engine

### 2.1 Types (`server/src/core/legal/types.ts`)

**Status: ✅ Complete**

- `LegalEntity`, `LegalCase`, `Evidence`, `Strategy`, `Outcome`, `OpponentAnalysis`, `ChanceAssessment`, `PrecedentSearchResult`.
- `ownerSource` field on `LegalEntity` and `LegalCase` for multi-tenant isolation.
- Hashed/anonymized values for sensitive fields (client names, opponent names).

### 2.2 Repository (`server/src/core/legal/repository.ts`)

**Status: ✅ Production-grade**

- All queries use `this.sourceId` in WHERE clauses — source-scoped.
- Uses postgres.js tagged template literals → SQL-injection safe.
- `LegalEntityRepository`: full CRUD (create, getById, list, update, delete).
- `LegalCaseRepository`: full CRUD + `addEvidence`, `setStrategy`, `setOutcome`.
- Stores as `page.type = 'legal-entity'` / `'legal-case'` — leverages existing pages table, no separate schema needed.

**Findings:**
- ✅ No SQL injection risk.
- ✅ Source scoping on every query.
- ⚠️ `list` method does not support pagination beyond `limit`/`offset` — fine for current scale, may need cursor-based pagination at 10k+ cases.

### 2.3 Anonymizer (`server/src/core/legal/anonymizer.ts`)

**Status: 🟡 Functional, with gaps**

- HMAC-SHA-256 with owner key for pseudonymization (GDPR Art. 4 No. 5).
- `anonymize()`, `verifyAnonymized()`, `hashContact()`, `anonymizeFacts()`, `buildPlaceholders()`, `detectPII()`.
- Correctly documented as **pseudonymization, not anonymization** (reversible with owner key).

**Findings:**
- ✅ HMAC approach is GDPR-compliant for pseudonymization.
- 🚨 **No key rotation mechanism.** If the HMAC key is compromised, all pseudonymized data must be re-hashed. There is no `rotateKey(oldKey, newKey)` function. For a law firm SaaS, this is a compliance gap.
- ⚠️ `detectPII` uses regex patterns (email, phone, address, IBAN, dates). No NER pipeline. Will miss unconventional PII formats and produce false positives on common patterns. Acceptable for v1, but should be noted as a known limitation.
- ⚠️ `anonymizeFacts` does simple string replacement — if PII appears in a slightly different form than detected, it won't be caught. The function itself notes "for production use a proper NER pipeline."

### 2.4 Contract Draft (`server/src/core/legal/contract-draft.ts`)

**Status: ✅ Functional**

- LLM-generated first draft with template seeding from brain.
- `attorney_review_required: true` flag on every output.
- AI banner in output text.
- Template retrieval is source-scoped via `loadPageText`.

**Findings:**
- ✅ Source scoping on template retrieval.
- ✅ Attorney review flag is hardcoded `true` — cannot be bypassed.
- ⚠️ No grounding check (generative by nature — appropriate for drafting, but the output is not verified against any source).

### 2.5 Risk Analysis (`server/src/core/legal/risk-analysis.ts`)

**Status: ✅ Excellent — anti-hallucination model**

- Clause-level risk scoring (0-100) with `text_excerpt` grounding.
- **Grounding mechanism:** `text_excerpt` must appear verbatim (whitespace-normalized) in the source document. Fabricated clauses are dropped.
- Identifies red flags and missing clauses.
- `attorney_review_required: true` on every output.

**Findings:**
- ✅ Grounding is the load-bearing anti-hallucination guarantee.
- ✅ Source-scoped document text resolution.
- ✅ Ungrounded clauses dropped with warning count.

### 2.6 Split Statute (`server/src/core/legal/split-statute.ts`)

**Status: 🟡 Functional, with versioning gap**

- Splits monolithic statute markdown into per-section pages.
- Handles `§ N` (German) and `Art. N` (Austrian/Swiss) heading formats.
- Fallback `splitStatuteInline` for unstructured texts (RIS PDF dumps).
- Extracts `StatuteMeta` from frontmatter including `version_date`.

**Findings:**
- ✅ Robust heading detection for DE/AT/CH.
- ✅ Slug-safe IDs.
- 🚨 **`version_date` is in the frontmatter meta but NOT stamped on individual section pages.** When a statute is updated, there is no mechanism to detect which version of a section the brain contains. This means the brain cannot answer "is § 823 BGB current as of 2026?" — a critical capability for legal AI.
- ⚠️ No diff/incremental update mechanism — re-splitting a statute creates new pages rather than updating existing ones.

### 2.7 LLM Utilities (`server/src/core/legal/llm-util.ts`)

**Status: ✅ Excellent**

- `defaultLegalLLM` — gateway-backed, returns null if no model configured (graceful degradation).
- `loadPageText` / `resolveDocumentText` — source-scoped document retrieval.
- `groundQuotes` — verbatim quote matching with whitespace normalization. The core anti-hallucination primitive.
- `clipText` — token budget management with warning.
- `tryParseJSON` — robust JSON extraction from LLM output (strips code fences, extracts `{...}` blocks).
- `asScore`, `asRiskLevel`, `scoreToLevel`, `jurisdictionLabel` — consistent typing helpers.

### 2.8 Document Review (`server/src/core/legal/document-review.ts`)

**Status: ✅ Excellent**

- Q&A-style review with grounded citations.
- Every citation must appear verbatim in the source document.
- Configurable focus: `clauses`, `risks`, `compliance`, `general`.
- `attorney_review_required: true`.

### 2.9 Due Diligence (`server/src/core/legal/due-diligence.ts`)

**Status: ✅ Functional**

- Checklist-driven review across multiple documents.
- Predefined checklists for M&A, real estate, financing, general.
- Custom checklists supported.
- `page_refs` on each finding for traceability.
- `attorney_review_required: true`.

**Findings:**
- ✅ Multi-document aggregation with source scoping.
- ⚠️ All document texts are clipped and concatenated — for very large document sets, the LLM may miss issues in later documents due to context window limits. No prioritization or chunking strategy.

### 2.10 Memo (`server/src/core/legal/memo.ts`)

**Status: ✅ Functional**

- Structured legal memorandum: Sachverhalt → Rechtsfragen → rechtliche Würdigung → Ergebnis.
- Can incorporate case context from brain (source-scoped).
- `attorney_review_required: true`.
- `buildMarkdown` for formatted output.

### 2.11 Contract Redline (`server/src/core/legal/contract-redline.ts`)

**Status: ✅ Excellent**

- Tracked-changes-style edits with `original_clause` grounding.
- `original_clause` must appear verbatim for `modify`/`remove` changes. `add` changes have no anchor (correct).
- Ungrounded redlines are dropped with warning count.
- Supports counterparty comparison and playbook alignment.
- `attorney_review_required: true`.

### 2.12 Summarize (`server/src/core/legal/summarize.ts`)

**Status: ✅ Functional**

- Executive summary + structured key points.
- Reports `word_count` and `reading_time_minutes` (not LLM-generated).
- Explicitly NOT quote-grounded (paraphrasing by nature) — correctly documented.
- `attorney_review_required: true`.

### 2.13 Analyze Document (`server/src/core/legal/analyze-document.ts`)

**Status: ✅ Excellent**

- Proactive issue-spotting with `quote` grounding.
- `groundIssues()` drops any issue whose quote doesn't appear verbatim.
- Identifies document type, parties, key dates, issues, relevant statutes, recommended actions.
- `attorney_review_required: true`.
- Dependency-injected LLM (`AnalyzeLLM`) for testability.

---

## 3. Think Pipeline

### 3.1 Think Index (`server/src/core/think/index.ts`)

**Status: ✅ Production-grade**

- Full INTENT → GATHER → SYNTHESIZE → (optional) COMMIT pipeline.
- Streaming support via `onStreamChunk` callback.
- `modelExplicit` flag: hard error vs graceful degradation.
- Citation validation via `resolveCitations` / `validateCitationsAgainstContext`.
- `synthesisOk` flag prevents persisting empty synthesis pages.
- Source scoping: `sourceId`, `allowedSources`, `remote` all threaded through.
- Trajectory integration (v0.40.2.0) for temporal questions.
- Calibration support (v0.36.1.0) for bias-aware synthesis.

**Findings:**
- ✅ Source scoping is comprehensive.
- ✅ Citation grounding prevents hallucinated references.
- ⚠️ `inferIntent` is simple regex — doesn't detect legal-specific intents like "claim_analysis", "statute_lookup", "deadline_check". The think pipeline treats legal questions the same as any other domain question.

### 3.2 Think Gather (`server/src/core/think/gather.ts`)

**Status: ✅ Production-grade**

- Four parallel retrievers: hybrid page search, keyword takes, vector takes, graph traversal.
- Each stream wrapped in try/catch — partial gather failure doesn't crash the pipeline.
- RRF fusion (k=60) for takes streams.
- Source scoping on ALL four streams (`sourceId`, `sourceIds`).
- Question sanitization via `sanitizeQueryForPrompt` before any LLM prompt inclusion.

### 3.3 Think Prompt (`server/src/core/think/prompt.ts`)

**Status: 🟡 Generic, not legal-aware**

- System prompt is domain-agnostic ("gbrain's synthesis engine").
- No legal-specific instructions (no mention of § citations, jurisdiction, attorney review, confidentiality).
- Calibration and trajectory blocks are well-structured.

**Findings:**
- ⚠️ The system prompt does not instruct the model to cite statutes with version dates, flag attorney review requirements, or respect legal confidentiality. For a legal product, this is a significant quality gap — the model may produce legally-flavored output without the discipline a law firm requires.

---

## 4. Search / Retrieval

### 4.1 Hybrid Search (`server/src/core/search/hybrid.ts`)

**Status: ✅ Production-grade**

- Vector + BM25 + RRF fusion with compiled_truth boost (2.0x).
- Relational recall arm, adaptive return sizing, autocut, reranker.
- Token budget enforcement.
- Content flag stamping (v0.42).
- Query cache integration.

### 4.2 Graph Signals (`server/src/core/search/graph-signals.ts`)

**Status: ✅ Functional, no legal-specific signals**

- Three signals: adjacency-within-top-K (1.05×), cross-source adjacency (1.10×), session diversification (0.95×).
- Conservative magnitudes with floor-gate protection.
- Fail-open with audit writer.

**Findings:**
- ⚠️ No legal-entity-specific graph traversal. A query about "Gegner Müller in case X" should boost pages linked to the opponent entity, court, and case. The generic adjacency boost doesn't distinguish between "meeting notes linked to a person" and "evidence linked to a case."

### 4.3 Query Cache (`server/src/core/search/query-cache.ts`)

**Status: ✅ Production-grade**

- Semantic similarity cache (cosine ≥ 0.92 default).
- Source-scoped: cache key includes `sourceId`.
- `knobsHash` prevents cross-mode contamination (conservative vs tokenmax).
- TTL-based expiry (default 3600s).
- `buildPageGenerationsSnapshot` gate for cache invalidation.

**Findings:**
- ✅ Source isolation prevents cross-tenant cache leaks.
- ⚠️ No explicit invalidation when legal pages are updated. A new `legal_case` page or `evidence` page won't invalidate cached search results for related queries until TTL expires. For legal use, stale results could mean missing a newly-added deadline or evidence document.

---

## 5. Dream Cycle for Legal

**Status: ❌ No legal-specific cycle phases**

The dream cycle has generic phases:
- **Synthesize:** Creates synthesis pages from takes.
- **Extract:** Extracts takes from transcripts.
- **Patterns:** Detects patterns across entities.
- **Consolidate:** Consolidates duplicate facts.

**Missing legal-specific cycle phases:**
1. **Statute currency check:** Verify that statute sections in the brain match the latest published version. No mechanism exists.
2. **Deadline monitoring:** The `legal-case-scanner` minion handler exists but is a cron-triggered job, not a dream cycle phase. It cannot be triggered by the cycle engine.
3. **Case progression tracking:** No phase that tracks case status changes, new evidence, or strategy updates.
4. **Precedent linkage:** No phase that links case outcomes to similar precedents in the brain.

---

## 6. Minions / Subagents

### 6.1 Legal Case Scanner (`server/src/core/minions/handlers/legal-case-scanner.ts`)

**Status: ✅ Functional**

- Scans `legal_case` pages for: urgent deadlines (< 7 days), insufficient evidence, stale analyses (> 30 days).
- Launches supervisor jobs with `legal-researcher` and `legal-analyst` specialists.
- Source-scoped via `_source_id` parameter.

**Findings:**
- ✅ Source scoping via `_source_id`.
- ⚠️ Uses `engine.executeRaw` with string-interpolated `sourceClause` — the SQL is parameterized for values but the `sourceClause` is built via string concatenation. The `sourceStamp` value IS parameterized (`$2`), so this is safe, but the pattern is fragile — a future edit could introduce injection.
- ⚠️ N+1 queries: for each case, runs separate queries for deadlines, evidence count, and agent runs. At 50 cases (default max), this is 150+ queries. Should be batched.

### 6.2 Subagent Definitions (`plugins/sigmabrain-legal/subagents/`)

**Status: ✅ Well-scoped**

Six subagents defined:
1. **legal-researcher** — 10 tools, 25 turns. Research with citation discipline.
2. **legal-analyst** — 7 tools, 20 turns. Case analysis with confidence ratings.
3. **legal-strategist** — 7 tools, 20 turns. Strategy with alternatives and settlement ranges.
4. **legal-drafter** — 8 tools (includes `put_page`), 25 turns. Drafting with placeholders.
5. **legal-critic** — 7 tools, 20 turns. Quality checking for hallucinations and citation accuracy.
6. **legal-deadline-extractor** — 4 tools (includes `put_page`), 15 turns. Verbatim deadline extraction.

**Findings:**
- ✅ Tool scopes are minimal and appropriate. `put_page` only on drafter and deadline-extractor.
- ✅ All definitions end with "ersetzt keine anwaltliche Prüfung" disclaimer.
- ⚠️ No subagent has access to the legal domain modules (contract-draft, risk-analysis, etc.) because those are not MCP operations. The legal-drafter could benefit from calling `contract_draft` as a tool rather than generating text from its system prompt alone.

### 6.3 Plugin Loader (`server/src/core/minions/plugin-loader.ts`)

**Status: ✅ Strict and correct**

- Absolute paths only, rejects URLs and `~` prefixes.
- `plugin_version` lock (`gbrain-plugin-v1`).
- `allowed_tools` validated against registry at load time.
- Left-wins collision policy with warnings.
- Path escape prevention on `subagents` directory field.

---

## 7. Security & Compliance

### 7.1 Trust Boundary

**Status: ✅ Enforced**

- `remote` flag on `OperationContext` is the primary trust discriminator.
- `remote=true`: filesystem confinement on `file_upload`, facts visibility filtered to `'world'`, `save`/`take` blocked on think, `__all__` source scope defers to `sourceScopeOpts`.
- `remote=false`: full access for local CLI owner.
- PROTECTED job names cannot be submitted by MCP.

### 7.2 Source Scoping

**Status: ✅ Comprehensive**

- `sourceScopeOpts(ctx)` is the single source of truth for read scope.
- `resolveSourceScope` handles 3-way resolution with correct trust logic.
- All read operations (get_page, list_pages, search, query, think) route through it.
- Fuzzy slug resolution is source-scoped (v0.41.13 fix).

### 7.3 HMAC Pseudonymization

**Status: 🟡 Functional, with rotation gap**

- HMAC-SHA-256 with owner key for GDPR Art. 4 No. 5 pseudonymization.
- Key is passed as parameter, not stored in code.

**Findings:**
- 🚨 **No key rotation.** If the HMAC key is compromised, there is no `rotateKey(oldKey, newKey)` function. All pseudonymized data must be manually re-hashed. For a law firm SaaS handling Mandantendaten, this is a compliance gap that should be addressed before enterprise sales.
- ⚠️ Key is expected from environment variable — no documentation on which env var or how to set it securely in production.

### 7.4 GoBD Compliance

**Status: 🟡 Partial**

- GoBD integrity panel component exists (`src/components/gobd-integrity-panel.tsx`).
- Audit trail concept noted in gap analysis but not fully implemented (hash chain for document integrity).

**Findings:**
- ⚠️ No hash-chain audit trail for document modifications. GoBD requires manipulation-proof documentation of changes to accounting-relevant documents. The current system logs changes via `updated_at` timestamps but does not maintain a cryptographic hash chain.
- ⚠️ No GoBD-specific retention policy enforcement. Legal documents have different retention requirements (6-10 years depending on type) — the system has `purgeDeletedPages` but no retention schedule.

---

## 8. Frontend ↔ Engine Integration

### 8.1 Web API (`server/src/commands/web-api.ts`)

**Status: ✅ Comprehensive**

Legal endpoints (all source-scoped via `legalScope(req)`):
- `POST /api/legal/analyze` — document analysis with grounding
- `POST /api/legal/document-review` — Q&A review
- `POST /api/legal/summarize` — executive summary
- `POST /api/legal/memo` — legal memo generation
- `POST /api/legal/risk-analysis` — clause risk scoring
- `POST /api/legal/contract-draft` — contract drafting
- `POST /api/legal/contract-redline` — redlining
- `POST /api/legal/due-diligence` — checklist DD review

Non-legal endpoints:
- `GET/POST /api/pages` — page CRUD
- `GET /api/export` — DSGVO Art. 20 data export
- File upload with OCR
- Think/query proxy

**Findings:**
- ✅ All legal endpoints use `legalScope(req)` which combines `requestSourceId(req)` + `readSourcesFor(req)` for federated read.
- ✅ Input validation on every endpoint (required fields, enum validation).
- ✅ Error handling with `legalErr` helper (404 for not-found, 500 for others).
- ⚠️ `requireTenant` mode is available but not enforced by default — relies on environment variable.
- ⚠️ Rate limiting is not visible in the web-api layer — may be handled by upstream proxy.

### 8.2 Frontend Legal Features

**Status: ✅ Functional**

- `src/lib/legal-deadlines.ts` — Full DE+AT holiday calendar, § 222 ZPO / § 193 BGB deadline calculation.
- `src/lib/judgements.ts` — RIS-OGD (AT) + openlegaldata.io (DE) judgement search.
- `src/lib/legal-types.ts` — Frontend legal type definitions.

**Findings:**
- ✅ Holiday calendar covers all 16 German Bundesländer + Austria.
- ✅ Easter calculation via Gaussian formula — correct.
- ⚠️ No Swiss (CH) holiday calendar — `jurisdiction: 'ch'` is accepted by legal modules but deadline calculation doesn't support CH cantonal holidays.

---

## 9. Summary of Critical Findings

| # | Finding | Severity | Impact |
|---|---------|----------|--------|
| 1 | **No legal MCP operations** — legal modules only accessible via CLI and web-api HTTP, not via MCP protocol | 🚨 Critical | Agents cannot use legal tools; every competitor exposes these as first-class API ops |
| 2 | **No HMAC key rotation** — pseudonymization key cannot be rotated | 🚨 Critical | Compliance gap for enterprise sales; GDPR requires ability to re-key |
| 3 | **No statute version stamping** — `version_date` not stamped on individual section pages | 🚨 Critical | Cannot verify currency of legal texts; fundamental for legal AI |
| 4 | **Think prompt not legal-aware** — generic system prompt, no legal citation discipline | ⚠️ High | Legal output quality gap vs. competitors with legal-tuned prompts |
| 5 | **No legal dream cycle phases** — no statute currency check, deadline monitoring, case progression | ⚠️ High | Brain doesn't self-maintain legal knowledge |
| 6 | **Query cache not invalidated on legal page updates** — stale results until TTL | ⚠️ Medium | Could miss newly-added deadlines or evidence |
| 7. | **No GoBD hash-chain audit trail** — document changes not cryptographically logged | ⚠️ Medium | Enterprise compliance gap |
| 8 | **No Swiss holiday calendar** — CH deadline calculation incomplete | ⚠️ Medium | CH jurisdiction support incomplete |
| 9 | **N+1 queries in legal-case-scanner** — 150+ queries for 50 cases | ⚠️ Low | Performance at scale |
| 10 | **PII detection is regex-based** — no NER pipeline | ⚠️ Low | False positives/negatives on edge cases |

---

## 10. Architecture Strengths

1. **Grounding as first principle** — Every legal LLM module (risk-analysis, document-review, contract-redline, analyze-document) implements verbatim quote grounding. Fabricated content is dropped, not displayed. This is the single most important anti-hallucination mechanism and it is consistently applied.

2. **Source scoping everywhere** — `sourceScopeOpts(ctx)` is the universal source-of-truth for read scope. Every read path routes through it. Multi-tenant isolation is architectural, not bolted on.

3. **`attorney_review_required: true`** — Every legal output type carries this flag as a hardcoded `true` literal. It cannot be bypassed by configuration or caller. This is the correct posture for a legal product.

4. **Dependency-injected LLM** — All legal modules accept an injected `LegalLLM` / `AnalyzeLLM` interface. Tests run without API keys. Production uses the gateway adapter.

5. **Plugin system** — Subagent definitions are externally loadable via `GBRAIN_PLUGIN_PATH`. Tool scopes are validated at load time. This allows law firms to customize agent behavior without modifying core code.

6. **91 MCP operations** — The engine exposes a comprehensive operation surface for general brain operations. The infrastructure for adding legal operations exists — they just haven't been registered yet.
