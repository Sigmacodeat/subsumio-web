# Legal AI Next-Level Optimization Plan — July 2026

## Status: DRAFT — Pending User Approval

---

## Executive Summary

This plan identifies **12 critical optimization areas** that separate Subsumio from state-of-the-art legal AI systems (Harvey, CoCounsel, Lexis+ Protege). Each gap is benchmarked against external research, competitor analysis, and EU AI Act requirements. The plan is prioritized by production impact and ordered for sequential implementation.

**Current State**: The system has a strong foundation — 7-layer pipeline, hybrid search with RRF, citation guardrails, cross-verify, ensemble critic, graph search, model routing, 90% judge accuracy, 10% hallucination rate, 5257 tests passing.

**Target State**: Production-grade legal AI that matches or exceeds Harvey/CoCounsel in accuracy, transparency, and compliance — at 1/1000th the cost.

---

## Gap Analysis vs. State-of-the-Art

### What Subsumio ALREADY has (✅ confirmed in codebase):

| Capability | Status | Evidence |
|-----------|--------|----------|
| Hybrid search (BM25 + vector + RRF) | ✅ | `legal-graph/search.ts` — RRF k=60, citation boosts |
| Authority-aware reranking | ✅ | `legal-graph/reranking.ts` — court level, recency, treatment |
| Treatment status (good_law/bad_law/at_risk) | ✅ | `legal-graph/validation.ts` — Shepard's equivalent |
| Court hierarchy classification | ✅ | `legal-graph/import.ts` — BGH→supreme, OLG→appeals, etc. |
| Citation guardrail (deterministic) | ✅ | `citation-guardrail.ts` — §-grounding, law validation |
| Cross-verify (semantic hallucination check) | ✅ | `think/cross-verify.ts` — 24K context, 8K answer window |
| Ensemble critic (3-model consensus) | ✅ | `legal-pipeline.ts` Layer 7 — GPT + DeepSeek + Gemini |
| Subsumption checker | ✅ | `legal-pipeline.ts` — Obersatz → Untersatz → Schluss |
| Opponent simulator | ✅ | `legal-pipeline.ts` Layer 6.5 — counter-arguments |
| Model routing (intent-specific) | ✅ | `think/intent.ts` — complexity → tier mapping |
| True token streaming | ✅ | `think/index.ts` — `gatewayChatStream` |
| Graph search (relational fan-out) | ✅ | `think/gather.ts` — depth=2, limit=20 |
| Section-aware chunking | ✅ | `split-statute.ts` — DE/AT/CH/EU formats, inline recovery |
| Multi-tenant isolation | ✅ | Phase 4b — zero leakage verified |
| GoBD audit log (immutable hash chain) | ✅ | `audit.ts` — trigger-based immutability |
| AI certification (provenance + review) | ✅ | `ai-certification.ts` — model, citations, confidence |
| Regulatory monitors | ✅ | `regulatory-monitors.ts` — amendment detection |
| Corpus freshness tracking | ✅ | `source-registry.ts` — hash diff, stale detection |
| Memory (copilot, temporal validity) | ✅ | `copilot-memory.ts` — valid_from/valid_to, supersession |
| EU AI Act Art. 50 notice | ✅ | `ai-act.ts` — AI badge + notice |
| 7-layer case processing pipeline | ✅ | 27+ specialists, 20+ analysis dimensions |
| DE/CH judikatur import scripts | ✅ | `ingest-de-judikatur.ts`, `ingest-ch-judikatur.ts` |

### What Subsumio is MISSING (gaps identified):

---

## PRIORITY 1 — CRITICAL (Production Blockers)

### Gap 1: Claim-Level Confidence Scoring with Calibration

**Problem**: The system has `confidenceScore` in `ai-certification.ts` but it's just the pipeline's `total_score` — a single document-level number. There is no per-claim confidence decomposition, no calibration against observed outcomes, and no transparent uncertainty surfacing to the user.

**Research basis**:
- SwarmSignal (2026): "Confidence scoring works at two levels. Document-level confidence reflects how well the retrieved sources match the query. Claim-level confidence reflects how well each specific assertion in the generated output is supported by the retrieved sources."
- TrustPlane (EU AI Act compliance): `C = p × (1 − Ue − Ua)` — epistemic + aleatoric uncertainty model
- Calibrated CSS (arXiv 2026): Claim-level specificity control — "answer only as precisely as justified"
- Self-consistency voting (Zenodo 2026): HIGH/MEDIUM/LOW confidence via vote entropy, 91-99% accuracy on HIGH, <43% on LOW, ECE 5.13%

