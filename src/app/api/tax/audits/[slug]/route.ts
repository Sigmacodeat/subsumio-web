import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

export const dynamic = "force-dynamic";

const VALID_AUDIT_TYPES = [
  "Betriebspruefung",
  "Aussenpruefung",
  "Lohnpruefung",
  "UStpruefung",
] as const;

const VALID_PHASES = [
  "vorbereitung",
  "pruefung",
  "abschluss",
  "rechtsbehelf",
  "abgeschlossen",
] as const;

const findingSchema = z.object({
  id: z.string(),
  issue: z.string(),
  amount: z.number().nullable().optional(),
  accepted: z.boolean().optional(),
  resolvedAt: z.string().nullable().optional(),
});

const updateSchema = z.object({
  clientName: z.string().min(1).optional(),
  type: z.enum(VALID_AUDIT_TYPES).optional(),
  year: z
    .number()
    .int()
    .min(2000)
    .max(new Date().getFullYear() + 1)
    .optional(),
  phase: z.enum(VALID_PHASES).optional(),
  auditor: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  findings: z.array(findingSchema).optional(),
  totalAdditionalTax: z.number().nullable().optional(),
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
    if (!page) return apiError("not_found", "Tax audit not found", 404);
    return Response.json(page);
  }
);

export const PATCH = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: updateSchema,
    audit: (ctx) => ({
      action: "tax.audit_update" as const,
      entityType: "tax_audit",
      details: { by: ctx.user.email },
    }),
  },
  async (ctx, body, _query, req) => {
    const { slug } = await (req as unknown as { params: Promise<{ slug: string }> }).params;
    const decoded = decodeURIComponent(slug);

    const existing = await getPage(decoded, ctx.headers);
    if (!existing) return apiError("not_found", "Tax audit not found", 404);

    const fm = (existing.frontmatter ?? {}) as Record<string, unknown>;
    const now = new Date().toISOString();
    const updatedFm: Record<string, unknown> = {
      ...fm,
      ...(body.clientName !== undefined ? { client_name: body.clientName } : {}),
      ...(body.type !== undefined ? { audit_type: body.type } : {}),
      ...(body.year !== undefined ? { year: body.year } : {}),
      ...(body.phase !== undefined ? { phase: body.phase } : {}),
      ...(body.auditor !== undefined ? { auditor: body.auditor } : {}),
      ...(body.startDate !== undefined ? { start_date: body.startDate } : {}),
      ...(body.endDate !== undefined ? { end_date: body.endDate } : {}),
      ...(body.findings !== undefined ? { findings: body.findings } : {}),
      ...(body.totalAdditionalTax !== undefined
        ? { total_additional_tax: body.totalAdditionalTax }
        : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      updated_at: now,
    };

    const title = `${updatedFm.audit_type ?? fm.audit_type} ${updatedFm.year ?? fm.year} — ${updatedFm.client_name ?? fm.client_name}`;

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
      action: "tax.audit_delete" as const,
      entityType: "tax_audit",
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
