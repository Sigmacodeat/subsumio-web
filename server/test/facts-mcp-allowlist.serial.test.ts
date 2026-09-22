/**
 * v0.31 Phase 6 — MCP scope correctness on facts ops.
 *
 * Pins:
 *   - extract_facts → write scope
 *   - recall → read scope
 *   - forget_fact → write scope
 *   - All three present in operations[]
 *   - param shapes match the documented contract
 *
 * Serial test (mutates module-scoped engine state via dispatchToolCall +
 * subsequent reads).
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { operations } from "../src/core/operations.ts";
import { dispatchToolCall } from "../src/mcp/dispatch.ts";
import { setEnvForFile } from "./helpers/with-env.ts";
import { configureGateway } from "../src/core/ai/gateway.ts";

// The "no API key" assertion below only holds if provider keys cannot leak in
// from the developer's .env / ~/.gbrain — bun auto-loads .env, so blank them.
setEnvForFile({
  // Empty GBRAIN_HOME is ignored by configDir() — point at an absent dir so
  // loadConfig() returns null and no stored provider key is reachable.
  GBRAIN_HOME: "/tmp/gbrain-no-key-fixture-absent",
  DATABASE_URL: undefined,
  ANTHROPIC_API_KEY: undefined,
  OPENROUTER_API_KEY: undefined,
  OPENROUTER_API_KEY_FALLBACK: undefined,
  OPENAI_API_KEY: undefined,
  GBRAIN_CHAT_MODEL: undefined,
  SUBSUMIO_CHAT_MODEL: undefined,
});

let engine: PGLiteEngine;

beforeAll(async () => {
  // The legacy-embedding preload snapshotted process.env (including any real
  // provider keys from .env) into the gateway's _config.env. Re-configure
  // with the already-scrubbed env so isAvailable("chat") sees no keys.
  const scrubbed = { ...process.env };
  delete scrubbed.ANTHROPIC_API_KEY;
  delete scrubbed.OPENROUTER_API_KEY;
  delete scrubbed.OPENROUTER_API_KEY_FALLBACK;
  delete scrubbed.OPENAI_API_KEY;
  configureGateway({
    embedding_model: "openai:text-embedding-3-large",
    embedding_dimensions: 1536,
    env: scrubbed,
  });

  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
});

afterAll(async () => {
  await engine.disconnect();
});

describe("facts MCP ops registration + scope", () => {
  test("extract_facts is registered with write scope", () => {
    const op = operations.find((o) => o.name === "extract_facts");
    expect(op).toBeDefined();
    expect(op!.scope).toBe("write");
    expect(op!.mutating).toBe(true);
    expect(op!.params.turn_text?.required).toBe(true);
    expect(op!.params.session_id).toBeDefined();
  });

  test("recall is registered with read scope", () => {
    const op = operations.find((o) => o.name === "recall");
    expect(op).toBeDefined();
    expect(op!.scope).toBe("read");
    // recall should not be mutating.
    expect(op!.mutating).toBeFalsy();
    expect(op!.params.entity).toBeDefined();
    expect(op!.params.since).toBeDefined();
    expect(op!.params.session_id).toBeDefined();
  });

  test("forget_fact is registered with write scope", () => {
    const op = operations.find((o) => o.name === "forget_fact");
    expect(op).toBeDefined();
    expect(op!.scope).toBe("write");
    expect(op!.mutating).toBe(true);
    expect(op!.params.id?.required).toBe(true);
  });
});

describe("forget_fact dispatch", () => {
  test("forget_fact errors with fact_not_found on unknown id", async () => {
    const r = await dispatchToolCall(
      engine,
      "forget_fact",
      { id: 99999 },
      {
        remote: true,
        sourceId: "default",
      }
    );
    expect(r.isError).toBe(true);
    const payload = JSON.parse(r.content[0].text);
    expect(payload.error).toBe("fact_not_found");
  });

  test("forget_fact succeeds on valid id, then becomes idempotent-as-error", async () => {
    const inserted = await engine.insertFact(
      { fact: "will be forgotten", kind: "fact", source: "test" },
      { source_id: "default" }
    );
    const r1 = await dispatchToolCall(
      engine,
      "forget_fact",
      { id: inserted.id },
      {
        remote: true,
        sourceId: "default",
      }
    );
    expect(r1.isError).toBeFalsy();

    const r2 = await dispatchToolCall(
      engine,
      "forget_fact",
      { id: inserted.id },
      {
        remote: true,
        sourceId: "default",
      }
    );
    expect(r2.isError).toBe(true);
    const payload = JSON.parse(r2.content[0].text);
    // v0.32.2: more precise discriminator. The first call expires the fact;
    // the second call sees expired_at IS NOT NULL and surfaces
    // `fact_already_expired` instead of the older opaque `fact_not_found`.
    expect(payload.error).toBe("fact_already_expired");
  });
});

describe("extract_facts dispatch (no API key)", () => {
  test("returns inserted=0 / duplicate=0 / superseded=0 when chat gateway unavailable", async () => {
    const r = await dispatchToolCall(
      engine,
      "extract_facts",
      {
        turn_text: "I am flying to Tokyo Tuesday.",
      },
      { remote: true, sourceId: "default" }
    );
    expect(r.isError).toBeFalsy();
    const payload = JSON.parse(r.content[0].text);
    expect(payload.inserted).toBe(0);
    expect(payload.duplicate).toBe(0);
    expect(payload.superseded).toBe(0);
    expect(Array.isArray(payload.fact_ids)).toBe(true);
  });
});
