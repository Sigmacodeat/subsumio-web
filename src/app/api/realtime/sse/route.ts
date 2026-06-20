import { createHandler } from "@/lib/api-handler";
import { addSseConnection, removeSseConnection } from "@/lib/realtime-bus";

export const maxDuration = 300;

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
  },
  async (ctx, _body, _query, req) => {
    const brainId = ctx.brainId;
    const encoder = new TextEncoder();

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

        // Store cleanup on the controller for manual close
        (controller as unknown as { _cleanup?: () => void })._cleanup = cleanup;
      },
      cancel(reason) {
        // Stream cancelled by consumer
        void reason;
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
  },
);
