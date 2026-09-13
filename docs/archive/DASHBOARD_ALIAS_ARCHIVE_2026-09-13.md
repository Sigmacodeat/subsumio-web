# Dashboard alias archive manifest

Status: removed from the active Subsumio Kanzlei build on 2026-09-13.

Canonical source snapshot: annotated Git tag
`archive/dashboard-aliases-pre-focus-2026-09-13`.

## Boundary

Six `page.tsx` files represented no independent product capability. They only
forwarded old URLs to an existing canonical Kanzlei workspace. Keeping them as
App Router pages inflated the generated page count and, in the case of
`time-tracking`, required a client-side React redirect.

Removed page files:

- `/dashboard/rechtsprechung` → `/dashboard/research?tab=rechtsprechung`
- `/dashboard/norms` → `/dashboard/research?tab=normen`
- `/dashboard/judgements-db` → `/dashboard/research?tab=judgements-db`
- `/dashboard/precedent-search` → `/dashboard/research?tab=precedent-search`
- `/dashboard/commentaries` → `/dashboard/research?tab=commentaries`
- `/dashboard/time-tracking` → `/dashboard/time`

The public URLs remain available as permanent, server-side redirects in
`next.config.ts`. Existing bookmarks and query parameters therefore continue
to work; no tenant data, API route, business logic or canonical workspace was
removed.

## Recovery

Restore an archived page with:

```bash
git checkout archive/dashboard-aliases-pre-focus-2026-09-13 -- <path>
```
