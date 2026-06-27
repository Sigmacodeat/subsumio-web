---
name: deadline-templates
version: 1.0.0
description: |
  Computes statutory deadlines from templates based on procedural events.
  Covers 7 jurisdictions (DE, AT, CH, EU, US-Federal, US-State, UK) with
  27+ recurring deadline types: service deadlines, appeal periods,
  objection periods, renewal deadlines, etc. Includes holiday exclusion
  (Bundesfeiertage, Landesfeiertage), weekend push-forward, and
  jurisdiction-aware rules. NEVER substitutes for a lawyer's own deadline
  calculation — always flag for human verification.
triggers:
  - "calculate deadline"
  - "Frist berechnen"
  - "Fristentemplate"
  - "deadline template"
  - "Wiedervorlage"
  - "Erinnerung erstellen"
  - "Wann läuft die Frist ab"
  - "Berechne Frist"
  - "Einspruchsfrist"
  - "Berufungsfrist"
  - "Beschwerdefrist"
  - "Rechtsmittelfrist"
  - "Klagefrist"
  - "Verjährungsfrist"
  - "Kündigungsfrist"
priority: 70
tools:
  - search
  - get_page
  - put_page
mutating: true
---

# Deadline Templates Skill

> **Warning:** This is an orientation tool only. Statutory deadline
> computation is jurisdiction-specific and subject to change. A licensed
> attorney must verify every computed deadline.

## Supported Jurisdictions

| Code         | Jurisdiction   | Holiday DB                   |
| ------------ | -------------- | ---------------------------- |
| `de`         | Deutschland    | Bundesfeiertage + Bundesland |
| `at`         | Österreich     | 16 Bundesfeiertage           |
| `ch`         | Schweiz        | Kantonale Feiertage          |
| `eu`         | EU             | EU-Wide (EuGH-Verfahren)     |
| `us-federal` | US Federal     | Federal holidays             |
| `us-state`   | US State       | State-specific               |
| `uk`         | United Kingdom | Bank holidays                |

## Deadline Templates

### Germany (DE)

| Event                                                         | Days                         | Direction                                     | Notes                                                            |
| ------------------------------------------------------------- | ---------------------------- | --------------------------------------------- | ---------------------------------------------------------------- |
| Verteidigungsanzeige (§ 276 Abs. 1 S. 1 ZPO)                  | 2 Wochen                     | nach Zustellung der Klage                     | Notfrist, schriftliches Vorverfahren                             |
| Klageerwiderung (§ 276 Abs. 1 S. 2 ZPO)                       | + 2 weitere Wochen           | nach Ablauf der Verteidigungsanzeigefrist     | Gerichtlich gesetzte Frist maßgeblich                            |
| Berufung — Einlegung (§ 517 ZPO)                              | 1 Monat                      | nach Zustellung des Urteils                   | Notfrist; spätestens 5 Monate nach Verkündung                    |
| Berufungsbegründung (§ 520 Abs. 2 ZPO)                        | 2 Monate                     | nach Zustellung des Urteils                   | Verlängerbar                                                     |
| Revision — Einlegung (§ 548 ZPO)                              | 1 Monat                      | nach Zustellung des Berufungsurteils          | Notfrist                                                         |
| Revisionsbegründung (§ 551 Abs. 2 ZPO)                        | 2 Monate                     | nach Zustellung des Berufungsurteils          | Verlängerbar                                                     |
| Einspruch gg. Versäumnisurteil (§ 339 Abs. 1 ZPO)             | 2 Wochen                     | nach Zustellung                               | Notfrist                                                         |
| Einspruch gg. Vollstreckungsbescheid (§ 700 i.V.m. § 339 ZPO) | 2 Wochen                     | nach Zustellung                               | Notfrist                                                         |
| Widerspruch gg. Mahnbescheid (§ 694 ZPO)                      | 2 Wochen                     | nach Zustellung                               | Hinweisfrist § 692 Abs. 1 Nr. 3 ZPO                              |
| Widerspruch Verwaltungsakt (§ 70 VwGO)                        | 1 Monat                      | nach Bekanntgabe des Verwaltungsakts          | Verwaltungsrecht                                                 |
| Anfechtungsklage (§ 74 VwGO)                                  | 1 Monat                      | nach Zustellung des Widerspruchsbescheids     | Verwaltungsrecht                                                 |
| Antrag auf Zulassung der Berufung (§ 124a Abs. 4 VwGO)        | 1 Monat                      | nach Zustellung des Urteils                   | Verwaltungsrecht                                                 |
| Sofortige Beschwerde (§§ 567, 569 Abs. 1 ZPO)                 | 2 Wochen                     | nach Zustellung                               | Notfrist                                                         |
| Sprungrevision (§ 566 ZPO)                                    | innerhalb der Berufungsfrist | nach Zustellung des Urteils                   | Zustimmung des Gegners erforderlich                              |
| Wiedereinsetzung (§§ 233, 234 ZPO)                            | 2 Wochen                     | nach Wegfall des Hindernisses                 | 1 Monat bei Versäumung der Begründungsfrist                      |
| Revision Straf — Einlegung (§ 341 StPO)                       | 1 Woche                      | nach Verkündung                               | Begründung: 1 Monat nach Ablauf der Einlegungsfrist (§ 345 StPO) |
| Verjährung (§ 195 BGB)                                        | 3 Jahre                      | Beginn: Schluss des Jahres (§ 199 Abs. 1 BGB) | Regelverjährung; Kenntnis erforderlich                           |
| Kündigungsfrist Arbeitsvertrag (§ 622 BGB)                    | variabel                     | —                                             | 4 Wochen bis 7 Monate                                            |

