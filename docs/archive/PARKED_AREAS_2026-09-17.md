# Parked product areas — 2026-09-17

Status: moved out of the active build on 2026-09-17 (owner decision). These areas
are not part of a lawyer's daily work with Subsumio and were never verified in
practice. Nothing was deleted: the source is kept so an area can come back after
it has been checked end to end.

## What was parked

| Area (former path)                                                       | Now redirects to     |
| ------------------------------------------------------------------------ | -------------------- |
| `/dashboard/war-room`                                                    | `/dashboard`         |
| `/dashboard/crypto-forensics`                                            | `/dashboard`         |
| `/dashboard/court-analytics` (+ API `/api/court-analytics`, answers 410) | `/dashboard`         |
| `/dashboard/experience`                                                  | `/dashboard`         |
| `/dashboard/autonomous` (Autopilot)                                      | `/dashboard`         |
| `/dashboard/mobile` (incl. `/pipeline`)                                  | `/dashboard`         |
| `/dashboard/online-booking`                                              | `/dashboard`         |
| `/dashboard/team-meeting`                                                | `/dashboard`         |
| `/dashboard/analytics` (hub)                                             | `/dashboard/reports` |
| `/dashboard/litigation-analytics`                                        | `/dashboard/reports` |
| `/dashboard/portfolio-insights`                                          | `/dashboard/reports` |
| `/dashboard/adoption-analytics`                                          | `/dashboard/reports` |
| `/dashboard/chat/analytics`                                              | `/dashboard/chat`    |
| `/dashboard/chat/compare`                                                | `/dashboard/chat`    |

## Where it lives

- Source: `src/app/_archive/parked/dashboard/<area>` and
  `src/app/_archive/parked/api/court-analytics`. Folders starting with `_` are
  not routed by Next.js; the code still type-checks and its unit tests still run.
- Redirects: `PARKED_DASHBOARD_REDIRECTS` in `src/middleware.ts`, pinned by
  `src/middleware.test.ts`.
- Removed references: sidebar, settings hub, command palette, Kanzlei-Tools
  page, assistant navigation allowlist, e2e route lists. "Berichte" took the
  analytics hub's place in the sidebar.
- Deliberately kept: text keys in `src/content/dashboard.ts` (the parked pages
  still use them) and backend APIs that active features share
  (`/api/autonomous` is used by drafting; `/api/experience`,
  `/api/legal/portfolio-insights`, `/api/legal/analytics` stay behind normal
  authentication).

## Bringing an area back

1. `git mv src/app/_archive/parked/dashboard/<area> src/app/dashboard/<area>`
2. Remove its row from `PARKED_DASHBOARD_REDIRECTS`.
3. Restore the sidebar entry (see the commit that parked it).
4. Verify the area in practice before it ships — that is the reason it was parked.
