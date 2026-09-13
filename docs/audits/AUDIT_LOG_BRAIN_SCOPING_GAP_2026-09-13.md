# Finding: `createHandler`'s generic audit log is not per-tenant

Status: confirmed, NOT fixed. Documented while building the support-session
feature (`src/lib/support-session.ts`), which had to work around it directly
rather than rely on it.

## What's broken

`src/lib/audit.ts`'s `logAudit(action, entityType, opts)` writes to the
tamper-evident, GoBD-immutable `subsumio_audit_log` Postgres table, scoped by
`opts.brainId` (defaults to the string `"system"` when omitted) and by
`opts.userId` / `opts.userEmail` (both `undefined` when omitted).

`src/lib/api-handler.ts`'s `createHandler({ audit: (ctx, body, query, req) =>
AuditSpec })` — the mechanism ~250 route files use to record what they did —
calls the spec function (which has `ctx`, and therefore `ctx.brainId`,
`ctx.user.id`, `ctx.user.email`, in scope) but only forwards `entityId` and
`details` to `logAudit()`:

```ts
// src/lib/api-handler.ts, both call sites (session-handler + webhook-handler)
void logAudit(s.action, s.entityType, {
  entityId: s.entityId,
  details: s.details,
});
```

`AuditSpec` (same file) doesn't even have `brainId` / `userId` / `userEmail`
fields, so there's nowhere for a route to pass them even if it wanted to.

**Net effect:** virtually every audited write in the app — case updates,
document changes, invoice actions, team changes, everything with an `audit:`
option — lands in the Postgres table under `brain_id = "system"`, with no
`user_id` / `user_email`. There is effectively one shared, unscoped bucket
instead of one hash-chained trail per firm.

## Why this matters

- `GET /api/audit` (the Kanzlei-facing "Audit" workspace) does **not** read
  this table at all — it reads brain pages of type `audit_log` via the engine
  (tenant-isolated by `x-subsumio-source`). Nothing in production currently
  writes those pages for ordinary actions (only `logAudit()`'s **dev-only,
  no-Postgres fallback** does, at `src/lib/audit.ts` around line 127 at the
  time of writing). So in production, the Kanzlei "Audit" page shows nothing
  for regular case/document/invoice/team actions, regardless of how much a
  firm actually did.
- The Postgres `subsumio_audit_log` table (the one the code proudly documents
  as "tamper-evident" and "GoBD-immutable") is only ever read by
  `/api/admin/audit-export` (operator-only) and `listAuditLogs()`. Since
  almost every entry is bucketed under `"system"` with no actor, an export
  filtered by `brain_id` for a specific firm returns close to nothing for the
  routes affected by this gap, and what it does return can't be attributed to
  a user.

## What was NOT changed here

This is a ~250-call-site blast radius (every `audit:` option in
`src/app/api/**`). Fixing it properly means: adding `brainId` / `userId` /
`userEmail` to `AuditSpec`, populating them from `ctx` at both call sites in
`api-handler.ts` (or defaulting them from `ctx` automatically so call sites
don't need to change), and separately deciding whether `GET /api/audit`
should start reading `subsumio_audit_log` instead of (or in addition to) the
engine brain-page store — a real product decision, not just a bug fix, since
it changes what "the Kanzlei audit trail" actually is. That's out of scope
for a support-session feature and needs its own review.

## What support-session did instead

`src/app/api/admin/support-session/{route,end/route}.ts` write BOTH:

1. `logAudit("support.session_start" | "support.session_end", "org", {
   brainId: org.brainId, userId, userEmail, ... })` — the operator-side,
   durable Postgres record, with the fields this gap normally drops.
2. A brain page of type `audit_log`, written directly via
   `src/lib/support-session-audit.ts` using the org's own
   `engineHeadersForBrain()` — the actual channel the Kanzlei "Audit"
   workspace reads, so a firm genuinely sees "Subsumio-Support: Zugriff
   gestartet/beendet" entries.

This makes support-session entries correctly firm-visible without touching
the shared `createHandler` audit path, but it does not fix the underlying gap
for anything else.
