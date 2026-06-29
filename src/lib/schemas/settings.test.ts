// @vitest-environment node

import { describe, test, expect } from "vitest";
import { kanzleiSettingsSchema, apiKeysSchema, modelPreferenceSchema } from "./settings";

describe("kanzleiSettingsSchema", () => {
  test("accepts minimal valid settings", () => {
    const result = kanzleiSettingsSchema.safeParse({
      kanzleiName: "Musterkanzlei",
      anwaltName: "Max Mustermann",
    });
    expect(result.success).toBe(true);
  });

  test("applies defaults for optional fields", () => {
    const result = kanzleiSettingsSchema.parse({
      kanzleiName: "Musterkanzlei",
      anwaltName: "Max Mustermann",
    });
    expect(result.stundensatz).toBe("200");
    expect(result.abrechnungstakt).toBe("15");
    expect(result.tarifModell).toBe("custom");
  });

  test("rejects empty kanzleiName", () => {
    const result = kanzleiSettingsSchema.safeParse({
      kanzleiName: "",
      anwaltName: "Max Mustermann",
    });
    expect(result.success).toBe(false);
  });
});

describe("apiKeysSchema", () => {
  test("accepts empty keys", () => {
    const result = apiKeysSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  test("accepts valid keys", () => {
    const result = apiKeysSchema.safeParse({
      openaiKey: "sk-...",
      anthropicKey: "sk-ant-...",
    });
    expect(result.success).toBe(true);
  });
});

describe("modelPreferenceSchema", () => {
  test("accepts valid model id", () => {
    const result = modelPreferenceSchema.safeParse({ modelId: "gpt-4" });
    expect(result.success).toBe(true);
  });

  test("rejects empty model id", () => {
    const result = modelPreferenceSchema.safeParse({ modelId: "" });
    expect(result.success).toBe(false);
  });
});
