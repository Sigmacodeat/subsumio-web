import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";

import { logger } from "@/lib/logger";
const log = logger("api/pages/array-mutate");

const scalarMap = z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]));

/**
 * Thin proxy onto the engine's atomic page_array_mutate op — patches or drops
 * frontmatter array elements matched by `match_key` ∈ `match` in one UPDATE,
 * with an optional `unless: {eq, ne}` in-statement skip guard (e.g. "already
 * billed under a different invoice" stays untouched).
 */
const mutateSchema = z.object({
  slug: z.string().min(1).max(300),
  field: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "field must be a top-level frontmatter key"),
  match: z
    .array(z.union([z.string(), z.number(), z.boolean()]))
    .min(1)
    .max(1000),
  match_key: z
    .string()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
    .optional(),
  set: z.record(z.unknown()).optional(),
  unset: z.array(z.string()).optional(),
  remove: z.boolean().optional(),
  unless: z.object({ eq: scalarMap.optional(), ne: scalarMap.optional() }).optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: mutateSchema,
    audit: (_ctx, body) => ({
      action: "case.update" as const,
      entityType: "page_array",
      entityId: body.slug,
      details: { field: body.field, matched: body.match.length, remove: body.remove === true },
    }),
  },
  async (ctx, body) => {
    try {
      const res = await fetch(`${ENGINE_URL}/api/pages/array-mutate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return Response.json(data ?? { error: "mutate_failed" }, { status: res.status });
      return Response.json(data);
    } catch (err) {
      log.error("[pages/array-mutate] failed:", err instanceof Error ? err.message : String(err));
      return apiError("mutate_failed", "Eintrag konnte nicht aktualisiert werden", 502);
    }
  }
);
