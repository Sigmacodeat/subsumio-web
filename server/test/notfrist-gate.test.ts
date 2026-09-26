/**
 * Vier-Augen-Kontrolle für Notfristen — engine backstop (core/notfrist-gate.ts).
 *
 * Whatever path a write takes (put_page, page_array_append,
 * page_array_mutate), a Notfrist does not reach `done` without the stamped
 * second check. Ordinary deadlines, already-done Notfristen and the
 * second-check write itself pass.
 *
 * Hermetic: in-memory PGLite, embed transport stubbed.
 */
import { describe, test, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { operations, OperationError } from "../src/core/operations.ts";
import type { OperationContext } from "../src/core/operations.ts";
import {
  configureGateway,
  resetGateway,
  __setEmbedTransportForTests,
} from "../src/core/ai/gateway.ts";
import {
  notfristAppendViolation,
  notfristCompletionViolation,
  notfristMutateViolation,
} from "../src/core/notfrist-gate.ts";

const op = (name: string) => operations.find((o) => o.name === name)!;

let engine: PGLiteEngine;

beforeAll(async () => {
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

function ctx(): OperationContext {
  return {
    engine,
    config: { engine: "pglite" as const },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    dryRun: false,
    remote: false,
    sourceId: "default",
  };
}

const md = (fm: string) => `---\n${fm}\n---\n\nText`;

async function expectGate(p: Promise<unknown>) {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(OperationError);
  expect((err as OperationError).code).toBe("notfrist_second_check_required");
}

describe("notfrist gate — pure rules", () => {
  test("standalone: pending → done without check is refused, with check allowed", () => {
    const prev = { is_notfrist: true, status: "pending", title: "Berufung" };
    expect(notfristCompletionViolation(prev, { ...prev, status: "done" })).toBe("Berufung");
    expect(
      notfristCompletionViolation(prev, {
        ...prev,
        status: "done",
        second_check_by: "B",
        second_check_at: "2026-09-26T10:00:00Z",
      })
    ).toBeNull();
  });

  test("ordinary deadline and already-done Notfrist pass", () => {
    expect(notfristCompletionViolation({ status: "pending" }, { status: "done" })).toBeNull();
    const done = { is_notfrist: true, status: "done" };
    expect(notfristCompletionViolation(done, { ...done, note: "x" })).toBeNull();
  });

  test("dropping the flag in the same write does not help", () => {
    const prev = { second_check_required: true, status: "open", title: "Revision" };
    expect(notfristCompletionViolation(prev, { status: "done", title: "Revision" })).toBe(
      "Revision"
    );
  });

  test("embedded deadlines[] and array ops", () => {
    const prev = { deadlines: [{ id: "d1", title: "Klage", is_notfrist: true, status: "open" }] };
    expect(
      notfristCompletionViolation(prev, {
        deadlines: [{ id: "d1", title: "Klage", is_notfrist: true, status: "done" }],
      })
    ).toBe("Klage");
    expect(
      notfristAppendViolation("deadlines", [{ title: "Neu", is_notfrist: true, status: "done" }])
    ).toBe("Neu");
    expect(notfristAppendViolation("time_entries", [{ is_notfrist: true, status: "done" }])).toBe(
      null
    );
    expect(
      notfristMutateViolation("deadlines", prev.deadlines, {
        matchKey: "id",
        matchValues: ["d1"],
        set: { status: "done" },
      })
    ).toBe("Klage");
  });
});

describe("notfrist gate — operations", () => {
  test("put_page refuses completing a stored Notfrist page", async () => {
    await op("put_page").handler(ctx(), {
      slug: "legal/deadlines/f1",
      content: md("type: legal_deadline\ntitle: Berufung\nis_notfrist: true\nstatus: pending"),
    });
    await expectGate(
      op("put_page").handler(ctx(), {
        slug: "legal/deadlines/f1",
        content: md("type: legal_deadline\ntitle: Berufung\nis_notfrist: true\nstatus: done"),
      })
    );
    const page = await engine.getPage("legal/deadlines/f1");
    expect(page?.frontmatter?.status).toBe("pending");
  });

  test("put_page allows the stamped second check", async () => {
    await op("put_page").handler(ctx(), {
      slug: "legal/deadlines/f2",
      content: md("type: legal_deadline\ntitle: Berufung\nis_notfrist: true\nstatus: pending"),
    });
    await op("put_page").handler(ctx(), {
      slug: "legal/deadlines/f2",
      content: md(
        "type: legal_deadline\ntitle: Berufung\nis_notfrist: true\nstatus: done\nsecond_check_by: Zweite Person\nsecond_check_at: '2026-09-26T10:00:00Z'"
      ),
    });
    const page = await engine.getPage("legal/deadlines/f2");
    expect(page?.frontmatter?.status).toBe("done");
  });

  test("page_array_mutate refuses and page_array_append refuses", async () => {
    await engine.putPage("legal/cases/m1", {
      type: "legal_case",
      title: "M1",
      compiled_truth: "",
      frontmatter: {
        deadlines: [
          { id: "d1", title: "Klage", is_notfrist: true, status: "open" },
          { id: "d2", title: "Stellungnahme", status: "open" },
        ],
      },
    });
    await expectGate(
      op("page_array_mutate").handler(ctx(), {
        page_slug: "legal/cases/m1",
        field: "deadlines",
        match: ["d1"],
        set: { status: "done" },
      })
    );
    // An ordinary deadline still completes.
    await op("page_array_mutate").handler(ctx(), {
      page_slug: "legal/cases/m1",
      field: "deadlines",
      match: ["d2"],
      set: { status: "done" },
    });
    await expectGate(
      op("page_array_append").handler(ctx(), {
        page_slug: "legal/cases/m1",
        field: "deadlines",
        items: [{ id: "d3", title: "Neu", is_notfrist: true, status: "done" }],
      })
    );
    const page = await engine.getPage("legal/cases/m1");
    const list = page?.frontmatter?.deadlines as Array<Record<string, unknown>>;
    expect(list.find((d) => d.id === "d1")?.status).toBe("open");
    expect(list.find((d) => d.id === "d2")?.status).toBe("done");
    expect(list).toHaveLength(2);
  });
});
