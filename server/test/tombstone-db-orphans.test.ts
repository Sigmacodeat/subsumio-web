import { describe, expect, test } from "bun:test";
import { selectOrphans } from "../scripts/tombstone-db-orphans.ts";

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
