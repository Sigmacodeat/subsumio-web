import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";
import { buildIntakeRequest, intakeFromPage, type IntakeRequestFrontmatter } from "@/lib/intake";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import type { BrainPage } from "@/lib/types";

export const dynamic = "force-dynamic";

const intakeQuerySchema = z.object({
  status: z.string().optional(),
  limit: z.string().optional(),
});

const intakePostSchema = z.object({
  source: z.enum(["whatsapp", "portal", "web", "email", "manual"]).default("manual"),
  summary: z.string().min(1, "summary_required").max(10_000, "summary_too_long"),
  client_name: z.string().max(200).optional(),
  phone_hash: z.string().max(128).optional(),
  email: z.string().email().optional(),
  legal_area: z.string().max(80).optional(),
  missing_documents: z.array(z.string().min(1).max(120)).optional(),
  source_event_slug: z.string().optional(),
});

const intakePatchSchema = z.object({
  slug: z.string().min(1, "slug_required"),
  status: z
    .enum(["new", "needs_info", "conflict_check", "accepted", "rejected", "converted"])
    .optional(),
  conflict_check_status: z.enum(["pending", "clear", "conflict", "needs_review"]).optional(),
  converted_case_slug: z.string().optional(),
  missing_documents: z.array(z.string().min(1).max(120)).optional(),
  summary: z.string().max(10_000).optional(),
});

function pagesFrom(data: unknown): BrainPage[] {
  if (Array.isArray(data)) return data as BrainPage[];
  if (data && typeof data === "object" && Array.isArray((data as { pages?: unknown }).pages)) {
    return (data as { pages: BrainPage[] }).pages;
  }
  if (data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)) {
    return (data as { items: BrainPage[] }).items;
  }
  return [];
}

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: intakeQuerySchema,
    cacheMaxAge: 15,
  },
  async (ctx, _body, query, _req) => {
    const limit = Math.min(Number.parseInt(query.limit || "100", 10) || 100, 250);
    const res = await fetch(`${ENGINE_URL}/api/pages?type=intake_request&limit=${limit}`, {
      headers: ctx.headers,
    signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return apiError("intake_list_failed", "Intakes konnten nicht geladen werden", 502);

    const pages = pagesFrom(await res.json().catch(() => []));
    const intakes = pages
      .map(intakeFromPage)
      .filter((item): item is NonNullable<ReturnType<typeof intakeFromPage>> => item !== null)
      .filter((item) => !query.status || item.frontmatter.status === query.status)
      .sort(
        (a, b) =>
          new Date(b.frontmatter.created_at).getTime() -
          new Date(a.frontmatter.created_at).getTime()
      );

    return Response.json({ intakes, total: intakes.length });
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
      signal: AbortSignal.timeout(15_000),
      }),
    });
    if (!res.ok)
      return apiError("intake_create_failed", "Intake konnte nicht erstellt werden", 502);

    broadcastSseEvent(ctx.brainId, "intake.created", { slug: intake.slug, by: ctx.user.email });
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
      details: { status: body.status, conflict_check_status: body.conflict_check_status },
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
      signal: AbortSignal.timeout(15_000),
      }),
    });
    if (!res.ok)
      return apiError("intake_update_failed", "Intake konnte nicht aktualisiert werden", 502);

    broadcastSseEvent(ctx.brainId, "intake.updated", { slug: body.slug, by: ctx.user.email });
    return Response.json({ ok: true, slug: body.slug, patch });
  }
);
