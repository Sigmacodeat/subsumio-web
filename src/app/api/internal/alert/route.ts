import { NextRequest } from "next/server";
import { requireInternalSecret } from "@/lib/auth/internal-guard";
import { logAudit, SYSTEM_BRAIN } from "@/lib/audit";

import { logger } from "@/lib/logger";
const log = logger("api/internal/alert");

export const dynamic = "force-dynamic";

/**
 * POST /api/internal/alert — internal endpoint for the engine to send alerts.
 * Authenticated via x-internal-secret header (timing-safe comparison),
 * rate-limited per IP to bound brute-force guesses against the shared secret.
 * Writes the alert to the audit log for traceability and notifies admins.
 */

export async function POST(req: NextRequest) {
  const authError = await requireInternalSecret(req);
  if (authError) return authError;

  try {
    const body = (await req.json()) as {
      type: string;
      severity: "info" | "warning" | "critical";
      message: string;
      details?: Record<string, unknown>;
    };

    // Write to audit log for traceability
    await logAudit("system.alert", "system", {
      brainId: SYSTEM_BRAIN,
      details: {
        alert_type: body.type,
        severity: body.severity,
        message: body.message,
        ...body.details,
      },
    });

    // Structured log line for operational visibility
    (body.severity === "critical" ? log.error : log.warn)(`[alert:${body.type}] ${body.message}`, {
      alert_type: body.type,
      severity: body.severity,
    });

    return Response.json({ ok: true });
  } catch (err) {
    log.error("[internal/alert] failed:", err instanceof Error ? err.message : String(err));
    return Response.json(
      { error: "alert_failed", message: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
