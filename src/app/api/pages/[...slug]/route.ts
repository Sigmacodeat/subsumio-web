import { z } from "zod";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { createHandler, apiError, apiNotFound } from "@/lib/api-handler";
import { logAudit } from "@/lib/audit";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import {
  GUARD_READ_FAILED,
  checkInvoiceWrite,
  guardSecondCheckWrite,
  readCurrentPage,
  rejectionResponse,
} from "@/lib/page-write-guards";
import {
  applyDeadlineWritePolicy,
  checkDeadlinePageDelete,
  isDeadlinePage,
  type DeadlineChangeEvent,
} from "@/lib/deadline-write-policy";
import { logDeadlineEvents } from "@/lib/deadline-audit";

import { logger } from "@/lib/logger";
const log = logger("api/pages/[...slug]");

function buildPath(slug: string[]): string | null {
  if (slug.some((s) => s.includes(".."))) return null;
  return slug.map(encodeURIComponent).join("/");
}

const patchSchema = z
  .object({})
  .passthrough()
  .refine((data) => Object.keys(data).length > 0, { message: "nothing_to_update" });

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
  },
  async (ctx, _body, _query, req) => {
    const path = buildPath(
      (await (req as unknown as { params: Promise<{ slug: string[] }> }).params).slug
    );
    if (!path) return apiError("invalid_slug", "Invalid slug", 400);

    try {
      const res = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 404) return apiNotFound("not_found");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Response.json(await res.json());
    } catch (err) {
      log.error("[pages/...slug] get failed:", err instanceof Error ? err.message : String(err));
      return apiNotFound("not_found");
    }
  }
);

