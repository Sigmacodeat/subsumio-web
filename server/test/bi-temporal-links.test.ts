/**
 * Bi-temporal link tests (v0.43.0 pbrain v0.3.0 port).
 * Validates supersedeLink, getLinkHistory, and valid_to filtering.
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

async function seedPages() {
  await engine.putPage("people/alice", {
    type: "person",
    title: "Alice Chen",
    compiled_truth: "Alice works at Acme.",
    timeline: "",
  });
  await engine.putPage("companies/acme", {
    type: "company",
    title: "Acme Corp",
    compiled_truth: "Acme is a startup.",
    timeline: "",
  });
  await engine.putPage("companies/nova", {
    type: "company",
    title: "NovaMind",
    compiled_truth: "NovaMind is an AI company.",
    timeline: "",
  });
}

describe("bi-temporal links", () => {
  test("getLinks only returns current edges (valid_to IS NULL)", async () => {
    await truncateAll();
    await seedPages();

    await engine.addLink("people/alice", "companies/acme", "works here", "works_at");
    const links = await engine.getLinks("people/alice");
    expect(links.length).toBe(1);
    expect(links[0]!.to_slug).toBe("companies/acme");
    expect(links[0]!.valid_to).toBeNull();
  });

  test("supersedeLink creates new version and marks old as expired", async () => {
    await truncateAll();
    await seedPages();

    // Initial link: Alice works at Acme
    await engine.addLink("people/alice", "companies/acme", "Senior Engineer", "works_at");

    // Supersede: Alice now works at NovaMind
    const result = await engine.supersedeLink(
      "people/alice",
      "companies/acme",
      "works_at",
      "Left Acme, joined NovaMind as CTO",
      "manual"
    );
    expect(result).not.toBeNull();
    expect(result!.oldLinkId).toBeGreaterThan(0);
    expect(result!.newLinkId).toBeGreaterThan(0);
    expect(result!.newLinkId).not.toBe(result!.oldLinkId);

    // Current links should now show the superseded version
    const currentLinks = await engine.getLinks("people/alice");
    expect(currentLinks.length).toBe(1);
    expect(currentLinks[0]!.context).toBe("Left Acme, joined NovaMind as CTO");
    expect(currentLinks[0]!.valid_to).toBeNull();

    // History should show both versions
    const history = await engine.getLinkHistory("people/alice", "companies/acme", "works_at");
    expect(history.length).toBe(2);
    expect(history[0]!.context).toBe("Left Acme, joined NovaMind as CTO"); // newest first
    expect(history[1]!.context).toBe("Senior Engineer");
    expect(history[1]!.valid_to).not.toBeNull();
    expect(history[1]!.superseded_by).toBe(result!.newLinkId);
  });

  test("supersedeLink returns null when no current link exists", async () => {
    await truncateAll();
    await seedPages();

    const result = await engine.supersedeLink(
      "people/alice",
      "companies/acme",
      "works_at",
      "New context"
    );
    expect(result).toBeNull();
  });

  test("getBacklinks filters current edges only", async () => {
    await truncateAll();
    await seedPages();

    await engine.addLink("people/alice", "companies/acme", "works here", "works_at");
    await engine.supersedeLink("people/alice", "companies/acme", "works_at", "Left");

    const backlinks = await engine.getBacklinks("companies/acme");
    // The superseded edge is hidden; the new current edge remains
    expect(backlinks.length).toBe(1);
    expect(backlinks[0]!.from_slug).toBe("people/alice");
    expect(backlinks[0]!.context).toBe("Left");
    expect(backlinks[0]!.valid_to).toBeNull();
  });
});
