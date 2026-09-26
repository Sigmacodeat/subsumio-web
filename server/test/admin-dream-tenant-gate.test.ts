/**
 * POST /api/admin/dream runs over the whole installation. In multi-tenant
 * mode a firm (its own source, a signed-in user — admins included) is
 * refused; only the operator's cron (shared law source, no user) passes the
 * gate.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { setEnvForFile } from "./helpers/with-env.ts";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { mountWebApi } from "../src/commands/web-api.ts";
import { createIdentityToken } from "../src/core/identity-token.ts";

const SECRET = "test-shared-secret-key-for-subsumio";
let engine: PGLiteEngine;
let server: Server;
let base = "";
let releaseEnv: (() => void) | undefined;

beforeAll(async () => {
  releaseEnv = setEnvForFile({ SUBSUMIO_WEB_API_KEY: SECRET });
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
  const app = express();
  mountWebApi(app, engine, { apiKey: SECRET, requireTenant: true });
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

const dream = (h: Record<string, string>) =>
  fetch(`${base}/api/admin/dream`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-subsumio-api-key": SECRET, ...h },
    body: "{}",
  });

describe("POST /api/admin/dream in multi-tenant mode", () => {
  test("a firm admin is refused", async () => {
    const res = await dream({
      "x-subsumio-source": "brain_firm",
      "x-subsumio-identity-token": createIdentityToken(
        { sourceId: "brain_firm", matterScope: "all", userId: "u-admin", role: "admin" },
        SECRET
      ),
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("host_admin_only");
  });

  test("a firm source without a user is refused as well", async () => {
    const res = await dream({ "x-subsumio-source": "brain_firm" });
    expect(res.status).toBe(403);
  });

  test("the operator cron (shared law source, no user) passes the gate", async () => {
    const res = await dream({ "x-subsumio-source": "law-de" });
    expect(res.status).not.toBe(403);
  });
});
