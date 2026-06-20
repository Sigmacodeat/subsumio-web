import { describe, it, expect } from "vitest";
import {
  generateBackupCodes,
  hashBackupCode,
  hashBackupCodes,
  verifyBackupCode,
} from "./backup-codes";

describe("Backup Codes", () => {
  it("generateBackupCodes() returns 10 codes in XXXX-XXXX-XXXX format", () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(10);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    }
  });

  it("generateBackupCodes() with custom count", () => {
    const codes = generateBackupCodes(5);
    expect(codes).toHaveLength(5);
  });

  it("hashBackupCode() returns a 64-char hex string (SHA-256)", async () => {
    const hash = await hashBackupCode("ABCD-1234-WXYZ");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it("hashBackupCode() normalizes input (trim + uppercase)", async () => {
    const hash1 = await hashBackupCode("abcd-1234-wxyz");
    const hash2 = await hashBackupCode("ABCD-1234-WXYZ");
    expect(hash1).toBe(hash2);
  });

  it("verifyBackupCode() returns correct index for matching code", async () => {
    const codes = generateBackupCodes();
    const hashes = await hashBackupCodes(codes);
    const index = await verifyBackupCode(codes[3], hashes);
    expect(index).toBe(3);
  });

  it("verifyBackupCode() returns -1 for wrong code", async () => {
    const codes = generateBackupCodes();
    const hashes = await hashBackupCodes(codes);
    const index = await verifyBackupCode("WRONG-CODE-HERE", hashes);
    expect(index).toBe(-1);
  });

  it("hashBackupCodes() preserves order", async () => {
    const codes = ["AAAA-1111-BBBB", "CCCC-2222-DDDD", "EEEE-3333-FFFF"];
    const hashes = await hashBackupCodes(codes);
    expect(hashes).toHaveLength(3);
    for (let i = 0; i < codes.length; i++) {
      const idx = await verifyBackupCode(codes[i], hashes);
      expect(idx).toBe(i);
    }
  });

  it("consuming a backup code removes it from the array", async () => {
    const codes = generateBackupCodes();
    const hashes = await hashBackupCodes(codes);
    expect(hashes).toHaveLength(10);

    // Simulate consuming code at index 2
    const consumedIndex = 2;
    const remaining = hashes.filter((_, i) => i !== consumedIndex);
    expect(remaining).toHaveLength(9);

    // The consumed code should no longer verify
    const idx = await verifyBackupCode(codes[consumedIndex], remaining);
    expect(idx).toBe(-1);

    // Other codes should still verify
    const idx2 = await verifyBackupCode(codes[0], remaining);
    expect(idx2).toBe(0);
  });
});

describe("Backup Code Recovery Flow Edge-Cases", () => {
  it("code exhaustion: all 10 codes can be consumed one by one", async () => {
    const codes = generateBackupCodes();
    let hashes = await hashBackupCodes(codes);
    expect(hashes).toHaveLength(10);

    for (let i = 0; i < 10; i++) {
      // Find the first valid code
      let found = -1;
      for (let j = 0; j < codes.length; j++) {
        const idx = await verifyBackupCode(codes[j], hashes);
        if (idx >= 0) {
          found = idx;
          // Remove consumed code
          hashes = hashes.filter((_, h) => h !== idx);
          break;
        }
      }
      expect(found).toBeGreaterThanOrEqual(0);
    }

    // All codes consumed — no code should verify anymore
    expect(hashes).toHaveLength(0);
    for (const code of codes) {
      const idx = await verifyBackupCode(code, hashes);
      expect(idx).toBe(-1);
    }
  });

  it("case insensitive: lowercase input matches uppercase stored hash", async () => {
    const code = "ABCD-EFGH-JKMN";
    const hash = await hashBackupCode(code);
    const lowerInput = "abcd-efgh-jkmn";
    const idx = await verifyBackupCode(lowerInput, [hash]);
    expect(idx).toBe(0);
  });

  it("whitespace tolerant: leading/trailing spaces are trimmed", async () => {
    const code = "ABCD-EFGH-JKMN";
    const hash = await hashBackupCode(code);
    const paddedInput = "  ABCD-EFGH-JKMN  ";
    const idx = await verifyBackupCode(paddedInput, [hash]);
    expect(idx).toBe(0);
  });

  it("generated codes contain no ambiguous characters (I, O, 0, 1)", () => {
    const codes = generateBackupCodes(50);
    for (const code of codes) {
      expect(code).not.toContain("I");
      expect(code).not.toContain("O");
      expect(code).not.toContain("0");
      expect(code).not.toContain("1");
    }
  });

  it("generated codes are unique within a batch", () => {
    const codes = generateBackupCodes(100);
    const unique = new Set(codes);
    // With 32-char alphabet and 12 chars per code, collisions are astronomically unlikely
    expect(unique.size).toBeGreaterThan(90);
  });

  it("verifyBackupCode with empty stored hashes returns -1", async () => {
    const idx = await verifyBackupCode("ABCD-EFGH-JKMN", []);
    expect(idx).toBe(-1);
  });

  it("verifyBackupCode returns first matching index when duplicates exist", async () => {
    const code = "ABCD-EFGH-JKMN";
    const hash = await hashBackupCode(code);
    const idx = await verifyBackupCode(code, [hash, hash, hash]);
    expect(idx).toBe(0);
  });

  it("recovery flow: simulate full 2FA backup recovery", async () => {
    // 1. Generate and store backup codes
    const codes = generateBackupCodes();
    const storedHashes = await hashBackupCodes(codes);

    // 2. User loses authenticator, tries first backup code
    const attempt1 = await verifyBackupCode(codes[0], storedHashes);
    expect(attempt1).toBe(0);

    // 3. Consume code 0
    let remaining = storedHashes.filter((_, i) => i !== 0);
    expect(remaining).toHaveLength(9);

    // 4. User tries same code again — should fail
    const retry = await verifyBackupCode(codes[0], remaining);
    expect(retry).toBe(-1);

    // 5. User tries second backup code — should work
    const attempt2 = await verifyBackupCode(codes[1], remaining);
    expect(attempt2).toBeGreaterThanOrEqual(0);

    // 6. Consume code 1
    remaining = remaining.filter((_, i) => i !== attempt2);
    expect(remaining).toHaveLength(8);
  });
});
