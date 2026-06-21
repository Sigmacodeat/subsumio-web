import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError, recordQuota } from "@/lib/api-handler";
import { broadcastSseEvent } from "@/lib/realtime-bus";

const pagesQuerySchema = z.object({
  limit: z.string().optional(),
  offset: z.string().optional(),
  source: z.string().optional(),
  type: z.string().optional(),
  tag: z.string().optional(),
  q: z.string().optional(),
  cursor: z.string().optional(),
});

const pagesPostSchema = z
  .object({
    slug: z
      .string()
      .min(1, "slug_required")
      .refine((s) => !s.includes("..") && !s.includes("//"), "invalid_slug"),
    title: z.string().min(1, "title_required"),
    content: z.string().optional(),
    type: z.string().optional(),
    frontmatter: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: pagesQuerySchema,
    cacheMaxAge: 15,
  },
  async (ctx, _body, query, _req) => {
    const params = new URLSearchParams();
    for (const key of ["limit", "offset", "source", "type", "tag", "q", "cursor"] as const) {
      const val = query[key];
      if (val) params.set(key, val);
    }
    try {
      const res = await fetch(`${ENGINE_URL}/api/pages?${params.toString()}`, {
        headers: ctx.headers,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Relay cursor pagination metadata from engine if present
      const nextCursor = res.headers.get("x-next-cursor");
      if (nextCursor) {
        return Response.json({ items: data, nextCursor });
      }
      return Response.json(data);
    } catch (err) {
      console.error("[pages] list failed:", err instanceof Error ? err.message : String(err));
      return Response.json([]);
    }
  }
);

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    quota: "pages",
    body: pagesPostSchema,
    audit: (ctx, body) => ({
      action: "case.create" as const,
      entityType: "page",
      entityId: body.slug,
      details: { title: body.title, type: body.type },
    }),
  },
  async (ctx, body, _query, _req) => {
    try {
      const res = await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      void recordQuota(ctx, "pages");
      const result = await res.json();
      broadcastSseEvent(ctx.brainId, "case.updated", {
        slug: body.slug,
        by: ctx.user.email,
        at: new Date().toISOString(),
        action: "created",
      });

      // Auto-conflict-check for legal_case pages
      let conflictWarning:
        | { checked: boolean; matches?: Array<{ name: string; slug: string; type: string }> }
        | undefined;
      if (body.type === "legal_case") {
        const fm = body.frontmatter ?? {};
        const namesToCheck = [fm.client_name, fm.opponent_name].filter(
          (n): n is string => typeof n === "string" && n.trim().length > 0
        );
        if (namesToCheck.length > 0) {
          try {
            const conflicts: Array<{ name: string; slug: string; type: string }> = [];
            for (const name of namesToCheck) {
              const checkRes = await fetch(`${ENGINE_URL}/api/legal/conflict-check`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...ctx.headers },
                body: JSON.stringify({ name }),
              });
              if (checkRes.ok) {
                const checkData = (await checkRes.json()) as {
                  matches?: Array<{ name: string; slug: string; type: string }>;
                };
                if (checkData.matches?.length) {
                  conflicts.push(
                    ...checkData.matches.map((m) => ({ name: m.name, slug: m.slug, type: m.type }))
                  );
                }
              }
            }
            conflictWarning = {
              checked: true,
              matches: conflicts.length > 0 ? conflicts : undefined,
            };
          } catch {
            conflictWarning = { checked: false };
          }
        }
      }

      return Response.json({ ...result, conflictWarning });
    } catch (e) {
      console.error("[pages] create failed:", e instanceof Error ? e.message : String(e));
      return apiError("internal_error", "Seite konnte nicht erstellt werden", 500);
    }
  }
);
