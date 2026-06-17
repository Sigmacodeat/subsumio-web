---
name: cost-calculator
version: 1.0.0
description: |
  Calculates legal fees according to German RVG (Rechtsanwaltsvergütungsgesetz)
  or Austrian RATG (Rechtsanwaltstarifgesetz). Provides orientation estimates
  for court fees, attorney fees, and settlement fees based on the dispute value
  (Streitwert). NEVER substitutes for a binding fee calculation by a lawyer.
triggers:
  - "Kostenrechner"
  - "Kosten berechnen"
  - "Gebühren berechnen"
  - "RVG Berechnung"
  - "RATG Berechnung"
  - "Anwaltskosten"
  - "Gerichtskosten"
  - "Streitwert berechnen"
  - "calculate legal fees"
  - "lawyer costs"
  - "court fees"
priority: 65
tools:
  - search
  - get_page
mutating: false
---

# Cost Calculator Skill

> **Warning:** This is an orientation tool only. Binding fee calculations must
> be performed by a licensed attorney according to current RVG/RATG schedules.

## When To Use

- The user asks about estimated legal costs for a case
- The user provides a dispute value and wants fee estimates
- The user asks about German or Austrian attorney fee schedules

## Protocol

### Step 1 — Determine Jurisdiction and Dispute Value

Ask the user if not provided:
- Jurisdiction: Germany (RVG) or Austria (RATG)?
- Dispute value (Streitwert): The monetary value in dispute
- Case type: Litigation, settlement, or both?

### Step 2 — Calculate Fees

**Germany (RVG 2021):**

Use the statutory fee table (VV RVG Anlage 1):

| Streitwert bis | Gebühr (1,0) |
|---|---|
| 500 € | 49 € |
| 1.000 € | 88 € |
| 1.500 € | 127 € |
| 2.000 € | 166 € |
| 3.000 € | 215 € |
| 5.000 € | 313 € |
| 10.000 € | 558 € |
| 25.000 € | 833 € |
| 50.000 € | 1.158 € |

Multipliers:
- Verfahrensgebühr: 1,3
- Terminsgebühr: 1,2
- Einigungsgebühr: 1,5
- Auslagenpauschale: 20 €
- MwSt: 19%

**Austria (RATG 2024):**

Use the statutory fee table (RATG Anlage):

| Streitwert bis | Gebühr |
|---|---|
| 364 € | 36,40 € |
| 728 € | 72,80 € |
| 1.456 € | 109,20 € |
| 3.639 € | 181,95 € |
| 7.278 € | 254,73 € |
| 14.557 € | 363,90 € |
| 36.392 € | 509,49 € |
| 72.784 € | 654,99 € |

MwSt: 20%

### Step 3 — Present Result

```
## Geschätzte Kosten — Orientierungswert

**Jurisdiction:** [DE / AT]
**Streitwert:** [X] €

| Position | Betrag |
|---|---|
| Verfahrensgebühr | [X] € |
| Terminsgebühr | [X] € |
| Einigungsgebühr | [X] € |
| Auslagenpauschale | [X] € |
| Zwischensumme | [X] € |
| MwSt ([19% / 20%]) | [X] € |
| **Geschätztes Honorar (brutto)** | **[X] €** |

---
⚠️ Dies ist ein Orientierungswert. Die tatsächlichen Kosten können je nach
Fallkomplexität und Gebührenstufen abweichen. Maßgeblich ist die aktuelle
Fassung des RVG (Deutschland) bzw. RATG (Österreich).
```

## Anti-patterns

- Never present the calculation as binding or authoritative
- Always include the disclaimer that actual costs may vary
- Do not calculate fees for specific case types (e.g. family law, social law) where special fee schedules apply

## Contract

1. Every fee figure cites the rule it derives from (RVG/RATG position, Streitwert).
2. The Streitwert basis is stated explicitly; assumptions are flagged.
3. The result is orientation only — never a binding fee calculation.

## Anti-Patterns

- ❌ Presenting the estimate as a binding invoice or guaranteed fee.
- ❌ Using a Streitwert without stating how it was derived.
- ❌ Mixing RVG (DE) and RATG (AT) tables silently.

## Output Format

A fee breakdown: Streitwert · applicable positions (Verfahrensgebühr, Termingebühr,
Einigungsgebühr, …) · per-position amount with rule reference · total — labelled
"Orientierung, keine verbindliche Gebührenberechnung".
