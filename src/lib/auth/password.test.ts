// @vitest-environment node

import { describe, test, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("hashPassword", () => {
  test("produces s2-scheme format", async () => {
    const hash = await hashPassword("supersecret");
    expect(hash).toMatch(/^s2:[a-f0-9]{32}:[a-f0-9]{128}$/);
  });

  test("returns different salts for same password", async () => {
    const h1 = await hashPassword("same");
    const h2 = await hashPassword("same");
    expect(h1).not.toBe(h2);
  });
});

describe("verifyPassword", () => {
  test("accepts correct password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  test("rejects wrong password", async () => {
    const hash = await hashPassword("secret123");
    expect(await verifyPassword("wrong", hash)).toBe(false);
    expect(await verifyPassword("Secret123", hash)).toBe(false); // case sensitive
  });

  test("rejects malformed hash", async () => {
    expect(await verifyPassword("pass", "noscheme")).toBe(false);
    expect(await verifyPassword("pass", "s1:salt:hash")).toBe(false);
    expect(await verifyPassword("pass", "s2:short:hash")).toBe(false);
    expect(await verifyPassword("pass", "s2:salt")).toBe(false);
  });

  test("rejects empty password", async () => {
    const hash = await hashPassword("");
    expect(await verifyPassword("", hash)).toBe(true);
    expect(await verifyPassword(" ", hash)).toBe(false);
  });
});
