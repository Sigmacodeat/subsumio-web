const MATTER_TABS = new Set([
  "overview",
  "documents",
  "deadlines",
  "strategy",
  "activity",
  "evidence",
  "billing",
  "contacts",
]);

export function caseSlugFromDashboardPath(pathname: string): string | undefined {
  const prefix = "/dashboard/cases/";
  if (!pathname.startsWith(prefix)) return undefined;
  const segments = pathname.slice(prefix.length).split("/").filter(Boolean);
  if (segments.length > 1 && MATTER_TABS.has(segments[segments.length - 1]!)) segments.pop();
  if (segments.length === 0) return undefined;
  return segments.map((segment) => decodeURIComponent(segment)).join("/");
}
