import { z } from "zod";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";

function decodedSlug(raw: string): string | null {
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.includes("..") || decoded.includes("//")) return null;
    return decoded;
  } catch {
    return null;
  }
}

const templatePatchSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    category: z.string().min(1).max(100).optional(),
    jurisdiction: z.enum(["at", "de", "ch", "all"]).optional(),
    description: z.string().max(5_000).optional(),
    body: z.string().min(1).max(50_000).optional(),
    variables: z
      .array(
        z.object({
          key: z.string().min(1).max(100),
          label: z.string().min(1).max(200),
          required: z.boolean().default(true),
        })
      )
      .max(50)
      .optional(),
  })
  .passthrough();

export const GET = createHandler(
  {
    action: "legal.playbook" as const,
    rateTier: "standard",
    cacheMaxAge: 15,
  },
  async (ctx, _body, _query, req) => {
    const { slug: rawSlug } = await (req as unknown as { params: Promise<{ slug: string }> })
      .params;
    const slug = decodedSlug(rawSlug);
    if (!slug) return apiError("invalid_slug", "Ungültiger Slug", 400);

    try {
      const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 404) return apiError("not_found", "Template nicht gefunden", 404);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return apiSuccess(await res.json());
    } catch (err) {
      console.error(
        "[templates/slug] get failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("not_found", "Template nicht gefunden", 404);
    }
  }
);

export const PATCH = createHandler(
  {
    action: "legal.playbook" as const,
    rateTier: "standard",
    body: templatePatchSchema,
    audit: (_ctx, body) => ({
      action: "legal.playbook" as const,
      entityType: "template",
      details: { updated: Object.keys(body) },
    }),
  },
  async (ctx, body, _query, req) => {
    const { slug: rawSlug } = await (req as unknown as { params: Promise<{ slug: string }> })
      .params;
    const slug = decodedSlug(rawSlug);
    if (!slug) return apiError("invalid_slug", "Ungültiger Slug", 400);

    if (Object.keys(body).length === 0) {
      return apiError("nothing_to_update", "Keine Felder zum Aktualisieren", 400);
    }

    const frontmatter: Record<string, unknown> = {};
    if (body.category !== undefined) frontmatter.category = body.category;
    if (body.jurisdiction !== undefined) frontmatter.jurisdiction = body.jurisdiction;
    if (body.description !== undefined) frontmatter.description = body.description;
    if (body.variables !== undefined) frontmatter.variables = body.variables;

    const payload: { slug: string } & Record<string, unknown> = { slug };
    if (body.title !== undefined) payload.title = body.title;
    if (body.body !== undefined) payload.content = body.body;
    if (Object.keys(frontmatter).length > 0) payload.frontmatter = frontmatter;

    try {
      const res = await enginePatchPage(ctx.headers, payload, { timeoutMs: 30_000 });
      if (res.status === 404) return apiError("not_found", "Template nicht gefunden", 404);
      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        return Response.json(
          errPayload.error ? errPayload : { error: `Engine returned ${res.status}` },
          { status: res.status }
        );
      }
      return apiSuccess(await res.json());
    } catch (err) {
      console.error(
        "[templates/slug] patch failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("engine_unreachable", "Engine nicht erreichbar", 503);
    }
  }
);

export const DELETE = createHandler(
  {
    action: "legal.playbook" as const,
    rateTier: "standard",
    audit: () => ({
      action: "legal.playbook" as const,
      entityType: "template",
      details: { deleted: true },
    }),
  },
  async (ctx, _body, _query, req) => {
    const { slug: rawSlug } = await (req as unknown as { params: Promise<{ slug: string }> })
      .params;
    const slug = decodedSlug(rawSlug);
    if (!slug) return apiError("invalid_slug", "Ungültiger Slug", 400);

    try {
      const res = await enginePatchPage(
        ctx.headers,
        {
          slug,
          frontmatter: {
            status: "tombstoned",
            tombstoned_at: new Date().toISOString(),
            tombstone_reason: "manual_delete",
          },
        },
        { timeoutMs: 30_000 }
      );
      if (res.status === 404) return apiError("not_found", "Template nicht gefunden", 404);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return apiSuccess({ ok: true });
    } catch (err) {
      console.error(
        "[templates/slug] delete failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("engine_unreachable", "Engine nicht erreichbar", 503);
    }
  }
);
