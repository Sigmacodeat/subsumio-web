// @vitest-environment node

import { describe, test, expect } from "vitest";
import { generateApiKey, hashApiKey, getApiKeyPrefix, maskApiKey } from "./api-keys";

describe("generateApiKey", () => {
  test("returns an object with key and id", () => {
    const result = generateApiKey();
    expect(result.key).toBeDefined();
    expect(result.id).toBeDefined();
    expect(typeof result.key).toBe("string");
    expect(typeof result.id).toBe("string");
  });

  test("key starts with sk_live_ prefix", () => {
    const { key } = generateApiKey();
    expect(key.startsWith("sk_live_")).toBe(true);
  });

  test("id is a valid UUID", () => {
    const { id } = generateApiKey();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test("key has sufficient length (prefix + 32 chars)", () => {
    const { key } = generateApiKey();
    expect(key.length).toBeGreaterThanOrEqual(40);
  });

  test("two consecutive calls produce different keys", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).not.toBe(b.key);
    expect(a.id).not.toBe(b.id);
  });

  test("key contains only base64url-safe characters after prefix", () => {
    const { key } = generateApiKey();
    const body = key.slice("sk_live_".length);
    expect(body).toMatch(/^[A-Za-z0-9]+$/);
  });
});

describe("hashApiKey", () => {
  test("returns a non-empty string", async () => {
    const hash = await hashApiKey("sk_live_testkey123");
    expect(hash).toBeTruthy();
    expect(typeof hash).toBe("string");
  });

  test("is deterministic — same key produces same hash", async () => {
    const key = "sk_live_abc123";
    const h1 = await hashApiKey(key);
    const h2 = await hashApiKey(key);
    expect(h1).toBe(h2);
  });

  test("different keys produce different hashes", async () => {
    const h1 = await hashApiKey("sk_live_key_a");
    const h2 = await hashApiKey("sk_live_key_b");
    expect(h1).not.toBe(h2);
  });

  test("hash of generated key is consistent", async () => {
    const { key } = generateApiKey();
    const h1 = await hashApiKey(key);
    const h2 = await hashApiKey(key);
    expect(h1).toBe(h2);
  });

  test("hash does not contain the plaintext key", async () => {
    const key = "sk_live_secretvalue123";
    const hash = await hashApiKey(key);
    expect(hash).not.toContain("secretvalue");
    expect(hash).not.toContain(key);
  });
});

describe("getApiKeyPrefix", () => {
  test("returns first 16 characters", () => {
    const key = "sk_live_abcdefghijklmnop";
    const prefix = getApiKeyPrefix(key);
    expect(prefix).toBe(key.slice(0, 16));
    expect(prefix).toHaveLength(16);
    expect(key.startsWith(prefix)).toBe(true);
  });

  test("works with a real generated key", () => {
    const { key } = generateApiKey();
    const prefix = getApiKeyPrefix(key);
    expect(prefix).toHaveLength(16);
    expect(key.startsWith(prefix)).toBe(true);
  });

  test("handles short keys gracefully", () => {
    expect(getApiKeyPrefix("short")).toBe("short");
  });
});

describe("maskApiKey", () => {
  test("masks a standard key showing first 12 and last 4 chars", () => {
    const key = "sk_live_abcdefghijklmnop";
    const masked = maskApiKey(key);
    expect(masked).toContain("sk_live_abc");
    expect(masked).toContain("mnop");
    expect(masked).toContain("…");
  });

  test("returns *** for very short keys (<=12 chars)", () => {
    expect(maskApiKey("shortkey")).toBe("***");
    expect(maskApiKey("exactly12ch")).toBe("***");
  });

  test("does not mask at exactly 13 chars (boundary)", () => {
    const key = "exactly13chars";
    expect(key).toHaveLength(14);
    // 13 chars is > 12, so it should be masked with ellipsis
    const key13 = "exactly13char";
    expect(key13).toHaveLength(13);
    const masked = maskApiKey(key13);
    expect(masked).not.toBe("***");
    expect(masked).toContain("…");
  });

  test("masked key does not contain middle portion", () => {
    const key = "sk_live_secret_middle_part_1234";
    const masked = maskApiKey(key);
    expect(masked).not.toContain("secret_middle_part");
  });

  test("works with a real generated key", () => {
    const { key } = generateApiKey();
    const masked = maskApiKey(key);
    expect(masked).not.toBe("***");
    expect(masked).toContain("…");
  });
});
