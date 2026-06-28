import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  caseSlug: z.string().min(1),
  caseTitle: z.string().min(1),
  caseNumber: z.string().optional(),
  court: z.string().min(1),
  courtLevel: z
    .enum([
      "amtsgericht",
      "landesgericht",
      "oberlandesgericht",
      "bundesgericht",
      "verwaltungsgericht",
      "finanzgericht",
      "arbeitsgericht",
      "sozialgericht",
    ])
    .optional(),
  judge: z.string().optional(),
  procedureType: z
    .enum(["zivil", "straf", "verwaltungs", "finanz", "arbeits", "sozial", "familie"])
    .default("zivil"),
  outcome: z.enum(["won", "lost", "settled", "partial", "withdrawn", "pending"]).default("pending"),
  amountInDispute: z.number().optional(),
  amountAwarded: z.number().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  lawyerHours: z.number().optional(),
  notes: z.string().optional(),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: z.object({
      court: z.string().optional(),
      judge: z.string().optional(),
      outcome: z.enum(["won", "lost", "settled", "partial", "withdrawn", "pending"]).optional(),
      procedureType: z
        .enum(["zivil", "straf", "verwaltungs", "finanz", "arbeits", "sozial", "familie"])
        .optional(),
      limit: z.coerce.number().min(1).max(500).default(200),
    }),
  },
  async (ctx, _body, query, _req) => {
    const params = new URLSearchParams({
      type: "litigation_analytics",
      limit: String(query?.limit ?? 200),
    });
    if (query?.court) params.set("court", query.court);
    if (query?.judge) params.set("judge", query.judge);
    if (query?.outcome) params.set("outcome", query.outcome);
    if (query?.procedureType) params.set("procedure_type", query.procedureType);

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
      action: "case.create" as const,
      entityType: "litigation_analytics",
      details: { by: ctx.user.email },
    }),
  },
  async (ctx, body, _query, _req) => {
    const slug = `litigation-analytics/${Date.now()}`;
    const now = new Date().toISOString();
    let durationDays: number | undefined;
    if (body.startDate && body.endDate) {
      durationDays = Math.round(
        (new Date(body.endDate).getTime() - new Date(body.startDate).getTime()) /
          (1000 * 60 * 60 * 24)
      );
    }

    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        title: body.caseTitle,
        type: "litigation_analytics",
        content: `Analytics: ${body.caseTitle} — ${body.court}`,
        frontmatter: {
          type: "litigation_analytics",
          case_slug: body.caseSlug,
          case_title: body.caseTitle,
          case_number: body.caseNumber ?? null,
          court: body.court,
          court_level: body.courtLevel ?? null,
          judge: body.judge ?? null,
          procedure_type: body.procedureType,
          outcome: body.outcome,
          amount_in_dispute: body.amountInDispute ?? null,
          amount_awarded: body.amountAwarded ?? null,
          start_date: body.startDate ?? null,
          end_date: body.endDate ?? null,
          duration_days: durationDays ?? null,
          lawyer_hours: body.lawyerHours ?? null,
          notes: body.notes ?? null,
          created_at: now,
          updated_at: now,
          created_by: ctx.user.email,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return apiError(
        "engine_error",
        `Failed to create analytics entry: ${text.slice(0, 200)}`,
        502
      );
    }
    const result = await res.json();
    return Response.json({ slug, ...result }, { status: 201 });
  }
);
