# Orphaned API routes archive

Status: removed from the Subsumio build on 2026-09-13.

Canonical source snapshot: annotated Git tag `archive/orphan-api-routes-2026-09-13`.

## Criterion

Each removed route had no caller in the web app, the Word/Outlook add-ins,
mobile, cron configuration, deploy scripts or the smoke test. Every route was
judged from a law firm's perspective: removed only when the capability already
exists another way or is not needed for the pilot.

## Removed

- **Duplicates of client-side tools:** `fachrechner`, `court-directory`,
  `pkh-beratungshilfe`, `letterhead-rubrum`, `legal/rvg` (the calculators run in
  the browser via their libraries).
- **Duplicates of other routes:** `legal/statute`, `legal/statute-search` (norms are
  served from the brain), the `matter-context/[caseSlug]/*` sub-routes and
  `matter-context/quality` (the base matter-context route returns the bundle),
  `auth/reset-password` (`auth/reset`), `cases/bulk-import` (`bulk-cases`),
  `legal/document-review`, `legal/due-diligence` (tabular review / deep analysis),
  `claims` (`claim-account`), `outlook/archive` (the add-in uses `email-import`),
  `billing/budget-alerts` (alerts run after every credit deduction).
- **Not needed for the pilot / half-built:** `legal/judgements-db/validate`,
  `legal/batch-edit`, `legal/knowledge-sources`, `legal/permissions` (ACL routes
  cover matter permissions), `legal/playbooks/pending`, `legal/claim-evidence`,
  `email/dev-catch`, `billing/engine-token-report`, `billing/seats`,
  `billing/proration` (Stripe customer portal), `connectors/coverage`, `inbox/scan`,
  `autopilot/policies`, `fax`, `credit-checks`, `datev/import`, `online-booking`,
  `booking`, `activities`, `feedback`, `whatsapp/document-to-space`, `human-review`.
- Libraries used only by those routes: `datev-import`, `legal/batch-edit`,
  `legal/knowledge-sources`, `legal/pipeline-permissions`.

## Kept deliberately although currently without a UI caller

Law-firm capabilities to be wired into the product: `audit/verify` (audit chain
verification), `api-keys/rotate`, `approvals/execute`, `work-products/memo/generate`,
`bea/import`, `legal/writing-styles`, `time/auto-extract`, `time/billing-summary`,
`e-invoice/validate`, `shared-spaces/[id]*`. Also `ocr-status` (live smoke test)
and `cron/autonomous-engine` (processor of the autonomous task queue).

## Recovery

```bash
git checkout archive/orphan-api-routes-2026-09-13 -- src/app/api/<route>
```
