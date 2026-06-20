// @vitest-environment node

import { describe, it, expect, vi } from "vitest";
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
    process.env.SUBSUMIO_ENCRYPTION_KEY = "test-key-32-chars-long-enough!!";
    const { decrypt: decryptWithKey } = await import("./encryption");
    const result = await decryptWithKey("sbenc:invalidbase64data!!!");
    expect(result).toBeNull();
    delete process.env.SUBSUMIO_ENCRYPTION_KEY;
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

describe("Encryption-at-Rest for Sensitive Auth Fields", () => {
  it("TOTP secret: encrypt → store → decrypt roundtrip preserves exact value", async () => {
    const totpSecret = "JBSWY3DPEHPK3PXPABCDEFGH"; // base32 TOTP secret
    const encrypted = await encrypt(totpSecret);
    expect(encrypted).not.toBe(totpSecret);
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe(totpSecret);
  });

  it("DocuSign access token: encrypt → store → decrypt roundtrip", async () => {
    const docusignToken = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJkb2N1c2lnbi11c2VyIn0.signature";
    const encrypted = await encrypt(docusignToken);
    expect(encrypted).not.toBe(docusignToken);
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe(docusignToken);
  });

  it("DocuSign refresh token: encrypt → store → decrypt roundtrip", async () => {
    const refreshToken = "rt-abcdef1234567890ghijklmnopqrstuvwxyz";
    const encrypted = await encrypt(refreshToken);
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe(refreshToken);
  });

  it("API key: encrypt → store → decrypt roundtrip", async () => {
    const apiKey = "sk-subsumio-1234567890abcdef";
    const encrypted = await encrypt(apiKey);
    expect(encrypted).not.toBe(apiKey);
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe(apiKey);
  });

  it("encryptFields for a user object with TOTP + DocuSign tokens", async () => {
    const user = {
      id: "user-1",
      email: "test@example.com",
      twoFactorSecret: "JBSWY3DPEHPK3PXP",
      docusignAccessToken: "eyJhbGciOiJSUzI1NiJ9.payload.sig",
      docusignRefreshToken: "rt-abc123def456",
      name: "Test User",
    };

    const encrypted = await encryptFields(user, [
      "twoFactorSecret",
      "docusignAccessToken",
      "docusignRefreshToken",
    ]);

    // Non-sensitive fields are unchanged
    expect(encrypted.id).toBe("user-1");
    expect(encrypted.email).toBe("test@example.com");
    expect(encrypted.name).toBe("Test User");

    // Sensitive fields are encrypted (sbenc: or sbplain: prefix in dev)
    expect(encrypted.twoFactorSecret).toMatch(/^(sbenc:|sbplain:)/);
    expect(encrypted.twoFactorSecret).not.toBe("JBSWY3DPEHPK3PXP");
    expect(encrypted.docusignAccessToken).toMatch(/^(sbenc:|sbplain:)/);
    expect(encrypted.docusignRefreshToken).toMatch(/^(sbenc:|sbplain:)/);

    // Decrypt back
    const decrypted = await decryptFields(encrypted, [
      "twoFactorSecret",
      "docusignAccessToken",
      "docusignRefreshToken",
    ]);
    expect(decrypted.twoFactorSecret).toBe("JBSWY3DPEHPK3PXP");
    expect(decrypted.docusignAccessToken).toBe("eyJhbGciOiJSUzI1NiJ9.payload.sig");
    expect(decrypted.docusignRefreshToken).toBe("rt-abc123def456");
  });

  it("encrypt returns null for empty string (falsy guard)", async () => {
    expect(await encrypt("")).toBeNull();
  });

  it("encrypt handles very long strings (large tokens)", async () => {
    const longToken = "x".repeat(10000);
    const encrypted = await encrypt(longToken);
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe(longToken);
  });

  it("encrypt handles unicode characters (international names)", async () => {
    const unicode = "Müller-Légalová-法律事務所";
    const encrypted = await encrypt(unicode);
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe(unicode);
  });
});

describe("Encryption Production Guard", () => {
  it("isEncryptionEnabled throws in production without key", async () => {
    vi.resetModules();
    const oldEnv = process.env.NODE_ENV;
    const oldKey = process.env.SUBSUMIO_ENCRYPTION_KEY;
    delete process.env.SUBSUMIO_ENCRYPTION_KEY;
    process.env.NODE_ENV = "production";
    const { isEncryptionEnabled } = await import("./encryption");
    expect(() => isEncryptionEnabled()).toThrow();
    process.env.NODE_ENV = oldEnv;
    if (oldKey) process.env.SUBSUMIO_ENCRYPTION_KEY = oldKey;
    vi.resetModules();
  });

  it("isEncryptionEnabled returns true with key set", async () => {
    vi.resetModules();
    process.env.SUBSUMIO_ENCRYPTION_KEY = "test-key-32-chars-long-enough!!";
    const { isEncryptionEnabled } = await import("./encryption");
    expect(isEncryptionEnabled()).toBe(true);
    delete process.env.SUBSUMIO_ENCRYPTION_KEY;
    vi.resetModules();
  });

  it("different plaintexts produce different ciphertexts (IV randomness)", async () => {
    vi.resetModules();
    process.env.SUBSUMIO_ENCRYPTION_KEY = "test-key-32-chars-long-enough!!";
    const { encrypt: encWithKey, decrypt: decWithKey } = await import("./encryption");
    const pt = "same-plaintext";
    const enc1 = await encWithKey(pt);
    const enc2 = await encWithKey(pt);
    expect(enc1).not.toBe(enc2);
    expect(await decWithKey(enc1)).toBe(pt);
    expect(await decWithKey(enc2)).toBe(pt);
    delete process.env.SUBSUMIO_ENCRYPTION_KEY;
    vi.resetModules();
  });

  it("encryptFields skips non-string fields safely", async () => {
    const obj = { count: 42, active: true, data: null, name: "test" };
    const result = await encryptFields(obj, ["count", "active", "data", "name"]);
    expect(result.count).toBe(42);
    expect(result.active).toBe(true);
    expect(result.data).toBeNull();
    expect(result.name).not.toBe("test");
  });
});

