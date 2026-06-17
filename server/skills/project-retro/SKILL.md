---
name: project-retro
version: 1.0.0
description: |
  Captures a finished engagement's institutional memory: what worked, what
  didn't, reusable assets produced, and the key learnings — structured and filed
  so the next team finds it. Synthesizes the project's notes/deliverables into a
  post-mortem with sources. Knowledge capture; the team validates the learnings.
triggers:
  - "Projekt-Retro"
  - "Post-Mortem"
  - "Lessons Learned"
  - "Projekt nachbereiten"
  - "project retro"
  - "post-mortem"
  - "lessons learned"
  - "wrap up this project"
  - "capture learnings"
priority: 61
tools:
  - search
  - get_page
  - query
  - think
  - put_page
mutating: true
---

# Project-Retro Skill

> **Warning:** AI-assisted retrospective from the project's brain context. The
> team validates the learnings before they're treated as firm guidance.
> **Chains with:** [proposal-finder](../proposal-finder/SKILL.md).

## Contract

This skill guarantees:
1. The retro covers what worked, what didn't, reusable assets and key learnings.
2. Each point cites the project source it draws from.
3. Reusable assets are listed with their location.
4. The retro is filed as a learning page linked to the project.

## Trigger Conditions

Use to wrap up a finished/ongoing project. Do NOT use to find prior work
(→ proposal-finder) or scope new work (→ engagement-scoping).

## Protocol

1. **Gather** the project's notes, deliverables, client feedback.
2. **Synthesize**: worked / didn't / why, with sources.
3. **Assets**: list reusable deliverables + their location.
4. **File** a learning page linked to the project.

## Output Format

```
## Project Retro — [Project] — [Date]

### What worked   ### What didn't (and why)
### Reusable assets (with location)
### Key learnings (sources)
---
⚠️ AI-assisted; team to validate. project-retro v1.0.0
```

## Anti-Patterns

- ❌ A retro of only successes — capture what didn't work too.
- ❌ Learnings with no source in the project record.
- ❌ Listing reusable assets without where to find them.

## Error Handling
- Thin project record → capture what exists, flag the gaps for the team.
- No client feedback on file → note its absence rather than inferring satisfaction.
