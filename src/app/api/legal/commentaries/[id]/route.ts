import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

export const dynamic = "force-dynamic";

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
  },
  async (ctx, _body, _query, req) => {
    const { id } = await (req as unknown as { params: Promise<{ id: string }> }).params;
    if (!id) return apiError("validation_error", "Missing commentary id", 400);

    const res = await fetch(`${ENGINE_URL}/api/legal/commentaries/${encodeURIComponent(id)}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      if (res.status === 404) return apiError("not_found", "Commentary not found", 404);
      const text = await res.text().catch(() => "");
      return apiError("engine_error", `Failed to fetch commentary: ${text.slice(0, 200)}`, 502);
    }

    const data = await res.json();
    return Response.json(data);
  }
);

export const DELETE = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    audit: (ctx) => ({
      action: "legal.commentary_synthesize" as const,
      entityType: "legal_commentary",
      details: { by: ctx.user.email, action: "delete" },
    }),
  },
  async (ctx, _body, _query, req) => {
    const { id } = await (req as unknown as { params: Promise<{ id: string }> }).params;
    if (!id) return apiError("validation_error", "Missing commentary id", 400);

    const res = await fetch(`${ENGINE_URL}/api/legal/commentaries/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      if (res.status === 404) return apiError("not_found", "Commentary not found", 404);
      const text = await res.text().catch(() => "");
      return apiError("engine_error", `Failed to delete commentary: ${text.slice(0, 200)}`, 502);
    }

    return Response.json({ success: true });
  }
);
