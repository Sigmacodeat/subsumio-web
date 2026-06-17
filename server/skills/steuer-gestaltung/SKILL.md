---
name: steuer-gestaltung
version: 1.0.0
description: |
  Generates tax-structuring recommendations (Steuergestaltung) for a client
  situation: legal optimization options, comparative tax-burden estimates,
  risk assessment incl. § 42 AO (Gestaltungsmissbrauch) and substance
  requirements, plus recommended next steps. Uses the client's facts, entity
  structure, prior advisory history and the indexed tax corpus. Covers DE/AT
  income, corporate, trade and VAT planning. Advisory tool FOR tax professionals
  — never autonomous advice; every recommendation is flagged for advisor review.
triggers:
  - "Steuergestaltung"
  - "Steuer optimieren"
  - "Steuern sparen"
  - "Gestaltungsberatung"
  - "Rechtsformwahl steuerlich"
  - "Holding sinnvoll"
  - "Thesaurieren oder ausschütten"
  - "Umwandlung steuerlich"
  - "tax structuring"
  - "tax optimization"
  - "tax planning"
  - "welche Rechtsform steuerlich"
  - "Gestaltungsmissbrauch"
priority: 65
tools:
  - search
  - get_page
  - query
  - think
mutating: false
---

# Steuer-Gestaltung Skill

> **Warning:** AI-generated structuring options. Not binding advice. Every option
> requires review by a tax advisor and a § 42 AO substance check before use.
> **Convention:** See [conventions/quality.md](../conventions/quality.md).
> **Chains with:** [steuer-subsumption](../steuer-subsumption/SKILL.md) for the per-option tax treatment, [cost-calculator](../cost-calculator/SKILL.md) for fee context.

## Contract

This skill guarantees:
1. At least two structuring options are compared, each with its legal basis (§§).
2. Each option carries a comparative tax-burden estimate with the calculation path.
3. A § 42 AO (abuse-of-arrangement) and economic-substance risk note per option.
4. Non-tax consequences flagged (liability, civil law, social security) for cross-check.
5. The output is marked advisor-review-required and carries the EU AI Act notice.

## Trigger Conditions

Use when the client asks how to structure a transaction, entity or succession to
optimize the tax burden legally. Do NOT use to analyze an existing Bescheid
(→ tax-ruling-lookup) or for pure VAT mechanics (→ umsatzsteuer-check).

## Protocol

### Step 1 — Situation & Goal
Entity structure, taxes in scope, time horizon, the client's actual goal
(cash-out, reinvestment, succession, exit), and any constraints from the brain's
advisory history.

### Step 2 — Generate Options
Draw on the tax corpus and prior similar mandates in the brain. Typical levers:
Rechtsformwahl (GmbH vs. GmbH & Co. KG vs. Einzelunternehmen), Holding /
§ 8b KStG, Thesaurierung § 34a EStG, Organschaft, Umwandlung (UmwStG),
investment incentives, timing.

### Step 3 — Compare & Risk-Rate
Per option: estimated tax burden, § 42 AO / substance risk (low/medium/high),
non-tax side effects, implementation effort.

### Step 4 — Recommend
A ranked recommendation with the open questions a human advisor must resolve.

## Output Format

```
## Gestaltungsvorschlag — [Datum] — Vorläufig, kein Mandatsverhältnis

### I. Ausgangslage & Ziel
[…]

### II. Optionen im Vergleich
| Option | Rechtsgrundlage | Geschätzte Steuerlast | § 42 AO / Substanz-Risiko | Nicht-steuerliche Folgen |
|---|---|---|---|---|
| A … | §§ … | … (Rechenweg unten) | niedrig/mittel/hoch | … |
| B … | §§ … | … | … | … |

### III. Berechnungswege
[Bemessungsgrundlagen, Sätze, Rechenweg je Option — ausdrücklich unverbindlich]

### IV. Empfehlung
[Rangfolge + Begründung]

### V. Offene Punkte für die steuerberatliche Prüfung
- [ ] § 42 AO Substanz-/Angemessenheitsprüfung
- [ ] [weitere fehlende Infos]

---
⚠️ KI-generiert · zu prüfen — keine Steuerberatung i.S.d. § 2 StBerG; § 42 AO ist im Einzelfall zu prüfen.
Erstellt: [Datum] | Skill: steuer-gestaltung v1.0.0
```

## Anti-Patterns

- ❌ Recommending a single option without a comparison — structuring is always comparative.
- ❌ Ignoring § 42 AO / economic substance. Aggressive arrangements without substance are flagged, not endorsed.
- ❌ Presenting tax-burden figures as exact or guaranteed savings.
- ❌ Tunnel-vision on tax while ignoring liability, civil-law or social-security side effects.
- ❌ Recommending arrangements that depend on non-disclosure or mislabeling — never.

## Error Handling
- Insufficient facts → list the minimum inputs needed to model an option.
- No comparable mandate or norm in brain → proceed from the corpus only and say so.
- If the goal implies evasion rather than legal optimization → decline and explain the line.
