/**
 * `gbrain pages backfill-case-slug` (core/case-slug-backfill.ts): stamps the
 * canonical case_slug on pages bound to a matter only by case_ref & co.
 * Dry run by default, idempotent, never stamps unresolved or ambiguous
 * references, and leaves soft references (free text) alone.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { importFromContent } from "../src/core/import-file.ts";
import { operations, OperationError, type OperationContext } from "../src/core/operations.ts";
import { backfillCaseSlugs } from "../src/core/case-slug-backfill.ts";
import type { MatterScope } from "../src/core/matter-access.ts";

const WALLED_CASE = "legal/cases/walled";
const OPEN_CASE = "legal/cases/open";
const WALLED: MatterScope = ["*", `!${WALLED_CASE}`];
const ONLY_WALLED: MatterScope = [WALLED_CASE];
let engine: PGLiteEngine;

async function put(slug: string, fm: Record<string, unknown>, body = "x") {
  const yaml = Object.entries(fm)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n");
  await importFromContent(engine, slug, `---\n${yaml}\n---\n\n${body}\n`, {
    sourceId: "default",
    noEmbed: true,
  });
}

async function visible(scope: MatterScope, slug: string): Promise<boolean> {
  const ctx: OperationContext = {
    engine: engine as never,
    config: {} as never,
    logger: console as never,
    dryRun: false,
    remote: true,
    sourceId: "default",
    matterScope: scope,
  };
  try {
    await operations.find((o) => o.name === "get_page")!.handler(ctx, { slug });
    return true;
  } catch (e) {
    if (e instanceof OperationError && e.code === "page_not_found") return false;
    throw e;
  }
}

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
  await put(WALLED_CASE, {
    type: "legal_case",
    title: "Zebra gegen Walled",
    case_number: "26-0001",
  });
  await put(OPEN_CASE, { type: "legal_case", title: "Offene Akte", case_number: "2026/101" });
  await put("burden-of-proof/legal/cases/walled", {
    type: "burden_of_proof",
    case_ref: WALLED_CASE,
  });
  await put("people/abc123-mueller", { type: "person", case_ref: "26 0001" });
  await put("deadlines/wiedervorlage-open", { type: "deadline", matter_slug: "2026/101" });
  await put("cross-case/both", { type: "cross_case_matrix", case_slugs: [OPEN_CASE, WALLED_CASE] });
  await put("legal-drafts/orphan", { type: "legal_draft", case_ref: "legal/cases/ghost" });
  await put("notes/mobile", { type: "note", matter: "Zebra gegen Walled" });
  await put("notes/already", { type: "note", case_ref: WALLED_CASE, case_slug: WALLED_CASE });
  await put("other-source/x", { type: "note", case_ref: WALLED_CASE }, "y");
  // A second firm (source) whose page names the same slug but has no such matter.
  await engine.executeRaw(
    `INSERT INTO sources (id, name) VALUES ('other', 'other') ON CONFLICT DO NOTHING`
  );
  await importFromContent(
    engine,
    "burden-of-proof/foreign",
    `---\ntype: burden_of_proof\ncase_ref: "${WALLED_CASE}"\n---\n\nz\n`,
    { sourceId: "other", noEmbed: true }
  );
}, 120_000);

afterAll(async () => {
  await engine?.disconnect();
}, 60_000);

describe("backfillCaseSlugs", () => {
  test("dry run reports, apply stamps unique matches only, a second run is a no-op", async () => {
    const dry = await backfillCaseSlugs(engine, { sourceId: "default" });
    expect(dry.dry_run).toBe(true);
    const status = Object.fromEntries(dry.rows.map((r) => [r.slug, r.status]));
    expect(status).toEqual({
      "burden-of-proof/legal/cases/walled": "would_stamp",
      "cross-case/both": "ambiguous",
      "deadlines/wiedervorlage-open": "would_stamp",
      "legal-drafts/orphan": "unresolved",
      "other-source/x": "would_stamp",
      "people/abc123-mueller": "would_stamp",
    });
    expect(dry.rows.find((r) => r.slug === "people/abc123-mueller")?.matters).toEqual([
      WALLED_CASE,
    ]);
    expect(dry.rows.find((r) => r.slug === "legal-drafts/orphan")?.unresolved_refs).toEqual([
      "legal/cases/ghost",
    ]);
    // A dry run changes nothing.
    expect((await engine.getPage("people/abc123-mueller"))!.frontmatter.case_slug).toBeUndefined();

    const applied = await backfillCaseSlugs(engine, { sourceId: "default", apply: true });
    expect(applied.dry_run).toBe(false);
    expect(applied.counts.stamped).toBe(4);
    const mueller = await engine.getPage("people/abc123-mueller");
    expect(mueller!.frontmatter.case_slug).toBe(WALLED_CASE);
    expect(mueller!.frontmatter.case_ref).toBe("26 0001");
    expect((await engine.getPage("deadlines/wiedervorlage-open"))!.frontmatter.case_slug).toBe(
      OPEN_CASE
    );
    expect((await engine.getPage("legal-drafts/orphan"))!.frontmatter.case_slug).toBeUndefined();
    expect((await engine.getPage("cross-case/both"))!.frontmatter.case_slug).toBeUndefined();
    expect((await engine.getPage("notes/mobile"))!.frontmatter.case_slug).toBeUndefined();
    // --source limits the run: the other firm's page is untouched.
    const foreign = await engine.getPage("burden-of-proof/foreign", { sourceId: "other" });
    expect(foreign!.frontmatter.case_slug).toBeUndefined();

    const again = await backfillCaseSlugs(engine, { sourceId: "default", apply: true });
    expect(again.counts.stamped).toBe(0);
    expect(again.rows.map((r) => r.status).sort()).toEqual(["ambiguous", "unresolved"]);
  });

  test("the walls hold before and after the backfill", async () => {
    expect(await visible(WALLED, "people/abc123-mueller")).toBe(false);
    expect(await visible(ONLY_WALLED, "people/abc123-mueller")).toBe(true);
    expect(await visible(WALLED, "legal-drafts/orphan")).toBe(false);
    expect(await visible(WALLED, "cross-case/both")).toBe(false);
  });

  test("a matter in another source never resolves a reference", async () => {
    // The foreign page names WALLED_CASE, but source "other" has no such matter.
    const report = await backfillCaseSlugs(engine, { sourceId: "other" });
    expect(report.rows.map((r) => [r.slug, r.status])).toEqual([
      ["burden-of-proof/foreign", "unresolved"],
    ]);
  });
});
