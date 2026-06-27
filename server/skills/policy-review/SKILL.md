---
name: policy-review
version: 1.0.0
description: |
  Reviews an insurance policy from the broker's side: extracts the coverage
  scope, limits, sub-limits, deductibles (Selbstbehalt), exclusions and key
  conditions, then flags risks and gaps against the client's situation. Works
  across lines (liability, property, cyber, fleet, life/health). Broker support,
  not carrier underwriting; never a binding coverage confirmation.
triggers:
  - "Police prüfen"
  - "Vertrag prüfen Versicherung"
  - "Deckung prüfen"
  - "Versicherungsumfang"
  - "Selbstbehalt"
  - "Ausschlüsse prüfen"
  - "Sublimit"
  - "review policy"
  - "policy review"
  - "coverage check"
  - "what does this policy cover"
  - "exclusions"
priority: 64
tools:
  - search
  - get_page
  - query
  - think
  - put_page
mutating: true
---

# Policy-Review Skill

> **Warning:** AI-assisted policy review for the broker. Not a binding coverage
> confirmation — the policy wording and the carrier govern. Confirm with the insurer.
> **Chains with:** [coverage-gap-finder](../coverage-gap-finder/SKILL.md), [claims-assist](../claims-assist/SKILL.md).

## Contract

This skill guarantees:

1. Coverage scope, limits/sub-limits, deductibles and exclusions are extracted with the clause location.
2. Each flagged risk cites the policy passage it derives from.
3. Findings are mapped to the client's situation where the brain has it.
4. The output is broker decision-support, marked not-a-binding-coverage-confirmation.

## Trigger Conditions

Use when a policy or its wording needs to be understood/assessed. Do NOT use to
adjudicate a specific claim (→ claims-assist) or to find missing cover across a
client's book (→ coverage-gap-finder).

## Protocol

1. **Identify** the policy: line, insurer, period, insured party (from the brain or the document).
2. **Extract** coverage scope, limits, sub-limits, deductibles, key conditions, exclusions — each with its clause location.
3. **Assess** against the client's known risk situation; flag gaps/risks.
4. **File** a review page (optional) referencing the policy.

## Output Format

```
## Policen-Review — [Police-Nr.] — Maklerprüfung, keine verbindliche Deckungszusage

### Deckung
- Linie / Versicherer / Laufzeit
- Deckungssumme · Sublimits · Selbstbehalt

### Wesentliche Bedingungen & Ausschlüsse
- [Klausel] → [Bedeutung] (Fundstelle)

### Risiken / Lücken
- [Risiko] (Fundstelle / Bezug zur Mandantenlage)

---
⚠️ KI-gestützt · Police + Versicherer maßgeblich. Erstellt: [Datum] | policy-review v1.0.0
```

## Anti-Patterns

- ❌ Confirming cover as binding — the wording and the carrier decide.
- ❌ Flagging an exclusion without its clause location.
- ❌ Ignoring sub-limits/deductibles that gut a headline limit.
- ❌ Assessing in isolation when the client's risk situation is in the brain.

## Error Handling

- Policy wording not available → review the schedule only and say what is missing.
- Line unknown → ask; do not assume standard terms.
