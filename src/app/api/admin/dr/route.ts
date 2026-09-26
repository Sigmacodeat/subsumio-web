import { createHandler, apiError } from "@/lib/api-handler";
import { readDRStatus, getBackupTargets } from "@/lib/dr-client";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/admin/dr — Disaster Recovery status, read from the status files
 * the backup container writes (last backup run incl. offsite/file coverage,
 * last weekly restore verification). Nothing here is simulated.
 *
 * POST /api/admin/dr — not available: backups, restore verification and
 * restores run in the backup container on its schedule or by the operator on
 * the server (server/deploy/netcup/backup/). Answers 501, so no audit entry
 * claims an action that never happened.
 *
 * Operator only.
 */

export const GET = createHandler(
  {
    action: "platform.operator",
    cacheMaxAge: 0,
  },
  async () => {
    const status = await readDRStatus();
    const targets = getBackupTargets();

    return Response.json({
      timestamp: new Date().toISOString(),
      status,
      targets,
    });
  }
);

export const POST = createHandler(
  {
    action: "platform.operator",
    cacheMaxAge: 0,
  },
  async () =>
    apiError(
      "not_implemented",
      "Sicherung, Restore-Prüfung und Wiederherstellung laufen im Backup-Container auf dem Server (server/deploy/netcup/backup), nicht über die Konsole.",
      501
    )
);
