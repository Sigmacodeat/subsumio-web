/**
 * RIS Lock — cross-process, cross-container semaphore for RIS
 * (Rechtsinformationssystem) mass downloads, backed by Postgres rows.
 *
 * RIS-IT confirmed by mail (2026-09-22): at most TWO parallel download
 * processes are allowed, each pacing at ≤ 0.5 requests/s — i.e. ~1 req/s
 * combined, inside the mass-download window only (20:00–05:00, weekends,
 * Austrian holidays; see ris-pace.ts). The lock therefore manages two
 * slots (ris_lock.id ∈ {1, 2}); a third process waits.
 *
 *
 * Found 2026-09-22, the hard way, via three file-based generations of this
 * lock (git history has all three): a shared filesystem path is the wrong
 * foundation for a lock two containers must agree on, because "shared" here
 * never actually meant "writable by both":
 *
 *   engine:          /data rw,  /law-corpus ro
 *   corpus-pipeline:  /data ro,  /law-corpus rw
 *
 * (server/deploy/netcup/docker-compose.yml — intentional per-container
 * split, not a mount failure.) A lock rooted at `/data` — the previous
 * design, chosen because a file written from `engine` was readable from
 * `corpus-pipeline` — could be READ from corpus-pipeline but never WRITTEN
 * there, so every RIS fetch running in the one container that does almost
 * all of the fetching sat in `acquireRisLock()`'s catch block forever,
 * logging "waiting" for a lock nothing was actually holding. No filesystem
 * path is writable from every container that needs this lock; Postgres is
 * the one thing every container already connects to.
 *
 * This also retires two earlier, narrower fixes that don't apply to a DB
 * row: PID liveness (meaningless across containers — different PID
 * namespaces) and the argv-path-vs-relative-cmdline mismatch (Bun records
 * an absolute path in argv while a process is launched relative). A row
 * that's just "claimed at, heartbeat at" sidesteps both — staleness is
 * purely a function of the heartbeat, checked the same way regardless of
 * who holds it or where.
 *
 * Usage:
 *   await acquireRisLock();
 *   try { ... } finally { releaseRisLock(); }
 */

import postgres from "postgres";

const POLL_MS = 2000;
const LOG_EVERY_MS = 30_000;
/** How often the holder proves it is still alive. */
const HEARTBEAT_MS = 30_000;
/** No heartbeat for this long and the lock is stale. Generous on purpose: a
 *  slow network stall or a GC pause must never look like a crash and hand a
 *  second process the connection RIS only allows one of. */
const HEARTBEAT_GRACE_MS = 5 * 60_000;

/** Parallel download slots RIS-IT allows (mail 2026-09-22). */
export const RIS_MAX_SLOTS = 2;

/** Pulled out for testing: whether a holder's last proof of life is recent enough to still count as alive. */
export function heartbeatFresh(
  heartbeatAt: number,
  now: number,
  graceMs = HEARTBEAT_GRACE_MS
): boolean {
  return now - heartbeatAt < graceMs;
}

let sql: ReturnType<typeof postgres> | null = null;
let heldByThisProcess = false;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function db(): ReturnType<typeof postgres> {
  if (sql) return sql;
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new Error("DATABASE_URL not set — ris-lock.ts needs it to reach the shared lock table.");
  sql = postgres(url, { max: 1, idle_timeout: 20, connection: { application_name: "ris-lock" } });
  return sql;
}

let tableReady: Promise<void> | null = null;

async function ensureTable(): Promise<void> {
  // Serialise the DDL through a pg advisory lock: with two slots, the first
  // thing two racing fetchers do is create/migrate this table — an
  // unguarded concurrent CREATE hits a pg_type duplicate-key error.
  if (tableReady) return tableReady;
  tableReady = (async () => {
    await db()`SELECT pg_advisory_lock(727374)`;
    try {
      await db()`
        CREATE TABLE IF NOT EXISTS ris_lock (
          id INT PRIMARY KEY DEFAULT 1,
          holder TEXT NOT NULL,
          command TEXT NOT NULL,
          acquired_at TIMESTAMPTZ NOT NULL,
          heartbeat_at TIMESTAMPTZ NOT NULL
        )
      `;
      // Migrate the singleton constraint to the two-slot semaphore.
      await db()`ALTER TABLE ris_lock DROP CONSTRAINT IF EXISTS ris_lock_singleton`;
      await db()
        .unsafe(
          `ALTER TABLE ris_lock ADD CONSTRAINT ris_lock_slots CHECK (id BETWEEN 1 AND ${RIS_MAX_SLOTS})`
        )
        .catch((e: { code?: string }) => {
          // duplicate_object: the other slot-holder ran the same migration.
          if (e.code !== "42710") throw e;
        });
    } finally {
      await db()`SELECT pg_advisory_unlock(727374)`;
    }
  })();
  return tableReady;
}

