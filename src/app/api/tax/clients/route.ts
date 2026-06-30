import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

export const dynamic = "force-dynamic";

const VALID_CLIENT_TYPES = ["person", "company", "partnership", "estate"] as const;

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(VALID_CLIENT_TYPES).default("person"),
  taxId: z.string().min(1),
  vatId: z.string().optional(),
  fiscalYearStart: z.string().optional(),
  fiscalYearEnd: z.string().optional(),
  industryCode: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  street: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  country: z.string().default("DE"),
  notes: z.string().optional(),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: z.object({
      type: z.enum(VALID_CLIENT_TYPES).optional(),
      search: z.string().optional(),
      limit: z.coerce.number().min(1).max(200).default(50),
    }),
  },
  async (ctx, _body, query, _req) => {
    const params = new URLSearchParams({
      type: "tax_client",
      limit: String(query?.limit ?? 50),
    });
    if (query?.type) params.set("client_type", query.type);

    const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return apiError("engine_error", "Engine request failed", 502);
    const data = await res.json();
    let pages = Array.isArray(data) ? data : (data.pages ?? []);

    if (query?.search) {
      const q = query.search.toLowerCase();
      pages = pages.filter((p: Record<string, unknown>) => {
        const title = String(p.title ?? "").toLowerCase();
        const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
        const name = String(fm.name ?? "").toLowerCase();
        const taxId = String(fm.tax_id ?? "").toLowerCase();
        return title.includes(q) || name.includes(q) || taxId.includes(q);
      });
    }

    return Response.json(pages);
  }
);

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: createSchema,
    audit: (ctx) => ({
      action: "tax.client_create" as const,
      entityType: "tax_client",
      details: { by: ctx.user.email },
    }),
  },
  async (ctx, body, _query, _req) => {
    const slug = `tax/clients/${body.name
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]+/g, "-")
      .slice(0, 50)}-${Date.now().toString(36)}`;
    const now = new Date().toISOString();

    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        title: body.name,
        type: "tax_client",
        content: body.notes ?? `Steuermandant: ${body.name}`,
        frontmatter: {
          type: "tax_client",
          name: body.name,
          client_type: body.type,
          tax_id: body.taxId,
          vat_id: body.vatId ?? null,
          fiscal_year_start: body.fiscalYearStart ?? "01-01",
          fiscal_year_end: body.fiscalYearEnd ?? "12-31",
          industry_code: body.industryCode ?? null,
          contact_email: body.contactEmail || null,
          contact_phone: body.contactPhone ?? null,
          address: body.street
            ? {
                street: body.street,
                postal_code: body.postalCode ?? "",
                city: body.city ?? "",
                country: body.country,
              }
            : null,
          notes: body.notes ?? null,
          created_at: now,
          updated_at: now,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return apiError("engine_error", `Failed to create tax client: ${text.slice(0, 200)}`, 502);
    }
    const result = await res.json();
    return Response.json({ slug, ...result }, { status: 201 });
  }
);
