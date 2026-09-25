import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";
import { listEnginePages } from "@/lib/engine-pages";
import { buildIntakeRequest, intakeFromPage, type IntakeRequestFrontmatter } from "@/lib/intake";
import { defaultAcceptanceWorkflow, type IntakeAcceptanceWorkflow } from "@/lib/intake-acceptance";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import type { BrainPage } from "@/lib/types";

export const dynamic = "force-dynamic";

const intakeQuerySchema = z.object({
  status: z.string().optional(),
  limit: z.string().optional(),
});

const intakePostSchema = z.object({
  source: z.enum(["whatsapp", "portal", "web", "email", "bea", "scan", "manual"]).default("manual"),
  summary: z.string().min(1, "summary_required").max(10_000, "summary_too_long"),
  client_name: z.string().max(200).optional(),
  phone_hash: z.string().max(128).optional(),
  email: z.string().email().optional(),
  legal_area: z.string().max(80).optional(),
  missing_documents: z.array(z.string().min(1).max(120)).optional(),
  source_event_slug: z.string().optional(),
});

/**
 * Client-editable parts of the Mandatsannahme. The conflict check is NOT
 * among them: it is written only by POST /api/intake/conflict-check (server
 * runs the check, records the real user) and /api/intake/conflict-waiver
 * (role + justification). A `conflict_check` sent here is ignored.
 */
const acceptancePatchSchema = z.object({
  conflict_check: z.unknown().optional(),
  kyc: z.object({
    required: z.boolean(),
    status: z.enum(["pending", "verified", "failed", "not_required"]),
    verification_slug: z.string().max(500).optional(),
    verified_at: z.string().max(40).optional(),
    risk_level: z.enum(["low", "medium", "high"]).optional(),
  }),
  poa: z.object({
    required: z.boolean(),
    status: z.enum(["pending", "draft", "sent", "signed", "not_required"]),
    poa_slug: z.string().max(500).optional(),
    type: z.enum(["general", "litigation", "transactional", "limited", "post"]).optional(),
  }),
  engagement_letter: z.object({
    status: z.enum(["pending", "draft", "sent"]),
    document_slug: z.string().max(500).optional(),
    generated_at: z.string().max(40).optional(),
    sent_at: z.string().max(40).optional(),
  }),
});

const intakePatchSchema = z.object({
  slug: z.string().min(1, "slug_required"),
  status: z
    .enum(["new", "needs_info", "conflict_check", "accepted", "rejected", "converted"])
    .optional(),
  // "clear"/"conflict" are results of the server-side check, never set by hand.
  conflict_check_status: z.enum(["pending", "needs_review"]).optional(),
  converted_case_slug: z.string().optional(),
  missing_documents: z.array(z.string().min(1).max(120)).optional(),
  summary: z.string().max(10_000).optional(),
  acceptance: acceptancePatchSchema.optional(),
});

function encodeSlug(slug: string): string {
  return slug.split("/").map(encodeURIComponent).join("/");
}

