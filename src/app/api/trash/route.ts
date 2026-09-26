import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import { TRASH_TYPES, toTrashItem, type TrashItem } from "@/lib/trash";
import { getAuditExtra, setAuditExtra } from "@/lib/audit-context";
import { canRestoreCase, restoreCaseDocuments } from "@/lib/case-cascade";
import { reconcileCaseDocuments } from "@/lib/case-documents";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import { withoutStaffOnlyRecords } from "@/lib/staff-only-records";

import { logger } from "@/lib/logger";
const log = logger("api/trash");

export const dynamic = "force-dynamic";

/**
 * Papierkorb — the product surface for the web app's soft-delete model.
 *
 * Deletion in this codebase is frontmatter-based (see
 * src/app/api/pages/[...slug]/route.ts DELETE and src/lib/trash.ts):
 *  - Archived matters (Aktenabschluss) and the pages archived with them are
 *    NOT listed here — they are retained records. POST still restores
 *    (reopens) an archived matter, as the matter page does.
 *  - A matter deleted with `?mode=trash` becomes `status: "tombstoned"`, its
 *    pages `tombstone_reason: "case_deleted"`.
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

/**
 * Pages of one type read for the Papierkorb. The engine cannot filter by
 * status, so active and deleted pages are paged through together (cursor,
 * strict) and filtered here; a type that reaches this bound is reported as
 * `truncated` instead of silently cut.
 */
const TRASH_SCAN_MAX = 50_000;

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
        types.map((type) =>
          listEnginePages(ctx.headers, type, TRASH_SCAN_MAX, {
            includeTombstoned: true,
            strict: true,
          })
        )
      );
      const truncatedTypes = types.filter((_t, i) => batches[i]!.length >= TRASH_SCAN_MAX);
      const seen = new Map<string, TrashItem>();
      for (const pages of batches) {
        for (const page of pages) {
          if (seen.has(page.slug)) continue;
          const item = toTrashItem(page);
          if (item) seen.set(page.slug, item);
        }
      }
      // AML records never reach client accounts, not even from the trash.
      const items = withoutStaffOnlyRecords(ctx.user.role, [...seen.values()]).sort((a, b) =>
        (b.deleted_at ?? "").localeCompare(a.deleted_at ?? "")
      );
      return apiSuccess({
        items,
        ...(truncatedTypes.length > 0 ? { truncated: true, truncated_types: truncatedTypes } : {}),
      });
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

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: restoreSchema,
    audit: (ctx, body) => ({
      action: "case.restore" as const,
      entityType: "page",
      entityId: body.slug,
      details: { via: "trash", ...getAuditExtra(ctx)?.details },
    }),
  },
  async (ctx, body) => {
    // Restoring is the same decision as on the matter page: lawyer/admin only.
    if (!canRestoreCase(ctx.user.role)) {
      return apiError(
        "forbidden",
        "Nur Anwältinnen/Anwälte und Administratoren können Einträge wiederherstellen.",
        403
      );
    }
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
    const isDeletedCase = pageType === "legal_case" && isTombstonedPage;
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
          const parentStatus = (casePage.frontmatter ?? {}).status;
          if (parentStatus === "archived" || parentStatus === "tombstoned") {
            return apiError(
              "parent_archived",
              parentStatus === "archived"
                ? "Die zugehörige Akte ist archiviert. Stellen Sie zuerst die Akte wieder her."
                : "Die zugehörige Akte liegt im Papierkorb. Stellen Sie zuerst die Akte wieder her.",
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
    // A matter restored from the Papierkorb returns to the status it had
    // (an archived matter back into the archive, with its pages).
    const statusBeforeDelete =
      typeof fm.status_before_delete === "string" &&
      fm.status_before_delete &&
      fm.status_before_delete !== "tombstoned"
        ? fm.status_before_delete
        : "open";
    const frontmatter: Record<string, unknown> = isDeletedCase
      ? {
          status: body.status ?? statusBeforeDelete,
          status_before_delete: null,
          restored_at: now,
          restored_by: ctx.user.email,
          tombstoned_at: null,
          tombstoned_by: null,
          tombstone_reason: null,
        }
      : isArchivedCase
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

    // A restored document returns to its matter's document list (deleting it
    // took it off that list). Best effort — the document itself is restored.
    if (isTombstonedPage && caseSlug && pageType === "document") {
      await reconcileCaseDocuments(ctx.headers, caseSlug, {
        id: body.slug,
        slug: body.slug,
        name:
          (typeof fm.source_filename === "string" && fm.source_filename) ||
          (page as { title?: string }).title ||
          body.slug.split("/").pop() ||
          body.slug,
        url: `/api/files/${body.slug}`,
        uploadedAt: typeof fm.uploaded_at === "string" ? fm.uploaded_at : now,
        size: typeof fm.doc_size === "number" ? fm.doc_size : 0,
        kind: "document",
      }).catch((err) => {
        log.warn("[trash] matter document list not updated", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    // Restoring a matter reactivates the documents the archive cascade
    // tombstoned (tombstone_reason === "case_archived"). Manually deleted
    // documents stay deleted — restoring them is a separate, deliberate act.
    let cascaded = 0;
    let cascadeFailed = 0;
    if (isArchivedCase || isDeletedCase) {
      const slugForms = new Set([page.slug, body.slug, path].filter((s): s is string => !!s));
      const cascade = await restoreCaseDocuments(
        ctx.headers,
        slugForms,
        ctx.user.email,
        now,
        isDeletedCase
          ? { fromReason: "case_deleted", backToArchive: frontmatter.status === "archived" }
          : {}
      );
      cascaded = cascade.succeeded;
      cascadeFailed = cascade.failed.length;
      if (cascadeFailed > 0) {
        log.error("[trash] case restore cascade incomplete", { failed: cascadeFailed });
      }
    }

    setAuditExtra(ctx, { details: { cascaded, cascadeFailed } });
    broadcastSseEvent(ctx.brainId, "case.restored", {
      slug: body.slug,
      by: ctx.user.email,
      at: now,
      source: "trash",
    });

    return apiSuccess({
      slug: body.slug,
      status: isArchivedCase ? targetStatus : isDeletedCase ? frontmatter.status : "active",
      cascaded,
      cascadeFailed,
    });
  }
);
