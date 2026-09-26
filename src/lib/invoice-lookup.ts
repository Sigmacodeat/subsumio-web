import { listEnginePages, type ListedPage } from "@/lib/engine-pages";

/**
 * Targeted invoice lookups for the money guards (unbill lock, double storno,
 * number collision). The engine selects the rows by frontmatter in SQL, so
 * the answer covers every invoice of the firm — not the newest N of a list.
 * Strict and complete: a failed or truncated read throws, and the caller
 * refuses (fail closed) instead of deciding on a partial set.
 */

/** Safety stop per lookup — one number / one parent never has this many rows. */
const LOOKUP_MAX = 1_000;

/** Every invoice page (including deleted ones) carrying this invoice number. */
export function findInvoicesByNumber(
  headers: Record<string, string>,
  invoiceNumber: string
): Promise<ListedPage[]> {
  return listEnginePages(headers, "invoice", LOOKUP_MAX, {
    includeTombstoned: true,
    strict: true,
    failOnTruncate: true,
    frontmatter: { invoice_number: invoiceNumber },
  }).then((pages) =>
    pages.filter((p) => String(p.frontmatter?.invoice_number ?? "") === invoiceNumber)
  );
}

/** Every invoice page (including deleted ones) pointing at this parent invoice. */
export function findInvoicesByParent(
  headers: Record<string, string>,
  parentSlug: string
): Promise<ListedPage[]> {
  return listEnginePages(headers, "invoice", LOOKUP_MAX, {
    includeTombstoned: true,
    strict: true,
    failOnTruncate: true,
    frontmatter: { parent_invoice_id: parentSlug },
  }).then((pages) => pages.filter((p) => p.frontmatter?.parent_invoice_id === parentSlug));
}
