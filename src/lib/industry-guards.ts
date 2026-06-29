// Industry route guards — defines which dashboard pages are legal-only,
// tax-only, or shared. Used by the client-side guard in the dashboard layout
// and by API route handlers to restrict access by industry.

/** Pages that only make sense for legal users. */
export const LEGAL_ONLY_PAGES: readonly string[] = [
  "/dashboard/cases",
  "/dashboard/case-scanner",
  "/dashboard/kollisionspruefung",
  "/dashboard/process-strategy",
  "/dashboard/drafting",
  "/dashboard/contracts",
  "/dashboard/clause-library",
  "/dashboard/playbooks",
  "/dashboard/litigation",
  "/dashboard/litigation-analytics",
  "/dashboard/review-sets",
  "/dashboard/trust-accounting",
  "/dashboard/tabular-review",
  "/dashboard/obligation-tracking",
  "/dashboard/research",
  "/dashboard/rechtsprechung",
  "/dashboard/norms",
  "/dashboard/precedent-search",
  "/dashboard/judgements-sync",
  "/dashboard/bea",
];

/** Pages that only make sense for tax users. */
export const TAX_ONLY_PAGES: readonly string[] = [
  "/dashboard/tax-returns",
  "/dashboard/tax-assessments",
  "/dashboard/tax-audit",
  "/dashboard/tax-deadlines",
];

/** API route prefixes that are legal-only. */
export const LEGAL_ONLY_API_PREFIXES: readonly string[] = ["/api/legal/", "/api/bea/"];

/** API route prefixes that are tax-only. */
export const TAX_ONLY_API_PREFIXES: readonly string[] = ["/api/tax/"];

/**
 * Returns true if a dashboard path is allowed for the given industry.
 * Shared pages (not in either list) are always allowed.
 */
export function isPathAllowedForIndustry(
  path: string,
  industry: string | null | undefined
): boolean {
  const ind = industry ?? "legal";

  // Check legal-only pages
  if (LEGAL_ONLY_PAGES.some((p) => path === p || path.startsWith(`${p}/`))) {
    return ind === "legal";
  }

  // Check tax-only pages
  if (TAX_ONLY_PAGES.some((p) => path === p || path.startsWith(`${p}/`))) {
    return ind === "tax";
  }

  // Shared pages are always allowed
  return true;
}

/**
 * Returns true if an API path is allowed for the given industry.
 */
export function isApiPathAllowedForIndustry(
  path: string,
  industry: string | null | undefined
): boolean {
  const ind = industry ?? "legal";

  if (LEGAL_ONLY_API_PREFIXES.some((p) => path.startsWith(p))) {
    return ind === "legal";
  }

  if (TAX_ONLY_API_PREFIXES.some((p) => path.startsWith(p))) {
    return ind === "tax";
  }

  return true;
}

/**
 * If the path is not allowed for the industry, returns the redirect target.
 * Otherwise returns null.
 */
export function redirectForIndustry(
  path: string,
  industry: string | null | undefined
): string | null {
  if (!isPathAllowedForIndustry(path, industry)) {
    return "/dashboard";
  }
  return null;
}
