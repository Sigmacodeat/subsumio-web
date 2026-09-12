# Pilot-focus archive manifest

Status: removed from the active Subsumio build on 2026-09-12 to ship a
law-firm-only product to the first pilot firm.

Canonical source snapshot: annotated Git tag
`archive/b2c-whitelabel-pre-focus-2026-09-12`.

## Removed

- **Consumer (B2C) funnels:** `/privat` (DE/AT/CH/EN), `/nischen` and
  `/nischen/[slug]` (free "Für Betroffene" quick-check landing pages),
  `api/niche/quick-check`, the private pricing tier (`privateOffers`),
  `PrivatePricingGrid`, `AudienceSwitcher`, `QuickAnalysisWidget`,
  `NicheLandingPage`, `content/niche-pages.ts`.
- **Non-DACH locales:** `it`, `es`, `pl`, `fr`, `nl` — route folders, the
  `EU_PHASE1_LANGS` constant, and every locale block in `src/content/*`.
  Active locales: `de` (default), `at`, `ch`, `en`.
- **White-label PWA:** `dashboard/white-label`, `api/white-label`,
  `lib/white-label.ts`.
- **Peer benchmark:** `dashboard/peer-benchmark`, `api/peer-benchmark`,
  `lib/peer-benchmark.ts`.
- **Marketing agent:** `api/marketing-agent`, `lib/marketing/leads.ts`.
- Leftover tax-advisory references: `plugins/subsumio-tax`, the
  "Für Steuerberater" `/tax` navigation links, Taxumio/ELSTER env docs.
- Dead `/admin/*` → `/dashboard/admin/*` redirects (target pages were removed
  with the platform-ops surfaces).

## Retained (law-firm scope)

- `/kanzlei`, `/solutions/*`, `/cities/*` (law-firm marketing).
- Claims management (`dashboard/claim-account`, `api/claims`) — Mahnverfahren
  and enforcement for the firm's own receivables.
- Document translation into IT/ES/FR/NL/PL (`dashboard/translate`) — a
  matter-work feature, not a site locale.
- Engine-side (`server/`) operations are untouched; only the web surfaces
  were removed.

## Recovery

`git checkout archive/b2c-whitelabel-pre-focus-2026-09-12 -- <path>` restores
any removed file.
