import { withoutStaffOnlyRecords } from "@/lib/staff-only-records";
import { listEnginePages } from "@/lib/engine-pages";
import { z } from "zod";
import { isTombstoned } from "@/lib/tombstone";
import { hideForeignPersonalEvents } from "@/lib/calendar/personal-events";
import { emitCaseCreated } from "@/lib/webhook-dispatch";
import { ENGINE_URL } from "@/lib/engine";
import { engineWriteBestEffort } from "@/lib/engine-write";
import { createHandler, apiError, recordQuota } from "@/lib/api-handler";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import { markOnboardingProgress } from "@/lib/auth/store";
import { ensureCaseContacts } from "@/lib/case-contacts";
import {
  SERVER_OWNED_CONFLICT_KEYS,
  canWaiveConflict,
  checkMatterConflicts,
  conflictCheckRecord,
  type MatterConflictOutcome,
} from "@/lib/conflict-gate";
import { caseContentWithAktenblatt, isCaseSlug, isDeadlineSlug } from "@/lib/aktenblatt";
import {
  FRONTMATTER_IN_CONTENT_REJECTION,
  GUARD_READ_FAILED,
  hasLeadingFrontmatter,
  checkCreateOverExisting,
  checkInvoiceWrite,
  checkSignedDocumentWrite,
  guardProtectedPageWrite,
  guardSecondCheckWrite,
  isKanzleiSettingsTarget,
  readCurrentPage,
  rejectionResponse,
} from "@/lib/page-write-guards";
import { redactPageSecrets, sealKanzleiSettingsFrontmatter } from "@/lib/kanzlei-settings-secrets";
import { can } from "@/lib/permissions";
import { applyDeadlineWritePolicy, type DeadlineChangeEvent } from "@/lib/deadline-write-policy";
import { logDeadlineEvents } from "@/lib/deadline-audit";

import { checkBilledEntriesWrite, checkInvoiceGenericWrite } from "@/lib/billing-write-guards";
import { logger } from "@/lib/logger";
const log = logger("api/pages");

const pagesQuerySchema = z.object({
  limit: z.string().optional(),
  offset: z.string().optional(),
  source: z.string().optional(),
  type: z.string().optional(),
  tag: z.string().optional(),
  q: z.string().optional(),
  cursor: z.string().optional(),
  /** "1": also return deleted (tombstoned) pages, for callers that page by offset. */
  include_tombstoned: z.string().optional(),
  /**
   * Pages of `type` that belong to one matter — linked by frontmatter
   * case_slug, case_title or case_number (any of them). The engine cannot
   * filter by frontmatter and caps a list at 100 rows, so the server pages
   * through the whole type and filters; the result is complete, not the
   * newest N of the firm.
   */
  case_slug: z.string().max(500).optional(),
  case_title: z.string().max(500).optional(),
  case_number: z.string().max(200).optional(),
});

/** Upper bound for a matter-scoped scan (pages of one type, firm-wide). */
const MATTER_SCAN_MAX = 50_000;

function belongsToMatter(
  fm: Record<string, unknown> | undefined,
  q: { case_slug?: string; case_title?: string; case_number?: string }
): boolean {
  if (!fm) return false;
  return (
    (!!q.case_slug && fm.case_slug === q.case_slug) ||
    (!!q.case_title && fm.case_title === q.case_title) ||
    (!!q.case_number && fm.case_number === q.case_number)
  );
}

