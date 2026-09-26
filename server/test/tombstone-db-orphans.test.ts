import { describe, expect, test } from "bun:test";
import { checkSollPlausible, selectOrphans } from "../scripts/tombstone-db-orphans.ts";

describe("tombstone-db-orphans selectOrphans", () => {
  test("only pages neither on disk nor in the RIS Soll are orphans", () => {
    const plan = selectOrphans(
      [
        { id: 1, slug: "a", doc_id: "LST1" }, // on disk
        { id: 2, slug: "b", doc_id: "LST2" }, // in Soll, fetch pending — keep
        { id: 3, slug: "c", doc_id: "ris-bka-gv-at-x" }, // old generation — orphan
        { id: 4, slug: "d", doc_id: null }, // no identity — keep
        { id: 5, slug: "e", doc_id: "LST5", dated: true }, // dated older version — keep
      ],
      new Set(["LST1"]),
      new Set(["LST1", "LST2"])
    );
    expect(plan.orphans.map((o) => o.id)).toEqual([3]);
    expect(plan.awaitingFetch).toBe(1);
    expect(plan.withoutDocId).toBe(1);
    expect(plan.dated).toBe(1);
    expect(plan.livePages).toBe(5);
  });
});

describe("tombstone-db-orphans checkSollPlausible", () => {
  const base = {
    source: "law-at-normen",
    sollSize: 10_000,
    previousSollSize: 10_000 as number | null,
    skippedSidecar: false,
    orphanCount: 10,
    livePages: 10_000,
    allowMass: false,
  };

  test("a plausible Soll and a small plan pass", () => {
    expect(() => checkSollPlausible(base)).not.toThrow();
    expect(() => checkSollPlausible({ ...base, previousSollSize: null })).not.toThrow();
  });

  test("an empty Soll is refused, even with --allow-mass", () => {
    expect(() => checkSollPlausible({ ...base, sollSize: 0, allowMass: true })).toThrow(/leer/);
  });

  test("a crawl with skipped pages is refused, even with --allow-mass", () => {
    expect(() => checkSollPlausible({ ...base, skippedSidecar: true, allowMass: true })).toThrow(
      /skipped/
    );
  });

  test("a Soll that shrank below 95 % of the last accepted one is refused", () => {
    expect(() => checkSollPlausible({ ...base, sollSize: 9_000 })).toThrow(/95/);
    expect(() => checkSollPlausible({ ...base, sollSize: 9_000, allowMass: true })).not.toThrow();
  });

  test("more than 2 % orphans is refused without --allow-mass", () => {
    expect(() => checkSollPlausible({ ...base, orphanCount: 201 })).toThrow(/verwaist/);
    expect(() => checkSollPlausible({ ...base, orphanCount: 201, allowMass: true })).not.toThrow();
  });

  test("an empty Soll selects every off-disk page as orphan — the guard must stop it", () => {
    const plan = selectOrphans(
      [
        { id: 1, slug: "a", doc_id: "N1" },
        { id: 2, slug: "b", doc_id: "N2" },
      ],
      new Set<string>(),
      new Set<string>()
    );
    expect(plan.orphans).toHaveLength(2);
    expect(() =>
      checkSollPlausible({ ...base, sollSize: 0, orphanCount: 2, livePages: 2 })
    ).toThrow();
  });
});
