import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { apiSuccess } from "@/lib/api-response";
import {
  CheckoutConflictError,
  releaseDocument,
  VersionError,
} from "@/lib/document-versions.server";
import type { AuditAction } from "@/lib/audit";

const schema = z.object({ slug: z.string().min(1) });

export const POST = createHandler(
  {
    action: "brain.write" as const,
    rateTier: "standard",
    body: schema,
    audit: (_ctx, body) => ({
      action: "legal.doc_release" as unknown as AuditAction,
      entityType: "document",
      entityId: body.slug,
    }),
  },
  async (ctx, body) => {
    try {
      await releaseDocument(ctx.headers, body.slug, ctx.user);
      return apiSuccess({ released: true });
    } catch (err) {
      if (err instanceof CheckoutConflictError) {
        return apiError(
          "document_locked",
          "Nur der Inhaber der Sperre oder eine Administration kann freigeben.",
          409
        );
      }
      if (err instanceof VersionError) {
        return apiError("release_failed", err.message, 400);
      }
      throw err;
    }
  }
);
