---
name: proposal-finder
version: 1.0.0
description: |
  Answers "have we done this before?" — finds past projects, proposals and
  reusable assets relevant to a new opportunity, with what was learned and what
  can be reused. Searches the firm's project/proposal/deliverable memory and
  returns ranked matches with sources and the gaps (e.g. no post-mortem filed).
  Reuse support; not a guarantee of fit.
triggers:
  - "haben wir das schon gemacht"
  - "ähnliches Projekt"
  - "Proposal Vorlage finden"
  - "wiederverwendbare Assets"
  - "have we done this before"
  - "find similar project"
  - "reusable proposal"
  - "past work on"
  - "prior engagement"
priority: 62
tools:
  - search
  - get_page
  - query
  - think
mutating: false
---

# Proposal-Finder Skill

> **Warning:** AI-assisted reuse search over the firm's memory. Confirm fit and
> client confidentiality before reusing material.
> **Chains with:** [project-retro](../project-retro/SKILL.md), [engagement-scoping](../engagement-scoping/SKILL.md).

## Contract

This skill guarantees:

1. Matches are ranked relevant past projects/proposals/deliverables with sources.
2. Each match states what is reusable and what was learned.
3. Gaps are flagged (e.g. no post-mortem, confidential client).
4. Output is reuse support, not a fit guarantee.

## Trigger Conditions

Use to find prior work for a new opportunity. Do NOT use to capture a finished
project's learnings (→ project-retro) or draft a new scope (→ engagement-scoping).

## Protocol

1. **Parse** the opportunity (industry, problem, deliverable type).
2. **Search** project/proposal/deliverable/learning memory.
3. **Rank + summarize**: per match — what it was, reusable assets, key learning, source.
4. **Flag** confidentiality + missing post-mortems.

## Output Format

```
## Reuse Search — "[opportunity]"

### Matches (ranked)
1. [Project/Proposal] ([year]) — reusable: [assets] — learning: [...] (source)

### Confidentiality / gaps
---
⚠️ AI-assisted. proposal-finder v1.0.0
```

## Anti-Patterns

- ❌ Surfacing a confidential client's material for reuse without flagging it.
- ❌ A match without its source project.
- ❌ Claiming fit; rank relevance, let the human decide.

## Error Handling

- No matches → say so plainly; suggest adjacent areas searched.
- Sparse memory → state coverage; recommend importing the archive.
