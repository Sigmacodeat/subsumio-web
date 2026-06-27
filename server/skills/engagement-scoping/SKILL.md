---
name: engagement-scoping
version: 1.0.0
description: |
  Drafts an engagement scope/approach for a new opportunity, grounded in the
  firm's prior similar projects: objectives, workstreams, approach, timeline,
  team, assumptions and risks — reusing proven structure. Cites the past work it
  builds on and flags open commercial questions. Draft for a consultant to
  finalize; not a binding SOW.
triggers:
  - "Scope entwerfen"
  - "Angebot Ansatz"
  - "Vorgehen skizzieren"
  - "SOW Entwurf"
  - "Projektzuschnitt"
  - "engagement scope"
  - "draft an approach"
  - "scope this engagement"
  - "statement of work draft"
priority: 61
tools:
  - search
  - get_page
  - query
  - think
  - put_page
mutating: true
---

# Engagement-Scoping Skill

> **Warning:** AI-assisted scope draft from prior work. A consultant finalizes
> it; this is not a binding SOW or a price quote.
> **Chains with:** [proposal-finder](../proposal-finder/SKILL.md), [project-retro](../project-retro/SKILL.md).

## Contract

This skill guarantees:

1. The scope has objectives, workstreams, approach, timeline, team and risks.
2. It reuses structure from cited prior similar projects.
3. Assumptions and open commercial questions are explicit.
4. Output is a draft, marked not-a-binding-SOW.

## Trigger Conditions

Use to draft a scope/approach for a new opportunity. Do NOT use to find prior
work (→ proposal-finder) or capture a finished project (→ project-retro).

## Protocol

1. **Parse** the opportunity + constraints (budget, timeline, outcome).
2. **Find** the closest prior engagements (via the firm's memory).
3. **Draft**: objectives, workstreams, approach, timeline, team, assumptions, risks.
4. **Flag** open commercial questions; file the draft.

## Output Format

```
## Engagement Scope (draft) — [Opportunity]

### Objectives   ### Workstreams   ### Approach
### Timeline & team   ### Assumptions & risks
### Open commercial questions
[Built on: prior projects — sources]
---
⚠️ AI-assisted draft; not a binding SOW. engagement-scoping v1.0.0
```

## Anti-Patterns

- ❌ Presenting the draft as a priced, binding SOW.
- ❌ A scope with no assumptions/risks section.
- ❌ Ignoring relevant prior engagements that should shape the approach.

## Error Handling

- No similar prior work → draft from first principles and say so.
- Outcome/budget unstated → list them as the first open questions.
