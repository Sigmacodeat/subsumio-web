/**
 * Firm setting "Kanzlei-Gehirn lernt mit" — engine enforcement.
 *
 * Pins:
 *   - the per-source flag persists as a real JSONB boolean and reconciles to
 *     the web app's complete list;
 *   - consolidate (facts → takes) never touches a switched-off source;
 *   - the put_page facts backstop derives nothing for a switched-off source;
 *   - the post-upload consolidate-incremental job is a no-op for it;
 *   - runCycle drops learning phases for a switched-off source and reports why.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { configureGateway } from "../src/core/ai/gateway.ts";
import {
  excludedSourcesClause,
  isLearningDisabledForSource,
  learningDisabledSources,
  parseLearningExcludedSources,
  reconcileLearningDisabled,
  resetLearningCache,
  setSourceLearning,
  withoutExcluded,
} from "../src/core/brain-learning.ts";
import { runPhaseConsolidate } from "../src/core/cycle/phases/consolidate.ts";
import { runFactsBackstop } from "../src/core/facts/backstop.ts";
import { __resetFactsQueueForTests } from "../src/core/facts/queue.ts";
import { makeConsolidateIncrementalHandler } from "../src/core/minions/handlers/consolidate-incremental.ts";
import { runCycle } from "../src/core/cycle.ts";

let engine: PGLiteEngine;

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  // Same 1536-d pin as cycle-consolidate.test.ts (fixtures below are 1536-d).
  configureGateway({
    embedding_model: "openai:text-embedding-3-large",
    embedding_dimensions: 1536,
    env: { ...process.env },
  });
  await engine.initSchema();
});

afterAll(async () => {
  await engine.disconnect();
});

beforeEach(async () => {
  await engine.executeRaw(`DELETE FROM facts`);
  await engine.executeRaw(`DELETE FROM takes`);
  await engine.executeRaw(
    `UPDATE sources SET config = COALESCE(config, '{}'::jsonb) - 'learning_disabled'`
  );
  resetLearningCache();
  __resetFactsQueueForTests();
});

const oldDate = () => new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
function unitVec(): string {
  const a = new Float32Array(1536);
  a[0] = 1.0;
  return "[" + Array.from(a).join(",") + "]";
}

async function ensureSource(id: string) {
  await engine.executeRaw(
    `INSERT INTO sources (id, name) VALUES ($1, $1) ON CONFLICT (id) DO NOTHING`,
    [id]
  );
}

async function seedFacts(sourceId: string, slug: string, n = 4) {
  await ensureSource(sourceId);
  await engine.executeRaw(
    `INSERT INTO pages (source_id, slug, type, title) VALUES ($1, $2, 'concept', 'Test')
     ON CONFLICT DO NOTHING`,
    [sourceId, slug]
  );
  for (let i = 0; i < n; i++) {
    await engine.executeRaw(
      `INSERT INTO facts (source_id, entity_slug, fact, kind, source, valid_from, confidence, embedding, embedded_at)
       VALUES ($1, $2, $3, 'fact', 'test', $4::timestamptz, 0.9, $5::vector, $4::timestamptz)`,
      [sourceId, slug, `fact ${i}`, oldDate(), unitVec()]
    );
  }
}

async function unconsolidated(sourceId: string): Promise<number> {
  const r = await engine.executeRaw<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM facts WHERE source_id = $1 AND consolidated_at IS NULL`,
    [sourceId]
  );
  return Number(r[0].n);
}

describe("pure helpers", () => {
  test("parseLearningExcludedSources keeps valid tenant ids only", () => {
    expect(
      parseLearningExcludedSources(["org_1a2b3c4d", "brain_x", "BAD ID", 7, "org_1a2b3c4d"])
    ).toEqual(["org_1a2b3c4d", "brain_x"]);
    expect(parseLearningExcludedSources("org_a")).toEqual([]);
  });

  test("excludedSourcesClause is empty when nothing is excluded", () => {
    expect(excludedSourcesClause(undefined, 1)).toEqual({ clause: "", params: [] });
    expect(excludedSourcesClause(new Set(["a"]), 2)).toEqual({
      clause: "AND NOT (source_id = ANY($2::text[]))",
      params: [["a"]],
    });
  });

  test("withoutExcluded filters source lists", () => {
    expect(withoutExcluded([{ id: "a" }, { id: "b" }], new Set(["a"]))).toEqual([{ id: "b" }]);
  });
});

describe("persisted flag", () => {
  test("set, read back as a JSONB boolean, and clear", async () => {
    await setSourceLearning(engine, "org_flag1", false);
    expect(await isLearningDisabledForSource(engine, "org_flag1")).toBe(true);
    const t = await engine.executeRaw<{ t: string }>(
      `SELECT jsonb_typeof(config->'learning_disabled') AS t FROM sources WHERE id = 'org_flag1'`
    );
    expect(t[0].t).toBe("boolean");

    await setSourceLearning(engine, "org_flag1", true);
    expect(await isLearningDisabledForSource(engine, "org_flag1")).toBe(false);
  });

  test("setSourceLearning keeps other config keys", async () => {
    await ensureSource("org_keep");
    await engine.updateSourceConfig("org_keep", { jurisdiction: "at" });
    await setSourceLearning(engine, "org_keep", false);
    const r = await engine.executeRaw<{ j: string | null }>(
      `SELECT config->>'jurisdiction' AS j FROM sources WHERE id = 'org_keep'`
    );
    expect(r[0].j).toBe("at");
  });

  test("reconcile flags the listed firms and clears everyone else", async () => {
    await setSourceLearning(engine, "org_stale", false);
    const r = await reconcileLearningDisabled(engine, ["org_new1", "org_new2"]);
    expect(r).toEqual({ disabled: 2, cleared: 1 });
    expect([...(await learningDisabledSources(engine))].sort()).toEqual(["org_new1", "org_new2"]);
  });
});

describe("consolidate (facts → takes)", () => {
  test("excluded source is not touched; others consolidate normally", async () => {
    await seedFacts("org_off", "people/alice-example");
    await seedFacts("org_on", "people/alice-example");
    await runPhaseConsolidate(engine, { excludedSources: new Set(["org_off"]) });
    expect(await unconsolidated("org_off")).toBe(4);
    expect(await unconsolidated("org_on")).toBe(0);
  });

  test("incremental mode honours the exclusion too", async () => {
    await seedFacts("org_off", "people/bob-example");
    await seedFacts("org_on", "people/bob-example");
    await runPhaseConsolidate(engine, {
      affectedSlugs: ["people/bob-example"],
      excludedSources: new Set(["org_off"]),
    });
    expect(await unconsolidated("org_off")).toBe(4);
    expect(await unconsolidated("org_on")).toBe(0);
  });
});

describe("put_page facts backstop", () => {
  test("derives nothing for a switched-off source", async () => {
    await setSourceLearning(engine, "org_nofacts", false);
    const r = await runFactsBackstop(
      {
        slug: "notes/meeting",
        type: "note",
        compiled_truth: "A long enough note body that would normally be eligible for extraction.",
        frontmatter: {},
      },
      { engine, sourceId: "org_nofacts", sessionId: null, source: "mcp:put_page", mode: "queue" }
    );
    expect(r).toMatchObject({ mode: "queue", enqueued: false, skipped: "learning_disabled" });
  });
});

describe("consolidate-incremental job (post-upload)", () => {
  test("no-op for a switched-off source (submitters write source_id)", async () => {
    await seedFacts("org_upl", "docs/contract");
    await setSourceLearning(engine, "org_upl", false);
    const handler = makeConsolidateIncrementalHandler(engine);
    const result = await handler({
      data: { affectedSlugs: ["docs/contract"], source_id: "org_upl", reason: "post_upload" },
      signal: new AbortController().signal,
    } as never);
    expect(result.status).toBe("learning_disabled");
    expect(await unconsolidated("org_upl")).toBe(4);
  });
});

describe("runCycle", () => {
  test("a cycle scoped to a switched-off source skips learning phases and says why", async () => {
    await setSourceLearning(engine, "firm-off", false);
    const report = await runCycle(engine, {
      brainDir: null,
      phases: ["consolidate"],
      sourceId: "firm-off",
    });
    const p = report.phases.find((x) => x.phase === "consolidate");
    expect(p?.status).toBe("skipped");
    expect((p?.details as { reason?: string }).reason).toBe("learning_disabled");
  });

  test("a brain-wide cycle leaves flagged sources' facts alone", async () => {
    await seedFacts("org_cyc_off", "people/carol-example");
    await seedFacts("org_cyc_on", "people/carol-example");
    await setSourceLearning(engine, "org_cyc_off", false);
    await runCycle(engine, { brainDir: null, phases: ["consolidate"] });
    expect(await unconsolidated("org_cyc_off")).toBe(4);
    expect(await unconsolidated("org_cyc_on")).toBe(0);
  });

  test("the caller's exclude list applies even without a persisted flag", async () => {
    await seedFacts("org_list_off", "people/dave-example");
    await runCycle(engine, {
      brainDir: null,
      phases: ["consolidate"],
      learningExcludedSourceIds: ["org_list_off"],
    });
    expect(await unconsolidated("org_list_off")).toBe(4);
  });
});
