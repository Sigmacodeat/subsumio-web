/**
 * A beA export uploaded into a matter is checked BEFORE anything is written:
 * a matter hidden from the caller answers 404, a matter the caller may only
 * read answers 403 — and in both cases no beA page is created.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { setEnvForFile } from "./helpers/with-env.ts";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { mountWebApi, invalidateMatterAccess } from "../src/commands/web-api.ts";
import { createIdentityToken } from "../src/core/identity-token.ts";

const SECRET = "test-shared-secret-key-for-subsumio";
const SOURCE = "firm-bea";
let engine: PGLiteEngine;
let server: Server;
let base = "";
let releaseEnv: (() => void) | undefined;

function headers(userId: string, role: string, extra: Record<string, string> = {}) {
  return {
    "x-subsumio-api-key": SECRET,
    "x-subsumio-source": SOURCE,
    "x-subsumio-identity-token": createIdentityToken(
      { sourceId: SOURCE, matterScope: "all", userId, role },
      SECRET
    ),
    ...extra,
  };
}

const BEA_XML = `<?xml version="1.0" encoding="UTF-8"?>
<nachricht>
  <nachrichtenID>bea-4711</nachrichtenID>
  <absender>Gericht</absender>
  <empfaenger>Kanzlei</empfaenger>
  <betreff>Ladung zur Verhandlung</betreff>
</nachricht>`;

function upload(h: Record<string, string>, caseSlug: string) {
  const form = new FormData();
  form.append("source", "legal");
  form.append("case_slug", caseSlug);
  form.append("file", new Blob([BEA_XML], { type: "application/xml" }), "nachricht.xml");
  return fetch(`${base}/api/upload`, { method: "POST", headers: h, body: form });
}

async function beaPages(): Promise<number> {
  const rows = await engine.executeRaw<{ n: number }>(
    `SELECT count(*)::int AS n FROM pages WHERE source_id = $1 AND type NOT IN ('legal_case')`,
    [SOURCE]
  );
  return Number(rows[0]?.n ?? 0);
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

  const put = (h: Record<string, string>, body: unknown) =>
    fetch(`${base}/api/pages`, {
      method: "POST",
      headers: { ...h, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const admin = headers("u-admin", "admin", { "x-subsumio-matter-permissions": "write" });
  for (const slug of ["cases/walled", "cases/readonly"]) {
    expect(
      (await put(admin, { slug, type: "legal_case", title: slug, content: "Akte" })).status
    ).toBe(200);
  }
  await put(admin, {
    slug: "cases/walled",
    merge: true,
    frontmatter: { permissions: { blocked_users: ["u-lawyer"] } },
  });
  await put(admin, {
    slug: "cases/readonly",
    merge: true,
    frontmatter: {
      permissions: { visibility: "confidential", grants: [{ user_id: "u-lawyer", level: "read" }] },
    },
  });
  invalidateMatterAccess(SOURCE);
}, 120_000);

afterAll(async () => {
  server?.close();
  await engine?.disconnect();
  releaseEnv?.();
});

describe("beA upload into a matter", () => {
  test("a walled matter: 404, nothing written", async () => {
    const before = await beaPages();
    const res = await upload(headers("u-lawyer", "lawyer"), "cases/walled");
    expect(res.status).toBe(404);
    expect(await beaPages()).toBe(before);
  });

  test("a read-only matter: 403, nothing written", async () => {
    const before = await beaPages();
    const res = await upload(headers("u-lawyer", "lawyer"), "cases/readonly");
    expect(res.status).toBe(403);
    expect(await beaPages()).toBe(before);
  });
});
