# Taxumio archive manifest

Status: archived from active product development on 2026-09-12.

Canonical source snapshot: annotated Git tag
`archive/taxumio-pre-focus-2026-09-12` at commit `a851d00f8b`.

## Product boundary

Taxumio is the tax-advisory vertical. Subsumio remains the active product and
is focused on law firms. Archiving Taxumio must not remove capabilities a law
firm needs for its own work.

### Archive

- Dashboard routes: `tax-returns`, `tax-assessments`, `tax-audit`,
  `tax-clients`, `tax-deadlines`, `tax-stbvv`, `elster`
- Public routes: `tax`, `taxumio`, and localized Taxumio landing pages
- All route handlers below `src/app/api/tax/`
- `src/components/tax/`, the Taxumio dashboard board, logo, and marketing page
- Tax-advisory libraries: `tax-deadlines`, `tax-prompts`, `tax-types`, `elster`,
  and `stbvv`
- Taxumio navigation, branding, onboarding, permissions, audit labels,
  workflow seeds, API client, tests, and translation keys

### Retain in Subsumio

- Tax law as a legal practice area and tax-law corpus/research coverage
- VAT fields and calculations on law-firm invoices
- E-invoice/XRechnung support
- Actual DATEV file import/export used by a law firm's bookkeeping
- GoBD integrity, accounts receivable, payments, and law-firm controlling
- Tax-impact analysis when it is part of damages or settlement analysis
- RVG/RATG/AHK and other lawyer fee logic

StBVV, ELSTER submission, tax-return administration, tax-assessment
administration, and tax-audit administration are not part of the law-firm OS.

## Data safety and inventory

The local auth store contained 8,059 users: 482 `legal`, 7,577 without an
industry value, and **0 `tax` users**. Read-only queries against the configured
Engine returned **0 active and 0 deleted records** for `tax_return`,
`tax_assessment`, `tax_audit`, `tax_client`, `elster-submission`, and `tax/*`
slugs. No stored record or user was deleted; no data migration was required.

## Block plan

1. **Completed:** Freeze new Taxumio tenants and make Legal the only industry.
2. **Completed:** Inventory existing users and Engine records; none required export.
3. **Completed:** Remove Taxumio routes, UI, libraries, schema pack, specialist
   agents, and cross-cutting branches from the active build.
4. Consolidate the remaining Subsumio surface into the canonical law-firm OS
   workspaces: Today, Matters, Intake, Documents, AI Copilot, Research,
   Communications, Calendar/Tasks, Billing, and Administration.
