/**
 * Links into the dashboard that are built outside the dashboard itself
 * (mobile app, Copilot tool results). Each target is an existing route:
 * a matter lives under `/dashboard/cases/…`, any other page (note, document)
 * opens in the page viewer `/dashboard/brain/[slug]`, invoices under
 * `/dashboard/invoicing`.
 */

import { encodeSlugPath } from "@/lib/utils";

export const INVOICING_HREF = "/dashboard/invoicing";

/** Matter detail page for a case slug such as `legal/cases/mueller`. */
export function caseHref(slug: string): string {
  return `/dashboard/cases/${encodeSlugPath(slug)}`;
}

/** Page viewer for any page slug (notes, documents, drafts). */
export function brainPageHref(slug: string): string {
  return `/dashboard/brain/${encodeURIComponent(slug)}`;
}
