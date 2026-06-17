---
name: pipeline-review
version: 1.0.0
description: |
  Reviews the search/recruiting pipeline from the brain: each active search's
  stage, stalled candidates, next actions, and time-in-stage / time-to-fill
  signals. Flags searches and candidates needing attention before a client
  update. Advisory; verify against the ATS of record.
triggers:
  - "Pipeline Review"
  - "Suchstatus"
  - "stehengebliebene Kandidaten"
  - "Mandate Status Recruiting"
  - "pipeline review"
  - "search status"
  - "stalled candidates"
  - "time to fill"
  - "recruiting pipeline"
priority: 61
tools:
  - search
  - get_page
  - query
  - think
mutating: false
---

# Pipeline-Review Skill

> **Warning:** AI-assisted pipeline synthesis. Verify against the ATS / system of
> record before a client-facing update.
> **Chains with:** [candidate-match](../candidate-match/SKILL.md).

## Contract

This skill guarantees:
1. Each active search's stage + candidate counts are drawn from the brain (sourced).
2. Stalled candidates (no movement) and next actions are explicit.
3. Time-in-stage / time-to-fill signals are surfaced where data allows.
4. Output is advisory, marked verify-against-ATS.

## Trigger Conditions

Use for a pipeline/search-wide view. Do NOT use to build a shortlist
(→ candidate-match) or profile one candidate (→ candidate-dossier).

## Protocol

1. **Inventory** active searches in the brain.
2. **Stage** each: candidate counts per stage, last movement.
3. **Flag** stalled candidates + searches at risk on time-to-fill.
4. **Next actions** per search.

## Output Format

```
## Pipeline Review — [Date] — verify against ATS

### Searches at risk (flagged first)
- [Search] — [stage] — stalled: [n] — last movement [date]

### Per-search stages + next actions
---
⚠️ AI-assisted. pipeline-review v1.0.0
```

## Anti-Patterns

- ❌ Reporting "on track" while a candidate has stalled for weeks.
- ❌ Stage counts without the last-movement date.
- ❌ Omitting the next action for an at-risk search.

## Error Handling
- Searches with no recent activity → flag as stalled, not as healthy.
- Incomplete pipeline data → state coverage before reviewing.
