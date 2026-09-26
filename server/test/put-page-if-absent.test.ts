/**
 * Create-only page writes (`putPage(..., { ifAbsent: true })` and the
 * `put_page` op's `if_absent` param).
 *
 * A plain put_page replaces a stored page completely. Creating a record
 * (matter, invoice) must never do that: the create is decided by the page
 * INSERT itself (ON CONFLICT DO NOTHING), so a row that already sits at
 * (source_id, slug) — live, soft-deleted or tombstoned — wins, nothing is
 * written, and two concurrent creates of one slug yield exactly one page.
 *
 * Hermetic: in-memory PGLite. The Postgres half of the parity contract lives
 * in test/e2e/engine-parity-put-page-if-absent.test.ts.
 */

import { describe, test, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { operations, OperationError } from "../src/core/operations.ts";
import type { OperationContext } from "../src/core/operations.ts";
import { PageExistsError } from "../src/core/engine-errors.ts";
import {
  configureGateway,
  resetGateway,
  __setEmbedTransportForTests,
} from "../src/core/ai/gateway.ts";

const putPageOp = operations.find((o) => o.name === "put_page")!;

let engine: PGLiteEngine;

beforeAll(async () => {
  // Same hermeticity guard as put-page-provenance.test.ts: pin the gateway
  // and stub the embed transport so put_page never touches the network.
  configureGateway({
    embedding_model: "openai:text-embedding-3-large",
    embedding_dimensions: 1536,
    env: { ...process.env, OPENAI_API_KEY: process.env.OPENAI_API_KEY || "sk-test-stub" },
  });
  __setEmbedTransportForTests(
    async ({ values }: any) =>
      ({
        embeddings: values.map(() => new Array(1536).fill(0)),
        usage: { tokens: 0 },
      }) as any
  );

  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
});

afterAll(async () => {
  await engine.disconnect();
  __setEmbedTransportForTests(null);
  resetGateway();
});

beforeEach(async () => {
  await engine.executeRaw("DELETE FROM pages", []);
});

function makeCtx(opts: Partial<OperationContext> = {}): OperationContext {
  return {
    engine,
    config: { engine: "pglite" as const },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    dryRun: false,
    remote: false,
    sourceId: "default",
    ...opts,
  };
}

const page = (title: string, body: string) => ({
  type: "legal_case" as const,
  title,
  compiled_truth: body,
  timeline: "",
  frontmatter: { title },
});

async function storedTitle(slug: string): Promise<string | null> {
  const rows = (await engine.executeRaw(
    "SELECT title FROM pages WHERE slug = $1 AND source_id = 'default'",
    [slug]
  )) as Array<{ title: string }>;
  return rows[0]?.title ?? null;
}

describe("engine putPage — ifAbsent", () => {
  test("creates a missing page", async () => {
    const created = await engine.putPage("legal/cases/new-1", page("Neu", "body"), {
      sourceId: "default",
      ifAbsent: true,
    });
    expect(created.slug).toBe("legal/cases/new-1");
    expect(await storedTitle("legal/cases/new-1")).toBe("Neu");
  });

  test("refuses an existing page and leaves it untouched", async () => {
    await engine.putPage("legal/cases/taken", page("Original", "original body"));
    await expect(
      engine.putPage("legal/cases/taken", page("Replacement", "other body"), {
        sourceId: "default",
        ifAbsent: true,
      })
    ).rejects.toBeInstanceOf(PageExistsError);
    expect(await storedTitle("legal/cases/taken")).toBe("Original");
  });

  test("a soft-deleted page counts as existing", async () => {
    await engine.putPage("legal/cases/deleted", page("Deleted", "body"));
    await engine.softDeletePage("legal/cases/deleted", { sourceId: "default" });
    await expect(
      engine.putPage("legal/cases/deleted", page("New", "body"), { ifAbsent: true })
    ).rejects.toBeInstanceOf(PageExistsError);
    expect(await storedTitle("legal/cases/deleted")).toBe("Deleted");
  });

  test("a tombstoned page counts as existing", async () => {
    await engine.putPage("legal/cases/tomb", {
      ...page("Tomb", "body"),
      frontmatter: { title: "Tomb", status: "tombstoned" },
    });
    await expect(
      engine.putPage("legal/cases/tomb", page("New", "body"), { ifAbsent: true })
    ).rejects.toBeInstanceOf(PageExistsError);
    expect(await storedTitle("legal/cases/tomb")).toBe("Tomb");
  });

  test("the same slug in another source is not a conflict", async () => {
    await engine.executeRaw(
      "INSERT INTO sources (id, name) VALUES ('other', 'other') ON CONFLICT DO NOTHING",
      []
    );
    await engine.putPage("legal/cases/shared", page("Default", "body"));
    const created = await engine.putPage("legal/cases/shared", page("Other", "body"), {
      sourceId: "other",
      ifAbsent: true,
    });
    expect(created.title).toBe("Other");
    expect(await storedTitle("legal/cases/shared")).toBe("Default");
  });

  test("without ifAbsent a write still replaces (unchanged default)", async () => {
    await engine.putPage("legal/cases/upsert", page("One", "body"));
    await engine.putPage("legal/cases/upsert", page("Two", "body"));
    expect(await storedTitle("legal/cases/upsert")).toBe("Two");
  });
});

describe("put_page op — if_absent", () => {
  const md = (title: string, body: string) =>
    `---\ntype: legal_case\ntitle: ${title}\n---\n\n${body}`;

  test("existing page → page_exists, nothing written", async () => {
    await putPageOp.handler(makeCtx(), {
      slug: "legal/cases/op-taken",
      content: md("Original", "original body"),
    });
    let err: unknown;
    try {
      await putPageOp.handler(makeCtx(), {
        slug: "legal/cases/op-taken",
        content: md("Replacement", "replacement body"),
        if_absent: true,
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(OperationError);
    expect((err as OperationError).code).toBe("page_exists");
    expect(await storedTitle("legal/cases/op-taken")).toBe("Original");
  });

  test("soft-deleted page (hidden from getPage) → page_exists", async () => {
    await putPageOp.handler(makeCtx(), {
      slug: "legal/cases/op-deleted",
      content: md("Deleted", "body"),
    });
    await engine.softDeletePage("legal/cases/op-deleted", { sourceId: "default" });
    let err: unknown;
    try {
      await putPageOp.handler(makeCtx(), {
        slug: "legal/cases/op-deleted",
        content: md("New", "body"),
        if_absent: true,
      });
    } catch (e) {
      err = e;
    }
    expect((err as OperationError).code).toBe("page_exists");
    expect(await storedTitle("legal/cases/op-deleted")).toBe("Deleted");
  });

  test("two concurrent creates of one slug → exactly one wins", async () => {
    const slug = "legal/cases/race";
    const results = await Promise.allSettled([
      putPageOp.handler(makeCtx(), { slug, content: md("First", "first body"), if_absent: true }),
      putPageOp.handler(makeCtx(), { slug, content: md("Second", "second body"), if_absent: true }),
    ]);
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect((lost[0].reason as OperationError).code).toBe("page_exists");
    const rows = (await engine.executeRaw("SELECT title FROM pages WHERE slug = $1", [
      slug,
    ])) as Array<{ title: string }>;
    expect(rows).toHaveLength(1);
    expect(["First", "Second"]).toContain(rows[0].title);
  });

  test("engine-level race: parallel ifAbsent inserts → exactly one row", async () => {
    const slug = "legal/cases/race-engine";
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        engine.putPage(slug, page(`Writer ${i}`, "body"), { ifAbsent: true })
      )
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((r) => r.status === "rejected") as PromiseRejectedResult[]) {
      expect(r.reason).toBeInstanceOf(PageExistsError);
    }
  });
});
