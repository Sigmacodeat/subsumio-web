// @vitest-environment node
// withKeyedLock under load: lock waiters must not drain the connection pool
// that serves logins/session checks, waiting is bounded, and a lock never
// outlives its request on a pooled connection.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── A fake Postgres: connection pools with a real cap + one advisory lock table
const locks = vi.hoisted(() => new Map<string, object>());

const FakePool = vi.hoisted(() => {
  class FakeClient {
    destroyed = false;
    constructor(private pool: InstanceType<typeof Pool>) {}
    async query(sql: string, params: unknown[] = []) {
      const key = String(params[0]);
      if (sql.includes("pg_try_advisory_lock")) {
        const holder = locks.get(key);
        if (holder && holder !== this) return { rows: [{ locked: false }] };
        locks.set(key, this);
        return { rows: [{ locked: true }] };
      }
      if (sql.includes("pg_advisory_unlock")) {
        if (this.pool.failUnlock) throw new Error("connection reset");
        const held = locks.get(key) === this;
        if (held) locks.delete(key);
        return { rows: [{ unlocked: held }] };
      }
      return { rows: [] };
    }
    release(err?: unknown) {
      if (err) {
        this.destroyed = true;
        this.pool.destroyed += 1;
        // Ending the session releases its advisory locks.
        for (const [k, v] of locks) if (v === this) locks.delete(k);
      }
      this.pool.inUse -= 1;
      this.pool.waiters.shift()?.();
    }
  }
  class Pool {
    inUse = 0;
    peak = 0;
    destroyed = 0;
    failUnlock = false;
    waiters: Array<() => void> = [];
    max: number;
    constructor(public options: { max?: number } = {}) {
      this.max = options.max ?? 10;
      created.push(this);
    }
    async connect() {
      while (this.inUse >= this.max) await new Promise<void>((r) => this.waiters.push(r));
      this.inUse += 1;
      this.peak = Math.max(this.peak, this.inUse);
      return new FakeClient(this);
    }
  }
  const created: Pool[] = [];
  return Object.assign(Pool, { created });
});

vi.mock("pg", () => ({ Pool: FakePool }));

const shared = vi.hoisted(() => ({ pool: null as unknown }));
vi.mock("@/lib/auth/store", () => ({ getSharedPgPool: () => shared.pool }));

import { withKeyedLock, KeyedLockTimeoutError } from "./keyed-lock";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  locks.clear();
  FakePool.created.length = 0;
  globalThis.__subsumioLockPool = undefined;
  shared.pool = new FakePool({ max: 5 });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

function lockPoolInstance() {
  return FakePool.created.find((p) => p !== shared.pool)!;
}

describe("withKeyedLock", () => {
  it("six parallel holders of one key leave the shared pool free and run strictly one at a time", async () => {
    let running = 0;
    let maxRunning = 0;
    const work = Array.from({ length: 6 }, () =>
      withKeyedLock("trust:brain-a:acct-1", async () => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await sleep(15);
        running -= 1;
      })
    );
    await sleep(5);
    // An unrelated DB access (session check) gets a connection immediately.
    const t0 = Date.now();
    const client = (await (shared.pool as InstanceType<typeof FakePool>).connect()) as {
      release: () => void;
    };
    expect(Date.now() - t0).toBeLessThan(20);
    client.release();
    // While five requests wait, only the holder occupies a lock connection.
    expect(lockPoolInstance().inUse).toBe(1);

    await Promise.all(work);
    expect(maxRunning).toBe(1);
    const sharedPool = shared.pool as InstanceType<typeof FakePool>;
    expect(sharedPool.peak).toBeLessThanOrEqual(1); // only the probe above
    const lp = lockPoolInstance();
    expect(lp.options.max).toBe(8);
    expect(lp.inUse).toBe(0);
    expect(locks.size).toBe(0);
  });

  it("fn may use the shared pool while holding the lock (no self-deadlock)", async () => {
    const sharedPool = shared.pool as InstanceType<typeof FakePool>;
    sharedPool.max = 1;
    const result = await withKeyedLock("audit:brain-a", async () => {
      const c = await sharedPool.connect();
      c.release();
      return "ok";
    });
    expect(result).toBe("ok");
  });

  it("a waiter gives up after the timeout with a 503 lock_timeout", async () => {
    vi.stubEnv("SUBSUMIO_KEYED_LOCK_TIMEOUT_MS", "60");
    let release!: () => void;
    const holder = withKeyedLock("k", () => new Promise<void>((r) => (release = r)));
    await sleep(5);
    const err = await withKeyedLock("k", async () => "never").catch((e) => e);
    expect(err).toBeInstanceOf(KeyedLockTimeoutError);
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe("lock_timeout");
    release();
    await holder;
    // After the holder is done the key is free again.
    await expect(withKeyedLock("k", async () => "next")).resolves.toBe("next");
  });

  it("unlocks when fn throws", async () => {
    await expect(
      withKeyedLock("k2", async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect(locks.size).toBe(0);
    await expect(withKeyedLock("k2", async () => 1)).resolves.toBe(1);
  });

  it("a failed unlock destroys the connection so the lock cannot leak", async () => {
    await withKeyedLock("k3", async () => {
      lockPoolInstance().failUnlock = true;
    });
    const lp = lockPoolInstance();
    expect(lp.destroyed).toBe(1);
    expect(locks.size).toBe(0);
    lp.failUnlock = false;
    await expect(withKeyedLock("k3", async () => "free")).resolves.toBe("free");
  });

  it("different keys do not wait on each other", async () => {
    const order: string[] = [];
    await Promise.all([
      withKeyedLock("a", async () => {
        await sleep(20);
        order.push("a");
      }),
      withKeyedLock("b", async () => {
        order.push("b");
      }),
    ]);
    expect(order).toEqual(["b", "a"]);
  });
});
