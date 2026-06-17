---
name: portfolio-review
version: 1.0.0
description: |
  Reviews the portfolio from the brain: each company's latest status, flags
  (runway, missed updates, key risks), follow-on / reserve signals, and which
  companies need attention. Produces the portfolio picture a partner needs
  before an LP update or a partner meeting. Advisory; figures are as-reported.
triggers:
  - "Portfolio Review"
  - "Portfolio Status"
  - "welche Companies brauchen Aufmerksamkeit"
  - "Reserven Follow-on"
  - "LP Update vorbereiten"
  - "portfolio review"
  - "portfolio status"
  - "which companies need attention"
  - "follow-on signals"
priority: 61
tools:
  - search
  - get_page
  - query
  - think
mutating: false
---

# Portfolio-Review Skill

> **Warning:** AI-assisted portfolio synthesis. Figures are as-reported by
> companies; verify before an LP-facing use.
> **Chains with:** [founder-tracker](../founder-tracker/SKILL.md).

## Contract

This skill guarantees:
1. Each company's latest status is drawn from the brain with the source + date.
2. Attention flags (runway, stale update, key risk) are explicit, not buried.
3. Follow-on / reserve signals are surfaced where the data allows.
4. Output is advisory, marked figures-as-reported.

## Trigger Conditions

Use for a portfolio-wide view. Do NOT use for a single founder prep
(→ founder-tracker) or a new deal write-up (→ deal-memo).

## Protocol

1. **Inventory** portfolio companies in the brain.
2. **Status** each: latest update, runway, key metric (with source/date).
3. **Flag** companies needing attention (stale, runway, risk).
4. **Signals**: follow-on / reserve candidates.

## Output Format

```
## Portfolio Review — [Date] — figures as reported

### Needs attention (flagged first)
- [Company] — [flag] — [last update date]

### Status table
- [Company] · status · runway · key metric (source)

### Follow-on / reserve signals
---
⚠️ AI-assisted. portfolio-review v1.0.0
```

## Anti-Patterns

- ❌ Burying a runway/stale-update risk inside an aggregate "all good".
- ❌ Reporting metrics without the source company update + date.
- ❌ Treating a company with no recent update as healthy by default.

## Error Handling
- Companies with no updates on file → list them as "no recent data", not as fine.
- Incomplete portfolio in brain → state coverage before reviewing.
