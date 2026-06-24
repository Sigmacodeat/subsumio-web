/**
 * Staggered upload pool — bounds how many uploads run at once.
 *
 * Agency-level deployments can accept very large originals when they use
 * self-hosted or direct object-storage uploads. Each large upload buffers across
 * the active transport path, so running many in parallel would blow up RAM. This
 * pool runs a *size-aware* concurrency limit: small files fill idle slots
 * quickly, while large files (>= `largeThreshold`) are capped at `largeParallel`
 * simultaneous transfers and the rest stagger in behind them.
 *
 * Pure (no external dependency), framework-agnostic, and unit-testable.
 */

export interface UploadPoolItem {
  /** Size in bytes — decides whether the item counts against the large-file cap. */
  size: number;
}

export interface UploadPoolOptions {
  /** Max small files (< largeThreshold) in flight at once. */
  smallParallel?: number;
  /** Max large files (>= largeThreshold) in flight at once. */
  largeParallel?: number;
  /** Byte size at/above which an item is treated as "large". */
  largeThreshold?: number;
}

const DEFAULTS: Required<UploadPoolOptions> = {
  smallParallel: 4,
  largeParallel: 2,
  largeThreshold: 50 * 1024 * 1024, // 50 MB
};

/**
 * Run `worker` over every item, honouring the size-aware concurrency caps.
 *
 * The worker is invoked once per item and may resolve or reject; a rejected
 * worker does NOT abort the pool — its slot is freed and remaining items
 * continue (per-file error handling lives in the worker/caller). Resolves once
 * every item has settled.
 */
export async function runUploadPool<T extends UploadPoolItem>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<void>,
  options?: UploadPoolOptions
): Promise<void> {
  const { smallParallel, largeParallel, largeThreshold } = { ...DEFAULTS, ...options };

  let smallActive = 0;
  let largeActive = 0;
  // Indices still waiting to start; we may have to skip ahead when the next
  // item is large but the large-slots are full (a small item behind it can run).
  const pending = items.map((_, i) => i);

  return new Promise<void>((resolve) => {
    let settled = 0;

    const tryLaunch = () => {
      if (settled === items.length) {
        resolve();
        return;
      }
      // Scan the pending queue for the first item that fits a free slot.
      for (let p = 0; p < pending.length; p++) {
        const idx = pending[p];
        const isLarge = items[idx].size >= largeThreshold;
        const hasSlot = isLarge ? largeActive < largeParallel : smallActive < smallParallel;
        if (!hasSlot) continue;

        pending.splice(p, 1);
        if (isLarge) largeActive++;
        else smallActive++;

        void worker(items[idx], idx)
          .catch(() => {
            /* per-file errors are the worker's responsibility; keep the pool alive */
          })
          .finally(() => {
            if (isLarge) largeActive--;
            else smallActive--;
            settled++;
            tryLaunch();
          });

        // A freed/!available slot may still allow another launch this tick.
        p = -1;
      }
    };

    if (items.length === 0) {
      resolve();
      return;
    }
    tryLaunch();
  });
}
