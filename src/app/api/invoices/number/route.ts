import { listEnginePages } from "@/lib/engine-pages";
import { createHandler, apiSuccess } from "@/lib/api-handler";
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
      // Every invoice, in batches: a partial list could hand out a number twice.
      const pages = await listEnginePages(ctx.headers, "invoice", 50_000);
      existing = pages.map((p) => String(p.frontmatter?.invoice_number ?? ""));
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
