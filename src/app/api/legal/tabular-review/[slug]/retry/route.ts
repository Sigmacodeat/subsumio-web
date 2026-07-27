import { z } from "zod";
import { createHandler, apiError, recordQuota } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

export const maxDuration = 60;

const tabularReviewRetrySchema = z.object({
  slugs: z.array(z.string().max(300)).max(500).optional(),
});

function decodedSlug(raw: string): string | null {
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.includes("..")) return null;
    return decoded;
  } catch {
    return null;
  }
}

// Retries failed rows of a run (default: all rows in error state).
// Quota books the number of retried documents (= LLM call bundles) from the
// engine response — same pattern as ai-deadlines (recordQuota after compute).
export const POST = createHandler(
  {
    action: "legal.tabular",
    rateTier: "heavy",
    quota: "queries",
    body: tabularReviewRetrySchema,
    audit: (_ctx, body) => ({
      action: "legal.tabular" as const,
      entityType: "document",
      details: { retryCount: body.slugs?.length ?? "all_error_rows", mode: "async_retry" },
    }),
  },
  async (ctx, body, _query, req) => {
    const { slug: rawSlug } = await (req as unknown as { params: Promise<{ slug: string }> })
      .params;
    const slug = decodedSlug(rawSlug);
    if (!slug) return apiError("invalid_slug", "Ungültiger Slug", 400);

    try {
      const upstream = await fetch(
        `${ENGINE_URL}/api/legal/tabular-review/${encodeURIComponent(slug)}/retry`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...ctx.headers },
          body: JSON.stringify(body.slugs ? { slugs: body.slugs } : {}),
          signal: AbortSignal.timeout(30_000),
        }
      );
      const payload = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
      if (!upstream.ok) {
        return Response.json(
          payload.error ? payload : { error: `Engine returned ${upstream.status}` },
          { status: upstream.status }
        );
      }

      const retried = payload.retried;
      const amount =
        typeof retried === "number" && retried > 0 ? retried : (body.slugs?.length ?? 1);
      void recordQuota(ctx, "queries", amount);

      return Response.json(payload);
    } catch (err) {
      console.error(
        "[tabular-review/retry] engine unreachable:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("service_unavailable", "Engine nicht erreichbar", 503);
    }
  }
);
