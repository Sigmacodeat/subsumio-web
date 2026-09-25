/**
 * The supervisor's own model calls (plan, synthesis) must use a model id the
 * gateway accepts (provider-prefixed) and follow the deployment's tier — a
 * hard-wired bare vendor id is rejected by the gateway and would bypass the
 * Bedrock-EU / OpenRouter routing.
 */
import { describe, it, expect, afterEach } from "bun:test";
import { __setChatTransportForTests, type ChatOpts } from "../src/core/ai/gateway.ts";
import { parseModelId } from "../src/core/ai/model-resolver.ts";
import { TIER_DEFAULTS, tierDefaultsFor } from "../src/core/model-config.ts";
import { decomposeTask, resolveSupervisorModel } from "../src/core/minions/handlers/supervisor.ts";

afterEach(() => __setChatTransportForTests(null));

describe("supervisor model", () => {
  it("without a pick: the utility tier, provider-prefixed", async () => {
    const model = await resolveSupervisorModel(null, undefined);
    expect(() => parseModelId(model)).not.toThrow();
    expect(model).toBe(TIER_DEFAULTS.utility);
  });

  it("a bare catalogue pick is normalised to a prefixed id", async () => {
    const model = await resolveSupervisorModel(null, "claude-haiku-4-5");
    expect(() => parseModelId(model)).not.toThrow();
  });

  it("Bedrock-EU deployments plan on the EU route", () => {
    expect(tierDefaultsFor("bedrock-eu").utility.startsWith("bedrock:")).toBe(true);
  });

  it("decomposeTask calls chat with an id the gateway accepts", async () => {
    let seen: string | undefined;
    __setChatTransportForTests(async (opts: ChatOpts) => {
      seen = opts.model;
      return {
        text: JSON.stringify({
          reasoning: "r",
          steps: [{ specialist: "legal-researcher", prompt: "go" }],
        }),
        blocks: [],
        stopReason: "end",
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          cache_read_tokens: 0,
          cache_creation_tokens: 0,
        },
        model: "stub:stub",
        providerId: "stub",
      };
    });
    const plan = await decomposeTask("Prüfe die Akte", undefined);
    expect(plan.steps).toHaveLength(1);
    expect(seen).toBeDefined();
    expect(() => parseModelId(seen!)).not.toThrow();
  });
});