**Competitor comparison**:
- Harvey: Attorney verification required (no intrinsic confidence scoring)
- CoCounsel: KeyCite integrated (citation-level only, not claim-level)
- Lexis+ Protege: Shepard's signals (precedent-level only)
- **None of the competitors have claim-level confidence scoring** — this is a differentiation opportunity

**Implementation plan**:
1. **Claim decomposition**: Split generated answer into individual factual claims (regex + LLM-assisted)
2. **Per-claim grounding score**: For each claim, check if it's supported by retrieved context (extend `citation-guardrail.ts`)
3. **Document-level confidence**: Aggregate claim scores using calibrated formula (not simple average)
4. **Self-consistency voting** (optional, for high-stakes): Sample 3 responses, compute vote entropy → HIGH/MEDIUM/LOW
5. **UI surfacing**: Show per-claim confidence indicators (green/yellow/red) alongside the answer
6. **Calibration tracking**: Log predicted confidence vs. actual correctness (from judge/attorney review) → compute ECE over time

**Files to modify**:
- `server/src/core/citation-guardrail.ts` — extend with claim decomposition
- `src/lib/ai-certification.ts` — add `claim_confidences: ClaimConfidence[]` field
- `src/components/chat/` — UI for per-claim confidence display
- NEW: `server/src/core/confidence-scoring.ts` — calibration logic

**Acceptance criteria**:
- Every AI output has per-claim confidence scores (0-1)
- Claims with no grounding in retrieved context score < 0.3
- UI shows color-coded confidence per claim
- ECE tracked over 100+ outputs, target < 10%

---

### Gap 2: Provenance Chain — Click-Through from Claim to Source Passage

**Problem**: The system cites slugs (e.g., `[legal/statutes/de/estg/p-15]`) but doesn't provide a direct click-through from a specific claim in the answer to the exact passage in the source document that supports it. The user cannot trace "which sentence in § 15 EStG supports this specific claim?"

**Research basis**:
- SwarmSignal (2026): "The interface should present retrieved sources alongside generated text, with clear provenance links showing which source supports which claim. Attorneys shouldn't have to guess where the AI got its information. They should be able to click through to the original document, read the relevant passage in context."
- Conectia (Bonus Iuri, 2026): "A transparency chain: the user can trace any legal claim back to a specific article of a specific law."
- LegalGraphRAG (ACL 2026): Researcher → Auditor → Adjudicator pipeline with evidence-based reasoning

**Competitor comparison**:
- CoCounsel: Westlaw integration with KeyCite links
- Lexis+ Protege: Shepard's citation signals with direct links
- Harvey: Source citations but not passage-level granularity

**Implementation plan**:
1. **Passage-level citation format**: Change citation format from `[slug]` to `[slug:char_start-char_end]` or `[slug#section]`
2. **Retrieval metadata propagation**: Carry chunk character offsets from retrieval through to generation
3. **Provenance map**: Build a map from each claim → supporting passage(s) with exact text
4. **UI provenance panel**: On claim hover/click, show the exact source passage highlighted in context
5. **Audit trail**: Log the full provenance chain in the certification record

**Files to modify**:
- `server/src/core/think/prompt.ts` — instruct model to cite with passage references
- `server/src/core/think/gather.ts` — propagate chunk offsets to context
- `src/components/chat/` — provenance panel UI
- `src/lib/ai-certification.ts` — add `provenance_chain` field

**Acceptance criteria**:
- Every claim in an AI answer has a clickable provenance link
- Clicking shows the exact source passage with highlighting
- Provenance chain is stored in certification record for audit

---

### Gap 3: Automated Corpus Freshness Pipeline — Statute Amendment Detection

**Problem**: The system has `source-registry.ts` with hash-based diff detection and `regulatory-monitors.ts` with amendment inference, but there is no automated pipeline that:
1. Periodically fetches the latest statute versions from official sources (gesetze-im-internet.de, RIS, lexfind.ch)
2. Diffs against the current corpus
3. Re-imports changed sections into the brain
4. Flags affected pipeline outputs that cited now-changed §§

The current `law-sync` cron route exists but only syncs judgements, not statutes.

