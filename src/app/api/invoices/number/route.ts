import { listEnginePages } from "@/lib/engine-pages";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import { reserveInvoiceNumber } from "@/lib/invoice-numbering";
import { firmYear } from "@/lib/datetime";

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
    // The firm's calendar year (Vienna) — never the server's UTC year.
    const year = firmYear();
    // Every invoice, in batches — but only to seed the year's counter the
    // first time; a partial seed list could hand out a number twice.
    const number = await reserveInvoiceNumber(ctx.brainId, year, async () => {
      const pages = await listEnginePages(ctx.headers, "invoice", 50_000);
      return pages.map((p) => String(p.frontmatter?.invoice_number ?? ""));
    });
    return apiSuccess({ number });
  }
);
