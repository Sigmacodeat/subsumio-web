# Phase 3: Extension Blueprint

> **Date:** 2026-06-19  
> **Input:** Phase 1 Audit Report + Phase 2 Gap Analysis  
> **Goal:** Blueprint for closing the top engine gaps with production-ready implementations

---

## Blueprint Overview

Three priority tiers, ordered by impact × feasibility:

| Priority | Blueprint Item | Gap Addressed | Impact | Complexity |
|----------|---------------|---------------|--------|------------|
| **P1** | Legal MCP Operations | Gap 1 (Critical) | Agents can call legal modules | Medium |
| **P2** | Statute Version Tracking | Gap 2 (Critical) | Currency verification for legal texts | Medium |
| **P3** | Legal-Aware Think Prompt | Gap 3 (High) | Legal discipline in synthesis output | Low |
| P4 | HMAC Key Rotation | Gap 4 (High) | Compliance for enterprise | Low-Medium |
| P5 | Legal Dream Cycle Phases | Gap 5 (High) | Self-maintaining legal knowledge | Medium |
| P6 | Query Cache Invalidation on Legal Writes | Gap 15 (Medium) | Fresh results after legal page updates | Low |
| P7 | Swiss Holiday Calendar | Gap 23 (Low) | Complete CH jurisdiction support | Low |

**Phase 4 will implement P1, P2, and P3** — the two critical gaps and the highest-impact low-complexity gap.

---

## P1: Legal MCP Operations

### Goal
Register 8 legal modules as MCP operations in `operations.ts` so agents can call them programmatically.

### Operations to Register

| Operation Name | Module | Scope | Params |
|----------------|--------|-------|--------|
| `legal_analyze_document` | `analyze-document.ts` | read | `slug`, `sourceId?`, `sourceIds?` |
| `legal_document_review` | `document-review.ts` | read | `slug?`, `text?`, `questions?`, `focus?`, `jurisdiction?`, `sourceId?`, `sourceIds?` |
| `legal_summarize` | `summarize.ts` | read | `slug?`, `text?`, `type?`, `depth?`, `focus?`, `language?`, `sourceId?`, `sourceIds?` |
| `legal_memo` | `memo.ts` | read | `question`, `facts`, `jurisdiction`, `legal_area?`, `case_slug?`, `language?`, `depth?`, `sourceId?`, `sourceIds?` |
| `legal_risk_analysis` | `risk-analysis.ts` | read | `slug?`, `text?`, `contract_type?`, `jurisdiction?`, `perspective?`, `sourceId?`, `sourceIds?` |
| `legal_contract_draft` | `contract-draft.ts` | read | `type`, `jurisdiction`, `parties`, `instructions?`, `template_slug?`, `language?`, `sourceId?`, `sourceIds?` |
| `legal_contract_redline` | `contract-redline.ts` | read | `original_text`, `counterparty_text?`, `playbook_slug?`, `contract_type?`, `jurisdiction?`, `perspective?`, `language?`, `sourceId?`, `sourceIds?` |
| `legal_due_diligence` | `due-diligence.ts` | read | `case_slug?`, `document_slugs?`, `category?`, `jurisdiction?`, `checklist?`, `language?`, `sourceId?`, `sourceIds?` |

### Design Decisions

