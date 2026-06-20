---
name: tax-ruling-lookup
version: 1.0.0
description: |
  Analyzes tax notices (Bescheide), rulings, and tax questions using the brain's
  indexed tax corpus (EStG, KStG, UStG, GewStG, AO, ErbStG, GrEStG for DE;
  EStG, UStG, BAO for AT). Identifies appeals grounds (Einspruch), computes
  preliminary tax amounts, checks statute of limitations (Verjährung), and
  generates appeal letters (Einspruch/Beschwerde). Covers income tax, VAT,
  corporate tax, trade tax, and inheritance tax.
triggers:
  - "Steuerbescheid"
  - "Steuerprüfung"
  - "Betriebsprüfung"
  - "Einspruch Finanzamt"
  - "Steuerberechnung"
  - "Einkommensteuer"
  - "Körperschaftsteuer"
  - "Gewerbesteuer"
  - "tax assessment"
  - "tax appeal"
  - "VAT ruling"
  - "Steuererklärung prüfen"
  - "Betriebsausgaben"
  - "AO Verjährung"
priority: 65
tools:
  - search
  - think
  - get_page
  - put_page
  - extract_facts
  - add_timeline_entry
mutating: true
---

# Tax Ruling Lookup Skill

> **Tax advice disclaimer:** AI-generated tax analysis. No binding legal advice.
> Requires review by a licensed Steuerberater/Wirtschaftsprüfer before reliance.
> **Regulatory basis:** AO (DE), BAO (AT), StPO (CH-Steuer).

## Contract

1. Every § reference includes the exact norm text (sourced from brain corpus)
2. Deadlines (Einspruchsfrist, Verjährung) are calculated and flagged
3. Assessment of appeal prospects is rated: Stark / Mittel / Schwach / Keine
4. Required documentation for each appeal ground is listed

## Protocol

### Step 1 — Parse the Tax Notice

Extract from the Bescheid:

- **Steuerart**: ESt / KSt / USt / GewSt / ErbSt / GrESt / LSt
- **Veranlagungszeitraum**: Which tax year(s)?
- **Festgesetzte Steuer**: Betrag
- **Bekanntgabedatum**: When was the notice issued?
- **Einspruchsfrist**: § 355 AO — 1 Monat ab Bekanntgabe
- **Streitige Punkte**: What exactly is disputed?

### Step 2 — Brain Search for Applicable Rules

```
gbrain search "§ [X] [Gesetz] [issue_keyword] Betriebsprüfung" --mode balanced
gbrain search "[tax_issue] Einspruch Finanzamt Rechtsprechung" --mode balanced
gbrain query "Welche Möglichkeiten gibt es gegen [issue] vorzugehen?"
```

### Step 3 — Deadline Calculation

**Einspruchsfrist (§ 355 AO):**

- Standard: 1 Monat ab Bekanntgabe des Bescheids
- Bekanntgabe: § 122 AO — 3 Tage nach Aufgabe zur Post (Bekanntgabefiktion)
- Wenn Fristende auf Wochenende/Feiertag: Verlängerung auf nächsten Werktag (§ 108 AO)

**Verjährung (§§ 169–171 AO):**

- Regelverjährung: 4 Jahre
- Steuerhinterziehung: 10 Jahre
- Leichtfertige Steuerverkürzung: 5 Jahre

### Step 4 — Output Report

