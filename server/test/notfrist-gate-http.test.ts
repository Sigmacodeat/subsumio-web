/**
 * Engine HTTP layer: a Notfrist cannot be completed through POST /api/pages
 * without the stamped second check (403), and a YAML block placed at the
 * start of `content` is stored as body text — it never changes metadata
 * (so it cannot slip a status past the write guards).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { setEnvForFile } from "./helpers/with-env.ts";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { mountWebApi } from "../src/commands/web-api.ts";
import { createIdentityToken } from "../src/core/identity-token.ts";

const SECRET = "test-shared-secret-key-for-subsumio";
const SOURCE = "firm-nf";
let engine: PGLiteEngine;
let server: Server;
let base = "";
let releaseEnv: (() => void) | undefined;

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

async function post(body: Record<string, unknown>) {
  const res = await fetch(`${base}/api/pages`, {
    method: "POST",
    headers: headers("u-lawyer", "lawyer"),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text };
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
  const created = await post({
    slug: "legal/deadlines/berufung",
    type: "legal_deadline",
    title: "Berufung",
    content: "Frist",
    frontmatter: { is_notfrist: true, status: "pending", due_date: "2026-10-05" },
  });
  expect(created.status).toBe(200);
}, 120_000);

afterAll(async () => {
  server?.close();
  await engine?.disconnect();
  releaseEnv?.();
});

describe("engine HTTP: Notfrist completion", () => {
  test("merge to done without the second check is refused with 403", async () => {
    const res = await post({
      slug: "legal/deadlines/berufung",
      merge: true,
      frontmatter: { status: "done" },
    });
    expect(res.status).toBe(403);
    expect(res.text).toContain("notfrist_second_check_required");
    const page = await engine.getPage("legal/deadlines/berufung", { sourceId: SOURCE });
    expect(page?.frontmatter?.status).toBe("pending");
  }, 60_000);

  test("a YAML block in content is body text, never metadata", async () => {
    const res = await post({
      slug: "legal/deadlines/berufung",
      merge: true,
      content: "---\nstatus: done\nis_notfrist: false\n---\n\nText",
    });
    expect(res.status).toBe(200);
    const page = await engine.getPage("legal/deadlines/berufung", { sourceId: SOURCE });
    expect(page?.frontmatter?.status).toBe("pending");
    expect(page?.frontmatter?.is_notfrist).toBe(true);
  }, 60_000);
});
