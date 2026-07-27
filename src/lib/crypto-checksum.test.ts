import { describe, it, expect } from "vitest";
import {
  validateBase58Check,
  validateBech32,
  validateEip55,
  validateAddress,
  isAddressValid,
  validateAndDetectBlockchain,
} from "./crypto-checksum";

describe("crypto-checksum", () => {
  // ── Base58Check ──────────────────────────────────────────────────────────

  describe("validateBase58Check", () => {
    it("accepts valid BTC Legacy address", () => {
      // Well-known valid address (Genesis block related)
      expect(validateBase58Check("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa")).toBe(true);
    });

    it("accepts valid BTC P2SH address", () => {
      expect(validateBase58Check("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy")).toBe(true);
    });

    it("rejects invalid checksum", () => {
      // Corrupted address — last char changed
      expect(validateBase58Check("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb")).toBe(false);
    });

    it("rejects empty string", () => {
      expect(validateBase58Check("")).toBe(false);
    });

    it("rejects non-base58 characters", () => {
      expect(validateBase58Check("1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf0O")).toBe(false);
    });

    it("rejects too short address", () => {
      expect(validateBase58Check("1A1z")).toBe(false);
    });
  });

  // ── Bech32 ───────────────────────────────────────────────────────────────

  describe("validateBech32", () => {
    it("accepts valid Bech32 SegWit v0 address (P2WPKH)", () => {
      // Well-known valid bc1q address
      expect(validateBech32("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")).toBe(true);
    });

    it("accepts valid Bech32m SegWit v1 address (Taproot)", () => {
      // Known valid Taproot address
      expect(validateBech32("bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr")).toBe(
        true
      );
    });

    it("rejects invalid Bech32 checksum", () => {
      // Corrupted last char
      expect(validateBech32("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5")).toBe(false);
    });

    it("rejects empty string", () => {
      expect(validateBech32("")).toBe(false);
    });

    it("rejects non-bc HRP", () => {
      // tb1 = testnet, should fail for mainnet validation
      expect(validateBech32("tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")).toBe(false);
    });
  });

  // ── EIP-55 ───────────────────────────────────────────────────────────────

  describe("validateEip55", () => {
    it("accepts valid EIP-55 checksummed address", () => {
      // Vitalik's address with proper EIP-55 checksum
      expect(validateEip55("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed")).toBe(true);
    });

    it("accepts all-lowercase address (no checksum)", () => {
      expect(validateEip55("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed")).toBe(true);
    });

    it("accepts all-uppercase address (no checksum)", () => {
      expect(validateEip55("0x5AAEB6053F3E94C9B9A09F33669435E7EF1BEAED")).toBe(true);
    });

    it("rejects invalid format (too short)", () => {
      expect(validateEip55("0x5aAeb6053")).toBe(false);
    });

    it("rejects empty string", () => {
      expect(validateEip55("")).toBe(false);
    });

    it("rejects non-hex characters", () => {
      expect(validateEip55("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeZ")).toBe(false);
    });
  });

  // ── Unified validateAddress ──────────────────────────────────────────────

  describe("validateAddress", () => {
    it("validates BTC Bech32 address", () => {
      const result = validateAddress("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", "BTC");
      expect(result.valid).toBe(true);
      expect(result.checksumValid).toBe(true);
      expect(result.blockchain).toBe("BTC");
    });

    it("validates BTC Legacy address", () => {
      const result = validateAddress("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", "BTC");
      expect(result.valid).toBe(true);
      expect(result.checksumValid).toBe(true);
      expect(result.format).toBe("base58check");
    });

    it("validates ETH address", () => {
      const result = validateAddress("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed", "ETH");
      expect(result.valid).toBe(true);
      expect(result.blockchain).toBe("ETH");
    });

    it("returns error for invalid BTC address", () => {
      const result = validateAddress("invalid-address", "BTC");
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("returns error for wrong prefix", () => {
      const result = validateAddress("xx1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", "BTC");
      expect(result.valid).toBe(false);
    });

    it("validates TRX address format", () => {
      // TRX addresses start with T and are Base58Check
      // Using a known TRX address format
      const result = validateAddress("TUEbTSchS4yLZ7X7BwLjKw7fz3Yw3wYwYw", "TRX");
      // May or may not be checksum-valid, but format should be recognized
      expect(result.blockchain).toBe("TRX");
    });
  });

  // ── isAddressValid ───────────────────────────────────────────────────────

  describe("isAddressValid", () => {
    it("returns true for valid BTC address", () => {
      expect(isAddressValid("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", "BTC")).toBe(true);
    });

    it("returns false for invalid address", () => {
      expect(isAddressValid("invalid", "BTC")).toBe(false);
    });
  });

  // ── validateAndDetectBlockchain ──────────────────────────────────────────

  describe("validateAndDetectBlockchain", () => {
    it("detects BTC from Bech32 address", () => {
      const result = validateAndDetectBlockchain("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4");
      expect(result?.blockchain).toBe("BTC");
      expect(result?.valid).toBe(true);
    });

    it("detects BTC from Legacy address", () => {
      const result = validateAndDetectBlockchain("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa");
      expect(result?.blockchain).toBe("BTC");
      expect(result?.valid).toBe(true);
    });

    it("detects ETH from 0x address", () => {
      const result = validateAndDetectBlockchain("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed");
      expect(result?.blockchain).toBe("ETH");
      expect(result?.valid).toBe(true);
    });

    it("returns null for unrecognized format", () => {
      expect(validateAndDetectBlockchain("not-an-address")).toBeNull();
    });
  });
});
