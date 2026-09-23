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
    // Snippets nur für Admins: der 200-Zeichen-Ausschnitt kann
    // rechtserhebliche Inhalte enthalten — die Einordnung ist
    // Kanzlei-Admin-Sache, nicht jede Rolle.
    const admin = ctx.user?.role === "admin";
    return Response.json({
      count: entries.length,
      lastAt: entries[0]?.timestamp ?? null,
      ...(admin && {
        snippets: entries.slice(0, 5).map((e) => ({
          at: e.timestamp,
          type: typeof e.details?.messageType === "string" ? e.details.messageType : null,
          snippet: typeof e.details?.bodySnippet === "string" ? e.details.bodySnippet : null,
          // Hash-Präfix als Pseudonym-Label: macht Wiederholer erkennbar,
          // ohne die Rohnummer zu exponieren (Rückrechnung unmöglich).
          sender: typeof e.details?.phoneHash === "string" ? e.details.phoneHash.slice(0, 8) : null,
        })),
      }),
    });
  }
);
