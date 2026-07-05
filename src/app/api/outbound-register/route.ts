import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import {
  createOutboundEntry,
  exportOutboundRegister,
  filterOutboundByDateRange,
  type OutboundEntry,
} from "@/lib/outbound-register";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  channel: z.enum(["email", "bea", "post", "fax", "whatsapp", "portal"]),
  recipient_name: z.string().min(1).max(300),
  recipient_address: z.string().min(1).max(500),
  case_slug: z.string().max(300).optional(),
  subject: z.string().min(1).max(500),
  pages: z.number().min(0).max(1000).optional(),
  sent_by: z.string().min(1).max(300),
  tracking_id: z.string().max(300).optional(),
  notes: z.string().max(2000).optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: createSchema,
    audit: (ctx, body) => ({
      action: "case.update" as const,
      entityType: "outbound_entry",
      entityId: body.recipient_name,
      details: { channel: body.channel, subject: body.subject, caseSlug: body.case_slug },
    }),
  },
  async (ctx, body) => {
    const entry = createOutboundEntry(body);
    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `legal/outbound-register/${entry.id}`,
        title: `Ausgang: ${body.subject} → ${body.recipient_name}`,
        type: "outbound_entry",
        frontmatter: entry,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return apiSuccess({ entry });
  }
);

const querySchema = z.object({
  case_slug: z.string().max(300).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  format: z.enum(["json", "csv"]).optional(),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    const params = new URLSearchParams({ type: "outbound_entry", limit: "500" });
    const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return apiError("engine_error", "Engine request failed", 502);
    const data = await res.json();
    let items: OutboundEntry[] = (
      Array.isArray(data) ? data : (data.pages ?? [])
    ) as OutboundEntry[];
    if (query?.case_slug) {
      items = items.filter((e) => e.case_slug === query.case_slug);
    }
    if (query?.from && query?.to) {
      items = filterOutboundByDateRange(items, query.from, query.to);
    }
    if (query?.format === "csv") {
      const csv = exportOutboundRegister(items);
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=postausgangsbuch.csv",
        },
      });
    }
    return apiSuccess({ items });
  }
);
