/**
 * Duplicate entity prevention tests (v0.43.0 pbrain feature port).
 * Validates that put_page warns when creating a page with a similar title.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";

let engine: PGLiteEngine;

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
});

afterAll(async () => {
  await engine.disconnect();
});

async function truncateAll() {
  const tables = ["content_chunks", "links", "tags", "timeline_entries", "page_versions", "pages"];
  for (const t of tables) {
    await (engine as any).db.exec(`DELETE FROM ${t}`);
  }
}

describe("duplicate entity prevention", () => {
  test("findByTitleFuzzy detects similar titles", async () => {
    await truncateAll();

    // Create an existing page
    await engine.putPage("people/alice-chen", {
      type: "person",
      title: "Alice Chen",
      compiled_truth: "Alice is a founder.",
      timeline: "",
    });

    // Query for a very similar title
    const similar = await engine.findByTitleFuzzy("Alice Cheng", undefined, 0.5);
    expect(similar).not.toBeNull();
    expect(similar!.slug).toBe("people/alice-chen");
  });

  test("findByTitleFuzzy stays inside the requested source", async () => {
    await engine.executeRaw(
      `INSERT INTO sources (id, name, local_path) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      ["tenant-alpha", "Tenant Alpha", "/tmp/tenant-alpha"]
    );
    await engine.executeRaw(
      `INSERT INTO sources (id, name, local_path) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      ["tenant-beta", "Tenant Beta", "/tmp/tenant-beta"]
    );
    await engine.putPage(
      "people/alice-alpha",
      {
        type: "person",
        title: "Alice Example",
        compiled_truth: "alpha",
        frontmatter: { type: "person" },
      },
      { sourceId: "tenant-alpha" }
    );

    const crossTenant = await engine.findByTitleFuzzy("Alice Example", "people", 0.5, {
      sourceId: "tenant-beta",
    });
    expect(crossTenant).toBeNull();

    const ownTenant = await engine.findByTitleFuzzy("Alice Example", "people", 0.5, {
      sourceId: "tenant-alpha",
    });
    expect(ownTenant?.slug).toBe("people/alice-alpha");
  });

  test("does not flag different titles as similar", async () => {
    await truncateAll();

    await engine.putPage("people/bob", {
      type: "person",
      title: "Bob Smith",
      compiled_truth: "Bob is an engineer.",
      timeline: "",
    });

    const similar = await engine.findByTitleFuzzy("Alice Chen", undefined, 0.7);
    expect(similar).toBeNull();
  });
});
