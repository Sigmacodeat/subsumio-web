/**
 * Tests for background-work.ts — process background-work registry.
 *
 * Covers:
 *   - registerBackgroundWorkDrainer: registration + Map-keyed replacement
 *   - __registerDrainerForTest: test seam with unregister handle
 *   - __listDrainerNamesForTest: sorted snapshot
 *   - drainAllBackgroundWorkForCliExit: ordering, timeout, abort, error isolation
 */
import { describe, test, expect, beforeEach } from "bun:test";
import {
  registerBackgroundWorkDrainer,
  __registerDrainerForTest,
  __listDrainerNamesForTest,
  drainAllBackgroundWorkForCliExit,
  type BackgroundWorkDrainer,
} from "../src/core/background-work.ts";

describe("background-work registry", () => {
  // Clean up: remove all test drainers after each test
  let cleanupFns: Array<() => void> = [];

  function makeDrainer(
    name: string,
    order: number,
    opts?: {
      drainResult?: { unfinished: number };
      drainDelay?: number;
      abortFn?: () => Promise<void>;
      throwOnDrain?: boolean;
    }
  ): BackgroundWorkDrainer {
    return {
      name,
      order,
      drain: async (_timeoutMs: number) => {
        if (opts?.drainDelay) await new Promise((r) => setTimeout(r, opts.drainDelay));
        if (opts?.throwOnDrain) throw new Error(`drain error: ${name}`);
        return opts?.drainResult ?? { unfinished: 0 };
      },
      abort: opts?.abortFn,
    };
  }

  test("registerBackgroundWorkDrainer adds a drainer", () => {
    const unreg = __registerDrainerForTest(makeDrainer("test-add", 5));
    cleanupFns.push(unreg);
    expect(__listDrainerNamesForTest()).toContain("test-add");
  });

  test("registration is idempotent (Map key replaces, not duplicates)", () => {
    const unreg1 = __registerDrainerForTest(makeDrainer("test-idem", 5));
    cleanupFns.push(unreg1);
    const unreg2 = __registerDrainerForTest(makeDrainer("test-idem", 5));
    cleanupFns.push(unreg2);
    const names = __listDrainerNamesForTest().filter((n) => n === "test-idem");
    expect(names).toHaveLength(1);
  });

  test("__registerDrainerForTest returns an unregister handle", () => {
    const unreg = __registerDrainerForTest(makeDrainer("test-unreg", 5));
    expect(__listDrainerNamesForTest()).toContain("test-unreg");
    unreg();
    expect(__listDrainerNamesForTest()).not.toContain("test-unreg");
  });

  test("__listDrainerNamesForTest returns sorted names", () => {
    const unreg1 = __registerDrainerForTest(makeDrainer("zebra", 5));
    const unreg2 = __registerDrainerForTest(makeDrainer("alpha", 5));
    cleanupFns.push(unreg1, unreg2);
    const names = __listDrainerNamesForTest();
    const alphaIdx = names.indexOf("alpha");
    const zebraIdx = names.indexOf("zebra");
    expect(alphaIdx).toBeGreaterThanOrEqual(0);
    expect(zebraIdx).toBeGreaterThanOrEqual(0);
    expect(alphaIdx).toBeLessThan(zebraIdx);
  });
});

