import { NextRequest } from "next/server";
import { createCronHandler } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/case-scanner — deactivated.
 *
 * The case scanner runs on demand only: a lawyer or admin starts it for one
 * matter, a selection or all open matters, after a cost preview in credits
 * (Akten-Scanner in the dashboard). There is no nightly run, so no agent work
 * and no model costs start without someone confirming them. The route stays
 * so an old scheduler entry gets an honest answer instead of a 404; it is
 * not in server/deploy/netcup/crontab.
 */
export const GET = createCronHandler(async (_req: NextRequest) => {
  return Response.json(
    {
      ok: false,
      disabled: true,
      message:
        "Der automatische Akten-Scan ist deaktiviert. Scans starten nur auf Abruf im Dashboard (Akten-Scanner).",
    },
    { status: 410 }
  );
});
