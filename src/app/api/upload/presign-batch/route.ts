import { ENGINE_URL } from "@/lib/engine";
import { createHandler } from "@/lib/api-handler";

export const maxDuration = 60;

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    quota: "uploads",
    audit: (ctx, body) => ({
      action: "document.presign_batch" as const,
      entityType: "document",
      details: {
        userId: ctx.user.id,
        file_count: Array.isArray((body as unknown as Record<string, unknown>)?.files)
          ? ((body as unknown as Record<string, unknown>).files as unknown[]).length
          : 0,
      },
    }),
  },
  async (ctx, body, _query, _req) => {
    const upstream = await fetch(`${ENGINE_URL}/api/upload/presign-batch`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  }
);
