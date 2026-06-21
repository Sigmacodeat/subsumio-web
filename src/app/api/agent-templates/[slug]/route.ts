import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError, apiNotFound } from "@/lib/api-handler";

function buildSlug(slug: string): string | null {
  if (slug.includes("..")) return null;
  return slug;
}

const updateSchema = z
  .object({
    name: z.string().min(1, "name_required").max(120, "name_too_long").optional(),
    description: z.string().max(500).optional(),
    model: z.string().optional(),
    prompt_template: z.string().min(1, "prompt_required").max(20_000, "prompt_too_long").optional(),
    steps: z
      .array(
        z.object({
          id: z.string().min(1),
          specialist: z.string().min(1),
          prompt: z.string().min(1),
          depends_on: z.number().int().min(0).optional(),
        })
      )
      .max(10)
      .optional(),
    playbook_ref: z.string().optional(),
    force_specialists: z.array(z.string()).max(5).optional(),
    skip_critic: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "nothing_to_update" });

export const GET = createHandler(
  {
    action: "agent.read",
    rateTier: "standard",
  },
  async (ctx, _body, _query, req) => {
    const slug = buildSlug(
      (await (req as unknown as { params: Promise<{ slug: string }> }).params).slug
    );
    if (!slug) return apiError("invalid_slug", "Ungültiger Slug", 400);

    try {
      const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
        headers: ctx.headers,
      });
      if (res.status === 404) return apiNotFound("Agent-Template");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const p = await res.json();
      const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
      return Response.json({
        slug: String(p.slug ?? slug),
        name: String(p.title ?? slug),
        description: String(fm.description ?? ""),
        model: fm.model ? String(fm.model) : undefined,
        prompt_template: String(p.content ?? ""),
        steps: Array.isArray(fm.steps) ? fm.steps : [],
        playbook_ref: fm.playbook_ref ? String(fm.playbook_ref) : undefined,
        force_specialists: Array.isArray(fm.force_specialists)
          ? (fm.force_specialists as string[])
          : undefined,
        skip_critic: Boolean(fm.skip_critic ?? false),
        created_at: String(p.created_at ?? ""),
        updated_at: String(p.updated_at ?? ""),
      });
    } catch (err) {
      console.error(
        "[agent-templates/slug] get failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiNotFound("Agent-Template");
    }
  }
);

export const PATCH = createHandler(
  {
    action: "agent.write",
    rateTier: "standard",
    body: updateSchema,
    audit: (_ctx, _body) => ({
      action: "case.update" as const,
      entityType: "agent_template",
    }),
  },
  async (ctx, body, _query, req) => {
    const slug = buildSlug(
      (await (req as unknown as { params: Promise<{ slug: string }> }).params).slug
    );
    if (!slug) return apiError("invalid_slug", "Ungültiger Slug", 400);

    const frontmatter: Record<string, unknown> = {};
    if (body.description !== undefined) frontmatter.description = body.description;
    if (body.model !== undefined) frontmatter.model = body.model;
    if (body.steps !== undefined) frontmatter.steps = body.steps;
    if (body.playbook_ref !== undefined) frontmatter.playbook_ref = body.playbook_ref;
    if (body.force_specialists !== undefined)
      frontmatter.force_specialists = body.force_specialists;
    if (body.skip_critic !== undefined) frontmatter.skip_critic = body.skip_critic;

    const payload: Record<string, unknown> = {
      slug,
      merge: true,
      type: "agent_template",
      frontmatter,
    };
    if (body.name !== undefined) payload.title = body.name;
    if (body.prompt_template !== undefined) payload.content = body.prompt_template;

    try {
      const res = await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify(payload),
      });
      if (res.status === 404) return apiNotFound("Agent-Template");
      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        return Response.json(errPayload.error ? errPayload : { error: "update_failed" }, {
          status: res.status,
          headers: { "Content-Type": "application/json" },
        });
      }
      const data = await res.json();
      return Response.json({ slug: data.slug ?? slug, success: true });
    } catch (err) {
      console.error(
        "[agent-templates/slug] patch failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("engine_unreachable", "Agent-Template nicht aktualisierbar", 503);
    }
  }
);

export const DELETE = createHandler(
  {
    action: "brain.delete",
    rateTier: "standard",
  },
  async (ctx, _body, _query, req) => {
    const slug = buildSlug(
      (await (req as unknown as { params: Promise<{ slug: string }> }).params).slug
    );
    if (!slug) return apiError("invalid_slug", "Ungültiger Slug", 400);

    try {
      const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
        method: "DELETE",
        headers: ctx.headers,
      });
      if (res.status === 404) return apiNotFound("Agent-Template");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Response.json({ success: true });
    } catch (err) {
      console.error(
        "[agent-templates/slug] delete failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("engine_unreachable", "Agent-Template nicht löschbar", 503);
    }
  }
);
