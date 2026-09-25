/**
 * deadline-audit.ts — writes the deadline change events produced by
 * `deadline-write-policy.ts` to the tamper-evident audit log (hash chain in
 * subsumio_audit_log): who changed which Frist, with due date / status before
 * and after, and the reason for a Notfrist change.
 */

import { logAudit } from "@/lib/audit";
import { auditActionFor, type DeadlineChangeEvent } from "@/lib/deadline-write-policy";

export async function logDeadlineEvents(
  ctx: { brainId?: string; user?: { id?: string; email?: string } },
  events: readonly DeadlineChangeEvent[]
): Promise<void> {
  for (const event of events) {
    await logAudit(auditActionFor(event.kind), "deadline", {
      entityId: event.deadline_id,
      brainId: ctx.brainId,
      userId: ctx.user?.id,
      userEmail: ctx.user?.email,
      details: { ...event },
    });
  }
}
