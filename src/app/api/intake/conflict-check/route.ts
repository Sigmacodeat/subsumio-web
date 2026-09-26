import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { intakeFromPage } from "@/lib/intake";
import { defaultAcceptanceWorkflow } from "@/lib/intake-acceptance";
import { checkPartiesConflicts, conflictCheckRecord, intakeParties } from "@/lib/conflict-gate";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import type { BrainPage } from "@/lib/types";

import { logger } from "@/lib/logger";
const log = logger("api/intake/conflict-check");

export const dynamic = "force-dynamic";

const schema = z.object({
  slug: z.string().min(1, "slug_required"),
});

function encodeSlug(slug: string): string {
  return slug.split("/").map(encodeURIComponent).join("/");
}

/**
 * Kollisionsprüfung der Mandatsannahme (§ 10 Abs 1 RAO), serverseitig: der
 * Server prüft den künftigen Mandanten (Seite „Mandant") und — falls erfasst —
 * die Gegenseite (Seite „Gegner") und schreibt das Ergebnis mit dem echten
 * Nutzer in `acceptance.conflict_check`. Der Client kann dieses Ergebnis
 * nicht selbst setzen.
 */
export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: schema,
    audit: (ctx, body) => ({
      action: "conflict.check" as const,
      entityType: "intake_request",
      entityId: body.slug,
      details: { performed_by: ctx.user.email },
    }),
  },
  async (ctx, body) => {
    const getRes = await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(body.slug)}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!getRes.ok) return apiError("intake_not_found", "Intake konnte nicht geladen werden", 404);
    const intake = intakeFromPage((await getRes.json()) as BrainPage);
    if (!intake) return apiError("not_intake_request", "Die Seite ist kein Intake", 400);

    const parties = intakeParties(intake.frontmatter as unknown as Record<string, unknown>);
    if (parties.length === 0) {
      return apiError(
        "client_name_missing",
        "Mandantenname fehlt — ohne Namen ist keine Kollisionsprüfung möglich.",
        422
      );
    }

    let outcome;
    try {
      outcome = await checkPartiesConflicts(ctx.headers, parties);
    } catch (err) {
      log.error("conflict check failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return apiError(
        "conflict_check_unavailable",
        "Kollisionsprüfung derzeit nicht verfügbar. Bitte später erneut versuchen.",
        503
      );
    }

    const record = conflictCheckRecord(outcome, {
      id: ctx.user.id,
      email: ctx.user.email,
      role: ctx.user.role,
    });
    const acceptance = {
      ...(intake.frontmatter.acceptance ?? defaultAcceptanceWorkflow()),
      conflict_check: record,
    };
    const conflictStatus =
      record.status === "conflict"
        ? "conflict"
        : outcome.severity === "low"
          ? "needs_review"
          : "clear";

    const writeRes = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify({
        slug: body.slug,
        title: intake.title,
        type: "intake_request",
        merge: true,
        frontmatter: {
          acceptance,
          conflict_check_status: conflictStatus,
          updated_at: new Date().toISOString(),
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!writeRes.ok) {
      return apiError("intake_update_failed", "Prüfergebnis konnte nicht gespeichert werden", 502);
    }

    broadcastSseEvent(ctx.brainId, "intake.updated", { slug: body.slug, by: ctx.user.email });
    return apiSuccess({ conflict_check: record, outcome, conflict_check_status: conflictStatus });
  }
);
