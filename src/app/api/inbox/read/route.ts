import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";

export const dynamic = "force-dynamic";

const markReadSchema = z.object({
  slug: z.string().min(1).max(300),
  read: z.boolean().default(true),
});

export const PATCH = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: markReadSchema,
    audit: (_ctx, body) => ({
      action: "inbox.mark_read" as const,
      entityType: "inbox_message",
      entityId: body.slug,
      details: { read: body.read },
    }),
  },
  async (ctx, body) => {
    const headers = {
      "Content-Type": "application/json",
      ...ctx.headers,
    };

    let existing: Record<string, unknown> | null = null;
    try {
      const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(body.slug)}`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        existing = await res.json();
      }
    } catch {
      // ignore — we'll try to update anyway
    }

    if (!existing) {
      return apiError("not_found", "Message not found", 404);
    }

    const fm = (existing.frontmatter ?? {}) as Record<string, unknown>;
    const updatedFm = { ...fm, read: body.read, updated_at: new Date().toISOString() };

    // The engine has no PATCH route for pages — merge writes are POST + merge.
    const res = await enginePatchPage(
      headers,
      {
        slug: body.slug,
        frontmatter: updatedFm,
      },
      { timeoutMs: 10_000 }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return apiError("update_failed", text || `engine returned ${res.status}`, 502);
    }

    return apiSuccess({ slug: body.slug, read: body.read });
  }
);
