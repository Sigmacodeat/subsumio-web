import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { apiSuccess } from "@/lib/api-response";
import {
  CheckoutConflictError,
  listDocumentVersions,
  restoreDocumentVersion,
  VersionError,
} from "@/lib/document-versions.server";
import type { AuditAction } from "@/lib/audit";

const querySchema = z.object({ slug: z.string().min(1) });
const restoreSchema = z.object({
  slug: z.string().min(1),
  version: z.number().int().min(1),
});

export const GET = createHandler(
  { action: "brain.read" as const, rateTier: "standard", query: querySchema },
  async (ctx, _body, query) => {
    try {
      const versions = await listDocumentVersions(ctx.headers, query.slug);
      return apiSuccess(versions);
    } catch (err) {
      if (err instanceof VersionError) {
        return apiError("versions_failed", err.message, 502);
      }
      throw err;
    }
  }
);

export const POST = createHandler(
  {
    action: "brain.write" as const,
    rateTier: "standard",
    body: restoreSchema,
    audit: (_ctx, body) => ({
      action: "legal.doc_restore_version" as unknown as AuditAction,
      entityType: "document",
      entityId: body.slug,
      details: { version: body.version },
    }),
  },
  async (ctx, body) => {
    try {
      const result = await restoreDocumentVersion(ctx.headers, body.slug, body.version, ctx.user);
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
        return apiError("restore_failed", err.message, 400);
      }
      throw err;
    }
  }
);