1. **Scope: `read`** — All legal modules are read-only (they analyze/draft but don't persist). The `put_page` calls in some modules (contract-draft saves a draft page) should be opt-in and local-only, mirroring the `think` op's `save`/`take` pattern.

2. **Source scoping:** Every operation routes through `sourceScopeOpts(ctx)` for `sourceId` / `sourceIds`. The modules already accept these params — the op handler just needs to thread them.

3. **`remote` handling:** All operations are safe for remote callers (read-only, source-scoped). No `localOnly` restriction needed. The `attorney_review_required: true` flag is in the output, not a gating mechanism.

4. **LLM dependency:** All modules use `defaultLegalLLM()` which returns null if no model is configured. The op handler should surface a graceful `NO_LLM_AVAILABLE` warning rather than throwing.

5. **Error handling:** Follow the existing pattern: `OperationError` with `code` and `message`. Page-not-found → `not_found`. Missing required param → `invalid_params`.

### Implementation Plan

1. Create a helper `legalScopeOpts(ctx)` that wraps `sourceScopeOpts(ctx)` and adds `sourceId` / `sourceIds` to the module opts shape.
2. For each module, define an `Operation` with:
   - `name`, `description`, `scope: 'read'`
   - `params` schema (matching the module's opts interface)
   - `handler` that imports the module lazily, calls it with `ctx.engine` + scoped opts, and returns the result
3. Register all 8 operations in the `operations` array.
4. The `skill-catalog` will auto-discover them (it statically imports the `operations` array).

### Acceptance Criteria

- [ ] All 8 operations registered in `operations.ts`
- [ ] Each operation routes through `sourceScopeOpts(ctx)`
- [ ] Each operation handles missing LLM gracefully
- [ ] Each operation returns the module's typed result
- [ ] Remote callers can call all 8 operations
- [ ] No source bleed (fuzz-testable)

---

## P2: Statute Version Tracking

### Goal
Stamp `version_date` on individual statute section pages during `splitStatute`, and add a `statute_currency_check` MCP operation.

### Changes Required

#### 2a: `split-statute.ts` — Stamp `version_date` on section pages

Currently, `splitStatute` returns `StatuteSection[]` with `slug`, `title`, `body`, `meta`. The `meta` contains `version_date` but it's not injected into the section's frontmatter.

**Change:** When `splitStatute` returns sections, each section's frontmatter should include:
```yaml
statute_id: "bgb"
section_id: "§-823"
version_date: "2026-01-01"
jurisdiction: "de"
```

This allows the brain to answer "what version of § 823 BGB do we have?" via a simple `getPage` + frontmatter lookup.

#### 2b: New `statute_currency_check` operation

**Operation:** `statute_currency_check`
**Scope:** `read`
**Params:** `jurisdiction` (de/at/ch), `statute_id?` (e.g. "bgb", "abgb"), `sourceId?`, `sourceIds?`
**Returns:** Array of `{ statute_id, section_slug, brain_version_date, status: 'current' | 'outdated' | 'unknown' }`

**Logic:**
1. Query all pages with `type = 'statute_section'` in the given jurisdiction/source.
2. Group by `statute_id`.
3. For each statute, compare `brain_version_date` against the latest known version (from `law-corpus/` metadata or an external API).
4. Return status per section.

**Note:** The "latest known version" source is intentionally pluggable. V1 uses the `law-corpus/` directory's frontmatter as the reference. V2 could integrate with an external API (gesetze-im-internet.de, RIS).

#### 2c: Flag outdated statute citations in think output

When the think pipeline synthesizes an answer that cites a statute, it should check whether the brain's version of that statute is current. If not, add a warning to the `gaps` array: "§ 823 BGB in the brain is from 2024-01-01; a newer version may exist."

**Implementation:** Add a post-synthesis step in `think/index.ts` that:
1. Extracts statute references from the answer (regex: `§ \d+ [A-Z]+`)
2. Looks up each in the brain
3. Compares `version_date` against a reference
4. Appends outdated warnings to `gaps`

### Acceptance Criteria

- [ ] `splitStatute` stamps `version_date` on each section page
- [ ] `statute_currency_check` operation registered and functional
- [ ] Think pipeline flags outdated statute citations in gaps
- [ ] Source-scoped throughout

---

## P3: Legal-Aware Think Prompt

### Goal
Add a legal-aware system prompt variant that activates when the brain contains legal page types or when the caller specifies a legal mode.

### Design

Add a `legalMode?: boolean` option to `RunThinkOpts`. When true (or when the brain contains `legal_case` / `legal_entity` page types), the system prompt gains legal-specific instructions:

```
LEGAL MODE ACTIVE — Additional rules for legal synthesis:
- Cite statutes with version date: "§ 823 BGB (Fassung vom 2024-01-01)".
- When citing case law, include court and date: "BGH, Urteil vom 2024-03-15, Az. XII ZR 123/21".
- Flag jurisdiction-specific rules: "Hinweis: Dies gilt im deutschen Recht; in Österreich vgl. § 1311 ABGB."
- Mark every legal conclusion as assistive: "Diese Einschätzung ersetzt keine anwaltliche Prüfung."
- If a statute citation's currency cannot be verified, note it: "Fassungsdatum nicht verifiziert."
- Never provide definitive legal advice. You are a research tool, not an attorney.
```

### Activation Logic

1. **Explicit:** Caller passes `legalMode: true` in `RunThinkOpts`.
2. **Auto-detect:** If the gather phase returns any page with `type` starting with `legal_` or `evidence` or `statute_`, auto-activate legal mode.
3. **MCP:** The `think` op handler accepts a `legal_mode` param.

### Acceptance Criteria

- [ ] `legalMode` option in `RunThinkOpts`
- [ ] Legal-aware system prompt variant in `prompt.ts`
- [ ] Auto-detection based on gathered page types
- [ ] MCP `think` op accepts `legal_mode` param
- [ ] Source-scoped (no change needed — think is already scoped)

---

## P4: HMAC Key Rotation (Blueprint Only)

### Goal
Add `rotateKey(oldKey, newKey)` to `anonymizer.ts` and a CLI command `gbrain legal rotate-key`.

### Design

```typescript
export async function rotatePseudonymizationKey(
  engine: BrainEngine,
  oldKey: string,
  newKey: string,
  opts: { sourceId?: string },
): Promise<{ rotated: number; skipped: number }>
```

1. Query all pages with `type = 'legal_entity'` or `type = 'legal_case'` in the source.
2. For each page, re-hash all pseudonymized fields using `oldKey` to verify, then `newKey` to re-hash.
3. Update the page with the new hash values.
4. Return counts.

### Acceptance Criteria

- [ ] `rotatePseudonymizationKey` function in `anonymizer.ts`
- [ ] CLI command `gbrain legal rotate-key --old-key <key> --new-key <key>`
- [ ] Source-scoped
- [ ] Test with known hash → re-hash → verify cycle

---

## P5: Legal Dream Cycle Phases (Blueprint Only)

### Goal
Add legal-specific phases to the dream cycle.

### Phases

1. **`statute_currency`** — Run `statute_currency_check` for all jurisdictions. Flag outdated sections as `stale_statute` pages.
2. **`deadline_monitor`** — Promote `legal-case-scanner` from cron job to cycle phase. Runs on every cycle, not just cron.
3. **`case_progression`** — Track case status changes since last cycle. If a case status changed (e.g., `open` → `pending`), create a synthesis page noting the change.
4. **`precedent_linkage`** — For each case with a `legal_area`, search for similar precedents in the brain and create `precedent_link` edges.

### Integration

Hook into the existing `runCycle` function in `server/src/core/cycle/`. Each phase is a handler that receives `(engine, sourceId)` and returns a phase result.

---

## P6: Query Cache Invalidation on Legal Writes (Blueprint Only)

### Goal
Invalidate query cache entries when legal pages are written.

### Design

Add a `invalidateLegalCache(engine, sourceId)` function that:
1. Deletes all `query_cache` rows for the given `sourceId`.
2. Called from `putPage` when `page.type` starts with `legal_`, `evidence`, `statute_`, or `legal_deadline`.

### Acceptance Criteria

- [ ] Cache invalidated on legal page writes
- [ ] Source-scoped invalidation (only the affected source)
- [ ] No performance regression (batch delete, not per-key)

---

## P7: Swiss Holiday Calendar (Blueprint Only)

### Goal
Add Swiss cantonal holidays to `src/lib/legal-deadlines.ts`.

### Design

Add `Canton` type for CH cantons (ZH, BE, LU, UR, SZ, OW, NW, GL, ZG, FR, SO, BS, BL, SH, AR, AI, SG, GR, AG, TG, TI, VD, VS, NE, GE, JU).

Add cantonal holidays to `publicHolidays(year, state)` function. Swiss holidays are canton-specific — the function needs a `Canton` parameter for CH, similar to `Bundesland` for DE.

### Acceptance Criteria

- [ ] All 26 Swiss cantons supported
- [ ] Federal holidays (Bundesfeiertag 08-01) included
- [ ] Canton-specific holidays (e.g., ZH: Sechseläuten) included
- [ ] Deadline calculation respects CH holidays
