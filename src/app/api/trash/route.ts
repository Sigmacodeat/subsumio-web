import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import { TRASH_TYPES, toTrashItem, type TrashItem } from "@/lib/trash";
import { logAudit } from "@/lib/audit";
import { broadcastSseEvent } from "@/lib/realtime-bus";

import { logger } from "@/lib/logger";
const log = logger("api/trash");

export const dynamic = "force-dynamic";

/**
 * Papierkorb — the product surface for the web app's soft-delete model.
 *
 * Deletion in this codebase is frontmatter-based (see
 * src/app/api/pages/[...slug]/route.ts DELETE):
 *  - legal_case pages become `status: "archived"` (+ archived_at/archived_by)
 *    and their documents are cascade-tombstoned with
 *    `tombstone_reason: "case_archived"`.
 *  - every other page becomes `status: "tombstoned"`
 *    (+ tombstoned_at, tombstone_reason, assignment_status reset).
 *
 * The engine's own `deleted_at` soft-delete + 72h purge is a separate ops
 * surface (CLI/MCP only — `purge_deleted_pages` is `localOnly` and not
 * reachable over HTTP). Nothing in the web trash auto-expires; restoring a
 * frontmatter tombstone expires after the firm's configured retention
 * (kanzlei settings → trashRetentionDays, default 30): /api/cron/trash-purge
 * then hands the page to the engine's own 72h soft-delete → autopilot purge.
 * Legal-hold items never expire.
 */
const querySchema = z.object({
  type: z.string().trim().max(80).optional(),
});

export type { TrashItem };

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    try {
      const types = query?.type ? [query.type] : TRASH_TYPES;
      const batches = await Promise.all(
        types.map((type) => listEnginePages(ctx.headers, type, 5000, { includeTombstoned: true }))
      );
      const seen = new Map<string, TrashItem>();
      for (const pages of batches) {
        for (const page of pages) {
          if (seen.has(page.slug)) continue;
          const item = toTrashItem(page);
          if (item) seen.set(page.slug, item);
        }
      }
      const items = [...seen.values()].sort((a, b) =>
        (b.deleted_at ?? "").localeCompare(a.deleted_at ?? "")
      );
      return apiSuccess({ items });
    } catch (err) {
      log.error("[trash] list failed:", err instanceof Error ? err.message : String(err));
      return apiError("engine_unreachable", "Papierkorb konnte nicht geladen werden", 503);
    }
  }
);

const restoreSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .refine((s) => !s.includes("..") && !s.includes("//"), "invalid_slug"),
  /** Target status for archived matters — the state machine only allows
   *  archived → open | dormant (src/lib/case-status.ts). Default: open. */
  status: z.enum(["open", "dormant"]).optional(),
});

