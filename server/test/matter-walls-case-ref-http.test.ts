/**
 * Ethical walls over HTTP for pages bound to a matter only by `case_ref`
 * (legal pipeline results, Wiedervorlagen): the web routes read, search,
 * overwrite and delete them under the same resolution as the operations
 * (core/matter-binding.ts), and POST /api/pages stamps the canonical
 * case_slug on a page that names exactly one matter by case_ref.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { setEnvForFile } from "./helpers/with-env.ts";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { importFromContent } from "../src/core/import-file.ts";
import { mountWebApi, invalidateMatterAccess } from "../src/commands/web-api.ts";
import { createIdentityToken } from "../src/core/identity-token.ts";

const SECRET = "test-shared-secret-key-for-subsumio";
const SOURCE = "firm-caseref";
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

const lawyer = () => headers("u-lawyer", "lawyer");
const colleague = () => headers("u-colleague", "lawyer");
const admin = () => headers("u-admin", "admin");

const putPage = (h: Record<string, string>, body: Record<string, unknown>) =>
  fetch(`${base}/api/pages`, { method: "POST", headers: h, body: JSON.stringify(body) });
const getPage = (h: Record<string, string>, slug: string) =>
  fetch(`${base}/api/pages/${slug}`, { headers: h });

const BURDEN = "burden-of-proof/cases/walled";
const PEOPLE = "people/f00d-zeugin";

beforeAll(async () => {
  releaseEnv = setEnvForFile({ SUBSUMIO_WEB_API_KEY: SECRET });
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
  await engine.setConfig("search.mcp_keyword_only", "true");
  const app = express();
  mountWebApi(app, engine, { apiKey: SECRET });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;

  for (const [slug, number] of [
    ["cases/walled", "26-0007"],
    ["cases/open", "26-0008"],
  ] as const) {
    const res = await putPage(admin(), {
      slug,
      type: "legal_case",
      title: `Akte ${slug}`,
      content: "Akte",
      frontmatter: { case_number: number },
    });
    expect(res.status).toBe(200);
  }
  const wall = await putPage(
    headers("u-admin", "admin", { "x-subsumio-matter-permissions": "write" }),
    {
      slug: "cases/walled",
      merge: true,
      frontmatter: { permissions: { blocked_users: ["u-lawyer"] } },
    }
  );
  expect(wall.status).toBe(200);
  invalidateMatterAccess(SOURCE);

  // Written the way the legal pipeline writes: case_ref only, no case_slug.
  for (const [slug, ref] of [
    [BURDEN, "cases/walled"],
    [PEOPLE, "26-0007"],
    ["burden-of-proof/cases/open", "cases/open"],
  ] as const) {
    await importFromContent(
      engine,
      slug,
      `---\ntitle: ${slug}\ntype: burden_of_proof\ncase_ref: "${ref}"\n---\n\nneedlexi ${slug}\n`,
      { sourceId: SOURCE, noEmbed: true }
    );
  }
}, 120_000);

afterAll(async () => {
  server?.close();
  await engine?.disconnect();
  releaseEnv?.();
});

describe("web read routes", () => {
  test("GET /api/pages/:slug hides case_ref-bound pages behind the wall", async () => {
    expect((await getPage(lawyer(), BURDEN)).status).toBe(404);
    expect((await getPage(lawyer(), PEOPLE)).status).toBe(404);
    expect((await getPage(lawyer(), "burden-of-proof/cases/open")).status).toBe(200);
    expect((await getPage(colleague(), BURDEN)).status).toBe(200);
    expect((await getPage(colleague(), PEOPLE)).status).toBe(200);
  });

  test("GET /api/pages and /api/search leave them out for the walled lawyer", async () => {
    const list = async (h: Record<string, string>) =>
      (
        (await (await fetch(`${base}/api/pages?limit=200`, { headers: h })).json()) as Array<{
          slug: string;
        }>
      ).map((p) => p.slug);
    expect(await list(lawyer())).not.toContain(BURDEN);
    expect(await list(lawyer())).not.toContain(PEOPLE);
    expect(await list(colleague())).toContain(PEOPLE);

    const search = async (h: Record<string, string>) =>
      (
        (await (
          await fetch(`${base}/api/search?q=needlexi&limit=50`, { headers: h })
        ).json()) as Array<{
          slug: string;
        }>
      ).map((r) => r.slug);
    const walled = await search(lawyer());
    expect(walled).toContain("burden-of-proof/cases/open");
    expect(walled).not.toContain(BURDEN);
    expect(walled).not.toContain(PEOPLE);
    expect(await search(colleague())).toContain(PEOPLE);
  });
});

describe("web write routes", () => {
  test("the walled lawyer cannot overwrite or delete a case_ref-bound page", async () => {
    const overwrite = await putPage(lawyer(), {
      slug: BURDEN,
      title: "Überschrieben",
      content: "neu",
      frontmatter: {},
    });
    expect(overwrite.status).toBe(404);
    const merged = await putPage(lawyer(), { slug: PEOPLE, merge: true, frontmatter: { x: 1 } });
    expect(merged.status).toBe(404);
    const del = await fetch(`${base}/api/pages/${BURDEN}`, { method: "DELETE", headers: lawyer() });
    expect(del.status).not.toBe(200);
    expect((await engine.getPage(BURDEN, { sourceId: SOURCE }))?.compiled_truth).toContain(
      "needlexi"
    );
    // Writing a new page that names the walled matter by case_ref is refused.
    const claim = await putPage(lawyer(), {
      slug: "notes/claim",
      title: "Claim",
      content: "x",
      frontmatter: { case_ref: "26-0007" },
    });
    expect(claim.status).toBe(404);
    expect(await engine.getPage("notes/claim", { sourceId: SOURCE })).toBeNull();
  });

  test("POST /api/pages stamps case_slug when case_ref names exactly one matter", async () => {
    const res = await putPage(colleague(), {
      slug: "deadlines/wiedervorlage-cases-open",
      type: "deadline",
      title: "Wiedervorlage",
      content: "Wiedervorlage",
      frontmatter: { case_ref: "26-0008" },
    });
    expect(res.status).toBe(200);
    const page = await engine.getPage("deadlines/wiedervorlage-cases-open", { sourceId: SOURCE });
    expect(page?.frontmatter.case_slug).toBe("cases/open");
    expect(page?.frontmatter.case_ref).toBe("26-0008");

    const orphan = await putPage(colleague(), {
      slug: "deadlines/wiedervorlage-ghost",
      type: "deadline",
      title: "Wiedervorlage",
      content: "Wiedervorlage",
      frontmatter: { case_ref: "cases/ghost" },
    });
    expect(orphan.status).toBe(200);
    const ghost = await engine.getPage("deadlines/wiedervorlage-ghost", { sourceId: SOURCE });
    expect(ghost?.frontmatter.case_slug).toBeUndefined();
    // Unresolved: hidden from the walled lawyer, visible to the colleague.
    expect((await getPage(lawyer(), "deadlines/wiedervorlage-ghost")).status).toBe(404);
    expect((await getPage(colleague(), "deadlines/wiedervorlage-ghost")).status).toBe(200);
  });
});
