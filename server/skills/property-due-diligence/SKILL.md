---
name: property-due-diligence
version: 1.0.0
description: |
  Runs broker/asset-manager-side due diligence for a property purchase or sale:
  builds the document checklist (title/Grundbuch, leases, service charges,
  encumbrances/Lasten, permits, valuations), surfaces red flags from the
  documents in the brain, lists open items and the deadlines (exclusivity, LOI,
  closing). Advisory support for the deal team; not legal/tax/valuation advice.
triggers:
  - "Due Diligence Immobilie"
  - "Ankaufsprüfung"
  - "Immobilie kaufen prüfen"
  - "Objektprüfung"
  - "Grundbuch prüfen"
  - "Lasten Immobilie"
  - "property due diligence"
  - "real estate due diligence"
  - "acquisition checklist"
  - "Transaktionsprüfung"
priority: 63
tools:
  - search
  - get_page
  - query
  - think
  - put_page
  - add_timeline_entry
mutating: true
---

# Property-Due-Diligence Skill

> **Warning:** AI-assisted deal support. Title, tax and valuation conclusions
> require the respective professionals; this is not legal/tax/valuation advice.
> **Chains with:** [lease-review](../lease-review/SKILL.md), [rent-roll-analysis](../rent-roll-analysis/SKILL.md).

## Contract

This skill guarantees:

1. A document checklist is produced for the transaction type (purchase/sale).
2. Red flags are cited to the document/passage they come from in the brain.
3. Deal deadlines (exclusivity, LOI, closing) are surfaced and flagged.
4. Output is deal-team support, marked not-legal/tax/valuation-advice.

## Trigger Conditions

Use for a purchase/sale/valuation deal. Do NOT use for ongoing portfolio
management (→ rent-roll-analysis) or a single lease (→ lease-review).

## Protocol

1. **Scope** the deal: property, type (buy/sell), parties, target dates.
2. **Checklist**: title/Grundbuch, leases + rent roll, service charges, encumbrances/Lasten, permits/Baulasten, valuations, insurance.
3. **Red flags**: from the documents in the brain (e.g., short WALT, encumbrance, missing permit), each cited.
4. **Deadlines + open items**: exclusivity/LOI/closing; add timeline entries; list what's still needed.

## Output Format

```
## Immobilien-Due-Diligence — [Objekt] — Deal-Support, keine Rechts-/Steuerberatung

### Deal
Typ (Kauf/Verkauf) · Parteien · Zieltermine

### Unterlagen-Checkliste
- [ ] Grundbuch · Mietverträge + Rent Roll · Nebenkosten · Lasten · Genehmigungen · Bewertung · Versicherung

### Red Flags
- [Befund] (Fundstelle)

### Fristen & offene Punkte
- [Datum] [Exklusivität/LOI/Closing]; offen: […]

---
⚠️ KI-gestützt · Title/Steuer/Bewertung durch Fachleute. Erstellt: [Datum] | property-due-diligence v1.0.0
```

## Anti-Patterns

- ❌ Concluding on title/encumbrances as legal advice — flag for the lawyer/notary.
- ❌ A generic checklist not adapted to buy vs sell.
- ❌ Listing a red flag without its document source.
- ❌ Missing the closing/exclusivity deadlines.

## Error Handling

- Documents missing in brain → mark the checklist items as "not provided", don't assume clean.
- Deal type unclear → ask; buy-side and sell-side diligence differ.
