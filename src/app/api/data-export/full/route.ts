import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import {
  createFirmExportToken,
  firmExportDownloadUrl,
  type FirmExportView,
} from "@/lib/firm-export-link";
import { createFirmExportReadyNotification } from "@/lib/comments";
import { logger } from "@/lib/logger";

const log = logger("api/data-export/full");

export const dynamic = "force-dynamic";

/**
 * Full firm export (Art. 20 DSGVO, leaving the service) — every entry as JSON
 * and every original file in one ZIP, built in the background by the engine
 * (`firm-export` job) under the requesting admin's matter scope.
 *
 *   POST  start an export (or get the one already running)
 *   GET   the firm's recent exports with progress; a finished export of the
 *         caller carries a signed, single-use download link (≤ 24 h)
 */

export const POST = createHandler(
  {
    action: "admin.data_export",
    rateTier: "heavy",
    // The whole firm's records are about to leave: always in the audit trail.
    audit: (ctx) => ({
      action: "admin.data_export" as const,
      entityType: "brain",
      entityId: ctx.brainId,
      details: { scope: "full_export", step: "requested" },
    }),
  },
  async (ctx) => {
    let res: Response;
    try {
      res = await fetch(`${ENGINE_URL}/api/firm-export`, {
        method: "POST",
        headers: { ...ctx.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ web_brain_id: ctx.brainId }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      return apiError("engine_unavailable", "Der Export konnte nicht gestartet werden", 503);
    }
    if (res.status === 403) {
      return apiError("forbidden", "Nur die Kanzlei-Administration kann exportieren", 403);
    }
    if (!res.ok) {
      log.error("[full-export] start failed", { status: res.status });
      return apiError("engine_error", "Der Export konnte nicht gestartet werden", 502);
    }
    const view = (await res.json()) as FirmExportView & { existing?: boolean };
    return apiSuccess({ export: view, existing: view.existing === true }, undefined, 202);
  }
);

export const GET = createHandler(
  { action: "admin.data_export", rateTier: "standard" },
  async (ctx) => {
    let res: Response;
    try {
      res = await fetch(`${ENGINE_URL}/api/firm-export`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      return apiError("engine_unavailable", "Der Exportstatus ist nicht abrufbar", 503);
    }
    if (res.status === 403) {
      return apiError("forbidden", "Nur die Kanzlei-Administration kann exportieren", 403);
    }
    if (!res.ok) return apiError("engine_error", "Der Exportstatus ist nicht abrufbar", 502);
    const { exports = [] } = (await res.json()) as { exports?: FirmExportView[] };
    const views = await Promise.all(
      exports.map(async (e) => {
        if (e.state !== "ready" || !e.own) return e;
        // Idempotent (one notice per export); the cron sends it when nobody
        // is watching the page.
        await createFirmExportReadyNotification({
          userId: ctx.user.id,
          brainId: ctx.brainId,
          exportId: e.id,
          expiresAt: e.expires_at,
          complete: e.complete === true,
        }).catch(() => undefined);
        const { token, expiresAt } = createFirmExportToken({
          userId: ctx.user.id,
          brainId: ctx.brainId,
          exportId: e.id,
          expiresAt: e.expires_at,
        });
        return { ...e, download_url: firmExportDownloadUrl(token), link_expires_at: expiresAt };
      })
    );
    return apiSuccess({ exports: views });
  }
);
