---
name: claims-assist
version: 1.0.0
description: |
  Assists the broker on a claim: checks the loss against the policy (is it within
  cover, which sub-limit/deductible applies), lists the notification window and
  the documentation the insurer will require, and drafts the next steps / the
  notification to the carrier. Broker support — does NOT adjudicate the claim;
  the insurer decides.
triggers:
  - "Schaden melden"
  - "Schadenfall"
  - "ist der Schaden gedeckt"
  - "Schadenmeldung"
  - "Schaden prüfen"
  - "claim"
  - "is this claim covered"
  - "file a claim"
  - "claim notification"
  - "Schadenregulierung"
priority: 64
tools:
  - search
  - get_page
  - query
  - think
  - put_page
  - add_timeline_entry
mutating: true
---

# Claims-Assist Skill

> **Warning:** Broker-side claim support. The insurer adjudicates and pays — this
> is not a coverage or settlement decision.
> **Chains with:** [policy-review](../policy-review/SKILL.md) for the underlying terms.

## Contract

This skill guarantees:
1. The loss is checked against the specific policy's cover, sub-limits and deductible (cited).
2. The claim notification window per the policy is surfaced and flagged as a deadline.
3. The required documentation list is produced for the line of business.
4. Output is broker support, marked as not-the-insurer's-decision.

## Trigger Conditions

Use when a loss/claim must be assessed against a policy and prepared for the
insurer. Do NOT use to review a policy in the abstract (→ policy-review).

## Protocol

1. **Match** the loss to the policy (from the brain): line, period, cover, sub-limits, deductible.
2. **Assess** prima-facie cover; note sub-limit/deductible effects and likely exclusions, with citations.
3. **Deadline**: surface the notification window; add a timeline entry.
4. **Prepare**: documentation checklist + a draft notification to the carrier.

## Output Format

```
## Schaden-Assist — [Schaden-Nr.] — Maklerunterstützung, keine Regulierungsentscheidung

### Deckungs-Einschätzung
- Police / Linie · prima-facie gedeckt? · Sublimit/Selbstbehalt · mögliche Ausschlüsse (Fundstelle)

### Fristen
- Meldefrist: [Datum] (Policenbedingung)

### Erforderliche Unterlagen
- [ ] …

### Entwurf Schadenmeldung an [Versicherer]
[Text]

---
⚠️ KI-gestützt · der Versicherer reguliert. Erstellt: [Datum] | claims-assist v1.0.0
```

## Anti-Patterns

- ❌ Telling the client the claim "is covered/will pay" — only the insurer decides.
- ❌ Missing the notification window (late notice can void cover).
- ❌ Ignoring the deductible/sub-limit when estimating the recoverable amount.
- ❌ Assessing without citing the policy terms relied on.

## Error Handling
- Policy not found in brain → request it; do not assume terms.
- Loss facts incomplete → list what the insurer will need before notifying.
