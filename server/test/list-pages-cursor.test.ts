import { afterAll, beforeAll, beforeEach, describe, it, expect } from "bun:test";
import { encodePageCursor, parsePageCursor } from "../src/core/types.ts";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { resetPgliteState } from "./helpers/reset-pglite.ts";

let engine: PGLiteEngine;
beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
});
afterAll(async () => {
  await engine.disconnect();
});
beforeEach(async () => {
  await resetPgliteState(engine);
});

describe("page cursor codec", () => {
  it("round-trips a cursor", () => {
    const page = { updated_at: new Date("2026-09-25T12:34:56.789Z"), id: 42 };
    const parsed = parsePageCursor(encodePageCursor(page));
    expect(parsed).toEqual({ updatedAt: "2026-09-25T12:34:56.789Z", id: 42 });
  });

  it("rejects malformed cursors", () => {
    expect(parsePageCursor(undefined)).toBeNull();
    expect(parsePageCursor("")).toBeNull();
    expect(parsePageCursor("nodelimiter")).toBeNull();
    expect(parsePageCursor("|5")).toBeNull();
    expect(parsePageCursor("not-a-date|5")).toBeNull();
    expect(parsePageCursor("2026-01-01T00:00:00Z|abc")).toBeNull();
  });
});

describe("PGLiteEngine.listPages keyset paging", () => {
  it("walks every row with no duplicates and no skips", async () => {
    for (let i = 0; i < 7; i++) {
      await engine.putPage(`test/cursor-${i}`, {
        title: `Cursor ${i}`,
        type: "concept",
        compiled_truth: `body ${i}`,
        timeline: "",
      });
    }

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 20; guard++) {
      const batch = await engine.listPages({
        limit: 3,
        sort: "updated_desc",
        cursor,
      });
      for (const pg of batch) seen.push(pg.slug);
      if (batch.length < 3) break;
      const last = batch[batch.length - 1];
      cursor = encodePageCursor({ updated_at: last.updated_at, id: last.id });
    }

    const ours = seen.filter((s) => s.startsWith("test/cursor-"));
    expect(ours).toHaveLength(7);
    expect(new Set(ours).size).toBe(7);
  });

  it("does not re-serve a row that was updated mid-scan", async () => {
    for (let i = 0; i < 4; i++) {
      await engine.putPage(`test/midscan-${i}`, {
        title: `Midscan ${i}`,
        type: "concept",
        compiled_truth: `body ${i}`,
        timeline: "",
      });
    }

    const first = await engine.listPages({ limit: 2, sort: "updated_desc" });
    const cursor = encodePageCursor({
      updated_at: first[first.length - 1].updated_at,
      id: first[first.length - 1].id,
    });

    // Touch an already-served row: offset paging would shift and re-serve it
    // (or skip the next row); the keyset cursor ignores positions entirely.
    await engine.putPage(first[0].slug, {
      title: "Midscan touched",
      type: "concept",
      compiled_truth: "touched",
      timeline: "",
    });

    const rest = await engine.listPages({ limit: 10, sort: "updated_desc", cursor });
    const slugs = rest.map((p) => p.slug);
    expect(slugs).not.toContain(first[0].slug);
    expect(slugs).not.toContain(first[1].slug);
  });
});

describe("PGLiteEngine.listPages keyset paging — sub-millisecond timestamps", () => {
  it("never skips rows written within the same millisecond as a page boundary", async () => {
    for (let i = 0; i < 9; i++) {
      await engine.putPage(`test/micro-${i}`, {
        title: `Micro ${i}`,
        type: "concept",
        compiled_truth: `body ${i}`,
        timeline: "",
      });
    }
    // All rows inside ONE millisecond, distinct microseconds — the JS cursor
    // can only carry the millisecond part.
    await engine.executeRaw(
      `UPDATE pages SET updated_at = timestamptz '2026-09-25 12:00:00.123000+00'
         + ((regexp_replace(slug, '^test/micro-', ''))::int * interval '37 microseconds')
       WHERE slug LIKE 'test/micro-%'`
    );

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 20; guard++) {
      const batch = await engine.listPages({ limit: 2, sort: "updated_desc", cursor });
      for (const pg of batch) seen.push(pg.slug);
      if (batch.length < 2) break;
      const last = batch[batch.length - 1];
      cursor = encodePageCursor({ updated_at: last.updated_at, id: last.id });
    }

    const ours = seen.filter((s) => s.startsWith("test/micro-"));
    expect(new Set(ours).size).toBe(9);
    expect(ours).toHaveLength(9);
  });
});
