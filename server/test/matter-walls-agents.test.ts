/**
 * Ethical walls for background agent work: the web caller's matter scope
 * travels with the job (`_matter_scope`, `_matter_read_only`), is inherited by
 * every spawned child, and the subagent brain tools enforce it — reads drop
 * walled pages, writes into walled or read-only matters are refused, and a
 * malformed stamp denies everything instead of widening to "all".
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { OperationError } from "../src/core/operations.ts";
import {
  inheritedJobMatterStamp,
  jobMatterStamp,
  readJobMatterAccess,
  type MatterScope,
} from "../src/core/matter-access.ts";
import { buildBrainTools, MATTER_SCOPED_TOOLS } from "../src/core/minions/tools/brain-allowlist.ts";
import { supervisorChildStamps } from "../src/core/minions/handlers/supervisor.ts";
import type { GBrainConfig } from "../src/core/config.ts";
import type { ToolCtx, ToolDef } from "../src/core/minions/types.ts";

const config: GBrainConfig = { engine: "pglite" } as GBrainConfig;
const WALLED: MatterScope = ["*", "!cases/walled"];
let engine: PGLiteEngine;

function tools(opts: { scope?: MatterScope; readOnly?: string[]; subagentId?: number } = {}) {
  return buildBrainTools({
    subagentId: opts.subagentId ?? 9,
    engine,
    config,
    matterScope: opts.scope,
    matterReadOnly: opts.readOnly,
  });
}

function tool(defs: ToolDef[], name: string): ToolDef {
  const t = defs.find((d) => d.name === `brain_${name}`);
  if (!t) throw new Error(`tool ${name} missing`);
  return t;
}

const ctx = (): ToolCtx => ({ engine, jobId: 1, remote: true });

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({ database_url: "" });
  await engine.initSchema();
  const put = (slug: string, type: string, title: string, fm: Record<string, unknown> = {}) =>
    engine.putPage(slug, { type: type as never, title, compiled_truth: title, frontmatter: fm });
  await put("cases/walled", "legal_case", "Mandat Zebra Walled");
  await put("cases/open", "legal_case", "Mandat Zebra Open");
  await put("documents/klage", "document", "Klage", { case_slug: "cases/walled" });
  await put("documents/antrag", "document", "Antrag", { case_slug: "cases/open" });
  await put("wiki/agents/9/walled-note", "note", "Alte Notiz", { case_slug: "cases/walled" });
  await engine.addLink("documents/klage", "documents/antrag", "verweist", "mentions");
  await engine.addLink("cases/open", "documents/antrag", "enthaelt", "mentions");
  await engine.addLink("cases/open", "cases/walled", "verwandt", "mentions");
}, 60_000);

afterAll(async () => {
  await engine?.disconnect();
}, 60_000);

describe("job matter stamp", () => {
  test("unrestricted callers leave no stamp; restricted ones carry scope and read-only list", () => {
    expect(jobMatterStamp("all", [])).toEqual({});
    expect(jobMatterStamp(undefined, undefined)).toEqual({});
    expect(jobMatterStamp(WALLED, ["cases/open"])).toEqual({
      _matter_scope: WALLED,
      _matter_read_only: ["cases/open"],
    });
    expect(jobMatterStamp("all", ["cases/open"])).toEqual({
      _matter_scope: "all",
      _matter_read_only: ["cases/open"],
    });
  });

  test("absent stamp is unrestricted; malformed stamp denies everything", () => {
    expect(readJobMatterAccess({ prompt: "x" })).toEqual({ readOnly: [] });
    expect(readJobMatterAccess({ _matter_scope: WALLED })).toEqual({
      scope: WALLED,
      readOnly: [],
    });
    for (const bad of [null, "", "everything", 42, [1], [""], { a: 1 }]) {
      expect(readJobMatterAccess({ _matter_scope: bad }).scope).toEqual([]);
    }
    expect(readJobMatterAccess({ _matter_scope: "all", _matter_read_only: "x" }).scope).toEqual([]);
  });

  test("children inherit the stamp (re-validated) together with the source", () => {
    expect(supervisorChildStamps({ _source_id: "firm-a", _matter_scope: WALLED })).toEqual({
      _source_id: "firm-a",
      _matter_scope: WALLED,
    });
    expect(supervisorChildStamps({ _source_id: "firm-a" })).toEqual({ _source_id: "firm-a" });
    expect(inheritedJobMatterStamp({ _matter_scope: "bogus" })).toEqual({ _matter_scope: [] });
  });
});

describe("subagent brain tools under a matter scope", () => {
  test("a scoped job only gets tools that honour the scope", () => {
    const names = tools({ scope: WALLED }).map((t) => t.name.replace(/^brain_/, ""));
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(MATTER_SCOPED_TOOLS.has(n)).toBe(true);
    expect(names).not.toContain("list_link_sources");
    // An unscoped job keeps the full registry.
    expect(tools().map((t) => t.name)).toContain("brain_list_link_sources");
  });

  test("get_page on a walled matter or a document bound to it reads as not found", async () => {
    const getPage = tool(tools({ scope: WALLED }), "get_page");
    await expect(getPage.execute({ slug: "cases/walled" }, ctx())).rejects.toBeInstanceOf(
      OperationError
    );
    await expect(getPage.execute({ slug: "documents/klage" }, ctx())).rejects.toBeInstanceOf(
      OperationError
    );
    const open = (await getPage.execute({ slug: "documents/antrag" }, ctx())) as { slug: string };
    expect(open.slug).toBe("documents/antrag");
    // Without a scope (CLI / cron) nothing changes.
    const unscoped = tool(tools(), "get_page");
    expect(
      ((await unscoped.execute({ slug: "cases/walled" }, ctx())) as { slug: string }).slug
    ).toBe("cases/walled");
  });

  test("list_pages and resolve_slugs drop walled pages, including case_slug-bound documents", async () => {
    const t = tools({ scope: WALLED });
    const listed = (await tool(t, "list_pages").execute({ limit: 50 }, ctx())) as Array<{
      slug: string;
    }>;
    const slugs = listed.map((p) => p.slug);
    expect(slugs).toContain("cases/open");
    expect(slugs).toContain("documents/antrag");
    expect(slugs).not.toContain("cases/walled");
    expect(slugs).not.toContain("documents/klage");

    const resolved = (await tool(t, "resolve_slugs").execute(
      { partial: "cases" },
      ctx()
    )) as string[];
    expect(resolved).toContain("cases/open");
    expect(resolved).not.toContain("cases/walled");
  });

  test("graph reads start only from visible pages and hide walled neighbours", async () => {
    const t = tool(tools({ scope: WALLED }), "get_backlinks");
    await expect(t.execute({ slug: "documents/klage" }, ctx())).rejects.toBeInstanceOf(
      OperationError
    );
    const back = (await t.execute({ slug: "documents/antrag" }, ctx())) as Array<{
      from_slug: string;
    }>;
    expect(back.map((l) => l.from_slug)).toEqual(["cases/open"]);

    const graph = tool(tools({ scope: WALLED }), "traverse_graph");
    const nodes = (await graph.execute({ slug: "cases/open", depth: 2 }, ctx())) as Array<{
      slug: string;
      links: Array<{ to_slug: string }>;
    }>;
    const seen = new Set(nodes.flatMap((n) => [n.slug, ...n.links.map((l) => l.to_slug)]));
    expect(seen.has("cases/walled")).toBe(false);
    expect(seen.has("documents/klage")).toBe(false);
  });

  test("put_page into a walled matter is refused like a missing page", async () => {
    const putPage = tool(tools({ scope: WALLED }), "put_page");
    await expect(
      putPage.execute(
        {
          slug: "wiki/agents/9/sneak",
          content: "---\ntitle: Sneak\ncase_slug: cases/walled\n---\nbody",
        },
        ctx()
      )
    ).rejects.toMatchObject({ code: "page_not_found" });
    // Overwriting a page already bound to the walled matter is refused too.
    await expect(
      putPage.execute(
        { slug: "wiki/agents/9/walled-note", content: "---\ntitle: Neu\n---\nbody" },
        ctx()
      )
    ).rejects.toMatchObject({ code: "page_not_found" });
    expect(await engine.getPage("wiki/agents/9/sneak")).toBeNull();
  });

  test("put_page into a read-only matter is refused; a free note still works", async () => {
    const putPage = tool(tools({ scope: WALLED, readOnly: ["cases/open"] }), "put_page");
    await expect(
      putPage.execute(
        {
          slug: "wiki/agents/9/ro",
          content: "---\ntitle: RO\ncase_slug: cases/open\n---\nbody",
        },
        ctx()
      )
    ).rejects.toMatchObject({ code: "permission_denied" });
    await putPage.execute(
      { slug: "wiki/agents/9/free", content: "---\ntitle: Frei\n---\nbody" },
      ctx()
    );
    expect(await engine.getPage("wiki/agents/9/free")).not.toBeNull();
  });

  test("a malformed stamp (scope []) sees nothing", async () => {
    const access = readJobMatterAccess({ _matter_scope: "garbage" });
    const t = tools({ scope: access.scope, readOnly: access.readOnly });
    await expect(tool(t, "get_page").execute({ slug: "cases/open" }, ctx())).rejects.toBeInstanceOf(
      OperationError
    );
    expect(await tool(t, "list_pages").execute({ limit: 50 }, ctx())).toEqual([]);
  });
});
