import { createHandler } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

export const maxDuration = 30;

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    cacheMaxAge: 10,
  },
  async (ctx, _body, _query, _req) => {
    try {
      const res = await fetch(`${ENGINE_URL}/api/pipeline/list`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return Response.json({ pipelines: data.pipelines ?? [] });
    } catch (err) {
      console.error(
        "[pipeline/list] engine unreachable:",
        err instanceof Error ? err.message : String(err)
      );
      return Response.json({ pipelines: [] }, { status: 200 });
    }
  }
);
