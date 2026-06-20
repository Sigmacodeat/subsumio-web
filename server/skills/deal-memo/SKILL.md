---
name: deal-memo
version: 1.0.0
description: |
  Drafts an investment / deal memo from the brain's context on a company:
  founder calls, the deck, diligence notes, market data and prior partner views.
  Structures it (company, team, market, product, traction, terms, risks,
  recommendation) with citations, and ends with the open questions and gaps.
  Decision support for the investment team; not investment advice.
triggers:
  - "Deal Memo"
  - "Investment Memo"
  - "Beteiligungsvorlage"
  - "Memo schreiben Deal"
  - "write up this deal"
  - "IC memo"
  - "Investment Case"
priority: 62
tools:
  - search
  - get_page
  - query
  - think
  - put_page
mutating: true
---

# Deal-Memo Skill

> **Warning:** AI-assisted draft from the brain's context. Decision support for
> the investment team, not investment advice; figures require verification.
> **Chains with:** [founder-tracker](../founder-tracker/SKILL.md), [portfolio-review](../portfolio-review/SKILL.md).

## Contract

This skill guarantees:

1. The memo follows a consistent structure (company, team, market, product, traction, terms, risks, recommendation).
2. Every claim cites its brain source; figures are marked as reported, not verified.
3. It ends with explicit open questions and gaps.
4. Output is marked decision-support, not investment advice.

## Trigger Conditions

Use to write up a specific deal/company for an investment decision. Do NOT use
for portfolio-wide status (→ portfolio-review) or single-founder prep
(→ founder-tracker).

## Protocol

1. **Gather** all brain context on the company (calls, deck, diligence, prior views).
2. **Structure** the memo; cite each section's sources.
3. **Risks + terms**: state the proposed terms and the key risks honestly.
4. **Gaps**: list what's still unknown before a decision; file the memo page.

## Output Format

```
## Investment Memo — [Company] — [Date] — decision support, not advice

### Summary & Recommendation
### Team   ### Market   ### Product   ### Traction (figures: reported)
### Terms   ### Risks
### Open questions / gaps
[Sources: brain pages]
---
⚠️ AI-assisted draft. deal-memo v1.0.0
```

## Anti-Patterns

- ❌ Presenting reported metrics as verified.
- ❌ A recommendation with no stated risks.
- ❌ Omitting the gaps/open-questions section.
- ❌ Inventing data not in the brain.

## Error Handling

- Thin context → say what's missing before writing a recommendation.
- Conflicting figures across sources → surface both, flag the contradiction.
