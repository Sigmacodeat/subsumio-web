// @vitest-environment node

/**
 * Write path of the audit protocol against an in-memory stand-in for the
 * Postgres pool. The stand-in models what matters for the hash chain:
 * per-key advisory transaction locks (released on COMMIT/ROLLBACK), bigserial
 * ids and interleaving between statements (every statement yields).
 */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const state = vi.hoisted(() => ({ pool: null as unknown }));

vi.mock("@/lib/auth/store", () => ({
  getSharedPgPool: () => state.pool,
}));

import {
  logAudit,
  listAuditLogs,
  listAuditLogsPage,
  verifyAuditChain,
  setAuditFailureHook,
  encodeAuditCursor,
  decodeAuditCursor,
  AuditStoreUnavailableError,
  SYSTEM_BRAIN,
  type AuditWriteFailure,
} from "./audit";

interface Row {
  id: number;
  brain_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  user_id: string | null;
  user_email: string | null;
  details: unknown;
  ip: string | null;
  hash: string;
  prev_hash: string | null;
  hash_payload: string;
  created_at: string;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function createFakePool(opts: { honourLocks?: boolean; failInsert?: boolean } = {}) {
  const honourLocks = opts.honourLocks ?? true;
  const rows: Row[] = [];
  let nextId = 1;
  const locks = new Map<string, Promise<void>>();
  const statements: string[] = [];

  async function runTableQuery(sql: string, params: unknown[] = []) {
    statements.push(sql);
    if (/^\s*(CREATE|ALTER|DROP)/i.test(sql)) return { rows: [] };
    if (sql.includes("SELECT id::text, hash, prev_hash, hash_payload")) {
      return {
        rows: rows
          .filter((r) => r.brain_id === params[0])
          .sort((a, b) => a.id - b.id)
          .map((r) => ({ ...r, id: String(r.id) })),
      };
    }
    if (sql.includes("ORDER BY created_at DESC, id DESC")) {
      let list = rows.filter((r) => r.brain_id === params[0]);
      const limit = Number(params[params.length - 1]);
      if (sql.includes("(created_at, id) <")) {
        const cAt = String(params[params.length - 3]);
        const cId = Number(params[params.length - 2]);
        list = list.filter((r) => r.created_at < cAt || (r.created_at === cAt && r.id < cId));
      }
      list.sort((a, b) =>
        a.created_at === b.created_at ? b.id - a.id : a.created_at < b.created_at ? 1 : -1
      );
      return {
        rows: list
          .slice(0, limit)
          .map((r) => ({ ...r, id: String(r.id), timestamp: r.created_at })),
      };
    }
    throw new Error(`unexpected pool query: ${sql.slice(0, 60)}`);
  }

  const pool = {
    rows,
    statements,
    query: vi.fn(runTableQuery),
    connect: vi.fn(async () => {
      let heldKey: string | null = null;
      let release: (() => void) | null = null;
      const client = {
        query: async (sql: string, params: unknown[] = []) => {
          statements.push(sql);
          await tick();
          if (sql === "BEGIN") return { rows: [] };
          if (sql.includes("pg_advisory_xact_lock")) {
            if (!honourLocks) return { rows: [] };
            const key = String(params[0]);
            while (locks.has(key)) await locks.get(key);
            heldKey = key;
            locks.set(key, new Promise<void>((r) => (release = r)));
            return { rows: [] };
          }
          if (sql === "COMMIT" || sql === "ROLLBACK") {
            if (heldKey) {
              locks.delete(heldKey);
              release?.();
              heldKey = null;
            }
            return { rows: [] };
          }
          if (sql.startsWith("SELECT hash FROM subsumio_audit_log")) {
            const last = rows
              .filter((r) => r.brain_id === params[0])
              .sort((a, b) => b.id - a.id)[0];
            return { rows: last ? [{ hash: last.hash }] : [] };
          }
          if (sql.includes("INSERT INTO subsumio_audit_log")) {
            if (opts.failInsert) throw new Error("connection terminated");
            const p = params as Array<string | null>;
            rows.push({
              id: nextId++,
              brain_id: p[0]!,
              action: p[1]!,
              entity_type: p[2]!,
              entity_id: p[3],
              user_id: p[4],
              user_email: p[5],
              details: JSON.parse(p[6] ?? "{}"),
              ip: p[7],
              hash: p[8]!,
              prev_hash: p[9],
              hash_payload: p[10]!,
              created_at: new Date().toISOString(),
            });
            return { rows: [] };
          }
          throw new Error(`unexpected client query: ${sql.slice(0, 60)}`);
        },
        release: vi.fn(),
      };
      return client;
    }),
  };
  return pool;
}

let failures: AuditWriteFailure[] = [];

beforeEach(() => {
  failures = [];
  setAuditFailureHook((f) => failures.push(f));
});

afterEach(() => {
  setAuditFailureHook(null);
  state.pool = null;
});

describe("logAudit — tenant attribution", () => {
  test("writes into the named tenant's chain with the acting user", async () => {
    const pool = createFakePool();
    state.pool = pool;
    await logAudit("case.delete", "page", {
      brainId: "firm-a",
      userId: "u1",
      userEmail: "anwalt@example.at",
      entityId: "legal/cases/x",
    });
    expect(pool.rows).toHaveLength(1);
    expect(pool.rows[0]).toMatchObject({
      brain_id: "firm-a",
      user_id: "u1",
      user_email: "anwalt@example.at",
      action: "case.delete",
    });
  });

  test("SYSTEM_BRAIN is the explicit shared chain", async () => {
    const pool = createFakePool();
    state.pool = pool;
    await logAudit("system.alert", "system", { brainId: SYSTEM_BRAIN });
    expect(pool.rows[0].brain_id).toBe("system");
  });
});

describe("logAudit — hash chain under concurrency", () => {
  test("20 parallel writes for one tenant keep the chain intact", async () => {
    const pool = createFakePool();
    state.pool = pool;
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        logAudit("invoice.update", "invoice", { brainId: "firm-a", entityId: `inv-${i}` })
      )
    );
    expect(pool.rows).toHaveLength(20);
    const result = await verifyAuditChain("firm-a");
    expect(result.broken).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.verified).toBe(20);
    expect(failures).toEqual([]);
  });

  test("the lock is what keeps it intact (control: without it the chain breaks)", async () => {
    const pool = createFakePool({ honourLocks: false });
    state.pool = pool;
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        logAudit("invoice.update", "invoice", { brainId: "firm-a", entityId: `inv-${i}` })
      )
    );
    expect((await verifyAuditChain("firm-a")).ok).toBe(false);
  });

  test("read + insert run inside one transaction behind a per-tenant lock", async () => {
    const pool = createFakePool();
    state.pool = pool;
    await logAudit("user.login", "user", { brainId: "firm-b" });
    const tx = pool.statements.filter((s) => !/^\s*(CREATE|ALTER|DROP)/i.test(s));
    expect(tx[0]).toBe("BEGIN");
    expect(tx[1]).toContain("pg_advisory_xact_lock");
    expect(tx[2]).toContain("SELECT hash FROM subsumio_audit_log");
    expect(tx[3]).toContain("INSERT INTO subsumio_audit_log");
    expect(tx[4]).toBe("COMMIT");
  });
});

