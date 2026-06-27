---
name: precedent-finder
version: 1.0.0
description: |
  Finds controlling precedents (Präzedenzfälle, Leitentscheidungen) from the
  brain's legal corpus and indexed case law. Searches BGH, BAG, BFH, BVerwG,
  BVerfG (DE), OGH (AT), BGer (CH), EuGH/EGMR (EU) by legal issue, §, or
  keyword. Returns ranked results with Leitsätze, Az., and relevance notes.
  Does NOT access external databases — searches the brain corpus only.
triggers:
  - "find precedent"
  - "Präzedenzfall"
  - "Leitentscheidung"
  - "BGH-Urteil"
  - "OGH-Urteil"
  - "was hat der BGH entschieden"
  - "Rechtsprechung zu"
  - "Urteile zu"
  - "case law"
  - "controlling authority"
  - "BFH-Urteil"
  - "BVerwG"
  - "EuGH-Entscheidung"
  - "Judikatur"
priority: 65
tools:
  - search
  - query
  - get_page
  - think
mutating: false
---

# Precedent Finder Skill

> **Source:** Brain corpus only (law-corpus/de, law-corpus/at, indexed judgments).
> External DB access (juris, RIS, EUR-Lex) is NOT available — only what's in the brain.
> **Chains with:** [legal-subsumption](../legal-subsumption/SKILL.md) — feed found precedents back.

## Contract

1. Every returned decision includes: court, Az., date, Leitsatz
2. Relevance score is justified (why this case matches)
3. If no controlling authority found in brain, this is stated clearly
4. Results are ranked: bindend (BGH/OGH/EuGH) > überzeugend (OLG/LG) > informativ

## Protocol

### Step 1 — Parse Query

Extract from the user's request:

- **Legal issue**: what question needs a precedent?
- **Norm(s)**: which § §§ are at issue?
- **Court level preference**: BGH only / all courts / specific court
- **Jurisdiction**: DE / AT / CH / EU

### Step 2 — Multi-Strategy Search

Run in parallel:

```
# Strategy A: § + legal issue keywords
gbrain search "§ [X] [Gesetz] Urteil Leitsatz [issue_keywords]" --mode balanced

# Strategy B: Court + issue
gbrain search "BGH [issue_keywords] Az" --mode balanced

# Strategy C: Concept query (synthesis)
gbrain query "Welche Leitentscheidungen gibt es zu [issue]?" --think
```

### Step 3 — Rank and Format

```markdown
## Präzedenzfälle: [Rechtsfrage] — [Datum]

### Bindende Entscheidungen (BGH / EuGH / BVerfG)

#### 1. [Gericht] [Az.], [Datum]

- **Leitsatz:** [Text des Leitsatzes]
- **Norm:** § [X] [Gesetz]
- **Relevanz:** [Warum diese Entscheidung hier zutrifft]
- **Gefunden in:** [Brain-Slug]

#### 2. ...

### Überzeugende Entscheidungen (OLG / FG / LAG)

...

### Nicht gefunden im Brain-Corpus

Falls relevante Entscheide fehlen:

> Keine bindende BGH-Rechtsprechung zu [Frage] im Brain-Corpus indexiert.
> Empfehlung: Recherche in juris, beck-online, RIS (AT), oder EUR-Lex.

### Fazit

[2–3 Sätze: Welche Linie verfolgt die Rechtsprechung?]
```

### Step 4 — Optional: Link to Case

If a legal_case page exists in the brain, add the found precedents as `cites` links:

```
gbrain add_link --from "legal/cases/[case-slug]" --to "[precedent-slug]" --type cites
```

## Court Hierarchy (DE)

```
BVerfG (Verfassungsrecht)
    │
    ├── BGH (Zivilrecht, Strafrecht)
    ├── BVerwG (Verwaltungsrecht)
    ├── BFH (Steuerrecht)
    ├── BAG (Arbeitsrecht)
    └── BSG (Sozialrecht)
         │
    OLG / LSG / FG / LAG
         │
    LG / SG / AG
```

## AT Court Hierarchy

```
VfGH / VwGH
    │
    OGH (Zivilrecht, Strafrecht)
    BVwG (Verwaltungsrecht)
```

## Anti-Patterns

- ❌ Presenting a decision as "controlling" without checking court level and whether it is still good law.
- ❌ Returning a citation without the Aktenzeichen, court, and date.
- ❌ Treating a single lower-court decision as settled case law.

## Output Format

A ranked list of relevant decisions: court · Aktenzeichen · date · Leitsatz · why it
applies to the fact pattern, with the brain source for each — flagged as research
support, not a guarantee of current legal standing.
