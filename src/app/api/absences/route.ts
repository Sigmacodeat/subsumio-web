import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import { getStore } from "@/lib/auth/store";
import {
  createAbsence,
  activateAbsence,
  completeAbsence,
  cancelAbsence,
  deadlineSlugsCoveredByAbsence,
  absenceHasStarted,
  findOverlappingAbsence,
  ABSENCE_KINDS,
  type AbsenceRecord,
} from "@/lib/absence";

import { logger } from "@/lib/logger";
const log = logger("api/absences");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const createAbsenceSchema = z
  .object({
    user_email: z.string().email(),
    user_name: z.string().min(1).max(200),
    // Firm member: e-mail required (checked against the firm's accounts).
    // External Substitut / mittlerweiliger Stellvertreter (§ 34 RAO):
    // `substitute_external: true`, name required, e-mail and firm optional.
    substitute_external: z.boolean().default(false),
    delegate_email: z
      .string()
      .trim()
      .max(300)
      .optional()
      .transform((v) => v || undefined)
      .pipe(z.string().email().optional()),
    delegate_name: z.string().trim().min(1).max(200),
    delegate_firm: z.string().trim().max(200).optional(),
    // ISO calendar dates — free-text previously passed through and produced
    // absence records that never activate.
    start_date: z.string().regex(DATE_RE, "invalid_date"),
    end_date: z.string().regex(DATE_RE, "invalid_date"),
    // Required: decides whether the absence counts against the vacation
    // account (a free-text reason did so only by accident).
    kind: z.enum(ABSENCE_KINDS),
    reason: z.string().max(500).optional(),
    auto_route_enabled: z.boolean().default(true),
    notes: z.string().max(2000).optional(),
  })
  .refine((b) => b.substitute_external || Boolean(b.delegate_email), {
    message: "delegate_email_required",
    path: ["delegate_email"],
  });

/** Every absence record, strictly read (a partial list would miss a clash). */
async function listAbsences(headers: Record<string, string>): Promise<AbsenceRecord[]> {
  const pages = await listEnginePages(headers, "absence_record", 10_000, { strict: true });
  return pages
    .map((p) => p.frontmatter as unknown as AbsenceRecord | undefined)
    .filter((a): a is AbsenceRecord => Boolean(a));
}

function overlapError(clash: AbsenceRecord) {
  return apiError(
    "absence_overlap",
    `Für diese Person ist im Zeitraum bereits eine Abwesenheit eingetragen (${clash.start_date.slice(0, 10)} bis ${clash.end_date.slice(0, 10)}). Bitte diese anpassen oder stornieren.`,
    409
  );
}

/**
 * Which open deadlines / follow-ups the delegate covers: the matter's
 * responsible lawyer is the absent person and the due date falls inside the
 * absence. Best-effort — a failed listing must not block the absence itself.
 */
async function forwardedDeadlinesFor(
  headers: Record<string, string>,
  absence: AbsenceRecord
): Promise<string[]> {
  try {
    const [deadlinePages, followUpPages, casePages] = await Promise.all([
      listEnginePages(headers, "legal_deadline", 5000),
      listEnginePages(headers, "legal_follow_up", 5000),
      listEnginePages(headers, "legal_case", 2000),
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
    return deadlineSlugsCoveredByAbsence(absence, items, responsibleByCase);
  } catch (err) {
    log.error(
      "[absences] forwarded-deadline scan failed:",
      err instanceof Error ? err.message : String(err)
    );
    return absence.forwarded_deadlines ?? [];
  }
}

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
        kind: body.kind,
        auto_route_enabled: body.auto_route_enabled,
      },
    }),
  },
  async (ctx, body) => {
    if (new Date(body.end_date) < new Date(body.start_date)) {
      return apiError("invalid_dates", "Enddatum muss nach Startdatum liegen", 422);
    }
    if (
      body.delegate_email &&
      body.user_email.toLowerCase() === body.delegate_email.toLowerCase()
    ) {
      return apiError(
        "self_delegation",
        "Die Vertretung muss eine andere Person sein als die abwesende Person.",
        422
      );
    }

    // A firm-member stand-in must be an active member of the firm — a typo
    // would otherwise leave every deadline of the absence with nobody. An
    // explicitly external stand-in (§ 34 RAO) has no account to check.
    if (ctx.user.orgId && !body.substitute_external && body.delegate_email) {
      let delegate: Awaited<ReturnType<ReturnType<typeof getStore>["getByEmail"]>>;
      try {
        delegate = await getStore().getByEmail(body.delegate_email.trim().toLowerCase());
      } catch {
        return apiError("store_unavailable", "Kanzleikonten konnten nicht geprüft werden", 503);
      }
      if (
        !delegate ||
        delegate.orgId !== ctx.user.orgId ||
        delegate.deactivatedAt ||
        delegate.role === "client_viewer"
      ) {
        return apiError(
          "delegate_not_member",
          "Die Vertretung muss ein aktives Mitglied der Kanzlei sein.",
          422
        );
      }
    }

    // One absence per person at a time: with two overlapping records the
    // stand-in shown on a deadline would depend on the listing order.
    let existing: AbsenceRecord[];
    try {
      existing = await listAbsences(ctx.headers);
    } catch {
      return apiError("engine_error", "Bestehende Abwesenheiten konnten nicht geprüft werden", 502);
    }
    const clash = findOverlappingAbsence(existing, body);
    if (clash) return overlapError(clash);

    let absence = createAbsence(body);
    // Already under way (e.g. entered on the first sick day): active from the
    // start, with the covered deadlines recorded right away — there is no
    // separate "activate" step for a running absence.
    if (absenceHasStarted(absence)) {
      absence = activateAbsence(absence);
      absence.forwarded_deadlines = await forwardedDeadlinesFor(ctx.headers, absence);
    }

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

    // Reopening a cancelled/completed absence must not create an overlap
    // that creating it anew would have been refused for.
    if (
      body.action === "activate" &&
      (record.status === "cancelled" || record.status === "completed")
    ) {
      let existing: AbsenceRecord[];
      try {
        existing = await listAbsences(ctx.headers);
      } catch {
        return apiError(
          "engine_error",
          "Bestehende Abwesenheiten konnten nicht geprüft werden",
          502
        );
      }
      const clash = findOverlappingAbsence(existing, record);
      if (clash) return overlapError(clash);
    }

    const updated =
      body.action === "activate"
        ? activateAbsence(record)
        : body.action === "complete"
          ? completeAbsence(record)
          : cancelAbsence(record);

    // On activation, record which open reminders the delegate is covering.
    if (body.action === "activate") {
      updated.forwarded_deadlines = await forwardedDeadlinesFor(ctx.headers, updated);
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
    // Every record (paged past the engine's 100-row cap), deleted ones left
    // out; a failed read is an error, never a shortened list.
    let pages: Awaited<ReturnType<typeof listEnginePages>>;
    try {
      pages = await listEnginePages(ctx.headers, "absence_record", 10_000, { strict: true });
    } catch {
      return apiError("engine_error", "Engine request failed", 502);
    }
    // Pages wrap the record in `frontmatter` — filtering on the wrapper
    // fields made every user_email/status query return [].
    let absences: AbsenceRecord[] = pages
      .map((page) => page.frontmatter as unknown as AbsenceRecord | undefined)
      .filter((a): a is AbsenceRecord => Boolean(a));

    if (query?.user_email) {
      absences = absences.filter((a) => a.user_email === query.user_email);
    }
    if (query?.status) {
      absences = absences.filter((a) => a.status === query.status);
    }

    return apiSuccess({ absences });
  }
);
