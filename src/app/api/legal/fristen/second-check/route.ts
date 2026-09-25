import { z } from "zod";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import {
  embeddedDeadlineKey,
  hasServerSecondCheck,
  readCurrentPage,
} from "@/lib/page-write-guards";
import { logDeadlineEvents } from "@/lib/deadline-audit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /** Standalone deadline page, or — with deadlineId/title — the matter holding the deadline. */
  slug: z.string().min(1).max(500),
  /** Deadline inside the matter's `deadlines` array (its `id`). */
  deadlineId: z.string().min(1).max(300).optional(),
  /** Fallback identity for legacy matter deadlines without an id. */
  title: z.string().max(500).optional(),
  due_date: z.string().max(40).optional(),
});

const DEADLINE_PAGE_TYPES = new Set(["legal_deadline", "deadline"]);

/**
 * Vier-Augen-Kontrolle für Notfristen — server-seitig erzwungen.
 *
 * Fail-closed: the first person must be known from a SERVER-stamped id
 * (`created_by_id` from the session at creation, `reviewed_by_id` at
 * approval, `completed_by_id`). A deadline without one — imported, created by
 * the pipeline or before identities were stamped — must first be approved by
 * a person; only someone else may then do the second check.
 *
 * The ONLY writer of `second_check_*`: the generic page routes strip those
 * fields from client writes and refuse to mark a Notfrist done without them
 * (src/lib/page-write-guards.ts). This route reads the stored deadline,
 * compares the authenticated user (id, name and e-mail) against whoever
 * created, reviewed or completed it, and stamps the second check itself —
 * never trusting a client-sent checker.
 *
 * Two shapes: a standalone deadline page (`slug`), or a deadline inside a
 * matter's `deadlines` list (`slug` = matter, plus `deadlineId`, or
 * `title` + `due_date` for legacy entries without an id).
 */
