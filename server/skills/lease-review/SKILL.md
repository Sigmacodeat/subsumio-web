---
name: lease-review
version: 1.0.0
description: |
  Reviews a lease / tenancy contract: extracts term, rent + escalation
  (Indexierung/Staffel), deposit, break and renewal options, notice periods,
  maintenance/repair (Instandhaltung/Schönheitsreparaturen) and special
  conditions, then flags risks against the landlord's or tenant's position.
  Covers residential and commercial (DE: §§ 535 ff. BGB). Advisory; the
  contract wording and a lawyer govern, not this review.
triggers:
  - "Mietvertrag prüfen"
  - "Lease prüfen"
  - "Mietbedingungen"
  - "Kündigungsfrist Miete"
  - "Staffelmiete"
  - "Indexmiete"
  - "Schönheitsreparaturen"
  - "review lease"
  - "lease review"
  - "break clause"
  - "what does this lease say"
  - "Mietvertrag analysieren"
priority: 64
tools:
  - search
  - get_page
  - query
  - think
  - put_page
mutating: true
---

# Lease-Review Skill

> **Warning:** AI-assisted lease review. The contract wording governs; for legal
> conclusions consult a lawyer. Not a binding interpretation.
> **Chains with:** [rent-roll-analysis](../rent-roll-analysis/SKILL.md), [property-due-diligence](../property-due-diligence/SKILL.md).

## Contract

This skill guarantees:

1. Term, rent + escalation, deposit, options, notice periods and obligations are extracted with the clause location.
2. Each flagged risk cites the lease passage it derives from.
3. The review states whose position it is taken from (landlord / tenant).
4. Output is advisory, marked wording-and-lawyer-govern.

## Trigger Conditions

Use to understand/assess a single lease. Do NOT use for a whole portfolio's rent
roll (→ rent-roll-analysis) or a purchase/sale (→ property-due-diligence).

## Protocol

1. **Identify** the lease: parties, property/unit, type (residential/commercial), period.
2. **Extract** term, rent + escalation, deposit, break/renewal options, notice periods, repair/maintenance, special clauses — each with location.
3. **Assess** risks from the stated position (landlord/tenant); note unusual or unenforceable-looking terms.
4. **File** a review page referencing the lease (optional).

## Output Format

```
## Mietvertrags-Review — [Objekt/Einheit] — beratend, Wortlaut maßgeblich

### Eckdaten
- Parteien · Typ · Laufzeit · Miete + Staffel/Index · Kaution

### Optionen & Fristen
- Verlängerung/Break · Kündigungsfrist (Fundstelle)

### Pflichten
- Instandhaltung / Schönheitsreparaturen (Fundstelle)

### Risiken
- [Risiko] (Fundstelle / Position)

---
⚠️ KI-gestützt · Wortlaut + Anwalt maßgeblich. Erstellt: [Datum] | lease-review v1.0.0
```

## Anti-Patterns

- ❌ Declaring a clause enforceable/void as legal advice — flag, recommend review.
- ❌ Extracting rent without the escalation mechanism (Staffel/Index).
- ❌ Missing notice periods / break options (the deadline-bearing terms).
- ❌ Reviewing without stating whose position the risk assessment takes.

## Error Handling

- Lease wording unavailable → review the summary only and state what is missing.
- Residential vs commercial unclear → ask; the rules differ materially.
