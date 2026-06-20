
import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";

const playbooksQuerySchema = z.object({
  limit: z.string().optional(),
  offset: z.string().optional(),
  jurisdiction: z.string().optional(),
  contract_type: z.string().optional(),
});

const playbookCreateSchema = z.object({
  title: z.string().min(1, "title_required"),
  jurisdiction: z.enum(["at", "de", "ch", "all"]).default("all"),
  contract_types: z.array(z.string()).default([]),
  rules: z.array(
    z.object({
      id: z.string(),
      clause_type: z.string().min(1),
      required_position: z.enum(["favorable", "neutral", "exclude", "must_include"]),
      deviation_flag: z.string().min(1),
      severity: z.enum(["low", "medium", "high", "critical"]),
      notes: z.string().optional(),
    }),
  ).default([]),
  description: z.string().optional(),
}).passthrough();

export const GET = createHandler(
  {
    action: "legal.playbook",
    rateTier: "standard",
    query: playbooksQuerySchema,
    cacheMaxAge: 15,
  },
  async (ctx, _body, query, _req) => {
    const params = new URLSearchParams();
    params.set("type", "legal_playbook");
    if (query.limit) params.set("limit", query.limit);
    if (query.offset) params.set("offset", query.offset);

    try {
      const res = await fetch(`${ENGINE_URL}/api/pages?${params.toString()}`, {
        headers: ctx.headers,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const pages = await res.json();

      let playbooks = Array.isArray(pages) ? pages : [];
      if (query.jurisdiction) {
        playbooks = playbooks.filter(
          (p: Record<string, unknown>) => {
            const fm = p.frontmatter as Record<string, unknown> | undefined;
            return fm?.jurisdiction === query.jurisdiction;
          },
        );
      }
      if (query.contract_type) {
        playbooks = playbooks.filter(
          (p: Record<string, unknown>) => {
            const fm = p.frontmatter as Record<string, unknown> | undefined;
            const types = Array.isArray(fm?.contract_types) ? fm!.contract_types : [];
            return types.includes(query.contract_type);
          },
        );
      }

      return apiSuccess(playbooks);
    } catch (err) {
      console.error("[playbooks] list failed:", err instanceof Error ? err.message : String(err));
      return apiError("engine_unreachable", "Playbooks nicht abrufbar", 503);
    }
  },
);

export const POST = createHandler(
  {
    action: "legal.playbook",
    rateTier: "standard",
    body: playbookCreateSchema,
    audit: (_ctx, body) => ({
      action: "legal.playbook" as const,
      entityType: "playbook",
      details: { title: body.title, jurisdiction: body.jurisdiction, ruleCount: body.rules.length },
    }),
  },
  async (ctx, body, _query, _req) => {
    const slug = `legal/playbooks/${body.title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}-${Date.now().toString(36)}`;

    const payload = {
      slug,
      title: body.title,
      type: "legal_playbook",
      content: body.description ?? "",
      frontmatter: {
        jurisdiction: body.jurisdiction,
        contract_types: body.contract_types,
        rules: body.rules,
      },
    };

    try {
      const res = await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        return Response.json(
          errPayload.error ? errPayload : { error: `Engine returned ${res.status}` },
          { status: res.status },
        );
      }
      const result = await res.json();
      return apiSuccess({ slug, ...result });
    } catch (err) {
      console.error("[playbooks] create failed:", err instanceof Error ? err.message : String(err));
      return apiError("internal_error", "Playbook konnte nicht erstellt werden", 500);
    }
  },
);
