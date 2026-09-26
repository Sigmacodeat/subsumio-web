import { z } from "zod";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { createHandler, apiError, apiNotFound } from "@/lib/api-handler";
import { getAuditExtra, setAuditExtra, slugFromRoutePath } from "@/lib/audit-context";
import {
  archiveCaseDocuments,
  restoreCaseDocuments,
  tombstoneCaseDocuments,
} from "@/lib/case-cascade";
import {
  caseRetentionState,
  caseRetentionUntil,
  retentionRunningMessage,
} from "@/lib/case-retention";
import { removeFromCaseDocuments } from "@/lib/case-documents";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import {
  GUARD_READ_FAILED,
  checkInvoiceWrite,
  checkSignedDocumentWrite,
  guardProtectedPageWrite,
  isInvoicePage,
  guardSecondCheckWrite,
  isKanzleiSettingsTarget,
  readCurrentPage,
  rejectionResponse,
} from "@/lib/page-write-guards";
import {
  canWaiveConflict,
  checkPartiesConflicts,
  matterParties,
  type MatterConflictOutcome,
} from "@/lib/conflict-gate";
import { checkBilledEntriesWrite, checkInvoiceGenericWrite } from "@/lib/billing-write-guards";
import { releaseWorkOfInvoice } from "@/lib/invoice-billing-lock";
import { redactPageSecrets, sealKanzleiSettingsFrontmatter } from "@/lib/kanzlei-settings-secrets";
import { can } from "@/lib/permissions";
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

