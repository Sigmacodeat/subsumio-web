import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { estimateSpendUsd, recordAiSpend } from "../src/core/ai/spend-log.ts";
import { withEnv } from "./helpers/with-env.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ai-spend-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("AI spend ledger", () => {
  it("prices chat calls from the canonical table", () => {
    const usd = estimateSpendUsd({
      kind: "chat",
      model: "openrouter:anthropic/claude-sonnet-5",
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      label: "t",
    });
    expect(usd).toBeCloseTo(2 + 1, 6);
  });

  it("prices embeddings per input token", () => {
    const usd = estimateSpendUsd({
      kind: "embed",
      model: "openrouter:openai/text-embedding-3-small",
      inputTokens: 1_000_000,
      outputTokens: 0,
      label: "t",
    });
    expect(usd).toBeCloseTo(0.02, 6);
  });

  it("marks an unpriced model as a gap, not as zero", () => {
    expect(
      estimateSpendUsd({
        kind: "chat",
        model: "openrouter:x/unknown",
        inputTokens: 5,
        outputTokens: 5,
        label: "t",
      })
    ).toBeNull();
  });

  it("appends one JSONL line per call into the weekly file", async () => {
    await withEnv({ GBRAIN_AUDIT_DIR: dir, GBRAIN_AI_SPEND_LOG: "1" }, () => {
      const now = new Date("2026-09-19T10:00:00Z");
      recordAiSpend(
        {
          kind: "chat",
          model: "openrouter:anthropic/claude-opus-5",
          inputTokens: 1000,
          outputTokens: 200,
          label: "gateway.chat",
        },
        now
      );
      recordAiSpend(
        {
          kind: "embed",
          model: "openrouter:openai/text-embedding-3-small",
          inputTokens: 500,
          outputTokens: 0,
          label: "gateway.embed",
        },
        now
      );
      const files = readdirSync(dir);
      expect(files).toEqual(["ai-spend-2026-W38.jsonl"]);
      const lines = readFileSync(join(dir, files[0]), "utf-8")
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l));
      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatchObject({
        kind: "chat",
        input_tokens: 1000,
        output_tokens: 200,
        usd: 0.01,
      });
    });
  });
});
