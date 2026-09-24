import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import {
  createAbsence,
  activateAbsence,
  completeAbsence,
  cancelAbsence,
  deadlineSlugsCoveredByAbsence,
  type AbsenceRecord,
} from "@/lib/absence";

import { logger } from "@/lib/logger";
const log = logger("api/absences");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const createAbsenceSchema = z.object({
  user_email: z.string().email(),
  user_name: z.string().min(1).max(200),
  delegate_email: z.string().email(),
  delegate_name: z.string().min(1).max(200),
  // ISO calendar dates — free-text previously passed through and produced
  // absence records that never activate.
  start_date: z.string().regex(DATE_RE, "invalid_date"),
  end_date: z.string().regex(DATE_RE, "invalid_date"),
  reason: z.string().max(500).optional(),
  auto_route_enabled: z.boolean().default(true),
  notes: z.string().max(2000).optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: createAbsenceSchema,
    audit: (_ctx, body) => ({
      action: "absence.create" as const,
      entityType: "absence_record",
      details: {
        start_date: body.start_date,
        end_date: body.end_date,
        auto_route_enabled: body.auto_route_enabled,
      },
    }),
  },
  async (ctx, body) => {
    if (new Date(body.end_date) < new Date(body.start_date)) {
      return apiError("invalid_dates", "Enddatum muss nach Startdatum liegen", 422);
    }
    if (body.user_email.toLowerCase() === body.delegate_email.toLowerCase()) {
      return apiError(
        "self_delegation",
        "Die Vertretung muss eine andere Person sein als die abwesende Person.",
        422
      );
    }

    const absence = createAbsence(body);

    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `legal/absences/${absence.id}`,
        title: `Abwesenheit: ${body.user_name} → ${body.delegate_name}`,
        type: "absence_record",
        frontmatter: absence,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    // Was fire-and-forget: a failed engine write still returned 200 with
    // the absence record, so a Vertretung (deadline stand-in during the
    // absence) could silently fail to be registered.
    if (!res.ok) {
      return apiError(
        "engine_write_failed",
        "Abwesenheit konnte nicht gespeichert werden",
        res.status >= 500 ? 502 : res.status
      );
    }

    return apiSuccess({ absence });
  }
);

const patchAbsenceSchema = z.object({
  // IDs are generated as `absence-<ts>-<rand>` — a strict charset keeps the
  // id safe to embed in the engine page slug.
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/),
  action: z.enum(["activate", "complete", "cancel"]),
});

/**
 * PATCH: Status-Übergang einer Abwesenheit (aktivieren / abschließen /
 * stornieren). Stornieren ist der Alltagsfall — ein falsch eingetragener
 * Urlaub darf nicht für immer „Vertretung"-Hinweise auf Fristen zeigen.
 * isAbsenceActive respektiert `status === "cancelled"` sofort.
 */
export const PATCH = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: patchAbsenceSchema,
    audit: (_ctx, body) => ({
      action: "absence.update" as const,
      entityType: "absence_record",
      entityId: body.id,
      details: { transition: body.action },
    }),
  },
  async (ctx, body) => {
    const slug = `legal/absences/${body.id}`;
    const res = await fetch(
      `${ENGINE_URL}/api/pages/${slug.split("/").map(encodeURIComponent).join("/")}`,
      { headers: ctx.headers, signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) {
      return apiError("absence_not_found", "Abwesenheit nicht gefunden", 404);
    }
    const page = (await res.json()) as { frontmatter?: AbsenceRecord };
    const record = page.frontmatter;
    if (!record || record.id !== body.id) {
      return apiError("absence_not_found", "Abwesenheit nicht gefunden", 404);
    }
    // Closed records only accept `activate` — that is the deliberate undo
    // for a mistakenly completed/cancelled absence. complete/cancel on a
    // closed record is a real conflict.
    if (
      body.action !== "activate" &&
      (record.status === "cancelled" || record.status === "completed")
    ) {
      return apiError(
        "absence_closed",
        "Diese Abwesenheit ist bereits abgeschlossen oder storniert.",
        409
      );
    }

    const updated =
      body.action === "activate"
        ? activateAbsence(record)
        : body.action === "complete"
          ? completeAbsence(record)
          : cancelAbsence(record);

    // On activation, record which open reminders the delegate is covering —
    // the absences page already renders forwarded_deadlines.length, it was
    // simply never populated. Best-effort: a failed listing must not block
    // the transition itself.
    if (body.action === "activate") {
      try {
        const [deadlinePages, followUpPages, casePages] = await Promise.all([
          listEnginePages(ctx.headers, "legal_deadline", 5000),
          listEnginePages(ctx.headers, "legal_follow_up", 5000),
          listEnginePages(ctx.headers, "legal_case", 2000),
        ]);
        const responsibleByCase = new Map<string, string>();
        for (const c of casePages) {
          const lawyer = c.frontmatter?.own_lawyer_name;
          if (typeof lawyer === "string" && lawyer.trim()) {
            responsibleByCase.set(c.slug, lawyer);
          }
        }
        const items = [...deadlinePages, ...followUpPages].map((p) => {
          const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
          return {
            slug: p.slug,
            case_slug: typeof fm.case_slug === "string" ? fm.case_slug : undefined,
            due_date:
              typeof fm.due_date === "string"
                ? fm.due_date
                : typeof fm.date === "string"
                  ? fm.date
                  : undefined,
            status: typeof fm.status === "string" ? fm.status : undefined,
            review_status: typeof fm.review_status === "string" ? fm.review_status : undefined,
            completed: fm.completed === true,
          };
        });
        updated.forwarded_deadlines = deadlineSlugsCoveredByAbsence(
          updated,
          items,
          responsibleByCase
        );
      } catch (err) {
        log.error(
          "[absences] forwarded-deadline scan failed:",
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    const patch = await enginePatchPage(ctx.headers, {
      slug,
      frontmatter: { ...updated },
    });
    if (!patch.ok) {
      return apiError("engine_write_failed", "Abwesenheit konnte nicht aktualisiert werden", 502);
    }
    return apiSuccess({ absence: updated });
  }
);

const listAbsenceQuerySchema = z.object({
  user_email: z.string().email().optional(),
  status: z.enum(["planned", "active", "completed", "cancelled"]).optional(),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: listAbsenceQuerySchema,
  },
  async (ctx, _body, query) => {
    const params = new URLSearchParams({ type: "absence_record", limit: "100" });
    const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return apiError("engine_error", "Engine request failed", 502);
    const data = await res.json();
    // Pages wrap the record in `frontmatter` — filtering on the wrapper
    // fields made every user_email/status query return [].
    let absences: AbsenceRecord[] = (Array.isArray(data) ? data : (data.pages ?? [])).map(
      (p: unknown) => {
        const page = p as { frontmatter?: AbsenceRecord };
        return (page.frontmatter ?? (p as AbsenceRecord)) as AbsenceRecord;
      }
    );

    if (query?.user_email) {
      absences = absences.filter((a) => a.user_email === query.user_email);
    }
    if (query?.status) {
      absences = absences.filter((a) => a.status === query.status);
    }

    return apiSuccess({ absences });
  }
);
