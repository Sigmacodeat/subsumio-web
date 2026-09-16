# Austria-only market archive manifest

Status: removed from the active Subsumio build on 2026-09-13 for the Austrian
pilot launch.

Canonical source snapshot: annotated Git tag
`archive/dach-locales-pre-focus-2026-09-13`.

## Active public market

- Austria (`de-AT`) is the only active marketing locale.
- Canonical marketing and auth URLs live below `/at`.
- The dashboard, API, mobile application and tokenized client portal keep their
  existing product URLs. The dashboard UI remains bilingual (de/en) — that is
  product UI language, not a public locale.
- German-language blog and benchmark resources remain available at their
  established root URLs.
- Vienna is the only active city landing page.

## Archived route files

The DE, CH and EN route trees, their layouts, the duplicate unprefixed public
pages and the redundant `/at/subsumio` alias page were removed from the active
App Router build. This removes 101 `page.tsx` files:

- 24 DE pages;
- 26 CH pages;
- 25 EN pages;
- 25 unprefixed duplicates of Austrian pages;
- 1 Austrian alias page.

The total active page count falls from 263 to 162. The 125 Kanzlei-dashboard
pages remain unchanged. The locale cut itself did not remove API handlers; a
parallel cockpit/demo-data package raised the current API count from 412 to 413.

## Archived locale content

The shared content modules (`src/content/site.ts`, `docs.ts`, `solutions.ts`,
`features.ts`, `security.ts`, `partners.ts`, `download.ts`, `verticals.ts`,
`vertical-pricing.ts`, `products.ts`, `audiences.ts`, `city-pages.ts`) now carry
only the materialized Austrian content. The DE/CH/EN objects, the
`deepMerge`/`applyReplacements` derivation helpers and `AT_REPLACEMENTS` /
`CH_REPLACEMENTS` were removed from the repo — the archive tag is the only
restoration source. Marketing components no longer carry inline per-locale
copy blocks; the language switcher UI was removed from `chrome.tsx`.

## Follow-up cleanup (copy + legal docs)

A second pass removed residual DE/CH/EN content inside the retained AT copy:

- `src/content/blog.ts` — blog posts rewritten to Austrian law (§ 9a RAO
  instead of § 203 StGB; slug renamed to `ki-kanzleisoftware-berufsgeheimnis-rao`).
- `src/components/legal/legal-content.tsx` — privacy/terms/DPA now cite only
  Austrian law (§ 9 DSG, § 9a RAO, § 132 BAO, UGB; governing law changed from
  German to Austrian law, venue Vienna).
- `superbrain-content.ts`, `trust-band.tsx`, `superbrain-advantage.tsx`,
  `benchmark-methodology-page.tsx` — DACH/BGB/beA/DATEV/GoBD copy replaced
  with ABGB/ZPO/EO/UGB, webERV, ADATEV, RAO, BAO.
- `src/lib/seo-keywords.ts`, `feed.xml` (`de-AT`), orphaned root-level
  `opengraph-image.tsx` routes for deleted pages removed; OG copy is now
  Austria-only.
- Marketing components read UI strings via `createT("at")` instead of the
  dashboard `useLang()` so a stored EN dashboard preference cannot leak onto
  public pages.
- `MARKETING-SITE-BLUEPRINT.md` moved to `docs/archive/`;
  `.windsurf/workflows/full-public-site-audit.md` updated to the 21-URL
  `/at` checklist.

## Compatibility and SEO

- Old `/de/*`, `/ch/*`, `/en/*` and matching unprefixed public URLs return a
  permanent `308` redirect to the corresponding `/at/*` URL.
- Redirects preserve query parameters, including auth `next` parameters and
  password-reset tokens.
- `app.subsum.io/` still opens `/dashboard`; the public-domain root opens
  `/at`.
- Sitemap, canonical metadata and hreflang output advertise only `de-AT`.
- Browser-language auto-redirects and the language switcher were removed.

## Recovery

Restore an archived route or previous locale configuration with:

```bash
git checkout archive/dach-locales-pre-focus-2026-09-13 -- <path>
```

Reactivation also requires restoring the locale to `SUPPORTED_LANGS`, sitemap
alternates, canonical metadata and routing tests. Restoring page files alone is
not sufficient.
