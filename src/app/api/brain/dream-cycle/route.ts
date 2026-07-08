import { createHandler } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "expensive",
  },
  async (ctx) => {
    const response = await fetch(`${ENGINE_URL}/api/admin/dream`, {
      method: "POST",
      headers: ctx.headers,
      signal: AbortSignal.timeout(280_000),
    });
    if (!response.ok) {
      return Response.json({ error: "dream_cycle_failed" }, { status: response.status });
    }
    const result = (await response.json()) as Record<string, unknown>;
    return Response.json(result);
  }
);
