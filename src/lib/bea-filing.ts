/**
 * beA filing packages: where they live and how a server-side release is
 * recognised. Pure — shared by the filing route, the send routes, the page
 * write guard and the dashboard.
 */

export const BEA_DRAFT_PREFIX = "legal/bea-drafts/";
export const BEA_FILING_PREFIX = "legal/bea-filings/";

/** Written only by POST /api/bea/filing when a lawyer/admin releases a package. */
export const FILING_APPROVAL_FIELD = "filing_approval";

export function filingSlugForDraft(draftSlug: string): string {
  return draftSlug.replace(BEA_DRAFT_PREFIX, BEA_FILING_PREFIX);
}

const APPROVER_ROLES = new Set(["admin", "lawyer"]);

/**
 * True when the stored package was released through the filing route by a
 * lawyer/admin — the stamp names the approver and the package it released.
 * A package status set any other way is not a release.
 */
export function hasServerFilingApproval(
  frontmatter: Record<string, unknown> | null | undefined,
  pkg: { id?: string; status?: string } | null | undefined
): boolean {
  const stamp = frontmatter?.[FILING_APPROVAL_FIELD];
  if (!stamp || typeof stamp !== "object" || !pkg) return false;
  const s = stamp as Record<string, unknown>;
  return (
    typeof s.by_id === "string" &&
    s.by_id.trim().length > 0 &&
    APPROVER_ROLES.has(String(s.role ?? "")) &&
    typeof pkg.id === "string" &&
    s.package_id === pkg.id
  );
}
