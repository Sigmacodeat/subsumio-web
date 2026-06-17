---
name: coverage-gap-finder
version: 1.0.0
description: |
  Finds coverage gaps and under-insurance across a client's book given what
  changed (a move, new vehicles/assets, headcount growth, new activities, a
  contract requiring cover). Compares the client's active policies in the brain
  against their current risk situation and flags missing or insufficient cover —
  the broker's duty-of-care and cross-sell signal. Advisory, not binding.
triggers:
  - "Deckungslücke"
  - "Unterversicherung"
  - "fehlende Versicherung"
  - "was fehlt an Deckung"
  - "Cross-Sell Versicherung"
  - "Bedarfsanalyse"
  - "coverage gap"
  - "underinsured"
  - "what coverage is missing"
  - "insurance needs analysis"
priority: 63
tools:
  - search
  - get_page
  - query
  - think
mutating: false
---

# Coverage-Gap-Finder Skill

> **Warning:** AI-assisted needs analysis. Recommendations require broker review
> and a formal needs assessment before advising the client.
> **Chains with:** [policy-review](../policy-review/SKILL.md).

## Contract

This skill guarantees:
1. Active cover is read from the client's policies in the brain (cited).
2. Gaps are derived from a stated change/risk situation, not guessed generically.
3. Each gap states the exposure it leaves open and a suggested cover line.
4. Output is advisory, marked duty-of-care review required.

## Trigger Conditions

Use when assessing whether a client is adequately covered, especially after a
change. Do NOT use to adjudicate a claim (→ claims-assist).

## Protocol

1. **Situation**: capture the change/risk profile (assets, activities, headcount, contracts).
2. **Inventory**: list active policies + cover from the brain.
3. **Compare**: map exposures to cover; flag missing/under-insured lines with the exposure left open.
4. **Recommend**: suggested cover per gap + the open questions for a formal needs assessment.

## Output Format

```
## Deckungs-Bedarfsanalyse — [Mandant] — beratend, Maklerprüfung erforderlich

### Aktuelle Deckung
- [Police] · [Linie] · [Summe] (Quelle)

### Lücken / Unterdeckung
- [Exposure] → nicht/zu gering gedeckt → Vorschlag: [Linie/Deckung]

### Offene Punkte für die Bedarfsanalyse
- [ ] …

---
⚠️ KI-gestützt · keine verbindliche Beratung. Erstellt: [Datum] | coverage-gap-finder v1.0.0
```

## Anti-Patterns

- ❌ Recommending cover without tying it to a concrete exposure/change.
- ❌ Treating a generic checklist as the client's actual need.
- ❌ Ignoring existing cover and double-recommending it.
- ❌ Presenting the analysis as a completed, binding needs assessment.

## Error Handling
- No client policies in brain → state that the inventory is incomplete before flagging gaps.
- Change/situation unknown → ask for it; a gap analysis without context is noise.
