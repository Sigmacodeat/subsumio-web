import { describe, it, expect } from "vitest";
import {
  detectWallets,
  detectWalletAddresses,
  classifyBlockchain,
  containsWalletAddress,
  isKnownFraudWallet,
  markAsFraudWallet,
  BLOCKCHAIN_LABELS,
} from "./crypto-wallet-detector";

describe("crypto-wallet-detector", () => {
  describe("classifyBlockchain", () => {
    it("classifies Bitcoin Bech32 addresses", () => {
      expect(classifyBlockchain("bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")).toBe("BTC");
      expect(classifyBlockchain("bc1p5d7rjq7g6rxk4wf6q63qexxq0gkxqexq0gkxqexq0gkxqexq0gkx")).toBe(
        "BTC"
      );
    });

    it("classifies Bitcoin Legacy addresses", () => {
      expect(classifyBlockchain("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa")).toBe("BTC");
      expect(classifyBlockchain("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy")).toBe("BTC");
    });

    it("classifies Ethereum addresses", () => {
      expect(classifyBlockchain("0x742d35Cc6634C0532925a3b844Bc454e4438f44e")).toBe("ETH");
      expect(classifyBlockchain("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe("ETH");
    });

    it("classifies Tron/USDT TRC20 addresses", () => {
      expect(classifyBlockchain("TJRyWwFsUwTNzqZm5Z5p5p5p5p5p5p5p5p")).toBe("TRX");
    });

    it("classifies Ripple addresses", () => {
      expect(classifyBlockchain("rDsbeomae4FXwgQTGpL3pDfKf3pDfKf3pD")).toBe("XRP");
    });

    it("classifies Litecoin addresses", () => {
      expect(classifyBlockchain("Lfm5iZmgQ5p5p5p5p5p5p5p5p5p5p5p5p5")).toBe("LTC");
      expect(classifyBlockchain("MTf4iZmgQ5p5p5p5p5p5p5p5p5p5p5p5p5")).toBe("LTC");
    });

    it("returns UNKNOWN for non-address strings", () => {
      expect(classifyBlockchain("hello world")).toBe("UNKNOWN");
      expect(classifyBlockchain("")).toBe("UNKNOWN");
      expect(classifyBlockchain("not-a-wallet")).toBe("UNKNOWN");
    });
  });

  describe("detectWallets", () => {
    it("detects Bitcoin Bech32 addresses in text", () => {
      const text =
        "The fraudster sent funds to bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh yesterday.";
      const wallets = detectWallets(text);
      expect(wallets).toHaveLength(1);
      expect(wallets[0].address).toBe("bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh");
      expect(wallets[0].blockchain).toBe("BTC");
      expect(wallets[0].confidence).toBeGreaterThan(0.9);
    });

    it("detects Ethereum addresses in text", () => {
      const text = "Send ETH to 0x742d35Cc6634C0532925a3b844Bc454e4438f44e immediately.";
      const wallets = detectWallets(text);
      expect(wallets).toHaveLength(1);
      expect(wallets[0].blockchain).toBe("ETH");
    });

    it("detects multiple wallets in text", () => {
      const text = `
        BTC: bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh
        ETH: 0x742d35Cc6634C0532925a3b844Bc454e4438f44e
        USDT: TJRyWwFsUwTNzqZm5Z5p5p5p5p5p5p5p5p
      `;
      const wallets = detectWallets(text);
      expect(wallets.length).toBeGreaterThanOrEqual(2);
    });

    it("deduplicates addresses", () => {
      const text =
        "Address: bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh and again bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
      const wallets = detectWallets(text);
      expect(wallets).toHaveLength(1);
    });

    it("returns empty array for text without wallets", () => {
      expect(detectWallets("Hello world, no wallets here")).toEqual([]);
      expect(detectWallets("")).toEqual([]);
    });

    it("extracts context around the match", () => {
      const text =
        "The suspect received BTC at bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh on Tuesday.";
      const wallets = detectWallets(text);
      expect(wallets[0].context).toContain("suspect");
      expect(wallets[0].context).toContain("Tuesday");
    });

    it("sorts results by position", () => {
      const text = `
        First: 0x742d35Cc6634C0532925a3b844Bc454e4438f44e
        Second: bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh
      `;
      const wallets = detectWallets(text);
      expect(wallets[0].start).toBeLessThan(wallets[1].start);
    });
  });

  describe("detectWalletAddresses", () => {
    it("returns only address strings", () => {
      const text = "Wallet: bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
      const addresses = detectWalletAddresses(text);
      expect(addresses).toEqual(["bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"]);
    });
  });

  describe("containsWalletAddress", () => {
    it("returns true when wallets are found", () => {
      expect(containsWalletAddress("Send to 0x742d35Cc6634C0532925a3b844Bc454e4438f44e")).toBe(
        true
      );
    });

    it("returns false when no wallets are found", () => {
      expect(containsWalletAddress("No wallets here")).toBe(false);
    });
  });

  describe("isKnownFraudWallet", () => {
    it("returns false by default for unknown addresses", () => {
      expect(isKnownFraudWallet("bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")).toBe(false);
    });

    it("returns true after marking as fraud", () => {
      const addr = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
      markAsFraudWallet(addr);
      expect(isKnownFraudWallet(addr)).toBe(true);
    });
  });

  describe("BLOCKCHAIN_LABELS", () => {
    it("has labels for all known blockchains", () => {
      expect(BLOCKCHAIN_LABELS.BTC).toBe("Bitcoin");
      expect(BLOCKCHAIN_LABELS.ETH).toBe("Ethereum");
      expect(BLOCKCHAIN_LABELS.TRX).toContain("Tron");
    });
  });

  describe("Edge cases", () => {
    it("does not match short hex strings as ETH addresses", () => {
      const wallets = detectWallets("Color code: 0x742d35");
      expect(wallets).toEqual([]);
    });

    it("does not match random base58 strings as BTC", () => {
      const wallets = detectWallets(
        "Reference number: 5HpHagT65TZzG1PH3CSu63k8DbpvD8s5ip4nEB3kEsreAnchuDf"
      );
      // This is a private key, not a wallet address — should not match BTC pattern
      // (starts with 5, not 1 or 3)
      const btcWallets = wallets.filter((w) => w.blockchain === "BTC");
      expect(btcWallets).toEqual([]);
    });

    it("handles very long text without crashing", () => {
      const longText =
        "A".repeat(100_000) + " bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh " + "B".repeat(100_000);
      const wallets = detectWallets(longText);
      expect(wallets).toHaveLength(1);
      expect(wallets[0].blockchain).toBe("BTC");
    });
  });
});