```markdown
## Steuerrechtliche Analyse — [Steuerart] [Zeitraum]

**Erstellt:** [Datum] | **Bescheiddatum:** [Datum] | **Einspruchsfrist läuft bis:** [Datum]

---

### ⏰ Fristen-Übersicht

- Bekanntgabe des Bescheids: [Datum]
- Einspruchsfrist endet: **[Datum]** (§ 355 AO) — [X] Tage verbleibend
- Festsetzungsverjährung: [Datum] (§ 169 AO)

---

### Streitige Punkte

#### Punkt 1: [Bezeichnung]

- **Streitbetrag:** [X] €
- **Steuerpunkt:** § [X] [Gesetz]
- **Position FA:** [Zusammenfassung]
- **Gegenposition:** [Begründung]
- **Erfolgsaussichten:** 🟢 Stark / 🟡 Mittel / 🔴 Schwach
- **Leitentscheidungen:** [BFH-Az., Datum, Leitsatz]
- **Benötigte Nachweise:** [Liste]

#### Punkt 2: ...

---

### Zusammenfassung Einspruchsaussichten

| Punkt      | Streitbetrag | Aussichten | Empfehlung |
| ---------- | ------------ | ---------- | ---------- |
| [P1]       | [X] €        | 🟢 Stark   | Einspruch  |
| [P2]       | [Y] €        | 🔴 Schwach | Abwägen    |
| **Gesamt** | **[Z] €**    | —          | —          |

---

### Empfohlene Maßnahmen

1. **Einspruch einlegen** (bis [Deadline]):
   - Gegen: [Punkte]
   - Begründung folgt / sofort begründen

2. **Aussetzung der Vollziehung (AdV)** beantragen (§ 361 AO):
   - Bei Einspruch: automatisch möglich
   - Sofort beantragen, da Fälligkeit am [Datum]

3. **Dokumentation beschaffen:**
   - [ ] [Dokument 1]
   - [ ] [Dokument 2]

4. **Steuerberater einschalten für:**
   - [ ] Einspruchsschreiben
   - [ ] Betriebsprüfungsabwehr

---

⚠️ KI-generierte Steueranalyse. Kein Ersatz für Steuerberatung.
```

### Step 5 — Generate Einspruchsschreiben Draft

If user wants a draft appeal letter:

```
An das
Finanzamt [FA]
[Adresse]

Einspruch
gegen den [Steuerart]-Bescheid [Zeitraum] vom [Datum], St.-Nr. [Nr.]

Sehr geehrte Damen und Herren,

hiermit legen wir fristgerecht Einspruch gegen den o.g. Bescheid ein.

Begründung:

Zu [Punkt 1]:
[Rechtliche Begründung mit §§]

Wir beantragen:
1. Den Bescheid dahingehend zu ändern, dass [Antrag]
2. Aussetzung der Vollziehung gemäß § 361 AO

[Unterschrift]
```

### Step 6 — File and Set Reminders

```
gbrain add_timeline_entry --date "[einspruchsfrist]" --text "Einspruchsfrist [Steuerart] [Zeitraum]" --tags ["steuer", "frist", "einspruch"]
gbrain put_page --slug "steuer/[mandant]/bescheide/[typ]-[zeitraum]-analyse" --type "legal_document"
```

## Key Tax Norms Quick Reference

| Norm       | Inhalt                            |
| ---------- | --------------------------------- |
| § 355 AO   | Einspruchsfrist: 1 Monat          |
| § 361 AO   | Aussetzung der Vollziehung        |
| § 169 AO   | Festsetzungsverjährung: 4 Jahre   |
| § 173 AO   | Änderung wegen neuer Tatsachen    |
| § 175 AO   | Änderung wegen Grundlagenbescheid |
| § 15 UStG  | Vorsteuerabzug                    |
| § 4 UStG   | Steuerbefreiungen                 |
| § 8b KStG  | Dividendenprivileg                |
| § 10d EStG | Verlustabzug                      |

## Anti-Patterns

- ❌ Presenting computed tax or an appeal-success rate as binding — orientation only, advisor to verify.
- ❌ Missing the Einspruchsfrist (§ 355 AO) computation or the Verjährung check.
- ❌ Drafting an Einspruch without citing the contested Bescheid positions and the §§ relied on.

## Output Format

A Bescheid analysis: contested positions, applicable §§, Einspruchsfrist + Verjährung,
appeal-prospect rating, and a draft Einspruchsschreiben — marked AI-generated, tax-
advisor review required.
