/**
 * RIS Lock — cross-process advisory lock for RIS (Rechtsinformationssystem)
 * single-connection scraping.
 *
 * RIS OGD guidelines require at most one active connection when no proxy pool
 * is configured (see `ris-proxy.ts`). `backfill-corpus-text.ts` and
 * `backfill-landesrecht.ts` can both be launched independently (e.g. one per
 * cron job, one run manually), so a machine-wide lock file — not just an
 * in-process flag — is needed to serialize them.
 *
 * Two things this lock must survive, discovered the hard way:
 *
 * 1. Two DIFFERENT CONTAINERS fetch from RIS: the automated pipeline and its
 *    court fetches run inside `corpus-pipeline`, manual/ad-hoc runs (this
 *    audit's targeted re-fetch, yesterday's parallel state-law fetch) run
 *    inside `engine`. `/tmp` is private per container — a lock under
 *    `os.tmpdir()` only ever coordinated processes in the SAME container.
 *    Measured on 2026-09-21: a manual fetch inside `engine` acquired the
 *    lock and ran for several minutes ALONGSIDE the judikatur court fetch
 *    still running inside `corpus-pipeline`, because each container held
 *    its own separate, empty lock directory the whole time. The lock now
 *    lives under `/data`, the one path both containers actually share.
 *
 * 2. A holder in one container is invisible to a checker in another: PID
 *    namespaces are per-container, so `process.kill(pid, 0)` — sound within
 *    one container — always reports "no such process" for a PID that
 *    belongs to a different one, whether that process is alive or not.
 *    Liveness across containers therefore cannot be PID-based at all; the
 *    holder now refreshes a heartbeat in the lock file every 30s for as
 *    long as it holds the lock, and a checker that cannot see the PID falls
 *    back to "has it heartbeated recently" instead of assuming dead. Within
 *    a single container the PID check still fires first and faster — a
 *    genuinely crashed process is reclaimed immediately, not after waiting
 *    out the heartbeat grace period.
 *
 * (An earlier version of this file used PID + command-line liveness only,
 * fixed on 2026-09-21 for a same-container variant of this same class of
 * bug: Bun records an absolute argv path while a process is launched
 * relative, so a path comparison never matched and three same-container RIS
 * fetchers ran at once. That fix — comparing the script's file name, not its
 * path — still matters and is unchanged; it just was not sufficient once a
 * second container entered the picture.)
 *
 * Usage:
 *   await acquireRisLock();
 *   try { ... } finally { releaseRisLock(); }
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

/**
 * `/data` is the one path every container that ever fetches from RIS has
 * mounted (checked directly: a file written from `engine` was immediately
 * readable from `corpus-pipeline`). `RIS_LOCK_DIR` overrides it for anyone
 * whose layout differs; local/dev/test runs where neither exists fall back
 * to `os.tmpdir()` — correct for a single process on a single machine,
 * which is the only case that setup can ever be.
 */
function defaultLockRoot(): string {
  const shared = "/data";
  try {
    if (existsSync(shared)) return shared;
  } catch {
    /* fall through */
  }
  return tmpdir();
}

const LOCK_DIR = join(process.env.RIS_LOCK_DIR || defaultLockRoot(), ".subsumio-ris-lock");
const LOCK_FILE = "lock";
const POLL_MS = 2000;
const LOG_EVERY_MS = 30_000;
/** How often the holder proves it is still alive. */
const HEARTBEAT_MS = 30_000;
/** No heartbeat for this long — across a container boundary, where PID
 *  liveness cannot see the holder at all — and the lock is stale. Generous
 *  on purpose: a slow network stall or a GC pause must never look like a
 *  crash and hand a second process the connection RIS only allows one of. */
const HEARTBEAT_GRACE_MS = 5 * 60_000;

/**
 * Pulled out for testing: whether a holder invisible to our PID namespace
 * (a different container, or none of the /proc-liveness signals available)
 * still counts as alive, purely from when it last proved so.
 */
export function heartbeatFresh(
  heartbeatAt: number,
  now: number,
  graceMs = HEARTBEAT_GRACE_MS
): boolean {
  return now - heartbeatAt < graceMs;
}

interface LockData {
  pid: number;
  acquired_at: number;
  heartbeat_at: number;
  command: string;
}

