import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";

const listQuerySchema = z.object({
  search: z.string().optional(),
});

const createSchema = z
  .object({
    name: z.string().min(1, "name_required").max(120, "name_too_long"),
    description: z.string().max(500, "description_too_long").optional().default(""),
    model: z.string().optional(),
    role: z
      .enum(["planning", "review", "summary", "research", "draft", "supervisor", "custom"])
      .optional(),
    prompt_template: z.string().min(1, "prompt_required").max(20_000, "prompt_too_long"),
    steps: z
      .array(
        z.object({
          id: z.string().min(1),
          specialist: z.string().min(1),
          prompt: z.string().min(1),
          depends_on: z.number().int().min(0).optional(),
        })
      )
      .max(10, "too_many_steps")
      .optional()
      .default([]),
    playbook_ref: z.string().optional(),
    force_specialists: z.array(z.string()).max(5).optional(),
    skip_critic: z.boolean().optional().default(false),
  })
  .strict();

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export const GET = createHandler(
  {
    action: "agent.read",
    rateTier: "standard",
    query: listQuerySchema,
  },
  async (ctx, _body, query, _req) => {
    try {
      const params = new URLSearchParams({ type: "agent_template", limit: "200" });
      const res = await fetch(`${ENGINE_URL}/api/pages?${params.toString()}`, {
        headers: ctx.headers,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      let pages = (Array.isArray(data) ? data : (data.pages ?? [])) as Array<
        Record<string, unknown>
      >;

      if (query.search) {
        const q = query.search.toLowerCase();
        pages = pages.filter((p) => {
          const title = String(p.title ?? "").toLowerCase();
          const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
          const desc = String(fm.description ?? "").toLowerCase();
          return title.includes(q) || desc.includes(q);
        });
      }

      const templates = pages.map((p) => {
        const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
        return {
          slug: String(p.slug ?? ""),
          name: String(p.title ?? p.slug ?? ""),
          description: String(fm.description ?? ""),
          model: fm.model ? String(fm.model) : undefined,
          role: fm.role ? String(fm.role) : undefined,
          prompt_template: String(p.content ?? ""),
          steps: Array.isArray(fm.steps) ? fm.steps : [],
          playbook_ref: fm.playbook_ref ? String(fm.playbook_ref) : undefined,
          force_specialists: Array.isArray(fm.force_specialists)
            ? (fm.force_specialists as string[])
            : undefined,
          skip_critic: Boolean(fm.skip_critic ?? false),
          created_at: String(p.created_at ?? ""),
          updated_at: String(p.updated_at ?? ""),
        };
      });

      return Response.json({ templates });
    } catch (err) {
      console.error(
        "[agent-templates] list failed:",
        err instanceof Error ? err.message : String(err)
      );
      return Response.json({ templates: [] });
    }
  }
);

export const POST = createHandler(
  {
    action: "agent.write",
    rateTier: "standard",
    body: createSchema,
    audit: (_ctx, body) => ({
      action: "case.create" as const,
      entityType: "agent_template",
      entityId: `agents/templates/${slugify(body.name)}`,
      details: { name: body.name, model: body.model },
    }),
  },
  async (ctx, body, _query, _req) => {
    const slug = `agents/templates/${slugify(body.name)}`;
    const frontmatter: Record<string, unknown> = {
      description: body.description,
      skip_critic: body.skip_critic,
    };
    if (body.model) frontmatter.model = body.model;
    if (body.role) frontmatter.role = body.role;
    if (body.steps && body.steps.length > 0) frontmatter.steps = body.steps;
    if (body.playbook_ref) frontmatter.playbook_ref = body.playbook_ref;
    if (body.force_specialists) frontmatter.force_specialists = body.force_specialists;

    try {
      const res = await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify({
          slug,
          title: body.name,
          content: body.prompt_template,
          type: "agent_template",
          frontmatter,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        return Response.json(payload.error ? payload : { error: "create_failed" }, {
          status: res.status,
          headers: { "Content-Type": "application/json" },
        });
      }

      const data = await res.json();
      return Response.json({ slug: data.slug ?? slug, success: true });
    } catch (err) {
      console.error(
        "[agent-templates] create failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("internal_error", "Agent-Template konnte nicht erstellt werden", 500);
    }
  }
);
