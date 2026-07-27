import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import {
  createDatevExport,
  invoicesToDatevRecords,
  isDatevConfigured,
  type DatevDirectExport,
} from "@/lib/datev-direct";

export const dynamic = "force-dynamic";

const exportSchema = z.object({
  type: z.enum(["invoices", "bookings", "master_data"]),
  period_from: z.string().min(1),
  period_to: z.string().min(1),
  invoices: z
    .array(
      z.object({
        invoice_number: z.string(),
        invoice_date: z.string(),
        client_name: z.string(),
        net_amount: z.number(),
        tax_rate: z.number(),
        client_number: z.string().optional(),
      })
    )
    .optional(),
});

export const POST = createHandler(
  {
    action: "invoice.write",
    rateTier: "standard",
    body: exportSchema,
    audit: (ctx, body) => ({
      action: "invoice.create" as const,
      entityType: "datev_export",
      entityId: body.type,
      details: { period: `${body.period_from}..${body.period_to}` },
    }),
  },
  async (ctx, body) => {
    const records = body.invoices ? invoicesToDatevRecords(body.invoices) : [];
    const totalAmount = records.reduce((sum, r) => sum + r.betrag, 0);
    const exportRecord = createDatevExport({
      type: body.type,
      period: { from: body.period_from, to: body.period_to },
      record_count: records.length,
      total_amount: totalAmount,
    });
    exportRecord.status = "generated";
    exportRecord.sent_at = new Date().toISOString();
    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `legal/datev-exports/${exportRecord.id}`,
        title: `DATEV Export: ${body.type} ${body.period_from}–${body.period_to}`,
        type: "datev_export",
        frontmatter: { ...exportRecord, records },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return apiSuccess({ export: exportRecord, records, configured: isDatevConfigured() });
  }
);

export const GET = createHandler(
  {
    action: "invoice.read",
    rateTier: "standard",
  },
  async (ctx) => {
    const params = new URLSearchParams({ type: "datev_export", limit: "100" });
    const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return apiError("engine_error", "Engine request failed", 502);
    const data = await res.json();
    const pages = (Array.isArray(data) ? data : (data.pages ?? [])) as Array<
      { frontmatter?: DatevDirectExport } | DatevDirectExport
    >;
    const items = pages.map((page) =>
      "frontmatter" in page && page.frontmatter ? page.frontmatter : (page as DatevDirectExport)
    );
    return apiSuccess({ items, configured: isDatevConfigured() });
  }
);
