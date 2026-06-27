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

const playbookPatchSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    jurisdiction: z.enum(["at", "de", "ch", "all"]).optional(),
    contract_types: z.array(z.string().max(100)).max(50).optional(),
    rules: z
      .array(
        z.object({
          id: z.string().max(200),
          clause_type: z.string().min(1).max(500),
          required_position: z.enum(["favorable", "neutral", "exclude", "must_include"]),
          deviation_flag: z.string().min(1).max(500),
          severity: z.enum(["low", "medium", "high", "critical"]),
          notes: z.string().max(5_000).optional(),
        })
      )
      .max(200)
      .optional(),
    description: z.string().max(5_000).optional(),
  })
  .passthrough();

export const GET = createHandler(
  {
    action: "legal.playbook",
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
      if (res.status === 404) return apiError("not_found", "Playbook nicht gefunden", 404);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return apiSuccess(await res.json());
    } catch (err) {
      console.error(
        "[playbooks/slug] get failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("not_found", "Playbook nicht gefunden", 404);
    }
  }
);

export const PATCH = createHandler(
  {
    action: "legal.playbook",
    rateTier: "standard",
    body: playbookPatchSchema,
    audit: (_ctx, body) => ({
      action: "legal.playbook" as const,
      entityType: "playbook",
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
    if (body.jurisdiction !== undefined) frontmatter.jurisdiction = body.jurisdiction;
    if (body.contract_types !== undefined) frontmatter.contract_types = body.contract_types;
    if (body.rules !== undefined) frontmatter.rules = body.rules;

    const payload: { slug: string } & Record<string, unknown> = { slug };
    if (body.title !== undefined) payload.title = body.title;
    if (body.description !== undefined) payload.content = body.description;
    if (Object.keys(frontmatter).length > 0) payload.frontmatter = frontmatter;

    try {
      const res = await enginePatchPage(ctx.headers, payload, { timeoutMs: 30_000 });
      if (res.status === 404) return apiError("not_found", "Playbook nicht gefunden", 404);
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
        "[playbooks/slug] patch failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("engine_unreachable", "Engine nicht erreichbar", 503);
    }
  }
);

export const DELETE = createHandler(
  {
    action: "legal.playbook",
    rateTier: "standard",
    audit: () => ({
      action: "legal.playbook" as const,
      entityType: "playbook",
      details: { deleted: true },
    }),
  },
  async (ctx, _body, _query, req) => {
    const { slug: rawSlug } = await (req as unknown as { params: Promise<{ slug: string }> })
      .params;
    const slug = decodedSlug(rawSlug);
    if (!slug) return apiError("invalid_slug", "Ungültiger Slug", 400);

    try {
      // No engine DELETE route — soft-delete by tombstoning via merge-update.
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
      if (res.status === 404) return apiError("not_found", "Playbook nicht gefunden", 404);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return apiSuccess({ ok: true });
    } catch (err) {
      console.error(
        "[playbooks/slug] delete failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("engine_unreachable", "Engine nicht erreichbar", 503);
    }
  }
);
