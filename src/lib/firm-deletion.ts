/**
 * Deleting a team firm's data after the contract ended (Art. 28 Abs. 3 lit. g
 * DSGVO, AVV § 9) — the operator's path. Two steps, fail-closed:
 *
 * 1. `scheduleFirmDeletion` (operator route): refused while a matter is under
 *    legal hold, while records must still be kept (closed matters within
 *    § 12 RAO / § 132 BAO, stamped receipts) or while matters are still open.
 *    Otherwise the deletion is set FIRM_DELETION_GRACE_DAYS ahead (time for
 *    the firm's export) and every member is signed out and deactivated.
 * 2. `purgeScheduledFirmDeletions` (trash-purge cron): once the date has
 *    passed, the same checks run again; only then is the brain's data purged
 *    on the engine (pages, originals, cache) and the members' accounts marked
 *    for deletion. Anything unclear keeps the data and is retried next run.
 *
 * Audit entries go to the web app's audit log under the firm's brain, which
 * survives the purge.
 */

import { getOrgStore, getStore, type Org } from "@/lib/auth/store";
import { revokeAllSessions } from "@/lib/auth/session";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { checkFirmLegalHolds, type LegalHoldCheckResult } from "@/lib/legal-hold-check";
import {
  checkFirmRetention,
  retainedMessage,
  type FirmRetentionResult,
} from "@/lib/firm-retention-check";
import { logAudit } from "@/lib/audit";
import type { Tenant } from "@/lib/tenants";

export const FIRM_DELETION_GRACE_DAYS = 30;

export class FirmDeletionRefused extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export interface FirmDeletionDeps {
  checkHolds?: (headers: Record<string, string>) => Promise<LegalHoldCheckResult>;
  checkRetention?: (headers: Record<string, string>) => Promise<FirmRetentionResult>;
  purgeBrain?: (brainId: string) => Promise<void>;
  now?: () => Date;
}

