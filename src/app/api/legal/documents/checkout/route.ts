import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { apiSuccess } from "@/lib/api-response";
import {
  CheckoutConflictError,
  checkoutDocument,
  VersionError,
} from "@/lib/document-versions.server";

const schema = z.object({ slug: z.string().min(1) });

export const POST = createHandler(
  {
    action: "brain.write" as const,
    rateTier: "standard",
    body: schema,
    audit: (_ctx, body) => ({
      action: "legal.doc_checkout" as const,
      entityType: "document",
      entityId: body.slug,
    }),
  },
  async (ctx, body) => {
    try {
      const lock = await checkoutDocument(ctx.headers, body.slug, ctx.user);
      return apiSuccess({ locked: true, lock });
    } catch (err) {
      if (err instanceof CheckoutConflictError) {
        return apiError(
          "document_locked",
          `Dokument ist bei ${err.lock.userEmail || "einem Kollegen"} ausgecheckt.`,
          409
        );
      }
      if (err instanceof VersionError) {
        return apiError("checkout_failed", err.message, 400);
      }
      throw err;
    }
  }
);
