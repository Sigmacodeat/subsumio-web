---
name: project-onboard
version: 1.0.0
description: |
  Onboard a new project into the brain: set up directory structure,
  seed pages, create initial tasks, and wire connectors.
  Ensures every new project starts with consistent structure
  and all relevant context is captured from day one.
triggers:
  - "onboard project"
  - "new project"
  - "set up project"
  - "start project"
  - "Projekt anlegen"
  - "Projekt einrichten"
  - "Neues Projekt"
  - "Projekt initialisieren"
priority: 55
---

# Project Onboard — New Project Setup

## Contract

- Ask for project name, type, and key stakeholders (or infer from context).
- Create the directory structure in the brain repo:
  - `projects/<slug>/README.md` — project overview
  - `projects/<slug>/status.md` — rolling status page
  - `projects/<slug>/tasks/` — task directory
  - `projects/<slug>/notes/` — meeting/idea notes
  - `projects/<slug>/docs/` — reference documents
- Seed initial pages with frontmatter templates.
- Create a starter task list (kick-off, stakeholder mapping, first milestone).
- Optionally: connect external sources (GitHub, Notion, Drive).

## What This Is

A bootstrapping skill that ensures every project starts with a consistent,
brain-ready structure. Eliminates the blank-page problem and ensures the
project is immediately searchable and linkable.

## When To Use

- Starting any new initiative, product, client engagement, or research thread
- Spinning up a new legal case (can be used alongside `legal-brain`)
- Setting up a new team or workstream

## When NOT To Use

- For simple one-off tasks: use `skills/pm-task/SKILL.md`
- For personal capture: use `skills/capture/SKILL.md`
- For importing existing data: use `skills/migrate/SKILL.md`

## Directory Structure

```
projects/
  <project-slug>/
    README.md          → type: project, overview + goals + stakeholders
    status.md          → type: status, rolling updates (pm-status writes here)
    tasks/
      _index.md        → task registry
    notes/
      _index.md        → meeting/idea registry
    docs/
      _index.md        → reference doc registry
```

## Initial Tasks Created

1. `[ ] Kick-off meeting` — Schedule and run initial alignment
2. `[ ] Stakeholder map` — Identify key people/entities
3. `[ ] First milestone definition` — Define what "done" looks like for phase 1
4. `[ ] Setup connector` — If external data source needed
5. `[ ] Weekly status ritual` — Recurring check-in (chains to `pm-status`)

## Chaining

- After onboard → `skills/pm-status/SKILL.md` for first status report
- After onboard → `skills/pm-task/SKILL.md` to refine initial tasks
- If legal case → `skills/legal-brain/SKILL.md` to create case + link to project

## Anti-Patterns

- ❌ Onboarding a project without recording its scope, owner and key sources.
- ❌ Overwriting an existing project page instead of updating it.
- ❌ Skipping the initial source/connector wiring the project needs.

## Output Format

A project page: name · scope · owner · linked sources/connectors · initial task
list — with the brain slug it was written to.
