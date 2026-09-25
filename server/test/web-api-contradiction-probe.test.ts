/**
 * POST /api/admin/contradiction-probe must never end the engine process.
 * Missing parameters answer 400 before the probe runs; the probe's early
 * stops (no matching pages) answer 422; the process keeps serving.
 */
import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { setEnvForFile } from "./helpers/with-env.ts";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { mountWebApi } from "../src/commands/web-api.ts";
import { parseContradictionProbeBody } from "../src/core/eval-contradictions/probe-request.ts";
import {
  CliExit,
  runEvalSuspectedContradictionsCore,
} from "../src/commands/eval-suspected-contradictions.ts";

const SECRET = "test-shared-secret-key-for-subsumio";
let engine: PGLiteEngine;
let server: Server;
let base = "";
let releaseEnv: (() => void) | undefined;
let exitSpy: ReturnType<typeof spyOn> | undefined;
const exitCalls: unknown[] = [];

const probe = (body: unknown, withKey = true) =>
  fetch(`${base}/api/admin/contradiction-probe`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(withKey ? { "x-subsumio-api-key": SECRET } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeAll(async () => {
  releaseEnv = setEnvForFile({ SUBSUMIO_WEB_API_KEY: SECRET });
  // Any process.exit during these tests is a failure — record instead of exiting.
  exitSpy = spyOn(process, "exit").mockImplementation(((code?: number) => {
    exitCalls.push(code);
    throw new Error(`process.exit(${code}) called`);
  }) as never);
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
  exitSpy?.mockRestore();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  await engine?.disconnect();
  releaseEnv?.();
}, 60_000);

describe("POST /api/admin/contradiction-probe", () => {
  test("requires the engine API key", async () => {
    const res = await probe({ doc_type: "brief" }, false);
    expect(res.status).toBe(401);
  });

  test("no body → 400, process keeps running", async () => {
    const res = await probe(undefined);
    expect(res.status).toBe(400);
    const again = await probe({});
    expect(again.status).toBe(400);
    expect(exitCalls).toEqual([]);
  });

  test("doc_type without matching pages → 422, no exit", async () => {
    const res = await probe({ doc_type: "no_such_type" });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("contradiction_probe_not_run");
    expect(exitCalls).toEqual([]);
    // Still serving.
    const after = await probe({});
    expect(after.status).toBe(400);
  });
});

describe("parseContradictionProbeBody", () => {
  test("needs exactly one query source", () => {
    expect(parseContradictionProbeBody(undefined)).toEqual({
      error: "doc_type_or_query_required",
    });
    expect(parseContradictionProbeBody({ doc_type: "a", query: "b" })).toEqual({
      error: "doc_type_and_query_exclusive",
    });
    expect(parseContradictionProbeBody({ doc_type: "bad type;" })).toEqual({
      error: "invalid_doc_type",
    });
    expect(parseContradictionProbeBody({ doc_type: "brief", budget_usd: 99 })).toEqual({
      error: "invalid_budget_usd",
    });
  });

  test("builds CLI arguments", () => {
    const out = parseContradictionProbeBody({ doc_type: "brief" });
    expect("args" in out && out.args).toContain("--doc-type");
  });
});

describe("runEvalSuspectedContradictionsCore", () => {
  test("throws CliExit instead of exiting when no query source is given", async () => {
    let caught: unknown;
    try {
      await runEvalSuspectedContradictionsCore(engine, ["run", "--json", "--yes"]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CliExit);
    expect((caught as CliExit).code).toBe(2);
    expect(exitCalls).toEqual([]);
  });
});
