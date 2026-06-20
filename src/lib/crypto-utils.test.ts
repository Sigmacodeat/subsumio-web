// @vitest-environment node

import { describe, test, expect } from "vitest";
import { timingSafeCompare } from "./crypto-utils";

describe("timingSafeCompare", () => {
  test("returns true for identical strings", () => {
    expect(timingSafeCompare("hello", "hello")).toBe(true);
  });

  test("returns false for different strings of same length", () => {
    expect(timingSafeCompare("hello", "world")).toBe(false);
  });

  test("returns false for different strings of different lengths", () => {
    expect(timingSafeCompare("short", "longer string")).toBe(false);
  });

  test("returns true for empty strings", () => {
    expect(timingSafeCompare("", "")).toBe(true);
  });

  test("returns false when one is empty and other is not", () => {
    expect(timingSafeCompare("", "a")).toBe(false);
    expect(timingSafeCompare("a", "")).toBe(false);
  });

  test("returns true for single character match", () => {
    expect(timingSafeCompare("a", "a")).toBe(true);
  });

  test("returns false for single character mismatch", () => {
    expect(timingSafeCompare("a", "b")).toBe(false);
  });

  test("handles special characters", () => {
    expect(timingSafeCompare("!@#$%^&*()", "!@#$%^&*()")).toBe(true);
    expect(timingSafeCompare("!@#$%^&*()", "!@#$%^&*(")).toBe(false);
  });

  test("handles unicode characters", () => {
    expect(timingSafeCompare("üñïçödé", "üñïçödé")).toBe(true);
    expect(timingSafeCompare("üñïçödé", "üñïçöd")).toBe(false);
  });

  test("handles very long strings", () => {
    const a = "x".repeat(10000);
    const b = "x".repeat(10000);
    const c = "y".repeat(10000);
    expect(timingSafeCompare(a, b)).toBe(true);
    expect(timingSafeCompare(a, c)).toBe(false);
  });

  test("handles strings that differ only at the end", () => {
    expect(timingSafeCompare("abcdefghijX", "abcdefghijY")).toBe(false);
  });

  test("handles strings that differ only at the start", () => {
    expect(timingSafeCompare("Xbcdefghij", "Ybcdefghij")).toBe(false);
  });

  test("handles strings that differ only in the middle", () => {
    expect(timingSafeCompare("abcXefghij", "abcYefghij")).toBe(false);
  });

  test("handles binary-like strings", () => {
    expect(timingSafeCompare("\x00\x01\x02\x03", "\x00\x01\x02\x03")).toBe(true);
    expect(timingSafeCompare("\x00\x01\x02\x03", "\x00\x01\x02\x04")).toBe(false);
  });

  test("is symmetric", () => {
    expect(timingSafeCompare("abc", "abc")).toBe(timingSafeCompare("abc", "abc"));
    expect(timingSafeCompare("abc", "def")).toBe(timingSafeCompare("def", "abc"));
  });

  test("handles whitespace-only strings", () => {
    expect(timingSafeCompare("   ", "   ")).toBe(true);
    expect(timingSafeCompare("   ", "  ")).toBe(false);
  });

  test("handles newlines and tabs", () => {
    expect(timingSafeCompare("\n\t\r", "\n\t\r")).toBe(true);
    expect(timingSafeCompare("\n\t\r", "\n\t\n")).toBe(false);
  });
});
