import { createHandler } from "@/lib/api-handler";
import { listActiveSessions } from "@/lib/auth/session-registry";

/**
 * GET /api/auth/sessions
 * The signed-in user's active sessions ("Aktive Sitzungen" in the security
 * settings). The current session is flagged so the UI can badge it and skip
 * its revoke button.
 */
export const GET = createHandler(
  {
    action: "settings.read",
  },
  async (ctx) => {
    const rows = await listActiveSessions(ctx.user.id);
    const sessions = rows.map((r) => ({
      sid: r.sid,
      createdAt: r.createdAt,
      lastSeenAt: r.lastSeenAt,
      userAgent: r.userAgent,
      ip: r.ip,
      current: r.sid === ctx.sessionId,
    }));
    return Response.json({ sessions });
  }
);
