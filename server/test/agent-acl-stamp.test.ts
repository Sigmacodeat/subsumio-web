/**
 * Agent and background runs carry the document ACL groups of the user who
 * started them (`_acl_groups`), and the engine applies them to every brain
 * tool call and to the supervisor's matter context. Fail-closed: a user or
 * firm job without the stamp sees open pages only; "all" is kept only for a
 * firm admin.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { setEnvForFile } from "./helpers/with-env.ts";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { mountWebApi } from "../src/commands/web-api.ts";
import { createIdentityToken } from "../src/core/identity-token.ts";
import { addGroupMember, createAccessGroup, setPagePermission } from "../src/core/acl.ts";
import {
  inheritedAgentStamps,
  jobAclStamp,
  readJobAclGroups,
} from "../src/core/matter-access.ts";
import { buildBrainTools } from "../src/core/minions/tools/brain-allowlist.ts";
import { loadCaseContext } from "../src/core/minions/handlers/supervisor.ts";
import type { GBrainConfig } from "../src/core/config.ts";
import type { ToolCtx } from "../src/core/minions/types.ts";

describe("ACL job stamp", () => {
  test("only an admin keeps 'all'; everyone else is stamped with a list", () => {
    expect(jobAclStamp("all", true)).toEqual({ _acl_groups: "all" });
    expect(jobAclStamp("all", false)).toEqual({ _acl_groups: [] });
    expect(jobAclStamp(undefined, false)).toEqual({ _acl_groups: [] });
    expect(jobAclStamp(["g1"], false)).toEqual({ _acl_groups: ["g1"] });
    expect(jobAclStamp(["g1"], true)).toEqual({ _acl_groups: ["g1"] });
  });

  test("reading: stamp wins, malformed is open-only, user/firm jobs without stamp are open-only", () => {
    expect(readJobAclGroups({ _acl_groups: "all" })).toBe("all");
    expect(readJobAclGroups({ _acl_groups: ["g1"] })).toEqual(["g1"]);
    expect(readJobAclGroups({ _acl_groups: "everything" })).toEqual([]);
    expect(readJobAclGroups({ _acl_groups: [1, 2] })).toEqual([]);
    expect(readJobAclGroups({ _owner_user_id: "alice" })).toEqual([]);
    expect(readJobAclGroups({ _source_id: "firm-a" })).toEqual([]);
    expect(readJobAclGroups({ source_id: "firm-a" })).toEqual([]);
    expect(readJobAclGroups({ _matter_scope: "all" })).toEqual([]);
    // Host jobs without any user or firm (CLI, host cron): no document filter.
    expect(readJobAclGroups({})).toBeUndefined();
    expect(readJobAclGroups({ _source_id: "default" })).toBeUndefined();
  });

  test("spawned jobs inherit the stamp", () => {
    expect(inheritedAgentStamps({ _acl_groups: ["g1"], _owner_user_id: "alice" })).toEqual({
      _acl_groups: ["g1"],
      _owner_user_id: "alice",
    });
    expect(inheritedAgentStamps({ _source_id: "firm-a" })).toEqual({ _acl_groups: [] });
    expect(inheritedAgentStamps({})).toEqual({});
  });
});

// ── Brain tools and case context under a stamped job ─────────

const SOURCE = "firm-agent-acl";
const config: GBrainConfig = { engine: "pglite" } as GBrainConfig;
let engine: PGLiteEngine;
let groupId = "";

describe("agent runs apply the stamped ACL groups", () => {
  beforeAll(async () => {
    engine = new PGLiteEngine();
    await engine.connect({ database_url: "" });
    await engine.initSchema();
    await engine.executeRaw(
      `INSERT INTO sources (id, name, config) VALUES ($1, $1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING`,
      [SOURCE]
    );
    const put = (slug: string, type: string, title: string, fm: Record<string, unknown> = {}) =>
      engine.putPage(
        slug,
        { type: type as never, title, compiled_truth: `${title} text`, frontmatter: fm },
        { sourceId: SOURCE }
      );
    await put("cases/akte", "legal_case", "Akte Aclstempel");
    await put("docs/restricted", "document", "Geheimvertrag Aclstempel", {
      case_slug: "cases/akte",
    });
    await put("docs/open", "document", "Offener Brief Aclstempel", { case_slug: "cases/akte" });
    await put("cases/sperr", "legal_case", "Gesperrte Akte Aclstempel");
    const g = await createAccessGroup(engine, SOURCE, "Partner");
    groupId = g.id;
    await addGroupMember(engine, g.id, "u-partner", SOURCE);
    for (const slug of ["docs/restricted", "cases/sperr"]) {
      const page = await engine.getPage(slug, { sourceId: SOURCE });
      expect(await setPagePermission(engine, page!.id, g.id, "read", SOURCE)).toBe(true);
    }
  }, 60_000);

  afterAll(async () => {
    await engine?.disconnect();
  }, 60_000);

  const tool = (aclGroups: string[] | "all" | undefined, name: string) =>
    buildBrainTools({ subagentId: 3, engine, config, sourceId: SOURCE, aclGroups }).find(
      (t) => t.name === name
    );
  const ctx = (): ToolCtx => ({ engine, jobId: 1, remote: true });

  test("get_page: a user in no group cannot read a restricted page", async () => {
    await expect(
      tool([], "brain_get_page")!.execute({ slug: "docs/restricted" }, ctx())
    ).rejects.toThrow();
    const open = (await tool([], "brain_get_page")!.execute({ slug: "docs/open" }, ctx())) as {
      slug: string;
    };
    expect(open.slug).toBe("docs/open");
  });

  test("get_page: the group member and the admin stamp read it", async () => {
    const member = (await tool([groupId], "brain_get_page")!.execute(
      { slug: "docs/restricted" },
      ctx()
    )) as { slug: string };
    expect(member.slug).toBe("docs/restricted");
    const admin = (await tool("all", "brain_get_page")!.execute(
      { slug: "docs/restricted" },
      ctx()
    )) as { slug: string };
    expect(admin.slug).toBe("docs/restricted");
  });

  test("list_pages and resolve_slugs drop restricted pages", async () => {
    const rows = (await tool([], "brain_list_pages")!.execute(
      { type: "document", limit: 50 },
      ctx()
    )) as Array<{ slug: string }>;
    const slugs = rows.map((r) => r.slug);
    expect(slugs).toContain("docs/open");
    expect(slugs).not.toContain("docs/restricted");
  });

  test("an ACL-restricted job gets only tools that honour the ACL", () => {
    const names = buildBrainTools({
      subagentId: 3,
      engine,
      config,
      aclGroups: [],
    }).map((t) => t.name);
    expect(names).toContain("brain_get_page");
    expect(names).not.toContain("brain_list_link_sources");
    expect(names).not.toContain("brain_get_ingest_log");
  });

  test("supervisor case context leaves restricted pages and matters out", async () => {
    const open = await loadCaseContext(engine, "cases/akte", SOURCE, undefined, []);
    expect(open?.evidence.map((e) => e.title)).toEqual(["Offener Brief Aclstempel"]);
    const member = await loadCaseContext(engine, "cases/akte", SOURCE, undefined, [groupId]);
    expect(member?.evidence.map((e) => e.title).sort()).toEqual([
      "Geheimvertrag Aclstempel",
      "Offener Brief Aclstempel",
    ]);
    expect(await loadCaseContext(engine, "cases/sperr", SOURCE, undefined, [])).toBeNull();
    expect(await loadCaseContext(engine, "cases/sperr", SOURCE, undefined, "all")).not.toBeNull();
  });
});

// ── HTTP: the supervisor route stamps the caller's groups ─────

const SECRET = "test-shared-secret-key-for-subsumio";
const HTTP_SOURCE = "firm-agent-acl-http";
let httpEngine: PGLiteEngine;
let server: Server;
let base = "";
let releaseEnv: (() => void) | undefined;
let httpGroup = "";

function headers(userId: string, role: string) {
  return {
    "content-type": "application/json",
    "x-subsumio-api-key": SECRET,
    "x-subsumio-source": HTTP_SOURCE,
    "x-subsumio-identity-token": createIdentityToken(
      { sourceId: HTTP_SOURCE, matterScope: "all", userId, role },
      SECRET
    ),
  };
}

async function submittedStamp(h: Record<string, string>): Promise<unknown> {
  const res = await fetch(`${base}/api/agents/supervisor`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ prompt: "Recherche" }),
  });
  expect(res.status).toBe(200);
  const { jobId } = (await res.json()) as { jobId: number };
  const [row] = await httpEngine.executeRaw<{ data: unknown }>(
    `SELECT data FROM minion_jobs WHERE id = $1`,
    [jobId]
  );
  const d = (typeof row?.data === "string" ? JSON.parse(row.data) : row?.data) as Record<
    string,
    unknown
  >;
  return d._acl_groups;
}

describe("supervisor route stamps the caller's ACL groups", () => {
  beforeAll(async () => {
    releaseEnv = setEnvForFile({ SUBSUMIO_WEB_API_KEY: SECRET });
    httpEngine = new PGLiteEngine();
    await httpEngine.connect({});
    await httpEngine.initSchema();
    await httpEngine.executeRaw(
      `INSERT INTO sources (id, name, config) VALUES ($1, $1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING`,
      [HTTP_SOURCE]
    );
    const g = await createAccessGroup(httpEngine, HTTP_SOURCE, "Partner");
    httpGroup = g.id;
    await addGroupMember(httpEngine, g.id, "u-member", HTTP_SOURCE);
    const app = express();
    mountWebApi(app, httpEngine, { apiKey: SECRET });
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const addr = server.address();
    base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  }, 120_000);

  afterAll(async () => {
    server?.close();
    await httpEngine?.disconnect();
    releaseEnv?.();
  });

  test("member, user in no group and admin", async () => {
    expect(await submittedStamp(headers("u-member", "lawyer"))).toEqual([httpGroup]);
    expect(await submittedStamp(headers("u-nobody", "lawyer"))).toEqual([]);
    expect(await submittedStamp(headers("u-admin", "admin"))).toBe("all");
  });
});
