import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { computeStatistics } from "@/lib/review-sets";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  title: z.string().min(1),
  caseSlug: z.string().optional(),
  caseTitle: z.string().optional(),
  description: z.string().optional(),
  criteria: z
    .object({
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      docTypes: z.array(z.string()).optional(),
      keywords: z.array(z.string()).optional(),
      custodians: z.array(z.string()).optional(),
    })
    .default({}),
  production: z
    .object({
      format: z.enum(["pdf", "tiff", "native", "csv"]).default("pdf"),
      batesPrefix: z.string().optional(),
      batesStart: z.number().optional(),
    })
    .default({ format: "pdf" }),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: z.object({
      caseSlug: z.string().optional(),
      status: z.enum(["draft", "in_review", "produced", "archived"]).optional(),
      limit: z.coerce.number().min(1).max(200).default(50),
    }),
  },
  async (ctx, _body, query, _req) => {
    const params = new URLSearchParams({ type: "review_set", limit: String(query?.limit ?? 50) });
    if (query?.caseSlug) params.set("case_slug", query.caseSlug);
    if (query?.status) params.set("status", query.status);

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
      entityType: "review_set",
      details: { by: ctx.user.email },
    }),
  },
  async (ctx, body, _query, _req) => {
    const slug = `review-sets/${Date.now()}`;
    const now = new Date().toISOString();

    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        title: body.title,
        type: "review_set",
        content: body.description ?? "",
        frontmatter: {
          type: "review_set",
          title: body.title,
          case_slug: body.caseSlug ?? null,
          case_title: body.caseTitle ?? null,
          status: "draft",
          description: body.description ?? null,
          documents: [],
          criteria: body.criteria,
          production: { produced: false, ...body.production },
          statistics: computeStatistics([]),
          created_at: now,
          updated_at: now,
          created_by: ctx.user.email,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return apiError("engine_error", `Failed to create review set: ${text.slice(0, 200)}`, 502);
    }
    const result = await res.json();
    return Response.json({ slug, ...result }, { status: 201 });
  }
);
