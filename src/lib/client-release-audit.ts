/**
 * Audit trail for client releases: who released (or withdrew) which document
 * of a matter for the client, written to the tamper-evident audit log.
 */
import { logAudit, SYSTEM_BRAIN } from "@/lib/audit";
import type { ClientReleaseChange } from "@/lib/page-write-guards";

export async function logClientReleaseChanges(
  ctx: { brainId?: string; user?: { id?: string; email?: string } },
  caseSlug: string,
  changes: readonly ClientReleaseChange[] | undefined
): Promise<void> {
  for (const change of changes ?? []) {
    await logAudit("portal.document_release", "document", {
      entityId: change.slug ?? caseSlug,
      brainId: ctx.brainId ?? SYSTEM_BRAIN,
      userId: ctx.user?.id,
      userEmail: ctx.user?.email,
      details: { case_slug: caseSlug, name: change.name, released: change.released },
    });
  }
}
