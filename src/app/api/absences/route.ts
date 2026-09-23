import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import {
  createAbsence,
  activateAbsence,
  completeAbsence,
  cancelAbsence,
  type AbsenceRecord,
} from "@/lib/absence";

const createAbsenceSchema = z.object({
  user_email: z.string().email(),
  user_name: z.string().min(1).max(200),
  delegate_email: z.string().email(),
  delegate_name: z.string().min(1).max(200),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
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
    let absences: AbsenceRecord[] = (
      Array.isArray(data) ? data : (data.pages ?? [])
    ) as AbsenceRecord[];

    if (query?.user_email) {
      absences = absences.filter((a) => a.user_email === query.user_email);
    }
    if (query?.status) {
      absences = absences.filter((a) => a.status === query.status);
    }

    return apiSuccess({ absences });
  }
);
