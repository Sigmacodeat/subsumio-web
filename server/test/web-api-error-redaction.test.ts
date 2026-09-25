/**
 * Audit ENG-5: a failed engine route logs the raw cause and never sends
 * provider/model/billing detail to the client.
 */
import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { setEnvForFile } from "./helpers/with-env.ts";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { mountWebApi } from "../src/commands/web-api.ts";
import { createIdentityToken } from "../src/core/identity-token.ts";
import {
  GENERIC_WRITE_FAILURE_MESSAGE,
  redactErrorResponseBody,
} from "../src/core/public-error-message.ts";

const SECRET = "test-shared-secret-key-for-subsumio";
const SOURCE = "firm-error-redaction";
const PROVIDER_ERROR = "chat(anthropic:claude) insufficient credits";

class FailingListEngine extends PGLiteEngine {
  override async listPages(): Promise<never> {
    throw new Error(PROVIDER_ERROR);
  }
}

let engine: FailingListEngine;
let server: Server;
let base = "";
let releaseEnv: (() => void) | undefined;

beforeAll(async () => {
  releaseEnv = setEnvForFile({ SUBSUMIO_WEB_API_KEY: SECRET });
  engine = new FailingListEngine();
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

describe("redactErrorResponseBody", () => {
  test("5xx: provider text replaced, raw cause returned for logging", () => {
    const { body, cause } = redactErrorResponseBody(500, {
      error: "document_review_failed",
      message: PROVIDER_ERROR,
    });
    expect(body).toEqual({ error: "document_review_failed", message: GENERIC_WRITE_FAILURE_MESSAGE });
    expect(cause).toBe(PROVIDER_ERROR);
  });

  test("4xx: ordinary messages pass, no cause", () => {
    const { body, cause } = redactErrorResponseBody(404, { error: "x", message: "Page not found." });
    expect(body).toEqual({ error: "x", message: "Page not found." });
    expect(cause).toBeUndefined();
  });

  test("success bodies are untouched", () => {
    const ok = { message: PROVIDER_ERROR };
    expect(redactErrorResponseBody(200, ok).body).toBe(ok);
  });
});

describe("engine route failure", () => {
  test("500 body is redacted and the cause is logged with the request id", async () => {
    const logged: string[] = [];
    const spy = spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
    try {
      const res = await fetch(`${base}/api/pages?type=legal_case&limit=10`, {
        headers: {
          "x-subsumio-api-key": SECRET,
          "x-subsumio-source": SOURCE,
          "x-request-id": "req-eng5-000001",
          "x-subsumio-identity-token": createIdentityToken(
            { sourceId: SOURCE, matterScope: "all", userId: "u-admin", role: "admin" },
            SECRET
          ),
        },
      });
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string; message: string };
      expect(body.message).toBe(GENERIC_WRITE_FAILURE_MESSAGE);
      expect(JSON.stringify(body)).not.toContain("anthropic");
      const line = logged.find((l) => l.includes("route_error"));
      expect(line).toBeDefined();
      expect(line).toContain(PROVIDER_ERROR);
      expect(line).toContain("req-eng5-000001");
    } finally {
      spy.mockRestore();
    }
  });
});