let heldByThisProcess = false;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/** File name of the script in a recorded command line, without directories. */
export function scriptName(command: string): string {
  const first = command.trim().split(/\s+/)[0] ?? "";
  return first.split("/").pop() ?? "";
}

/**
 * Is the holder still running? PID liveness when it can possibly mean
 * anything (same container — a genuinely dead process is caught right
 * away); heartbeat freshness otherwise, which is the only signal available
 * across a container boundary and stays valid within one too.
 */
export function holderAlive(data: LockData): boolean {
  try {
    // Signal 0 checks existence without sending one. Throws ESRCH both for
    // "really dead" and for "alive, but in a PID namespace we can't see" —
    // the two are indistinguishable from here, which is exactly why this
    // path alone used to make a live cross-container holder look dead.
    process.kill(data.pid, 0);
    try {
      const cmdline = readFileSync(`/proc/${data.pid}/cmdline`, "utf-8").replace(/\0/g, " ").trim();
      const script = scriptName(data.command);
      // The PID exists in OUR namespace, so we can see its real cmdline —
      // if it doesn't match, the PID was recycled onto an unrelated process.
      if (cmdline && script) return cmdline.includes(script);
    } catch {
      /* no /proc (macOS) — the signal check has to do */
    }
    return true;
  } catch {
    // Not visible in our PID namespace. Could be dead; could be alive in
    // the other container. The heartbeat is the only thing that can tell.
  }
  return heartbeatFresh(data.heartbeat_at, Date.now());
}

function readLockData(): LockData | null {
  try {
    return JSON.parse(readFileSync(join(LOCK_DIR, LOCK_FILE), "utf-8"));
  } catch {
    return null;
  }
}

function clearStaleLockIfAny(): void {
  if (!existsSync(LOCK_DIR)) return;
  const data = readLockData();
  if (!data) {
    // Corrupt/unreadable lock file — remove it.
    try {
      rmSync(LOCK_DIR, { recursive: true, force: true });
    } catch {
      /* race condition, ignore */
    }
    return;
  }
  if (!holderAlive(data)) {
    try {
      rmSync(LOCK_DIR, { recursive: true, force: true });
    } catch {
      /* race condition, ignore */
    }
  }
}

function writeLockFile(command: string, acquiredAt: number): void {
  const data: LockData = {
    pid: process.pid,
    acquired_at: acquiredAt,
    heartbeat_at: Date.now(),
    command,
  };
  writeFileSync(join(LOCK_DIR, LOCK_FILE), JSON.stringify(data), { mode: 0o644 });
}

/**
 * Block until the RIS lock is acquired by this process. Polls indefinitely
 * (no timeout) — RIS backfills are expected to queue behind each other
 * rather than fail. A lock whose holder is gone (or, across a container
 * boundary, has stopped heartbeating) is cleaned up; a lock held by a
 * running job is waited out, however long it takes.
 */
export async function acquireRisLock(): Promise<void> {
  let lastLog = 0;

  for (;;) {
    clearStaleLockIfAny();

    try {
      mkdirSync(LOCK_DIR, { recursive: false });
      const command = process.argv.slice(1).join(" ");
      const acquiredAt = Date.now();
      writeLockFile(command, acquiredAt);
      heldByThisProcess = true;
      // Keep proving we're alive for as long as we hold it — across a
      // container boundary this heartbeat is the ONLY thing that lets a
      // later process tell "still running" apart from "crashed". unref()
      // so this timer alone never keeps the process from exiting.
      heartbeatTimer = setInterval(() => {
        try {
          writeLockFile(command, acquiredAt);
        } catch {
          /* lock dir vanished under us — release() or the next acquirer's
             stale-check will sort it out; nothing to do from inside a timer */
        }
      }, HEARTBEAT_MS);
      heartbeatTimer.unref?.();
      return;
    } catch {
      // Someone else holds it — wait and retry.
      const now = Date.now();
      if (now - lastLog > LOG_EVERY_MS) {
        const data = readLockData();
        console.log(
          data
            ? `⏳ RIS lock held by PID ${data.pid} (${data.command}) since ${new Date(data.acquired_at).toISOString()} — waiting...`
            : "⏳ Waiting for RIS lock..."
        );
        lastLog = now;
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }
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
  try {
    rmSync(LOCK_DIR, { recursive: true, force: true });
  } catch {
    /* already removed (e.g. stale cleanup from another process), fine */
  }
  heldByThisProcess = false;
}