// One route, two intents: `merge: true` is a partial update (the engine keeps
// title/body/type when omitted — see enginePatchPage in src/lib/engine.ts),
// everything else is a create and needs a title. The dashboard's
// api.brain.updatePage() sends metadata-only merges (approve a deadline, mark
// done, second check, status changes); requiring a title there rejected every
// one of them with 400.
const pagesPostSchema = z
  .object({
    slug: z
      .string()
      .min(1, "slug_required")
      .refine((s) => !s.includes("..") && !s.includes("//"), "invalid_slug"),
    title: z.string().min(1, "title_required").optional(),
    content: z.string().optional(),
    type: z.string().optional(),
    frontmatter: z.record(z.unknown()).optional(),
    merge: z.boolean().optional(),
  })
  .passthrough()
  .superRefine((body, ctx) => {
    if (body.merge !== true && !body.title) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["title"], message: "Required" });
    }
  });

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: pagesQuerySchema,
  },
  async (ctx, _body, query, _req) => {
    if (query.case_slug || query.case_title || query.case_number) {
      if (!query.type) {
        return apiError("type_required", "Für eine Aktenfilterung ist type erforderlich", 400);
      }
      try {
        const all = await listEnginePages(ctx.headers, query.type, MATTER_SCAN_MAX, {
          includeTombstoned: query.include_tombstoned === "1",
          timeoutMs: 15_000,
        });
        return Response.json(
          hideForeignPersonalEvents(
            redactPageSecrets(
              withoutStaffOnlyRecords(
                ctx.user.role,
                all.filter((p) => belongsToMatter(p.frontmatter, query))
              )
            ),
            ctx.user?.id
          )
        );
      } catch (err) {
        log.error("[pages] matter list failed:", err instanceof Error ? err.message : String(err));
        return apiError("service_unavailable", "Seiten derzeit nicht verfügbar", 503);
      }
    }
    const params = new URLSearchParams();
    for (const key of ["limit", "offset", "source", "type", "tag", "q", "cursor"] as const) {
      const val = query[key];
      if (val) params.set(key, val);
    }
    try {
      const res = await fetch(`${ENGINE_URL}/api/pages?${params.toString()}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = (await res.json()) as unknown;
      // Deleted records are tombstoned, not removed; lists must not bring them back.
      const visible = Array.isArray(raw) ? withoutStaffOnlyRecords(ctx.user.role, raw) : raw;
      // Other users' personal calendar mirrors are theirs alone.
      const data = hideForeignPersonalEvents(
        redactPageSecrets(
          Array.isArray(visible) && query.include_tombstoned !== "1"
            ? visible.filter((p) => !isTombstoned(p as { frontmatter?: Record<string, unknown> }))
            : visible
        ),
        ctx.user?.id
      );
      // Relay cursor pagination metadata from engine if present
      const nextCursor = res.headers.get("x-next-cursor");
      if (nextCursor) {
        return Response.json({ items: data, nextCursor });
      }
      return Response.json(data);
    } catch (err) {
      log.error("[pages] list failed:", err instanceof Error ? err.message : String(err));
      return apiError("service_unavailable", "Seiten derzeit nicht verfügbar", 503);
    }
  }
);

/**
 * Re-render the Aktenblatt after a metadata merge. Best-effort: a failure here
 * leaves the matter with a stale (but still valid) Aktenblatt.
 */
async function refreshAktenblatt(headers: Record<string, string>, slug: string): Promise<void> {
  try {
    const path = slug.split("/").map(encodeURIComponent).join("/");
    const res = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return;
    const page = (await res.json()) as {
      title?: string;
      content?: string;
      frontmatter?: Record<string, unknown>;
    };
    // Deadlines are usually standalone pages linked by case_slug.
    const allDeadlines = (await listEnginePages(headers, "legal_deadline", 10_000, {
      timeoutMs: 10_000,
    })) as unknown as Array<Record<string, unknown>>;
    const linkedDeadlines = allDeadlines.filter(
      (d) => ((d.frontmatter ?? {}) as Record<string, unknown>).case_slug === slug
    );
    const next = caseContentWithAktenblatt(
      page.content ?? "",
      page.title ?? "",
      page.frontmatter ?? {},
      {
        linkedDeadlines,
      }
    );
    if (next === (page.content ?? "").trim()) return;
    // Best effort, but a refused write is logged instead of passing silently.
    await engineWriteBestEffort(
      `${ENGINE_URL}/api/pages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ slug, merge: true, content: next }),
        signal: AbortSignal.timeout(15_000),
      },
      "Aktenblatt"
    );
  } catch (e) {
    log.warn("[pages] aktenblatt refresh skipped:", e instanceof Error ? e.message : String(e));
  }
}

async function refreshAktenblattForDeadline(
  headers: Record<string, string>,
  deadlineSlug: string,
  fm: Record<string, unknown> | undefined
): Promise<void> {
  try {
    let caseSlug = typeof fm?.case_slug === "string" ? fm.case_slug : "";
    if (!caseSlug) {
      const path = deadlineSlug.split("/").map(encodeURIComponent).join("/");
      const res = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return;
      const page = (await res.json()) as { frontmatter?: Record<string, unknown> };
      caseSlug = typeof page.frontmatter?.case_slug === "string" ? page.frontmatter.case_slug : "";
    }
    if (isCaseSlug(caseSlug)) await refreshAktenblatt(headers, caseSlug);
  } catch {
    /* best-effort */
  }
}

