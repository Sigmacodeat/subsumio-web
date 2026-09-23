import { listEnginePages } from "@/lib/engine-pages";
import { z } from "zod";
import { isTombstoned } from "@/lib/tombstone";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError, recordQuota } from "@/lib/api-handler";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import { markOnboardingProgress } from "@/lib/auth/store";
import { ensureCaseContacts } from "@/lib/case-contacts";
import { caseContentWithAktenblatt, isCaseSlug, isDeadlineSlug } from "@/lib/aktenblatt";
import {
  GUARD_READ_FAILED,
  checkInvoiceWrite,
  guardSecondCheckWrite,
  readCurrentPage,
  rejectionResponse,
} from "@/lib/page-write-guards";

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
});

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

type ConflictMatch = { name: string; slug: string; type: string };

async function checkLegalCaseConflicts(
  headers: Record<string, string>,
  frontmatter: Record<string, unknown> | undefined
): Promise<{ checked: boolean; matches?: ConflictMatch[] }> {
  const namesToCheck = [frontmatter?.client_name, frontmatter?.opponent_name].filter(
    (n): n is string => typeof n === "string" && n.trim().length > 0
  );
  if (namesToCheck.length === 0) return { checked: true };

  const conflicts: ConflictMatch[] = [];
  for (const name of namesToCheck) {
    const checkRes = await fetch(`${ENGINE_URL}/api/legal/conflict-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ name }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!checkRes.ok) {
      throw new Error(`Conflict check failed: HTTP ${checkRes.status}`);
    }
    const checkData = (await checkRes.json()) as { matches?: ConflictMatch[] };
    if (checkData.matches?.length) {
      conflicts.push(
        ...checkData.matches.map((m) => ({ name: m.name, slug: m.slug, type: m.type }))
      );
    }
  }

  return { checked: true, matches: conflicts.length > 0 ? conflicts : undefined };
}

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: pagesQuerySchema,
  },
  async (ctx, _body, query, _req) => {
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
      const data =
        Array.isArray(raw) && query.include_tombstoned !== "1"
          ? raw.filter((p) => !isTombstoned(p as { frontmatter?: Record<string, unknown> }))
          : raw;
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
    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ slug, merge: true, content: next }),
      signal: AbortSignal.timeout(15_000),
    });
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
  async (ctx, body, _query, _req) => {
    try {
      // Every write — merge or create — is judged against the stored page, so
      // a create over an existing slug cannot slip past the guards. Fail
      // closed: an unreadable page is not written.
      const currentRead = await readCurrentPage(ENGINE_URL, ctx.headers, body.slug);
      if (currentRead.kind === "error") return rejectionResponse(GUARD_READ_FAILED);
      const current = currentRead.kind === "found" ? currentRead.page : null;

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

      // Vier-Augen-Kontrolle: second_check_* only via the second-check route.
      if (body.frontmatter) {
        const guarded = guardSecondCheckWrite(body.frontmatter, current?.frontmatter ?? null);
        if ("reject" in guarded) return rejectionResponse(guarded.reject);
        body.frontmatter = guarded.frontmatter;
      }

      let conflictWarning:
        | { checked: boolean; matches?: Array<{ name: string; slug: string; type: string }> }
        | undefined;
      if (body.type === "legal_case") {
        try {
          conflictWarning = await checkLegalCaseConflicts(ctx.headers, body.frontmatter);
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
          typeof body.frontmatter?.conflict_waiver_reason === "string"
            ? body.frontmatter.conflict_waiver_reason.trim()
            : "";
        if (conflictWarning.matches?.length && waiverReason.length === 0) {
          return Response.json(
            {
              error: "conflict_detected",
              message: "Kollisionsprüfung hat Treffer gefunden. Akte wurde nicht angelegt.",
              conflictWarning,
            },
            { status: 409 }
          );
        }

        // E9: Enforce partner-level approval for conflict waivers
        if (conflictWarning.matches?.length && waiverReason.length > 0) {
          const approverRole = ctx.user.role;
          const allowedWaiverRoles = ["admin", "lawyer"];
          if (!allowedWaiverRoles.includes(approverRole)) {
            return Response.json(
              {
                error: "conflict_waiver_unauthorized",
                message: "Konflikt-Waiver erfordert Partner-Freigabe (Rolle: admin oder lawyer).",
              },
              { status: 403 }
            );
          }
          // Stamp waiver with approver info for audit trail
          body.frontmatter = {
            ...body.frontmatter,
            conflict_waived_by: ctx.user.email,
            conflict_waived_by_role: approverRole,
            conflict_waived_at: new Date().toISOString(),
            conflict_status: "conflict_waived",
          };
        }

        if (conflictWarning.checked && !conflictWarning.matches?.length) {
          body.frontmatter = {
            ...body.frontmatter,
            conflict_status: "conflict_cleared",
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
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const upstream = (await res.json().catch(() => null)) as Record<string, unknown> | null;
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
      } else if (!isMerge && body.type === "legal_deadline") {
        void markOnboardingProgress(ctx.user.id, { firstDeadline: true });
      }

      broadcastSseEvent(ctx.brainId, "case.updated", {
        slug: body.slug,
        by: ctx.user.email,
        at: new Date().toISOString(),
        action: isMerge ? "updated" : "created",
      });

      return Response.json({ ...result, conflictWarning });
    } catch (e) {
      log.error("[pages] create failed:", e instanceof Error ? e.message : String(e));
      return apiError("internal_error", "Seite konnte nicht erstellt werden", 500);
    }
  }
);
