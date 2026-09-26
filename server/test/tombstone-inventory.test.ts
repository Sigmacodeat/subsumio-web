import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  InventoryWriter,
  inventoryPathFor,
  makeRunId,
  tombstoneWithInventory,
} from "../scripts/tombstone-inventory.ts";
import { parseCliArgs as parseDeadEnd } from "../scripts/tombstone-dead-end-pages.ts";
import { parseCliArgs as parseOrphans } from "../scripts/tombstone-db-orphans.ts";

let dir = "";
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

describe("tombstone inventory", () => {
  test("the inventory lists every row before an UPDATE fails half-way", async () => {
    dir = mkdtempSync(join(tmpdir(), "tomb-inv-"));
    const writer = new InventoryWriter(join(dir, "inv.jsonl"));
    let updates = 0;
    const engine = {
      executeRaw: async () => {
        updates++;
        if (updates === 2) throw new Error("statement timeout");
        return [];
      },
    };
    const entries = [1, 2, 3, 4].map((id) => ({ id, line: JSON.stringify({ id }) }));
    await expect(tombstoneWithInventory(engine, entries, writer, 2)).rejects.toThrow(/timeout/);
    writer.close();
    const ids = readFileSync(join(dir, "inv.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l).id);
    // First batch (1, 2) was updated; its ids — and the rest — are on record.
    expect(ids).toEqual([1, 2, 3, 4]);
  });

  test("two runs produce two inventory files; none overwrites the other", () => {
    dir = mkdtempSync(join(tmpdir(), "tomb-inv-"));
    const base = join(dir, "tombstone-db-orphans.jsonl");
    const a = inventoryPathFor(base, makeRunId("law-at-normen", new Date("2026-09-26T10:00:00Z")));
    const b = inventoryPathFor(
      base,
      makeRunId("law-at-landesrecht", new Date("2026-09-26T10:00:00Z"))
    );
    expect(a).not.toBe(b);
    const wa = new InventoryWriter(a);
    wa.append(["{}"]);
    wa.close();
    // Exclusive create: the same path is never reopened for overwrite.
    expect(() => new InventoryWriter(a).append(["{}"])).toThrow();
    const wb = new InventoryWriter(b);
    wb.append(["{}"]);
    wb.close();
    expect(existsSync(a) && existsSync(b)).toBe(true);
  });

  test("an empty run leaves no file", () => {
    dir = mkdtempSync(join(tmpdir(), "tomb-inv-"));
    const w = new InventoryWriter(join(dir, "none.jsonl"));
    w.append([]);
    w.close();
    expect(existsSync(join(dir, "none.jsonl"))).toBe(false);
  });
});

describe("tombstone CLI flags", () => {
  test("--dry-run is accepted by both scripts and means no apply", () => {
    expect(parseDeadEnd(["--dry-run"]).yes).toBe(false);
    expect(parseOrphans(["--dry-run"]).yes).toBe(false);
  });

  test("--yes together with --dry-run is refused", () => {
    expect(() => parseDeadEnd(["--yes", "--dry-run"])).toThrow();
    expect(() => parseOrphans(["--yes", "--dry-run"])).toThrow();
  });
});