export const PATCH = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: patchSchema,
    audit: (ctx, body) => {
      const slug = (ctx as unknown as { __slug?: string }).__slug;
      return {
        action: "case.update" as const,
        entityType: "page",
        entityId: slug,
        details: { fields: Object.keys(body) },
      };
    },
  },
  async (ctx, body, _query, req) => {
    const slugArr = (await (req as unknown as { params: Promise<{ slug: string[] }> }).params).slug;
    const path = buildPath(slugArr);
    if (!path) return apiError("invalid_slug", "Invalid slug", 400);
    // The engine's merge-update takes the RAW (unencoded) slug in the body;
    // `path` (URL-encoded) is only for the GET/read side.
    const rawSlug = slugArr.join("/");

    // One read of the stored page drives every guard below (version lock,
    // four-eyes, invoice immutability, archive). Fail closed: if the page
    // cannot be read, nothing is written — a guard that is skipped on error
    // is no guard.
    const currentRead = await readCurrentPage(ENGINE_URL, ctx.headers, rawSlug);
    if (currentRead.kind === "error") return rejectionResponse(GUARD_READ_FAILED);
    if (currentRead.kind === "missing") return apiNotFound("not_found");
    const currentPage = currentRead.page;
    const curFm = (currentPage.frontmatter ?? {}) as Record<string, unknown>;

    // Optimistic locking: if client sends If-Match header, verify version
    const ifMatch = req.headers.get("if-match");
    if (ifMatch) {
      const currentVersion = (curFm.version as number | undefined) ?? 0;
      const expectedVersion = parseInt(ifMatch, 10);
      if (currentVersion !== expectedVersion) {
        return Response.json(
          {
            error: "version_conflict",
            message: "Die Seite wurde zwischenzeitlich von einem anderen Nutzer bearbeitet.",
            currentVersion,
            expectedVersion,
          },
          { status: 409 }
        );
      }
    }

    // § 132 BAO / UStG: an issued invoice is frozen — only payment and
    // delivery bookkeeping may change. Corrections go through the Storno-Note.
    const invoiceRejection = checkInvoiceWrite(currentPage, {
      mode: "merge",
      title: body.title,
      content: body.content,
      type: body.type,
      frontmatter:
        body.frontmatter && typeof body.frontmatter === "object"
          ? (body.frontmatter as Record<string, unknown>)
          : undefined,
    });
    if (invoiceRejection) return rejectionResponse(invoiceRejection);

    // Increment version on update
    const patchBody: Record<string, unknown> = { ...body, slug: rawSlug };
    let deadlineEvents: DeadlineChangeEvent[] = [];

    if (patchBody.frontmatter) {
      // Vier-Augen-Kontrolle: second_check_* is stamped only by
      // /api/legal/fristen/second-check. Client values are dropped (stored ones
      // kept), and a Notfrist cannot become done here without that stamp —
      // neither as a standalone deadline page nor inside a matter's list.
      const guarded = guardSecondCheckWrite(
        patchBody.frontmatter as Record<string, unknown>,
        curFm
      );
      if ("reject" in guarded) return rejectionResponse(guarded.reject);
      patchBody.frontmatter = guarded.frontmatter;

      // Fristen: server-stamped identity, Notfrist protection, audit trail.
      const policy = applyDeadlineWritePolicy({
        slug: rawSlug,
        type: patchBody.type ?? currentPage.type,
        incoming: patchBody.frontmatter as Record<string, unknown>,
        current: currentPage,
        user: ctx.user,
      });
      if ("reject" in policy) return rejectionResponse(policy.reject);
      patchBody.frontmatter = policy.frontmatter;
      deadlineEvents = policy.events;

      const fm = patchBody.frontmatter as Record<string, unknown>;
      const isRestore = !!fm.restored_at && fm.status !== "archived";

      // RBAC: Restore requires admin or lawyer role (brain.delete level)
      if (isRestore && ctx.user.role !== "admin" && ctx.user.role !== "lawyer") {
        return Response.json(
          { error: "forbidden", message: "Nur Admins und Anwälte können Akten wiederherstellen." },
          { status: 403 }
        );
      }

      // Server-side guard: block modifications to archived cases unless it's a restore
      if (!isRestore && curFm.status === "archived") {
        return Response.json(
          {
            error: "case_archived",
            message: "Akte ist archiviert — zuerst wiederherstellen, um Änderungen zu speichern.",
          },
          { status: 403 }
        );
      }
    }

    if (patchBody.frontmatter) {
      const fm = patchBody.frontmatter as Record<string, unknown>;
      // Without If-Match the stored version is the base — a client-sent
      // version must not rewind the counter other writers rely on.
      const storedVersion = Number(curFm.version);
      const currentVersion = ifMatch
        ? parseInt(ifMatch, 10)
        : Number.isFinite(storedVersion)
          ? storedVersion
          : 0;
      fm.version = (typeof currentVersion === "number" ? currentVersion : 0) + 1;

      // Restore: append timeline event
      if (fm.restored_at && fm.status && fm.status !== "archived") {
        const existingTimeline = (fm.timeline_events as Array<Record<string, unknown>>) || [];
        fm.timeline_events = [
          ...existingTimeline,
          {
            id: `tl-restore-${Date.now()}`,
            timestamp: new Date().toISOString(),
            type: "status_change",
            title: "Akte wiederhergestellt",
            description: `Wiederhergestellt von ${ctx.user.email}`,
            actor: ctx.user.email,
          },
        ];
      }
    } else if (ifMatch) {
      patchBody.frontmatter = { version: parseInt(ifMatch, 10) + 1 };
    }

    try {
      const res = await enginePatchPage(
        ctx.headers,
        patchBody as { slug: string } & Record<string, unknown>,
        { timeoutMs: 15_000 }
      );
      if (res.status === 404) return apiNotFound("not_found");
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        return Response.json(payload.error ? payload : { error: `Engine returned ${res.status}` }, {
          status: res.status,
        });
      }
      const result = await res.json();
      await logDeadlineEvents(ctx, deadlineEvents);

      // Restore cascade: if the PATCH sets status to a non-archived value
      // and includes restored_at, un-tombstone all linked documents.
      let restoreCascade:
        | {
            attempted: true;
            matched: number;
            succeeded: number;
            failed: Array<{ slug: string; status?: number; error?: string }>;
          }
        | { attempted: false } = { attempted: false };

      const patchedFm = (patchBody.frontmatter ?? {}) as Record<string, unknown>;
      if (patchedFm.restored_at && patchedFm.status && patchedFm.status !== "archived") {
        try {
          const allDocs: Array<{ slug: string; frontmatter?: Record<string, unknown> }> = [];
          let offset = 0;
          const pageSize = 500;
          let fetched: typeof allDocs = [];
          do {
            const docsRes = await fetch(
              `${ENGINE_URL}/api/pages?type=document&limit=${pageSize}&offset=${offset}`,
              {
                headers: ctx.headers,
                signal: AbortSignal.timeout(15_000),
              }
            );
            if (!docsRes.ok) {
              restoreCascade = {
                attempted: true,
                matched: 0,
                succeeded: 0,
                failed: [{ slug: "*", status: docsRes.status }],
              };
              break;
            }
            const raw = await docsRes.json();
            fetched = Array.isArray(raw)
              ? raw
              : Array.isArray(raw?.pages)
                ? raw.pages
                : Array.isArray(raw?.items)
                  ? raw.items
                  : [];
            allDocs.push(...fetched);
            offset += pageSize;
          } while (fetched.length === pageSize);

          if (!restoreCascade.attempted) {
            const caseSlugForms = new Set([path, decodeURIComponent(path)]);
            const tombstoned = allDocs.filter(
              (d) =>
                caseSlugForms.has((d.frontmatter ?? {}).case_slug as string) &&
                (d.frontmatter ?? {}).status === "tombstoned"
            );
            const UNTOMBSTONE_BATCH = 5;
            const untombstones: Array<{
              slug: string;
              ok: boolean;
              status?: number;
              error?: string;
            }> = [];
            for (let i = 0; i < tombstoned.length; i += UNTOMBSTONE_BATCH) {
              const batch = tombstoned.slice(i, i + UNTOMBSTONE_BATCH);
              const batchResults = await Promise.all(
                batch.map(async (doc) => {
                  try {
                    const untombstoneRes = await enginePatchPage(
                      ctx.headers,
                      {
                        slug: doc.slug,
                        frontmatter: {
                          status: "active",
                          tombstoned_at: null,
                          tombstone_reason: null,
                        },
                      },
                      { timeoutMs: 15_000 }
                    );
                    return untombstoneRes.ok
                      ? { slug: doc.slug, ok: true as const }
                      : { slug: doc.slug, ok: false as const, status: untombstoneRes.status };
                  } catch (err) {
                    return {
                      slug: doc.slug,
                      ok: false as const,
                      error: err instanceof Error ? err.message : String(err),
                    };
                  }
                })
              );
              untombstones.push(...batchResults);
            }
            const failed = untombstones
              .filter((r) => !r.ok)
              .map(({ slug, status, error }) => ({ slug, status, error }));
            restoreCascade = {
              attempted: true,
              matched: tombstoned.length,
              succeeded: untombstones.length - failed.length,
              failed,
            };
          }
        } catch (err) {
          log.error(
            "[pages/...slug] restore cascade failed:",
            err instanceof Error ? err.message : String(err)
          );
          restoreCascade = {
            attempted: true,
            matched: 0,
            succeeded: 0,
            failed: [{ slug: "*", error: err instanceof Error ? err.message : String(err) }],
          };
        }
      }

      // B3: Server-side conflict check when client_name or opponent_name is
      // explicitly included in the PATCH body. Using body.frontmatter (not
      // patchBody.frontmatter) avoids running the check on every auto-save
      // that happens to include these fields in the merged frontmatter.
      let conflictWarning:
        | { checked: boolean; matches?: Array<{ name: string; slug: string; type: string }> }
        | undefined;
      const bodyFm = (body.frontmatter ?? {}) as Record<string, unknown>;
      const namesToCheck = [bodyFm.client_name, bodyFm.opponent_name].filter(
        (n): n is string => typeof n === "string" && n.trim().length > 0
      );
      if (namesToCheck.length > 0) {
        try {
          const conflicts: Array<{ name: string; slug: string; type: string }> = [];
          const decodedPath = decodeURIComponent(path);
          for (const name of namesToCheck) {
            const checkRes = await fetch(`${ENGINE_URL}/api/legal/conflict-check`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...ctx.headers },
              body: JSON.stringify({ name }),
              signal: AbortSignal.timeout(15_000),
            });
            if (checkRes.ok) {
              const checkData = (await checkRes.json()) as {
                matches?: Array<{ name: string; slug: string; type: string }>;
              };
              if (checkData.matches?.length) {
                // B3 FIX: Exclude self-match — the case being patched
                // shouldn't trigger a conflict warning against itself.
                conflicts.push(
                  ...checkData.matches
                    .filter((m) => m.slug !== path && m.slug !== decodedPath)
                    .map((m) => ({ name: m.name, slug: m.slug, type: m.type }))
                );
              }
            }
          }
          conflictWarning = {
            checked: true,
            matches: conflicts.length > 0 ? conflicts : undefined,
          };
        } catch {
          conflictWarning = { checked: false };
        }
      }

      // Audit log + SSE for restore operations
      if (patchedFm.restored_at && patchedFm.status && patchedFm.status !== "archived") {
        void logAudit("case.restore", "page", {
          entityId: path,
          details: {
            userId: ctx.user.id,
            userEmail: ctx.user.email,
            restoredAt: patchedFm.restored_at,
          },
        });
        broadcastSseEvent(ctx.brainId, "case.restored", {
          slug: path,
          by: ctx.user.email,
          at: new Date().toISOString(),
        });
      } else {
        broadcastSseEvent(ctx.brainId, "case.updated", {
          slug: path,
          by: ctx.user.email,
          at: new Date().toISOString(),
        });
      }
      const partialFailure = restoreCascade.attempted && restoreCascade.failed.length > 0;
      return Response.json(
        { ...result, conflictWarning, restoreCascade },
        { status: partialFailure ? 207 : 200 }
      );
    } catch (err) {
      log.error("[pages/...slug] patch failed:", err instanceof Error ? err.message : String(err));
      return apiError("engine_unreachable", "Seite nicht aktualisierbar", 503);
    }
  }
);

