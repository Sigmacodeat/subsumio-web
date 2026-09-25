/**
 * Ethical walls for the knowledge graph and for document version snapshots.
 *
 * GET /api/graph lists link endpoints with their titles; it must hide every
 * node the caller's matter scope hides (like /api/search) and drop edges to
 * them. A `document_version` snapshot belongs to the matter of the document
 * it copies — through the document's binding (`doc_frontmatter`) or its place
 * below the matter (`doc_slug`) — even when the snapshot itself carries no
 * top-level binding (snapshots written before the web app stamped one).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { setEnvForFile } from "./helpers/with-env.ts";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { importFromContent } from "../src/core/import-file.ts";
import { mountWebApi, invalidateMatterAccess } from "../src/commands/web-api.ts";
import { createIdentityToken } from "../src/core/identity-token.ts";
import { pageMatterBinding, buildMatterIndex } from "../src/core/matter-binding.ts";

const SECRET = "test-shared-secret-key-for-subsumio";
const SOURCE = "firm-graph";
let engine: PGLiteEngine;
let server: Server;
let base = "";
let releaseEnv: (() => void) | undefined;

function headers(userId: string, role: string, extra: Record<string, string> = {}) {
  return {
    "content-type": "application/json",
    "x-subsumio-api-key": SECRET,
    "x-subsumio-source": SOURCE,
    "x-subsumio-identity-token": createIdentityToken(
      { sourceId: SOURCE, matterScope: "all", userId, role },
      SECRET
    ),
    ...extra,
  };
}
const walled = () => headers("u-walled", "lawyer");
const colleague = () => headers("u-colleague", "lawyer");
const admin = () => headers("u-admin", "admin");

const putPage = (h: Record<string, string>, body: Record<string, unknown>) =>
  fetch(`${base}/api/pages`, { method: "POST", headers: h, body: JSON.stringify(body) });
const getPage = (h: Record<string, string>, slug: string) =>
  fetch(`${base}/api/pages/${slug}`, { headers: h });

const WALLED_CASE = "cases/walled";
const OPEN_CASE = "cases/open";
const WALLED_DOC = "docs/secret-contract"; // bound by case_slug
const PATH_DOC = "cases/walled/docs/memo"; // bound by its place below the matter
const OPEN_DOC = "docs/open-letter";

async function importPage(slug: string, fm: Record<string, unknown>, body = "text") {
  const yaml = Object.entries(fm)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n");
  await importFromContent(engine, slug, `---\n${yaml}\n---\n\n${body}\n`, {
    sourceId: SOURCE,
    noEmbed: true,
  });
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

  for (const slug of [WALLED_CASE, OPEN_CASE]) {
    const res = await putPage(admin(), {
      slug,
      type: "legal_case",
      title: slug === WALLED_CASE ? "Akte Geheimsache" : "Akte Offen",
      content: "Akte",
    });
    expect(res.status).toBe(200);
  }
  const wall = await putPage(
    headers("u-admin", "admin", { "x-subsumio-matter-permissions": "write" }),
    {
      slug: WALLED_CASE,
      merge: true,
      frontmatter: { permissions: { blocked_users: ["u-walled"] } },
    }
  );
  expect(wall.status).toBe(200);
  invalidateMatterAccess(SOURCE);

  await importPage(WALLED_DOC, {
    title: "Geheimer Vertrag",
    type: "document",
    case_slug: WALLED_CASE,
  });
  await importPage(PATH_DOC, { title: "Geheimes Memo", type: "document" });
  await importPage(OPEN_DOC, { title: "Offener Brief", type: "document", case_slug: OPEN_CASE });

  // Snapshots as written before top-level stamping: binding only nested.
  await importPage("legal/doc-versions/docs/secret-contract/v1", {
    title: "Version 1 — Geheimer Vertrag",
    type: "document_version",
    doc_slug: WALLED_DOC,
    version: 1,
    doc_frontmatter: { case_slug: WALLED_CASE, type: "document" },
    doc_content: "geheimer inhalt",
  });
  await importPage("legal/doc-versions/cases/walled/docs/memo/v1", {
    title: "Version 1 — Geheimes Memo",
    type: "document_version",
    doc_slug: PATH_DOC,
    version: 1,
    doc_frontmatter: { type: "document" },
    doc_content: "geheimes memo",
  });
  await importPage("legal/doc-versions/docs/open-letter/v1", {
    title: "Version 1 — Offener Brief",
    type: "document_version",
    doc_slug: OPEN_DOC,
    version: 1,
    doc_frontmatter: { case_slug: OPEN_CASE, type: "document" },
    doc_content: "offen",
  });

  const link = (from: string, to: string) =>
    engine.addLink(from, to, "", "mentions", undefined, undefined, undefined, {
      fromSourceId: SOURCE,
      toSourceId: SOURCE,
      originSourceId: SOURCE,
    });
  await link(WALLED_DOC, WALLED_CASE);
  await link(OPEN_DOC, OPEN_CASE);
  await link(OPEN_DOC, WALLED_DOC);
}, 120_000);

afterAll(async () => {
  server?.close();
  await engine?.disconnect();
  releaseEnv?.();
});

type Graph = {
  nodes: Array<{ id: string; name: string }>;
  links: Array<{ source: string; target: string }>;
};
const graph = async (h: Record<string, string>): Promise<Graph> =>
  (await (await fetch(`${base}/api/graph?limit=100`, { headers: h })).json()) as Graph;

describe("GET /api/graph", () => {
  test("a walled colleague sees no node, title or edge of the walled matter", async () => {
    const g = await graph(walled());
    const ids = g.nodes.map((n) => n.id);
    expect(ids).toContain(OPEN_DOC);
    expect(ids).toContain(OPEN_CASE);
    expect(ids).not.toContain(WALLED_CASE);
    expect(ids).not.toContain(WALLED_DOC);
    expect(JSON.stringify(g)).not.toContain("Geheim");
    for (const l of g.links) {
      expect([l.source, l.target]).not.toContain(WALLED_DOC);
      expect([l.source, l.target]).not.toContain(WALLED_CASE);
    }
  });

  test("a colleague without a wall sees the whole graph", async () => {
    const ids = (await graph(colleague())).nodes.map((n) => n.id);
    expect(ids).toContain(WALLED_CASE);
    expect(ids).toContain(WALLED_DOC);
    expect((await graph(colleague())).links).toHaveLength(3);
  });
});

describe("document_version snapshots", () => {
  test("inherit the document's matter binding and its place below the matter", async () => {
    expect((await getPage(walled(), "legal/doc-versions/docs/secret-contract/v1")).status).toBe(
      404
    );
    expect((await getPage(walled(), "legal/doc-versions/cases/walled/docs/memo/v1")).status).toBe(
      404
    );
    expect((await getPage(walled(), "legal/doc-versions/docs/open-letter/v1")).status).toBe(200);
    expect((await getPage(colleague(), "legal/doc-versions/docs/secret-contract/v1")).status).toBe(
      200
    );
  });

  test("are left out of listings for the walled colleague", async () => {
    const list = async (h: Record<string, string>) =>
      (
        (await (
          await fetch(`${base}/api/pages?type=document_version&limit=100`, { headers: h })
        ).json()) as Array<{ slug: string }>
      ).map((p) => p.slug);
    const seen = await list(walled());
    expect(seen).toContain("legal/doc-versions/docs/open-letter/v1");
    expect(seen).not.toContain("legal/doc-versions/docs/secret-contract/v1");
    expect(seen).not.toContain("legal/doc-versions/cases/walled/docs/memo/v1");
    expect(await list(colleague())).toContain("legal/doc-versions/docs/secret-contract/v1");
  });

  test("binding resolution: nested binding, parent path, and fail-closed without index", () => {
    const index = buildMatterIndex([{ slug: WALLED_CASE }, { slug: OPEN_CASE }]);
    const nested = pageMatterBinding(
      {
        slug: "legal/doc-versions/x/v1",
        type: "document_version",
        frontmatter: { doc_slug: "x", doc_frontmatter: { case_slug: WALLED_CASE } },
      },
      index
    );
    expect(nested.matters).toContain(WALLED_CASE);
    const byPath = pageMatterBinding(
      {
        slug: "legal/doc-versions/cases/walled/docs/memo/v1",
        type: "document_version",
        frontmatter: { doc_slug: PATH_DOC },
      },
      index
    );
    expect(byPath.matters).toEqual([WALLED_CASE]);
    const noIndex = pageMatterBinding({
      slug: "legal/doc-versions/cases/walled/docs/memo/v1",
      type: "document_version",
      frontmatter: { doc_slug: PATH_DOC },
    });
    expect(noIndex.unresolved).toContain(PATH_DOC);
    // Ordinary pages are unaffected by doc_* fields.
    const plain = pageMatterBinding(
      { slug: "notes/n", type: "note", frontmatter: { doc_slug: PATH_DOC } },
      index
    );
    expect(plain).toEqual({ matters: [], unresolved: [] });
  });
});
