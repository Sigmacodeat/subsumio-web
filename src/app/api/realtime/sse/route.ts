import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/auth/session";
import { getStore, getOrgStore } from "@/lib/auth/store";
import { addSseConnection, removeSseConnection } from "@/lib/realtime-bus";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * GET /api/realtime/sse
 * Server-Sent Events stream for real-time updates.
 *
 * Uses lightweight session-only auth (no RBAC, rate limiting, or quota)
 * because this is a long-lived streaming endpoint. Rate limiting would
 * block reconnections after Vercel serverless function timeouts, causing
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
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // Resolve brainId (org brain if team member)
  let brainId = user.brainId;
  if (user.orgId) {
    const org = await getOrgStore().getById(user.orgId);
    if (org) brainId = org.brainId;
  }

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

      // Register this connection in the global SSE registry
      const conn = { brainId, send };
      addSseConnection(conn);

      // Cleanup on abort
      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        removeSseConnection(conn);
        try {
          controller.close();
        } catch {}
      };

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