export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: bodySchema,
    audit: (_ctx, body) => ({
      action: "deadline.second_check" as const,
      entityType: "page",
      entityId: body.deadlineId ? `${body.slug}#${body.deadlineId}` : body.slug,
    }),
  },
  async (ctx, body) => {
    // A `page:<slug>` id is a standalone deadline merged into the matter view.
    let targetSlug = body.slug;
    let deadlineId = body.deadlineId;
    if (deadlineId?.startsWith("page:")) {
      targetSlug = deadlineId.slice("page:".length);
      deadlineId = undefined;
    }
    const embedded = deadlineId !== undefined || body.title !== undefined;

    const read = await readCurrentPage(ENGINE_URL, ctx.headers, targetSlug);
    if (read.kind === "missing") {
      return Response.json(
        { error: "not_found", message: "Frist nicht gefunden" },
        { status: 404 }
      );
    }
    if (read.kind === "error") {
      return Response.json(
        { error: "engine_unreachable", message: "Frist nicht lesbar" },
        { status: 503 }
      );
    }
    const page = read.page;
    const pageFm = (page.frontmatter ?? {}) as Record<string, unknown>;
    const pageType = String(page.type ?? pageFm.type ?? "");

    let deadline: Record<string, unknown>;
    let list: Array<Record<string, unknown>> = [];
    let index = -1;
    if (embedded) {
      if (pageType !== "legal_case") {
        return Response.json(
          { error: "not_a_matter", message: "Die Frist gehört zu keiner Akte." },
          { status: 400 }
        );
      }
      list = Array.isArray(pageFm.deadlines)
        ? (pageFm.deadlines as Array<Record<string, unknown>>)
        : [];
      const wanted = deadlineId
        ? `id:${deadlineId}`
        : embeddedDeadlineKey({ title: body.title, due_date: body.due_date });
      index = list.findIndex(
        (d) => d && typeof d === "object" && embeddedDeadlineKey(d) === wanted
      );
      if (index < 0) {
        return Response.json(
          { error: "not_found", message: "Frist nicht gefunden" },
          { status: 404 }
        );
      }
      deadline = list[index];
    } else {
      if (!DEADLINE_PAGE_TYPES.has(pageType)) {
        return Response.json(
          { error: "not_a_deadline", message: "Die Seite ist keine Frist." },
          { status: 400 }
        );
      }
      deadline = pageFm;
    }

    if (hasServerSecondCheck(deadline)) {
      // Already second-checked — never overwrite who did it.
      return apiSuccess({
        slug: targetSlug,
        deadlineId,
        second_check_by: deadline.second_check_by,
        second_check_at: deadline.second_check_at,
        already: true,
      });
    }

    const serverFirstIds = [
      deadline.created_by_id,
      deadline.reviewed_by_id,
      deadline.completed_by_id,
    ].filter(
      (v): v is string =>
        typeof v === "string" &&
        v.trim().length > 0 &&
        !["internal", "custom", "anonymous", "system"].includes(v.trim())
    );
    if (serverFirstIds.length === 0) {
      return Response.json(
        {
          error: "second_check_first_person_unknown",
          message:
            "Für diese Frist ist keine Erstperson erfasst. Bitte die Frist zuerst freigeben lassen — die Zweitprüfung muss dann eine andere Person durchführen.",
        },
        { status: 409 }
      );
    }

    const checkerIds = new Set(
      [ctx.user.id, ctx.user.name, ctx.user.email]
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        .map((v) => v.trim().toLowerCase())
    );
    const firstPersons = [
      deadline.created_by_email,
      deadline.reviewed_by,
      deadline.reviewed_by_id,
      deadline.completed_by,
      deadline.completed_by_id,
      deadline.created_by,
      deadline.created_by_id,
    ]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => v.trim().toLowerCase());
    if (firstPersons.some((p) => checkerIds.has(p))) {
      // NOTE: uses the explicit { error: <code>, message: <text> } shape, not
      // the apiError() helper — apiError() writes { error: <message>, code },
      // which src/lib/api.ts's request() parser reads backwards.
      return Response.json(
        {
          error: "second_check_self_blocked",
          message:
            "Die Zweitprüfung darf nicht von derselben Person durchgeführt werden, die die Frist angelegt, erstgeprüft oder erledigt hat.",
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const identity = ctx.user.name || ctx.user.email || "unknown";
    const stamp = {
      status: "done",
      completed_at: typeof deadline.completed_at === "string" ? deadline.completed_at : now,
      second_check_required: true,
      second_check_by: identity,
      second_check_by_id: ctx.user.id,
      second_check_by_email: ctx.user.email,
      second_check_at: now,
    };

    const auditEntry = {
      at: now,
      action: "second_check",
      actor: identity,
      actor_id: ctx.user.id,
      status_before: typeof deadline.status === "string" ? deadline.status : null,
      status_after: "done",
      server: true,
    };
    const auditLog = [
      ...(Array.isArray(deadline.audit_log) ? (deadline.audit_log as unknown[]) : []),
      auditEntry,
    ];

    let writeOk: boolean;
    if (embedded) {
      // Atomic: patch only this entry (addressed by its id) — never write the
      // whole deadlines[] back from the copy read above.
      const entryId = typeof deadline.id === "string" && deadline.id ? deadline.id : null;
      if (!entryId) {
        return Response.json(
          {
            error: "deadline_without_id",
            message:
              "Diese Frist hat noch keine eindeutige Kennung. Bitte die Akte einmal öffnen und speichern, dann erneut versuchen.",
          },
          { status: 409 }
        );
      }
      const mutateRes = await fetch(`${ENGINE_URL}/api/pages/array-mutate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify({
          slug: targetSlug,
          field: "deadlines",
          match_key: "id",
          match: [entryId],
          set: { ...stamp, updated_at: now, audit_log: auditLog },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      writeOk = mutateRes.ok;
      if (writeOk) {
        const storedVersion = Number(pageFm.version);
        await enginePatchPage(
          ctx.headers,
          {
            slug: targetSlug,
            frontmatter: { version: (Number.isFinite(storedVersion) ? storedVersion : 0) + 1 },
          },
          { timeoutMs: 15_000 }
        );
      }
    } else {
      const patchRes = await enginePatchPage(
        ctx.headers,
        { slug: targetSlug, frontmatter: { ...stamp, audit_log: auditLog } },
        { timeoutMs: 15_000 }
      );
      writeOk = patchRes.ok;
    }
    if (writeOk) {
      await logDeadlineEvents(ctx, [
        {
          kind: "complete",
          deadline_id: embedded ? `${targetSlug}#${String(deadline.id)}` : targetSlug,
          title: String(deadline.title ?? deadline.description ?? ""),
          is_notfrist: true,
          due_date_before: typeof deadline.due_date === "string" ? deadline.due_date : null,
          due_date_after: typeof deadline.due_date === "string" ? deadline.due_date : null,
          status_before: typeof deadline.status === "string" ? deadline.status : null,
          status_after: "done",
        },
      ]);
    }
    if (!writeOk) {
      return Response.json(
        { error: "engine_unreachable", message: "Zweitprüfung fehlgeschlagen" },
        { status: 503 }
      );
    }

    return apiSuccess({
      slug: targetSlug,
      deadlineId,
      second_check_by: identity,
      second_check_at: now,
    });
  }
);