async function defaultPurgeBrain(brainId: string): Promise<void> {
  const res = await fetch(`${ENGINE_URL}/api/source-data`, {
    method: "DELETE",
    headers: engineHeadersForBrain(brainId),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`source data purge returned HTTP ${res.status}`);
}

/** Holds, retention and open matters of the firm brain; throws a refusal. */
async function assertDeletable(brainId: string, deps: FirmDeletionDeps): Promise<void> {
  const headers = engineHeadersForBrain(brainId);
  const holds = await (deps.checkHolds ?? checkFirmLegalHolds)(headers);
  if (holds.status === "unknown") {
    throw new FirmDeletionRefused(
      "legal_hold_unknown",
      "Legal-Hold-Status der Akten nicht prüfbar — Löschung abgebrochen.",
      503
    );
  }
  if (holds.status === "held") {
    throw new FirmDeletionRefused(
      "legal_hold_active",
      `Löschung blockiert: ${holds.cases.length} Akte(n) unter Legal Hold.`,
      409
    );
  }
  const retention = await (deps.checkRetention ?? checkFirmRetention)(headers);
  if (retention.status === "unknown") {
    throw new FirmDeletionRefused(
      "retention_unknown",
      "Aufbewahrungsfristen nicht prüfbar — Löschung abgebrochen.",
      503
    );
  }
  if (retention.status === "retained") {
    throw new FirmDeletionRefused("retention_period_running", retainedMessage(retention), 409);
  }
}

export async function scheduleFirmDeletion(
  tenant: Tenant,
  input: { reason: string; operatorEmail: string },
  deps: FirmDeletionDeps = {}
): Promise<{ scheduledFor: string; membersDeactivated: number }> {
  if (tenant.kind !== "org" || !tenant.org) {
    throw new FirmDeletionRefused(
      "not_a_team_firm",
      "Einzelkanzleien löschen ihr Konto selbst (Einstellungen → Privatsphäre).",
      400
    );
  }
  const org = tenant.org;
  if (org.dataDeletedAt) {
    throw new FirmDeletionRefused(
      "already_deleted",
      "Die Kanzleidaten sind bereits gelöscht.",
      409
    );
  }
  if (org.deletionScheduledFor) {
    throw new FirmDeletionRefused(
      "already_scheduled",
      "Die Löschung dieser Kanzlei ist bereits angesetzt.",
      409
    );
  }
  await assertDeletable(org.brainId, deps);

  const now = (deps.now ?? (() => new Date()))();
  const scheduledFor = new Date(
    now.getTime() + FIRM_DELETION_GRACE_DAYS * 86_400_000
  ).toISOString();
  const store = getStore();
  const members = await store.listByOrg(org.id);
  const active = members.filter((m) => !m.deactivatedAt);
  await getOrgStore().update(org.id, {
    deletionScheduledFor: scheduledFor,
    deletionRequestedAt: now.toISOString(),
    deletionRequestedBy: input.operatorEmail,
    deletionReason: input.reason,
    deletionDeactivatedMemberIds: active.map((m) => m.id),
  });
  for (const m of active) {
    await store.update(m.id, { deactivatedAt: now.toISOString() });
    await revokeAllSessions(m.id);
  }
  return { scheduledFor, membersDeactivated: active.length };
}

export async function cancelFirmDeletion(tenant: Tenant): Promise<{ restored: number }> {
  const org = tenant.kind === "org" ? tenant.org : undefined;
  if (!org?.deletionScheduledFor || org.dataDeletedAt) {
    throw new FirmDeletionRefused("not_scheduled", "Es ist keine Löschung angesetzt.", 409);
  }
  const store = getStore();
  let restored = 0;
  for (const id of org.deletionDeactivatedMemberIds ?? []) {
    const m = await store.getById(id);
    if (m && m.orgId === org.id && m.deactivatedAt && !org.suspendedAt) {
      await store.update(id, { deactivatedAt: null });
      restored++;
    }
  }
  await getOrgStore().update(org.id, {
    deletionScheduledFor: null,
    deletionRequestedAt: null,
    deletionRequestedBy: null,
    deletionReason: null,
    deletionDeactivatedMemberIds: null,
  });
  return { restored };
}

export interface FirmPurgeReport {
  failed: number;
  errors: string[];
  skippedHold: number;
}

/** Cron step: purge every firm whose scheduled deletion date has passed. */
export async function purgeScheduledFirmDeletions(
  report: FirmPurgeReport,
  deps: FirmDeletionDeps = {}
): Promise<number> {
  const now = (deps.now ?? (() => new Date()))();
  const due = (await getOrgStore().list()).filter(
    (o: Org) =>
      !o.dataDeletedAt &&
      !!o.deletionScheduledFor &&
      Date.parse(o.deletionScheduledFor) <= now.getTime()
  );
  let purged = 0;
  for (const org of due) {
    try {
      try {
        await assertDeletable(org.brainId, deps);
      } catch (err) {
        if (err instanceof FirmDeletionRefused) {
          // Kept (hold, retention, open matter, or unclear) — retried next run.
          report.skippedHold++;
          continue;
        }
        throw err;
      }
      await (deps.purgeBrain ?? defaultPurgeBrain)(org.brainId);
      const store = getStore();
      const members = await store.listByOrg(org.id);
      for (const m of members) {
        // The accounts follow through the regular 30-day user purge.
        await store.update(m.id, {
          deactivatedAt: m.deactivatedAt ?? now.toISOString(),
          deletedAt: now.toISOString(),
        });
        await revokeAllSessions(m.id);
      }
      await getOrgStore().update(org.id, { dataDeletedAt: now.toISOString() });
      purged++;
      void logAudit("admin.tenant_data_deleted", "org", {
        entityId: org.id,
        brainId: org.brainId,
        details: {
          reason: org.deletionReason ?? null,
          requestedBy: org.deletionRequestedBy ?? null,
          members: members.length,
        },
      });
    } catch (err) {
      report.failed++;
      report.errors.push(
        `org ${org.id}: firm data purge failed — ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  return purged;
}
