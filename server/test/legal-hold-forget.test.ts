/**
 * Subsumio — Legal Hold overrides forget, engine-side.
 *
 * forgetFactInFence() is the single choke point both the CLI (`gbrain
 * forget`) and the MCP `forget_fact` op route through (recall.ts,
 * operations.ts). A fact whose entity page OR source document page carries
 * `frontmatter.legal_hold === true` must never be forgotten, regardless of
 * whether the row would otherwise take the fence path or the legacy DB-only
 * path.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { resetPgliteState } from "./helpers/reset-pglite.ts";
import { forgetFactInFence } from "../src/core/facts/forget.ts";

let engine: PGLiteEngine;

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
}, 60_000);

afterAll(async () => {
  if (engine) await engine.disconnect();
}, 60_000);

beforeEach(async () => {
  await resetPgliteState(engine);
});

describe("forgetFactInFence — legal hold", () => {
  test("blocks forget when the fact's entity page is under legal hold", async () => {
    await engine.putPage(
      "legal/cases/2026-014",
      {
        type: "legal_case",
        title: "Held case",
        compiled_truth: "x",
        timeline: "",
        frontmatter: { legal_hold: true },
      } as any,
      { sourceId: "default" }
    );

    const inserted = await engine.insertFact(
      { fact: "held fact", kind: "fact", source: "test", entity_slug: "legal/cases/2026-014" },
      { source_id: "default" }
    );

    const result = await forgetFactInFence(engine, inserted.id);
    expect(result.ok).toBe(false);
    expect(result.path).toBe("legal_hold");

    // The fact must still be active (not expired) afterwards.
    const active = await engine.listFactsByEntity("default", "legal/cases/2026-014");
    expect(active.find((f) => f.id === inserted.id)).toBeDefined();
  });

  test("allows forget once the hold is lifted (legal_hold: false)", async () => {
    await engine.putPage(
      "legal/cases/2026-015",
      {
        type: "legal_case",
        title: "Released case",
        compiled_truth: "x",
        timeline: "",
        frontmatter: { legal_hold: false },
      } as any,
      { sourceId: "default" }
    );

    const inserted = await engine.insertFact(
      {
        fact: "releasable fact",
        kind: "fact",
        source: "test",
        entity_slug: "legal/cases/2026-015",
      },
      { source_id: "default" }
    );

    const result = await forgetFactInFence(engine, inserted.id);
    expect(result.ok).toBe(true);
    expect(result.path).not.toBe("legal_hold");
  });

  test("allows forget when no page exists for the slug (fail-open on missing page)", async () => {
    const inserted = await engine.insertFact(
      {
        fact: "orphan fact",
        kind: "fact",
        source: "test",
        entity_slug: "legal/cases/does-not-exist",
      },
      { source_id: "default" }
    );

    const result = await forgetFactInFence(engine, inserted.id);
    expect(result.path).not.toBe("legal_hold");
  });

  test("blocks when the SOURCE document (not the entity) carries the hold", async () => {
    await engine.putPage(
      "legal/docs/evidence-1",
      {
        type: "note",
        title: "Evidence doc",
        compiled_truth: "x",
        timeline: "",
        frontmatter: { legal_hold: true },
      } as any,
      { sourceId: "default" }
    );

    await engine.insertFacts(
      [
        {
          fact: "fact from held doc",
          kind: "fact",
          source: "test",
          entity_slug: "legal/cases/unrelated-case",
          row_num: 1,
          source_markdown_slug: "legal/docs/evidence-1",
        },
      ],
      { source_id: "default" }
    );
    const facts = await engine.listFactsByEntity("default", "legal/cases/unrelated-case");
    expect(facts.length).toBe(1);

    const result = await forgetFactInFence(engine, facts[0].id);
    expect(result.ok).toBe(false);
    expect(result.path).toBe("legal_hold");
  });
});
