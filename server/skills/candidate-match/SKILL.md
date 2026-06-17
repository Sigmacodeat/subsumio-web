---
name: candidate-match
version: 1.0.0
description: |
  Matches candidates to an open role from the firm's talent graph: ranks
  candidates by fit (experience, sector, seniority, availability, prior
  contact), explains each match, and flags conflicts (off-limits, placed
  recently, client overlap). Surfaces who-knows-whom for warm intros. Shortlist
  support for the consultant; the human decides who to approach.
triggers:
  - "Kandidaten finden"
  - "Matching Rolle"
  - "wer passt auf die Position"
  - "Shortlist erstellen"
  - "candidate match"
  - "who fits this role"
  - "build a shortlist"
  - "find candidates for"
  - "talent match"
priority: 62
tools:
  - search
  - get_page
  - query
  - think
mutating: false
---

# Candidate-Match Skill

> **Warning:** AI-assisted shortlist from the talent graph. The consultant
> decides who to approach; respect off-limits and data-protection rules.
> **Chains with:** [candidate-dossier](../candidate-dossier/SKILL.md), [pipeline-review](../pipeline-review/SKILL.md).

## Contract

This skill guarantees:
1. Candidates are ranked by explicit fit criteria (experience, sector, seniority, availability).
2. Each match has a one-line rationale and the source.
3. Conflicts are flagged (off-limits, recently placed, client overlap).
4. Output is shortlist support, marked human-decides.

## Trigger Conditions

Use to build a shortlist for a role. Do NOT use to write one candidate's profile
(→ candidate-dossier) or review the pipeline (→ pipeline-review).

## Protocol

1. **Parse** the role: must-haves, sector, seniority, location, constraints.
2. **Search** the talent graph; rank by fit.
3. **Explain** each match; surface warm-intro paths (who-knows-whom).
4. **Flag** conflicts/off-limits.

## Output Format

```
## Shortlist — [Role] @ [Client]

### Ranked candidates
1. [Candidate] — fit: [rationale] — warm intro via [person] (source)

### Conflicts / off-limits
---
⚠️ AI-assisted; consultant decides. candidate-match v1.0.0
```

## Anti-Patterns

- ❌ Proposing an off-limits or recently-placed candidate without flagging it.
- ❌ A ranking with no fit rationale.
- ❌ Ignoring data-protection / consent constraints on candidate data.

## Error Handling
- Role under-specified → list the must-haves needed before ranking.
- Thin talent graph → state coverage; recommend importing past searches.
