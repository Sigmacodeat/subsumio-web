# Legal Brain

The Legal Brain is a subsystem within GBrain for managing legal entities,
cases, evidence, and strategy. It stores everything in the existing `pages`
table (types `legal-entity` and `legal-case`) so no migration is required.

## Privacy First

All personally identifiable information (PII) is automatically anonymized
using SHA-256 HMAC with an owner key. Names, addresses, dates of birth, and
phone numbers are replaced with placeholders like `[ENT-01]`. Only the owner
can reverse the anonymization with their key.

## CLI Commands

```bash
# Entities (lawyers, firms, courts, opponents)
gbrain legal entity create --type lawyer --name "Kanzlei Müller" --areas "Zivilrecht"
gbrain legal entity list
gbrain legal entity show <id>
gbrain legal entity update <id> --jurisdiction "DE-BY"
gbrain legal entity delete <id>

# Cases
gbrain legal case create --title "Amtshaftung" --area "Amtshaftungsrecht" --opponent <id>
gbrain legal case list
gbrain legal case show <id>
gbrain legal case update <id> --status won
gbrain legal case delete <id>

# Analysis (AI-powered)
gbrain legal case strategy <id>    # Generate litigation strategy
gbrain legal case assess <id>      # Chance-of-success assessment
gbrain legal opponent "Name"       # Opponent profile & weaknesses
gbrain legal precedent "keyword"   # Precedent search in brain
```

## Admin UI

Open the GBrain admin dashboard and navigate to **Legal Brain**. You can:

- View stats (total entities, cases, open, won)
- Browse and search cases
- Browse entities
- Create, edit, and delete cases inline
- Create, edit, and delete entities inline

## Data Model

### Legal Entity (`type: legal-entity`)

```markdown
---
type: legal-entity
legal_type: lawyer | firm | court | opponent | expert | other
legal_areas: ["Zivilrecht", "Amtshaftungsrecht"]
jurisdiction: "DE-BY"
specializations: ["Verkehrsrecht"]
tags: ["preferred", "munich"]
---

# Kanzlei Müller
```

### Legal Case (`type: legal-case`)

```markdown
---
type: legal-case
case_number: "AG-M-123/24"
legal_area: "Amtshaftungsrecht"
sub_area: "Polizeihaftung"
status: open | pending | won | lost | settled | appealed
priority: low | medium | high | critical
opponent_id: <entity-slug>
claims: ["Schadensersatz", "Auskunft"]
---

# Amtshaftung Polizei

## Facts (anonymized)

[ENT-01] was stopped by [ENT-02] on [DATE-01]...
```

## Skills

| Trigger                                            | Skill                             |
| -------------------------------------------------- | --------------------------------- |
| "legal brain", "create a case", "analyze opponent" | `skills/legal-brain/SKILL.md`     |
| "project status", "Statusbericht"                  | `skills/pm-status/SKILL.md`       |
| "create a project task", "Fallaufgabe"             | `skills/pm-task/SKILL.md`         |
| "onboard project", "Projekt anlegen"               | `skills/project-onboard/SKILL.md` |

## Chaining

- After case creation → `pm-task` creates initial task list
- After case status change → `pm-status` generates status report
- After opponent analysis → `legal-brain strategy` recommends next steps
