import { z } from "zod";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import {
  embeddedDeadlineKey,
  hasServerSecondCheck,
  readCurrentPage,
} from "@/lib/page-write-guards";

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

    const checkerIds = new Set(
      [ctx.user.id, ctx.user.name, ctx.user.email]
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        .map((v) => v.trim().toLowerCase())
    );
    const firstPersons = [
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

    const frontmatter = embedded
      ? {
          deadlines: list.map((d, i) =>
            i === index
              ? {
                  ...d,
                  ...stamp,
                  updated_at: now,
                  audit_log: [
                    ...(Array.isArray(d.audit_log) ? (d.audit_log as unknown[]) : []),
                    { at: now, action: "second_check", actor: identity },
                  ],
                }
              : d
          ),
        }
      : stamp;

    const patchRes = await enginePatchPage(
      ctx.headers,
      { slug: targetSlug, frontmatter },
      { timeoutMs: 15_000 }
    );
    if (!patchRes.ok) {
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
