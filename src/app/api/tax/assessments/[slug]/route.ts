import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

export const dynamic = "force-dynamic";

const VALID_ASSESSMENT_TYPES = [
  "Einschaetzung",
  "Festsetzung",
  "Nachforderung",
  "Erstattung",
  "Vorauszahlung",
  "Stundung",
  "Haftruecklass",
] as const;

const VALID_TAX_TYPES = [
  "ESt",
  "USt",
  "GewSt",
  "KSt",
  "SolZ",
  "VSt",
  "GrESt",
  "ErbSt",
  "LSt",
  "UStVA",
  "LStA",
  "ZM",
  "other",
] as const;

const updateSchema = z.object({
  clientName: z.string().min(1).optional(),
  type: z.enum(VALID_ASSESSMENT_TYPES).optional(),
  taxType: z.enum(VALID_TAX_TYPES).optional(),
  year: z
    .number()
    .int()
    .min(2000)
    .max(new Date().getFullYear() + 1)
    .optional(),
  noticeNumber: z.string().nullable().optional(),
  noticeDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  amount: z.number().min(0).optional(),
  paidDate: z.string().nullable().optional(),
  contested: z.boolean().optional(),
  contestDeadline: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

async function getPage(slug: string, headers: Record<string, string>) {
  const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  return res.json();
}

export const GET = createHandler(
  { action: "brain.read", rateTier: "standard" },
  async (ctx, _body, _query, req) => {
    const { slug } = await (req as unknown as { params: Promise<{ slug: string }> }).params;
    const decoded = decodeURIComponent(slug);
    const page = await getPage(decoded, ctx.headers);
    if (!page) return apiError("not_found", "Tax assessment not found", 404);
    return Response.json(page);
  }
);

export const PATCH = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: updateSchema,
    audit: (ctx) => ({
      action: "tax.assessment_update" as const,
      entityType: "tax_assessment",
      details: { by: ctx.user.email },
    }),
  },
  async (ctx, body, _query, req) => {
    const { slug } = await (req as unknown as { params: Promise<{ slug: string }> }).params;
    const decoded = decodeURIComponent(slug);

    const existing = await getPage(decoded, ctx.headers);
    if (!existing) return apiError("not_found", "Tax assessment not found", 404);

    const fm = (existing.frontmatter ?? {}) as Record<string, unknown>;
    const now = new Date().toISOString();
    const updatedFm: Record<string, unknown> = {
      ...fm,
      ...(body.clientName !== undefined ? { client_name: body.clientName } : {}),
      ...(body.type !== undefined ? { assessment_type: body.type } : {}),
      ...(body.taxType !== undefined ? { tax_type: body.taxType } : {}),
      ...(body.year !== undefined ? { year: body.year } : {}),
      ...(body.noticeNumber !== undefined ? { notice_number: body.noticeNumber } : {}),
      ...(body.noticeDate !== undefined ? { notice_date: body.noticeDate } : {}),
      ...(body.dueDate !== undefined ? { due_date: body.dueDate } : {}),
      ...(body.amount !== undefined ? { amount: body.amount } : {}),
      ...(body.paidDate !== undefined ? { paid_date: body.paidDate } : {}),
      ...(body.contested !== undefined ? { contested: body.contested } : {}),
      ...(body.contestDeadline !== undefined ? { contest_deadline: body.contestDeadline } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      updated_at: now,
    };

    const title = `${updatedFm.assessment_type ?? fm.assessment_type} ${updatedFm.year ?? fm.year} — ${updatedFm.client_name ?? fm.client_name}`;

    const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(decoded)}`, {
      method: "PATCH",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        frontmatter: updatedFm,
        content: existing.content ?? "",
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return apiError("engine_error", `Update failed: ${text.slice(0, 200)}`, 502);
    }
    const result = await res.json();
    return Response.json(result);
  }
);

export const DELETE = createHandler(
  {
    action: "brain.delete",
    rateTier: "standard",
    audit: (ctx) => ({
      action: "tax.assessment_delete" as const,
      entityType: "tax_assessment",
      details: { by: ctx.user.email },
    }),
  },
  async (ctx, _body, _query, req) => {
    const { slug } = await (req as unknown as { params: Promise<{ slug: string }> }).params;
    const decoded = decodeURIComponent(slug);

    const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(decoded)}`, {
      method: "DELETE",
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok && res.status !== 404) {
      return apiError("engine_error", "Delete failed", 502);
    }
    return Response.json({ success: true });
  }
);
