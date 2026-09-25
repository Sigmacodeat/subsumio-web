import { NextResponse } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import { TRASH_TYPES, toTrashItem, isTrashExpired, type TrashItem } from "@/lib/trash";
import { getRecipientsByBrain } from "@/lib/cron-utils";
import { loadKanzleiSettingsForBrain } from "@/lib/kanzlei-settings-server";
import { normalizeTrashRetentionDays } from "@/lib/kanzlei-settings";
import { logAudit } from "@/lib/audit";
import { getSharedPgPool } from "@/lib/auth/store";
import { purgeExpiredSoftDeletedUsers } from "@/lib/user-purge";
import { purgeOldTrackingEvents } from "@/lib/email/tracking";

import { logger } from "@/lib/logger";
const log = logger("api/cron/trash-purge");

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * E-Mail-Tracking-Events (Öffnen/Klicken) tragen IP-Adresse und User-Agent
 * des Empfängers — personenbezogene Daten. Der Nachweis der Zustellung bleibt
 * über den aggregierten tracking_status der Nachricht erhalten, deshalb
 * reichen 90 Tage für die Einzelereignisse (Marktstandard für ESP-Logs und
 * im Einklang mit den sonstigen technischen Fristen dieses Jobs).
 */
const EMAIL_TRACKING_RETENTION_DAYS = 90;

/**
 * GET /api/cron/trash-purge — endgültige Löschung abgelaufener Papierkorb-
 * Einträge (DSGVO-Löschkonzept).
 *
 * Zweistufiges Modell: dieser Job setzt den Engine-Soft-Delete (`deleted_at`)
 * auf Einträge, deren Aufbewahrungsfrist (Kanzlei-Setting `trashRetentionDays`,
 * Default 30 Tage) abgelaufen ist. Der Autopilot-Purge der Engine löscht sie
 * 72 h später physisch — bis dahin bleibt ein letztes Recovery-Fenster.
 *
 * Fail-closed überall:
 *  - Settings unlesbar → Brain wird übersprungen (nie mit Defaults löschen).
 *  - `trashAutoPurge: false` → Brain wird übersprungen.
 *  - `legal_hold` auf dem Eintrag ODER seiner Akte → nie gelöscht.
 *  - Eintrag ohne `deleted_at`/`tombstoned_at` → nie gelöscht.
 *  - Einzelner Purge schlägt fehl → geht in errors[], Run antwortet 500.
 */
