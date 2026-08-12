import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";

/**
 * POST /api/admin/backfill-doc-type
 * Reclassifies all documents without a meaningful doc_type using the
 * heuristic classifier ($0, no LLM). Returns a summary of reclassified pages.
 */
export const POST = createHandler(
  {
    action: "admin.*",
    rateTier: "heavy",
    audit: (ctx) => ({
      action: "admin.backfill_doc_type" as const,
      entityType: "corpus",
      details: { triggeredBy: ctx.user.id },
    }),
  },
  async (ctx) => {
    if (ctx.user.role !== "admin") {
      return apiError("forbidden", "Admin access required", 403);
    }

    const ENGINE_URL = process.env.ENGINE_URL || "http://localhost:8080";
    const r = await fetch(`${ENGINE_URL}/api/admin/backfill-doc-type`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...ctx.headers,
      },
      body: JSON.stringify({}),
    });

    if (!r.ok) {
      const body = await r.text();
      return apiError("backfill_failed", `Engine error: ${body}`, r.status);
    }

    const result = await r.json();
    return apiSuccess(result);
  }
);
