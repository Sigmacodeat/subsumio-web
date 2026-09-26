import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claimSingleInstance } from "../scripts/single-instance.ts";

const DIR = mkdtempSync(join(tmpdir(), "single-instance-"));
afterAll(() => rmSync(DIR, { recursive: true, force: true }));

describe("claimSingleInstance", () => {
  test("refuses while a live process holds the lock", () => {
    // PID 1 always exists — stands in for the running first copy.
    mkdirSync(join(DIR, "busy.lock"));
    writeFileSync(join(DIR, "busy.lock", "pid"), "1");
    expect(claimSingleInstance("busy", DIR)).toBe(false);
  });

  test("takes over the lock of a dead process", () => {
    mkdirSync(join(DIR, "stale.lock"));
    writeFileSync(join(DIR, "stale.lock", "pid"), "999999999");
    expect(claimSingleInstance("stale", DIR)).toBe(true);
  });

  test("claims a free lock", () => {
    expect(claimSingleInstance("free", DIR)).toBe(true);
  });
});
