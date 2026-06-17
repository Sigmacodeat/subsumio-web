---
name: rent-roll-analysis
version: 1.0.0
description: |
  Analyses a rent roll / portfolio from the leases in the brain: occupancy /
  vacancy, total + per-unit rent, WALT (weighted average lease term), an expiry
  timeline (which leases end when), arrears, and concentration risk (a few
  tenants carrying most of the income). Produces the portfolio picture an asset
  manager needs before renewals or a sale. Advisory; figures are estimates.
triggers:
  - "Rent Roll"
  - "Mietaufstellung"
  - "Mieterträge analysieren"
  - "Leerstand"
  - "WALT"
  - "Mietvertragsablauf"
  - "Portfolio Miete"
  - "rent roll"
  - "occupancy analysis"
  - "lease expiry"
  - "portfolio analysis"
priority: 63
tools:
  - search
  - get_page
  - query
  - think
mutating: false
---

# Rent-Roll-Analysis Skill

> **Warning:** AI-assisted portfolio analysis. Figures are estimates derived from
> the brain's lease data; verify against the management system of record.
> **Chains with:** [lease-review](../lease-review/SKILL.md).

## Contract

This skill guarantees:
1. Occupancy, rent totals and WALT are computed from the leases in the brain (cited).
2. The expiry timeline lists which leases end when (deadline-bearing).
3. Arrears and tenant-concentration risk are flagged where the data allows.
4. Output is advisory, marked verify-against-system-of-record.

## Trigger Conditions

Use for a property/portfolio-level view. Do NOT use to review a single lease's
clauses (→ lease-review).

## Protocol

1. **Scope** the property/portfolio; pull the active leases + units from the brain.
2. **Compute** occupancy/vacancy, total + per-unit rent, WALT.
3. **Timeline** the lease expiries / break dates.
4. **Risk**: arrears, tenant concentration (income share of top tenants), upcoming vacancy.

## Output Format

```
## Rent-Roll-Analyse — [Objekt/Portfolio] — beratend, gegen System of Record prüfen

### Überblick
- Einheiten · Vermietet/Leerstand · Gesamtmiete · WALT

### Ablauf-Timeline
- [Datum] [Einheit/Mieter] läuft aus / Break

### Risiken
- Rückstände · Mieterkonzentration (Top-N Anteil) · anstehender Leerstand

---
⚠️ KI-gestützt · Schätzungen aus Brain-Daten. Erstellt: [Datum] | rent-roll-analysis v1.0.0
```

## Anti-Patterns

- ❌ Presenting computed rent/WALT as audited figures — they are estimates.
- ❌ Reporting occupancy without the expiry timeline (the forward risk).
- ❌ Ignoring tenant concentration when a few tenants carry the income.
- ❌ Computing from an incomplete lease set without saying so.

## Error Handling
- Lease data incomplete in brain → state coverage (n of m units) before reporting.
- No dates on leases → timeline cannot be built; flag the missing data.
