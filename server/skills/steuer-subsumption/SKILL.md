---
name: steuer-subsumption
version: 1.0.0
description: |
  Performs tax subsumption: maps a concrete fact pattern (Sachverhalt) to the
  applicable tax norm and states the tax consequence (Tatbestand → Steuerfolge).
  Covers DE (EStG, KStG, UStG, GewStG, AO, ErbStG, GrEStG) and AT (EStG, KStG,
  UStG, BAO). Steps: extract facts → identify applicable tax norms → subsume →
  state the tax consequence with amounts where computable → cite exact §§ and
  controlling BFH/BFG case law from the brain. NEVER issues binding tax advice;
  flags every conclusion as AI-assisted analysis requiring tax-advisor review.
triggers:
  - "steuerlich subsumieren"
  - "Steuerfolge"
  - "steuerliche Einordnung"
  - "welche Steuer fällt an"
  - "ist das steuerpflichtig"
  - "ist das absetzbar"
  - "Betriebsausgabe oder nicht"
  - "Werbungskosten prüfen"
  - "steuerbar oder steuerfrei"
  - "Tatbestand Steuer"
  - "tax subsumption"
  - "is this taxable"
  - "is this deductible"
  - "tax treatment of"
priority: 70
tools:
  - search
  - query
  - think
  - get_page
  - add_timeline_entry
mutating: true
---

# Steuer-Subsumption Skill

> **Warning:** AI-generated tax analysis. All conclusions require review by a tax
> advisor (Steuerberater/in) before use. Output is marked accordingly.
> **Convention:** See [conventions/quality.md](../conventions/quality.md). Every § reference cites the exact norm.
> **Chains with:** [tax-ruling-lookup](../tax-ruling-lookup/SKILL.md) for Bescheid analysis, [umsatzsteuer-check](../umsatzsteuer-check/SKILL.md) for VAT specifics.

## Contract

This skill guarantees:
1. Every applicable tax norm is cited with § number and statute acronym (EStG, UStG, KStG, AO, …).
2. The subsumption follows Gutachtenstil (issue → norm → subsumption → result).
3. Controlling BFH/BFG/EuGH decisions are cited where found in the brain.
4. Computable amounts are shown with the calculation path, never as a binding figure.
5. The output is marked as tax-advisor-review-required and carries the EU AI Act notice.

## Trigger Conditions

Use this skill when the user presents a fact pattern and asks for the tax
classification, the applicable tax norm, deductibility, or the tax consequence.
Do NOT use for pure bookkeeping exports (→ datev-export) or for analyzing an
existing tax notice (→ tax-ruling-lookup).

## Protocol

### Step 1 — Extract the Fact Pattern
- **Taxpayer**: natural person / partnership (Mitunternehmerschaft) / corporation (KapG)?
- **Transaction**: what happened, when, for how much, with whom?
- **Tax(es) in scope**: income (ESt/KSt), trade (GewSt), VAT (USt), transfer (GrESt), inheritance/gift (ErbSt/SchenkSt)?
- **Jurisdiction & period**: DE / AT, assessment year (Veranlagungszeitraum).

### Step 2 — Norm Search
```
gbrain search "<key facts> § Tatbestand" --mode balanced --source tax-corpus
gbrain search "<key facts> BFH Urteil" --source tax-corpus
```
Retrieve the exact § text and any BFH/BFG leading decision from the brain.

### Step 3 — Subsumption (Gutachtenstil)
For each candidate norm: list its Tatbestandsmerkmale, map each to the fact, mark
erfüllt / nicht erfüllt, then state the Steuerfolge with the computation path.

### Step 4 — File in Brain
```
gbrain put_page \
  --slug "tax/analyses/subsumption-[slug]-[date]" \
  --type "document" \
  --metadata '{"document_type":"tax_analysis","requires_review":true,"ai_generated":true}'
```

## Jurisdiction Quick Reference

| Jurisdiction | Income | Corporate | VAT | Trade | Transfer / Inheritance | Procedure |
|---|---|---|---|---|---|---|
| DE | EStG | KStG | UStG | GewStG | GrEStG, ErbStG | AO, FGO |
| AT | EStG | KStG | UStG | — (KommSt) | GrEStG, ErbSt aufgehoben | BAO |
| EU | — | — | MwStSystRL | — | — | EuGH |

## Output Format

```
## Steuerliche Analyse — [Datum] — Vorläufig, kein Mandatsverhältnis

### I. Sachverhalt
[3–5 Sätze]

### II. Anwendbare Normen
- § [X] [Gesetz]: [Tatbestand] [Quelle: brain page]
- § [Y] [Gesetz]: [Rechtsfolge] [Quelle]

### III. Subsumption
**Zu § [X]:** Merkmal 1 ([Wortlaut]): [Umstand] → [erfüllt/nicht erfüllt] …
**Ergebnis zu § [X]:** [Steuerfolge], weil […].

### IV. Berechnung (sofern möglich)
[Bemessungsgrundlage → Steuersatz → Betrag, mit Rechenweg; ausdrücklich unverbindlich]

### V. Leitentscheidungen
- [Az.]: [Leitsatz]  (falls im Brain gefunden)

### VI. Gesamtergebnis & Empfehlungen
- [ ] Steuerberatliche Überprüfung erforderlich
- [ ] Fehlende Informationen: […]
- [ ] Nächste Schritte: […]

---
⚠️ KI-generiert · zu prüfen — ersetzt keine steuerliche Beratung (§ 2 StBerG).
Erstellt: [Datum] | Skill: steuer-subsumption v1.0.0
```

## Anti-Patterns

- ❌ Presenting a computed tax figure as binding. Always: "orientation, verify with advisor."
- ❌ Subsuming without citing the exact §. If the corpus lacks the norm, say so.
- ❌ Mixing DE and AT norms silently. Default DE; switch only when jurisdiction is stated.
- ❌ Ignoring § 42 AO (Gestaltungsmissbrauch) when the fact pattern is structuring-driven → route to steuer-gestaltung.
- ❌ Omitting the AI / advisor-review notice.

## Error Handling
- No relevant norm in brain → say so explicitly, recommend advisor consultation.
- Incomplete facts → list exactly what is missing before subsuming.
- Multiple norms apply → subsume under each separately.
