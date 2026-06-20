import { describe, test, expect, vi, afterEach } from "vitest";
import { env, envString, envBool } from "./env";

describe("env", () => {
  afterEach(() => {
    delete process.env.TEST_ENV_VAR;
  });

  test("returns value when set", () => {
    process.env.TEST_ENV_VAR = "hello";
    expect(env("TEST_ENV_VAR")).toBe("hello");
  });

  test("returns undefined when not set", () => {
    expect(env("NONEXISTENT_VAR_XYZ")).toBeUndefined();
  });

  test("returns empty string when set to empty", () => {
    process.env.TEST_ENV_VAR = "";
    expect(env("TEST_ENV_VAR")).toBe("");
  });
});

describe("envString", () => {
  afterEach(() => {
    delete process.env.TEST_ENV_VAR;
  });

  test("returns value when set", () => {
    process.env.TEST_ENV_VAR = "value";
    expect(envString("TEST_ENV_VAR", "fallback")).toBe("value");
  });

  test("returns fallback when not set", () => {
    expect(envString("NONEXISTENT_VAR_XYZ", "fallback")).toBe("fallback");
  });

  test("returns empty string when set to empty (not fallback)", () => {
    process.env.TEST_ENV_VAR = "";
    expect(envString("TEST_ENV_VAR", "fallback")).toBe("");
  });
});

describe("envBool", () => {
  afterEach(() => {
    delete process.env.TEST_ENV_VAR;
  });

  test("returns true for 'true'", () => {
    process.env.TEST_ENV_VAR = "true";
    expect(envBool("TEST_ENV_VAR")).toBe(true);
  });

  test("returns true for '1'", () => {
    process.env.TEST_ENV_VAR = "1";
    expect(envBool("TEST_ENV_VAR")).toBe(true);
  });

  test("returns true for 'yes'", () => {
    process.env.TEST_ENV_VAR = "yes";
    expect(envBool("TEST_ENV_VAR")).toBe(true);
  });

  test("returns false for 'false'", () => {
    process.env.TEST_ENV_VAR = "false";
    expect(envBool("TEST_ENV_VAR")).toBe(false);
  });

  test("returns false for '0'", () => {
    process.env.TEST_ENV_VAR = "0";
    expect(envBool("TEST_ENV_VAR")).toBe(false);
  });

  test("returns false for 'no'", () => {
    process.env.TEST_ENV_VAR = "no";
    expect(envBool("TEST_ENV_VAR")).toBe(false);
  });

  test("returns fallback when not set", () => {
    expect(envBool("NONEXISTENT_VAR_XYZ", true)).toBe(true);
    expect(envBool("NONEXISTENT_VAR_XYZ", false)).toBe(false);
  });

  test("default fallback is false", () => {
    expect(envBool("NONEXISTENT_VAR_XYZ")).toBe(false);
  });

  test("returns false for arbitrary string", () => {
    process.env.TEST_ENV_VAR = "maybe";
    expect(envBool("TEST_ENV_VAR")).toBe(false);
  });
});
