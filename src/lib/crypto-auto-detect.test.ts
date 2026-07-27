import { describe, it, expect } from "vitest";
import {
  shouldSuggestForensics,
  extractWalletsFromText,
  formatScanSummary,
  type CaseScanResult,
} from "./crypto-auto-detect";

describe("crypto-auto-detect", () => {
  describe("extractWalletsFromText", () => {
    it("finds BTC address in text", () => {
      const text = "Send funds to bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
      const wallets = extractWalletsFromText(text);
      expect(wallets.length).toBeGreaterThan(0);
      expect(wallets[0].blockchain).toBe("BTC");
      expect(wallets[0].checksumValid).toBe(true);
    });

    it("finds ETH address in text", () => {
      const text = "My ETH address is 0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
      const wallets = extractWalletsFromText(text);
      expect(wallets.length).toBeGreaterThan(0);
      expect(wallets[0].blockchain).toBe("ETH");
    });

    it("returns empty for text without wallets", () => {
      const wallets = extractWalletsFromText("Hello world, no crypto here.");
      expect(wallets).toEqual([]);
    });

    it("validates checksums", () => {
      const text = "Invalid BTC: bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5";
      const wallets = extractWalletsFromText(text);
      expect(wallets.length).toBeGreaterThan(0);
      expect(wallets[0].checksumValid).toBe(false);
    });
  });

  describe("shouldSuggestForensics", () => {
    it("returns true when valid addresses found", () => {
      const result: CaseScanResult = {
        wallets: [],
        documentsScanned: 5,
        suggestions: [],
        totalAddressesFound: 2,
        validAddressesFound: 1,
      };
      expect(shouldSuggestForensics(result)).toBe(true);
    });

    it("returns false when no valid addresses", () => {
      const result: CaseScanResult = {
        wallets: [],
        documentsScanned: 5,
        suggestions: [],
        totalAddressesFound: 2,
        validAddressesFound: 0,
      };
      expect(shouldSuggestForensics(result)).toBe(false);
    });

    it("returns false when no addresses at all", () => {
      const result: CaseScanResult = {
        wallets: [],
        documentsScanned: 5,
        suggestions: [],
        totalAddressesFound: 0,
        validAddressesFound: 0,
      };
      expect(shouldSuggestForensics(result)).toBe(false);
    });
  });

  describe("formatScanSummary", () => {
    it("formats no addresses found", () => {
      const result: CaseScanResult = {
        wallets: [],
        documentsScanned: 3,
        suggestions: [],
        totalAddressesFound: 0,
        validAddressesFound: 0,
      };
      const summary = formatScanSummary(result);
      expect(summary).toContain("Keine");
      expect(summary).toContain("3");
    });

    it("formats valid addresses found", () => {
      const result: CaseScanResult = {
        wallets: [],
        documentsScanned: 5,
        suggestions: [],
        totalAddressesFound: 3,
        validAddressesFound: 2,
      };
      const summary = formatScanSummary(result);
      expect(summary).toContain("2");
      expect(summary).toContain("empfohlen");
    });

    it("formats all invalid addresses", () => {
      const result: CaseScanResult = {
        wallets: [],
        documentsScanned: 5,
        suggestions: [],
        totalAddressesFound: 3,
        validAddressesFound: 0,
      };
      const summary = formatScanSummary(result);
      expect(summary).toContain("3");
      expect(summary).toContain("gültiger Prüfsumme");
    });
  });
});
