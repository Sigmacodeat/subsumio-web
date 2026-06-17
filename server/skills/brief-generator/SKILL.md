---
name: brief-generator
version: 1.0.0
description: |
  Generates German-language legal briefs (Schriftsätze) for courts and authorities:
  Klageschrift, Klageerwiderung, Berufungsbegründung, Einspruch, Widerspruch,
  Beschwerde, einstweilige Verfügung, Mahnung, Anwaltsschreiben. Uses the case
  brain (facts, precedents, parties) as context. Output is a draft requiring
  attorney review and signature before filing.
triggers:
  - "Schriftsatz"
  - "erstelle Klage"
  - "Klageschrift"
  - "Klageerwiderung"
  - "Berufungsbegründung"
  - "draft brief"
  - "write complaint"
  - "Einspruch einlegen"
  - "Widerspruch schreiben"
  - "einstweilige Verfügung"
  - "legal letter"
  - "Anwaltsschreiben"
  - "Abmahnung"
  - "Mahnung schreiben"
  - "generate court filing"
priority: 70
tools:
  - search
  - think
  - get_page
  - put_page
  - query
mutating: true
---

# Brief Generator Skill

> **Draft only.** All generated Schriftsätze require attorney review, adaptation, and
> signature before filing. Filing deadlines (Fristen) must be verified independently.
> **Chains with:** [precedent-finder](../precedent-finder/SKILL.md) and [legal-subsumption](../legal-subsumption/SKILL.md).

## Contract

1. Every claim (Antrag) has a specific legal basis (Anspruchsgrundlage)
2. Facts are sourced from the case brain — no invented facts
3. Citations to precedents are from [precedent-finder](../precedent-finder/SKILL.md)
4. The output follows ZPO/VwGO/FGO format for the target court
5. Deadlines and filing requirements are listed but NOT guaranteed

## Protocol

### Step 1 — Gather Case Context

```
gbrain get_page "legal/cases/[case-slug]"
gbrain search "[case parties] Sachverhalt Anspruch" --source [workspace-source]
gbrain query "Fakten und Ansprüche im Fall [case-name]"
```

Required information:
- **Gericht**: Welches Gericht / welche Behörde?
- **Verfahrensart**: Zivilklage / Verwaltungsklage / Strafanzeige / Einspruch
- **Parteien**: Kläger/Antragsteller, Beklagter/Antragsgegner (inkl. Anschriften)
- **Streitgegenstand**: Was wird begehrt?
- **Streitwert**: Für Gerichtsgebühren (GKG)
- **Anspruchsgrundlage**: Welche §§?
- **Deadline**: Bis wann muss eingereicht werden?

### Step 2 — Select Template

| Schriftsatz | Anlass | Frist (DE) |
|---|---|---|
| Klageschrift | Neue Klage | Keine (Verjährung beachten) |
| Klageerwiderung | Auf Klage reagieren | Vom Gericht gesetzt (meist 2–4 Wo) |
| Berufungsbegründung | Berufung | § 520 ZPO: 2 Monate ab Zustellung |
| Revisionsbegründung | Revision | § 548 ZPO: 5 Monate ab Urteilszustellung |
| Einstweilige Verfügung | Dringend | Sofort (Glaubhaftmachung erforderlich) |
| Einspruch (Mahnbescheid) | Gegen Mahnbescheid | § 694 ZPO: 2 Wochen |
| Widerspruch (Verwaltung) | Gegen Bescheid | § 70 VwGO: 1 Monat |

### Step 3 — Generate Draft

```markdown
[ENTWURF — NUR ZUR INTERNEN VERWENDUNG — NICHT EINREICHEN OHNE ANWALTLICHE PRÜFUNG]

[Anwalt/Kanzlei]                    [Ort], den [Datum]
[Adresse]
[Telefon / Fax / E-Mail]
Az.: [Aktenzeichen intern]

An das
[Gericht / Behörde]
[Adresse]

Klage / Klageerwiderung / [Schriftsatzart]

in dem Rechtsstreit

[Kläger/Antragsteller], [Adresse]
— Kläger —

gegen

[Beklagter/Antragsgegner], [Adresse]
— Beklagter —

Az. (Gericht): [falls vorhanden]
Streitwert: [Betrag] €

---

## Anträge

Der Kläger beantragt:

1. Den Beklagten zu verurteilen, [Hauptantrag].
2. Die Kosten des Rechtsstreits dem Beklagten aufzuerlegen.
3. Das Urteil gegen Sicherheitsleistung in Höhe von [X] % des Urteilsbetrags für vorläufig vollstreckbar zu erklären.

Hilfsweise: [Hilfsantrag falls erforderlich]

---

## Sachverhalt

[Nummerierte Tatsachendarstellung — chronologisch, § für § belegbar]

1. [Tatsache 1]
2. [Tatsache 2]
...

---

## Rechtliche Würdigung

### I. Anspruchsgrundlage

Der Kläger hat gegen den Beklagten einen Anspruch auf [Begehren] aus § [X] [Gesetz].

### II. Tatbestandsvoraussetzungen

[Subsumtion — Gutachtenstil]

**1. [Tatbestandsmerkmal]**

[Norm + Sachverhalt + Schluss]

**2. ...**

### III. Höhe / Umfang

[Berechnung des Streitwerts / Schadensersatzes]

### IV. Leitentscheidungen

[Zitierte BGH-Entscheide]

---

## Beweisangebote

Zum Beweis der vorstehenden Behauptungen werden angeboten:

Zu Ziff. 1: [Beweis — Zeuge / Urkunde / Sachverständiger]
Zu Ziff. 2: ...

Anlagen:
- Anlage K 1: [Bezeichnung]
- Anlage K 2: [Bezeichnung]

---

[Unterschrift Anwalt]

---
⚠️ ENTWURF — Erstellt von KI-System, erfordert anwaltliche Überprüfung vor Einreichung.
Frist prüfen: [Deadline] | Schriftsatz-Typ: [Typ] | Erstellt: [Datum]
```

### Step 4 — File Draft in Brain

```
gbrain put_page \
  --slug "case/[case-id]/schriftsaetze/[type]-[date]-entwurf" \
  --type "legal_document" \
  --metadata '{"document_type": "brief", "subtype": "[klageschrift|klageerwiderung|berufung]", "status": "draft", "requires_review": true, "filing_deadline": "[date]"}'
```

## Anti-Patterns

- ❌ Presenting a generated brief as filing-ready — it is a draft requiring attorney review and signature.
- ❌ Inventing facts, dates, or case citations not present in the case brain.
- ❌ Omitting the mandatory ZPO structure (Rubrum, Anträge, Begründung, Beweisangebote).
- ❌ Filing deadlines or party data without verifying them against the matter record.

## Output Format

A German court-filing draft (Klageschrift / Klageerwiderung / Berufungsbegründung /
einstweilige Verfügung) in ZPO structure, clearly marked as an AI-generated draft
for attorney review, with citations to the case-brain sources used.