**Research basis**:
- Conectia (2026): "Spanish legislation isn't static. Amendments and corrections appear regularly. A system citing an outdated article version — one that was amended months ago — produces analysis that is technically incorrect. Keeping the legislation index current is an operational cost most prototypes ignore."
- EU AI Act Art. 9: Risk management system must be "continuous iterative process"
- EU AI Act Art. 72: Post-market monitoring — "actively and systematically collect, document, and analyze relevant data"

**Competitor comparison**:
- Lexis+ Protege: 200B+ documents, 4M+ new documents daily — real-time updates
- CoCounsel: Westlaw database updates propagated in near-real-time
- Harvey: Firm-specific training data updates on contract

**Implementation plan**:
1. **Official source connectors**:
   - DE: `gesetze-im-internet.de` XML API (all federal laws)
   - AT: `RIS-OGD` API v2.6 (BKA official)
   - CH: `lexfind.ch` / `fedlex.ch` API
   - EU: `EUR-Lex` webservices
2. **Diff engine**: Compare fetched version vs. corpus file (semantic diff, not just hash)
3. **Selective re-import**: Only re-import changed §§, not entire laws
4. **Stale citation alert**: When a pipeline output cites a § that has been amended since the output was generated, flag it
5. **Dashboard widget**: Show corpus freshness status (last sync, pending changes, stale sources)

**Files to modify**:
- `src/app/api/cron/law-sync/route.ts` — extend with statute sync
- NEW: `server/scripts/sync-statutes-de.ts` — gesetze-im-internet.de fetcher
- NEW: `server/scripts/sync-statutes-at.ts` — RIS-OGD fetcher
- NEW: `server/scripts/sync-statutes-ch.ts` — lexfind.ch fetcher
- `src/lib/source-registry.ts` — add statute-specific freshness logic
- `src/components/dashboard/` — freshness widget

**Acceptance criteria**:
- Cron job runs daily, fetches latest statute versions from all 4 jurisdictions
- Changed §§ are detected, re-imported, and re-embedded within 24h
- Stale citation alerts appear on affected pipeline outputs
- Dashboard shows freshness status per jurisdiction

---

## PRIORITY 2 — HIGH (Competitive Differentiators)

### Gap 4: Hierarchical Legal Knowledge Graph (LegalGraphRAG Pattern)

**Problem**: The system has a flat judgement citation graph (`subsumio_judgement_citations`) but no hierarchical knowledge graph that organizes legal sources by abstraction level: Facts → Rules → Principles → Precedents. The LegalGraphRAG paper (ACL 2026) proves this structure significantly improves legal reasoning quality.

**Research basis**:
- LegalGraphRAG (ACL 2026): "A hierarchical legal graph that hierarchically organizes legal sources to enable retrieval at appropriate abstraction levels" — Fact Graph, Ontology Graph, Rule Graph
- Researcher-Auditor-Adjudicator pattern: explicit verification step before synthesis
- Our graph search (`think/gather.ts`) does relational fan-out but on flat slug relationships, not a typed hierarchical graph

**Implementation plan**:
1. **Graph schema extension**: Add edge types: `cites_statute`, `applies_principle`, `distinguishes_from`, `overrules`, `interprets_article`
2. **Statute ↔ Judgement linking**: When a judgement cites § X, create a typed edge in the graph
3. **Principle extraction**: LLM-assisted extraction of legal principles from landmark cases
4. **Hierarchical retrieval**: Query the graph at the appropriate abstraction level (fact-level for specific cases, principle-level for general questions)
5. **Auditor agent**: Before synthesis, verify that retrieved evidence actually supports the claims (cross-check with source text)

**Files to modify**:
- `src/lib/legal-graph/schema.ts` — add typed edges
- `src/lib/legal-graph/search.ts` — hierarchical retrieval queries
- NEW: `src/lib/legal-graph/principle-extraction.ts` — LLM-assisted principle extraction
- `server/src/core/think/gather.ts` — integrate hierarchical retrieval

**Acceptance criteria**:
- Graph contains typed edges (cites_statute, overrules, distinguishes_from, etc.)
- Retrieval returns results at appropriate abstraction level
- Auditor agent verifies evidence before synthesis
- Benchmark: Hit@5 improves on complex cross-law questions

---

### Gap 5: Multi-Model Ensemble Verification (Citation Engine Pattern)

**Problem**: The ensemble critic in Layer 7 uses 3 models for consensus, but citation verification is single-model. The LegalQuants citation engine pattern uses a cascade: exact match → fuzzy match → paraphrase judge → ensemble strict (N parallel judges). This catches more subtle hallucinations than single-model verification.

