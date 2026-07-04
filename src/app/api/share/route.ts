import { createHandler } from "@/lib/api-handler";
import { z } from "zod";

const shareSchema = z
  .object({
    text: z.string().max(10_000).optional(),
    url: z.string().url().max(2_000).optional(),
    title: z.string().max(500).optional(),
    caseSlug: z.string().max(200).optional(),
  })
  .refine((data) => data.text || data.url, { message: "Either text or url is required" });

export const POST = createHandler(
  {
    action: "share.receive",
    rateTier: "standard",
    body: shareSchema,
    audit: (ctx, body) => ({
      action: "share.receive" as const,
      entityType: "share",
      entityId: ctx.user.id,
      details: {
        hasText: Boolean(body.text),
        hasUrl: Boolean(body.url),
        title: body.title,
        caseSlug: body.caseSlug,
      },
    }),
  },
  async (ctx, body) => {
    const { text, url, title, caseSlug } = body;

    const shareId = `shr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

    const payload = {
      id: shareId,
      userId: ctx.user.id,
      text: text ?? null,
      url: url ?? null,
      title: title ?? null,
      caseSlug: caseSlug ?? null,
      receivedAt: new Date().toISOString(),
    };

    if (process.env.NODE_ENV !== "production") {
      console.debug(`[share-receive] user=${ctx.user.id} shareId=${shareId}`);
    }

    return Response.json({
      ok: true,
      shareId,
      redirect: caseSlug
        ? `/dashboard/cases/${caseSlug}?shared=${shareId}`
        : `/dashboard?shared=${shareId}`,
    });
  }
);
