import { NextRequest } from "next/server";
import { hasValidInternalSecret } from "@/lib/auth/internal";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * POST /api/internal/alert — internal endpoint for the engine to send alerts.
 * Authenticated via x-internal-secret header (timing-safe comparison).
 * Writes the alert to the audit log for traceability and notifies admins.
 */

export async function POST(req: NextRequest) {
  if (!hasValidInternalSecret(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      type: string;
      severity: "info" | "warning" | "critical";
      message: string;
      details?: Record<string, unknown>;
    };

    // Write to audit log for traceability
    await logAudit("system.alert", "system", {
      details: {
        alert_type: body.type,
        severity: body.severity,
        message: body.message,
        ...body.details,
      },
    });

    // Log to console for operational visibility
    const logFn = body.severity === "critical" ? console.error : console.warn;
    logFn(`[alert:${body.type}] [${body.severity}] ${body.message}`);

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[internal/alert] failed:", err instanceof Error ? err.message : String(err));
    return Response.json(
      { error: "alert_failed", message: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
