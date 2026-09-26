/**
 * Document-level ACL (core/acl.ts) on the web API.
 *
 * A page with page_permissions rows is visible only to members of those
 * groups; admins see everything. A user in NO group sees only open pages —
 * leaving the last group must never widen access. The same rule holds for
 * every read path: single page, list, search, graph, export, the page-bound
 * helper routes (assertSlug*), and the page-bound matter guard.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { setEnvForFile } from "./helpers/with-env.ts";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { importFromContent } from "../src/core/import-file.ts";
import { mountWebApi } from "../src/commands/web-api.ts";
import { createIdentityToken } from "../src/core/identity-token.ts";
import {
  aclFilterClause,
  addGroupMember,
  createAccessGroup,
  filterPagesByACL,
  isPageAccessible,
  setPagePermission,
} from "../src/core/acl.ts";

const SECRET = "test-shared-secret-key-for-subsumio";
const SOURCE = "firm-acl";
let engine: PGLiteEngine;
let server: Server;
let base = "";
let releaseEnv: (() => void) | undefined;
let restrictedId = 0;
let openId = 0;
let memberGroupId = "";

function headers(userId: string, role: string) {
  return {
    "content-type": "application/json",
    "x-subsumio-api-key": SECRET,
    "x-subsumio-source": SOURCE,
    "x-subsumio-identity-token": createIdentityToken(
      { sourceId: SOURCE, matterScope: "all", userId, role },
      SECRET
    ),
  };
}
const noGroup = () => headers("u-nogroup", "lawyer");
const member = () => headers("u-member", "lawyer");
const otherGroup = () => headers("u-other", "lawyer");
const admin = () => headers("u-admin", "admin");

const RESTRICTED = "docs/aclsperre-vertrag";
const OPEN = "docs/aclsperre-offen";

async function importPage(slug: string, title: string, body: string) {
  await importFromContent(
    engine,
    slug,
    `---\ntitle: ${JSON.stringify(title)}\ntype: document\n---\n\n${body}\n`,
    { sourceId: SOURCE, noEmbed: true }
  );
}

beforeAll(async () => {
  releaseEnv = setEnvForFile({ SUBSUMIO_WEB_API_KEY: SECRET });
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
  const app = express();
  mountWebApi(app, engine, { apiKey: SECRET });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;

  await engine.executeRaw(
    `INSERT INTO sources (id, name, config) VALUES ($1, $1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING`,
    [SOURCE]
  );
  await importPage(RESTRICTED, "Vertrag Aclsperre", "aclsperre geheimklausel");
  await importPage(OPEN, "Brief Aclsperre", "aclsperre offener brief");
  restrictedId = (await engine.getPage(RESTRICTED, { sourceId: SOURCE }))!.id;
  openId = (await engine.getPage(OPEN, { sourceId: SOURCE }))!.id;

  const g = await createAccessGroup(engine, SOURCE, "Partner");
  const h = await createAccessGroup(engine, SOURCE, "Sekretariat");
  await addGroupMember(engine, g.id, "u-member", SOURCE);
  memberGroupId = g.id;
  await addGroupMember(engine, h.id, "u-other", SOURCE);
  await setPagePermission(engine, restrictedId, g.id, "read", SOURCE);

  await engine.addLink(OPEN, RESTRICTED, "", "mentions", undefined, undefined, undefined, {
    fromSourceId: SOURCE,
    toSourceId: SOURCE,
    originSourceId: SOURCE,
  });
}, 120_000);

afterAll(async () => {
  server?.close();
  await engine?.disconnect();
  releaseEnv?.();
});

describe("acl.ts: an empty group list means open pages only", () => {
  test("filterPagesByACL / isPageAccessible", async () => {
    expect(await filterPagesByACL(engine, [restrictedId, openId], [])).toEqual([openId]);
    expect(await isPageAccessible(engine, restrictedId, [])).toBe(false);
    expect(await isPageAccessible(engine, openId, [])).toBe(true);
    expect(await filterPagesByACL(engine, [restrictedId, openId], "all")).toEqual([
      restrictedId,
      openId,
    ]);
  });

  test("aclFilterClause binds the raw group list and filters an empty list", async () => {
    const run = async (groups: string[]) => {
      const c = aclFilterClause(groups, 2)!;
      const rows = await engine.executeRaw<{ id: number }>(
        `SELECT p.id FROM pages p WHERE p.id = ANY($1::int[]) ${c.clause} ORDER BY p.id`,
        [[restrictedId, openId], ...c.params]
      );
      return rows.map((r) => Number(r.id));
    };
    expect(aclFilterClause("all", 1)).toBeNull();
    expect(aclFilterClause(undefined, 1)).toBeNull();
    expect(await run([])).toEqual([openId]);
    expect(await run([memberGroupId])).toEqual([restrictedId, openId].sort((a, b) => a - b));
  });
});

const getPage = (h: Record<string, string>, slug: string) =>
  fetch(`${base}/api/pages/${slug}`, { headers: h });
const listSlugs = async (h: Record<string, string>) =>
  (
    (await (await fetch(`${base}/api/pages?limit=100`, { headers: h })).json()) as Array<{
      slug: string;
    }>
  ).map((p) => p.slug);

describe("single page and list", () => {
  test("a user in no group gets 404 and no list entry", async () => {
    expect((await getPage(noGroup(), RESTRICTED)).status).toBe(404);
    expect((await getPage(noGroup(), OPEN)).status).toBe(200);
    const slugs = await listSlugs(noGroup());
    expect(slugs).toContain(OPEN);
    expect(slugs).not.toContain(RESTRICTED);
  });

  test("a user of another group is refused too", async () => {
    expect((await getPage(otherGroup(), RESTRICTED)).status).toBe(404);
  });

  test("a group member and an admin see the page", async () => {
    expect((await getPage(member(), RESTRICTED)).status).toBe(200);
    expect((await getPage(admin(), RESTRICTED)).status).toBe(200);
    expect(await listSlugs(admin())).toContain(RESTRICTED);
  });
});

describe("search, graph and export", () => {
  test("search leaves the restricted page out for a user in no group", async () => {
    const hits = async (h: Record<string, string>) =>
      (
        (await (await fetch(`${base}/api/search?q=aclsperre`, { headers: h })).json()) as Array<{
          slug: string;
        }>
      ).map((r) => r.slug);
    expect(await hits(noGroup())).not.toContain(RESTRICTED);
    expect(await hits(member())).toContain(RESTRICTED);
  });

  test("graph drops the restricted node and its edges", async () => {
    const graph = async (h: Record<string, string>) =>
      (await (await fetch(`${base}/api/graph?limit=100`, { headers: h })).json()) as {
        nodes: Array<{ id: string }>;
      };
    expect((await graph(noGroup())).nodes.map((n) => n.id)).not.toContain(RESTRICTED);
    expect((await graph(member())).nodes.map((n) => n.id)).toContain(RESTRICTED);
  });

  test("export leaves the restricted page out", async () => {
    const exported = async (h: Record<string, string>) =>
      (
        (await (await fetch(`${base}/api/export`, { headers: h })).json()) as {
          pages: Array<{ slug: string }>;
        }
      ).pages.map((p) => p.slug);
    expect(await exported(noGroup())).not.toContain(RESTRICTED);
    expect(await exported(noGroup())).toContain(OPEN);
    expect(await exported(admin())).toContain(RESTRICTED);
  });
});

describe("page-bound routes (assertSlug* / assertPageMatterAccess)", () => {
  test("temporal relations and file download answer 404 for the restricted page", async () => {
    const rel = (h: Record<string, string>) =>
      fetch(`${base}/api/temporal/relations/${encodeURIComponent(RESTRICTED)}`, { headers: h });
    expect((await rel(noGroup())).status).toBe(404);
    expect((await rel(member())).status).toBe(200);
    // A user without access is stopped (404) before the file store is read;
    // a member gets past the guard (the store itself is not set up here).
    const file = (h: Record<string, string>) =>
      fetch(`${base}/api/files/${RESTRICTED}`, { headers: h });
    expect((await file(noGroup())).status).toBe(404);
    expect((await file(member())).status).not.toBe(404);
  });

  test("delete of the restricted page is refused for a user in no group", async () => {
    const res = await fetch(`${base}/api/pages/${RESTRICTED}`, {
      method: "DELETE",
      headers: noGroup(),
    });
    expect(res.status).toBe(404);
    expect(await engine.getPage(RESTRICTED, { sourceId: SOURCE })).not.toBeNull();
  });
});