**Research basis**:
- LegalQuants (2026): 4-stage citation verification cascade with ensemble option
- LEXam paper: `min(DeepSeek-V3, Qwen3-32B)` ensemble surpasses human judges
- Our Phase 5b showed 10% hallucination rate — the remaining 2/20 were semantic errors that "no deterministic guardrail can catch"
- Self-consistency voting (Zenodo 2026): cross-model validation reduces false confidence floor

**Implementation plan**:
1. **Stage 1 (existing)**: Exact match — does the cited § exist in context? (deterministic, free)
2. **Stage 2 (existing)**: Fuzzy match — does the cited passage approximately match? (deterministic, free)
3. **Stage 3 (new)**: Paraphrase judge — does the source actually support the claim? (single LLM call, cheap)
4. **Stage 4 (new, opt-in)**: Ensemble strict — N parallel judges from different model families (DeepSeek + Grok + GPT), majority vote
5. **Cost guard**: Pre-flight cost check, fall back to Stage 3 if ensemble cost exceeds cap
6. **Activation**: Stage 4 activated for high-stakes outputs (legal drafts, subsumptions) or on user flag

**Files to modify**:
- `server/src/core/citation-guardrail.ts` — add Stage 3 + 4
- `server/src/core/think/cross-verify.ts` — integrate ensemble option
- NEW: `server/src/core/ensemble-verify.ts` — multi-model parallel verification
- `src/lib/ai-certification.ts` — add `verification_method` and `verification_confidence` fields

**Acceptance criteria**:
- Stage 3 runs on every citation (adds ~0.5s latency)
- Stage 4 runs on high-stakes outputs when budget allows
- `verification_method` persisted on every certification record
- Hallucination rate drops from 10% to <5% on benchmark

---

### Gap 6: Adversarial Robustness — Prompt Injection & Jailbreak Defense

**Problem**: Legal AI systems are high-value targets for prompt injection. A malicious document (uploaded as evidence) could contain instructions that override the system prompt, causing the AI to produce false legal analysis. The current system has no explicit defense against this.

**Research basis**:
- Mata v. Avianca: Lawyer sanctioned for AI-fabricated citations — the system must be robust against adversarial inputs
- Adaptive Query (2026): "An admissibility predicate that takes a candidate transition and the matter state and returns admit, reject, or steer-toward-alternative"
- EU AI Act Art. 15: High-risk AI systems must be "resilient against errors, faults, inconsistencies and attacks"

**Implementation plan**:
1. **Input sanitization**: Scan uploaded documents for prompt injection patterns ("ignore previous instructions", "you are now...", system prompt overrides)
2. **Document/system prompt isolation**: Clearly separate document content from system instructions in the prompt structure (XML tags, special delimiters)
3. **Output validation**: Check if the output contains content from injected instructions rather than legal analysis
4. **Adversarial test suite**: Generate adversarial documents with known injection patterns, verify the system rejects them
5. **Audit log**: Log all detected injection attempts

**Files to modify**:
- `server/src/core/extract-document.ts` — add injection scanner
- `server/src/core/think/prompt.ts` — isolation delimiters
- NEW: `server/src/core/adversarial-defense.ts` — injection detection
- NEW: `tests/e2e-playwright/adversarial-injection.spec.ts` — test suite

**Acceptance criteria**:
- 100% of known injection patterns are detected and blocked
- Uploaded document content cannot override system instructions
- Injection attempts are logged in audit trail
- Adversarial test suite passes

---

### Gap 7: Transition-Level Audit Log (EU AI Act Art. 12)

**Problem**: The current audit log (`audit.ts`) records user actions (create, edit, delete) but not individual AI reasoning steps. EU AI Act Art. 12 requires "automatic recording of events relevant for identifying situations that may result in the AI system presenting a risk." The current log captures the final output but not the reasoning chain: which chunks were retrieved, which model was used, which guardrail flags were raised, which retries occurred.

**Research basis**:
- EU AI Act Art. 12(2)(a): "identifying situations that may result in the high-risk AI system presenting a risk"
- Adaptive Query (2026): "An immutable transition log in which every evaluated candidate, the predicate's verdict, and the rule that governed the verdict are recorded"
- prEN ISO/IEC 24970: AI system logging standard (in development)
- TrustPlane: "Every decision is logged, exportable, and mapped to EU AI Act requirements"

