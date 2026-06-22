import { createHandler } from "@/lib/api-handler";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import { z } from "zod";

const presenceSchema = z.object({
  page: z.string().min(1),
  action: z.enum(["join", "leave", "heartbeat"]).optional(),
});

// In-memory presence store (per server instance). For multi-instance deployments,
// this would need Redis or a shared store. For Vercel serverless, presence is
// best-effort — each instance tracks its own connected clients.
const presenceMap = new Map<
  string,
  Map<string, { email: string; joinedAt: string; lastHeartbeat: string }>
>();

export const POST = createHandler(
  {
    action: "presence.update",
    rateTier: "standard",
    body: presenceSchema,
    skipCsrf: true,
  },
  async (ctx, body) => {
    const { page, action = "heartbeat" } = body;
    const userId = ctx.user.id;
    const email = ctx.user.email;
    const now = new Date().toISOString();

    if (!presenceMap.has(page)) {
      presenceMap.set(page, new Map());
    }
    const pagePresence = presenceMap.get(page)!;

    if (action === "leave") {
      pagePresence.delete(userId);
      broadcastSseEvent(ctx.brainId, "presence.left", { userId, email, page });
      return Response.json({ ok: true });
    }

    // join or heartbeat
    const existing = pagePresence.get(userId);
    const entry = {
      email,
      joinedAt: existing?.joinedAt ?? now,
      lastHeartbeat: now,
    };
    pagePresence.set(userId, entry);

    if (!existing) {
      broadcastSseEvent(ctx.brainId, "presence.joined", {
        userId,
        email,
        page,
        joinedAt: entry.joinedAt,
        lastHeartbeat: now,
      });
    } else {
      broadcastSseEvent(ctx.brainId, "presence.heartbeat", {
        userId,
        email,
        page,
        joinedAt: entry.joinedAt,
        lastHeartbeat: now,
      });
    }

    // Return current presence list for this page
    const users = Array.from(pagePresence.entries()).map(([uid, e]) => ({
      userId: uid,
      email: e.email,
      page,
      joinedAt: e.joinedAt,
      lastHeartbeat: e.lastHeartbeat,
    }));

    return Response.json({ ok: true, users });
  }
);

// Prune stale entries (no heartbeat in 60s) — called on each request
function pruneStale() {
  const cutoff = Date.now() - 60000;
  for (const [, pagePresence] of presenceMap) {
    for (const [userId, entry] of pagePresence) {
      if (new Date(entry.lastHeartbeat).getTime() < cutoff) {
        pagePresence.delete(userId);
      }
    }
  }
}

export const GET = createHandler(
  {
    action: "presence.list",
    rateTier: "standard",
  },
  async (ctx, _body, _query, req) => {
    pruneStale();
    const url = new URL(req.url);
    const page = url.searchParams.get("page") || "";
    if (!page) return Response.json({ users: [] });
    const pagePresence = presenceMap.get(page);
    if (!pagePresence) return Response.json({ users: [] });
    const users = Array.from(pagePresence.entries()).map(([userId, entry]) => ({
      userId,
      email: entry.email,
      page,
      joinedAt: entry.joinedAt,
      lastHeartbeat: entry.lastHeartbeat,
    }));
    return Response.json({ users });
  }
);
