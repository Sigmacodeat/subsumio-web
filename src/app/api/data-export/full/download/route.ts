import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { verifyFirmExportToken } from "@/lib/firm-export-link";
import { logger } from "@/lib/logger";

const log = logger("api/data-export/full/download");

export const dynamic = "force-dynamic";
// A firm archive can be several gigabytes; it streams through, never buffered.
export const maxDuration = 3600;

const querySchema = z.object({ token: z.string().min(10).max(2000) });

/**
 * GET /api/data-export/full/download?token=… — the one download of a
 * finished full firm export. Needs the session of the admin the link was
 * issued to and a valid, unexpired link; the engine lets each export be
 * downloaded once and deletes the archive right after.
 */
export const GET = createHandler(
  {
    action: "admin.data_export",
    rateTier: "heavy",
    query: querySchema,
    // Only a started transfer (200) is recorded; refused links leave no entry.
    audit: (ctx) => ({
      action: "admin.data_export_download" as const,
      entityType: "brain",
      entityId: ctx.brainId,
      details: {
        scope: "full_export",
        exportId: (ctx as unknown as { __exportId?: number }).__exportId,
      },
    }),
  },
  async (ctx, _body, query) => {
    const check = verifyFirmExportToken(query.token, {
      userId: ctx.user.id,
      brainId: ctx.brainId,
    });
    if (!check.ok) {
      return check.reason === "expired"
        ? apiError("link_expired", "Der Download-Link ist abgelaufen", 410)
        : apiError("invalid_link", "Der Download-Link ist ungültig", 403);
    }
    (ctx as unknown as { __exportId?: number }).__exportId = check.exportId;

    let res: Response;
    try {
      res = await fetch(`${ENGINE_URL}/api/firm-export/${check.exportId}/download`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      return apiError("engine_unavailable", "Der Export ist gerade nicht abrufbar", 503);
    }
    if (res.status === 410) {
      await res.body?.cancel();
      return apiError(
        "export_gone",
        "Dieser Export wurde bereits heruntergeladen oder ist abgelaufen. Bitte einen neuen Export anfordern.",
        410
      );
    }
    if (res.status === 403 || res.status === 404) {
      await res.body?.cancel();
      return apiError("invalid_link", "Der Download-Link ist ungültig", 403);
    }
    if (!res.ok || !res.body) {
      await res.body?.cancel();
      log.error("[full-export] download failed", { status: res.status });
      return apiError("engine_error", "Der Export ist gerade nicht abrufbar", 502);
    }
    const headers = new Headers();
    headers.set("Content-Type", "application/zip");
    headers.set(
      "Content-Disposition",
      res.headers.get("content-disposition") ?? 'attachment; filename="kanzlei-export.zip"'
    );
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    const sha = res.headers.get("x-export-sha256");
    if (sha) headers.set("X-Export-Sha256", sha);
    return new Response(res.body, { status: 200, headers });
  }
);
