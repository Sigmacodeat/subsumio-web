/**
 * POST /api/pages takes page metadata only from `title` / `type` /
 * `frontmatter` (where the web app's write guards see it):
 *
 *  - a YAML block inside `content` is never read as metadata (it stays body
 *    text), also for a merge onto a slug that does not exist yet;
 *  - engine-owned markers of the content-sanity gate (quarantine,
 *    content_flag, embed_skip) are never taken from a web write, and the
 *    array ops refuse them;
 *  - a matter's access rules (frontmatter.permissions) come from the stored
 *    page on every write, whatever the write says about the page type; only
 *    the matter-access route (its header) changes them.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { setEnvForFile } from "./helpers/with-env.ts";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { mountWebApi, invalidateMatterAccess } from "../src/commands/web-api.ts";
import { createIdentityToken } from "../src/core/identity-token.ts";

const SECRET = "test-shared-secret-key-for-subsumio";
const SOURCE = "firm-write-trust";
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
const admin = () => headers("u-admin", "admin");

const post = (h: Record<string, string>, body: Record<string, unknown>) =>
  fetch(`${base}/api/pages`, { method: "POST", headers: h, body: JSON.stringify(body) });
const stored = (slug: string) => engine.getPage(slug, { sourceId: SOURCE, includeDeleted: true });

const CASE = "cases/wall-akte";
const WALL = { blocked_users: ["u-blocked"], visibility: "team", allowed_users: ["u-lawyer"] };

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

  expect(
    (await post(admin(), { slug: CASE, type: "legal_case", title: "Akte", content: "Akte" })).status
  ).toBe(200);
  const wall = await post(
    headers("u-admin", "admin", { "x-subsumio-matter-permissions": "write" }),
    { slug: CASE, merge: true, frontmatter: { permissions: WALL } }
  );
  expect(wall.status).toBe(200);
  invalidateMatterAccess(SOURCE);
}, 120_000);

afterAll(async () => {
  server?.close();
  await engine?.disconnect();
  releaseEnv?.();
});

describe("metadata inside content", () => {
  test("a merge onto a new slug cannot plant metadata through a YAML block in content", async () => {
    const res = await post(lawyer(), {
      slug: "legal/approvals/erfunden",
      merge: true,
      content: "---\ntype: agent_action\nstatus: approved\ndecided_by: jemand\n---\nbody",
    });
    expect(res.status).toBe(200);
    const page = await stored("legal/approvals/erfunden");
    expect(page?.type).not.toBe("agent_action");
    expect(page?.frontmatter?.status).toBeUndefined();
    expect(page?.frontmatter?.decided_by).toBeUndefined();
  });

  test("a create keeps only the sent metadata", async () => {
    const res = await post(lawyer(), {
      slug: "wiki/yaml-kopf",
      title: "Notiz",
      content: "---\nstatus: approved\nquarantine: {reason: x}\n---\nbody",
    });
    expect(res.status).toBe(200);
    const page = await stored("wiki/yaml-kopf");
    expect(page?.title).toBe("Notiz");
    expect(page?.frontmatter?.status).toBeUndefined();
    expect(page?.frontmatter?.quarantine).toBeUndefined();
  });
});

describe("engine-owned gate markers", () => {
  test("quarantine / content_flag / embed_skip from a web write are dropped", async () => {
    const res = await post(lawyer(), {
      slug: "wiki/versteckt",
      title: "Sauberer Text",
      content: "Ein ganz normaler Absatz mit Inhalt.",
      frontmatter: {
        quarantine: { reason: "junk_pattern", detail: "x", assessed_at: "2026-01-01" },
        content_flag: { reason: "markup_heavy", detail: "eingeschleust" },
        embed_skip: { reason: "oversized" },
        note: "bleibt",
      },
    });
    expect(res.status).toBe(200);
    const fm = (await stored("wiki/versteckt"))?.frontmatter ?? {};
    expect(fm.quarantine).toBeUndefined();
    expect(fm.content_flag).toBeUndefined();
    expect(fm.embed_skip).toBeUndefined();
    expect(fm.note).toBe("bleibt");
  });

  test("the array ops refuse engine-owned keys", async () => {
    for (const field of ["quarantine", "content_flag", "embed_skip", "permissions"]) {
      const res = await fetch(`${base}/api/pages/array-append`, {
        method: "POST",
        headers: lawyer(),
        body: JSON.stringify({ slug: "wiki/versteckt", field, items: [{ a: 1 }] }),
      });
      expect(res.status).toBe(400);
    }
    const fm = (await stored("wiki/versteckt"))?.frontmatter ?? {};
    expect(fm.quarantine).toBeUndefined();
  });
});

describe("a matter's access rules survive every generic write", () => {
  const permissionsOf = async () =>
    ((await stored(CASE))?.frontmatter ?? {}).permissions as Record<string, unknown> | undefined;

  test("full replace with the type only in frontmatter keeps the stored rules", async () => {
    const res = await post(lawyer(), {
      slug: CASE,
      title: "Akte",
      content: "neu",
      frontmatter: { type: "legal_case" },
    });
    expect(res.status).toBe(200);
    expect(await permissionsOf()).toEqual(WALL);
  });

  test("full replace without any type keeps the stored rules", async () => {
    const res = await post(lawyer(), { slug: CASE, title: "Akte", content: "noch neuer" });
    expect(res.status).toBe(200);
    expect(await permissionsOf()).toEqual(WALL);
  });

  test("sending other rules without the matter-access header changes nothing", async () => {
    const res = await post(lawyer(), {
      slug: CASE,
      title: "Akte",
      type: "legal_case",
      content: "x",
      frontmatter: { permissions: { blocked_users: [] } },
    });
    expect(res.status).toBe(200);
    expect(await permissionsOf()).toEqual(WALL);
  });

  test("the matter-access route (header) still changes them", async () => {
    const next = { ...WALL, blocked_users: [] };
    // (The team member writes: a team-only matter is closed to others.)
    const res = await post(
      headers("u-lawyer", "admin", { "x-subsumio-matter-permissions": "write" }),
      { slug: CASE, merge: true, frontmatter: { permissions: next } }
    );
    expect(res.status).toBe(200);
    expect(await permissionsOf()).toEqual(next);
  });
});
