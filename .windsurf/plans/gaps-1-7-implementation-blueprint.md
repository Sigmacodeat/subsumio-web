# Implementation Blueprint — Gaps 1-7

## Status: READY FOR IMPLEMENTATION

---

## Gap 1: Claim-Level Confidence Scoring with Calibration

### Blueprint

**Ziel**: Jede AI-Antwort hat per-claim Confidence Scores (0-1) mit Kalibrierung.

**Userflows**:

1. User stellt Frage → AI antwortet → jeder Claim hat Confidence-Indikator (grün/gelb/rot)
2. Dashboard zeigt aggregierte Confidence + ECE-Trend
3. Audit-Export enthält per-claim Confidence mit Begründung

**Datenmodell**:

```typescript
interface ClaimConfidence {
  claim_text: string; // The actual sentence/claim
  claim_index: number; // Position in answer
  confidence: number; // 0-1 calibrated score
  level: "high" | "medium" | "low";
  factors: {
    has_citation: boolean;
    citation_grounded: boolean; // § exists in context
    citation_verified: boolean; // Cross-verify confirmed
    hedging_detected: boolean;
    guardrail_flags: number;
    cross_verify_flags: number;
  };
  supporting_passages: string[]; // Slugs that support this claim
}

interface DocumentConfidence {
  overall_confidence: number; // 0-1 calibrated
  confidence_level: "high" | "medium" | "low";
  claim_confidences: ClaimConfidence[];
  calibration: {
    ece: number; // Expected Calibration Error
    sample_count: number;
    last_updated: string;
  };
}
```

**Architektur-Entscheidungen**:

- Claim decomposition: Sentence-level (reuse `CLAIM_SENTENCE_RX` from ai-quality.ts)
- Per-claim grounding: Check if claim's §-citations appear in context (reuse `citationInContext` logic)
- Confidence formula: `C = w1 * citation_grounded + w2 * no_guardrail_flags + w3 * no_hedging + w4 * cross_verify_clean`
  - w1=0.4 (citation grounding is most important)
  - w2=0.25 (guardrail flags indicate hallucination)
  - w3=0.15 (hedging indicates uncertainty)
  - w4=0.2 (cross-verify catches semantic errors)
- Level thresholds: HIGH ≥ 0.8, MEDIUM ≥ 0.5, LOW < 0.5
- Calibration: Track predicted confidence vs. actual correctness (from judge/attorney review)
- ECE: Bin into 10 buckets, sum |accuracy - confidence| \* bin_size

**Files to create/modify**:

1. NEW: `server/src/core/confidence-scoring.ts` — Core module
2. MODIFY: `server/src/core/think/index.ts` — Integrate after cross-verify
3. MODIFY: `src/lib/ai-certification.ts` — Add `claimConfidences` field
4. NEW: `server/test/confidence-scoring.test.ts` — Tests

**Integration point in think/index.ts** (after line 915, before streaming):

```typescript
// ── Claim-Level Confidence Scoring ──
let documentConfidence: DocumentConfidence | undefined;
if (legalMode && response.answer && !opts.stubResponse) {
  const guardrailContext = pagesBlock + "\n" + takesBlock;
  documentConfidence = computeDocumentConfidence({
    answer: response.answer,
    context: guardrailContext,
    guardrailResult: lastGuardrailResult,
    crossVerifyResult: lastCrossVerifyResult,
  });
  warnings.push(
    `CONFIDENCE: ${documentConfidence.confidence_level} (${documentConfidence.overall_confidence.toFixed(2)})`
  );
}
```

**ThinkResult extension**:

```typescript
export interface ThinkResult {
  // ... existing fields ...
  documentConfidence?: DocumentConfidence;
}
```

**Acceptance criteria**:

- [ ] Every AI output has per-claim confidence scores
- [ ] Claims with no grounding score < 0.3
- [ ] Claims with grounded citations + no flags score > 0.8
- [ ] ECE tracked over time (persisted to DB or file)
- [ ] 20+ unit tests covering edge cases

---

## Gap 2: Provenance Chain — Click-Through from Claim to Source Passage

### Blueprint

**Ziel**: Jeder Claim in einer AI-Antwort hat einen klickbaren Link zur exakten Quellen-Passage.

**Datenmodell**:

```typescript
interface ProvenanceLink {
  claim_index: number;
  claim_text: string;
  source_slug: string;
  source_passage: string; // The exact text from the source
  passage_start: number; // Character offset in source
  passage_end: number;
  relevance: "direct" | "paraphrase" | "background";
}
```

**Architektur-Entscheidungen**:

- Passage-level citation: Extend citation format to `[slug#section]` or carry character offsets
- Retrieval metadata: Propagate chunk text + offsets from gather.ts through to confidence scoring
- Provenance map: Built during claim decomposition — for each claim, find which context chunk contains the cited §
- UI: On claim hover, show source passage in a popover/panel

**Files to create/modify**:

1. NEW: `server/src/core/provenance.ts` — Provenance chain builder
2. MODIFY: `server/src/core/think/gather.ts` — Propagate chunk offsets
3. MODIFY: `server/src/core/confidence-scoring.ts` — Integrate provenance
4. MODIFY: `src/lib/ai-certification.ts` — Add `provenanceChain` field
5. MODIFY: `src/components/chat/` — Provenance panel UI (deferred to frontend phase)

**Acceptance criteria**:

- [ ] Every claim with a citation has a provenance link
- [ ] Provenance link includes exact source passage text
- [ ] Provenance chain stored in certification record
- [ ] 15+ unit tests

---

## Gap 3: Automated Corpus Freshness Pipeline

### Blueprint

**Ziel**: Daily automated sync of statutes from official sources, with diff detection and stale citation alerts.

**Userflows**:

1. Cron job runs daily → fetches latest statutes → diffs → re-imports changed §§
2. Dashboard shows freshness status per jurisdiction
3. Pipeline outputs citing changed §§ get stale alerts

**Architektur-Entscheidungen**:

- DE: gesetze-im-internet.de XML API (all federal laws)
- AT: RIS-OGD API v2.6
- CH: fedlex.ch API
- EU: EUR-Lex webservices
- Diff: Reuse `computeCorpusDiff` from source-registry.ts
- Re-import: Only changed §§ (selective, not full re-import)
- Alert: Check existing pipeline outputs for citations to changed §§

**Files to create/modify**:

1. NEW: `server/scripts/sync-statutes-de.ts` — gesetze-im-internet.de fetcher
2. NEW: `server/scripts/sync-statutes-at.ts` — RIS-OGD fetcher
3. NEW: `server/scripts/sync-statutes-ch.ts` — fedlex.ch fetcher
4. MODIFY: `src/app/api/cron/law-sync/route.ts` — Add statute sync
5. MODIFY: `src/lib/source-registry.ts` — Add statute-specific freshness
6. NEW: `src/lib/stale-citation-alert.ts` — Alert engine
7. DELETED: corpus-freshness-widget.tsx (tot, durch command-center ersetzt)

**Acceptance criteria**:

- [ ] Cron job fetches all 4 jurisdictions daily
- [ ] Changed §§ detected and re-imported within 24h
- [ ] Stale citation alerts on affected pipeline outputs
- [ ] Dashboard widget shows freshness status

---

## Gap 4: Hierarchical Legal Knowledge Graph

### Blueprint

**Ziel**: Typed edges graph with hierarchy: Facts → Rules → Principles → Precedents.

**Architektur-Entscheidungen**:

- Extend existing `subsumio_judgement_citations` with edge types
- New table: `subsumio_legal_graph_edges` with typed edges
- Edge types: `cites_statute`, `applies_principle`, `distinguishes_from`, `overrules`, `interprets_article`
- Principle extraction: LLM-assisted, run on landmark cases
- Hierarchical retrieval: Query at appropriate abstraction level

**Files to create/modify**:

1. MODIFY: `src/lib/legal-graph/schema.ts` — Add typed edges table
2. MODIFY: `src/lib/legal-graph/search.ts` — Hierarchical queries
3. NEW: `src/lib/legal-graph/principle-extraction.ts` — LLM extraction
4. MODIFY: `server/src/core/think/gather.ts` — Hierarchical retrieval
5. NEW: `server/migrations/004_legal_graph_edges.sql` — Schema

**Acceptance criteria**:

- [ ] Graph contains typed edges
- [ ] Retrieval returns results at appropriate abstraction level
- [ ] 20+ tests for graph queries

---

## Gap 5: Multi-Model Ensemble Citation Verification

### Blueprint

**Ziel**: 4-stage citation verification cascade with ensemble option.

**Architektur-Entscheidungen**:

