/**
 * Engine parity — create-only putPage (`ifAbsent`).
 *
 * Postgres and PGLite must answer a create-only write identically: a missing
 * slug is created, any row at (source_id, slug) — live, soft-deleted,
 * tombstoned — raises PageExistsError and stays untouched, and parallel
 * creates of one slug produce exactly one row. On Postgres the parallel
 * writers hold separate pool connections, so this is a real race.
 *
 * Gated by DATABASE_URL (Postgres half skips without a test database); the
 * PGLite half always runs.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PGLiteEngine } from "../../src/core/pglite-engine.ts";
import type { BrainEngine } from "../../src/core/engine.ts";
import { PageExistsError } from "../../src/core/engine-errors.ts";
import { hasDatabase, setupDB, teardownDB } from "./helpers.ts";

const SKIP_PG = !hasDatabase();

const page = (title: string, fm: Record<string, unknown> = {}) => ({
  type: "invoice" as const,
  title,
  compiled_truth: `${title} body`,
  timeline: "",
  frontmatter: { title, ...fm },
});

type Outcome = "created" | "exists" | { other: string };

async function attempt(eng: BrainEngine, slug: string, title: string): Promise<Outcome> {
  try {
    await eng.putPage(slug, page(title), { sourceId: "default", ifAbsent: true });
    return "created";
  } catch (e) {
    if (e instanceof PageExistsError) return "exists";
    return { other: e instanceof Error ? e.message : String(e) };
  }
}

async function titleOf(eng: BrainEngine, slug: string): Promise<string | null> {
  const rows = (await eng.executeRaw(
    "SELECT title FROM pages WHERE slug = $1 AND source_id = 'default'",
    [slug]
  )) as Array<{ title: string }>;
  return rows[0]?.title ?? null;
}

/** The scenario both engines run; returns a comparable transcript. */
async function scenario(eng: BrainEngine): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  out.fresh = await attempt(eng, "invoices/parity-fresh", "Fresh");
  out.freshTitle = await titleOf(eng, "invoices/parity-fresh");

  await eng.putPage("invoices/parity-live", page("Live"));
  out.live = await attempt(eng, "invoices/parity-live", "Replacement");
  out.liveTitle = await titleOf(eng, "invoices/parity-live");

  await eng.putPage("invoices/parity-deleted", page("Deleted"));
  await eng.softDeletePage("invoices/parity-deleted", { sourceId: "default" });
  out.deleted = await attempt(eng, "invoices/parity-deleted", "Replacement");
  out.deletedTitle = await titleOf(eng, "invoices/parity-deleted");

  await eng.putPage("invoices/parity-tomb", page("Tomb", { status: "tombstoned" }));
  out.tomb = await attempt(eng, "invoices/parity-tomb", "Replacement");
  out.tombTitle = await titleOf(eng, "invoices/parity-tomb");

  const race = await Promise.all(
    Array.from({ length: 8 }, (_, i) => attempt(eng, "invoices/parity-race", `Writer ${i}`))
  );
  out.raceCreated = race.filter((r) => r === "created").length;
  out.raceExists = race.filter((r) => r === "exists").length;
  const rows = (await eng.executeRaw("SELECT count(*)::int AS n FROM pages WHERE slug = $1", [
    "invoices/parity-race",
  ])) as Array<{ n: number }>;
  out.raceRows = Number(rows[0]?.n);
  return out;
}

const EXPECTED = {
  fresh: "created",
  freshTitle: "Fresh",
  live: "exists",
  liveTitle: "Live",
  deleted: "exists",
  deletedTitle: "Deleted",
  tomb: "exists",
  tombTitle: "Tomb",
  raceCreated: 1,
  raceExists: 7,
  raceRows: 1,
};

let pglite: PGLiteEngine;
let pg: BrainEngine | null = null;

beforeAll(async () => {
  pglite = new PGLiteEngine();
  await pglite.connect({});
  await pglite.initSchema();
  if (!SKIP_PG) pg = await setupDB();
}, 90_000);

afterAll(async () => {
  await pglite.disconnect();
  if (!SKIP_PG) await teardownDB();
}, 30_000);

describe("putPage ifAbsent — PGLite", () => {
  test("create-only contract", async () => {
    expect(await scenario(pglite)).toEqual(EXPECTED);
  });
});

(SKIP_PG ? describe.skip : describe)("putPage ifAbsent — Postgres parity", () => {
  test("same transcript as PGLite, with a real concurrent race", async () => {
    expect(await scenario(pg!)).toEqual(EXPECTED);
  });
});
