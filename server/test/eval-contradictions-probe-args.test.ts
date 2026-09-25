/**
 * HTTP probe route argv: without a doc_type the route must answer 400 instead
 * of reaching the CLI's process.exit(2) branch inside the server process.
 */
import { describe, test, expect } from "bun:test";
import { buildProbeRunArgs, parseFlags } from "../src/commands/eval-suspected-contradictions.ts";

describe("buildProbeRunArgs", () => {
  test("empty body → null (route answers 400, run never starts)", () => {
    expect(buildProbeRunArgs({})).toBeNull();
    expect(buildProbeRunArgs({ doc_type: "" })).toBeNull();
    expect(buildProbeRunArgs({ doc_type: "   " })).toBeNull();
    expect(buildProbeRunArgs({ doc_type: 42 })).toBeNull();
  });

  test("flag-like doc_type is rejected", () => {
    expect(buildProbeRunArgs({ doc_type: "--from-capture" })).toBeNull();
  });

  test("valid doc_type yields exactly one query source", () => {
    const args = buildProbeRunArgs({ doc_type: "medical_report", budget_usd: 0.3 });
    expect(args).not.toBeNull();
    const f = parseFlags(args!);
    expect(f.sub).toBe("run");
    expect(f.docType).toBe("medical_report");
    expect(f.query).toBeUndefined();
    expect(f.queriesFile).toBeUndefined();
    expect(f.fromCapture).toBeFalsy();
    expect(f.budgetUsd).toBe(0.3);
  });

  test("non-numeric knobs fall back to defaults", () => {
    const f = parseFlags(buildProbeRunArgs({ doc_type: "x", top_k: "9", limit: -1 })!);
    expect(f.topK).toBe(5);
    expect(f.limit).toBe(20);
  });
});
