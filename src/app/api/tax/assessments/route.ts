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

const createSchema = z.object({
  clientName: z.string().min(1),
  type: z.enum(VALID_ASSESSMENT_TYPES),
  taxType: z.enum(VALID_TAX_TYPES).default("ESt"),
  year: z
    .number()
    .int()
    .min(2000)
    .max(new Date().getFullYear() + 1),
  noticeNumber: z.string().optional(),
  noticeDate: z.string().min(1),
  dueDate: z.string().optional(),
  amount: z.number().min(0),
  notes: z.string().optional(),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: z.object({
      type: z.enum(VALID_ASSESSMENT_TYPES).optional(),
      year: z.coerce.number().optional(),
      limit: z.coerce.number().min(1).max(200).default(50),
    }),
  },
  async (ctx, _body, query, _req) => {
    const params = new URLSearchParams({
      type: "tax_assessment",
      limit: String(query?.limit ?? 50),
    });
    if (query?.type) params.set("assessment_type", query.type);
    if (query?.year) params.set("year", String(query.year));

    const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return apiError("engine_error", "Engine request failed", 502);
    const data = await res.json();
    return Response.json(Array.isArray(data) ? data : (data.pages ?? []));
  }
);

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: createSchema,
    audit: (ctx) => ({
      action: "tax.assessment_create" as const,
      entityType: "tax_assessment",
      details: { by: ctx.user.email },
    }),
  },
  async (ctx, body, _query, _req) => {
    const slug = `tax/assessments/${body.year}-${body.type}-${body.clientName
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]+/g, "-")
      .slice(0, 40)}-${Date.now().toString(36)}`;
    const now = new Date().toISOString();

    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        title: `${body.type} ${body.year} — ${body.clientName}`,
        type: "tax_assessment",
        content: body.notes ?? `Steuerbescheid ${body.type} für ${body.clientName}`,
        frontmatter: {
          type: "tax_assessment",
          client_name: body.clientName,
          assessment_type: body.type,
          tax_type: body.taxType,
          year: body.year,
          notice_number: body.noticeNumber ?? null,
          notice_date: body.noticeDate,
          due_date: body.dueDate ?? null,
          amount: body.amount,
          paid_date: null,
          contested: false,
          contest_deadline: null,
          notes: body.notes ?? null,
          created_at: now,
          updated_at: now,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return apiError(
        "engine_error",
        `Failed to create tax assessment: ${text.slice(0, 200)}`,
        502
      );
    }
    const result = await res.json();
    return Response.json({ slug, ...result }, { status: 201 });
  }
);
