/**
 * The stub page of an upload whose extraction runs in the background carries
 * its matter, type, processing status and title right away. put_page reads
 * metadata only from the YAML block of `content`, so the upload routes build
 * that block (putProcessingPlaceholder) instead of passing fields put_page
 * does not know.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { putProcessingPlaceholder } from "../src/commands/web-api.ts";

let engine: PGLiteEngine;

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
  await engine.executeRaw(
    `INSERT INTO sources (id, name, config) VALUES ('firm-up', 'firm-up', '{}'::jsonb) ON CONFLICT (id) DO NOTHING`
  );
}, 120_000);

afterAll(async () => {
  await engine?.disconnect();
});

describe("putProcessingPlaceholder", () => {
  test("keeps matter, type, status and title of the upload", async () => {
    await putProcessingPlaceholder(
      engine,
      "documents/grosser-vertrag",
      "Großer Vertrag",
      {
        case_slug: "cases/akte-1",
        type: "document",
        extraction_status: "processing",
        doc_type: "vertrag",
        jurisdiction: undefined,
      },
      "firm-up"
    );
    const page = await engine.getPage("documents/grosser-vertrag", { sourceId: "firm-up" });
    expect(page?.title).toBe("Großer Vertrag");
    expect(page?.type).toBe("document");
    expect(page?.frontmatter?.case_slug).toBe("cases/akte-1");
    expect(page?.frontmatter?.extraction_status).toBe("processing");
    expect(page?.frontmatter?.doc_type).toBe("vertrag");
    expect(page?.compiled_truth).toContain("wird verarbeitet");
  });
});

describe("upload routes", () => {
  test("write the stub through the helper, not with put_page fields it ignores", () => {
    const src = readFileSync(join(import.meta.dir, "../src/commands/web-api.ts"), "utf-8");
    expect(src.match(/putProcessingPlaceholder\(\s*engine,/g)?.length ?? 0).toBe(3);
    expect(src).not.toMatch(/"put_page",\s*\{\s*slug[^}]*?frontmatter:/s);
  });
});
