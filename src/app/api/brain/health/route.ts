import { createHandler } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    cacheMaxAge: 15,
  },
  async (ctx, _body, _query, _req) => {
    try {
      const res = await fetch(`${ENGINE_URL}/api/health`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return Response.json({
        status: data.status ?? "healthy",
        page_count: data.page_count ?? data.total_pages ?? 0,
        embedding_queue_depth: data.embedding_queue_depth ?? 0,
        last_indexed_at: data.last_indexed_at ?? null,
        vector_index_size: data.vector_index_size ?? null,
        db_size_bytes: data.db_size_bytes ?? null,
      });
    } catch (err) {
      console.error(
        "[brain/health] engine unreachable:",
        err instanceof Error ? err.message : String(err)
      );
      return Response.json(
        {
          status: "unreachable",
          page_count: 0,
          embedding_queue_depth: 0,
          last_indexed_at: null,
        },
        { status: 200 }
      );
    }
  }
);