**Implementation plan**:
1. **Reasoning trace**: For each AI output, log: query → retrieved chunks (with scores) → model used → prompt → raw output → guardrail flags → retry attempts → final output
2. **Immutable storage**: Extend the existing hash-chained audit log with reasoning traces
3. **Export format**: CSV + PDF export in EU AI Act Art. 13 format for compliance audits
4. **Webhook dispatch**: ESCALATE and BLOCK events trigger configurable webhooks
5. **Retention policy**: Configurable retention period (default: 10 years for GoBD compliance)

**Files to modify**:
- `src/lib/audit.ts` — add reasoning trace logging
- NEW: `src/lib/ai-reasoning-trace.ts` — trace capture and storage
- `src/app/dashboard/settings/` — export UI for compliance
- `src/lib/ai-certification.ts` — link certification to reasoning trace

**Acceptance criteria**:
- Every AI output has a complete reasoning trace
- Traces are immutable (hash-chained, trigger-protected)
- CSV/PDF export available for compliance audits
- Traces retained for configurable period (default 10 years)

---

## PRIORITY 3 — MEDIUM (Quality Improvements)

### Gap 8: Cross-Model Verification Replacing Self-Refine

**Problem**: Phase 5 showed that self-refine (same model reviewing its own output) is counterproductive — it changes 100% of answers but often adds errors. The current pipeline has a self-refine step that should be replaced with cross-model verification.

**Research basis**:
- Our own Phase 5 benchmark: "Self-Refine with same model is counterproductive — it changes 100% of answers but often adds more errors"
- Recommendation from Phase 5: "Replace Self-Refine with cross-model verification: DeepSeek generates → different model verifies → flag disagreements"
- LEXam paper: Cross-model ensembles outperform single-model self-refine

**Implementation plan**:
1. **Remove self-refine step** from the think pipeline
2. **Add cross-model verify**: DeepSeek generates → Grok 4.3 (or GPT-4o-mini) verifies → flag disagreements
3. **Disagreement resolution**: When models disagree, escalate to ensemble critic (existing Layer 7)
4. **Cost optimization**: Cross-model verify only on complex queries (use existing `classifyLegalComplexity`)

**Files to modify**:
- `server/src/core/think/index.ts` — replace self-refine with cross-model verify
- NEW: `server/src/core/think/cross-model-verify.ts` — cross-model verification logic

**Acceptance criteria**:
- Self-refine removed from pipeline
- Cross-model verify runs on complex queries
- Disagreements escalate to ensemble critic
- Benchmark: hallucination rate ≤ 5% (from current 10%)

---

### Gap 9: Context Window Optimization — Sliding Window for Long Documents

**Problem**: The think pipeline has a fixed context window. When processing long court files (100+ pages), the context may overflow, causing the model to miss relevant information in later pages. There's no sliding window or hierarchical summarization mechanism.

**Research basis**:
- HAQQ Legal Engineering (2026): "Fan-out/fan-in architecture: dispatch dozens of specialized AI agents simultaneously, collect their results as they finish, and aggregate everything into a single coherent analysis"
- Conectia (2026): "Section-aware chunking pipeline that parses legislative structure before splitting"
- Our LongMemEval benchmark: Top-K=5 is optimal for memory recall, but complex legal questions may need broader context

**Implementation plan**:
1. **Hierarchical context assembly**: For long documents, first summarize each section, then use summaries + key passages as context
2. **Sliding window**: For very long outputs, process in overlapping windows and stitch
3. **Context budget management**: Dynamic allocation of context budget between retrieval chunks, document context, and generation space
4. **Map-reduce for multi-document**: When multiple documents are relevant, map each to a summary, then reduce summaries into final context

**Files to modify**:
- `server/src/core/think/gather.ts` — hierarchical context assembly
- NEW: `server/src/core/think/context-budget.ts` — context budget manager
- `server/src/core/think/prompt.ts` — sliding window prompts

**Acceptance criteria**:
- Long documents (100+ pages) are processed without context overflow
- Key information from later pages is not lost
- Context budget is dynamically allocated based on query complexity

---

### Gap 10: Fine-Tuning Pipeline — DACH-Law Specialized Model

**Problem**: All competitors use general-purpose models (GPT, Claude, Gemini). No legal AI competitor has a jurisdiction-specific fine-tuned model. Our law-corpus contains BGB, ZPO, ABGB, HGB, StGB, AO, EStG, etc. — perfect training data for a DACH-law specialized model. This is the single biggest competitive moat available.