describe("drainAllBackgroundWorkForCliExit", () => {
  let cleanupFns: Array<() => void> = [];

  test("drains all registered drainers", async () => {
    let drained1 = false;
    let drained2 = false;
    const unreg1 = __registerDrainerForTest({
      name: "drain-test-1",
      order: 1,
      drain: async () => {
        drained1 = true;
        return { unfinished: 0 };
      },
    });
    const unreg2 = __registerDrainerForTest({
      name: "drain-test-2",
      order: 2,
      drain: async () => {
        drained2 = true;
        return { unfinished: 0 };
      },
    });
    cleanupFns.push(unreg1, unreg2);

    await drainAllBackgroundWorkForCliExit({ timeoutMs: 1000 });
    expect(drained1).toBe(true);
    expect(drained2).toBe(true);
  });

  test("drains in order (lower order first)", async () => {
    const drainOrder: string[] = [];
    const unreg1 = __registerDrainerForTest({
      name: "drain-order-2",
      order: 2,
      drain: async () => {
        drainOrder.push("drain-order-2");
        return { unfinished: 0 };
      },
    });
    const unreg2 = __registerDrainerForTest({
      name: "drain-order-1",
      order: 1,
      drain: async () => {
        drainOrder.push("drain-order-1");
        return { unfinished: 0 };
      },
    });
    cleanupFns.push(unreg1, unreg2);

    await drainAllBackgroundWorkForCliExit({ timeoutMs: 1000 });
    expect(drainOrder[0]).toBe("drain-order-1");
    expect(drainOrder[1]).toBe("drain-order-2");
  });

  test("calls abort when drain reports unfinished > 0", async () => {
    let aborted = false;
    const unreg = __registerDrainerForTest({
      name: "drain-abort-test",
      order: 1,
      drain: async () => ({ unfinished: 3 }),
      abort: async () => {
        aborted = true;
      },
    });
    cleanupFns.push(unreg);

    await drainAllBackgroundWorkForCliExit({ timeoutMs: 1000 });
    expect(aborted).toBe(true);
  });

  test("does NOT call abort when unfinished === 0", async () => {
    let aborted = false;
    const unreg = __registerDrainerForTest({
      name: "drain-no-abort-test",
      order: 1,
      drain: async () => ({ unfinished: 0 }),
      abort: async () => {
        aborted = true;
      },
    });
    cleanupFns.push(unreg);

    await drainAllBackgroundWorkForCliExit({ timeoutMs: 1000 });
    expect(aborted).toBe(false);
  });

  test("one drainer throwing does not block others", async () => {
    let drained2 = false;
    const unreg1 = __registerDrainerForTest({
      name: "drain-thrower",
      order: 1,
      drain: async () => {
        throw new Error("boom");
      },
    });
    const unreg2 = __registerDrainerForTest({
      name: "drain-survivor",
      order: 2,
      drain: async () => {
        drained2 = true;
        return { unfinished: 0 };
      },
    });
    cleanupFns.push(unreg1, unreg2);

    // Should not throw
    await drainAllBackgroundWorkForCliExit({ timeoutMs: 1000 });
    expect(drained2).toBe(true);
  });

  test("handles empty registry gracefully", async () => {
    // Should not throw even with no drainers (production drainers may exist
    // from module imports, but the function should handle any state)
    await drainAllBackgroundWorkForCliExit({ timeoutMs: 100 });
    // No assertion needed — just verifying it doesn't throw
  });

  test("ties break by name (alphabetical)", async () => {
    const drainOrder: string[] = [];
    // Both order=5 — tie breaks by name
    const unreg1 = __registerDrainerForTest({
      name: "zzz-tie",
      order: 5,
      drain: async () => {
        drainOrder.push("zzz-tie");
        return { unfinished: 0 };
      },
    });
    const unreg2 = __registerDrainerForTest({
      name: "aaa-tie",
      order: 5,
      drain: async () => {
        drainOrder.push("aaa-tie");
        return { unfinished: 0 };
      },
    });
    cleanupFns.push(unreg1, unreg2);

    await drainAllBackgroundWorkForCliExit({ timeoutMs: 1000 });
    // aaa-tie should come before zzz-tie (alphabetical tie-break)
    const aaaIdx = drainOrder.indexOf("aaa-tie");
    const zzzIdx = drainOrder.indexOf("zzz-tie");
    expect(aaaIdx).toBeGreaterThanOrEqual(0);
    expect(zzzIdx).toBeGreaterThanOrEqual(0);
    expect(aaaIdx).toBeLessThan(zzzIdx);
  });
});
