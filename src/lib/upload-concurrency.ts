/**
 * Web-app upload concurrency guard (P2-3).
 *
 * The Next `/api/upload` + `/api/upload/confirm` routes buffer the file in
 * memory (arrayBuffer for hashing + virus scan, then a fresh File/FormData to
 * proxy to the engine) — peak RAM is a few times the file size PER upload. The
 * client-side stagger pool bounds concurrency per browser, but nothing bounds it
 * across many simultaneous users, so a burst of concurrent uploads could OOM the
 * web container. Files above the multipart threshold already stream directly to
 * storage (upload-session-store), so this guard is the backstop for the
 * remaining synchronous (sub-threshold) buffered path.
 *
 * This mirrors the engine-side guard (server/src/core/upload-guard.ts) — same
 * small/large slot policy — but is token-based: `acquireUploadSlot` returns a
 * release closure bound to the exact slot, so there is no release-by-size
 * ambiguity and a slot cannot be double-released or leaked to another caller.
 */

const SMALL_PARALLEL = 4;
const LARGE_PARALLEL = 1;
const LARGE_THRESHOLD = 50 * 1024 * 1024; // 50 MB — matches the engine guard.

interface Slot {
  large: boolean;
}

const active = new Set<Slot>();

function countActive(large: boolean): number {
  let n = 0;
  for (const s of active) if (s.large === large) n++;
  return n;
}

export interface UploadSlotRejection {
  ok: false;
  active: number;
  max: number;
  large: boolean;
}

export type UploadSlotResult = { ok: true; release: () => void } | UploadSlotRejection;

/**
 * Try to reserve an upload slot for a file of `sizeBytes`. On success returns a
 * one-shot `release()` (safe to call more than once). On rejection returns the
 * current occupancy so the caller can build an accurate 429.
 */
export function acquireUploadSlot(sizeBytes: number): UploadSlotResult {
  const large = sizeBytes >= LARGE_THRESHOLD;
  const max = large ? LARGE_PARALLEL : SMALL_PARALLEL;
  const current = countActive(large);
  if (current >= max) {
    return { ok: false, active: current, max, large };
  }
  const slot: Slot = { large };
  active.add(slot);
  let released = false;
  return {
    ok: true,
    release() {
      if (released) return;
      released = true;
      active.delete(slot);
    },
  };
}

/** Current occupancy — for monitoring/debugging. */
export function uploadSlotStats(): {
  activeSmall: number;
  activeLarge: number;
  maxSmall: number;
  maxLarge: number;
} {
  return {
    activeSmall: countActive(false),
    activeLarge: countActive(true),
    maxSmall: SMALL_PARALLEL,
    maxLarge: LARGE_PARALLEL,
  };
}
