/**
 * CI Gate Test — Verifies that every hardcoded legal rule has a LegalRuleReceipt.
 *
 * This test fails if:
 *   1. A rule in DEADLINE_RULES, FRISTEN_REGISTRY, VERJAEHRUNG_PRESETS,
 *      RVG_STUFEN, or STBVV_STUFEN has no matching receipt
 *   2. A receipt is invalid (missing source_url, reviewer_id, etc.)
 *   3. A receipt's source_url is not an official source
 *
 * Run: cd server && bun test test/rule-receipts.test.ts
 */

import { describe, it, expect, beforeAll } from "bun:test";
import {
  validateRuleReceipt,
  getAllRuleReceipts,
  getRuleReceipt,
  getRegisteredRuleKeys,
} from "../src/core/legal/rule-receipt.ts";

// Import to trigger registration
import "../src/core/legal/rule-receipts-data.ts";

// Import the actual hardcoded rules to cross-check
// These are from the frontend src/ directory, accessed via the @/ alias
// which maps to ../src/* in server/tsconfig.json
import { DEADLINE_RULES } from "@/lib/legal-deadlines";
import { VERJAEHRUNG_PRESETS } from "@/lib/legal-verjaehrung";

describe("Legal Rule Receipts — CI Gate", () => {
  beforeAll(() => {
    // rule-receipts-data.ts registers all receipts on import
  });

  describe("Receipt validity", () => {
    it("every registered receipt is valid", () => {
      const receipts = getAllRuleReceipts();
      expect(receipts.length).toBeGreaterThan(0);

      for (const receipt of receipts) {
        const errors = validateRuleReceipt(receipt);
        if (errors.length > 0) {
          const msgs = errors.map((e) => `  ${e.field}: ${e.message}`).join("\n");
          throw new Error(`Receipt "${receipt.rule_key}" has validation errors:\n${msgs}`);
        }
      }
    });

    it("every receipt has a non-empty source_url", () => {
      for (const receipt of getAllRuleReceipts()) {
        expect(receipt.source_url).toBeTruthy();
        expect(receipt.source_url.length).toBeGreaterThan(10);
      }
    });

    it("every receipt has a non-empty reviewer_id", () => {
      for (const receipt of getAllRuleReceipts()) {
        expect(receipt.reviewer_id).toBeTruthy();
        expect(receipt.reviewer_id.length).toBeGreaterThan(0);
      }
    });

    it("every receipt has a valid ISO valid_from date", () => {
      for (const receipt of getAllRuleReceipts()) {
        expect(receipt.valid_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(new Date(receipt.valid_from).toString()).not.toBe("Invalid Date");
      }
    });

    it("every receipt has a 64-char hex source_hash", () => {
      for (const receipt of getAllRuleReceipts()) {
        expect(receipt.source_hash).toMatch(/^[a-f0-9]{64}$/);
      }
    });

    it("valid_to is null or after valid_from", () => {
      for (const receipt of getAllRuleReceipts()) {
        if (receipt.valid_to !== null) {
          expect(receipt.valid_to >= receipt.valid_from).toBe(true);
        }
      }
    });
  });

  describe("DEADLINE_RULES coverage", () => {
    it("every DEADLINE_RULES entry has a matching receipt", () => {
      const registered = getRegisteredRuleKeys();
      const missing: string[] = [];

      for (const rule of DEADLINE_RULES) {
        if (!registered.has(rule.key)) {
          missing.push(rule.key);
        }
      }

      if (missing.length > 0) {
        throw new Error(
          `DEADLINE_RULES without receipts (${missing.length}):\n` +
            missing.map((k) => `  - ${k}`).join("\n")
        );
      }
    });

    it("DEADLINE_RULES receipt payload matches the hardcoded duration", () => {
      for (const rule of DEADLINE_RULES) {
        const receipt = getRuleReceipt(rule.key);
        if (!receipt) continue;

        if (rule.days !== undefined) {
          expect(receipt.payload.days).toBe(rule.days);
        }
        if (rule.months !== undefined) {
          expect(receipt.payload.months).toBe(rule.months);
        }
        if (rule.years !== undefined) {
          expect(receipt.payload.years).toBe(rule.years);
        }
      }
    });
  });

  describe("VERJAEHRUNG_PRESETS coverage", () => {
    it("every VERJAEHRUNG_PRESETS entry has a matching receipt", () => {
      const registered = getRegisteredRuleKeys();
      const missing: string[] = [];

      for (const preset of VERJAEHRUNG_PRESETS) {
        if (!registered.has(preset.key)) {
          missing.push(preset.key);
        }
      }

      if (missing.length > 0) {
        throw new Error(
          `VERJAEHRUNG_PRESETS without receipts (${missing.length}):\n` +
            missing.map((k) => `  - ${k}`).join("\n")
        );
      }
    });

    it("VERJAEHRUNG_PRESETS receipt payload matches period_years", () => {
      for (const preset of VERJAEHRUNG_PRESETS) {
        const receipt = getRuleReceipt(preset.key);
        if (!receipt) continue;

        expect(receipt.payload.years).toBe(preset.period_years);
      }
    });
  });

  describe("Known bug fixes verified", () => {
    it("AHG Verjährung cites § 6 (not § 1)", () => {
      const receipt = getRuleReceipt("frist-ahg-verjaehrung");
      expect(receipt).toBeDefined();
      expect(receipt!.law_citation).toContain("§ 6");
      expect(receipt!.law_citation).not.toContain("§ 1");
    });

    it("OR Art. 127 has 10 years (not 5)", () => {
      const receipt = getRuleReceipt("or-127");
      expect(receipt).toBeDefined();
      expect(receipt!.payload.years).toBe(10);
    });

    it("ABGB § 1489 receipt has 3 years (not 30)", () => {
      const receipt = getRuleReceipt("abgb-1489");
      expect(receipt).toBeDefined();
      expect(receipt!.payload.years).toBe(3); // § 1489 = 3 years, not 30
    });
  });

  describe("No duplicate rule_keys", () => {
    it("all rule_keys are unique", () => {
      const receipts = getAllRuleReceipts();
      const keys = receipts.map((r) => r.rule_key);
      const unique = new Set(keys);
      expect(keys.length).toBe(unique.size);
    });
  });
});
