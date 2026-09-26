/**
 * A user restricted to one matter finds that matter's documents even when
 * better-ranked hits in other matters would fill the firm-wide top-N: the
 * matter-scope / ACL filters run after ranking, so the search over-fetches.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { resetPgliteState } from "./helpers/reset-pglite.ts";
import { operations, postFilterFetchLimit, type OperationContext } from "../src/core/operations.ts";
import { importFromContent } from "../src/core/import-file.ts";

let engine: PGLiteEngine;
const search = operations.find((o) => o.name === "search")!;

function ctxOf(overrides: Partial<OperationContext> = {}): OperationContext {
  return {
    engine: engine as any,
    config: {} as any,
    logger: console as any,
    dryRun: false,
    remote: false,
    sourceId: "default",
    ...overrides,
  };
}

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
  await resetPgliteState(engine);
  await engine.setConfig("search.mcp_keyword_only", "true");
  for (const [slug, title] of [
    ["legal/cases/akte-a", "Akte A"],
    ["legal/cases/akte-b", "Akte B"],
  ]) {
    await engine.putPage(
      slug,
      { type: "legal_case", title, compiled_truth: "Akte", frontmatter: {} },
      { sourceId: "default" }
    );
  }
  // 30 strong hits in the other matter, 5 weaker ones in the user's matter.
  for (let i = 0; i < 30; i++) {
    await importFromContent(
      engine,
      `documents/b-${i}`,
      `---\ntitle: Mietzins Mietzins ${i}\ntype: legal_document\ncase_slug: legal/cases/akte-b\n---\n\nMietzins Mietzins Mietzins Mietzinsminderung Mietzins ${i}`,
      { sourceId: "default", noEmbed: true }
    );
  }
  const ownTexts = [
    "Die Klägerin begehrt die Rückzahlung von Mietzins wegen eines Wasserschadens.",
    "Protokoll der Tagsatzung: Zeugin bestätigt Zahlung des Mietzins im März.",
    "Gutachten zur Angemessenheit: Mietzins liegt über dem Richtwert der Lage.",
    "Vergleichsangebot der Gegenseite, Mietzins für zwei Monate zu erlassen.",
    "Aktenvermerk: Mandant legt Kontoauszüge zum geleisteten Mietzins vor.",
  ];
  for (const [i, body] of ownTexts.entries()) {
    await importFromContent(
      engine,
      `documents/a-${i}`,
      // Two page types: search dedup caps one type at 60 % of the results.
      `---\ntitle: Schreiben ${i}\ntype: ${i < 3 ? "legal_document" : "legal_note"}\ncase_slug: legal/cases/akte-a\n---\n\n${body}`,
      { sourceId: "default", noEmbed: true }
    );
  }
}, 120_000);

afterAll(async () => {
  if (engine) await engine.disconnect();
}, 60_000);

describe("search for a matter-restricted user", () => {
  test("finds the documents of their own matter behind better hits elsewhere", async () => {
    const results = (await search.handler(ctxOf({ matterScope: ["legal/cases/akte-a"] }), {
      query: "Mietzins",
      limit: 5,
    })) as Array<{ slug: string }>;
    const slugs = results.map((r) => r.slug);
    expect(slugs.length).toBe(5);
    expect(slugs.every((s) => s.startsWith("documents/a-"))).toBe(true);
  });

  test("unrestricted callers fetch exactly the limit; restricted ones over-fetch", () => {
    expect(postFilterFetchLimit({ matterScope: "all", aclGroups: "all" }, 20)).toBe(20);
    expect(postFilterFetchLimit({}, 20)).toBe(20);
    expect(postFilterFetchLimit({ matterScope: ["legal/cases/a"] }, 20)).toBe(100);
    expect(postFilterFetchLimit({ aclGroups: ["team-a"] }, 100)).toBe(250);
  });
});
