import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { DMS_PROVIDERS } from "@/lib/dms";
import {
  deleteDmsConfig,
  getDmsConfig,
  saveDmsConfig,
  validateDmsBaseUrl,
} from "@/lib/dms/config-store";
import { logger } from "@/lib/logger";

const log = logger("api/dms/config");

export const dynamic = "force-dynamic";

const optionalId = z.string().trim().max(300).optional().nullable();

const configSchema = z.object({
  provider: z.enum(DMS_PROVIDERS),
  baseUrl: z.string().trim().max(2000).optional().nullable(),
  /** Empty/absent on an update → the stored key is kept. */
  apiKey: z.string().max(8192).optional().nullable(),
  sharepointSiteId: optionalId,
  sharepointDriveId: optionalId,
  boxFolderId: optionalId,
});

const URL_ERRORS: Record<string, string> = {
  invalid_url: "Die DMS-Adresse ist keine gültige URL.",
  https_required: "Die DMS-Adresse muss mit https:// beginnen.",
  credentials_in_url: "Zugangsdaten gehören nicht in die Adresse, sondern in das Schlüssel-Feld.",
  private_host: "Die DMS-Adresse muss ein öffentlich erreichbarer Server sein.",
};

function storeStatus(err: unknown): number {
  const msg = err instanceof Error ? err.message : String(err);
  return msg === "dms_config_database_not_configured" ? 503 : 500;
}

/** The firm's DMS connection — never includes the key. Admins only. */
export const GET = createHandler(
  { action: "settings.write", admin: true, rateTier: "standard" },
  async (ctx) => {
    try {
      return apiSuccess({ config: await getDmsConfig(ctx.brainId) });
    } catch (err) {
      log.error("load failed", err instanceof Error ? err.message : String(err));
      return apiError("load_failed", "DMS-Anbindung konnte nicht geladen werden", storeStatus(err));
    }
  }
);

/** Set up or change the firm's DMS connection. */
export const PUT = createHandler(
  {
    action: "settings.write",
    admin: true,
    rateTier: "standard",
    body: configSchema,
    audit: (_ctx, body) => ({
      action: "dms.config_update" as const,
      entityType: "dms_config",
      // Never the key — only whether a new one was set.
      details: { provider: body.provider, baseUrl: body.baseUrl ?? null, newKey: !!body.apiKey },
    }),
  },
  async (ctx, body) => {
    let baseUrl = "";
    if (body.provider !== "box" || body.baseUrl) {
      if (!body.baseUrl) {
        return apiError("base_url_required", "Bitte die Adresse des DMS angeben.", 400);
      }
      const checked = validateDmsBaseUrl(body.baseUrl);
      if (!checked.ok) {
        return apiError(checked.error, URL_ERRORS[checked.error] ?? "Ungültige Adresse", 400);
      }
      baseUrl = checked.url;
    }
    try {
      const config = await saveDmsConfig(ctx.brainId, ctx.user.id, {
        ...body,
        baseUrl,
        apiKey: body.apiKey?.trim() || null,
      });
      return apiSuccess({ config });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "dms_api_key_required") {
        return apiError("api_key_required", "Bitte den API-Schlüssel des DMS angeben.", 400);
      }
      log.error("save failed", msg);
      return apiError(
        "save_failed",
        "DMS-Anbindung konnte nicht gespeichert werden",
        storeStatus(err)
      );
    }
  }
);

/** Disconnect: removes the stored credentials. Imported documents stay. */
export const DELETE = createHandler(
  {
    action: "settings.write",
    admin: true,
    rateTier: "standard",
    audit: () => ({ action: "dms.config_delete" as const, entityType: "dms_config" }),
  },
  async (ctx) => {
    try {
      const removed = await deleteDmsConfig(ctx.brainId);
      if (!removed) return apiError("not_found", "Keine DMS-Anbindung eingerichtet", 404);
      return apiSuccess({ ok: true });
    } catch (err) {
      log.error("delete failed", err instanceof Error ? err.message : String(err));
      return apiError(
        "delete_failed",
        "DMS-Anbindung konnte nicht entfernt werden",
        storeStatus(err)
      );
    }
  }
);
