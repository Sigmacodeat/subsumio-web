import { ENGINE_URL } from "@/lib/engine";
import { createHandler } from "@/lib/api-handler";

export const maxDuration = 30;

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    quota: "uploads",
    audit: (ctx, body) => ({
      action: "document.presign" as const,
      entityType: "document",
      details: {
        userId: ctx.user.id,
        filename: String((body as unknown as Record<string, unknown>)?.filename ?? ""),
      },
    }),
  },
  async (ctx, body, _query, req) => {
    const upstream = await fetch(`${ENGINE_URL}/api/upload/presign`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  }
);