### Austria (AT)

| Event                                             | Days     | Direction                             | Notes                               |
| ------------------------------------------------- | -------- | ------------------------------------- | ----------------------------------- |
| Klagebeantwortung (§ 230 ZPO)                     | 4 Wochen | nach Zustellung der Klage             | Gerichtshofverfahren                |
| Berufung (§ 464 ZPO)                              | 4 Wochen | nach Zustellung des Urteils           | Einlegung samt Begründung           |
| Revision (§ 505 Abs. 2 ZPO)                       | 4 Wochen | nach Zustellung des Berufungsurteils  | Ordentliche Revision an den OGH     |
| Widerspruch gg. Versäumungsurteil (§ 397a ZPO)    | 14 Tage  | nach Zustellung                       | —                                   |
| Bescheidbeschwerde (§ 7 Abs. 4 VwGVG)             | 4 Wochen | nach Zustellung des Bescheids         | An das Verwaltungsgericht           |
| Revision an den VwGH (§ 26 VwGG)                  | 6 Wochen | nach Zustellung des Erkenntnisses     | —                                   |
| Beschwerde an den VfGH (Art. 144 B-VG, § 82 VfGG) | 6 Wochen | nach Zustellung der VwG-Entscheidung  | —                                   |
| Kündigungsfrist (§ 20 AngG)                       | variabel | —                                     | 6 Wochen bis 5 Monate (Arbeitgeber) |
| Verjährung Schadenersatz (§ 1489 ABGB)            | 3 Jahre  | ab Kenntnis von Schaden und Schädiger | Lange Frist: 30 Jahre               |

### Switzerland (CH)

| Event                       | Days                  | Direction                                 | Notes                             |
| --------------------------- | --------------------- | ----------------------------------------- | --------------------------------- |
| Klageantwort (Art. 222 ZPO) | gerichtlich angesetzt | nach Zustellung der Klage                 | Frist setzt das Gericht           |
| Berufung (Art. 311 ZPO)     | 30 Tage               | nach Eröffnung des begründeten Entscheids | 10 Tage im summarischen Verfahren |
| Verjährung (Art. 127 OR)    | 10 Jahre              | ab Fälligkeit                             | Regelverjährung                   |

## Protocol

### Step 1 — Identify the Triggering Event

Determine:

- What happened? (e.g., "Zustellung der Klage", "Urteilsverkündung")
- Date of the event
- Jurisdiction

### Step 2 — Select the Template

Map the event to the appropriate template from the tables above.

### Step 3 — Compute the Deadline

1. Start from the event date
2. Add the statutory period
3. Apply holiday exclusion (see Holiday DB)
4. Push forward if the result falls on a weekend or holiday
5. Verify with the user

### Step 4 — Surface the Result

```
## Berechnete Frist — Orientierungswert

**Auslösendes Ereignis:** [Event]
**Datum des Ereignisses:** [Date]
**Jurisdiktion:** [Jurisdiction]

**Statutory Period:** [Period]
**Raw Deadline:** [Date]
**Holiday Adjusted:** [Date]
**Final Deadline:** [Date]

---
⚠️ Dies ist ein Orientierungswert. Die tatsächliche Frist kann je nach
Verfahrensstand und Sonderregelungen abweichen. Maßgeblich ist die
jeweilige Verfahrensordnung.
```

## Anti-patterns

- Never compute a deadline without verifying the jurisdiction
- Never assume a simple calendar-day calculation — always check holidays
- Never present a computed deadline as authoritative
- Always flag for human verification

## Contract

1. Every computed deadline cites its template (jurisdiction + deadline type).
2. Weekend/holiday roll-forward is applied and shown.
3. Every result is flagged for human verification — never relied on unverified.

## Anti-Patterns

- ❌ Returning a date without the rule/template and the trigger event it counts from.
- ❌ Ignoring holiday calendars or the weekend push-forward.
- ❌ Presenting a statutory deadline as legally guaranteed without the verify flag.

## Output Format

Per deadline: type · jurisdiction · trigger date · computed due date (after roll-
forward) · the template/rule applied · a "verify with the responsible professional"
flag.
