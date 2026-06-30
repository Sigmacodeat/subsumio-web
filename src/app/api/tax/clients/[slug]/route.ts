import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

export const dynamic = "force-dynamic";

const VALID_CLIENT_TYPES = ["person", "company", "partnership", "estate"] as const;

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(VALID_CLIENT_TYPES).optional(),
  taxId: z.string().min(1).optional(),
  vatId: z.string().nullable().optional(),
  fiscalYearStart: z.string().optional(),
  fiscalYearEnd: z.string().optional(),
  industryCode: z.string().nullable().optional(),
  contactEmail: z.string().email().nullable().or(z.literal("")).optional(),
  contactPhone: z.string().nullable().optional(),
  street: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  country: z.string().optional(),
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
    if (!page) return apiError("not_found", "Tax client not found", 404);
    return Response.json(page);
  }
);

export const PATCH = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: updateSchema,
    audit: (ctx) => ({
      action: "tax.client_update" as const,
      entityType: "tax_client",
      details: { by: ctx.user.email },
    }),
  },
  async (ctx, body, _query, req) => {
    const { slug } = await (req as unknown as { params: Promise<{ slug: string }> }).params;
    const decoded = decodeURIComponent(slug);

    const existing = await getPage(decoded, ctx.headers);
    if (!existing) return apiError("not_found", "Tax client not found", 404);

    const fm = (existing.frontmatter ?? {}) as Record<string, unknown>;
    const now = new Date().toISOString();
    const updatedFm: Record<string, unknown> = {
      ...fm,
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.type !== undefined ? { client_type: body.type } : {}),
      ...(body.taxId !== undefined ? { tax_id: body.taxId } : {}),
      ...(body.vatId !== undefined ? { vat_id: body.vatId } : {}),
      ...(body.fiscalYearStart !== undefined ? { fiscal_year_start: body.fiscalYearStart } : {}),
      ...(body.fiscalYearEnd !== undefined ? { fiscal_year_end: body.fiscalYearEnd } : {}),
      ...(body.industryCode !== undefined ? { industry_code: body.industryCode } : {}),
      ...(body.contactEmail !== undefined ? { contact_email: body.contactEmail || null } : {}),
      ...(body.contactPhone !== undefined ? { contact_phone: body.contactPhone } : {}),
      ...(body.street !== undefined ||
      body.postalCode !== undefined ||
      body.city !== undefined ||
      body.country !== undefined
        ? {
            address: {
              street: body.street ?? (fm.address as Record<string, unknown>)?.street ?? "",
              postal_code:
                body.postalCode ?? (fm.address as Record<string, unknown>)?.postal_code ?? "",
              city: body.city ?? (fm.address as Record<string, unknown>)?.city ?? "",
              country: body.country ?? (fm.address as Record<string, unknown>)?.country ?? "DE",
            },
          }
        : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      updated_at: now,
    };

    const title = updatedFm.name ?? fm.name ?? existing.title;

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
      action: "tax.client_delete" as const,
      entityType: "tax_client",
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
