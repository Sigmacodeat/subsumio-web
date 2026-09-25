import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { apiSuccess } from "@/lib/api-response";
import {
  checkinDocument,
  CheckoutConflictError,
  VersionError,
} from "@/lib/document-versions.server";

const schema = z.object({
  slug: z.string().min(1),
  note: z.string().max(500).optional(),
  content: z.string().max(500_000).optional(),
});

export const POST = createHandler(
  {
    action: "brain.write" as const,
    rateTier: "standard",
    body: schema,
    audit: (_ctx, body) => ({
      action: "legal.doc_checkin" as const,
      entityType: "document",
      entityId: body.slug,
      details: { note: body.note },
    }),
  },
  async (ctx, body) => {
    try {
      const result = await checkinDocument(ctx.headers, body.slug, ctx.user, {
        note: body.note,
        content: body.content,
      });
      return apiSuccess(result);
    } catch (err) {
      if (err instanceof CheckoutConflictError) {
        return apiError(
          "document_locked",
          `Dokument ist bei ${err.lock.userEmail || "einem Kollegen"} ausgecheckt.`,
          409
        );
      }
      if (err instanceof VersionError) {
        return apiError("checkin_failed", err.message, 400);
      }
      throw err;
    }
  }
);
