import { createHandler } from "@/lib/api-handler";
import { listAuditLogs } from "@/lib/audit";

export const dynamic = "force-dynamic";

const MUTED_WINDOW_MS = 30 * 24 * 3_600_000;

/**
 * GET /api/whatsapp/muted
 *
 * Diskrete Sichtbarkeit für vollständig abgemeldete Absender: Nachrichten
 * nach dem Opt-out werden archiviert und auditiert (`whatsapp.inbound_muted`),
 * aber nicht an den Orchestrator weitergegeben. Dieser Endpoint liefert
 * die Zusammenfassung, damit die Kanzlei sieht, *dass* etwas ankam —
 * ohne den Kanal zu reaktivieren und ohne Rohnummern zu exponieren.
 */
export const GET = createHandler(
  {
    action: "agent.read",
    rateTier: "standard",
  },
  async (ctx) => {
    const entries = await listAuditLogs({
      brainId: ctx.brainId,
      action: "whatsapp.inbound_muted",
      from: new Date(Date.now() - MUTED_WINDOW_MS).toISOString(),
      limit: 200,
    });
    return Response.json({
      count: entries.length,
      lastAt: entries[0]?.timestamp ?? null,
    });
  }
);
