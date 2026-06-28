import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  court: z.string().optional(),
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
    .optional(),
  outcome: z.enum(["won", "lost", "settled", "partial", "withdrawn", "pending"]).optional(),
  amountInDispute: z.number().optional(),
  amountAwarded: z.number().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  lawyerHours: z.number().optional(),
  notes: z.string().optional(),
});

async function getEntry(slug: string, headers: Record<string, string>) {
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
    const entry = await getEntry(decoded, ctx.headers);
    if (!entry) return apiError("not_found", "Analytics entry not found", 404);
    return Response.json(entry);
  }
);

export const PATCH = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: updateSchema,
    audit: (ctx) => ({
      action: "case.update" as const,
      entityType: "litigation_analytics",
      details: { by: ctx.user.email },
    }),
  },
  async (ctx, body, _query, req) => {
    const { slug } = await (req as unknown as { params: Promise<{ slug: string }> }).params;
    const decoded = decodeURIComponent(slug);

    const existing = await getEntry(decoded, ctx.headers);
    if (!existing) return apiError("not_found", "Analytics entry not found", 404);

    const fm = (existing.frontmatter ?? {}) as Record<string, unknown>;
    const now = new Date().toISOString();

    const startDate = body.startDate ?? (fm.start_date as string | undefined);
    const endDate = body.endDate ?? (fm.end_date as string | undefined);
    let durationDays = fm.duration_days as number | undefined;
    if (startDate && endDate) {
      durationDays = Math.round(
        (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    const updatedFm: Record<string, unknown> = {
      ...fm,
      ...(body.court !== undefined ? { court: body.court } : {}),
      ...(body.courtLevel !== undefined ? { court_level: body.courtLevel } : {}),
      ...(body.judge !== undefined ? { judge: body.judge } : {}),
      ...(body.procedureType !== undefined ? { procedure_type: body.procedureType } : {}),
      ...(body.outcome !== undefined ? { outcome: body.outcome } : {}),
      ...(body.amountInDispute !== undefined ? { amount_in_dispute: body.amountInDispute } : {}),
      ...(body.amountAwarded !== undefined ? { amount_awarded: body.amountAwarded } : {}),
      ...(body.startDate !== undefined ? { start_date: body.startDate } : {}),
      ...(body.endDate !== undefined ? { end_date: body.endDate } : {}),
      ...(body.lawyerHours !== undefined ? { lawyer_hours: body.lawyerHours } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      duration_days: durationDays,
      updated_at: now,
    };

    const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(decoded)}`, {
      method: "PATCH",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ frontmatter: updatedFm, content: existing.content ?? "" }),
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
      action: "case.delete" as const,
      entityType: "litigation_analytics",
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
