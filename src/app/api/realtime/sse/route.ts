import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { isAccountBlocked } from "@/lib/auth/account-status";
import { verifySession, SESSION_COOKIE } from "@/lib/auth/session";
import { getStore } from "@/lib/auth/store";
import { engineHeadersForUserId, firmBrainIdFor } from "@/lib/engine";
import { createPageVisibilityChecker } from "@/lib/realtime-access";
import { addSseConnection, removeSseConnection, type SseConnection } from "@/lib/realtime-bus";
import { SSE_RECHECK_INTERVAL_MS, sseStreamStillAllowed } from "@/lib/realtime-entitlement";
import { isStaffRole } from "@/lib/team-visibility";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * GET /api/realtime/sse
 * Server-Sent Events stream for real-time updates.
 *
 * Uses lightweight session-only auth (no RBAC, rate limiting, or quota)
 * because this is a long-lived streaming endpoint. Rate limiting would
 * block reconnections after proxy timeouts, causing
 * the SSE error loop the client can't recover from.
 */
export async function GET(req: NextRequest) {
  // Lightweight auth: verify session without RBAC/rate-limit overhead
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const user = await getStore().getById(session.uid);
  if (!user || (await isAccountBlocked(user))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // Resolve brainId (org brain if team member) — same resolution as every
  // other entry point, including "a firm's brain is never someone's personal
  // brain once they left" (auth/firm-brain.ts).
  const brainId = await firmBrainIdFor(user).catch(() => null);
  if (!brainId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // Firm events are for firm staff only; each stream checks page visibility
  // with its own user's signed identity (matter scope, grants, walls).
  const staff = isStaffRole(user.role);
  const engine = staff ? await engineHeadersForUserId(user.id).catch(() => null) : null;
  const canSeePage = engine ? createPageVisibilityChecker(engine.headers, user.id) : undefined;

  const encoder = new TextEncoder();
  let cleanupRef: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          closed = true;
        }
      };

      // Initial connection event
      send("connected", { brainId, at: new Date().toISOString() });

      // Heartbeat every 30s to keep connection alive through proxies
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          closed = true;
        }
      }, 30_000);

      // Register this connection in the global SSE registry — client
      // accounts never join the firm stream.
      const conn: SseConnection = { brainId, userId: user.id, role: user.role, canSeePage, send };
      if (staff) addSseConnection(conn);

      // The stream is only as good as the account behind it (a self-hosted
      // server keeps it open forever): on any instance, removal, deactivation
      // or a role change ends it within a minute ...
      const recheck = setInterval(() => {
        if (closed) return;
        void sseStreamStillAllowed({ userId: user.id, brainId, role: user.role }).then((ok) => {
          if (!ok) cleanup();
        });
      }, SSE_RECHECK_INTERVAL_MS);

      // Cleanup on abort
      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearInterval(recheck);
        removeSseConnection(conn);
        try {
          controller.close();
        } catch {}
      };
      // ... and in this process at once (closeSseConnectionsForUser).
      conn.close = () => cleanup();

      req.signal.addEventListener("abort", cleanup);

      // Store cleanup for cancel callback
      cleanupRef = cleanup;
    },
    cancel(reason) {
      // Stream cancelled by consumer — cleanup to prevent resource leak
      void reason;
      cleanupRef?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
