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
 * Uses the same atomic-mkdir + PID-liveness pattern as
 * `src/core/pglite-lock.ts`, but blocks (polls) until the lock is free rather
 * than throwing on timeout: a backfill run is expected to wait its turn
 * behind another one, not fail.
 *
 * Usage:
 *   await acquireRisLock();
 *   try { ... } finally { releaseRisLock(); }
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const LOCK_DIR = join(tmpdir(), "subsumio-ris-lock");
const LOCK_FILE = "lock";
const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes — RIS backfills can run long
const POLL_MS = 2000;
const LOG_EVERY_MS = 30_000;

let heldByThisProcess = false;

function isProcessAlive(pid: number): boolean {
  try {
    // Signal 0 checks existence without actually sending a signal.
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLockData(): { pid: number; acquired_at: number; command: string } | null {
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
  const stale = !isProcessAlive(data.pid) || Date.now() - data.acquired_at > STALE_THRESHOLD_MS;
  if (stale) {
    try {
      rmSync(LOCK_DIR, { recursive: true, force: true });
    } catch {
      /* race condition, ignore */
    }
  }
}

/**
 * Block until the RIS lock is acquired by this process. Polls indefinitely
 * (no timeout) — RIS backfills are expected to queue behind each other
 * rather than fail. Stale locks (dead PID, or held past `STALE_THRESHOLD_MS`)
 * are cleaned up automatically.
 */
export async function acquireRisLock(): Promise<void> {
  let lastLog = 0;

  for (;;) {
    clearStaleLockIfAny();

    try {
      mkdirSync(LOCK_DIR, { recursive: false });
      writeFileSync(
        join(LOCK_DIR, LOCK_FILE),
        JSON.stringify({
          pid: process.pid,
          acquired_at: Date.now(),
          command: process.argv.slice(1).join(" "),
        }),
        { mode: 0o644 }
      );
      heldByThisProcess = true;
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
  if (!heldByThisProcess) return;
  try {
    rmSync(LOCK_DIR, { recursive: true, force: true });
  } catch {
    /* already removed (e.g. stale cleanup from another process), fine */
  }
  heldByThisProcess = false;
}
