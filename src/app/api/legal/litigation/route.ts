import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import type { LitigationPhase, LitigationStep, StepStatus, StepType } from "@/lib/litigation-flow";

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

const createSchema = z.object({
  caseSlug: z.string().min(1),
  caseTitle: z.string().min(1),
  phase: z.enum(VALID_PHASES).default("pre_filing"),
  court: z.string().optional(),
  courtFileNumber: z.string().optional(),
  instance: z.string().default("1. Instanz"),
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
        status: z
          .enum(["pending", "in_progress", "completed", "blocked", "skipped"])
          .default("pending"),
        dueDate: z.string().optional(),
        completedAt: z.string().optional(),
        assignedTo: z.string().optional(),
        metadata: z.record(z.unknown()).optional(),
      })
    )
    .default([]),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: z.object({
      caseSlug: z.string().optional(),
      phase: z.enum(VALID_PHASES).optional(),
      limit: z.coerce.number().min(1).max(200).default(50),
    }),
  },
  async (_ctx, _body, query, _req) => {
    const params = new URLSearchParams({
      type: "litigation_matter",
      limit: String(query?.limit ?? 50),
    });
    if (query?.caseSlug) params.set("case_slug", query.caseSlug);
    if (query?.phase) params.set("phase", query.phase);

    const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: _ctx.headers,
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
      entityType: "litigation_matter",
      details: { by: ctx.user.email },
    }),
  },
  async (ctx, body, _query, _req) => {
    const slug = `litigation/${body.caseSlug}/${Date.now()}`;
    const now = new Date().toISOString();

    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        title: `Litigation: ${body.caseTitle}`,
        type: "litigation_matter",
        content: `Litigation matter for case ${body.caseTitle}`,
        frontmatter: {
          type: "litigation_matter",
          case_slug: body.caseSlug,
          case_title: body.caseTitle,
          phase: body.phase,
          court: body.court ?? null,
          court_file_number: body.courtFileNumber ?? null,
          instance: body.instance,
          steps: body.steps,
          phase_history: [{ phase: body.phase, changedAt: now, changedBy: ctx.user.email }],
          settlement: { status: "none" },
          judgment: { outcome: "pending", appealable: false },
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
        `Failed to create litigation matter: ${text.slice(0, 200)}`,
        502
      );
    }
    const result = await res.json();
    return Response.json({ slug, ...result }, { status: 201 });
  }
);
