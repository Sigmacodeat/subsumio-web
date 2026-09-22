---
name: judge-submission
description: Evaluates a legal submission for completeness, citation grounding, and procedural correctness.
triggers:
  - "judge submission"
  - "evaluate submission"
  - "check brief"
  - "review legal brief"
  - "assess submission quality"
---

# Judge Submission

This skill evaluates a legal submission against quality criteria:

- Citation grounding (all § references traceable to sources)
- Procedural completeness (all required sections present)
- Argumentative coherence (claims supported by cited authority)

## Usage

```
gbrain skill judge-submission --file path/to/brief.md
```
