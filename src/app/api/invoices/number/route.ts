import { createHandler, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { allocateInvoiceNumber, highestInvoiceNumber } from "@/lib/invoice-numbering";

export const dynamic = "force-dynamic";

/**
 * Reserves the next invoice number of the firm for the current year. Called
 * right before an invoice is stored; a reserved number that is not used leaves
 * a gap, which is permitted — a duplicate is not.
 */
export const POST = createHandler(
  {
    action: "invoice.write",
    rateTier: "standard",
  },
  async (ctx) => {
    const year = new Date().getFullYear();
    let existing: string[] = [];
    try {
      const res = await fetch(`${ENGINE_URL}/api/pages?type=invoice&limit=1000`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const pages = (await res.json()) as Array<{ frontmatter?: { invoice_number?: string } }>;
        existing = (Array.isArray(pages) ? pages : []).map(
          (p) => p.frontmatter?.invoice_number ?? ""
        );
      }
    } catch {
      // The counter alone still guarantees uniqueness from here on.
    }
    const number = await allocateInvoiceNumber(
      ctx.brainId,
      year,
      highestInvoiceNumber(existing, year)
    );
    return apiSuccess({ number });
  }
);
