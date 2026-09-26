/**
 * takes_list / takes_scorecard / takes_calibration / get_recent_salience /
 * find_anomalies read only the caller's own sources (sourceScopeOpts):
 * several firms share one database, and a remote caller bound to firm A
 * must never see firm B's takes, pages or activity — not even in aggregates.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { operations, type OperationContext } from "../src/core/operations.ts";

let engine: PGLiteEngine;

const op = (name: string) => operations.find((o) => o.name === name)!;
const ctx = (sourceId: string, allowedSources?: string[]) =>
  ({
    engine,
    config: {},
    logger: console,
    dryRun: false,
    remote: true,
    sourceId,
    ...(allowedSources
      ? { auth: { token: "", clientId: "", scopes: [], allowedSources } }
      : {}),
  }) as unknown as OperationContext;

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
  for (const src of ["firm-a", "firm-b"]) {
    await engine.executeRaw(
      `INSERT INTO sources (id, name, config) VALUES ($1, $1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING`,
      [src]
    );
    await engine.putPage(
      `notes/${src}-memo`,
      {
        type: "note",
        title: `Memo ${src}`,
        compiled_truth: `Vermerk ${src}`,
        frontmatter: { tags: ["mandat"] },
      },
      { sourceId: src }
    );
    // A second page: an anomaly needs more than one touched page per cohort.
    await engine.putPage(
      `notes/${src}-memo2`,
      { type: "note", title: `Memo 2 ${src}`, compiled_truth: "Vermerk", frontmatter: {} },
      { sourceId: src }
    );
    const page = await engine.getPage(`notes/${src}-memo`, { sourceId: src });
    await engine.addTakesBatch([
      {
        page_id: page!.id,
        row_num: 1,
        claim: `Einschätzung ${src}`,
        kind: "bet",
        holder: "world",
        weight: src === "firm-a" ? 0.8 : 0.3,
      },
    ]);
  }
  // One resolved bet per firm, with opposite outcomes.
  await engine.executeRaw(
    `UPDATE takes SET resolved_quality = CASE WHEN claim LIKE '%firm-a' THEN 'correct' ELSE 'incorrect' END,
                      resolved_at = now()`
  );
}, 60_000);

afterAll(async () => {
  await engine?.disconnect();
}, 60_000);

describe("takes are bound to the caller's sources", () => {
  test("takes_list", async () => {
    const rows = (await op("takes_list").handler(ctx("firm-a"), {})) as Array<{ claim: string }>;
    expect(rows.map((r) => r.claim)).toEqual(["Einschätzung firm-a"]);
    const both = (await op("takes_list").handler(ctx("firm-a", ["firm-a", "firm-b"]), {})) as Array<{
      claim: string;
    }>;
    expect(both.map((r) => r.claim).sort()).toEqual([
      "Einschätzung firm-a",
      "Einschätzung firm-b",
    ]);
    const none = (await op("takes_list").handler(ctx("firm-c"), {})) as unknown[];
    expect(none).toEqual([]);
  });

  test("takes_scorecard and takes_calibration aggregate only own takes", async () => {
    const a = (await op("takes_scorecard").handler(ctx("firm-a"), {})) as {
      total_bets: number;
      correct: number;
      incorrect: number;
    };
    expect(a.total_bets).toBe(1);
    expect(a.correct).toBe(1);
    expect(a.incorrect).toBe(0);
    const b = (await op("takes_scorecard").handler(ctx("firm-b"), {})) as {
      correct: number;
      incorrect: number;
    };
    expect(b.correct).toBe(0);
    expect(b.incorrect).toBe(1);
    const curve = (await op("takes_calibration").handler(ctx("firm-a"), {})) as Array<{
      n: number;
    }>;
    expect(curve.reduce((s, r) => s + r.n, 0)).toBe(1);
  });
});

describe("salience and anomalies are bound to the caller's sources", () => {
  test("get_recent_salience", async () => {
    const rows = (await op("get_recent_salience").handler(ctx("firm-a"), {
      days: 30,
    })) as Array<{ slug: string; source_id: string }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.source_id))).toEqual(new Set(["firm-a"]));
  });

  test("find_anomalies never lists another firm's pages", async () => {
    const today = new Date().toISOString().slice(0, 10);
    // Unscoped (trusted) the new pages of both firms are an anomaly today…
    const all = await engine.findAnomalies({ since: today, sigma: 0 });
    expect(all.flatMap((r) => r.page_slugs)).toContain("notes/firm-b-memo");
    const rows = (await op("find_anomalies").handler(ctx("firm-a"), {
      since: today,
      sigma: 0,
    })) as Array<{ page_slugs: string[] }>;
    // …scoped, only the caller's own.
    const slugs = rows.flatMap((r) => r.page_slugs);
    expect(slugs).toContain("notes/firm-a-memo");
    expect(slugs).not.toContain("notes/firm-b-memo");
    // The engine method itself honours the scope too.
    const direct = await engine.findAnomalies({ since: today, sigma: 0, sourceId: "firm-b" });
    expect(direct.flatMap((r) => r.page_slugs)).not.toContain("notes/firm-a-memo");
  });
});
