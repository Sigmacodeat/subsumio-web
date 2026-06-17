---
name: kollisionspruefung
version: 1.0.0
description: |
  Checks for conflicts of interest according to § 43 BRAO (German Federal
  Lawyers' Act) and equivalent Austrian regulations. Scans the brain for cases
  where the queried person/entity appears as both client and opposing party,
  or in multiple cases with potentially conflicting interests. Reports
  severity levels and recommended actions. NEVER substitutes for the attorney's
  own professional duty to check for conflicts.
triggers:
  - "Kollisionsprüfung"
  - "Interessenkonflikt"
  - "Konflikt prüfen"
  - "Widerspruch"
  - "BRAO 43"
  - "conflict of interest"
  - "check conflict"
  - "opponent check"
  - "Mandantenkonflikt"
  - "Gegner prüfen"
priority: 65
tools:
  - search
  - list_pages
  - get_page
mutating: false
---

# Kollisionsprüfung (Conflict of Interest Check)

> **Warning:** This is a support tool only. The attorney's own professional
> duty to check for conflicts of interest under § 43 BRAO (or Austrian
> equivalent) cannot be delegated to software.

## When To Use

- Before accepting a new mandate
- Before taking on a new client
- When an existing client appears in a new matter with opposing interests
- When a former opposing party becomes a potential client

## Protocol

### Step 1 — Search for the Entity

Search the brain for all legal-case pages where the queried name appears:

```
gbrain search "<name>" --type legal-case
gbrain list_pages --type legal-case
```

Check frontmatter fields:
- `client_name`
- `opponent_name`
- `own_lawyer_name`

### Step 2 — Classify Findings

For each match, determine:
- Role in case: client, opponent, or other
- Case status: open, pending, settled, closed
- Whether the case is still active

### Step 3 — Assess Conflict Severity

| Scenario | Severity | Explanation |
|---|---|---|
| Same person as client AND opponent in different cases | **CRITICAL** | Direct conflict per § 43 Abs. 1 BRAO |
| Former opponent now wants to be client | **HIGH** | Risk of using confidential information |
| Same opponent in multiple active cases | **MEDIUM** | Monitor for inconsistent positions |
| Same client in multiple cases | **LOW** | No direct conflict, but watch for opposing interests |
| No matches found | **NONE** | No conflict detected in brain |

### Step 4 — Report

```
## Kollisionsprüfung — [Name] — [Datum]

### Ergebnis: [KEIN KONFLIKT / GERINGES RISIKO / MITTLERES RISIKO / KRITISCH]

**Gefundene Akten:**
| Akte | Rolle | Status |
|---|---|---|
| [Titel] | Mandant / Gegner | Offen / Erledigt |

### Empfehlung
[Specific recommendation based on severity]

### Rechtliche Grundlage
§ 43 BRAO (Deutschland) / § 16 RAO (Österreich): Verbot der Vertretung
mitverwickelter oder einander entgegenstehender Interessen.

---
⚠️ Dies ist ein Unterstützungstool. Die anwaltliche Pflichtprüfung nach
§ 43 BRAO kann nicht an Software delegiert werden.
```

## Anti-patterns

- Never approve a mandate based solely on this check
- Always report ALL findings, even if they seem minor
- Never dismiss a potential conflict without attorney review
- Flag cases where a person was an opponent in a closed case but now wants to be a client

## Contract

1. The check scans all matters/parties in scope and cites each potential conflict's source.
2. A conflict is reported with the colliding parties and the basis (§ 43a BRAO / § 3 BORA).
3. The output supports, never replaces, the responsible lawyer's conflict decision.

## Anti-Patterns

- ❌ Clearing a mandate as conflict-free without checking party aliases and related entities.
- ❌ Reporting a hit without naming the colliding parties and the matter.
- ❌ Treating the automated result as the final professional decision.

## Output Format

A conflict report: requested party/matter · potential conflicts (colliding party,
matter, basis) · risk classification · recommended action — marked as decision support
for the responsible lawyer.