const RESTORE_BATCH = 5;

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: restoreSchema,
    audit: (ctx, body) => ({
      action: "case.restore" as const,
      entityType: "page",
      entityId: body.slug,
      details: { via: "trash" },
    }),
  },
  async (ctx, body) => {
    const path = body.slug.split("/").map(encodeURIComponent).join("/");

    const getRes = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (getRes.status === 404) return apiError("not_found", "Element nicht gefunden", 404);
    if (!getRes.ok) {
      log.error("[trash] restore lookup failed", { status: getRes.status });
      return apiError("engine_unreachable", "Element konnte nicht gelesen werden", 503);
    }

    const page = (await getRes.json()) as {
      slug?: string;
      type?: string;
      frontmatter?: Record<string, unknown>;
    };
    const fm = page.frontmatter ?? {};
    const pageType = page.type ?? (fm.type as string | undefined);
    const isArchivedCase = pageType === "legal_case" && fm.status === "archived";
    const isTombstonedPage = fm.status === "tombstoned";
    if (!isArchivedCase && !isTombstonedPage) {
      return apiError("not_deleted", "Dieses Element befindet sich nicht im Papierkorb", 409);
    }

    // A tombstoned document whose matter is still archived would restore into
    // an invisible parent — restore the matter first instead.
    const caseSlug = fm.case_slug as string | undefined;
    if (isTombstonedPage && caseSlug) {
      try {
        const caseRes = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(caseSlug)}`, {
          headers: ctx.headers,
          signal: AbortSignal.timeout(5_000),
        });
        if (caseRes.ok) {
          const casePage = (await caseRes.json()) as { frontmatter?: Record<string, unknown> };
          if ((casePage.frontmatter ?? {}).status === "archived") {
            return apiError(
              "parent_archived",
              "Die zugehörige Akte ist archiviert. Stellen Sie zuerst die Akte wieder her.",
              409
            );
          }
        }
      } catch {
        // Best-effort dependency check; the item's own state was verified above.
      }
    }

    const now = new Date().toISOString();
    const targetStatus = body.status ?? "open";
    // Merge semantics: a `null` value removes the frontmatter key.
    const frontmatter: Record<string, unknown> = isArchivedCase
      ? {
          status: targetStatus,
          restored_at: now,
          restored_by: ctx.user.email,
          archived_at: null,
          archived_by: null,
        }
      : {
          status: null,
          restored_at: now,
          restored_by: ctx.user.email,
          tombstoned_at: null,
          tombstoned_by: null,
          tombstone_reason: null,
          assignment_status: caseSlug
            ? "assigned"
            : fm.tombstone_reason === "manual_delete"
              ? "pending_assignment"
              : fm.assignment_status,
        };

    const patchRes = await enginePatchPage(
      ctx.headers,
      { slug: body.slug, frontmatter },
      { timeoutMs: 15_000 }
    );
    if (patchRes.status === 404) return apiError("not_found", "Element nicht gefunden", 404);
    if (!patchRes.ok) {
      log.error("[trash] restore failed", { status: patchRes.status });
      return apiError("engine_unreachable", "Element konnte nicht wiederhergestellt werden", 503);
    }

    // Restoring a matter reactivates the documents the archive cascade
    // tombstoned (tombstone_reason === "case_archived"). Manually deleted
    // documents stay deleted — restoring them is a separate, deliberate act.
    let cascaded = 0;
    let cascadeFailed = 0;
    if (isArchivedCase) {
      try {
        const slugForms = new Set([page.slug, body.slug, path].filter((s): s is string => !!s));
        const docs = await listEnginePages(ctx.headers, "document", 10_000, {
          includeTombstoned: true,
        });
        const matched = docs.filter((d) => {
          const dfm = d.frontmatter ?? {};
          return (
            dfm.status === "tombstoned" &&
            dfm.tombstone_reason === "case_archived" &&
            slugForms.has(dfm.case_slug as string)
          );
        });
        for (let i = 0; i < matched.length; i += RESTORE_BATCH) {
          const results = await Promise.all(
            matched.slice(i, i + RESTORE_BATCH).map(async (doc) => {
              const res = await enginePatchPage(
                ctx.headers,
                {
                  slug: doc.slug,
                  frontmatter: {
                    status: null,
                    restored_at: now,
                    restored_by: ctx.user.email,
                    tombstoned_at: null,
                    tombstoned_by: null,
                    tombstone_reason: null,
                  },
                },
                { timeoutMs: 15_000 }
              );
              return res.ok;
            })
          );
          for (const ok of results) {
            if (ok) cascaded++;
            else cascadeFailed++;
          }
        }
      } catch (err) {
        log.error(
          "[trash] case restore cascade failed:",
          err instanceof Error ? err.message : String(err)
        );
        cascadeFailed++;
      }
    }

    void logAudit("case.restore", "page", {
      brainId: ctx.brainId,
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      entityId: body.slug,
      details: { via: "trash", userId: ctx.user.id, cascaded, cascadeFailed },
    });
    broadcastSseEvent(ctx.brainId, "case.restored", {
      slug: body.slug,
      by: ctx.user.email,
      at: now,
      source: "trash",
    });

    return apiSuccess({
      slug: body.slug,
      status: isArchivedCase ? targetStatus : "active",
      cascaded,
      cascadeFailed,
    });
  }
);
