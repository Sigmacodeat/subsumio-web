// @vitest-environment node

import { describe, test, expect } from "vitest";
import { draftingSchema } from "./drafting";

describe("draftingSchema", () => {
  test("accepts valid drafting input", () => {
    const result = draftingSchema.safeParse({
      title: "Klage",
      facts: "Der Sachverhalt...",
    });
    expect(result.success).toBe(true);
  });

  test("rejects empty title", () => {
    const result = draftingSchema.safeParse({
      title: "",
      facts: "Der Sachverhalt...",
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty facts", () => {
    const result = draftingSchema.safeParse({
      title: "Klage",
      facts: "",
    });
    expect(result.success).toBe(false);
  });

  test("rejects facts too long", () => {
    const result = draftingSchema.safeParse({
      title: "Klage",
      facts: "a".repeat(10_001),
    });
    expect(result.success).toBe(false);
  });
});
