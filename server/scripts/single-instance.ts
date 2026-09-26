/**
 * One running copy per fetch script.
 *
 * The RIS slot semaphore (ris-lock.ts) is switched off by operator decision
 * (2026-09-23), so nothing stopped the same fetch from being started twice —
 * which happened three times on 2026-09-25/26 via a re-sent `docker exec -d`:
 * two processes then fetched the same documents in parallel, doubling RIS
 * load against its terms. A second copy now exits at once and names the
 * running one. mkdir is atomic; the lock of a dead process is taken over.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: the process exists but belongs to another user — still alive.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Returns false (and prints why) when another live copy holds the lock.
 * On true, the lock is released automatically when this process exits.
 */
export function claimSingleInstance(name: string, dir: string = tmpdir()): boolean {
  const lock = join(dir, `${name}.lock`);
  const pidFile = join(lock, "pid");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      mkdirSync(lock);
      writeFileSync(pidFile, String(process.pid));
      const release = () => {
        try {
          if (existsSync(pidFile) && readFileSync(pidFile, "utf8").trim() === String(process.pid))
            rmSync(lock, { recursive: true, force: true });
        } catch {
          // best effort
        }
      };
      process.on("exit", release);
      for (const sig of ["SIGINT", "SIGTERM"] as const)
        process.on(sig, () => {
          release();
          process.exit(130);
        });
      return true;
    } catch {
      const holder = Number(existsSync(pidFile) ? readFileSync(pidFile, "utf8").trim() : NaN);
      if (Number.isFinite(holder) && holder !== process.pid && alive(holder)) {
        console.error(`${name} läuft bereits (PID ${holder}) — dieser zweite Start endet sofort.`);
        return false;
      }
      // Dead holder (or half-written lock): take it over once.
      rmSync(lock, { recursive: true, force: true });
    }
  }
  return false;
}
