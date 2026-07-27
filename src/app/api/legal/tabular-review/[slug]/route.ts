import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

export const dynamic = "force-dynamic";

function decodedSlug(raw: string): string | null {
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.includes("..")) return null;
    return decoded;
  } catch {
    return null;
  }
}

// Read-only status poll for an async tabular review run. No quota: polling
// costs no LLM calls; the run itself was booked at start time.
export const GET = createHandler(
  {
    action: "legal.tabular",
    rateTier: "standard",
  },
  async (ctx, _body, _query, req) => {
    const { slug: rawSlug } = await (req as unknown as { params: Promise<{ slug: string }> })
      .params;
    const slug = decodedSlug(rawSlug);
    if (!slug) return apiError("invalid_slug", "Ungültiger Slug", 400);

    try {
      const upstream = await fetch(
        `${ENGINE_URL}/api/legal/tabular-review/${encodeURIComponent(slug)}`,
        {
          headers: ctx.headers,
          signal: AbortSignal.timeout(15_000),
        }
      );
      const payload = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
      if (!upstream.ok) {
        return Response.json(
          payload.error ? payload : { error: `Engine returned ${upstream.status}` },
          { status: upstream.status }
        );
      }
      return Response.json(payload);
    } catch (err) {
      console.error(
        "[tabular-review/status] engine unreachable:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("service_unavailable", "Engine nicht erreichbar", 503);
    }
  }
);
