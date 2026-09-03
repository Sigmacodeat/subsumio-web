/**
 * Admin SaaS Invoices API — Invoice list + detail.
 *
 * GET /api/admin/saas-invoices           — alle Rechnungen (neueste zuerst)
 * GET /api/admin/saas-invoices?orgId=UUID — nur eine Org
 * GET /api/admin/saas-invoices?id=UUID    — einzelne Rechnung mit Line-Items
 *
 * Admin-only (RBAC via createHandler action: "admin.read").
 */

import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { listSaaSInvoices, getSaaSInvoice } from "@/lib/billing/saas-usage";

const invoiceQuerySchema = z.object({
  orgId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const GET = createHandler(
  {
    action: "admin.*",
    rateTier: "standard",
    cacheMaxAge: 60,
    query: invoiceQuerySchema,
  },
  async (_ctx, _body, query, _req) => {
    // Single invoice with line items
    if (query?.id) {
      const invoice = await getSaaSInvoice(query.id);
      if (!invoice) {
        return Response.json({ ok: false, error: "invoice_not_found" }, { status: 404 });
      }
      return Response.json({ ok: true, invoice });
    }

    // List invoices
    const limit = query?.limit ?? 50;
    const invoices = await listSaaSInvoices(query?.orgId, limit);

    return Response.json({
      ok: true,
      invoices,
      count: invoices.length,
    });
  }
);
