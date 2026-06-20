import { describe, it, expect } from "vitest";
import { encrypt, decrypt, encryptFields, decryptFields } from "@/lib/encryption";

describe("Encryption", () => {
  it("decrypt is inverse of encrypt", async () => {
    const plaintext = "sensitive-api-key-12345";
    const encrypted = await encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("encrypt returns null for null/undefined", async () => {
    expect(await encrypt(null)).toBeNull();
    expect(await encrypt(undefined)).toBeNull();
  });

  it("decrypt returns null for null/undefined", async () => {
    expect(await decrypt(null)).toBeNull();
    expect(await decrypt(undefined)).toBeNull();
  });

  it("decrypt handles legacy unencrypted values", async () => {
    const legacy = "plain-text-value";
    const result = await decrypt(legacy);
    expect(result).toBe(legacy);
  });

  it("encrypt produces sbenc: or sbplain: prefixed output", async () => {
    const result = await encrypt("test-value");
    expect(result).toMatch(/^(sbenc:|sbplain:)/);
  });

  it("decrypt returns null for corrupted encrypted data", async () => {
    // ENCRYPTION_KEY is captured at module load time, so we need to reset modules
    vi.resetModules();
    process.env.SIGMABRAIN_ENCRYPTION_KEY = "test-key-32-chars-long-enough!!";
    const { decrypt: decryptWithKey } = await import("./encryption");
    const result = await decryptWithKey("sbenc:invalidbase64data!!!");
    expect(result).toBeNull();
    delete process.env.SIGMABRAIN_ENCRYPTION_KEY;
    vi.resetModules();
  });
});

describe("encryptFields / decryptFields", () => {
  it("encrypts specified string fields only", async () => {
    const obj = { name: "Alice", apiKey: "secret-key", count: 42 };
    const encrypted = await encryptFields(obj, ["apiKey"]);
    expect(encrypted.name).toBe("Alice");
    expect(encrypted.apiKey).not.toBe("secret-key");
    expect(encrypted.count).toBe(42);
  });

  it("decrypts specified fields back", async () => {
    const obj = { name: "Alice", apiKey: "secret-key" };
    const encrypted = await encryptFields(obj, ["apiKey"]);
    const decrypted = await decryptFields(encrypted, ["apiKey"]);
    expect(decrypted.apiKey).toBe("secret-key");
    expect(decrypted.name).toBe("Alice");
  });

  it("does not mutate original object", async () => {
    const obj = { apiKey: "secret" };
    const result = await encryptFields(obj, ["apiKey"]);
    expect(obj.apiKey).toBe("secret");
    expect(result.apiKey).not.toBe("secret");
  });
});