/**
 * Check-out enforcement: a merge/update on a document locked by another
 * user is rejected with 409. Lock management itself goes through
 * /api/legal/documents/* which writes via the engine directly — no loop.
 */
function enforceDocumentLock(
  page: { frontmatter?: Record<string, unknown> } | null,
  userId: string
): Response | null {
  const lock = page?.frontmatter?.checked_out_by;
  if (
    lock &&
    typeof lock === "object" &&
    typeof (lock as { userId?: unknown }).userId === "string" &&
    (lock as { userId: string }).userId !== userId
  ) {
    return Response.json(
      {
        error: "document_locked",
        message: `Dokument ist bei ${(lock as { userEmail?: string }).userEmail ?? "einem Kollegen"} ausgecheckt.`,
        lockedBy: lock,
      },
      { status: 409 }
    );
  }
  return null;
}

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    quota: "pages",
    body: pagesPostSchema,
    audit: (ctx, body) => ({
      action: body.merge === true ? ("case.update" as const) : ("case.create" as const),
      entityType: "page",
      entityId: body.slug,
      details: {
        title: body.title,
        type: body.type,
        // The matter the page belongs to; passive time capture reads it.
        case_slug:
          typeof body.frontmatter?.case_slug === "string" ? body.frontmatter.case_slug : undefined,
        conflict_status: body.frontmatter?.conflict_status,
        conflict_waiver_reason: body.frontmatter?.conflict_waiver_reason,
        conflict_waived_by: body.frontmatter?.conflict_waived_by,
        conflict_waived_by_role: body.frontmatter?.conflict_waived_by_role,
      },
    }),
  },
  async (ctx, body, _query, req) => {
    try {
      // Metadata travels only in title/type/frontmatter, where the guards
      // below see it — never as a YAML block inside the content.
      if (hasLeadingFrontmatter(body.content)) {
        return rejectionResponse(FRONTMATTER_IN_CONTENT_REJECTION);
      }
      // Every write — merge or create — is judged against the stored page, so
      // a create over an existing slug cannot slip past the guards. Fail
      // closed: an unreadable page is not written.
      const currentRead = await readCurrentPage(ENGINE_URL, ctx.headers, body.slug);
      if (currentRead.kind === "error") return rejectionResponse(GUARD_READ_FAILED);
      const current = currentRead.kind === "found" ? currentRead.page : null;

      // Matters and invoices: a create never replaces a stored page. With no
      // stored page the engine write is create-only; replacing one needs
      // If-Match with its stored version.
      const createVerdict = checkCreateOverExisting(current, {
        merge: body.merge === true,
        type: body.type,
        ifMatch: req.headers.get("if-match"),
      });
      if (createVerdict.kind === "reject") return rejectionResponse(createVerdict.reject);

      // § 132 BAO / UStG: an issued invoice is frozen — only payment and
      // delivery bookkeeping may change; never overwritten by a create.
      const invoiceRejection = checkInvoiceWrite(current, {
        mode: body.merge === true ? "merge" : "replace",
        title: body.title,
        content: body.content,
        type: body.type,
        frontmatter: body.frontmatter,
      });
      if (invoiceRejection) return rejectionResponse(invoiceRejection);
      // A signed document keeps the text its signature was bound to.
      const signedRejection = checkSignedDocumentWrite(current, {
        mode: body.merge === true ? "merge" : "replace",
        content: body.content,
        frontmatter: body.frontmatter,
      });
      if (signedRejection) return rejectionResponse(signedRejection);
      const invoiceRouteRejection = checkInvoiceGenericWrite(current, {
        type: body.type,
        frontmatter: body.frontmatter,
      });
      if (invoiceRouteRejection) return rejectionResponse(invoiceRouteRejection);

      // Records with their own route (Kanzlei-Einstellungen, KYC, Anderkonten,
      // Freigaben, Kollisions-/Legal-Hold-Felder, Archiv) are not written here.
      const isMergeWrite = body.merge === true;
      const protectedWrite = guardProtectedPageWrite({
        slug: body.slug,
        current,
        actor: { email: ctx.user.email, canWriteSettings: can(ctx.user, "settings.write") },
        mode: isMergeWrite ? "merge" : "replace",
        type: body.type,
        frontmatter: body.frontmatter,
      });
      if ("reject" in protectedWrite) return rejectionResponse(protectedWrite.reject);
      if (protectedWrite.frontmatter) body.frontmatter = protectedWrite.frontmatter;

      // The SMTP password is stored encrypted, never as page plaintext.
      if (isKanzleiSettingsTarget(body.slug, current, body.type, body.frontmatter)) {
        body.frontmatter = await sealKanzleiSettingsFrontmatter(
          body.frontmatter ?? {},
          current?.frontmatter ?? null
        );
      }

      // Billed time entries / expenses are part of an invoice's basis — the
      // billing state moves only through the dedicated billing routes.
      const billedRejection = checkBilledEntriesWrite(current, {
        mode: body.merge === true ? "merge" : "replace",
        frontmatter: body.frontmatter,
      });
      if (billedRejection) return rejectionResponse(billedRejection);

      // Vier-Augen-Kontrolle: second_check_* only via the second-check route.
      if (body.frontmatter) {
        const guarded = guardSecondCheckWrite(body.frontmatter, current?.frontmatter ?? null);
        if ("reject" in guarded) return rejectionResponse(guarded.reject);
        body.frontmatter = guarded.frontmatter;
      }

      // Fristen: server-stamped identity (created/approved/completed by),
      // Notfrist protection and the before/after audit trail.
      let deadlineEvents: DeadlineChangeEvent[] = [];
      if (body.frontmatter || body.type === "legal_deadline" || isDeadlineSlug(body.slug)) {
        const policy = applyDeadlineWritePolicy({
          slug: body.slug,
          type: body.type ?? current?.type,
          incoming: body.frontmatter ?? {},
          current,
          user: ctx.user,
        });
        if ("reject" in policy) return rejectionResponse(policy.reject);
        if (body.frontmatter || policy.events.length > 0) body.frontmatter = policy.frontmatter;
        deadlineEvents = policy.events;
      }

      // Every merge onto an existing page advances its version, so a client
      // holding an older copy (If-Match on PATCH) notices the change instead
      // of overwriting it.
      if (body.merge === true && current) {
        const storedVersion = Number(current.frontmatter?.version);
        body.frontmatter = {
          ...(body.frontmatter ?? {}),
          version: (Number.isFinite(storedVersion) ? storedVersion : 0) + 1,
        };
      } else if (createVerdict.kind === "replace") {
        body.frontmatter = { ...(body.frontmatter ?? {}), version: createVerdict.version };
      }

      let conflictWarning: MatterConflictOutcome | undefined;
      if (body.type === "legal_case") {
        // Conflict status and waiver stamps are server-owned: never taken
        // from the request body.
        const fm: Record<string, unknown> = { ...(body.frontmatter ?? {}) };
        for (const key of SERVER_OWNED_CONFLICT_KEYS) delete fm[key];
        body.frontmatter = fm;

        try {
          // Each party is checked with its side in THIS matter (§ 10 Abs 1
          // RAO); the matter itself and the party's own contact are no hits.
          conflictWarning = await checkMatterConflicts(ctx.headers, fm, {
            selfCaseSlug: body.slug,
          });
        } catch (err) {
          log.error(
            "[pages] conflict check failed:",
            err instanceof Error ? err.message : String(err)
          );
          return apiError(
            "conflict_check_unavailable",
            "Kollisionsprüfung nicht verfügbar. Akte wurde nicht angelegt.",
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
                "Interessenkonflikt: Eine Partei steht in einer bestehenden Akte auf der Gegenseite. Akte wurde nicht angelegt.",
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

        const now = new Date();
        const actor = { id: ctx.user.id, email: ctx.user.email, role: ctx.user.role };
        if (blocking) {
          // Stamp waiver with the real approver for the audit trail
          body.frontmatter = {
            ...fm,
            conflict_waived_by: ctx.user.email,
            conflict_waived_by_id: ctx.user.id,
            conflict_waived_by_role: ctx.user.role,
            conflict_waived_at: now.toISOString(),
            conflict_status: "conflict_waived",
          };
        } else if (conflictWarning.checked) {
          body.frontmatter = { ...fm, conflict_status: "conflict_cleared" };
        }

        // Mandatsannahme evidence: the conflict_check block is written from
        // the server's own result, never from what the client claims.
        const acceptance = (body.frontmatter as Record<string, unknown>).mandate_acceptance;
        if (acceptance && typeof acceptance === "object" && !Array.isArray(acceptance)) {
          const stored = (
            current?.frontmatter?.mandate_acceptance as Record<string, unknown> | undefined
          )?.conflict_check;
          const conflictCheck =
            !conflictWarning.checked && body.merge === true && stored && typeof stored === "object"
              ? stored
              : conflictCheckRecord(
                  conflictWarning,
                  actor,
                  blocking ? { reason: waiverReason, actor } : undefined,
                  now
                );
          body.frontmatter = {
            ...body.frontmatter,
            mandate_acceptance: { ...acceptance, conflict_check: conflictCheck },
          };
        }
      }

      if (body.type === "legal_case" && body.merge !== true) {
        // Parties typed into the wizard become contacts linked to the matter.
        const links = await ensureCaseContacts(ctx.headers, body.frontmatter ?? {});
        if (Object.keys(links).length > 0) {
          body.frontmatter = { ...body.frontmatter, ...links };
        }
        // Matters live in frontmatter; the engine only indexes body text.
        // The Aktenblatt makes the matter searchable and answerable.
        body.content = caseContentWithAktenblatt(
          body.content ?? "",
          body.title ?? "",
          (body.frontmatter ?? {}) as Record<string, unknown>
        );
      }

      if (body.merge === true) {
        const locked = enforceDocumentLock(current, ctx.user.id);
        if (locked) return locked;
      }

      const res = await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify(
          createVerdict.kind === "create_only" ? { ...body, if_absent: true } : body
        ),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const upstream = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        if (res.status === 409 && upstream?.error === "page_exists") {
          // Created in the meantime by someone else: nothing was replaced.
          return rejectionResponse({
            status: 409,
            error: "page_exists",
            message:
              "Unter dieser Adresse wurde soeben eine Seite angelegt. Es wurde nichts überschrieben.",
          });
        }
        log.error("[pages] engine create rejected:", res.status, upstream);
        return Response.json(
          upstream ?? {
            error: "engine_error",
            message: `Engine returned HTTP ${res.status}`,
          },
          { status: res.status }
        );
      }
      const isMerge = body.merge === true;
      if (!isMerge) void recordQuota(ctx, "pages");
      const result = await res.json();
      await logDeadlineEvents(ctx, deadlineEvents);

      if (isMerge && isCaseSlug(body.slug) && body.content === undefined) {
        // Metadata merge on a matter: refresh the Aktenblatt from the merged
        // frontmatter so deadlines/documents/parties stay searchable.
        void refreshAktenblatt(ctx.headers, body.slug);
      } else if (body.type === "legal_deadline" || isDeadlineSlug(body.slug)) {
        // A deadline was created or changed: its matter's Aktenblatt lists it.
        void refreshAktenblattForDeadline(ctx.headers, body.slug, body.frontmatter);
      }

      if (!isMerge && body.type === "legal_case") {
        void markOnboardingProgress(ctx.user.id, { firstCase: true });
        if (!current) {
          emitCaseCreated(ctx.brainId, {
            slug: body.slug,
            title: body.title,
            frontmatter: body.frontmatter,
          });
        }
      } else if (!isMerge && body.type === "legal_deadline") {
        void markOnboardingProgress(ctx.user.id, { firstDeadline: true });
      }

      broadcastSseEvent(ctx.brainId, "case.updated", {
        slug: body.slug,
        by: ctx.user.email,
        at: new Date().toISOString(),
        action: isMerge ? "updated" : "created",
      });

      return Response.json({ ...redactPageSecrets(result), conflictWarning });
    } catch (e) {
      log.error("[pages] create failed:", e instanceof Error ? e.message : String(e));
      return apiError("internal_error", "Seite konnte nicht erstellt werden", 500);
    }
  }
);
