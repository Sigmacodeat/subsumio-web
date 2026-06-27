---
name: umsatzsteuer-check
version: 1.0.0
description: |
  Checks the VAT treatment of a transaction (Umsatzsteuer/USt) and produces a
  compliance checklist: place of supply (Leistungsort), tax liability
  (Steuerschuldnerschaft incl. Reverse-Charge § 13b UStG), intra-Community
  supplies/acquisitions (§ 4 Nr. 1b / § 6a UStG), OSS/IOSS, input-VAT
  deduction requirements (§ 15 UStG), invoice mandatory fields (§ 14/14a UStG)
  and the e-invoicing mandate. Covers DE (UStG) and AT (UStG) with EU
  MwStSystRL context. Produces a checklist + gap report; never binding advice.
triggers:
  - "Umsatzsteuer prüfen"
  - "USt-Behandlung"
  - "Reverse Charge"
  - "13b UStG"
  - "innergemeinschaftliche Lieferung"
  - "innergemeinschaftlicher Erwerb"
  - "Leistungsort"
  - "Vorsteuerabzug"
  - "OSS Verfahren"
  - "E-Rechnung Pflicht"
  - "USt-IdNr prüfen"
  - "VAT treatment"
  - "VAT compliance"
  - "place of supply"
  - "Rechnungspflichtangaben"
priority: 66
tools:
  - search
  - get_page
  - query
  - think
  - put_page
mutating: true
---

# Umsatzsteuer-Check Skill

> **Warning:** AI-generated VAT analysis. Not binding advice. Confirm with a tax
> advisor before relying on the result, especially for cross-border supplies.
> **Convention:** See [conventions/quality.md](../conventions/quality.md).
> **Chains with:** [steuer-subsumption](../steuer-subsumption/SKILL.md) for the underlying norm, [datev-export](../datev-export/SKILL.md) for booking.

## Contract

This skill guarantees:

1. The place of supply (Leistungsort) is determined with its § (3a/3b/3c UStG …).
2. Who owes the VAT is stated (supplier vs. recipient / Reverse-Charge § 13b).
3. Cross-border cases classify intra-Community vs. third-country and the exemption §.
4. Input-VAT deduction prerequisites (§ 15 UStG) and invoice mandatory fields (§ 14/14a) are checked.
5. The e-invoicing mandate status is noted; output is a checklist + gap report marked review-required.

## Trigger Conditions

Use when a transaction's VAT treatment, liability, or invoice correctness is in
question. Do NOT use for income/corporate tax classification (→ steuer-subsumption)
or for an existing Bescheid (→ tax-ruling-lookup).

## Protocol

### Step 1 — Classify the Transaction

- Supply of goods or services? B2B or B2C? Domestic / intra-EU / third country?
- Parties' VAT status and USt-IdNr (valid? VIES-checkable?).

### Step 2 — Determine Place of Supply & Liability

Apply § 3a/3b/3c UStG for the Leistungsort; determine the Steuerschuldner
(supplier or, under § 13b, the recipient). Flag intra-Community supply (§ 6a,
exempt under § 4 Nr. 1b with valid USt-IdNr + Gelangensnachweis) or acquisition.

### Step 3 — Input VAT & Invoice

Check § 15 UStG deduction prerequisites and § 14/14a mandatory invoice fields;
check the e-invoicing mandate (DE B2B phase-in) for the period.

### Step 4 — Checklist + Gap Report; optionally file in brain.

## Output Format

```
## USt-Prüfung — [Datum] — Vorläufig, kein Mandatsverhältnis

### I. Sachverhalt & Einordnung
Lieferung/​sonstige Leistung · B2B/B2C · Inland/EU/Drittland

### II. Ergebnis
- Leistungsort: [Ort] (§ [3a/3b/3c] UStG)
- Steuerschuldner: [Leistender / Leistungsempfänger (§ 13b UStG)]
- Steuersatz / Befreiung: [19%/7%/0% · § …]
- Grenzüberschreitend: [ig. Lieferung § 6a / ig. Erwerb / Ausfuhr § 6 / OSS]

### III. Checkliste
- [ ] USt-IdNr des Empfängers gültig (VIES)
- [ ] Gelangensnachweis vorhanden (bei ig. Lieferung)
- [ ] Pflichtangaben § 14/14a vollständig
- [ ] Vorsteuerabzug § 15 zulässig
- [ ] E-Rechnungs-Pflicht beachtet (Zeitraum)

### IV. Lücken / Risiken
[Liste]

---
⚠️ KI-generiert · zu prüfen — keine verbindliche umsatzsteuerliche Auskunft.
Erstellt: [Datum] | Skill: umsatzsteuer-check v1.0.0
```

## Anti-Patterns

- ❌ Assuming domestic VAT without checking the place of supply first.
- ❌ Treating an intra-Community supply as exempt without a valid USt-IdNr + Gelangensnachweis.
- ❌ Confirming input-VAT deduction when § 14 invoice fields are incomplete.
- ❌ Ignoring Reverse-Charge (§ 13b) on cross-border services to a business recipient.
- ❌ Stating a rate as final for the wrong period (rates and e-invoicing rules change).

## Error Handling

- USt-IdNr cannot be verified here → flag for VIES check, do not assume exemption.
- Facts insufficient to fix the place of supply → list what is needed.
- Period not given → default to current year and state the assumption.
