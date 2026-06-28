import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { canAdvancePhase, type LitigationPhase } from "@/lib/litigation-flow";

export const dynamic = "force-dynamic";

const VALID_PHASES = [
  "pre_filing",
  "filing",
  "discovery",
  "pre_trial",
  "trial",
  "post_trial",
  "appeal",
  "enforcement",
  "closed",
] as const;

const updateSchema = z.object({
  phase: z.enum(VALID_PHASES).optional(),
  court: z.string().optional(),
  courtFileNumber: z.string().optional(),
  instance: z.string().optional(),
  steps: z
    .array(
      z.object({
        id: z.string(),
        type: z.enum([
          "task",
          "filing",
          "motion",
          "hearing",
          "deadline",
          "document",
          "communication",
          "evidence",
          "settlement",
          "enforcement",
        ]),
        title: z.string(),
        description: z.string().optional(),
        status: z.enum(["pending", "in_progress", "completed", "blocked", "skipped"]).optional(),
        dueDate: z.string().optional(),
        completedAt: z.string().optional(),
        assignedTo: z.string().optional(),
        metadata: z.record(z.unknown()).optional(),
      })
    )
    .optional(),
  settlement: z
    .object({
      status: z.enum(["none", "offered", "negotiating", "agreed", "failed"]),
      amount: z.number().optional(),
      currency: z.string().optional(),
      date: z.string().optional(),
      notes: z.string().optional(),
    })
    .optional(),
  judgment: z
    .object({
      outcome: z.enum(["favorable", "unfavorable", "partial", "pending"]),
      date: z.string().optional(),
      summary: z.string().optional(),
      appealable: z.boolean(),
      appealedAt: z.string().optional(),
    })
    .optional(),
});

async function getMatter(slug: string, headers: Record<string, string>) {
  const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  return res.json();
}

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
  },
  async (ctx, _body, _query, req) => {
    const { slug } = await (req as unknown as { params: Promise<{ slug: string }> }).params;
    const decoded = decodeURIComponent(slug);
    const matter = await getMatter(decoded, ctx.headers);
    if (!matter) return apiError("not_found", "Litigation matter not found", 404);
    return Response.json(matter);
  }
);

export const PATCH = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: updateSchema,
    audit: (ctx) => ({
      action: "case.update" as const,
      entityType: "litigation_matter",
      details: { by: ctx.user.email },
    }),
  },
  async (ctx, body, _query, req) => {
    const { slug } = await (req as unknown as { params: Promise<{ slug: string }> }).params;
    const decoded = decodeURIComponent(slug);

    const existing = await getMatter(decoded, ctx.headers);
    if (!existing) return apiError("not_found", "Litigation matter not found", 404);

    const fm = (existing.frontmatter ?? {}) as Record<string, unknown>;
    const currentPhase = fm.phase as LitigationPhase;

    if (body.phase && body.phase !== currentPhase) {
      if (!canAdvancePhase(currentPhase, body.phase)) {
        return apiError(
          "invalid_transition",
          `Cannot advance from ${currentPhase} to ${body.phase}`,
          400
        );
      }
    }

    const now = new Date().toISOString();
    const updatedFm: Record<string, unknown> = {
      ...fm,
      ...(body.phase !== undefined ? { phase: body.phase } : {}),
      ...(body.court !== undefined ? { court: body.court } : {}),
      ...(body.courtFileNumber !== undefined ? { court_file_number: body.courtFileNumber } : {}),
      ...(body.instance !== undefined ? { instance: body.instance } : {}),
      ...(body.steps !== undefined ? { steps: body.steps } : {}),
      ...(body.settlement !== undefined ? { settlement: body.settlement } : {}),
      ...(body.judgment !== undefined ? { judgment: body.judgment } : {}),
      updated_at: now,
    };

    if (body.phase && body.phase !== currentPhase) {
      const history = (fm.phase_history as Array<Record<string, unknown>>) ?? [];
      history.push({ phase: body.phase, changedAt: now, changedBy: ctx.user.email });
      updatedFm.phase_history = history;
    }

    const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(decoded)}`, {
      method: "PATCH",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
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
      action: "case.delete" as const,
      entityType: "litigation_matter",
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