export const GET = createCronHandler(async () => {
  const now = new Date();
  const report = {
    purged: 0,
    skippedHold: 0,
    brainsDisabled: 0,
    failed: 0,
    errors: [] as string[],
  };

  const recipientsByBrain = await getRecipientsByBrain();

  for (const [brainId] of recipientsByBrain) {
    // Fail-closed: an unreadable settings page must not silently fall back to
    // "purge with defaults" — a firm that disabled auto-purge would lose data.
    let retentionDays: number;
    try {
      const settings = await loadKanzleiSettingsForBrain(brainId);
      if (settings.trashAutoPurge === false) {
        report.brainsDisabled++;
        continue;
      }
      retentionDays = normalizeTrashRetentionDays(settings.trashRetentionDays);
    } catch (err) {
      report.failed++;
      report.errors.push(
        `brain ${brainId}: settings unreadable — ${err instanceof Error ? err.message : String(err)}`
      );
      continue;
    }

    const headers = engineHeadersForBrain(brainId);

    // Collect expired trash items across all trash types.
    const expired: TrashItem[] = [];
    try {
      for (const type of TRASH_TYPES) {
        const pages = await listEnginePages(headers, type, 5000, {
          includeTombstoned: true,
          strict: true,
        });
        for (const page of pages) {
          const item = toTrashItem(page);
          if (item && isTrashExpired(item, retentionDays, now)) expired.push(item);
        }
      }
    } catch (err) {
      report.failed++;
      report.errors.push(
        `brain ${brainId}: list failed — ${err instanceof Error ? err.message : String(err)}`
      );
      continue;
    }
    if (expired.length === 0) continue;

    // Legal hold: the item's own flag, plus its parent matter's hold — a held
    // case must protect everything in it (mirrors the DELETE guard in
    // api/pages/[...slug]). Case lookups are cached per brain.
    const caseHold = new Map<string, boolean>();
    const caseIsHeld = async (caseSlug: string): Promise<boolean> => {
      const cached = caseHold.get(caseSlug);
      if (cached !== undefined) return cached;
      let held = false;
      try {
        const res = await fetch(
          `${ENGINE_URL}/api/pages/${caseSlug.split("/").map(encodeURIComponent).join("/")}`,
          { headers, signal: AbortSignal.timeout(10_000) }
        );
        if (res.ok) {
          const page = (await res.json()) as { frontmatter?: Record<string, unknown> };
          held = page.frontmatter?.legal_hold === true;
        }
      } catch {
        // Unreadable parent → treat as held (fail-closed, never purge on doubt).
        held = true;
      }
      caseHold.set(caseSlug, held);
      return held;
    };

    for (const item of expired) {
      try {
        const held =
          item.legal_hold === true || (item.case_slug ? await caseIsHeld(item.case_slug) : false);
        if (held) {
          report.skippedHold++;
          continue;
        }

        const path = item.slug.split("/").map(encodeURIComponent).join("/");
        const res = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
          method: "DELETE",
          headers,
          signal: AbortSignal.timeout(15_000),
        });
        // 404 = already gone (restored-and-redeleted race, or purged earlier).
        if (!res.ok && res.status !== 404) {
          throw new Error(`engine delete returned HTTP ${res.status}`);
        }

        report.purged++;
        void logAudit("trash.purge", "page", {
          entityId: item.slug,
          details: {
            title: item.title,
            type: item.type,
            kind: item.kind,
            deletedAt: item.deleted_at,
            reason: item.reason,
            retentionDays,
            brainId,
          },
        });

        // DSGVO-Vollständigkeit: Versionssnapshots tragen den Dokumentinhalt —
        // "endgültig gelöscht" muss sie mitnehmen, sonst lebt der Inhalt unter
        // legal/doc-versions/<slug>/ weiter.
        if (item.type === "document") {
          try {
            const versions = await listEnginePages(headers, "document_version", 200, {
              slugPrefix: `legal/doc-versions/${item.slug}/`,
            });
            for (const v of versions) {
              const vPath = v.slug.split("/").map(encodeURIComponent).join("/");
              const vRes = await fetch(`${ENGINE_URL}/api/pages/${vPath}`, {
                method: "DELETE",
                headers,
                signal: AbortSignal.timeout(15_000),
              });
              if (vRes.ok || vRes.status === 404) report.purged++;
              else throw new Error(`version ${v.slug}: HTTP ${vRes.status}`);
            }
          } catch (err) {
            report.failed++;
            report.errors.push(
              `${item.slug} versions: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      } catch (err) {
        report.failed++;
        report.errors.push(`${item.slug}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // Soft-deleted users past their 30-day grace period are hard-deleted —
  // admin/data-delete only marks them; without this the promise never lands.
  // A hold placed after the soft-delete (during the grace window) is caught
  // here too: purgeExpiredSoftDeletedUsers re-checks per firm via the same
  // checkFirmLegalHolds() admin/data-delete used at the initial request.
  let usersPurged = 0;
  let trackingEventsPurged = 0;
  const pgPool = getSharedPgPool();
  if (pgPool) {
    try {
      usersPurged = await purgeExpiredSoftDeletedUsers(pgPool, report);
    } catch (err) {
      report.failed++;
      report.errors.push(`user purge: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      trackingEventsPurged = await purgeOldTrackingEvents(EMAIL_TRACKING_RETENTION_DAYS);
    } catch (err) {
      report.failed++;
      report.errors.push(
        `email-tracking purge: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // A run with errors answers 500 so supercronic marks the job FAILED.
  const ok = report.errors.length === 0;
  if (!ok) log.error("[trash-purge] completed with errors", { errors: report.errors });
  return NextResponse.json(
    { ok, ...report, users_purged: usersPurged, tracking_events_purged: trackingEventsPurged },
    { status: ok ? 200 : 500 }
  );
});
