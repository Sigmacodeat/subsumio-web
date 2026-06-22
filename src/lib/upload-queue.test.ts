import { describe, test, expect } from "vitest";
import { runUploadPool } from "./upload-queue";

const MB = 1024 * 1024;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("runUploadPool", () => {
  test("resolves immediately for an empty list", async () => {
    let calls = 0;
    await runUploadPool([], async () => {
      calls++;
    });
    expect(calls).toBe(0);
  });

  test("runs every item exactly once", async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ size: i * MB }));
    const seen = new Set<number>();
    await runUploadPool(items, async (_item, i) => {
      seen.add(i);
    });
    expect(seen.size).toBe(10);
  });

  test("never exceeds largeParallel for large files", async () => {
    const items = Array.from({ length: 5 }, () => ({ size: 100 * MB })); // all large
    let active = 0;
    let peak = 0;
    const gates = items.map(() => deferred());

    const run = runUploadPool(
      items,
      async (_item, i) => {
        active++;
        peak = Math.max(peak, active);
        await gates[i].promise;
        active--;
      },
      { largeParallel: 2, largeThreshold: 50 * MB }
    );

    // Let the pool fill its slots, then release one at a time.
    await Promise.resolve();
    await Promise.resolve();
    for (const g of gates) {
      g.resolve();
      await Promise.resolve();
    }
    await run;
    expect(peak).toBeLessThanOrEqual(2);
  });

  test("small files fill more slots than large ones", async () => {
    const items = Array.from({ length: 6 }, () => ({ size: 1 * MB })); // all small
    let active = 0;
    let peak = 0;
    const gates = items.map(() => deferred());

    const run = runUploadPool(
      items,
      async (_item, i) => {
        active++;
        peak = Math.max(peak, active);
        await gates[i].promise;
        active--;
      },
      { smallParallel: 4, largeParallel: 2, largeThreshold: 50 * MB }
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(peak).toBe(4);
    for (const g of gates) g.resolve();
    await run;
  });

  test("a rejecting worker does not abort the batch", async () => {
    const items = Array.from({ length: 4 }, (_, i) => ({ size: i * MB }));
    let completed = 0;
    await runUploadPool(items, async (_item, i) => {
      if (i === 1) throw new Error("boom");
      completed++;
    });
    expect(completed).toBe(3);
  });
});
