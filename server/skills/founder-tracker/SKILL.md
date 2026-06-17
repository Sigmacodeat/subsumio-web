---
name: founder-tracker
version: 1.0.0
description: |
  Prepares for a founder / portfolio-company touchpoint: what was last discussed,
  open commitments on both sides, what changed since, and the questions to ask.
  Synthesizes calls, emails and notes into a meeting-prep brief with citations
  and an explicit gap list. Relationship support, not a CRM.
triggers:
  - "Founder Update"
  - "Meeting-Prep Founder"
  - "was ist offen mit"
  - "Vorbereitung Gespräch Startup"
  - "founder prep"
  - "meeting prep"
  - "what's open with"
  - "catch me up on"
  - "before my call with"
priority: 62
tools:
  - search
  - get_page
  - query
  - think
mutating: false
---

# Founder-Tracker Skill

> **Warning:** AI-assisted prep from the brain's context. Verify commitments
> before relying on them.
> **Chains with:** [deal-memo](../deal-memo/SKILL.md), [portfolio-review](../portfolio-review/SKILL.md).

## Contract

This skill guarantees:
1. Last contact, open commitments (yours and theirs) and changes-since are surfaced with sources.
2. Suggested questions are grounded in the open items, not generic.
3. The brief ends with an explicit gap list (what isn't on file).
4. Output is relationship support, marked verify-before-relying.

## Trigger Conditions

Use before a specific founder/company touchpoint. Do NOT use to write a full
deal memo (→ deal-memo) or review the whole portfolio (→ portfolio-review).

## Protocol

1. **Pull** all brain context on the person/company.
2. **Summarize** last contact + state changes since.
3. **Commitments**: list open items on both sides with dates/sources.
4. **Prep**: suggested questions + the gap list.

## Output Format

```
## Founder Prep — [Person/Company] — [Date]

### Last contact & what changed
### Open commitments — theirs / ours (with dates, sources)
### Suggested questions
### Gaps (not on file)
---
⚠️ AI-assisted. founder-tracker v1.0.0
```

## Anti-Patterns

- ❌ Listing a commitment without its date/source.
- ❌ Generic questions unrelated to the open items.
- ❌ Presenting a stale snapshot as current — state the as-of date.

## Error Handling
- No prior context → say so; offer to prep from the deck only.
- Multiple entities with the same name → disambiguate before summarizing.
