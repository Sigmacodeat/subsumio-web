import { describe, it, expect } from "vitest";
import {
  createStatuteOfLimitations,
  addInterruption,
  addSuspension,
  recompute,
  isBarred,
  daysUntilBarred,
  VERJAEHRUNG_PRESETS,
} from "@/lib/legal-verjaehrung";
import type { StatuteOfLimitations } from "@/lib/legal-types";

describe("legal-verjaehrung", () => {
  describe("createStatuteOfLimitations", () => {
    it("computes regular and absolute barred dates for § 195 BGB", () => {
      const sol = createStatuteOfLimitations({
        claim_label: "Schadensersatz aus Verkehrsunfall",
        claim_type: "Schadenersatz",
        law: "§ 195 BGB (DE)",
        start_date: "2026-01-15",
        period_years: 3,
        max_period_years: 10,
      });

      expect(sol.regular_barred_date).toBe("2029-01-15");
      expect(sol.absolute_barred_date).toBe("2036-01-15");
      expect(sol.status).toBe("active");
      expect(sol.effective_barred_date).toBe("2029-01-15");
    });

    it("computes barred date without max period for ABGB", () => {
      const sol = createStatuteOfLimitations({
        claim_label: "Schadenersatz",
        claim_type: "Schadenersatz",
        law: "§ 1489 ABGB (AT)",
        start_date: "2026-06-15",
        period_years: 3,
        max_period_years: 30,
      });

      expect(sol.regular_barred_date).toBe("2029-06-15");
      expect(sol.absolute_barred_date).toBe("2056-06-15");
    });

    it("computes 10-year OR Verjährung without max period", () => {
      const sol = createStatuteOfLimitations({
        claim_label: "Allgemeiner Anspruch",
        claim_type: "allgemeiner Anspruch",
        law: "Art. 127 OR (CH)",
        start_date: "2026-03-01",
        period_years: 10,
      });

      expect(sol.regular_barred_date).toBe("2036-03-01");
      expect(sol.absolute_barred_date).toBeUndefined();
    });
  });

  describe("addInterruption", () => {
    it("extends effective barred date by interruption duration", () => {
      const base = createStatuteOfLimitations({
        claim_label: "Test",
        claim_type: "Test",
        law: "§ 195 BGB (DE)",
        start_date: "2026-01-01",
        period_years: 3,
        max_period_years: 10,
      });

      const withInterruption = addInterruption(base, {
        at: "2026-01-01",
        reason: "Verhandlungen über Schadensersatz",
        kind: "negotiation",
        actor: "RA Müller",
      });

      // The interruption extends from 2026-01-01 to today (ongoing)
      // So effective_barred_date should be later than regular_barred_date
      expect(withInterruption.effective_barred_date).not.toBe(base.regular_barred_date);
      expect(withInterruption.effective_barred_date! > base.regular_barred_date).toBe(true);
      expect(withInterruption.status).toBe("interrupted");
    });

    it("caps at absolute barred date", () => {
      const base: StatuteOfLimitations = {
        id: "sol-test",
        claim_label: "Test",
        claim_type: "Test",
        law: "§ 195 BGB (DE)",
        start_date: "2026-01-01",
        period_years: 3,
        max_period_years: 10,
        regular_barred_date: "2029-01-01",
        absolute_barred_date: "2036-01-01",
        effective_barred_date: "2029-01-01",
        status: "active",
        interruptions: [
          { at: "2010-01-01", reason: "Very long interruption", kind: "negotiation" },
        ],
        suspensions: [],
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      };

      const result = recompute(base);
      // The interruption extends way beyond absolute, so it should be capped
      expect(result.effective_barred_date).toBe("2036-01-01");
    });
  });

  describe("addSuspension", () => {
    it("extends effective barred date by suspension duration", () => {
      const base = createStatuteOfLimitations({
        claim_label: "Test",
        claim_type: "Test",
        law: "§ 195 BGB (DE)",
        start_date: "2026-01-01",
        period_years: 3,
        max_period_years: 10,
      });

      const withSuspension = addSuspension(base, {
        start: "2027-01-01",
        end: "2027-06-01",
        reason: "Beschränkte Haftung (§ 205 BGB)",
      });

      // 5 months = ~151 days extension
      const expectedExtension = 151;
      const baseDate = new Date("2029-01-01T12:00:00Z");
      baseDate.setUTCDate(baseDate.getUTCDate() + expectedExtension);
      const expected = baseDate.toISOString().slice(0, 10);

      expect(withSuspension.effective_barred_date).toBe(expected);
      expect(withSuspension.status).not.toBe("suspended"); // ended suspension
    });

    it("sets status to suspended for ongoing suspension", () => {
      const base = createStatuteOfLimitations({
        claim_label: "Test",
        claim_type: "Test",
        law: "§ 195 BGB (DE)",
        start_date: "2026-01-01",
        period_years: 3,
        max_period_years: 10,
      });

      const withSuspension = addSuspension(base, {
        start: "2027-01-01",
        reason: "Ongoing suspension",
      });

      expect(withSuspension.status).toBe("suspended");
    });
  });

  describe("isBarred", () => {
    it("returns true when check date is past effective barred date", () => {
      const sol = createStatuteOfLimitations({
        claim_label: "Test",
        claim_type: "Test",
        law: "§ 195 BGB (DE)",
        start_date: "2020-01-01",
        period_years: 3,
        max_period_years: 10,
      });

      expect(isBarred(sol, "2024-01-01")).toBe(true);
      expect(isBarred(sol, "2022-12-31")).toBe(false);
    });

    it("uses effective_barred_date when set", () => {
      const sol: StatuteOfLimitations = {
        id: "sol-test",
        claim_label: "Test",
        claim_type: "Test",
        law: "§ 195 BGB (DE)",
        start_date: "2020-01-01",
        period_years: 3,
        regular_barred_date: "2023-01-01",
        effective_barred_date: "2025-01-01",
        status: "interrupted",
        interruptions: [],
        suspensions: [],
        created_at: "2020-01-01T00:00:00Z",
        updated_at: "2020-01-01T00:00:00Z",
      };

      expect(isBarred(sol, "2024-06-01")).toBe(false);
      expect(isBarred(sol, "2025-01-01")).toBe(true);
    });
  });

  describe("daysUntilBarred", () => {
    it("returns positive days when not yet barred", () => {
      const sol = createStatuteOfLimitations({
        claim_label: "Test",
        claim_type: "Test",
        law: "§ 195 BGB (DE)",
        start_date: "2026-01-01",
        period_years: 3,
        max_period_years: 10,
      });

      const days = daysUntilBarred(sol, "2026-06-01");
      expect(days).toBeGreaterThan(0);
      // 2029-01-01 - 2026-06-01 = 945 days (leap year 2028)
      expect(days).toBe(945);
    });

    it("returns negative days when already barred", () => {
      const sol = createStatuteOfLimitations({
        claim_label: "Test",
        claim_type: "Test",
        law: "§ 195 BGB (DE)",
        start_date: "2020-01-01",
        period_years: 3,
        max_period_years: 10,
      });

      const days = daysUntilBarred(sol, "2024-06-01");
      expect(days).toBeLessThan(0);
    });
  });

  describe("VERJAEHRUNG_PRESETS", () => {
    it("includes BGB § 195 (3 years, 10 max)", () => {
      const preset = VERJAEHRUNG_PRESETS.find((p) => p.key === "bgb-195");
      expect(preset).toBeDefined();
      expect(preset!.period_years).toBe(3);
      expect(preset!.max_period_years).toBe(10);
    });

    it("includes ABGB § 1489 (3 years, 30 max)", () => {
      const preset = VERJAEHRUNG_PRESETS.find((p) => p.key === "abgb-1489");
      expect(preset).toBeDefined();
      expect(preset!.period_years).toBe(3);
      expect(preset!.max_period_years).toBe(30);
    });

    it("includes OR Art. 127 (10 years, no max)", () => {
      const preset = VERJAEHRUNG_PRESETS.find((p) => p.key === "or-127");
      expect(preset).toBeDefined();
      expect(preset!.period_years).toBe(10);
      expect(preset!.max_period_years).toBeUndefined();
    });

    it("has at least 6 presets covering DE, AT, CH", () => {
      expect(VERJAEHRUNG_PRESETS.length).toBeGreaterThanOrEqual(6);
      const laws = VERJAEHRUNG_PRESETS.map((p) => p.law);
      expect(laws.some((l) => l.includes("BGB"))).toBe(true);
      expect(laws.some((l) => l.includes("ABGB"))).toBe(true);
      expect(laws.some((l) => l.includes("OR"))).toBe(true);
    });
  });
});
