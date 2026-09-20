import { describe, it, expect } from "vitest";
import { maskApiKey } from "@/lib/api-keys";
import { decideKeyUpdate, planKeyUpdates } from "@/lib/api-key-updates";

describe("decideKeyUpdate", () => {
  it("keeps a field the form sent back masked", () => {
    const masked = maskApiKey("sk-proj-abcdefghijklmnopqrstuvwxyz");
    expect(masked).toContain("…");
    expect(decideKeyUpdate(masked)).toEqual({ kind: "keep" });
  });

  it("keeps an empty or missing field", () => {
    expect(decideKeyUpdate("")).toEqual({ kind: "keep" });
    expect(decideKeyUpdate("   ")).toEqual({ kind: "keep" });
    expect(decideKeyUpdate(undefined)).toEqual({ kind: "keep" });
  });

  it("deletes on an explicit null", () => {
    expect(decideKeyUpdate(null)).toEqual({ kind: "delete" });
  });

  it("writes a new secret and trims it", () => {
    expect(decideKeyUpdate("  sk-proj-abcdefgh  ")).toEqual({
      kind: "set",
      value: "sk-proj-abcdefgh",
    });
  });

  it("rejects a value that is neither mask nor key", () => {
    expect(decideKeyUpdate("kein schlüssel!")).toEqual({ kind: "invalid" });
    expect(decideKeyUpdate("short")).toEqual({ kind: "invalid" });
  });
});

describe("planKeyUpdates", () => {
  it("saving one key leaves the other providers untouched", () => {
    const plan = planKeyUpdates({
      openaiKey: "sk-proj-newsecret123",
      anthropicKey: maskApiKey("sk-ant-storedsecret9999"),
      zeroEntropyKey: maskApiKey("ze-storedsecret8888"),
    });
    expect(plan.set).toEqual([{ field: "openaiKey", value: "sk-proj-newsecret123" }]);
    expect(plan.remove).toEqual([]);
    expect(plan.invalid).toEqual([]);
  });

  it("collects deletions", () => {
    const plan = planKeyUpdates({ anthropicKey: null });
    expect(plan.remove).toEqual(["anthropicKey"]);
    expect(plan.set).toEqual([]);
  });

  it("reports the field with a broken value", () => {
    const plan = planKeyUpdates({ zeroEntropyKey: "nope nope" });
    expect(plan.invalid).toEqual(["zeroEntropyKey"]);
  });
});
