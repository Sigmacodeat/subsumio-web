---
name: deadline-extract
version: 1.0.0
description: |
  Extract dates and deadlines from ingested documents and file them as
  timeline entries on the relevant brain pages — court deadlines and
  hearings (legal), filing/objection deadlines (tax), board meetings,
  renewals, earnout milestones (business). Surfaces every found date with
  its source so nothing buried on page 347 expires silently. NEVER
  computes statutory deadline periods authoritatively — extraction and
  surfacing only; period computation is flagged for human verification.
triggers:
  - "extract deadlines"
  - "find deadlines"
  - "Fristen extrahieren"
  - "Fristen finden"
  - "what deadlines are in this document"
  - "deadline audit"
  - "upcoming deadlines"
tools:
  - search
  - get_page
  - put_page
  - list_pages
mutating: true
---

# Deadline Extract Skill

> **Convention:** see [conventions/quality.md](../conventions/quality.md) for
> citation format. Every extracted deadline cites the exact source location.
>
> **Chains with:** [document-ingest](../document-ingest/SKILL.md) and
> [meeting-ingestion](../meeting-ingestion/SKILL.md) — run this skill after a
> document or transcript lands when the content is deadline-bearing
> (legal filings, tax notices, contracts, board materials).

## Contract

This skill guarantees:

- Every explicit date in the target page(s) is found and classified:
  `deadline` (something is due), `event` (something happens), `reference`
  (a date mentioned in passing).
- Deadlines and events are appended to the page's timeline section as
  dated entries with an inline `[Source: ...]` citation pointing to the
  originating document and location.
- A summary lists all found deadlines sorted by date, flagging anything
  within 14 days as URGENT and anything in the past as possibly stale.
- **It NEVER computes statutory periods.** When a document implies a
  period rather than a date ("Einspruch innerhalb eines Monats nach
  Bekanntgabe", "appeal within 30 days of service"), the skill records
  the trigger date and the period VERBATIM, marks the entry
  `⚠️ period — compute and verify professionally`, and does NOT write a
  computed due date. Statutory deadline computation (holidays, service
  rules, jurisdiction) is professional work this brain does not replace.

## Phases

1. **Scope.** Determine target: a single page (just-ingested document), a
   folder/source prefix, or — for "upcoming deadlines" — search the brain
   for timeline entries from today forward.
2. **Read & extract.** For each page, scan compiled truth AND raw content
   for dates: absolute (12.03.2026, March 12 2026, 2026-03-12), relative
   anchored ("within 14 days of delivery"), and recurring ("quarterly
   board meeting"). German formats (DD.MM.YYYY) and English formats both.
3. **Classify.** deadline / event / reference. Periods without computed
   dates → record verbatim with the ⚠️ marker (see Contract).
4. **Write timeline entries.** Append to the page's timeline section via
   `put_page` (auto_timeline reconciliation prevents duplicates on
   re-runs). Format: `- YYYY-MM-DD: <what is due/happens> [Source:
   <document>, <location>]`.
5. **Report.** Sorted deadline list with urgency flags. Offer to chain
   into [cron-scheduler](../cron-scheduler/SKILL.md) for reminder jobs on
   entries the user confirms.

## Domain hints

- **Legal (DE):** Berufungsfrist, Einspruchsfrist, Klageerwiderung,
  mündliche Verhandlung, Verjährung — these are period-typed more often
  than date-typed; expect the ⚠️ path. A Notfrist mention is ALWAYS
  urgent regardless of distance.
- **Tax (DE):** Abgabefristen, Einspruchsfrist (1 Monat), Vorauszahlungs-
  termine, E-Rechnung/Umstellungs-Stichtage — notices (Bescheide) carry a
  Bekanntgabe date that anchors periods; record it explicitly.
- **Business:** board meetings, option cliffs, earnout milestones,
  contract renewals & auto-renewal windows, LP reporting dates.

## Anti-patterns

- Computing a statutory due date and presenting it as authoritative. The
  ⚠️ verbatim-period rule exists because a wrong computed Frist is worse
  than none.
- Writing reference dates ("the contract of 12.03.2024") into the
  timeline as if they were deadlines — classify first.
- Duplicating timeline entries on re-runs — always read the existing
  timeline before appending.

## Anti-Patterns

- ❌ Emitting a deadline as authoritative — every extracted date is "verify with the responsible professional".
- ❌ Guessing a trigger date not present in the source document.
- ❌ Skipping the weekend/holiday roll-forward.

## Output Format

Per extracted deadline: type · trigger event + date · computed due date · source
document/passage · a human-verification flag.
