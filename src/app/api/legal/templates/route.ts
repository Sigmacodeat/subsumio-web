import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";

const templatesQuerySchema = z.object({
  limit: z
    .string()
    .transform((v) => Math.min(parseInt(v, 10) || 50, 200))
    .optional(),
  offset: z
    .string()
    .transform((v) => Math.max(parseInt(v, 10) || 0, 0))
    .optional(),
  category: z.string().optional(),
  jurisdiction: z.string().optional(),
});

const templateCreateSchema = z
  .object({
    title: z.string().min(1, "title_required").max(200),
    category: z.string().min(1).max(100),
    jurisdiction: z.enum(["at", "de", "ch", "all"]).default("all"),
    description: z.string().max(5_000).optional(),
    body: z.string().min(1, "body_required").max(50_000),
    variables: z
      .array(
        z.object({
          key: z.string().min(1).max(100),
          label: z.string().min(1).max(200),
          required: z.boolean().default(true),
        })
      )
      .max(50)
      .default([]),
    is_builtin: z.boolean().default(false),
  })
  .passthrough();

export const GET = createHandler(
  {
    action: "legal.playbook" as const,
    rateTier: "standard",
    query: templatesQuerySchema,
    cacheMaxAge: 15,
  },
  async (ctx, _body, query, _req) => {
    const params = new URLSearchParams();
    params.set("type", "legal_template");
    if (query.limit !== undefined) params.set("limit", String(query.limit));
    if (query.offset !== undefined) params.set("offset", String(query.offset));

    try {
      const res = await fetch(`${ENGINE_URL}/api/pages?${params.toString()}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const pages = await res.json();

      let templates = Array.isArray(pages) ? pages : [];
      if (query.category) {
        templates = templates.filter((p: Record<string, unknown>) => {
          const fm = p.frontmatter as Record<string, unknown> | undefined;
          return fm?.category === query.category;
        });
      }
      if (query.jurisdiction) {
        templates = templates.filter((p: Record<string, unknown>) => {
          const fm = p.frontmatter as Record<string, unknown> | undefined;
          return fm?.jurisdiction === query.jurisdiction || fm?.jurisdiction === "all";
        });
      }

      return apiSuccess(templates);
    } catch (err) {
      console.error("[templates] list failed:", err instanceof Error ? err.message : String(err));
      return apiSuccess([]);
    }
  }
);

export const POST = createHandler(
  {
    action: "legal.playbook" as const,
    rateTier: "standard",
    body: templateCreateSchema,
    audit: (_ctx, body) => ({
      action: "legal.playbook" as const,
      entityType: "template",
      details: { title: body.title, category: body.category, jurisdiction: body.jurisdiction },
    }),
  },
  async (ctx, body, _query, _req) => {
    const slug = `legal/templates/${body.title
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")}-${Date.now().toString(36)}`;

    const payload = {
      slug,
      title: body.title,
      type: "legal_template",
      content: body.body,
      frontmatter: {
        category: body.category,
        jurisdiction: body.jurisdiction,
        description: body.description ?? "",
        variables: body.variables,
        is_builtin: body.is_builtin,
      },
    };

    try {
      const res = await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        return Response.json(
          errPayload.error ? errPayload : { error: `Engine returned ${res.status}` },
          { status: res.status }
        );
      }
      const result = await res.json();
      return apiSuccess({ slug, ...result });
    } catch (err) {
      console.error("[templates] create failed:", err instanceof Error ? err.message : String(err));
      return apiError("internal_error", "Template konnte nicht erstellt werden", 500);
    }
  }
);