export const DELETE = createHandler(
  {
    action: "brain.delete",
    rateTier: "standard",
    audit: (ctx) => {
      const slug = (ctx as unknown as { __slug?: string }).__slug;
      return {
        action: "case.delete" as const,
        entityType: "page",
        entityId: slug,
        details: { method: "soft_delete" },
      };
    },
  },
  async (ctx, _body, _query, req) => {
    const slugArr = (await (req as unknown as { params: Promise<{ slug: string[] }> }).params).slug;
    const path = buildPath(slugArr);
    if (!path) return apiError("invalid_slug", "Invalid slug", 400);

    // RBAC: only admin and lawyer can archive cases
    if (ctx.user.role !== "admin" && ctx.user.role !== "lawyer") {
      return Response.json(
        { error: "forbidden", message: "Sie haben keine Berechtigung, Akten zu archivieren." },
        { status: 403 }
      );
    }

    // Engine stamps the raw (decoded) slug as case_slug on documents; path is URL-encoded.
    const decodedSlug = slugArr.join("/");

    try {
      // B1: Soft-delete (archive) instead of hard DELETE — GoBD compliance
      // 1. Fetch the case page to check if it's a legal_case
      const getRes = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (getRes.status === 404) return apiNotFound("not_found");
      if (!getRes.ok) throw new Error(`HTTP ${getRes.status}`);
      const casePage = (await getRes.json()) as {
        slug?: string;
        type?: string;
        frontmatter?: Record<string, unknown>;
      };
      const fm = (casePage.frontmatter ?? {}) as Record<string, unknown>;
      // `type` is a top-level page field (set on POST), not frontmatter.
      // Fall back to fm.type for engine versions that mirror it into frontmatter.
      const pageType = casePage.type ?? (fm.type as string | undefined);

      // An issued invoice (sent/paid/overdue/cancelled) is never deleted —
      // § 132 BAO retention; corrections go through the Storno-Note.
      const invoiceRejection = checkInvoiceWrite(casePage, { mode: "delete" });
      if (invoiceRejection) return rejectionResponse(invoiceRejection);

      // A live Notfrist is never deleted — it is cancelled with a reason.
      const deadlinePage = isDeadlinePage(pageType, fm.type, decodedSlug);
      if (deadlinePage) {
        const notfristRejection = checkDeadlinePageDelete(
          fm,
          (casePage as { title?: string }).title
        );
        if (notfristRejection) return rejectionResponse(notfristRejection);
      }

      // Guard: already archived — return 409 to prevent double-archive
      if (pageType === "legal_case" && fm.status === "archived") {
        return Response.json(
          { error: "already_archived", message: "Akte ist bereits archiviert." },
          { status: 409 }
        );
      }

      // Guard: legal hold — block deletion/archiving when legal_hold is active
      if (pageType === "legal_case" && fm.legal_hold === true) {
        return Response.json(
          {
            error: "legal_hold_active",
            message:
              "Akte steht unter Legal Hold und kann nicht gelöscht oder archiviert werden. Heben Sie den Legal Hold zuerst auf.",
          },
          { status: 423 }
        );
      }

      // Set of slug forms that documents may reference as their case_slug.
      const caseSlugForms = new Set(
        [casePage.slug, decodedSlug, path].filter((s): s is string => !!s)
      );
      let cascade:
        | {
            attempted: true;
            matched: number;
            succeeded: number;
            failed: Array<{ slug: string; status?: number; error?: string }>;
          }
        | { attempted: false } = { attempted: false };

      if (pageType === "legal_case") {
        // Build timeline event for archive
        const existingTimeline = (fm.timeline_events as Array<Record<string, unknown>>) || [];
        const archiveTimeline = [
          ...existingTimeline,
          {
            id: `tl-archive-${Date.now()}`,
            timestamp: new Date().toISOString(),
            type: "status_change",
            title: "Akte archiviert",
            description: `Archiviert von ${ctx.user.email}`,
            actor: ctx.user.email,
          },
        ];

        // 2. Archive the case (soft-delete). The engine has no PATCH/If-Match;
        //    merge-update overlays just these keys (status guarded above).
        const archiveRes = await enginePatchPage(
          ctx.headers,
          {
            slug: decodedSlug,
            frontmatter: {
              status: "archived",
              archived_at: new Date().toISOString(),
              archived_by: ctx.user.email,
              portal_enabled: false,
              timeline_events: archiveTimeline,
            },
          },
          { timeoutMs: 15_000 }
        );
        if (!archiveRes.ok)
          throw new Error(`Archive merge-update failed: HTTP ${archiveRes.status}`);

        // 3. Tombstone all documents whose frontmatter case_slug matches this case.
        //    NOTE: the engine does NOT filter by case_slug query param — it returns
        //    all pages of the given type. We must filter client-side (same pattern
        //    as fetchCaseDocumentsBySlug in matter-context.ts). The response may be
        //    a bare array, { pages }, or { items } depending on engine version.
        try {
          const allDocs: Array<{ slug: string; frontmatter?: Record<string, unknown> }> = [];
          let offset = 0;
          const pageSize = 500;
          let fetched: typeof allDocs = [];
          do {
            const docsRes = await fetch(
              `${ENGINE_URL}/api/pages?type=document&limit=${pageSize}&offset=${offset}`,
              {
                headers: ctx.headers,
                signal: AbortSignal.timeout(15_000),
              }
            );
            if (!docsRes.ok) {
              cascade = {
                attempted: true,
                matched: 0,
                succeeded: 0,
                failed: [{ slug: "*", status: docsRes.status }],
              };
              break;
            }
            const raw = await docsRes.json();
            fetched = Array.isArray(raw)
              ? raw
              : Array.isArray(raw?.pages)
                ? raw.pages
                : Array.isArray(raw?.items)
                  ? raw.items
                  : [];
            allDocs.push(...fetched);
            offset += pageSize;
          } while (fetched.length === pageSize);

          if (!cascade.attempted) {
            const matched = allDocs.filter((d) =>
              caseSlugForms.has((d.frontmatter ?? {}).case_slug as string)
            );
            const TOMBSTONE_BATCH = 5;
            const tombstones: Array<{
              slug: string;
              ok: boolean;
              status?: number;
              error?: string;
            }> = [];
            for (let i = 0; i < matched.length; i += TOMBSTONE_BATCH) {
              const batch = matched.slice(i, i + TOMBSTONE_BATCH);
              const batchResults = await Promise.all(
                batch.map(async (doc) => {
                  try {
                    const tombstoneRes = await enginePatchPage(
                      ctx.headers,
                      {
                        slug: doc.slug,
                        frontmatter: {
                          status: "tombstoned",
                          tombstoned_at: new Date().toISOString(),
                          tombstoned_by: ctx.user.email,
                          tombstone_reason: "case_archived",
                        },
                      },
                      { timeoutMs: 15_000 }
                    );
                    return tombstoneRes.ok
                      ? { slug: doc.slug, ok: true as const }
                      : { slug: doc.slug, ok: false as const, status: tombstoneRes.status };
                  } catch (err) {
                    return {
                      slug: doc.slug,
                      ok: false as const,
                      error: err instanceof Error ? err.message : String(err),
                    };
                  }
                })
              );
              tombstones.push(...batchResults);
            }
            const failed = tombstones
              .filter((result) => !result.ok)
              .map(({ slug, status, error }) => ({ slug, status, error }));
            cascade = {
              attempted: true,
              matched: matched.length,
              succeeded: tombstones.length - failed.length,
              failed,
            };
          }
        } catch (err) {
          log.error(
            "[pages/...slug] cascade tombstone failed:",
            err instanceof Error ? err.message : String(err)
          );
          cascade = {
            attempted: true,
            matched: 0,
            succeeded: 0,
            failed: [{ slug: "*", error: err instanceof Error ? err.message : String(err) }],
          };
        }
      } else {
        // Non-case pages: check if document belongs to a case with legal_hold
        const docCaseSlug = fm.case_slug as string | undefined;
        if (docCaseSlug) {
          try {
            const caseRes = await fetch(
              `${ENGINE_URL}/api/pages/${encodeURIComponent(docCaseSlug)}`,
              {
                headers: ctx.headers,
                signal: AbortSignal.timeout(5_000),
              }
            );
            if (caseRes.ok) {
              const caseData = (await caseRes.json()) as { frontmatter?: Record<string, unknown> };
              const caseFm = caseData.frontmatter ?? {};
              if (caseFm.legal_hold === true) {
                return Response.json(
                  {
                    error: "legal_hold_active",
                    message:
                      "Dokument gehört zu einer Akte mit Legal Hold und kann nicht gelöscht werden.",
                  },
                  { status: 423 }
                );
              }
            }
          } catch {
            // If case lookup fails, proceed with deletion
          }
        }
        // Non-case pages: the engine exposes no DELETE route, so soft-delete by
        // tombstoning via merge-update (the document then drops out of every
        // case_slug-scoped listing, which filters `status !== "tombstoned"`).
        const delRes = await enginePatchPage(
          ctx.headers,
          {
            slug: decodedSlug,
            frontmatter: {
              status: "tombstoned",
              tombstoned_at: new Date().toISOString(),
              tombstoned_by: ctx.user.email,
              tombstone_reason: "manual_delete",
              assignment_status: "unassigned",
            },
          },
          { timeoutMs: 10_000 }
        );
        if (delRes.status === 404) return apiNotFound("not_found");
        if (!delRes.ok) throw new Error(`HTTP ${delRes.status}`);
      }

      if (deadlinePage) {
        await logDeadlineEvents(ctx, [
          {
            kind: "delete",
            deadline_id: decodedSlug,
            title: String(
              fm.title ?? fm.description ?? (casePage as { title?: string }).title ?? ""
            ),
            is_notfrist: fm.is_notfrist === true || fm.second_check_required === true,
            due_date_before: typeof fm.due_date === "string" ? fm.due_date : null,
            due_date_after: null,
            status_before: typeof fm.status === "string" ? fm.status : null,
            status_after: "tombstoned",
          },
        ]);
      }
      void logAudit(pageType === "legal_case" ? "case.delete" : "document.delete", "page", {
        entityId: path,
        details: {
          userId: ctx.user.id,
          method: pageType === "legal_case" ? "soft_delete" : "hard_delete",
        },
      });
      broadcastSseEvent(ctx.brainId, "case.deleted", {
        slug: path,
        by: ctx.user.email,
        at: new Date().toISOString(),
        method: pageType === "legal_case" ? "archived" : "deleted",
      });
      return Response.json(
        {
          ok: !cascade.attempted || cascade.failed.length === 0,
          method: pageType === "legal_case" ? "archived" : "deleted",
          cascade,
        },
        { status: cascade.attempted && cascade.failed.length > 0 ? 207 : 200 }
      );
    } catch (e) {
      log.error("[pages/...slug] delete failed:", e instanceof Error ? e.message : String(e));
      return apiError("engine_unreachable", "Seite nicht löschbar", 503);
    }
  }
);
