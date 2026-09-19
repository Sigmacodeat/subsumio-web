import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { applyStatuteValidityBoost, viennaToday, STATUTE_VALIDITY_FACTORS } from "../src/core/search/hybrid.ts";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import type { SearchResult } from "../src/core/types.ts";

const r = (page_id: number, score = 1): SearchResult =>
  ({ page_id, slug: `legal/statutes/at/x/p-${page_id}`, score } as unknown as SearchResult);

describe("applyStatuteValidityBoost", () => {
  const today = "2026-09-19";
  const validity = new Map([
    [1, { in_force_from: "1812-01-01", in_force_to: null }], // in force
    [2, { in_force_from: "2025-07-01", in_force_to: "2026-07-10" }], // repealed
    [3, { in_force_from: "2027-01-01", in_force_to: null }], // not yet in force
    [4, { in_force_from: "2020-01-01", in_force_to: "2030-12-31" }], // expires later: in force
  ]);

  test("repealed provisions are demoted and marked with their end date", () => {
    const results = [r(1), r(2), r(3), r(4)];
    applyStatuteValidityBoost(results, validity, today);
    expect(results[0].score).toBe(1);
    expect(results[0].statute_validity).toBeUndefined();
    expect(results[1].score).toBeCloseTo(STATUTE_VALIDITY_FACTORS.repealed);
    expect(results[1].statute_validity).toBe("repealed");
    expect(results[1].in_force_to).toBe("2026-07-10");
    expect(results[2].statute_validity).toBe("not_yet_in_force");
    expect(results[2].score).toBeCloseTo(STATUTE_VALIDITY_FACTORS.not_yet_in_force);
    expect(results[3].statute_validity).toBeUndefined();
  });

  test("a provision ending today is still in force today", () => {
    const res = [r(5)];
    applyStatuteValidityBoost(res, new Map([[5, { in_force_from: null, in_force_to: today }]]), today);
    expect(res[0].statute_validity).toBeUndefined();
  });

  test("viennaToday returns an ISO calendar date", () => {
    expect(viennaToday(new Date("2026-09-19T22:30:00Z"))).toBe("2026-09-20"); // already the next day in Vienna
  });
});

describe("getStatuteValidity (PGLite)", () => {
  let engine: PGLiteEngine;
  beforeAll(async () => {
    engine = new PGLiteEngine();
    await engine.connect({});
    await engine.initSchema();
    await engine.executeRaw(`INSERT INTO sources (id, name, jurisdiction) VALUES ('law-at-normen','n','at') ON CONFLICT DO NOTHING`);
    await engine.executeRaw(
      `INSERT INTO pages (slug, source_id, type, title, compiled_truth, frontmatter) VALUES
        ('legal/statutes/at/a/p-1','law-at-normen','law','A','§ 1', '{"doc_class":"statute","in_force_to":"2020-01-01"}'::jsonb),
        ('legal/statutes/at/a/p-2','law-at-normen','law','A','§ 2', '{"doc_class":"statute"}'::jsonb),
        ('legal/judikatur/at/x','law-at-normen','court_decision','X','Text', '{"doc_class":"decision","in_force_to":"2020-01-01"}'::jsonb)`
    );
  });
  afterAll(async () => engine.disconnect());

  test("returns dates for statutes only", async () => {
    const ids = ((await engine.executeRaw(`SELECT id FROM pages ORDER BY id`)) as Array<{ id: number }>).map((x) => x.id);
    const m = await engine.getStatuteValidity(ids);
    expect(m.size).toBe(1);
    expect([...m.values()][0]).toEqual({ in_force_from: null, in_force_to: "2020-01-01" });
  });
});
