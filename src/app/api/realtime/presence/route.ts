import { createHandler } from "@/lib/api-handler";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import { z } from "zod";

const presenceSchema = z.object({
  page: z.string().min(1).max(500),
  action: z.enum(["join", "leave", "heartbeat"]).optional(),
  /** Optional cursor position for co-editing awareness */
  cursor: z.object({ x: z.number(), y: z.number() }).optional(),
});

// ── Presence Store Abstraction ────────────────────────────────────────
// Automatically upgrades to Redis when REDIS_URL is set.
// Falls back to in-memory Map for single-instance deployments (Hetzner).

interface PresenceEntry {
  email: string;
  joinedAt: string;
  lastHeartbeat: string;
  cursor?: { x: number; y: number };
}

interface PresenceStore {
  get(page: string, orgId: string): Promise<Map<string, PresenceEntry>>;
  set(page: string, orgId: string, userId: string, entry: PresenceEntry): Promise<void>;
  delete(page: string, orgId: string, userId: string): Promise<void>;
  pruneStale(orgId: string): Promise<void>;
}

// ── In-Memory Store (default, single-instance) ────────────────────────

const inMemoryStore = new Map<
  string, // key = `${orgId}:${page}`
  Map<string, PresenceEntry>
>();

const memoryPresenceStore: PresenceStore = {
  async get(page, orgId) {
    const key = `${orgId}:${page}`;
    return inMemoryStore.get(key) ?? new Map();
  },
  async set(page, orgId, userId, entry) {
    const key = `${orgId}:${page}`;
    if (!inMemoryStore.has(key)) inMemoryStore.set(key, new Map());
    inMemoryStore.get(key)!.set(userId, entry);
  },
  async delete(page, orgId, userId) {
    const key = `${orgId}:${page}`;
    const pageMap = inMemoryStore.get(key);
    if (!pageMap) return;
    pageMap.delete(userId);
    if (pageMap.size === 0) inMemoryStore.delete(key);
  },
  async pruneStale(orgId) {
    const cutoff = Date.now() - 120_000; // 2 minutes
    for (const [key, pageMap] of inMemoryStore) {
      if (!key.startsWith(`${orgId}:`)) continue;
      for (const [userId, entry] of pageMap) {
        if (new Date(entry.lastHeartbeat).getTime() < cutoff) pageMap.delete(userId);
      }
      if (pageMap.size === 0) inMemoryStore.delete(key);
    }
  },
};

// ── Redis Store (multi-instance, auto-enabled when REDIS_URL is set) ──

let redisStore: PresenceStore | null = null;

type OptionalRedisModule = { default?: unknown; Redis?: unknown };

// Keep the optional dependency out of webpack/turbopack's static graph. A
// literal `import("ioredis")` makes Turbopack fail route compilation when Redis
// is intentionally not installed, even though this branch is disabled without
// REDIS_URL.
const importOptionalServerModule = new Function("specifier", "return import(specifier)") as (
  specifier: string
) => Promise<unknown>;

