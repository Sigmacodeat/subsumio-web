// @vitest-environment node

import { describe, test, expect, vi, afterEach } from "vitest";

describe("caselaw-dedup (in-memory fallback)", () => {
  afterEach(() => vi.resetModules());

  test("returns all indices when no Postgres pool", async () => {
    const { filterNewHitIds } = await import("./caselaw-dedup");
    const result = await filterNewHitIds("brain-1", ["hit-1", "hit-2", "hit-3"]);
    expect(result.size).toBe(3);
    expect(result.has(0)).toBe(true);
    expect(result.has(1)).toBe(true);
    expect(result.has(2)).toBe(true);
  });

  test("returns empty set for empty input", async () => {
    const { filterNewHitIds } = await import("./caselaw-dedup");
    const result = await filterNewHitIds("brain-1", []);
    expect(result.size).toBe(0);
  });

  test("returns correct indices for single hit", async () => {
    const { filterNewHitIds } = await import("./caselaw-dedup");
    const result = await filterNewHitIds("brain-1", ["only-hit"]);
    expect(result.size).toBe(1);
    expect(result.has(0)).toBe(true);
  });

  test("works with different brain IDs", async () => {
    const { filterNewHitIds } = await import("./caselaw-dedup");
    const resultA = await filterNewHitIds("brain-a", ["hit-1"]);
    const resultB = await filterNewHitIds("brain-b", ["hit-1"]);
    expect(resultA.size).toBe(1);
    expect(resultB.size).toBe(1);
  });

  test("handles large hit arrays", async () => {
    const { filterNewHitIds } = await import("./caselaw-dedup");
    const hits = Array.from({ length: 100 }, (_, i) => `hit-${i}`);
    const result = await filterNewHitIds("brain-1", hits);
    expect(result.size).toBe(100);
  });

  test("handles unicode and special chars in hit IDs", async () => {
    const { filterNewHitIds } = await import("./caselaw-dedup");
    const result = await filterNewHitIds("brain-1", ["hit_äöü_日本語", "hit-with spaces"]);
    expect(result.size).toBe(2);
  });
});
