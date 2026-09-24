/**
 * Market features retired for the Austria-first pilot. The middleware answers
 * these routes with a 308 to the dashboard (pages) or 410 (APIs); navigation
 * and tool cards read the same lists so no menu entry leads to a dead end.
 * The pages themselves stay in the tree — reactivating a feature means
 * removing its prefix here.
 */
export const RETIRED_PILOT_DASHBOARD_PREFIXES = [
  "/dashboard/bea",
  "/dashboard/datev-export",
  "/dashboard/datev-direct",
  "/dashboard/fao-tracking",
  "/dashboard/cost-calculator",
] as const;

export const RETIRED_PILOT_API_PREFIXES = [
  "/api/bea",
  "/api/datev",
  "/api/datev-direct",
  "/api/legal/rvg",
  "/api/pkh-beratungshilfe",
  "/api/fachrechner",
  "/api/fao-tracking",
  "/api/court-directory",
  "/api/court-analytics",
] as const;

export function matchesRoutePrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** True when the middleware redirects this dashboard path away (retired feature). */
export function isRetiredDashboardPath(pathname: string): boolean {
  return RETIRED_PILOT_DASHBOARD_PREFIXES.some((prefix) => matchesRoutePrefix(pathname, prefix));
}

/** True when the middleware answers this API path with 410 (retired feature). */
export function isRetiredApiPath(pathname: string): boolean {
  return RETIRED_PILOT_API_PREFIXES.some((prefix) => matchesRoutePrefix(pathname, prefix));
}
