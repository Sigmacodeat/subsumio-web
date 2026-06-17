---
name: datev-export
version: 1.0.0
description: |
  Exports time entries and billing data in DATEV-compatible format
  (German accounting standard). Produces CSV/ASCII files readable by
  DATEV Unternehmen Online, Rechnungswesen, and Kanzlei-Rechnung.
  Supports USt-IdNr, Kostenstellen, and mandate-based grouping.
triggers:
  - "DATEV Export"
  - "DATEV"
  - "Buchhaltungsexport"
  - "Rechnung exportieren"
  - "Zeiterfassung exportieren"
  - "Kanzlei-Buchhaltung"
  - "Abrechnungsexport"
  - "billing export"
  - "time tracking export"
  - "accounting export"
  - "Kostenstelle"
  - "USt-IdNr"
  - "Mandantenabrechnung"
priority: 55
tools:
  - search
  - get_page
mutating: false
---

# DATEV-Export Skill

> **Note:** DATEV is a proprietary German accounting standard. This skill
> generates ASCII/CSV files compatible with DATEV Unternehmen Online.
> Always verify with a Steuerberater before importing.

## When To Use

- The user wants to export time entries for accounting
- The user needs billing data for a tax advisor
- Monthly/quarterly billing reconciliation

## DATEV Format (ASCII-CSV)

### Header Fields
```
USt-ID-Nr;Datum;Belegnr;Buchungstext;Betrag;Kostenstelle;Mandant;Zeit
```

### Time Entry Row
```
DE123456789;31.03.2026;2026-001;Rechtsberatung Vertragsbruch;500,00;1200;Muster GmbH;2,5
```

### Billing Types (Kostenstellen)
| Code | Description |
|---|---|
| 1100 | Beratung (Consulting) |
| 1200 | Prozessvertretung (Litigation) |
| 1300 | Vertragsrecht (Contract) |
| 1400 | Arbeitsrecht (Employment) |
| 1500 | Datenschutz (Privacy) |
| 1600 | M&A / Corporate |
| 1700 | Steuerrecht (Tax) |
| 1800 | Compliance |
| 1900 | Sonstiges (Other) |

## Protocol

### Step 1 — Gather Time Entries

Search for time entries in the brain:
```
gbrain search "time tracking" --type legal-case
gbrain list_pages --type legal-case
```

Extract from case frontmatter:
- `time_entries`: Array of {date, description, minutes, rate}
- `case_number`: For Belegnr
- `client_name`: For Mandant
- `legal_area`: For Kostenstelle mapping

### Step 2 — Map to DATEV Codes

```
legal_area → Kostenstelle:
- "Vertragsrecht" → 1300
- "Prozessrecht" → 1200
- "Arbeitsrecht" → 1400
- "Datenschutz" → 1500
- "Steuerrecht" → 1700
- default → 1100
```

### Step 3 — Compute Amounts

Per entry:
```
Hours = minutes / 60
Amount = hours × hourly_rate
```

### Step 4 — Generate CSV

```csv
USt-ID-Nr;Datum;Belegnr;Buchungstext;Betrag;Kostenstelle;Mandant;Stunden
DE123456789;31.03.2026;2026-001;Rechtsberatung;500,00;1100;Muster GmbH;2,50
DE123456789;31.03.2026;2026-001;Klagenführung;750,00;1200;Muster GmbH;3,75
```

### Step 5 — Validation

- Check USt-ID-Nr format
- Verify decimal separator is comma (German)
- Ensure dates are DD.MM.YYYY
- Sum matches total

## Output Format

```
## DATEV-Export — [Period]

### Zusammenfassung
| Mandant | Stunden | Betrag (netto) |
|---|---|---|
| [Client] | [Hours] | [Amount] € |

### CSV-Export
```csv
[CSV content]
```

### Import-Anweisung
1. Speichern als .csv mit BOM
2. In DATEV Unternehmen Online importieren
3. Buchungskonten zuordnen
4. Prüfprotokoll erstellen

---
⚠️ Dies ist ein technischer Export. Die steuerliche Korrektheit muss
vom Steuerberater verifiziert werden.
```

## Anti-patterns

- Never export without VAT ID verification
- Never mix net/gross amounts
- Never omit currency indication
- Always include date of service (Leistungsdatum)

## Contract

1. Output conforms to the chosen DATEV format (Unternehmen Online / Rechnungswesen / Kanzlei-Rechnung).
2. Mandatory fields (Kostenstelle, USt-IdNr, mandate grouping) are preserved where provided.
3. The export is generation-only — no booking is performed in any system.

## Anti-Patterns

- ❌ Emitting a CSV/ASCII shape that DATEV rejects (wrong delimiter, encoding, or header).
- ❌ Dropping or guessing USt-IdNr / Kostenstelle instead of flagging them as missing.
- ❌ Implying the export was booked — it only produces files for import.
