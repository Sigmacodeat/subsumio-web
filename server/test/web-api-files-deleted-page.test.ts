/**
 * An uploaded original is served only while its page exists: once the page
 * is deleted (soft-deleted or purged) GET /api/files answers 404 before the
 * storage is even consulted — an admin scope does not change that.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { setEnvForFile } from "./helpers/with-env.ts";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { mountWebApi } from "../src/commands/web-api.ts";
import { createIdentityToken } from "../src/core/identity-token.ts";

const SECRET = "test-shared-secret-key-for-subsumio";
const SOURCE = "firm-files";
let engine: PGLiteEngine;
let server: Server;
let base = "";
let releaseEnv: (() => void) | undefined;

const headers = {
  "x-subsumio-api-key": SECRET,
  "x-subsumio-source": SOURCE,
  "x-subsumio-identity-token": createIdentityToken(
    { sourceId: SOURCE, matterScope: "all", userId: "u-admin", role: "admin" },
    SECRET
  ),
};

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
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await engine.disconnect();
  releaseEnv?.();
});

describe("GET /api/files for a page that no longer exists", () => {
  test("a purged page's original is not served", async () => {
    const res = await fetch(`${base}/api/files/docs/purged-original`, { headers });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("file_not_found");
  });
});
