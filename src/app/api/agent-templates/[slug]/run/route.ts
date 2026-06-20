import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError, apiNotFound } from "@/lib/api-handler";
import { sanitizeUserInput } from "@/lib/prompt-sanitizer";

const runSchema = z
  .object({
    input: z.string().max(10_000, "input_too_long").optional(),
  })
  .passthrough();

function buildSlug(slug: string): string | null {
  if (slug.includes("..")) return null;
  return slug;
}

export const POST = createHandler(
  {
    action: "agent.write",
    rateTier: "heavy",
    body: runSchema,
    audit: (_ctx, _body) => ({
      action: "query.submit" as const,
      entityType: "agent_run",
    }),
  },
  async (ctx, body, _query, req) => {
    const { slug: slugStr } = await (req as unknown as { params: Promise<{ slug: string }> })
      .params;
    const slug = buildSlug(slugStr);
    if (!slug) return apiError("invalid_slug", "Ungültiger Slug", 400);

    // 1. Load the template page from the engine
    let template: Record<string, unknown>;
    try {
      const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
        headers: ctx.headers,
      });
      if (res.status === 404) return apiNotFound("Agent-Template");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      template = await res.json();
    } catch (err) {
      console.error(
        "[agent-templates/run] load failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("engine_unreachable", "Template nicht ladbar", 503);
    }

    const fm = (template.frontmatter ?? {}) as Record<string, unknown>;
    const promptTemplate = String(template.content ?? "");
    // P0-SEC-001: external user input is interpolated into the prompt below —
    // strip prompt-injection patterns and control chars first.
    const userInput = sanitizeUserInput((body.input ?? "").trim());

    // 2. Build the prompt: template + optional user input
    const prompt = userInput
      ? `${promptTemplate}\n\n---\n## Eingabe\n${userInput}`
      : promptTemplate;

    // 3. Construct supervisor data from template frontmatter
    const supervisorData: Record<string, unknown> = { prompt };
    if (fm.model) supervisorData.supervisor_model = String(fm.model);
    if (fm.skip_critic) supervisorData.skip_critic = true;
    if (Array.isArray(fm.force_specialists))
      supervisorData.force_specialists = fm.force_specialists;

    // 4. Submit to the engine's supervisor endpoint
    try {
      const res = await fetch(`${ENGINE_URL}/api/agents/supervisor`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify(supervisorData),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        return Response.json(payload.error ? payload : { error: "run_failed" }, {
          status: res.status,
          headers: { "Content-Type": "application/json" },
        });
      }

      const data = await res.json();
      return Response.json({ jobId: data.jobId ?? null, success: true });
    } catch (err) {
      console.error(
        "[agent-templates/run] submit failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("engine_unavailable", "Agent konnte nicht gestartet werden", 503);
    }
  }
);
