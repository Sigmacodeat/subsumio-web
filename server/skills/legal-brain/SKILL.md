---
name: legal-brain
version: 1.0.0
description: |
  Dispatcher skill for the Legal Brain subsystem. Routes legal queries
triggers:
  - "legal brain"
  - "create a case"
  - "new legal case"
  - "analyze opponent"
  - "assess chances"
  - "Rechtsfall"
  - "Gegner analysieren"
  - "Gegneranalyse"
  - "Chancen bewerten"
  - "Chancenbewertung"
priority: 60
---

# Legal Brain — Dispatcher

> **Convention:** see [conventions/brain-first.md](../conventions/brain-first.md)
> before issuing external lookups. This dispatcher checks the matter brain and
> law corpus first, then chains to specialist legal skills only for missing
> context.

## What This Is

The Legal Brain is a complete case-management and strategic-analysis subsystem for lawyers and law firms. It anonymizes all data, supports opponent profiling, generates strategies, and searches precedents.

## When To Use

- The user wants to create, view, or manage legal cases
- The user asks about an opponent's profile or strategy
- The user wants a win-chance assessment
- The user searches for legal precedents
- The user is setting up lawyer/firm/court profiles

## Commands

| Intent                | Command                                                           |
| --------------------- | ----------------------------------------------------------------- |
| Create entity profile | `gbrain legal entity create --type <type> --name <name>`          |
| List entities         | `gbrain legal entity list`                                        |
| Create case           | `gbrain legal case create --title <t> --area <a> --opponent <id>` |
| List cases            | `gbrain legal case list`                                          |
| Show case             | `gbrain legal case show <id>`                                     |
| Generate strategy     | `gbrain legal case strategy <id>`                                 |
| Assess chances        | `gbrain legal case assess <id>`                                   |
| Analyze opponent      | `gbrain legal opponent <name>`                                    |
| Search precedents     | `gbrain legal precedent <query>`                                  |

## Privacy Rules

- All personally identifiable information is anonymized before storage
- Facts are scanned for PII and placeholders are substituted automatically
- Only the owner can reverse-anonymize data
- No real names, addresses, or dates of birth appear in the brain

## Chaining

- After `case create`, chain into `case strategy` if the user asks for next steps
- After `opponent`, chain into `case assess` if a case ID is known
- Precedent search chains naturally with perplexity-research for live case law

## Contract

1. Every answer routes through the matter's own source + public-law corpus only — no cross-tenant reads.
2. Each claim cites its brain source; gaps are stated explicitly.
3. Output is decision support for the responsible professional, never autonomous legal advice.

## Anti-Patterns

- ❌ Reading or blending another tenant's matter data (source isolation is absolute).
- ❌ Presenting synthesized analysis as binding legal advice.
- ❌ Answering a relational/opponent question from anything but public sources + the firm's own matters.

## Output Format

A synthesized answer with per-claim citations and an explicit gap list, scoped to the
firm's own source — marked AI-assisted, professional review required.
