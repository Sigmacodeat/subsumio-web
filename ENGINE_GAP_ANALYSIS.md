# Phase 2: Engine-Level Gap Analysis vs. State-of-the-Art Legal AI

> **Date:** 2026-06-19  
> **Focus:** Engine and architecture gaps (not SaaS/GoBD/SSO — those are in `SIGMABRAIN_GAP_ANALYSIS.md`)  
> **Competitors:** Harvey AI, CoCounsel (Thomson Reuters), Legora, Noxtua, Luminance

---

## Methodology

This analysis focuses on **engine-level** capabilities: what the AI engine can do when an agent or user invokes it. It excludes SaaS infrastructure gaps (SSO, billing, hosting) which are tracked separately in `SIGMABRAIN_GAP_ANALYSIS.md`.

Sources: Public product documentation, API references, Stanford RegLab study, competitor websites (June 2026).

---

## 1. Gap Matrix — Engine Capabilities

| # | Capability | Subsumio | Harvey | CoCounsel | Legora | Noxtua | Luminance | Gap |
|---|-----------|----------|--------|-----------|--------|--------|-----------|-----|
| 1 | **Legal MCP operations** (contract_draft, risk_analysis, etc. as agent-callable ops) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | **Critical** |
| 2 | **Statute version tracking** (know which version of § X is current) | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | **Critical** |
| 3 | **Legal-aware synthesis prompt** (§ citations, jurisdiction, attorney review) | ❌ | ✅ | ✅ | ✅ | ✅ | 🟡 | **High** |
| 4 | **HMAC key rotation** for pseudonymization | ❌ | N/A | N/A | N/A | ✅ | N/A | **High** |
| 5 | **Legal dream cycle** (statute currency, deadline monitoring, case progression) | ❌ | ❌ | ❌ | ❌ | 🟡 | ❌ | **High** |
| 6 | **Multi-jurisdiction statute corpus** (DE/AT/CH laws in-brain, searchable) | 🟡 | ✅ | ✅ | 🟡 | ✅ | ❌ | **High** |
| 7 | **Precedent search with ranking** (case law search + relevance scoring) | 🟡 | ✅ | ✅ | ✅ | ✅ | 🟡 | Medium |
| 8 | **Proactive issue-spotting** (analyze document without being asked) | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | — |
| 9 | **Clause-level risk scoring with grounding** | ✅ | ✅ | ✅ | 🟡 | 🟡 | ✅ | — |
| 10 | **Contract redlining with verbatim grounding** | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | — |
| 11 | **Due diligence checklist automation** | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | — |
| 12 | **Legal memo generation** (Sachverhalt → Würdigung) | ✅ | ✅ | ✅ | 🟡 | 🟡 | ❌ | — |
| 13 | **Pseudonymization / GDPR compliance** | 🟡 | ❌ | ❌ | ❌ | ✅ | ❌ | Medium |
| 14 | **Knowledge graph with typed legal edges** (case→statute, case→opponent) | 🟡 | ❌ | ❌ | ❌ | ✅ | ❌ | Medium |
| 15 | **Query cache invalidation on legal page writes** | ❌ | N/A | N/A | N/A | N/A | N/A | Medium |
| 16 | **Streaming synthesis with citation rendering** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | — |
| 17 | **Multi-tenant source isolation** | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | — |
| 18 | **Self-hosting / on-premise** | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | — |
| 19 | **Subagent specialization** (legal-researcher, legal-critic, etc.) | ✅ | ❌ | ❌ | ❌ | 🟡 | ❌ | — |
| 20 | **Contradiction detection across takes** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | — |
| 21 | **Gap analysis in answers** (model says what it doesn't know) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | — |
| 22 | **Calibration / bias-aware synthesis** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | — |
| 23 | **Swiss (CH) holiday calendar for deadline calc** | ❌ | N/A | N/A | N/A | N/A | N/A | Low |
| 24 | **NER-based PII detection** (vs regex) | ❌ | N/A | N/A | N/A | 🟡 | N/A | Low |
| 25 | **DMS integration** (iManage, NetDocuments) | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | Medium |

---

## 2. Detailed Gap Analysis — Top 5 Engine Gaps

### Gap 1: No Legal MCP Operations (Critical)

**What competitors do:** Harvey, CoCounsel, Legora, Noxtua, and Luminance all expose their legal AI capabilities (drafting, review, risk analysis, due diligence) as API operations that agents and integrations can call programmatically. This is the primary interface for automation and workflow integration.

**What Subsumio has:** 9 legal modules in `server/src/core/legal/` with excellent grounding and source scoping. But they are only accessible via:
- CLI (`gbrain legal ...`) — not callable by agents
- Web API HTTP endpoints (`/api/legal/*`) — callable but not through the MCP protocol

The 91 registered MCP operations in `operations.ts` include zero legal operations. An agent connected via MCP cannot call `contract_draft`, `risk_analysis`, `document_review`, `due_diligence`, `memo`, `summarize`, `analyze_document`, or `contract_redline`.

**Impact:** This is the single largest architectural gap. The legal subagents (legal-drafter, legal-researcher, etc.) cannot use the legal modules as tools — they generate text from their system prompt alone, which is strictly inferior to calling a grounded, purpose-built legal module. Every competitor's agent can call these capabilities as first-class operations.

**Fix complexity:** Medium. The modules already exist and are well-structured. Each needs an `Operation` definition in `operations.ts` with proper params, source scoping via `sourceScopeOpts(ctx)`, and `remote` handling. The pattern is established by the existing 91 operations.

### Gap 2: No Statute Version Tracking (Critical)

**What competitors do:** Harvey and CoCounsel integrate with legal databases (Westlaw, LexisNexis) that always serve the current version of a statute. When the model cites "§ 823 BGB," it knows the Fassungsdatum (version date) and can verify it's current. Noxtua, being DACH-focused, maintains its own statute corpus with version metadata.

**What Subsumio has:** `split-statute.ts` splits monolithic statutes into per-section pages and extracts `StatuteMeta` (including `version_date`) from frontmatter. But `version_date` is NOT stamped on individual section pages. There is no mechanism to:
1. Query "what version of § 823 BGB does the brain contain?"
2. Detect that a statute has been updated and sections need re-splitting
3. Flag outdated statute references in synthesis output

The `law-corpus/` directory contains DE/AT/CH statutes as markdown files, but these are static — no update detection.

**Impact:** A legal AI that cannot verify the currency of the law it cites is fundamentally unreliable for legal practice. This is table stakes for the category.

**Fix complexity:** Medium. Requires:
1. Stamp `version_date` on each section page during `splitStatute`
2. Add a `statute_currency` check operation that compares brain versions against a source
3. Flag outdated statute citations in think output

### Gap 3: Think Prompt Not Legal-Aware (High)

**What competitors do:** Harvey's system prompt is tuned for legal reasoning — it instructs the model to cite statutes with version dates, flag jurisdiction-specific rules, include attorney review disclaimers, and respect legal confidentiality. CoCounsel similarly has legal-specific prompt engineering.

**What Subsumio has:** The think system prompt (`server/src/core/think/prompt.ts`) is generic: "You are gbrain's synthesis engine. You answer questions by reasoning across the user's personal knowledge brain." There is no mention of:
- § citations with Fassungsdatum
- Jurisdiction awareness (DE/AT/CH)
- Attorney review requirement
- Legal confidentiality
- Statute currency verification

**Impact:** The model produces legally-flavored output without the discipline a law firm requires. Citations may omit version dates, jurisdiction-specific nuances may be missed, and the output doesn't carry the "attorney review required" flag that all legal module outputs do.

**Fix complexity:** Low. Add a legal-aware system prompt variant that activates when the brain contains legal page types or when the caller specifies a legal mode. The infrastructure for prompt variants already exists (calibration, trajectory).

### Gap 4: No HMAC Key Rotation (High)

**What competitors do:** Noxtua (DACH-focused, GDPR-conscious) documents key rotation procedures for pseudonymization. Enterprise legal platforms generally have key management policies.

**What Subsumio has:** `anonymizer.ts` uses HMAC-SHA-256 with an owner key for pseudonymization. The key is passed as a parameter. But there is no `rotateKey(oldKey, newKey)` function — if the key is compromised, all pseudonymized data must be manually re-hashed with no tooling support.

**Impact:** GDPR Art. 32 requires appropriate technical measures including the ability to respond to security incidents. A law firm SaaS that cannot rotate its pseudonymization key has a compliance gap that enterprise procurement will flag.

**Fix complexity:** Low-Medium. Add a `rotateKey` function that re-hashes all pseudonymized values, and a CLI command to trigger it.

### Gap 5: No Legal Dream Cycle (High)

**What competitors do:** Noxtua has automated legal knowledge maintenance — it periodically checks for new jurisprudence, updates statute references, and flags changes relevant to active cases. Harvey and CoCounsel are stateless per-request and do not maintain a persistent brain.

**What Subsumio has:** The dream cycle has generic phases (synthesize, extract, patterns, consolidate). The `legal-case-scanner` minion handler exists but is a cron-triggered job, not integrated into the dream cycle. There is no:
1. Statute currency check phase
2. Deadline monitoring phase (integrated with the dream cycle, not just cron)
3. Case progression tracking phase
4. Precedent linkage phase

**Impact:** The brain doesn't self-maintain legal knowledge. Statutes go stale, deadlines approach without proactive alerting (unless cron is configured), and case knowledge doesn't compound automatically.

**Fix complexity:** Medium. Requires adding legal-specific cycle phases that hook into the existing dream cycle infrastructure. The `legal-case-scanner` handler is a starting point — it needs to be promoted from a cron job to a cycle phase.

---

## 3. Competitive Positioning Summary

### Where Subsumio Leads

1. **Knowledge graph + gap analysis + contradiction detection** — No competitor publicly offers any of these. The brain's ability to say "I don't have data on X" and surface conflicting takes is unique.
2. **Source isolation + multi-tenancy** — Architectural, fuzz-tested. No competitor offers self-hosting with multi-tenant isolation.
3. **Grounding as first principle** — Every legal module drops fabricated content. This is the most important anti-hallucination mechanism and it's consistently applied.
4. **Calibration / bias-aware synthesis** — Unique in the category. No competitor tracks prediction accuracy or applies calibration profiles.
5. **Subagent specialization** — Six legal subagents with scoped tools and legal-specific system prompts. No competitor has this architecture.
6. **DACH-specific features** — GoBD, beA, DATEV, RA-MICRO import, DE/AT holiday calendars, RIS-OGD integration. No US competitor has any of these.

### Where Subsumio Trails

1. **Legal MCP operations** — Every competitor exposes legal AI as callable API ops. Subsumio's modules exist but aren't registered as MCP operations.
2. **Statute version tracking** — Competitors with legal databases always serve current law. Subsumio has no version tracking.
3. **Legal-specific prompt engineering** — Competitors tune their prompts for legal reasoning. Subsumio's think prompt is generic.
4. **DMS integration** — iManage/NetDocuments integration is the enterprise legal buying filter. Subsumio has none.
5. **Legal database access** — Harvey/CoCounsel have Westlaw/LexisNexis integration. Subsumio has RIS-OGD + openlegaldata.io but no premium database access.

### Where Subsumio Is Unique

1. **Compounding brain per firm** — Each firm's brain gets smarter with every case. Competitors are stateless per-request.
2. **Self-hosting** — Only Noxtua offers on-premise among DACH competitors. Subsumio's open-source + self-host is a structural advantage.
3. **Dream cycle** — Automated knowledge maintenance. No competitor has this architecture (though Noxtua has some automated features).
