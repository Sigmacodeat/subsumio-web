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
