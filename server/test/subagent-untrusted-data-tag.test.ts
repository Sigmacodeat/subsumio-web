/**
 * A map batch of the legal pipeline embeds case text under a data tag; the
 * subagent handler appends the "data, not instructions" rule to the
 * specialist's system prompt (the specialist overlay replaces `system`, so
 * the rule must be added after it).
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import type Anthropic from "@anthropic-ai/sdk";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { MinionQueue } from "../src/core/minions/queue.ts";
import { makeSubagentHandler, type MessagesClient } from "../src/core/minions/handlers/subagent.ts";
import type { MinionJobContext, ToolDef } from "../src/core/minions/types.ts";
import { untrustedDataRule } from "../src/core/legal/llm-util.ts";
import { MAP_DATA_TAG } from "../src/core/minions/handlers/legal-pipeline.ts";

let engine: PGLiteEngine;
let queue: MinionQueue;

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({ database_url: "" });
  await engine.initSchema();
  queue = new MinionQueue(engine);
}, 60_000);

afterAll(async () => {
  await engine.disconnect();
});

class RecordingClient implements MessagesClient {
  public systems: string[] = [];
  async create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
    const sys = params.system;
    this.systems.push(
      typeof sys === "string" ? sys : (sys ?? []).map((b) => ("text" in b ? b.text : "")).join("\n")
    );
    return {
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: params.model,
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      content: [{ type: "text", text: "{}", citations: null }],
    } as unknown as Anthropic.Message;
  }
}

async function run(extra: Record<string, unknown>): Promise<string> {
  const input = {
    prompt: "## AKTEN-TEXT\n<akten-text>\nx\n</akten-text>",
    subagent_def: "forensic-analyst",
    allowed_tools: ["noop"],
    ...extra,
  };
  const job = await queue.add("subagent", input, {}, { allowProtectedSubmit: true });
  const ctx: MinionJobContext = {
    id: job.id,
    name: job.name,
    data: input,
    attempts_made: 0,
    signal: new AbortController().signal,
    shutdownSignal: new AbortController().signal,
    async updateProgress() {},
    async updateTokens() {},
    async log() {},
    async isActive() {
      return true;
    },
    async readInbox() {
      return [];
    },
  };
  const client = new RecordingClient();
  const noop: ToolDef = {
    name: "noop",
    description: "no-op",
    input_schema: { type: "object", properties: {}, required: [] },
    idempotent: true,
    async execute() {
      return {};
    },
  };
  await makeSubagentHandler({ engine, client, toolRegistry: [noop] })(ctx);
  expect(client.systems.length).toBeGreaterThan(0);
  return client.systems[0]!;
}

describe("subagent untrusted_data_tag", () => {
  test("adds the data rule to the specialist system prompt", async () => {
    const system = await run({ untrusted_data_tag: MAP_DATA_TAG });
    expect(system).toContain(untrustedDataRule(MAP_DATA_TAG));
  });

  test("without the tag the system prompt carries no data rule", async () => {
    const system = await run({});
    expect(system).not.toContain("SICHERHEITSREGEL: Der Inhalt zwischen");
  });
});
