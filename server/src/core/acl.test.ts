import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BrainEngine } from "../core/engine.ts";

// Mock engine with executeRaw
function mockEngine(rows: Record<string, unknown>[] = []): BrainEngine {
  return {
    executeRaw: vi.fn(async () => rows),
    getPage: vi.fn(async () => ({ id: 1, slug: "test-page", title: "Test" })),
    listPages: vi.fn(async () => []),
  } as unknown as BrainEngine;
}

describe("ACL helpers", () => {
  let engine: BrainEngine;

  beforeEach(() => {
    engine = mockEngine();
  });

  it("isPageAccessible returns true when aclGroups is undefined", async () => {
    const { isPageAccessible } = await import("../core/acl.ts");
    const result = await isPageAccessible(engine, 1, undefined);
    expect(result).toBe(true);
  });

  it("isPageAccessible returns true when aclGroups is 'all'", async () => {
    const { isPageAccessible } = await import("../core/acl.ts");
    const result = await isPageAccessible(engine, 1, "all");
    expect(result).toBe(true);
  });

  it("isPageAccessible returns true when aclGroups is empty", async () => {
    const { isPageAccessible } = await import("../core/acl.ts");
    const result = await isPageAccessible(engine, 1, []);
    expect(result).toBe(true);
  });

  it("isPageAccessible returns true when page has no permissions (open-by-default)", async () => {
    const engineWithNoPerms = mockEngine([{ count: 0, matching: 0 }]);
    const { isPageAccessible } = await import("../core/acl.ts");
    const result = await isPageAccessible(engineWithNoPerms, 1, ["group-uuid-1"]);
    expect(result).toBe(true);
  });

  it("isPageAccessible returns true when page has matching group", async () => {
    const engineWithMatch = mockEngine([{ count: 2, matching: 1 }]);
    const { isPageAccessible } = await import("../core/acl.ts");
    const result = await isPageAccessible(engineWithMatch, 1, ["group-uuid-1"]);
    expect(result).toBe(true);
  });

  it("isPageAccessible returns false when page has permissions but no matching group", async () => {
    const engineWithNoMatch = mockEngine([{ count: 2, matching: 0 }]);
    const { isPageAccessible } = await import("../core/acl.ts");
    const result = await isPageAccessible(engineWithNoMatch, 1, ["group-uuid-1"]);
    expect(result).toBe(false);
  });

  it("filterPagesByACL returns all pages when aclGroups is undefined", async () => {
    const { filterPagesByACL } = await import("../core/acl.ts");
    const result = await filterPagesByACL(engine, [1, 2, 3], undefined);
    expect(result).toEqual([1, 2, 3]);
  });

  it("filterPagesByACL returns all pages when aclGroups is 'all'", async () => {
    const { filterPagesByACL } = await import("../core/acl.ts");
    const result = await filterPagesByACL(engine, [1, 2, 3], "all");
    expect(result).toEqual([1, 2, 3]);
  });

  it("filterPagesByACL returns empty for empty input", async () => {
    const { filterPagesByACL } = await import("../core/acl.ts");
    const result = await filterPagesByACL(engine, [], ["group-uuid-1"]);
    expect(result).toEqual([]);
  });

  it("filterPagesByACL filters by ACL when groups are set", async () => {
    const engineFiltered = {
      executeRaw: vi.fn(async () => [{ page_id: 1 }, { page_id: 3 }]),
    } as unknown as BrainEngine;
    const { filterPagesByACL } = await import("../core/acl.ts");
    const result = await filterPagesByACL(engineFiltered, [1, 2, 3], ["group-uuid-1"]);
    expect(result).toEqual([1, 3]);
  });
});