function storedVersion(fm: Record<string, unknown>): number {
  const v = fm.version;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
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
      return Response.json(redactPageSecrets(await res.json()));
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
    audit: (ctx, body, _query, req) => {
      const extra = getAuditExtra(ctx);
      return {
        action: extra?.action ?? ("case.update" as const),
        entityType: "page",
        entityId: extra?.entityId ?? slugFromRoutePath(req, "/api/pages/"),
        details: { fields: Object.keys(body), ...extra?.details },
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
    // A signed document keeps the text its signature was bound to.
    const signedRejection = checkSignedDocumentWrite(currentPage, {
      mode: "merge",
      content: body.content,
      frontmatter:
        body.frontmatter && typeof body.frontmatter === "object"
          ? (body.frontmatter as Record<string, unknown>)
          : undefined,
    });
    if (signedRejection) return rejectionResponse(signedRejection);
    const invoiceRouteRejection = checkInvoiceGenericWrite(currentPage, {
      type: body.type,
      frontmatter:
        body.frontmatter && typeof body.frontmatter === "object"
          ? (body.frontmatter as Record<string, unknown>)
          : undefined,
    });
    if (invoiceRouteRejection) return rejectionResponse(invoiceRouteRejection);

    // Billed time entries / expenses are part of an invoice's basis — the
    // billing state moves only through the dedicated billing routes.
    const billedRejection = checkBilledEntriesWrite(currentPage, {
      mode: "merge",
      frontmatter:
        body.frontmatter && typeof body.frontmatter === "object"
          ? (body.frontmatter as Record<string, unknown>)
          : undefined,
    });
    if (billedRejection) return rejectionResponse(billedRejection);

    const patchBody: Record<string, unknown> = { ...body, slug: rawSlug };
    const bodyFrontmatter =
      patchBody.frontmatter && typeof patchBody.frontmatter === "object"
        ? (patchBody.frontmatter as Record<string, unknown>)
        : undefined;
    // Restore (role-checked below) is the only write an archived matter takes.
    const restoring =
      !!bodyFrontmatter?.restored_at &&
      bodyFrontmatter.status !== "archived" &&
      bodyFrontmatter.status !== "tombstoned";

    // Records with their own route (Kanzlei-Einstellungen, KYC, Anderkonten,
    // Freigaben, Kollisions-/Legal-Hold-Felder, Löschen/Archivieren) are not
    // written here.
    const protectedWrite = guardProtectedPageWrite({
      slug: rawSlug,
      current: currentPage,
      actor: { email: ctx.user.email, canWriteSettings: can(ctx.user, "settings.write") },
      mode: "merge",
      type: body.type,
      frontmatter: bodyFrontmatter,
      restore: restoring,
    });
    if ("reject" in protectedWrite) return rejectionResponse(protectedWrite.reject);
    if (protectedWrite.frontmatter) patchBody.frontmatter = protectedWrite.frontmatter;

    // The portal summary is the only case text a client sees — releasing or
    // changing it is a lawyer/admin decision.
    if (
      bodyFrontmatter &&
      "portal_summary" in bodyFrontmatter &&
      (bodyFrontmatter.portal_summary ?? "") !== (curFm.portal_summary ?? "") &&
      ctx.user.role !== "admin" &&
      ctx.user.role !== "lawyer"
    ) {
      return apiError(
        "portal_summary_forbidden",
        "Nur Anwältinnen/Anwälte und Admins dürfen die Portal-Zusammenfassung freigeben.",
        403
      );
    }
    if (isKanzleiSettingsTarget(rawSlug, currentPage, body.type, bodyFrontmatter)) {
      patchBody.frontmatter = await sealKanzleiSettingsFrontmatter(
        (patchBody.frontmatter as Record<string, unknown> | undefined) ?? {},
        curFm
      );
    }

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

      const isRestore = restoring;

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
      // Always the STORED version + 1 — never a client-sent value, with or
      // without If-Match (which was verified against the stored one above).
      fm.version = storedVersion(curFm) + 1;

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
      patchBody.frontmatter = { version: storedVersion(curFm) + 1 };
    }

    // Kollisionsprüfung beim Parteiwechsel (§ 10 Abs 1 RAO) — BEFORE the
    // write, with the same gate as the matter creation: a critical hit blocks
    // (409) until a lawyer/admin waives it with a reason, and a check that
    // cannot run blocks the change (503). Only parties that are new in this
    // write are checked, so saving a matter with unchanged parties (or an
    // earlier, waived conflict) does not re-trigger the gate.
    let conflictWarning: MatterConflictOutcome | undefined;
    const isCase =
      currentPage.type === "legal_case" ||
      curFm.type === "legal_case" ||
      body.type === "legal_case";
    if (isCase && patchBody.frontmatter) {
      const fm = patchBody.frontmatter as Record<string, unknown>;
      const partyKey = (p: { side: string; name: string }) => `${p.side}:${p.name.toLowerCase()}`;
      const before = new Set(matterParties(curFm).map(partyKey));
      const newParties = matterParties({ ...curFm, ...fm }).filter((p) => !before.has(partyKey(p)));
      if (newParties.length > 0) {
        try {
          conflictWarning = await checkPartiesConflicts(ctx.headers, newParties, {
            selfCaseSlug: rawSlug,
          });
        } catch (err) {
          log.error(
            "[pages/...slug] conflict check failed:",
            err instanceof Error ? err.message : String(err)
          );
          return apiError(
            "conflict_check_unavailable",
            "Kollisionsprüfung nicht verfügbar. Die Änderung der Parteien wurde nicht gespeichert.",
            503
          );
        }
        const waiverReason =
          typeof fm.conflict_waiver_reason === "string" ? fm.conflict_waiver_reason.trim() : "";
        const blocking = conflictWarning.blocking.length > 0;
        if (blocking && waiverReason.length === 0) {
          return Response.json(
            {
              error: "conflict_detected",
              message:
                "Interessenkonflikt: Eine Partei steht in einer bestehenden Akte auf der Gegenseite. Die Änderung wurde nicht gespeichert.",
              conflictWarning,
            },
            { status: 409 }
          );
        }
        if (blocking && !canWaiveConflict(ctx.user.role)) {
          return Response.json(
            {
              error: "conflict_waiver_unauthorized",
              message: "Konflikt-Freigabe erfordert die Rolle Anwalt oder Admin.",
            },
            { status: 403 }
          );
        }
        if (blocking) {
          patchBody.frontmatter = {
            ...fm,
            conflict_waived_by: ctx.user.email,
            conflict_waived_by_id: ctx.user.id,
            conflict_waived_by_role: ctx.user.role,
            conflict_waived_at: new Date().toISOString(),
            conflict_status: "conflict_waived",
          };
        } else if (curFm.conflict_status !== "conflict_waived") {
          patchBody.frontmatter = { ...fm, conflict_status: "conflict_cleared" };
        }
        setAuditExtra(ctx, {
          details: {
            conflict_check: {
              parties: conflictWarning.parties.map((p) => ({ name: p.name, side: p.side })),
              severity: conflictWarning.severity,
              waived: blocking,
              ...(blocking ? { waived_reason: waiverReason } : {}),
            },
          },
        });
      }
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
        // Same semantics as the Papierkorb: only documents the archive
        // cascade removed come back; deliberately deleted ones stay deleted.
        restoreCascade = await restoreCaseDocuments(
          ctx.headers,
          new Set([path, decodeURIComponent(path), rawSlug]),
          ctx.user.email
        );
        if (restoreCascade.failed.length > 0) {
          log.error("[pages/...slug] restore cascade incomplete", {
            failed: restoreCascade.failed.length,
          });
        }
      }

      // Audit log + SSE for restore operations
      if (patchedFm.restored_at && patchedFm.status && patchedFm.status !== "archived") {
        setAuditExtra(ctx, {
          action: "case.restore",
          details: {
            restoredAt: patchedFm.restored_at,
            ...(restoreCascade.attempted
              ? {
                  cascaded: restoreCascade.succeeded,
                  cascadeFailed: restoreCascade.failed.length,
                }
              : {}),
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
        { ...redactPageSecrets(result), conflictWarning, restoreCascade },
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
    audit: (ctx, _body, _query, req) => {
      const extra = getAuditExtra(ctx);
      return {
        action: extra?.action ?? ("case.delete" as const),
        entityType: "page",
        entityId: extra?.entityId ?? slugFromRoutePath(req, "/api/pages/"),
        details: { method: "soft_delete", ...extra?.details },
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
      const billedRejection = checkBilledEntriesWrite(casePage, { mode: "delete" });
      if (billedRejection) return rejectionResponse(billedRejection);

      // KYC records, trust accounts, the Kanzlei settings and decided
      // approvals are deleted (if at all) only through their own routes.
      const protectedDelete = guardProtectedPageWrite({
        slug: decodedSlug,
        current: casePage,
        actor: { email: ctx.user.email, canWriteSettings: can(ctx.user, "settings.write") },
        mode: "delete",
      });
      if ("reject" in protectedDelete) return rejectionResponse(protectedDelete.reject);

      // A live Notfrist is never deleted — it is cancelled with a reason.
      const deadlinePage = isDeadlinePage(pageType, fm.type, decodedSlug);
      if (deadlinePage) {
        const notfristRejection = checkDeadlinePageDelete(
          fm,
          (casePage as { title?: string }).title
        );
        if (notfristRejection) return rejectionResponse(notfristRejection);
      }

      // Matters: DELETE archives (Aktenabschluss, default) — `?mode=trash`
      // moves a matter created by mistake to the Papierkorb instead. Archiving
      // is not deleting: an archived matter is kept for the statutory
      // retention period and never reaches the Papierkorb.
      const caseMode: "archive" | "trash" =
        new URL(req.url).searchParams.get("mode") === "trash" ? "trash" : "archive";
      const retention = caseRetentionState(fm);

      // Guard: already archived — return 409 to prevent double-archive
      if (pageType === "legal_case" && caseMode === "archive" && fm.status === "archived") {
        return Response.json(
          { error: "already_archived", message: "Akte ist bereits archiviert." },
          { status: 409 }
        );
      }
      if (pageType === "legal_case" && fm.status === "tombstoned") {
        return Response.json(
          {
            error: "already_deleted",
            message: "Akte liegt im Papierkorb — zuerst wiederherstellen.",
          },
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
      // Work released from a deleted invoice draft (null: release failed).
      let released: { time: number; expenses: number } | null | undefined;

      if (pageType === "legal_case" && caseMode === "trash") {
        // Papierkorb only for a matter that was never closed (or whose
        // retention period has run). Fail closed: an undeterminable period
        // counts as running.
        if (retention.running) {
          return Response.json(
            {
              error: "retention_period_running",
              message: retentionRunningMessage(retention.until),
              retention_until: retention.until,
            },
            { status: 409 }
          );
        }
        const now = new Date().toISOString();
        const existingTimeline = (fm.timeline_events as Array<Record<string, unknown>>) || [];
        const trashRes = await enginePatchPage(
          ctx.headers,
          {
            slug: decodedSlug,
            frontmatter: {
              status: "tombstoned",
              status_before_delete: typeof fm.status === "string" ? fm.status : "open",
              tombstoned_at: now,
              tombstoned_by: ctx.user.email,
              tombstone_reason: "manual_delete",
              portal_enabled: false,
              timeline_events: [
                ...existingTimeline,
                {
                  id: `tl-delete-${Date.now()}`,
                  timestamp: now,
                  type: "status_change",
                  title: "Akte in den Papierkorb verschoben",
                  description: `Gelöscht von ${ctx.user.email}`,
                  actor: ctx.user.email,
                },
              ],
            },
          },
          { timeoutMs: 15_000 }
        );
        if (!trashRes.ok) throw new Error(`Trash merge-update failed: HTTP ${trashRes.status}`);
        cascade = await tombstoneCaseDocuments(
          ctx.headers,
          caseSlugForms,
          ctx.user.email,
          "case_deleted",
          now
        );
        if (cascade.failed.length > 0) {
          log.error("[pages/...slug] delete cascade incomplete", {
            failed: cascade.failed.length,
          });
        }
      } else if (pageType === "legal_case") {
        const now = new Date();
        // Aktenabschluss: the retention period starts with the closing date
        // (an earlier closed_at is kept) and is stored on the matter.
        const closedAt =
          typeof fm.closed_at === "string" && fm.closed_at.trim()
            ? fm.closed_at
            : now.toISOString();
        const retentionUntil =
          caseRetentionState({ ...fm, status: "archived", closed_at: closedAt }, now).until ??
          caseRetentionUntil(now.toISOString());
        // Build timeline event for archive
        const existingTimeline = (fm.timeline_events as Array<Record<string, unknown>>) || [];
        const archiveTimeline = [
          ...existingTimeline,
          {
            id: `tl-archive-${Date.now()}`,
            timestamp: now.toISOString(),
            type: "status_change",
            title: "Akte archiviert",
            description: `Archiviert von ${ctx.user.email} — Aufbewahrung bis ${retentionUntil}`,
            actor: ctx.user.email,
          },
        ];

        // 2. Archive the case. The engine has no PATCH/If-Match; merge-update
        //    overlays just these keys (status guarded above).
        const archiveRes = await enginePatchPage(
          ctx.headers,
          {
            slug: decodedSlug,
            frontmatter: {
              status: "archived",
              archived_at: now.toISOString(),
              archived_by: ctx.user.email,
              closed_at: closedAt,
              retention_until: retentionUntil,
              portal_enabled: false,
              timeline_events: archiveTimeline,
            },
          },
          { timeoutMs: 15_000 }
        );
        if (!archiveRes.ok)
          throw new Error(`Archive merge-update failed: HTTP ${archiveRes.status}`);

        // 3. Hide the matter's active documents with it (retained, not trash;
        //    paged through the whole type — the engine caps a list at 100 rows).
        cascade = await archiveCaseDocuments(ctx.headers, caseSlugForms, ctx.user.email);
        if (cascade.failed.length > 0) {
          log.error("[pages/...slug] archive cascade incomplete", {
            failed: cascade.failed.length,
          });
        }
      } else {
        // Non-case pages: a page under its own Legal Hold, or one that belongs
        // to a matter under Legal Hold, is not deleted. Fail closed: if the
        // matter cannot be read, nothing is deleted.
        const holdActive = {
          error: "legal_hold_active",
          message: "Dokument gehört zu einer Akte mit Legal Hold und kann nicht gelöscht werden.",
        };
        if (fm.legal_hold === true) return Response.json(holdActive, { status: 423 });
        const docCaseSlug = typeof fm.case_slug === "string" ? fm.case_slug : "";
        if (docCaseSlug) {
          const caseRead = await readCurrentPage(ENGINE_URL, ctx.headers, docCaseSlug, 5_000);
          if (caseRead.kind === "error") return rejectionResponse(GUARD_READ_FAILED);
          if (caseRead.kind === "found" && caseRead.page.frontmatter?.legal_hold === true) {
            return Response.json(holdActive, { status: 423 });
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
        // A deleted invoice draft no longer bills its work — put it back to
        // open, exactly as the invoice route's DELETE does (issued invoices
        // were rejected above).
        if (isInvoicePage(casePage)) {
          released = await releaseWorkOfInvoice(ctx.headers, decodedSlug, fm, "draft_deleted");
        }
        // A deleted document also leaves its matter's document list (matter
        // view, matter export). Best effort: the tombstone above already hides
        // it everywhere that reads the document itself.
        if (docCaseSlug) {
          await removeFromCaseDocuments(ctx.headers, docCaseSlug, decodedSlug).catch((err) => {
            log.warn("[pages/...slug] matter document list not updated", {
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
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
      // One audit entry (written by createHandler on success): the real
      // action per page type; both are soft deletes (archive / tombstone).
      setAuditExtra(ctx, {
        action: pageType === "legal_case" ? "case.delete" : "document.delete",
        details: {
          method: "soft_delete",
          ...(pageType === "legal_case" ? { mode: caseMode } : {}),
          ...(cascade.attempted
            ? { cascaded: cascade.succeeded, cascadeFailed: cascade.failed.length }
            : {}),
        },
      });
      const method = pageType === "legal_case" && caseMode === "archive" ? "archived" : "deleted";
      broadcastSseEvent(ctx.brainId, "case.deleted", {
        slug: path,
        by: ctx.user.email,
        at: new Date().toISOString(),
        method,
      });
      return Response.json(
        {
          ok: !cascade.attempted || cascade.failed.length === 0,
          method,
          cascade,
          ...(released !== undefined ? { released } : {}),
        },
        { status: cascade.attempted && cascade.failed.length > 0 ? 207 : 200 }
      );
    } catch (e) {
      log.error("[pages/...slug] delete failed:", e instanceof Error ? e.message : String(e));
      return apiError("engine_unreachable", "Seite nicht löschbar", 503);
    }
  }
);
