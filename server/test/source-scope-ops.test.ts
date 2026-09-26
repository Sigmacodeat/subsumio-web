/**
 * Several firms share one database. Operations reachable by untrusted callers
 * (MCP clients, firm tokens, tenant agent runs) stay within the caller's own
 * sources: fuzzy slug resolution, takes search and forgetting a fact. Tools
 * that read across sources are not offered to firm-bound MCP clients.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { importFromContent } from "../src/core/import-file.ts";
import { dispatchToolCall } from "../src/mcp/dispatch.ts";
import {
  TENANT_UNSAFE_TOOLS,
  isTenantBoundClient,
} from "../src/core/minions/tools/brain-allowlist.ts";

let engine: PGLiteEngine;

async function page(sourceId: string, slug: string, title: string) {
  await importFromContent(engine, slug, `---\ntitle: ${JSON.stringify(title)}\n---\n\ntext\n`, {
    sourceId,
    noEmbed: true,
  });
}

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
  for (const s of ["firm-a", "firm-b"]) {
    await engine.executeRaw(
      `INSERT INTO sources (id, name, config) VALUES ($1, $1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING`,
      [s]
    );
  }
  await page("firm-a", "clients/mustermann-a", "Mustermann Mandat A");
  await page("firm-b", "clients/mustermann-b", "Mustermann Mandat B");
}, 120_000);

afterAll(async () => {
  await engine?.disconnect();
});

const remoteA = { remote: true as const, sourceId: "firm-a" };

describe("resolve_slugs", () => {
  test("a remote caller of firm A never gets slugs of firm B", async () => {
    const res = await dispatchToolCall(engine, "resolve_slugs", { partial: "mustermann" }, remoteA);
    expect(res.isError).toBeFalsy();
    const slugs = JSON.parse(res.content[0]!.text) as string[];
    expect(slugs).toContain("clients/mustermann-a");
    expect(slugs).not.toContain("clients/mustermann-b");
  });
});

describe("forget_fact", () => {
  test("a fact of another source reads as not found and stays untouched", async () => {
    const [row] = await engine.executeRaw<{ id: number }>(
      `INSERT INTO facts (source_id, entity_slug, fact, kind, source, valid_from)
       VALUES ('firm-b', 'clients/mustermann-b', 'geheim', 'fact', 'test', now())
       RETURNING id`
    );
    const res = await dispatchToolCall(engine, "forget_fact", { id: row!.id }, remoteA);
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain("fact_not_found");
    const [after] = await engine.executeRaw<{ expired_at: unknown }>(
      `SELECT expired_at FROM facts WHERE id = $1`,
      [row!.id]
    );
    expect(after!.expired_at).toBeNull();
  });
});

describe("firm-bound MCP clients", () => {
  test("are recognised by their source binding", () => {
    expect(isTenantBoundClient({ sourceId: "firm-a" })).toBe(true);
    expect(isTenantBoundClient({ sourceId: "default", allowedSources: ["firm-a"] })).toBe(true);
    expect(isTenantBoundClient({ sourceId: "default" })).toBe(false);
    expect(isTenantBoundClient({})).toBe(false);
  });

  test("cross-source tools are on the tenant-unsafe list", () => {
    for (const name of [
      "get_ingest_log",
      "get_recent_salience",
      "find_anomalies",
      "takes_list",
      "takes_scorecard",
      "takes_calibration",
      "code_def",
      "code_refs",
    ]) {
      expect(TENANT_UNSAFE_TOOLS.has(name)).toBe(true);
    }
  });
});
