/**
 * deadline-audit.ts — writes the deadline change events produced by
 * `deadline-write-policy.ts` to the tamper-evident audit log (hash chain in
 * subsumio_audit_log): who changed which Frist, with due date / status before
 * and after, and the reason for a Notfrist change.
 *
 * A Notfrist that is cancelled, rejected or moved additionally notifies the
 * firm's other lawyers and admins (in-app), so a second person sees every
 * such change the day it happens.
 */

import { logAudit, SYSTEM_BRAIN } from "@/lib/audit";
import { auditActionFor, type DeadlineChangeEvent } from "@/lib/deadline-write-policy";
import { logger } from "@/lib/logger";

const log = logger("lib/deadline-audit");

export async function logDeadlineEvents(
  ctx: { brainId?: string; user?: { id?: string; email?: string } },
  events: readonly DeadlineChangeEvent[]
): Promise<void> {
  for (const event of events) {
    await logAudit(auditActionFor(event.kind), "deadline", {
      entityId: event.deadline_id,
      brainId: ctx.brainId ?? SYSTEM_BRAIN,
      userId: ctx.user?.id,
      userEmail: ctx.user?.email,
      details: { ...event },
    });
  }
  const notable = events.filter(isNotableNotfristChange);
  if (notable.length > 0) await notifySecondPersons(ctx, notable);
}

/** Cancelled, rejected or moved Notfrist — the changes a second person must see. */
export function isNotableNotfristChange(e: DeadlineChangeEvent): boolean {
  if (!e.is_notfrist) return false;
  if (e.kind === "cancel" || e.kind === "reject") return true;
  return e.kind === "update" && (e.due_date_before ?? null) !== (e.due_date_after ?? null);
}

function describe(e: DeadlineChangeEvent, actor: string): string {
  const what =
    e.kind === "cancel"
      ? "storniert"
      : e.kind === "reject"
        ? "verworfen"
        : `verschoben (${e.due_date_before ?? "—"} → ${e.due_date_after ?? "—"})`;
  const reason = e.reason ? ` Begründung: ${e.reason}` : "";
  return `Notfrist „${e.title || "ohne Bezeichnung"}“ wurde von ${actor} ${what}.${reason}`;
}

/** In-app notice to the firm's other lawyers/admins. Best effort, never throws. */
async function notifySecondPersons(
  ctx: { brainId?: string; user?: { id?: string; email?: string } },
  events: readonly DeadlineChangeEvent[]
): Promise<void> {
  try {
    const actorId = ctx.user?.id;
    const brainId = ctx.brainId;
    if (!actorId || !brainId) return;
    const { getStore } = await import("@/lib/auth/store");
    const store = getStore();
    const actor = await store.getById(actorId);
    if (!actor?.orgId) return;
    const recipients = (await store.listByOrg(actor.orgId)).filter(
      (u) => u.id !== actorId && !u.deactivatedAt && (u.role === "admin" || u.role === "lawyer")
    );
    if (recipients.length === 0) return;
    const { persistNotificationUpsert } = await import("@/lib/comments");
    const label = actor.name || actor.email || "einer Person";
    const at = new Date().toISOString();
    for (const e of events) {
      const caseSlug = e.deadline_id.includes("#") ? e.deadline_id.split("#")[0] : undefined;
      for (const r of recipients) {
        await persistNotificationUpsert({
          id: `notif_nf_${e.deadline_id}_${e.kind}_${at}`.replace(/[^A-Za-z0-9_:.-]/g, "_"),
          userId: r.id,
          brainId,
          type: "system",
          data: { message: describe(e, label), caseSlug, deadline_id: e.deadline_id },
          readAt: null,
          createdAt: at,
        });
      }
    }
  } catch (err) {
    log.error("[deadline-audit] Notfrist notice not delivered", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