async function getRedisStore(): Promise<PresenceStore | null> {
  if (redisStore) return redisStore;
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  try {
    const ioredis = (await importOptionalServerModule("ioredis")) as OptionalRedisModule;
    const Redis = ioredis.default ?? ioredis.Redis;
    const client = new (Redis as new (
      url: string,
      opts?: Record<string, unknown>
    ) => {
      hgetall: (key: string) => Promise<Record<string, string>>;
      hset: (key: string, field: string, value: string) => Promise<number>;
      expire: (key: string, ttl: number) => Promise<number>;
      hdel: (key: string, field: string) => Promise<number>;
      ping: () => Promise<string>;
    })(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 });
    await client.ping();

    const TTL = 120; // 2 minutes — auto-expires stale entries

    redisStore = {
      async get(page, orgId) {
        const key = `presence:${orgId}:${page}`;
        const raw = await client.hgetall(key);
        const result = new Map<string, PresenceEntry>();
        for (const [userId, json] of Object.entries(raw)) {
          try {
            result.set(userId, JSON.parse(json) as PresenceEntry);
          } catch {
            /* skip corrupt */
          }
        }
        return result;
      },
      async set(page, orgId, userId, entry) {
        const key = `presence:${orgId}:${page}`;
        await client.hset(key, userId, JSON.stringify(entry));
        await client.expire(key, TTL);
      },
      async delete(page, orgId, userId) {
        const key = `presence:${orgId}:${page}`;
        await client.hdel(key, userId);
      },
      async pruneStale(_orgId) {
        // Redis TTL handles expiry automatically — prune stale individual fields
        // (Redis doesn't support per-field TTL on hashes; this is best-effort)
      },
    };
    return redisStore;
  } catch (err) {
    console.warn(
      "[presence] Redis unavailable, falling back to in-memory:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

async function getStore(): Promise<PresenceStore> {
  const redis = await getRedisStore();
  return redis ?? memoryPresenceStore;
}

// ── Handlers ──────────────────────────────────────────────────────────

export const POST = createHandler(
  {
    action: "presence.update",
    rateTier: "standard",
    body: presenceSchema,
    skipCsrf: true,
  },
  async (ctx, body) => {
    const { page, action = "heartbeat", cursor } = body;
    const userId = ctx.user.id;
    const email = ctx.user.email;
    const orgId = ctx.brainId; // org-scoped presence
    const now = new Date().toISOString();
    const store = await getStore();

    if (action === "leave") {
      await store.delete(page, orgId, userId);
      broadcastSseEvent(orgId, "presence.left", { userId, email, page });
      return Response.json({ ok: true });
    }

    // join or heartbeat
    const pagePresence = await store.get(page, orgId);
    const existing = pagePresence.get(userId);
    const entry: PresenceEntry = {
      email,
      joinedAt: existing?.joinedAt ?? now,
      lastHeartbeat: now,
      cursor: cursor ?? existing?.cursor,
    };
    await store.set(page, orgId, userId, entry);

    if (!existing) {
      broadcastSseEvent(orgId, "presence.joined", {
        userId,
        email,
        page,
        joinedAt: entry.joinedAt,
        lastHeartbeat: now,
        cursor: entry.cursor,
      });
    } else {
      broadcastSseEvent(orgId, "presence.heartbeat", {
        userId,
        email,
        page,
        joinedAt: entry.joinedAt,
        lastHeartbeat: now,
        cursor: entry.cursor,
      });
    }

    // Return fresh presence list for this page
    const updatedPresence = await store.get(page, orgId);
    const users = Array.from(updatedPresence.entries()).map(([uid, e]) => ({
      userId: uid,
      email: e.email,
      page,
      joinedAt: e.joinedAt,
      lastHeartbeat: e.lastHeartbeat,
      cursor: e.cursor,
    }));

    return Response.json({ ok: true, users, backend: process.env.REDIS_URL ? "redis" : "memory" });
  }
);

export const GET = createHandler(
  {
    action: "presence.list",
    rateTier: "standard",
  },
  async (ctx, _body, _query, req) => {
    const url = new URL(req.url);
    const page = url.searchParams.get("page") ?? "";
    if (!page) return Response.json({ users: [] });

    const orgId = ctx.brainId;
    const store = await getStore();
    await store.pruneStale(orgId);
    const pagePresence = await store.get(page, orgId);

    // Filter truly stale (older than 2 min)
    const cutoff = Date.now() - 120_000;
    const users = Array.from(pagePresence.entries())
      .filter(([, e]) => new Date(e.lastHeartbeat).getTime() > cutoff)
      .map(([userId, e]) => ({
        userId,
        email: e.email,
        page,
        joinedAt: e.joinedAt,
        lastHeartbeat: e.lastHeartbeat,
        cursor: e.cursor,
      }));

    return Response.json({ users });
  }
);
