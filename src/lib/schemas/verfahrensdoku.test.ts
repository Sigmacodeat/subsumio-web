// @vitest-environment node

import { describe, test, expect } from "vitest";
import { verfahrensdokuSchema } from "./verfahrensdoku";

describe("verfahrensdokuSchema", () => {
  test("accepts minimal valid input", () => {
    const result = verfahrensdokuSchema.safeParse({
      kanzleiName: "Musterkanzlei",
    });
    expect(result.success).toBe(true);
  });

  test("rejects empty kanzleiName", () => {
    const result = verfahrensdokuSchema.safeParse({
      kanzleiName: "",
    });
    expect(result.success).toBe(false);
  });

  test("applies defaults for optional fields", () => {
    const result = verfahrensdokuSchema.parse({
      kanzleiName: "Musterkanzlei",
    });
    expect(result.anwaltName).toBe("");
    expect(result.systeme).toBe("");
  });
});