- Stage 1 (existing): Exact match (deterministic, free)
- Stage 2 (existing): Fuzzy match (deterministic, free)
- Stage 3 (new): Paraphrase judge — single LLM call, cheap
- Stage 4 (new, opt-in): Ensemble strict — N parallel judges, majority vote
- Cost guard: Pre-flight cost check
- Activation: Stage 4 for high-stakes outputs only

**Files to create/modify**:

1. MODIFY: `server/src/core/citation-guardrail.ts` — Add Stage 3 + 4 hooks
2. NEW: `server/src/core/ensemble-verify.ts` — Multi-model parallel verification
3. MODIFY: `src/lib/ai-certification.ts` — Add `verificationMethod` field
4. NEW: `server/test/ensemble-verify.test.ts` — Tests

**Acceptance criteria**:

- [ ] Stage 3 runs on every citation
- [ ] Stage 4 runs on high-stakes outputs
- [ ] `verificationMethod` persisted on certification
- [ ] 15+ tests

---

## Gap 6: Adversarial Robustness — Prompt Injection Defense

### Blueprint

**Ziel**: Uploaded documents cannot override system instructions.

**Architektur-Entscheidungen**:

- Input sanitization: Scan for injection patterns
- Document/system prompt isolation: XML delimiter separation
- Output validation: Check for injected content in output
- Adversarial test suite: Known injection patterns

**Files to create/modify**:

1. NEW: `server/src/core/adversarial-defense.ts` — Injection detection
2. MODIFY: `server/src/core/extract-document.ts` — Add injection scanner
3. MODIFY: `server/src/core/think/prompt.ts` — Isolation delimiters
4. NEW: `tests/e2e-playwright/adversarial-injection.spec.ts` — Test suite

**Acceptance criteria**:

- [ ] 100% of known injection patterns detected
- [ ] Document content cannot override system instructions
- [ ] Injection attempts logged in audit trail
- [ ] 20+ adversarial tests

---

## Gap 7: Transition-Level Audit Log (EU AI Act Art. 12)

### Blueprint

**Ziel**: Full reasoning trace for every AI output, immutable, exportable.

**Datenmodell**:

```typescript
interface ReasoningTrace {
  trace_id: string;
  timestamp: string;
  query: string;
  retrieved_chunks: Array<{ slug: string; score: number; rank: number }>;
  model_used: string;
  system_prompt_hash: string;
  guardrail_result: { passed: boolean; flags: GuardrailFlag[] };
  cross_verify_result: { clean: boolean; flags: CrossVerifyFlag[] };
  regeneration_count: number;
  final_answer_hash: string;
  confidence: DocumentConfidence;
  provenance: ProvenanceLink[];
}
```

**Architektur-Entscheidungen**:

- Extend existing hash-chained audit log
- New table: `subsumio_reasoning_traces` linked to audit log
- Export: CSV + PDF in EU AI Act Art. 13 format
- Retention: Configurable, default 10 years
- Webhook: ESCALATE/BLOCK events trigger configurable webhooks

**Files to create/modify**:

1. NEW: `src/lib/ai-reasoning-trace.ts` — Trace capture and storage
2. MODIFY: `src/lib/audit.ts` — Link reasoning traces
3. NEW: `server/migrations/005_reasoning_traces.sql` — Schema
4. NEW: `src/app/dashboard/settings/compliance-export/page.tsx` — Export UI
5. MODIFY: `server/src/core/think/index.ts` — Capture trace data

**Acceptance criteria**:

- [ ] Every AI output has complete reasoning trace
- [ ] Traces immutable (hash-chained)
- [ ] CSV/PDF export available
- [ ] 15+ tests

---

## Implementation Order

1. **Gap 1** (3-4 days): confidence-scoring.ts → integrate into think → extend certification → tests
2. **Gap 2** (3-4 days): provenance.ts → integrate with Gap 1 → extend certification → tests
3. **Gap 3** (4-5 days): sync scripts → cron route → stale alerts → dashboard widget
4. **Gap 4** (5-6 days): schema → typed edges → principle extraction → hierarchical retrieval
5. **Gap 5** (3-4 days): ensemble-verify.ts → integrate into pipeline → tests
6. **Gap 6** (2-3 days): adversarial-defense.ts → integrate → test suite
7. **Gap 7** (3-4 days): reasoning-trace.ts → schema → export UI → tests

**Total**: ~24-30 days for all 7 gaps
