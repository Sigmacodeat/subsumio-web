import { NextRequest } from "next/server";
import { z } from "zod";
import { requireInternalSecret } from "@/lib/auth/internal-guard";
import { logAudit, SYSTEM_BRAIN } from "@/lib/audit";
import { notifyOps } from "@/lib/ops-alert";

import { logger } from "@/lib/logger";
const log = logger("api/internal/alert");

export const dynamic = "force-dynamic";

const AlertBody = z.object({
  type: z.string().trim().min(1).max(100),
  severity: z.enum(["info", "warning", "error", "critical"]),
  message: z.string().trim().min(1).max(2000),
  details: z.unknown().optional(),
});

/**
 * POST /api/internal/alert — internal endpoint for the engine and the corpus
 * pipeline to raise alerts. Authenticated via x-internal-secret header
 * (timing-safe comparison), rate-limited per IP.
 *
 * Every alert lands in the system audit log. `error` and `critical` alerts
 * are additionally mailed to the ops mailbox (QUEUE_ALERT_EMAIL, the same
 * channel as the cron watchdog); the response says whether that happened.
 */
export async function POST(req: NextRequest) {
  const authError = await requireInternalSecret(req);
  if (authError) return authError;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "invalid_json", code: "bad_request" }, { status: 400 });
  }
  const parsed = AlertBody.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "invalid_alert", code: "bad_request" }, { status: 400 });
  }
  const body = parsed.data;

  try {
    // details stay nested — they can never overwrite type/severity/message.
    await logAudit("system.alert", "system", {
      brainId: SYSTEM_BRAIN,
      details: {
        alert_type: body.type,
        severity: body.severity,
        message: body.message,
        ...(body.details !== undefined ? { details: body.details } : {}),
      },
    });

    const loud = body.severity === "critical" || body.severity === "error";
    (loud ? log.error : log.warn)(`[alert:${body.type}] ${body.message}`, {
      alert_type: body.type,
      severity: body.severity,
    });

    let notified = false;
    if (loud) {
      // Details (e.g. file names from firm data) stay in the audit log —
      // the mail carries only the message.
      ({ notified } = await notifyOps(
        `Subsumio Alarm (${body.severity}): ${body.type}`,
        `${body.message}\n\nZeitpunkt: ${new Date().toISOString()}\nDetails: System-Audit (system.alert).`
      ));
    }

    return Response.json({ ok: true, notified });
  } catch (err) {
    log.error("[internal/alert] failed:", err instanceof Error ? err.message : String(err));
    return Response.json({ error: "alert_failed", code: "internal_error" }, { status: 500 });
  }
}
