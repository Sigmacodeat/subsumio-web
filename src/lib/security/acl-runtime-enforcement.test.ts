// @vitest-environment node
/**
 * T7.1 / WP7.1.4 — ACL Runtime Enforcement Tests
 *
 * Runs the engine's document-ACL functions (server/src/core/acl.ts) — not a
 * copy of them. The engine is replaced by a fixture that answers the two ACL
 * queries from a permission table, so what is tested is the product's
 * decision logic: when filtering applies at all, open-by-default for pages
 * without permissions, group matching, and that group ids only ever travel
 * as query parameters.
 *
 * The fail-closed behaviour of the ACL middleware (lookup error → request
 * refused, never widened to "all") is pinned by the engine test
 * server/test/acl-middleware-fail-closed.test.ts.
 */

import { describe, it, expect } from "vitest";
import { aclFilterClause, filterPagesByACL, isPageAccessible } from "../../../server/src/core/acl";
import type { BrainEngine } from "../../../server/src/core/engine";

const GROUP_LEGAL = "11111111-1111-1111-1111-111111111111";
const GROUP_LITIGATION = "22222222-2222-2222-2222-222222222222";
const GROUP_TAX = "33333333-3333-3333-3333-333333333333";
const GROUP_FOREIGN = "99999999-9999-9999-9999-999999999999";

const PAGE_PERMISSIONS = [
  { page_id: 101, group_id: GROUP_LEGAL },
  { page_id: 101, group_id: GROUP_LITIGATION },
  { page_id: 102, group_id: GROUP_TAX },
  { page_id: 103, group_id: GROUP_LITIGATION },
  // page 104 has no permissions → open access
];

const ALL_PAGES = [
  { id: 101, slug: "cases/restricted-case" },
  { id: 102, slug: "cases/tax-case" },
  { id: 103, slug: "cases/litigation-case" },
  { id: 104, slug: "notes/open-note" },
];

/** Answers acl.ts's queries from PAGE_PERMISSIONS; records every call. */
function fixtureEngine() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const engine = {
    async executeRaw(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      if (sql.includes("AS count FROM page_permissions")) {
        const [pageId] = params as [number];
        return [{ count: PAGE_PERMISSIONS.filter((p) => p.page_id === pageId).length }];
      }
      if (sql.includes("FROM pages p") && params.length === 1) {
        const [ids] = params as [number[]];
        return ids
          .filter((id) => !PAGE_PERMISSIONS.some((p) => p.page_id === id))
          .map((page_id) => ({ page_id }));
      }
      if (sql.includes("AS matching")) {
        const [pageId, groups] = params as [number, string[]];
        const rows = PAGE_PERMISSIONS.filter((p) => p.page_id === pageId);
        return [
          { count: rows.length, matching: rows.filter((p) => groups.includes(p.group_id)).length },
        ];
      }
      if (sql.includes("FROM pages p")) {
        const [ids, groups] = params as [number[], string[]];
        return ids
          .filter((id) => {
            const rows = PAGE_PERMISSIONS.filter((p) => p.page_id === id);
            return rows.length === 0 || rows.some((p) => groups.includes(p.group_id));
          })
          .map((page_id) => ({ page_id }));
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  };
  return { engine: engine as unknown as BrainEngine, calls };
}

const ids = ALL_PAGES.map((p) => p.id);
const slugsOf = (pageIds: number[]) =>
  ALL_PAGES.filter((p) => pageIds.includes(p.id)).map((p) => p.slug);

describe("ACL runtime: when filtering applies", () => {
  it.each([
    ["undefined", undefined],
    ["'all'", "all" as const],
  ])("aclGroups = %s → no filtering and no query", async (_label, groups) => {
    const { engine, calls } = fixtureEngine();
    expect(await isPageAccessible(engine, 101, groups)).toBe(true);
    expect(await filterPagesByACL(engine, ids, groups)).toEqual(ids);
    expect(aclFilterClause(groups, 1)).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("ACL runtime: a user in no group", () => {
  it("sees only pages without permissions — never a restricted one", async () => {
    const { engine } = fixtureEngine();
    expect(await isPageAccessible(engine, 101, [])).toBe(false);
    expect(await isPageAccessible(engine, 104, [])).toBe(true);
    expect(slugsOf(await filterPagesByACL(engine, ids, []))).toEqual(["notes/open-note"]);
  });
});

describe("ACL runtime: open-by-default and group matching", () => {
  it("a page without permissions is open to any group", async () => {
    const { engine } = fixtureEngine();
    expect(await isPageAccessible(engine, 104, [GROUP_FOREIGN])).toBe(true);
  });

  it("a restricted page is open only to one of its groups", async () => {
    const { engine } = fixtureEngine();
    expect(await isPageAccessible(engine, 101, [GROUP_LEGAL])).toBe(true);
    expect(await isPageAccessible(engine, 101, [GROUP_LITIGATION])).toBe(true);
    expect(await isPageAccessible(engine, 101, [GROUP_TAX])).toBe(false);
    expect(await isPageAccessible(engine, 102, [GROUP_FOREIGN])).toBe(false);
  });

  it("several groups open the pages of each of them", async () => {
    const { engine } = fixtureEngine();
    const groups = [GROUP_LEGAL, GROUP_TAX];
    expect(await isPageAccessible(engine, 101, groups)).toBe(true);
    expect(await isPageAccessible(engine, 102, groups)).toBe(true);
    expect(await isPageAccessible(engine, 103, groups)).toBe(false);
  });

  it("filterPagesByACL keeps restricted pages of the caller's groups plus open pages", async () => {
    const { engine } = fixtureEngine();
    expect(slugsOf(await filterPagesByACL(engine, ids, [GROUP_LEGAL]))).toEqual([
      "cases/restricted-case",
      "notes/open-note",
    ]);
    expect(slugsOf(await filterPagesByACL(engine, ids, [GROUP_FOREIGN]))).toEqual([
      "notes/open-note",
    ]);
    expect(await filterPagesByACL(engine, ids, [GROUP_LEGAL, GROUP_LITIGATION, GROUP_TAX])).toEqual(
      ids
    );
  });

  it("an empty page list is answered without a query", async () => {
    const { engine, calls } = fixtureEngine();
    expect(await filterPagesByACL(engine, [], [GROUP_LEGAL])).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe("ACL runtime: group ids are query parameters, never SQL text", () => {
  it("isPageAccessible / filterPagesByACL pass groups as parameters", async () => {
    const hostile = "'; DROP TABLE page_permissions; --";
    const { engine, calls } = fixtureEngine();
    await isPageAccessible(engine, 101, [hostile]);
    await filterPagesByACL(engine, ids, [hostile]);
    for (const call of calls) {
      expect(call.sql).not.toContain(hostile);
      expect(JSON.stringify(call.params)).toContain("DROP TABLE");
    }
  });

  it("aclFilterClause uses a numbered uuid[] placeholder and keeps the ids out of the clause", () => {
    const hostile = "'; DROP TABLE page_permissions; --";
    const out = aclFilterClause([hostile], 3);
    expect(out?.clause).toContain("ANY($3::uuid[])");
    expect(out?.clause).not.toContain(hostile);
  });
});
