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

type ConflictMatch = { name: string; slug: string; type: string };

async function checkLegalCaseConflicts(
  headers: Record<string, string>,
  frontmatter: Record<string, unknown> | undefined
): Promise<{ checked: boolean; matches?: ConflictMatch[] }> {
  const namesToCheck = [frontmatter?.client_name, frontmatter?.opponent_name].filter(
    (n): n is string => typeof n === "string" && n.trim().length > 0
  );
  if (namesToCheck.length === 0) return { checked: true };

  const conflicts: ConflictMatch[] = [];
  for (const name of namesToCheck) {
    const checkRes = await fetch(`${ENGINE_URL}/api/legal/conflict-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ name }),
    });
    if (!checkRes.ok) {
      throw new Error(`Conflict check failed: HTTP ${checkRes.status}`);
    }
    const checkData = (await checkRes.json()) as { matches?: ConflictMatch[] };
    if (checkData.matches?.length) {
      conflicts.push(
        ...checkData.matches.map((m) => ({ name: m.name, slug: m.slug, type: m.type }))
      );
    }
  }

  return { checked: true, matches: conflicts.length > 0 ? conflicts : undefined };
}

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
        signal: AbortSignal.timeout(10_000),
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
      return apiError("service_unavailable", "Seiten derzeit nicht verfügbar", 503);
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
      details: {
        title: body.title,
        type: body.type,
        conflict_status: body.frontmatter?.conflict_status,
        conflict_waiver_reason: body.frontmatter?.conflict_waiver_reason,
      },
    }),
  },
  async (ctx, body, _query, _req) => {
    try {
      let conflictWarning:
        | { checked: boolean; matches?: Array<{ name: string; slug: string; type: string }> }
        | undefined;
      if (body.type === "legal_case") {
        try {
          conflictWarning = await checkLegalCaseConflicts(ctx.headers, body.frontmatter);
        } catch (err) {
          console.error(
            "[pages] conflict check failed:",
            err instanceof Error ? err.message : String(err)
          );
          return apiError(
            "conflict_check_unavailable",
            "Kollisionsprüfung nicht verfügbar. Akte wurde nicht angelegt.",
            503
          );
        }

        const waiverReason =
          typeof body.frontmatter?.conflict_waiver_reason === "string"
            ? body.frontmatter.conflict_waiver_reason.trim()
            : "";
        if (conflictWarning.matches?.length && waiverReason.length === 0) {
          return Response.json(
            {
              error: "conflict_detected",
              message: "Kollisionsprüfung hat Treffer gefunden. Akte wurde nicht angelegt.",
              conflictWarning,
            },
            { status: 409 }
          );
        }

        if (conflictWarning.checked && !conflictWarning.matches?.length) {
          body.frontmatter = {
            ...body.frontmatter,
            conflict_status: "conflict_cleared",
          };
        }
      }

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

      return Response.json({ ...result, conflictWarning });
    } catch (e) {
      console.error("[pages] create failed:", e instanceof Error ? e.message : String(e));
      return apiError("internal_error", "Seite konnte nicht erstellt werden", 500);
    }
  }
);
