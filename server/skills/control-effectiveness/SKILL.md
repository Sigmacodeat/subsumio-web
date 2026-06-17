---
name: control-effectiveness
version: 1.0.0
description: |
  Assesses a GRC control's design and operating effectiveness against the
  obligation it is meant to satisfy (GDPR, AML/GwG, EU AI Act, ISO 27001),
  rates it (effective / partially effective / ineffective) with the evidence
  basis, and lists the remediation needed. Produces the demonstrable-effectiveness
  record 2026 regulators expect. Supports, never replaces, the compliance officer.
triggers:
  - "Kontrolle prüfen"
  - "Kontrollwirksamkeit"
  - "control effectiveness"
  - "Wirksamkeit der Maßnahme"
  - "ist die Kontrolle wirksam"
  - "control testing"
  - "Kontrolltest"
  - "IKS prüfen"
  - "effectiveness assessment"
  - "Maßnahme bewerten"
priority: 66
tools:
  - search
  - get_page
  - query
  - think
  - put_page
mutating: true
---

# Control-Effectiveness Skill

> **Warning:** AI-assisted control assessment. The rating supports the compliance
> officer's judgment and requires their sign-off; it is not an audit opinion.
> **Chains with:** [eu-ai-act-inventory](../eu-ai-act-inventory/SKILL.md), [dsgvo-compliance](../dsgvo-compliance/SKILL.md), [aml-screener](../aml-screener/SKILL.md).

## Contract

This skill guarantees:
1. The control is assessed on BOTH design and operating effectiveness.
2. It is mapped to the obligation/framework it is meant to satisfy (cited).
3. The rating (effective / partial / ineffective) states its evidence basis.
4. Remediation is listed for any gap; output marked sign-off-required.

## Trigger Conditions

Use to test/assess a specific control or measure. Do NOT use to classify an AI
system (→ eu-ai-act-inventory) or screen an entity (→ aml-screener).

## Protocol

1. **Identify** the control: what it does, the obligation it covers, its owner.
2. **Design**: is the control, as designed, capable of meeting the obligation?
3. **Operating**: is there evidence it operated over the period (logs, samples, dates)?
4. **Rate + remediate**: effective / partial / ineffective, with the evidence basis and the remediation for gaps; file/update the assessment.

## Output Format

```
## Kontroll-Wirksamkeit — [Kontrolle K-x] — Bewertung zu prüfen (Compliance-Freigabe)

### Kontrolle & Pflicht
Was sie tut · deckt Pflicht: [GDPR/GwG/AI Act/ISO …] (Quelle) · Owner

### Design-Wirksamkeit
[geeignet / Lücke] — Begründung

### Betriebs-Wirksamkeit
[Nachweis vorhanden? Stichproben/Logs/Zeitraum]

### Bewertung
[wirksam / teilweise / unwirksam] · Evidenzbasis

### Remediation
- [ ] […]

---
⚠️ KI-gestützt · keine Prüfungsaussage, Freigabe erforderlich. Erstellt: [Datum] | control-effectiveness v1.0.0
```

## Anti-Patterns

- ❌ Rating "effective" on design alone, without operating evidence.
- ❌ Assessing a control without naming the obligation it covers.
- ❌ Presenting the rating as an audit opinion.
- ❌ Omitting remediation for a partial/ineffective rating.

## Error Handling
- No operating evidence available → rate design only and flag the evidence gap explicitly.
- Control-to-obligation mapping unclear → ask; an unmapped control can't be rated for effectiveness.