/** Random per-process token — the only thing that has to match for a heartbeat/release to be "ours", instead of trusting a PID that means nothing across containers. */
const HOLDER_TOKEN = `${process.env.HOSTNAME ?? "host"}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * One atomic claim attempt: insert if the row doesn't exist, or steal it if
 * the existing holder's heartbeat is stale. `RETURNING` only produces a row
 * when the write actually happened, so a plain "did I get it" check needs no
 * separate SELECT and no race between check and claim.
 */
async function tryClaim(command: string): Promise<boolean> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - HEARTBEAT_GRACE_MS);
  for (let slot = 1; slot <= RIS_MAX_SLOTS; slot++) {
    const rows = await db()`
      INSERT INTO ris_lock (id, holder, command, acquired_at, heartbeat_at)
      VALUES (${slot}, ${HOLDER_TOKEN}, ${command}, ${now}, ${now})
      ON CONFLICT (id) DO UPDATE SET
        holder = EXCLUDED.holder,
        command = EXCLUDED.command,
        acquired_at = EXCLUDED.acquired_at,
        heartbeat_at = EXCLUDED.heartbeat_at
      WHERE ris_lock.heartbeat_at < ${staleBefore}
      RETURNING holder
    `;
    if (rows.length > 0 && rows[0]!.holder === HOLDER_TOKEN) return true;
  }
  return false;
}

async function currentHolderDescription(): Promise<string> {
  const rows = await db()`SELECT holder, command, acquired_at FROM ris_lock ORDER BY id`;
  if (rows.length === 0) return "Waiting for RIS lock...";
  const held = rows
    .map((r) => `${r.holder} (${r.command}, seit ${new Date(r.acquired_at).toISOString()})`)
    .join(" + ");
  return `⏳ RIS-Slots belegt von ${held} — waiting...`;
}

/**
 * Block until the RIS lock is acquired by this process. Polls indefinitely
 * (no timeout) — RIS backfills are expected to queue behind each other
 * rather than fail. A lock whose holder has stopped heartbeating is stolen
 * automatically; a lock held by a live job is waited out, however long it
 * takes.
 */
export async function acquireRisLock(): Promise<void> {
  await ensureTable();
  const command = process.argv.slice(1).join(" ");
  let lastLog = 0;

  for (;;) {
    if (await tryClaim(command)) break;
    const now = Date.now();
    if (now - lastLog > LOG_EVERY_MS) {
      console.log(await currentHolderDescription());
      lastLog = now;
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  heldByThisProcess = true;
  heartbeatTimer = setInterval(() => {
    db()`UPDATE ris_lock SET heartbeat_at = now() WHERE holder = ${HOLDER_TOKEN}`.catch(() => {
      /* transient DB hiccup — the next tick retries; a real outage means the
         heartbeat goes stale and another process reclaims the lock, which is
         the correct outcome (we can't reach RIS through a dead DB anyway) */
    });
  }, HEARTBEAT_MS);
  heartbeatTimer.unref?.();
}

/**
 * Release the RIS lock if held by this process. Safe to call even if the
 * lock was never acquired (no-op).
 */
export function releaseRisLock(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (!heldByThisProcess) return;
  heldByThisProcess = false;
  db()`DELETE FROM ris_lock WHERE holder = ${HOLDER_TOKEN}`.catch(() => {
    /* best-effort — a missed delete just leaves a lock that goes stale in
       HEARTBEAT_GRACE_MS once our heartbeat timer is also gone */
  });
}
