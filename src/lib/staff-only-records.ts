/**
 * Records a client account ("Mandant (lesend)", role client_viewer) must never
 * receive, even for its own matter: the anti-money-laundering file (KYC —
 * risk rating, PEP/sanctions screening, refusal reasons, internal notes;
 * disclosing it is prohibited "tipping-off") and the ID copies filed with it.
 * Staff roles see them as before.
 */
import { isStaffRole } from "@/lib/team-visibility";

export const KYC_SLUG_PREFIX = "legal/kyc/";

interface RecordLike {
  slug?: unknown;
  type?: unknown;
  frontmatter?: Record<string, unknown> | null;
}

export function isStaffOnlyRecord(page: RecordLike | null | undefined): boolean {
  if (!page) return false;
  const fm = page.frontmatter ?? {};
  if (typeof page.slug === "string" && page.slug.startsWith(KYC_SLUG_PREFIX)) return true;
  if (page.type === "kyc_verification" || fm.type === "kyc_verification") return true;
  if (fm.doc_type === "ausweiskopie") return true;
  const tags = Array.isArray(fm.tags) ? fm.tags : [];
  return tags.includes("kyc");
}

/** Drop staff-only records for a non-staff caller; staff get the list unchanged. */
export function withoutStaffOnlyRecords<T>(role: string | null | undefined, pages: T[]): T[] {
  if (isStaffRole(role)) return pages;
  return pages.filter((p) => !isStaffOnlyRecord(p as RecordLike));
}

/** May this caller receive the record? */
export function mayReceiveRecord(
  role: string | null | undefined,
  page: RecordLike | null | undefined
): boolean {
  return isStaffRole(role) || !isStaffOnlyRecord(page);
}
