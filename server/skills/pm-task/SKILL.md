---
name: pm-task
version: 1.0.0
description: |
  Task and action-item management for projects, cases, and initiatives.
  Creates, tracks, and completes tasks within the brain, with
  deadline awareness, priority, and dependency chains.
triggers:
  - "create a project task"
  - "case task"
  - "project task"
  - "project action items"
  - "task dependency"
  - "mark project task done"
  - "tasks for project"
  - "Aufgabe für Projekt"
  - "Fallaufgabe"
  - "Abhängigkeit erstellen"
priority: 55
---

# PM Task — Task & Action-Item Management

## Contract

- Tasks are stored as brain pages with type `task`.
- Each task has: title, status, priority, due date, assignee, project/link.
- Tasks can be linked to legal cases, projects, or any brain page.
- The skill supports CRUD + status transitions + dependency tracking.

## What This Is

A lightweight task-tracking system inside the brain. Tasks are first-class
brain pages so they are searchable, linkable, and retrievable alongside all
other knowledge.

## When To Use

- Creating follow-up items from meetings or calls
- Tracking action items for a case or project
- Daily/weekly todo review
- Blocking dependency chains ("can't do X until Y is done")

## When NOT To Use

- For legal deadlines: prefer `skills/deadline-extract/SKILL.md` for extraction,
  then chain into `pm-task` for tracking
- For recurring cron jobs: use `skills/cron-scheduler/SKILL.md`
- For multi-agent orchestration: use `skills/minion-orchestrator/SKILL.md`

## Page Format

```markdown
---
type: task
status: open | in_progress | blocked | done | cancelled
priority: low | medium | high | critical
due: YYYY-MM-DD
project: <slug of related page>
parent: <slug of parent task>
assignee: <name or identifier>
tags: [task, <project-slug>]
---

# [Task Title]

## Description

[What needs to be done]

## Acceptance Criteria

- [ ] [Criterion 1]
- [ ] [Criterion 2]

## Notes

[Additional context, links, references]
```

## Commands

| Intent                    | Action                                           |
| ------------------------- | ------------------------------------------------ |
| "Create task for X"       | Create page with type=task, link to project/case |
| "What are my open tasks?" | Query pages where type=task and status=open      |
| "Mark task X as done"     | Update page frontmatter status=done              |
| "Block task X on Y"       | Update parent field or add dependency note       |
| "Tasks for project Z"     | Query tasks where project=Z slug                 |

## Chaining

- After meeting ingestion → create tasks from action items
- After legal case creation → create initial task list for case phases
- After status report → create tasks for identified next steps
- Before daily briefing → pull open tasks as briefing input

## Anti-Patterns

- ❌ Creating duplicate tasks instead of updating the existing one.
- ❌ Marking a task done without recording the outcome.
- ❌ Losing the link between a task and its parent project/brain page.

## Output Format

Per task: title · status · owner · due date · linked project — and the brain
page slug it was written to.
