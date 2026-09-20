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
const POLL_MS = 2000;
const LOG_EVERY_MS = 30_000;

let heldByThisProcess = false;

/**
 * Is the holder still running? Only a dead holder releases the lock.
 *
 * There used to be a 30-minute age limit as well, so a long RIS run lost its
 * lock to the next job while it was still fetching — two RIS jobs at once,
 * which the OGD rules forbid (and which happened twice on 2026-09-20).
 * The command line is compared too, so a recycled PID does not keep a lock
 * alive forever.
 */
function holderAlive(pid: number, command: string): boolean {
  try {
    // Signal 0 checks existence without actually sending a signal.
    process.kill(pid, 0);
  } catch {
    return false;
  }
  try {
    const cmdline = readFileSync(`/proc/${pid}/cmdline`, "utf-8").replace(/\0/g, " ").trim();
    const script = scriptName(command);
    // Compare the script's file name, never its path. Bun writes an absolute
    // path into argv ("/app/scripts/fetch.ts") while the process was launched
    // relative ("bun scripts/fetch.ts"), so a path comparison never matched —
    // every live holder looked dead and every new job stole the lock. Three
    // RIS fetchers ran at once on 2026-09-20 because of this, which the OGD
    // rules forbid.
    if (cmdline && script) return cmdline.includes(script);
  } catch {
    /* no /proc (macOS) — the signal check has to do */
  }
  return true;
}

/** File name of the script in a recorded command line, without directories. */
export function scriptName(command: string): string {
  const first = command.trim().split(/\s+/)[0] ?? "";
  return first.split("/").pop() ?? "";
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
  if (!holderAlive(data.pid, data.command)) {
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
 * rather than fail. A lock whose holder process is gone is cleaned up; a
 * lock held by a running job is waited out, however long it takes.
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