/** Upper bound for the intake list (all pages of the type, paged). */
const INTAKE_LIST_MAX = 20_000;

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: intakeQuerySchema,
    cacheMaxAge: 15,
  },
  async (ctx, _body, query, _req) => {
    // Every request, paged past the engine's per-request cap and without
    // deleted ones; `limit` (optional) only trims the sorted result.
    let pages: BrainPage[];
    try {
      pages = (await listEnginePages(ctx.headers, "intake_request", INTAKE_LIST_MAX, {
        strict: true,
      })) as unknown as BrainPage[];
    } catch {
      return apiError("intake_list_failed", "Intakes konnten nicht geladen werden", 502);
    }
    const limit = query.limit ? Number.parseInt(query.limit, 10) : NaN;
    const all = pages
      .map(intakeFromPage)
      .filter((item): item is NonNullable<ReturnType<typeof intakeFromPage>> => item !== null)
      .filter((item) => !query.status || item.frontmatter.status === query.status)
      .sort(
        (a, b) =>
          new Date(b.frontmatter.created_at).getTime() -
          new Date(a.frontmatter.created_at).getTime()
      );
    const intakes = Number.isFinite(limit) && limit > 0 ? all.slice(0, limit) : all;

    return Response.json({ intakes, total: all.length });
  }
);

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: intakePostSchema,
    audit: (_ctx, body) => ({
      action: "case.create" as const,
      entityType: "intake_request",
      details: { source: body.source, legal_area: body.legal_area },
    }),
  },
  async (ctx, body, _query, _req) => {
    const intake = buildIntakeRequest({
      source: body.source,
      summary: body.summary,
      clientName: body.client_name,
      phoneHash: body.phone_hash,
      email: body.email,
      legalArea: body.legal_area,
      missingDocuments: body.missing_documents,
      sourceEventSlug: body.source_event_slug,
    });

    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify({
        slug: intake.slug,
        title: intake.title,
        type: "intake_request",
        content: intake.content,
        frontmatter: intake.frontmatter,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok)
      return apiError("intake_create_failed", "Intake konnte nicht erstellt werden", 502);

    broadcastSseEvent(ctx.brainId, "intake.created", { slug: intake.slug, by: ctx.user.email });

    // Fire outgoing webhook for intake.new event
    try {
      const { dispatchWebhookEvent } = await import("@/lib/webhook-dispatch");
      await dispatchWebhookEvent("intake.new", {
        slug: intake.slug,
        client_name: body.client_name,
        legal_area: body.legal_area,
        source: body.source,
        summary: body.summary,
      });
    } catch {
      // best-effort — webhook delivery should not block intake creation
    }

    return Response.json({ intake }, { status: 201 });
  }
);

export const PATCH = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: intakePatchSchema,
    audit: (_ctx, body) => ({
      action: "case.update" as const,
      entityType: "intake_request",
      entityId: body.slug,
      details: {
        status: body.status,
        conflict_check_status: body.conflict_check_status,
        ...(body.acceptance
          ? {
              kyc_status: body.acceptance.kyc.status,
              kyc_required: body.acceptance.kyc.required,
              poa_status: body.acceptance.poa.status,
              engagement_letter_status: body.acceptance.engagement_letter.status,
            }
          : {}),
      },
    }),
  },
  async (ctx, body, _query, _req) => {
    const patch: Partial<IntakeRequestFrontmatter> = {
      status: body.status,
      conflict_check_status: body.conflict_check_status,
      converted_case_slug: body.converted_case_slug,
      missing_documents: body.missing_documents,
      summary: body.summary,
      updated_at: new Date().toISOString(),
    };
    if (body.acceptance) {
      // Keep the stored, server-written conflict check; fail closed when the
      // intake cannot be read.
      const currentRes = await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(body.slug)}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!currentRes.ok)
        return apiError("intake_not_found", "Intake konnte nicht geladen werden", 404);
      const stored = intakeFromPage((await currentRes.json()) as BrainPage);
      if (!stored) return apiError("not_intake_request", "Die Seite ist kein Intake", 400);
      const storedAcceptance = stored.frontmatter.acceptance;
      const { conflict_check: _ignored, ...editable } = body.acceptance;
      patch.acceptance = {
        ...(storedAcceptance ?? {}),
        ...editable,
        conflict_check:
          storedAcceptance?.conflict_check ?? defaultAcceptanceWorkflow().conflict_check,
      } as IntakeAcceptanceWorkflow;
    }
    Object.keys(patch).forEach((key) => {
      if ((patch as Record<string, unknown>)[key] === undefined)
        delete (patch as Record<string, unknown>)[key];
    });

    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify({
        slug: body.slug,
        title: "Intake Update",
        type: "intake_request",
        frontmatter: patch,
        ...(body.summary ? { content: body.summary } : {}),
        merge: true,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok)
      return apiError("intake_update_failed", "Intake konnte nicht aktualisiert werden", 502);

    broadcastSseEvent(ctx.brainId, "intake.updated", { slug: body.slug, by: ctx.user.email });
    return Response.json({ ok: true, slug: body.slug, patch });
  }
);
