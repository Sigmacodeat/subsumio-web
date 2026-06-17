---
name: candidate-dossier
version: 1.0.0
description: |
  Builds a candidate profile from the firm's interactions: career history,
  strengths, motivations, compensation expectations, references and every prior
  touchpoint — synthesized with sources for a client submission or an interview.
  Flags consent / data-protection status and any off-limits constraint. The
  consultant validates before sharing externally.
triggers:
  - "Kandidatenprofil"
  - "Dossier erstellen"
  - "Profil zusammenstellen"
  - "Kandidaten-Steckbrief"
  - "candidate dossier"
  - "candidate profile"
  - "write up this candidate"
  - "submission profile"
priority: 61
tools:
  - search
  - get_page
  - query
  - think
  - put_page
mutating: true
---

# Candidate-Dossier Skill

> **Warning:** AI-assisted profile from the brain. The consultant validates and
> checks consent before any external submission; candidate data is personal data.
> **Chains with:** [candidate-match](../candidate-match/SKILL.md).

## Contract

This skill guarantees:
1. The profile covers history, strengths, motivations, compensation and references with sources.
2. Every prior touchpoint with the firm is reflected.
3. Consent / data-protection status and off-limits constraints are flagged.
4. Output is marked validate-and-check-consent-before-sharing.

## Trigger Conditions

Use to profile one candidate. Do NOT use to rank a shortlist (→ candidate-match)
or review the pipeline (→ pipeline-review).

## Protocol

1. **Gather** all brain context on the candidate.
2. **Synthesize** history, strengths, motivations, comp, references (sourced).
3. **Flag** consent status, off-limits, sensitive notes not for external use.
4. **File** the dossier (optional), marked internal until validated.

## Output Format

```
## Candidate Dossier — [Name] — internal until validated

### Summary   ### Career history   ### Strengths
### Motivations & comp expectations   ### References
### Consent / off-limits / data-protection notes
[Sources: brain pages]
---
⚠️ AI-assisted; validate + check consent before sharing. candidate-dossier v1.0.0
```

## Anti-Patterns

- ❌ Producing an external-ready profile without the consent check.
- ❌ Including sensitive internal notes in a client-facing section.
- ❌ Claims about the candidate with no source/touchpoint.

## Error Handling
- Thin history → state what's known vs missing, don't embellish.
- No consent on file → mark the dossier internal-only and flag it.