describe("logAudit — failures raise an alert, never an editable fallback page", () => {
  test("failed insert → alert hook, no throw", async () => {
    const pool = createFakePool({ failInsert: true });
    state.pool = pool;
    await expect(
      logAudit("case.delete", "page", { brainId: "firm-a", entityId: "legal/cases/y" })
    ).resolves.toBeUndefined();
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      action: "case.delete",
      brainId: "firm-a",
      entityId: "legal/cases/y",
    });
    expect(failures[0].error).toContain("connection terminated");
    expect(pool.rows).toHaveLength(0);
  });

  test("no audit store → alert hook", async () => {
    state.pool = null;
    await logAudit("user.login", "user", { brainId: "firm-a" });
    expect(failures).toHaveLength(1);
    expect(failures[0].error).toContain("not configured");
  });
});

describe("listAuditLogs — errors and paging", () => {
  test("missing store throws instead of returning an empty protocol", async () => {
    state.pool = null;
    await expect(listAuditLogs({ brainId: "firm-a" })).rejects.toBeInstanceOf(
      AuditStoreUnavailableError
    );
  });

  test("query failure throws AuditStoreUnavailableError", async () => {
    state.pool = {
      query: vi.fn(async (sql: string) => {
        if (/^\s*(CREATE|ALTER|DROP)/i.test(sql)) return { rows: [] };
        throw new Error("db down");
      }),
    };
    await expect(listAuditLogs({ brainId: "firm-a" })).rejects.toBeInstanceOf(
      AuditStoreUnavailableError
    );
  });

  test("1,200 entries are fully reachable through the cursor", async () => {
    const pool = createFakePool();
    state.pool = pool;
    // Seed directly (identical timestamps on purpose — the id tie-breaker must hold).
    const ts = "2026-09-25 10:00:00.123456+00";
    for (let i = 1; i <= 1200; i++) {
      pool.rows.push({
        id: i,
        brain_id: i % 7 === 0 ? "other-firm" : "firm-a",
        action: "case.update",
        entity_type: "case",
        entity_id: `c-${i}`,
        user_id: null,
        user_email: null,
        details: {},
        ip: null,
        hash: `h${i}`,
        prev_hash: null,
        hash_payload: "",
        created_at: i <= 600 ? ts : `2026-09-25 11:00:00.${String(i).padStart(6, "0")}+00`,
      });
    }
    const expected = pool.rows.filter((r) => r.brain_id === "firm-a").length;
    const seen = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await listAuditLogsPage({ brainId: "firm-a", limit: 500, cursor });
      for (const e of page.entries) seen.add(e.id);
      cursor = page.nextCursor ?? undefined;
      pages++;
    } while (cursor && pages < 10);
    expect(seen.size).toBe(expected);
    expect(pages).toBe(3);
  });

  test("cursor round-trip and rejection of garbage", () => {
    const c = encodeAuditCursor("2026-09-25 10:00:00.123456+00", "42");
    expect(decodeAuditCursor(c)).toEqual({ createdAt: "2026-09-25 10:00:00.123456+00", id: "42" });
    expect(decodeAuditCursor("not-a-cursor")).toBeNull();
  });
});
