/**
 * /api/temporal/supersede and /api/temporal/contradict change both pages:
 * they need write access to the matter, update the frontmatter in place
 * (other fields — also ones written in between — stay), and report a
 * failure instead of success.
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
const SOURCE = "firm-temporal";
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
const reader = () => headers("u-reader", "lawyer");

const post = (path: string, h: Record<string, string>, body: unknown) =>
  fetch(`${base}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
const fm = async (slug: string) =>
  ((await engine.getPage(slug, { sourceId: SOURCE }))?.frontmatter ?? {}) as Record<
    string,
    unknown
  >;

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

  const admin = headers("u-admin", "admin", { "x-subsumio-matter-permissions": "write" });
  expect(
    (
      await post("/api/pages", admin, {
        slug: "cases/akte",
        type: "legal_case",
        title: "Akte",
        content: "Akte",
      })
    ).status
  ).toBe(200);
  await post("/api/pages", admin, {
    slug: "cases/akte",
    merge: true,
    frontmatter: {
      permissions: {
        visibility: "confidential",
        allowed_users: ["u-lawyer", "u-admin"],
        grants: [{ user_id: "u-reader", level: "read" }],
      },
    },
  });
  invalidateMatterAccess(SOURCE);
  for (const slug of ["docs/v1", "docs/v2"]) {
    await importFromContent(
      engine,
      slug,
      `---\ntitle: ${slug}\ntype: document\ncase_slug: cases/akte\nnote: behalten\n---\n\ntext\n`,
      { sourceId: SOURCE, noEmbed: true }
    );
  }
}, 120_000);

afterAll(async () => {
  server?.close();
  await engine?.disconnect();
  releaseEnv?.();
});

describe("temporal marks", () => {
  test("a user who may only read the matter is refused (403), nothing changes", async () => {
    const res = await post("/api/temporal/supersede", reader(), {
      old_slug: "docs/v1",
      new_slug: "docs/v2",
    });
    expect(res.status).toBe(403);
    expect((await fm("docs/v1")).superseded_by).toBeUndefined();
    const c = await post("/api/temporal/contradict", reader(), {
      slug_a: "docs/v1",
      slug_b: "docs/v2",
    });
    expect(c.status).toBe(403);
  });

  test("marks are written in place; other fields stay, entries are not duplicated", async () => {
    // A field written by someone else in the meantime (atomic append route).
    const append = await post("/api/pages/array-append", lawyer(), {
      slug: "docs/v2",
      field: "time_entries",
      items: [{ minutes: 5 }],
    });
    expect(append.status).toBe(200);
    for (let i = 0; i < 2; i++) {
      const res = await post("/api/temporal/supersede", lawyer(), {
        old_slug: "docs/v1",
        new_slug: "docs/v2",
      });
      expect(res.status).toBe(200);
    }
    const v1 = await fm("docs/v1");
    const v2 = await fm("docs/v2");
    expect(v1.superseded_by).toBe("docs/v2");
    expect(v1.note).toBe("behalten");
    expect(v2.supersedes).toEqual(["docs/v1"]);
    expect(v2.time_entries).toEqual([{ minutes: 5 }]);

    const c = await post("/api/temporal/contradict", lawyer(), {
      slug_a: "docs/v1",
      slug_b: "docs/v2",
    });
    expect(c.status).toBe(200);
    expect((await fm("docs/v1")).contradicts).toEqual(["docs/v2"]);
    expect((await fm("docs/v2")).contradicts).toEqual(["docs/v1"]);
  });

  test("a missing page is reported, not answered with success", async () => {
    const res = await post("/api/temporal/contradict", lawyer(), {
      slug_a: "docs/v1",
      slug_b: "docs/gibt-es-nicht",
    });
    expect(res.status).toBe(404);
    // Both pages or neither: the existing page got no dangling mark.
    expect((await fm("docs/v1")).contradicts).toEqual(["docs/v2"]);
  });
});
