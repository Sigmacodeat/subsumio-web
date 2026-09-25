import { z } from "zod";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";
import {
  GUARD_READ_FAILED,
  guardSecondCheckWrite,
  readCurrentPage,
  rejectionResponse,
} from "@/lib/page-write-guards";
import { planDeadlineArrayAppend, type DeadlineChangeEvent } from "@/lib/deadline-write-policy";
import { logDeadlineEvents } from "@/lib/deadline-audit";

import { logger } from "@/lib/logger";
const log = logger("api/pages/array-append");

/**
 * Thin proxy onto the engine's atomic page_array_append op — a single UPDATE
 * (jsonb_set + `||`), so concurrent appends to e.g. a matter's time_entries
 * serialize on the row lock instead of read-modify-write clobbering.
 */
const appendSchema = z.object({
  slug: z.string().min(1).max(300),
  field: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "field must be a top-level frontmatter key"),
  items: z.array(z.unknown()).max(1000),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: appendSchema,
    audit: (_ctx, body) => ({
      action: "case.update" as const,
      entityType: "page_array",
      entityId: body.slug,
      details: { field: body.field, appended: body.items.length },
    }),
  },
  async (ctx, body) => {
    // New Fristen in a matter: second-check fields dropped, creator stamped
    // from the session, audit entry written; the matter's version advances.
    let payload = body;
    let deadlineEvents: DeadlineChangeEvent[] = [];
    let nextVersion: number | null = null;
    if (body.field === "deadlines") {
      const read = await readCurrentPage(ENGINE_URL, ctx.headers, body.slug);
      if (read.kind === "error") return rejectionResponse(GUARD_READ_FAILED);
      if (read.kind === "missing") return apiError("not_found", "Seite nicht gefunden", 404);
      const fm = (read.page.frontmatter ?? {}) as Record<string, unknown>;
      const guarded = guardSecondCheckWrite({ deadlines: body.items }, null);
      if ("reject" in guarded) return rejectionResponse(guarded.reject);
      const plan = planDeadlineArrayAppend(
        guarded.frontmatter.deadlines as unknown[],
        ctx.user,
        body.slug
      );
      if ("reject" in plan) return rejectionResponse(plan.reject);
      payload = { ...body, items: plan.items };
      deadlineEvents = plan.events;
      const storedVersion = Number(fm.version);
      nextVersion = (Number.isFinite(storedVersion) ? storedVersion : 0) + 1;
    }
    try {
      const res = await fetch(`${ENGINE_URL}/api/pages/array-append`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return Response.json(data ?? { error: "append_failed" }, { status: res.status });
      if (nextVersion !== null) {
        await enginePatchPage(
          ctx.headers,
          { slug: body.slug, frontmatter: { version: nextVersion } },
          { timeoutMs: 15_000 }
        );
        await logDeadlineEvents(ctx, deadlineEvents);
      }
      return Response.json(data);
    } catch (err) {
      log.error("[pages/array-append] failed:", err instanceof Error ? err.message : String(err));
      return apiError("append_failed", "Eintrag konnte nicht gespeichert werden", 502);
    }
  }
);
