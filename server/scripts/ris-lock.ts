/**
 * Global RIS API Lock — ensures only ONE process talks to RIS at any time.
 *
 * RIS OGD guidelines require 1.5s between requests and single-connection.
 * The pipeline has an in-process guard, but manually started scripts bypass it.
 * This file-based lock is the last line of defense: every RIS script must
 * acquire it before making any request to data.bka.gv.at or ris.bka.gv.at.
 *
 * Usage:
 *   import { acquireRisLock, releaseRisLock } from "./ris-lock";
 *   await acquireRisLock();  // blocks until no other RIS process is running
 *   // ... do RIS requests ...
 *   releaseRisLock();        // release on exit
 *
 * The lock auto-expires after 30 minutes (in case a process crashes without
 * releasing). A stale lock from a dead PID is detected and reclaimed.
 */

import { existsSync, writeFileSync, readFileSync, unlinkSync, statSync } from "fs";

const LOCK_FILE = "/tmp/ris-api.lock";
const LOCK_TIMEOUT_MS = 30 * 60 * 1000; // 30 min auto-expire
const POLL_INTERVAL_MS = 500;

/** Check if a PID is alive (works on Linux/POSIX). */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Read the PID from the lock file. Returns 0 if invalid. */
function readLockPid(): number {
  if (!existsSync(LOCK_FILE)) return 0;
  try {
    const content = readFileSync(LOCK_FILE, "utf-8").trim();
    const pid = parseInt(content, 10);
    return isNaN(pid) ? 0 : pid;
  } catch {
    return 0;
  }
}

/** Check if the lock is stale (holder dead or timeout expired). */
function isLockStale(): boolean {
  if (!existsSync(LOCK_FILE)) return true;
  const pid = readLockPid();
  if (pid === 0) return true;
  // Lock holder process is dead → stale
  if (!isPidAlive(pid)) return true;
  // Lock file is older than timeout → stale
  try {
    const stat = statSync(LOCK_FILE);
    if (Date.now() - stat.mtimeMs > LOCK_TIMEOUT_MS) return true;
  } catch {
    return true;
  }
  return false;
}

/**
 * Acquire the global RIS lock. Blocks until the lock is available.
 * Writes the current PID to the lock file.
 */
export async function acquireRisLock(): Promise<void> {
  for (;;) {
    if (isLockStale()) {
      // Try to acquire by writing our PID
      try {
        writeFileSync(LOCK_FILE, String(process.pid));
        // Verify we actually got it (race condition check)
        const heldPid = readLockPid();
        if (heldPid === process.pid) return;
      } catch {
        // File write failed — retry
      }
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

/**
 * Release the global RIS lock. Only removes the file if we hold it.
 */
export function releaseRisLock(): void {
  const pid = readLockPid();
  if (pid === process.pid) {
    try {
      unlinkSync(LOCK_FILE);
    } catch {
      // Already removed
    }
  }
}

/**
 * Touch the lock file to update its mtime (prevents stale timeout
 * during long-running backfills). Call periodically.
 */
export function touchRisLock(): void {
  const pid = readLockPid();
  if (pid === process.pid) {
    try {
      writeFileSync(LOCK_FILE, String(process.pid));
    } catch {
      // ignore
    }
  }
}
