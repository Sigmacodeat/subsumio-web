---
name: pm-status
version: 1.0.0
description: |
  Generate structured status reports for projects, cases, or initiatives.
  Pulls from brain pages, facts, and timeline to produce an up-to-date
  status snapshot with blockers, next steps, and risk flags.
triggers:
  - "project status"
  - "status update"
  - "where are we on"
  - "what is the status of"
  - "Projektstatus"
  - "Statusbericht"
  - "Fortschritt"
priority: 55
---

# PM Status — Project Status Reporting

## Contract

- Query the brain for all pages related to the project/entity.
- Extract timeline entries, facts, and recent commits/changes.
- Produce a structured status report with:
  1. Executive Summary (1-2 sentences)
  2. What Changed Since Last Update
  3. Current Blockers
  4. Risks (with severity)
  5. Next Steps (with owners if known)
  6. Health Indicator (green/yellow/red)

## What This Is

A status-reporting skill that synthesizes scattered brain data into a
single, readable status update. It does NOT create new pages unless
explicitly asked to save the report.

## When To Use

- Weekly standup preparation
- Investor or stakeholder updates
- Personal project check-ins
- Before a meeting to get context

## When NOT To Use

- For legal cases: prefer `skills/legal-brain/SKILL.md` for case-specific status
- For deep research: use `skills/data-research/SKILL.md`
- For creating tasks: use `skills/pm-task/SKILL.md`

## Output Format

```markdown
## Status: [Project Name] — [Date]

**Health:** 🟢 Green / 🟡 Yellow / 🔴 Red

### Executive Summary

[1-2 sentences]

### What Changed

- [Date]: [Change description]
- ...

### Blockers

- [ ] [Blocker description] — [Impact]

### Risks

| Risk | Probability | Impact | Mitigation |
| ---- | ----------- | ------ | ---------- |
| ...  | ...         | ...    | ...        |

### Next Steps

- [ ] [Action] — Owner: [name] — Due: [date]
- ...
```

## Chaining

- After status, if blockers exist → `skills/pm-task/SKILL.md` to create tracking tasks
- If risks are high → `skills/ask-user/SKILL.md` to confirm escalation path
- If data is missing → `skills/data-research/SKILL.md` to fill gaps

## Anti-Patterns

- ❌ Reporting status without citing the underlying task/brain pages.
- ❌ Presenting a stale snapshot as current — state the as-of date.
- ❌ Hiding blocked/overdue items behind an aggregate "green".
