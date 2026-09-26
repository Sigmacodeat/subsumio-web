/**
 * POST /api/sources/clone is the public-demo copy path. Several firms share
 * one database, so it may only copy a demo template into the caller's own
 * demo session source — never a firm source, and never into a source other
 * than the one the request is scoped to.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { setEnvForFile } from "./helpers/with-env.ts";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { mountWebApi } from "../src/commands/web-api.ts";

const SECRET = "test-shared-secret-key-for-subsumio";
let engine: PGLiteEngine;
let server: Server;
let base = "";
let releaseEnv: (() => void) | undefined;

async function seed(sourceId: string, slug: string, text: string) {
  await engine.executeRaw(
    `INSERT INTO sources (id, name, config) VALUES ($1, $1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING`,
    [sourceId]
  );
  await engine.putPage(
    slug,
    { type: "note", title: slug, compiled_truth: text, frontmatter: {} } as any,
    { sourceId }
  );
}

function clone(headerSource: string, body: Record<string, unknown>) {
  return fetch(`${base}/api/sources/clone`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-subsumio-api-key": SECRET,
      "x-subsumio-source": headerSource,
    },
    body: JSON.stringify(body),
  });
}

async function pageCount(sourceId: string): Promise<number> {
  const rows = await engine.executeRaw<{ n: number }>(
    `SELECT count(*)::int AS n FROM pages WHERE source_id = $1`,
    [sourceId]
  );
  return Number(rows[0]?.n ?? 0);
}

beforeAll(async () => {
  releaseEnv = setEnvForFile({ SUBSUMIO_WEB_API_KEY: SECRET });
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
  await seed("demo-template", "cases/demo", "Fiktive Demo-Akte");
  await seed("brain_firma", "cases/geheim", "Akte einer Kanzlei");
  const app = express();
  mountWebApi(app, engine, { apiKey: SECRET });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
}, 120_000);

afterAll(async () => {
  server?.close();
  await engine?.disconnect();
  releaseEnv?.();
});

describe("POST /api/sources/clone", () => {
  test("a firm source is never a clone origin", async () => {
    const res = await clone("demo-s-abc123", { from: "brain_firma", to: "demo-s-abc123" });
    expect(res.status).toBe(403);
    expect(await pageCount("demo-s-abc123")).toBe(0);
  });

  test("a firm source is never a clone target", async () => {
    const res = await clone("brain_other", { from: "demo-template", to: "brain_other" });
    expect(res.status).toBe(403);
    expect(await pageCount("brain_other")).toBe(0);
  });

  test("the target must be the source the request is scoped to", async () => {
    const res = await clone("demo-s-aaa111", { from: "demo-template", to: "demo-s-bbb222" });
    expect(res.status).toBe(403);
    expect(await pageCount("demo-s-bbb222")).toBe(0);
  });

  test("demo template into the caller's own demo session source works", async () => {
    const res = await clone("demo-s-abc123", { from: "demo-template", to: "demo-s-abc123" });
    expect(res.status).toBe(200);
    expect(await pageCount("demo-s-abc123")).toBe(1);
  });
});
