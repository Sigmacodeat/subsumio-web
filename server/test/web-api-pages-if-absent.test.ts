/**
 * POST /api/pages with `if_absent: true` — the create-only write the web app
 * uses for matters and invoices. A taken slug answers 409 `page_exists` and
 * the stored page stays as it was; concurrent creates of one slug yield
 * exactly one 200.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { setEnvForFile } from "./helpers/with-env.ts";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { mountWebApi } from "../src/commands/web-api.ts";
import { createIdentityToken } from "../src/core/identity-token.ts";

const SECRET = "test-shared-secret-key-for-subsumio";
const SOURCE = "firm-if-absent";
let engine: PGLiteEngine;
let server: Server;
let base = "";
let releaseEnv: (() => void) | undefined;

const headers = () => ({
  "content-type": "application/json",
  "x-subsumio-api-key": SECRET,
  "x-subsumio-source": SOURCE,
  "x-subsumio-identity-token": createIdentityToken(
    { sourceId: SOURCE, matterScope: "all", userId: "u-admin", role: "admin" },
    SECRET
  ),
});

const post = (body: unknown) =>
  fetch(`${base}/api/pages`, { method: "POST", headers: headers(), body: JSON.stringify(body) });

async function storedTitle(slug: string): Promise<string | null> {
  const rows = (await engine.executeRaw(
    "SELECT title FROM pages WHERE slug = $1 AND source_id = $2",
    [slug, SOURCE]
  )) as Array<{ title: string }>;
  return rows[0]?.title ?? null;
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
}, 60_000);

afterAll(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  await engine?.disconnect();
  releaseEnv?.();
}, 60_000);

describe("POST /api/pages if_absent", () => {
  test("creates a free slug", async () => {
    const res = await post({
      slug: "invoices/re-2026-001",
      type: "invoice",
      title: "RE-2026-001",
      content: "Rechnung",
      if_absent: true,
    });
    expect(res.status).toBe(200);
    expect(await storedTitle("invoices/re-2026-001")).toBe("RE-2026-001");
  });

  test("a taken slug → 409 page_exists, stored page untouched", async () => {
    const first = await post({
      slug: "legal/cases/taken",
      type: "legal_case",
      title: "Original",
      content: "Akte",
    });
    expect(first.status).toBe(200);
    const res = await post({
      slug: "legal/cases/taken",
      type: "legal_case",
      title: "Replacement",
      content: "Andere Akte",
      if_absent: true,
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("page_exists");
    expect(await storedTitle("legal/cases/taken")).toBe("Original");
  });

  test("if_absent together with merge is rejected", async () => {
    const res = await post({ slug: "legal/cases/x", merge: true, if_absent: true });
    expect(res.status).toBe(400);
  });

  test("parallel creates of one slug → exactly one 200", async () => {
    const statuses = await Promise.all(
      [1, 2, 3].map((i) =>
        post({
          slug: "invoices/re-race",
          type: "invoice",
          title: `Writer ${i}`,
          content: "Rechnung",
          if_absent: true,
        }).then((r) => r.status)
      )
    );
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(2);
  });
});
