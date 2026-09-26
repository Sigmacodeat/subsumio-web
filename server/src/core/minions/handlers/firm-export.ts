/**
 * `firm-export` Minion job — the asynchronous full export of a firm
 * (core/firm-export.ts). Submitted only by the trusted web-api start route
 * (POST /api/firm-export) after it checked that the caller is an admin; the
 * route stamps the tenant (`_source_id`), the admin (`user_id`) and the
 * admin's matter scope and ACL groups, and every page is read under exactly
 * that posture.
 *
 * Progress goes to the job's progress column (polled by the settings page);
 * the result (archive path, counts, expiry) is the job result. A retry starts
 * over with a fresh archive; a failed attempt removes its partial archive.
 */
import { join } from "node:path";
import type { MinionJobContext } from "../types.ts";
import { UnrecoverableError } from "../types.ts";
import type { BrainEngine } from "../../engine.ts";
import { JOB_MATTER_SCOPE_KEY, readJobMatterAccess } from "../../matter-access.ts";

export interface FirmExportJobData {
  _source_id?: string;
  user_id?: string;
  acl_groups?: string[] | "all";
  web_brain_id?: string;
}

export function makeFirmExportHandler(opts: { engine: BrainEngine }) {
  const engine = opts.engine;
  return async function firmExportHandler(ctx: MinionJobContext): Promise<Record<string, unknown>> {
    const data = (ctx.data ?? {}) as FirmExportJobData & Record<string, unknown>;
    const sourceId = typeof data._source_id === "string" ? data._source_id : "";
    if (!sourceId || sourceId === "default") {
      throw new UnrecoverableError("firm-export: data._source_id is required");
    }
    if (typeof data.user_id !== "string" || !data.user_id) {
      throw new UnrecoverableError("firm-export: data.user_id is required");
    }
    // The scope stamp must be present: an export without the requester's
    // walls would widen to the whole tenant.
    if (!(JOB_MATTER_SCOPE_KEY in data)) {
      throw new UnrecoverableError("firm-export: matter scope stamp missing");
    }
    const matterScope = readJobMatterAccess(data).scope ?? [];
    const aclGroups =
      data.acl_groups === "all" ||
      (Array.isArray(data.acl_groups) && data.acl_groups.every((g) => typeof g === "string"))
        ? data.acl_groups
        : [];
    const userId = data.user_id;

    const { invokeOp } = await import("../../../commands/web-api.ts");
    const { loadConfig, configDir } = await import("../../config.ts");
    const { resolveStorageConfig, storageConfigFromEnv } = await import("../../file-store.ts");
    const { createStorage, createRawStorage } = await import("../../storage.ts");
    const { loadKeyring } = await import("../../file-encryption.ts");
    const { buildFirmExport } = await import("../../firm-export.ts");

    const storageConfig = resolveStorageConfig(loadConfig()?.storage ?? storageConfigFromEnv());
    const result = await buildFirmExport({
      engine,
      sourceId,
      exportId: `${ctx.id}-${ctx.attempts_made}`,
      matterScope,
      listPages: async (cursor) => {
        const raw = (await invokeOp(
          engine,
          "list_pages",
          { limit: 100, sort: "updated_desc", envelope: true, ...(cursor ? { cursor } : {}) },
          sourceId,
          undefined,
          matterScope,
          aclGroups,
          userId
        )) as { pages?: Array<{ slug: string }>; has_more?: boolean; next_cursor?: string | null };
        return {
          pages: Array.isArray(raw?.pages) ? raw.pages : [],
          has_more: raw?.has_more === true,
          next_cursor: raw?.next_cursor ?? null,
        };
      },
      readPage: async (slug) => {
        try {
          const page = await invokeOp(
            engine,
            "get_page",
            { slug },
            sourceId,
            undefined,
            matterScope,
            aclGroups,
            userId
          );
          return page && typeof page === "object" ? (page as Record<string, unknown>) : null;
        } catch {
          return null;
        }
      },
      storage: await createStorage(storageConfig),
      rawStorage: await createRawStorage(storageConfig),
      keyring: loadKeyring(),
      workDir: join(configDir(), "tmp", "firm-export"),
      signal: ctx.signal,
      onProgress: (p) => ctx.updateProgress(p),
    });
    return { ...result };
  };
}
