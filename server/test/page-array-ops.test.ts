/**
 * Atomic frontmatter-array ops — `page_array_append` / `page_array_mutate`.
 *
 * These back the Subsumio `time_entries` writes: a single UPDATE statement
 * (jsonb_set + `||` concat / guarded per-element rewrite) replaces the old
 * read-modify-write + retry loop, so two concurrent writers serialize on the
 * row lock instead of clobbering each other's arrays.
 *
 * Canonical PGLite block (test-isolation lint R3+R4). Postgres parity is
 * pinned by test/e2e/engine-parity.test.ts running the same ops against both
 * engines when DATABASE_URL is set.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { resetPgliteState } from "./helpers/reset-pglite.ts";
import { dispatchToolCall } from "../src/mcp/dispatch.ts";

let engine: PGLiteEngine;

function call(name: string, params: Record<string, unknown>, opts: Record<string, unknown> = {}) {
  return dispatchToolCall(engine, name, params, { remote: false, sourceId: "default", ...opts });
}
function parse(r: { content: { text?: string }[]; isError?: boolean }) {
  return JSON.parse(r.content[0]?.text ?? "null");
}

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
}, 60_000);

afterAll(async () => {
  await engine.disconnect();
}, 60_000);

async function seed(slug = "matters/m-1", fm: Record<string, unknown> = {}) {
  await engine.putPage(slug, {
    type: "legal_case",
    title: slug,
    compiled_truth: "",
    frontmatter: fm,
  });
}

beforeEach(async () => {
  await resetPgliteState(engine);
});

const ENTRIES = [
  { id: "t1", description: "Recherche", minutes: 60, billed: false },
  { id: "t2", description: "Schriftsatz", minutes: 90, billed: false },
  { id: "t3", description: "Telefonat", minutes: 30, billed: true, invoice_number: "INV-1" },
];

describe("page_array_append", () => {
  test("appends to an existing array and returns it", async () => {
    await seed("matters/m-1", { time_entries: [ENTRIES[0]] });
    const res = parse(
      await call("page_array_append", {
        page_slug: "matters/m-1",
        field: "time_entries",
        items: [ENTRIES[1]],
      })
    );
    expect(res.appended).toBe(1);
    expect(res.length).toBe(2);
    expect(res.items.map((e: { id: string }) => e.id)).toEqual(["t1", "t2"]);
    const page = await engine.getPage("matters/m-1");
    expect((page?.frontmatter?.time_entries as unknown[]).length).toBe(2);
  });

  test("creates the field when missing", async () => {
    await seed();
    const res = parse(
      await call("page_array_append", {
        page_slug: "matters/m-1",
        field: "time_entries",
        items: [ENTRIES[0]],
      })
    );
    expect(res.items).toEqual([ENTRIES[0]]);
  });

  test("empty items is a no-op returning the current array", async () => {
    await seed("matters/m-1", { time_entries: [ENTRIES[0]] });
    const res = parse(
      await call("page_array_append", {
        page_slug: "matters/m-1",
        field: "time_entries",
        items: [],
      })
    );
    expect(res.appended).toBe(0);
    expect(res.items.map((e: { id: string }) => e.id)).toEqual(["t1"]);
  });

  test("missing page → page_not_found error", async () => {
    const res = await call("page_array_append", {
      page_slug: "matters/nope",
      field: "time_entries",
      items: [ENTRIES[0]],
    });
    expect(res.isError).toBe(true);
    expect(parse(res).error).toBe("not_found");
  });

  test("non-array field → field_not_array error, field untouched", async () => {
    await seed("matters/m-1", { time_entries: "not-an-array" });
    const res = await call("page_array_append", {
      page_slug: "matters/m-1",
      field: "time_entries",
      items: [ENTRIES[0]],
    });
    expect(res.isError).toBe(true);
    expect(parse(res).error).toBe("field_not_array");
    const page = await engine.getPage("matters/m-1");
    expect(page?.frontmatter?.time_entries).toBe("not-an-array");
  });

  test("concurrent appends lose nothing", async () => {
    await seed();
    const batches = Array.from({ length: 5 }, (_, i) => [
      { id: `c${i}`, description: `concurrent ${i}`, minutes: 5 },
    ]);
    await Promise.all(
      batches.map((items) =>
        call("page_array_append", {
          page_slug: "matters/m-1",
          field: "time_entries",
          items,
        })
      )
    );
    const page = await engine.getPage("matters/m-1");
    const ids = (page?.frontmatter?.time_entries as { id: string }[]).map((e) => e.id);
    expect(ids.sort()).toEqual(["c0", "c1", "c2", "c3", "c4"]);
  });

  test("source isolation: slug outside the caller's source is not found", async () => {
    await engine.executeRaw(
      `INSERT INTO sources (id, name) VALUES ('other-source','other-source') ON CONFLICT (id) DO NOTHING`
    );
    await engine.putPage(
      "matters/other",
      {
        type: "legal_case",
        title: "other",
        compiled_truth: "",
        frontmatter: { time_entries: [] },
      },
      { sourceId: "other-source" }
    );
    const res = await call(
      "page_array_append",
      { page_slug: "matters/other", field: "time_entries", items: [ENTRIES[0]] },
      { sourceId: "other-source" }
    );
    // Writing into the other source works…
    expect(res.isError).toBeUndefined();
    // …while the default source can't reach it.
    const denied = await call("page_array_append", {
      page_slug: "matters/other",
      field: "time_entries",
      items: [ENTRIES[0]],
    });
    expect(denied.isError).toBe(true);
    expect(parse(denied).error).toBe("not_found");
  });

  test("matter scope: out-of-scope slug is indistinguishable from not found", async () => {
    await seed();
    const res = await call(
      "page_array_append",
      { page_slug: "matters/m-1", field: "time_entries", items: [ENTRIES[0]] },
      { matterScope: ["matters/m-2"] }
    );
    expect(res.isError).toBe(true);
    expect(parse(res).error).toBe("not_found");
  });
});

describe("page_array_mutate", () => {
  test("set-patch updates matched elements only", async () => {
    await seed("matters/m-1", { time_entries: ENTRIES });
    const res = parse(
      await call("page_array_mutate", {
        page_slug: "matters/m-1",
        field: "time_entries",
        match: ["t1"],
        set: { minutes: 120, note: "updated" },
      })
    );
    expect(res.matched_ids).toEqual(["t1"]);
    expect(res.updated_ids).toEqual(["t1"]);
    expect(res.not_found_ids).toEqual([]);
    const items = res.items as { id: string; minutes: number; note?: string }[];
    expect(items.find((e) => e.id === "t1")?.minutes).toBe(120);
    expect(items.find((e) => e.id === "t1")?.note).toBe("updated");
    expect(items.find((e) => e.id === "t2")?.minutes).toBe(90);
    expect(items.length).toBe(3);
  });

  test("unset removes keys from matched elements", async () => {
    await seed("matters/m-1", { time_entries: ENTRIES });
    const res = parse(
      await call("page_array_mutate", {
        page_slug: "matters/m-1",
        field: "time_entries",
        match: ["t3"],
        set: { billed: false },
        unset: ["invoice_number"],
      })
    );
    const t3 = (res.items as Record<string, unknown>[]).find((e) => e.id === "t3")!;
    expect(t3.billed).toBe(false);
    expect("invoice_number" in t3).toBe(false);
  });

  test("remove drops matched elements", async () => {
    await seed("matters/m-1", { time_entries: ENTRIES });
    const res = parse(
      await call("page_array_mutate", {
        page_slug: "matters/m-1",
        field: "time_entries",
        match: ["t1"],
        remove: true,
      })
    );
    expect(res.updated_ids).toEqual(["t1"]);
    expect((res.items as { id: string }[]).map((e) => e.id)).toEqual(["t2", "t3"]);
  });

  test("unless.eq skips billed entries (delete guard)", async () => {
    await seed("matters/m-1", { time_entries: ENTRIES });
    const res = parse(
      await call("page_array_mutate", {
        page_slug: "matters/m-1",
        field: "time_entries",
        match: ["t3"],
        remove: true,
        unless: { eq: { billed: true } },
      })
    );
    expect(res.matched_ids).toEqual(["t3"]);
    expect(res.skipped_ids).toEqual(["t3"]);
    expect(res.updated_ids).toEqual([]);
    expect((res.items as unknown[]).length).toBe(3);
  });

  test("mark-billed guard: different invoice skipped, same invoice idempotent", async () => {
    await seed("matters/m-1", {
      time_entries: [
        ...ENTRIES,
        // Legacy entries can be billed without an invoice_number.
        { id: "t5", description: "Akte", minutes: 10, billed: true },
      ],
    });
    const res = parse(
      await call("page_array_mutate", {
        page_slug: "matters/m-1",
        field: "time_entries",
        match: ["t1", "t3", "t4", "t5"],
        set: { billed: true, invoice_number: "INV-2" },
        unless: { eq: { billed: true }, ne: { invoice_number: "INV-2" } },
      })
    );
    // t5: billed but no invoice_number → ne can't hold ("exists and
    // differs" needs the key) → re-attributed, matching the legacy
    // markEntriesBilled guard (`billed && invoice_number && !== inv`).
    expect(res.updated_ids).toEqual(["t1", "t5"]);
    expect(res.skipped_ids).toEqual(["t3"]);
    expect(res.not_found_ids).toEqual(["t4"]);
    const t3 = (res.items as Record<string, unknown>[]).find((e) => e.id === "t3")!;
    expect(t3.invoice_number).toBe("INV-1"); // untouched — no re-attribution
    const t5 = (res.items as Record<string, unknown>[]).find((e) => e.id === "t5")!;
    expect(t5.invoice_number).toBe("INV-2");

    // Same-invoice retry is idempotent: ne fails (equal) → re-written.
    const again = parse(
      await call("page_array_mutate", {
        page_slug: "matters/m-1",
        field: "time_entries",
        match: ["t3"],
        set: { billed: true, invoice_number: "INV-1" },
        unless: { eq: { billed: true }, ne: { invoice_number: "INV-1" } },
      })
    );
    expect(again.updated_ids).toEqual(["t3"]);
    expect(again.skipped_ids).toEqual([]);
  });

  test("nothing matched → clean reporting, no write", async () => {
    await seed("matters/m-1", { time_entries: ENTRIES });
    const res = parse(
      await call("page_array_mutate", {
        page_slug: "matters/m-1",
        field: "time_entries",
        match: ["zzz"],
        set: { minutes: 1 },
      })
    );
    expect(res.matched_ids).toEqual([]);
    expect(res.updated_ids).toEqual([]);
    expect(res.not_found_ids).toEqual(["zzz"]);
    expect((res.items as unknown[]).length).toBe(3);
  });

  test("missing field behaves like an empty array", async () => {
    await seed();
    const res = parse(
      await call("page_array_mutate", {
        page_slug: "matters/m-1",
        field: "time_entries",
        match: ["t1"],
        set: { minutes: 1 },
      })
    );
    expect(res.not_found_ids).toEqual(["t1"]);
    expect(res.items).toEqual([]);
  });

  test("missing page → not_found error", async () => {
    const res = await call("page_array_mutate", {
      page_slug: "matters/nope",
      field: "time_entries",
      match: ["t1"],
      set: { minutes: 1 },
    });
    expect(res.isError).toBe(true);
    expect(parse(res).error).toBe("not_found");
  });

  test("non-array field → field_not_array error", async () => {
    await seed("matters/m-1", { time_entries: { deep: true } });
    const res = await call("page_array_mutate", {
      page_slug: "matters/m-1",
      field: "time_entries",
      match: ["t1"],
      set: { minutes: 1 },
    });
    expect(res.isError).toBe(true);
    expect(parse(res).error).toBe("field_not_array");
  });

  test("validation: match_key can't be written, set/unset disjoint, remove exclusive", async () => {
    await seed("matters/m-1", { time_entries: ENTRIES });
    for (const params of [
      { match: ["t1"], set: { id: "x" } },
      { match: ["t1"], set: { minutes: 1 }, unset: ["minutes"] },
      { match: ["t1"], remove: true, set: { minutes: 1 } },
      { match: [] as string[], set: { minutes: 1 } },
    ]) {
      const res = await call("page_array_mutate", {
        page_slug: "matters/m-1",
        field: "time_entries",
        ...params,
      });
      expect(res.isError).toBe(true);
      expect(parse(res).error).toBe("invalid_params");
    }
  });

  test("custom match_key", async () => {
    await seed("matters/m-1", {
      docs: [
        { uuid: "a", flag: false },
        { uuid: "b", flag: false },
      ],
    });
    const res = parse(
      await call("page_array_mutate", {
        page_slug: "matters/m-1",
        field: "docs",
        match_key: "uuid",
        match: ["b"],
        set: { flag: true },
      })
    );
    expect(res.updated_ids).toEqual(["b"]);
    expect((res.items as { flag: boolean }[])[1].flag).toBe(true);
  });
});
