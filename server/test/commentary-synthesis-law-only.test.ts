/**
 * Legal commentaries are stored without a firm and read by every firm, so they
 * may only be synthesized from PUBLISHED case law in the shared law sources —
 * never from a firm's own matter pages (source isolation, see CLAUDE.md).
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { fetchLinkedCases } from "../src/core/cycle/commentary-synthesis.ts";

let engine: PGLiteEngine;
const STATUTE = "legal/statutes/at/abgb/§-1096";

async function page(sourceId: string, slug: string, type: string, body: string): Promise<number> {
  await engine.executeRaw(
    `INSERT INTO sources (id, name, jurisdiction) VALUES ($1, $1, $2) ON CONFLICT (id) DO NOTHING`,
    [sourceId, sourceId.startsWith("law-") ? "at" : null]
  );
  const rows = await engine.executeRaw<{ id: number }>(
    `INSERT INTO pages (source_id, slug, type, title, compiled_truth)
     VALUES ($1, $2, $3, $2, $4) RETURNING id`,
    [sourceId, slug, type, body]
  );
  return rows[0]!.id;
}

async function link(fromId: number, toId: number) {
  await engine.executeRaw(
    `INSERT INTO links (from_page_id, to_page_id, link_type, context)
     VALUES ($1, $2, 'case_to_statute', '§ 1096 ABGB')`,
    [fromId, toId]
  );
}

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();

  const statuteId = await page("law-at", STATUTE, "statute", "§ 1096 ABGB Text");
  const publicA = await page(
    "law-at-judikatur-ogh",
    "judikatur/ogh/5ob1-24",
    "court_decision",
    "OGH 5 Ob 1/24: Mietzinsminderung wegen Schimmel."
  );
  const publicB = await page(
    "law-at-judikatur-ogh",
    "judikatur/ogh/3ob2-23",
    "court_decision",
    "OGH 3 Ob 2/23: Minderung ab Anzeige."
  );
  const firmMatter = await page(
    "brain_firm01",
    "cases/mandant-huber-miete",
    "legal_case",
    "VERTRAULICH Mandant Huber, Wohnung Wien 1070, Schimmel."
  );
  await link(publicA, statuteId);
  await link(publicB, statuteId);
  await link(firmMatter, statuteId);
});

afterAll(async () => {
  await engine.disconnect();
});

describe("commentary synthesis reads published case law only", () => {
  test("a firm's matter linked to the same section never feeds the commentary", async () => {
    const cases = await fetchLinkedCases(engine, STATUTE);
    const slugs = cases.map((c) => c.judgement_id).sort();
    expect(slugs).toEqual(["judikatur/ogh/3ob2-23", "judikatur/ogh/5ob1-24"]);
    expect(cases.some((c) => c.snippet.includes("VERTRAULICH"))).toBe(false);
  });
});