**Research basis**:
- LEXam benchmark: DeepSeek-V3.2 (57.42) is the best open-weight, but fine-tuning on DACH law could push it past GPT-5 (70.20)
- DeutscheLexAI_BGB: 3B params proves German fine-tuning works, but too small for production
- SaulLM-141B: 540B legal tokens, English-only — proves the approach scales
- Unsloth: Supports Qwen3.5 LoRA fine-tuning
- Our cost model: €838/month Hetzner GEX131 (48GB VRAM) + one-time €1,500

**Implementation plan**:
1. **Training data preparation**: Convert law-corpus to instruction-tuning format (§ → question → answer)
2. **LoRA fine-tuning**: Qwen3.5-32B or DeepSeek-V3.2-Base + LoRA on DACH law corpus
3. **Evaluation**: Run our existing benchmark suite (Phases 1-5b) on the fine-tuned model
4. **Deployment**: Self-hosted on Hetzner, or via OpenRouter custom endpoint
5. **Fallback**: Keep DeepSeek V4 Flash as fallback for when fine-tuned model is unavailable

**Files to modify**:
- NEW: `server/scripts/prepare-finetune-data.ts` — convert law-corpus to instruction format
- NEW: `server/scripts/finetune-model.ts` — LoRA training script
- NEW: `server/scripts/eval-finetuned.ts` — benchmark against existing suite
- `server/src/core/model-config.ts` — add fine-tuned model as a tier option

**Acceptance criteria**:
- Fine-tuned model achieves ≥65 LEXam (vs. 57.42 base DeepSeek)
- Hallucination rate ≤ 5% on our benchmark
- Cost per query ≤ $0.001 (self-hosted)
- Model available as a `deep` tier option in model routing

---

### Gap 11: Workflow Engine — Custom Agent Builder (Harvey Pattern)

**Problem**: Harvey's key differentiator is the Agent Builder — firms create custom agents encoding their own workflows, risk frameworks, and institutional knowledge. Subsumio has 27+ embedded specialists but no way for users to create custom agents or workflows.

**Research basis**:
- Harvey: 25,000 custom agents across 1,300 organizations
- Lexis+ Protege: 300+ pre-built workflows
- CoCounsel: Multi-agent Deep Research with specialized agents per task
- HAQQ Legal Engineering: "A legal engineer designs a system of twenty or thirty coordinated AI calls"

**Implementation plan**:
1. **Workflow definition schema**: JSON/YAML format for defining multi-step agent workflows
2. **Workflow builder UI**: Drag-and-drop interface for creating custom workflows
3. **Step types**: LLM call, retrieval, document analysis, drafting, review, approval
4. **Shared workflow library**: Users can share and import workflows
5. **Pre-built templates**: Common legal workflows (contract review, due diligence, motion drafting)

**Files to modify**:
- NEW: `src/lib/workflow-engine/types.ts` — workflow schema
- NEW: `src/lib/workflow-engine/executor.ts` — workflow execution engine
- NEW: `src/app/dashboard/workflows/` — workflow builder UI
- NEW: `src/components/workflow/` — workflow components

**Acceptance criteria**:
- Users can create, edit, and execute custom workflows
- Workflows can be shared between users
- 10+ pre-built templates available
- Workflows integrate with existing specialists and tools

---

## PRIORITY 4 — LOW (Future Moats)

### Gap 12: Multi-Language Legal Reasoning (EU Expansion)

**Problem**: The system is optimized for DACH law (DE/AT/CH). EU expansion requires support for FR, IT, ES, PL, NL legal systems. The law-corpus has EU regulations but no national laws from other member states.

**Research basis**:
- EU AI Act applies to all EU member states
- Harvey: US-focused but expanding internationally
- Conectia (Bonus Iuri): Spanish law — proves the pattern works for other jurisdictions

**Implementation plan**:
1. **Corpus expansion**: Import FR, IT, ES, PL, NL core statutes
2. **Multilingual chunking**: Extend `split-statute.ts` for non-German legal document structures
3. **Language detection**: Auto-detect query language and route to appropriate corpus
4. **Cross-jurisdictional reasoning**: When a question spans multiple jurisdictions (e.g., EU directive implementation in DE vs. AT)

