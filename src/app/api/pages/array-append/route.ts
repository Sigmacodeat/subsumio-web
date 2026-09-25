import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";
import { GUARD_READ_FAILED, readCurrentPage, rejectionResponse } from "@/lib/page-write-guards";
import { checkBillingArrayAppend, checkInvoiceArrayWrite } from "@/lib/billing-write-guards";

import { logger } from "@/lib/logger";
const log = logger("api/pages/array-append");

/**
 * Proxy onto the engine's atomic page_array_append op — a single UPDATE
 * (jsonb_set + `||`), so concurrent appends to e.g. a matter's time_entries
 * serialize on the row lock instead of read-modify-write clobbering.
 *
 * An issued invoice only accepts payment bookkeeping; new time entries /
 * expenses may not arrive already attached to an invoice.
 */
const appendSchema = z.object({
  slug: z.string().min(1).max(300),
  field: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "field must be a top-level frontmatter key"),
  items: z.array(z.unknown()).max(1000),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: appendSchema,
    audit: (_ctx, body) => ({
      action: "case.update" as const,
      entityType: "page_array",
      entityId: body.slug,
      details: { field: body.field, appended: body.items.length },
    }),
  },
  async (ctx, body) => {
    const billingRejection = checkBillingArrayAppend(body.field, body.items);
    if (billingRejection) return rejectionResponse(billingRejection);

    // Fail closed: an unreadable page is not written.
    const currentRead = await readCurrentPage(ENGINE_URL, ctx.headers, body.slug);
    if (currentRead.kind === "error") return rejectionResponse(GUARD_READ_FAILED);
    const invoiceRejection = checkInvoiceArrayWrite(
      currentRead.kind === "found" ? currentRead.page : null,
      body.field
    );
    if (invoiceRejection) return rejectionResponse(invoiceRejection);

    try {
      const res = await fetch(`${ENGINE_URL}/api/pages/array-append`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return Response.json(data ?? { error: "append_failed" }, { status: res.status });
      return Response.json(data);
    } catch (err) {
      log.error("[pages/array-append] failed:", err instanceof Error ? err.message : String(err));
      return apiError("append_failed", "Eintrag konnte nicht gespeichert werden", 502);
    }
  }
);
