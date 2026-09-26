// @vitest-environment node
/**
 * Word add-in lists: all matters are selectable (paged), and the playbooks
 * are loaded after connecting, from the route's `{data}` shape.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listAllCases, playbooksFrom } from "../../word-addin/src/lists";

describe("Word add-in lists", () => {
  it("with 250 matters all are selectable (follows the cursor)", async () => {
    const all = Array.from({ length: 250 }, (_, i) => ({
      slug: `cases/${String(i).padStart(3, "0")}`,
      title: `Akte ${String(i).padStart(3, "0")}`,
    }));
    const queries: string[] = [];
    const cases = await listAllCases(async (q) => {
      queries.push(q);
      const cursor = Number(new URLSearchParams(q).get("cursor") ?? "0");
      const items = all.slice(cursor, cursor + 100);
      const next = cursor + 100 < all.length ? String(cursor + 100) : null;
      return next ? { items, nextCursor: next } : items;
    });
    expect(cases).toHaveLength(250);
    expect(queries).toHaveLength(3);
    expect(queries.every((q) => q.includes("type=legal_case"))).toBe(true);
  });

  it("skips archived and deleted matters", async () => {
    const cases = await listAllCases(async () => [
      { slug: "a", title: "A" },
      { slug: "b", title: "B", frontmatter: { status: "archived" } },
      { slug: "c", title: "C", frontmatter: { status: "tombstoned" } },
    ]);
    expect(cases.map((c) => c.slug)).toEqual(["a"]);
  });

  it("reads playbooks from the route's {data} answer", () => {
    expect(playbooksFrom({ data: [{ slug: "legal/playbooks/nda", title: "NDA" }] })).toEqual([
      { slug: "legal/playbooks/nda", title: "NDA" },
    ]);
    expect(playbooksFrom({ playbooks: [{ slug: "x", title: "X" }] })).toHaveLength(1);
    expect(playbooksFrom(null)).toEqual([]);
  });

  it("playbooks are loaded once connected, not before", () => {
    const src = readFileSync(path.join(process.cwd(), "word-addin", "src", "taskpane.ts"), "utf8");
    const connect = src.slice(
      src.indexOf("async function connect()"),
      src.indexOf("async function loadRecentCases")
    );
    expect(connect).toContain("loadPlaybooks()");
    const onReady = src.slice(src.indexOf("Office.onReady("));
    expect(onReady).not.toContain("loadPlaybooks()");
    expect(src).not.toContain('limit=10"');
  });
});