**Files to modify**:
- `law-corpus/` — add fr/, it/, es/, pl/, nl/ directories
- `server/src/core/legal/split-statute.ts` — extend for non-German formats
- `server/src/core/think/intent.ts` — language detection + jurisdiction routing

**Acceptance criteria**:
- 5+ EU jurisdictions supported
- Auto-detection routes to correct corpus
- Cross-jurisdictional questions handled correctly

---

## Implementation Order

| Phase | Gap | Effort | Impact | Dependencies |
|-------|-----|--------|--------|-------------|
| 1 | Gap 1: Claim-level confidence | 3-4 days | Critical | None |
| 2 | Gap 2: Provenance chain | 3-4 days | Critical | None |
| 3 | Gap 3: Corpus freshness | 4-5 days | Critical | None |
| 4 | Gap 8: Cross-model verify | 2-3 days | High | None |
| 5 | Gap 5: Ensemble verification | 3-4 days | High | Gap 8 |
| 6 | Gap 7: Transition audit log | 3-4 days | High | None |
| 7 | Gap 6: Adversarial defense | 2-3 days | High | None |
| 8 | Gap 4: Hierarchical graph | 5-6 days | High | None |
| 9 | Gap 9: Context window opt | 3-4 days | Medium | None |
| 10 | Gap 10: Fine-tuning | 2-3 weeks | Medium | Gaps 1-9 done |
| 11 | Gap 11: Workflow engine | 1-2 weeks | Medium | None |
| 12 | Gap 12: Multi-language | 2-3 weeks | Low | Gaps 1-11 done |

**Total estimated effort**: ~10-12 weeks for all 12 gaps.

---

## Competitive Positioning After Implementation

| Capability | Subsumio (current) | Subsumio (after) | Harvey | CoCounsel | Lexis+ |
|-----------|-------------------|-----------------|--------|-----------|--------|
| Claim-level confidence | ❌ | ✅ | ❌ | ❌ | ❌ |
| Provenance chain | Partial | ✅ | Partial | ✅ | ✅ |
| Corpus freshness | Manual | ✅ Automated | ✅ | ✅ | ✅ |
| Hierarchical graph | Flat | ✅ Hierarchical | ❌ | ❌ | ❌ |
| Ensemble verification | Layer 7 only | ✅ Per-citation | ❌ | ❌ | ❌ |
| Adversarial defense | ❌ | ✅ | ❌ | ❌ | ❌ |
| Transition audit log | Action-level | ✅ Transition-level | ❌ | ❌ | ❌ |
| Cross-model verify | Self-refine | ✅ Cross-model | ❌ | ❌ | ❌ |
| Fine-tuned DACH model | ❌ | ✅ | ❌ | ❌ | ❌ |
| Workflow builder | ❌ | ✅ | ✅ | ❌ | ✅ |
| Cost/user/month | ~$0.11 | ~$0.15 | ~$1,200 | $225 | $275 |
| EU AI Act compliance | Partial | ✅ Full | ❌ | Partial | Partial |
| Self-hosted option | ✅ | ✅ | ❌ | ❌ | ❌ |

**After implementation, Subsumio will be the only legal AI system with**:
1. Claim-level confidence scoring with calibration
2. Hierarchical legal knowledge graph
3. Per-citation ensemble verification
4. Transition-level audit logging (EU AI Act Art. 12)
5. Fine-tuned DACH-law model
6. Self-hosted option with full EU compliance
7. At 1/1000th the cost of Harvey

---

## Self-Audit Checklist (Definition of Done)

- [ ] Every AI output has per-claim confidence scores
- [ ] Every claim has a clickable provenance link to source passage
- [ ] Corpus freshness pipeline runs daily, detects amendments within 24h
- [ ] Self-refine replaced with cross-model verification
- [ ] Ensemble citation verification available for high-stakes outputs
- [ ] Adversarial injection test suite passes
- [ ] Transition-level audit log captures full reasoning chain
- [ ] Hierarchical graph with typed edges operational
- [ ] Long documents processed without context overflow
- [ ] Fine-tuned model achieves ≥65 LEXam
- [ ] Custom workflow builder available to users
- [ ] All existing tests still pass (5257+)
- [ ] New tests for each gap (target: 200+ new tests)
- [ ] EU AI Act compliance audit passed
- [ ] Benchmark: hallucination rate ≤ 5% (from 10%)
- [ ] Benchmark: judge accuracy ≥ 95% (from 90%)
