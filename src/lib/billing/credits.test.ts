import { describe, it, expect } from "vitest";
import {
  CREDIT_COSTS,
  CREDIT_PACKS,
  getCreditPack,
  creditPackByPriceId,
  addCredits,
  deductCredits,
  getBalance,
  checkCredits,
  getTransactions,
  getCaseUsage,
  setAutoReload,
  caseUsageToCsv,
  insufficientCreditsResponse,
} from "./credits";

// These tests run against the in-memory fallback (no PG pool in test env)
describe("Credit System", () => {
  const ownerId = "test-user-1";
  const ownerType = "user" as const;

  // ── Credit Costs ────────────────────────────────────────────────────

  describe("CREDIT_COSTS", () => {
    it("has correct costs for each operation", () => {
      expect(CREDIT_COSTS.think).toBe(1);
      expect(CREDIT_COSTS.document_analysis).toBe(2);
      expect(CREDIT_COSTS.subsumption).toBe(3);
      expect(CREDIT_COSTS.agent).toBe(5);
      expect(CREDIT_COSTS.deadline_detect).toBe(1);
      expect(CREDIT_COSTS.frist_engine).toBe(0);
    });

    it("all costs are non-negative", () => {
      for (const [, cost] of Object.entries(CREDIT_COSTS)) {
        expect(cost).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ── Credit Packs ────────────────────────────────────────────────────

  describe("CREDIT_PACKS", () => {
    it("has 4 packs", () => {
      expect(CREDIT_PACKS.length).toBe(4);
    });

    it("packs have increasing credits and savings", () => {
      for (let i = 1; i < CREDIT_PACKS.length; i++) {
        expect(CREDIT_PACKS[i].credits).toBeGreaterThan(CREDIT_PACKS[i - 1].credits);
        expect(CREDIT_PACKS[i].savingsPct).toBeGreaterThanOrEqual(CREDIT_PACKS[i - 1].savingsPct);
      }
    });

    it("getCreditPack returns pack by id", () => {
      const pack = getCreditPack("starter");
      expect(pack).toBeDefined();
      expect(pack?.credits).toBe(50);
    });

    it("getCreditPack returns undefined for unknown id", () => {
      expect(getCreditPack("nonexistent")).toBeUndefined();
    });

    it("creditPackByPriceId returns undefined when env not set", () => {
      expect(creditPackByPriceId("price_unknown")).toBeUndefined();
    });
  });

  // ── Balance ─────────────────────────────────────────────────────────

  describe("getBalance", () => {
    it("returns zero balance for new user", async () => {
      const balance = await getBalance("new-user-balance", "user");
      expect(balance.balance).toBe(0);
      expect(balance.ownerType).toBe("user");
      expect(balance.autoReloadEnabled).toBe(false);
    });

    it("returns zero balance for new org", async () => {
      const balance = await getBalance("new-org-balance", "org");
      expect(balance.balance).toBe(0);
      expect(balance.ownerType).toBe("org");
    });
  });

  // ── Add Credits ─────────────────────────────────────────────────────

  describe("addCredits", () => {
    it("adds credits to a new account", async () => {
      const result = await addCredits("add-test-1", "user", 100, {
        type: "purchase",
        description: "Test purchase",
      });
      expect(result.balance).toBe(100);
    });

    it("accumulates credits on repeated adds", async () => {
      await addCredits("add-test-2", "user", 50);
      const result = await addCredits("add-test-2", "user", 50);
      expect(result.balance).toBe(100);
    });

    it("supports grant type", async () => {
      const result = await addCredits("add-test-3", "user", 25, {
        type: "grant",
        description: "Welcome bonus",
      });
      expect(result.balance).toBe(25);
    });

    it("supports refund type", async () => {
      await addCredits("add-test-4", "user", 100);
      const result = await addCredits("add-test-4", "user", 30, {
        type: "refund",
        description: "Failed query refund",
      });
      expect(result.balance).toBe(130);
    });
  });

  // ── Deduct Credits ──────────────────────────────────────────────────

  describe("deductCredits", () => {
    it("deducts credits when balance is sufficient", async () => {
      await addCredits("deduct-test-1", "user", 100);
      const result = await deductCredits("deduct-test-1", "user", 3, {
        operation: "subsumption",
      });
      expect(result.ok).toBe(true);
      expect(result.balance).toBe(97);
    });

    it("fails when balance is insufficient", async () => {
      await addCredits("deduct-test-2", "user", 5);
      const result = await deductCredits("deduct-test-2", "user", 10);
      expect(result.ok).toBe(false);
      expect(result.balance).toBe(5);
      expect(result.required).toBe(10);
    });

    it("fails when balance is zero", async () => {
      const result = await deductCredits("deduct-test-3", "user", 1);
      expect(result.ok).toBe(false);
      expect(result.balance).toBe(0);
    });

    it("deducts exact balance", async () => {
      await addCredits("deduct-test-4", "user", 50);
      const result = await deductCredits("deduct-test-4", "user", 50);
      expect(result.ok).toBe(true);
      expect(result.balance).toBe(0);
    });

    it("handles zero-cost operations (frist_engine)", async () => {
      await addCredits("deduct-test-5", "user", 10);
      const result = await deductCredits("deduct-test-5", "user", 0, {
        operation: "frist_engine",
      });
      expect(result.ok).toBe(true);
    });

    it("records case_slug for Mandanten-Abrechnung", async () => {
      await addCredits("deduct-test-6", "user", 100);
      await deductCredits("deduct-test-6", "user", 5, {
        operation: "agent",
        caseSlug: "mueller-gegen-huber",
      });
      const usage = await getCaseUsage("deduct-test-6", "user");
      expect(usage.length).toBe(1);
      expect(usage[0].caseSlug).toBe("mueller-gegen-huber");
      expect(usage[0].totalCredits).toBe(5);
      expect(usage[0].queryCount).toBe(1);
    });
  });

  // ── Check Credits ───────────────────────────────────────────────────

  describe("checkCredits", () => {
    it("returns ok when balance is sufficient", async () => {
      await addCredits("check-test-1", "user", 100);
      const result = await checkCredits("check-test-1", "user", 5);
      expect(result.ok).toBe(true);
      expect(result.balance).toBe(100);
    });

    it("returns not ok when balance is insufficient", async () => {
      await addCredits("check-test-2", "user", 3);
      const result = await checkCredits("check-test-2", "user", 5);
      expect(result.ok).toBe(false);
      expect(result.balance).toBe(3);
    });

    it("returns ok for zero requirement", async () => {
      const result = await checkCredits("check-test-3", "user", 0);
      expect(result.ok).toBe(true);
    });
  });

  // ── Transactions ────────────────────────────────────────────────────

  describe("getTransactions", () => {
    it("returns transactions in descending order", async () => {
      await addCredits("tx-test-1", "user", 100, { description: "Purchase" });
      await deductCredits("tx-test-1", "user", 3, { operation: "think" });
      await deductCredits("tx-test-1", "user", 5, { operation: "agent" });

      const txs = await getTransactions("tx-test-1", "user");
      expect(txs.length).toBe(3);
      expect(txs[0].type).toBe("consumption");
      expect(txs[0].amount).toBe(-5);
      expect(txs[1].type).toBe("consumption");
      expect(txs[1].amount).toBe(-3);
      expect(txs[2].type).toBe("purchase");
      expect(txs[2].amount).toBe(100);
    });

    it("respects limit and offset", async () => {
      for (let i = 0; i < 5; i++) {
        await addCredits("tx-test-2", "user", 10);
      }
      const page1 = await getTransactions("tx-test-2", "user", { limit: 2, offset: 0 });
      const page2 = await getTransactions("tx-test-2", "user", { limit: 2, offset: 2 });
      expect(page1.length).toBe(2);
      expect(page2.length).toBe(2);
    });
  });

  // ── Case Usage ──────────────────────────────────────────────────────

  describe("getCaseUsage", () => {
    it("aggregates usage per case slug", async () => {
      await addCredits("case-test-1", "user", 1000);
      await deductCredits("case-test-1", "user", 5, { operation: "agent", caseSlug: "case-a" });
      await deductCredits("case-test-1", "user", 3, {
        operation: "subsumption",
        caseSlug: "case-a",
      });
      await deductCredits("case-test-1", "user", 1, { operation: "think", caseSlug: "case-b" });

      const usage = await getCaseUsage("case-test-1", "user");
      expect(usage.length).toBe(2);
      expect(usage[0].caseSlug).toBe("case-a");
      expect(usage[0].totalCredits).toBe(8);
      expect(usage[0].queryCount).toBe(2);
      expect(usage[1].caseSlug).toBe("case-b");
      expect(usage[1].totalCredits).toBe(1);
    });

    it("excludes transactions without case_slug", async () => {
      await addCredits("case-test-2", "user", 100);
      await deductCredits("case-test-2", "user", 5, { operation: "agent" });
      await deductCredits("case-test-2", "user", 3, { operation: "think", caseSlug: "case-x" });

      const usage = await getCaseUsage("case-test-2", "user");
      expect(usage.length).toBe(1);
      expect(usage[0].caseSlug).toBe("case-x");
    });
  });

  // ── Auto-Reload ─────────────────────────────────────────────────────

  describe("setAutoReload", () => {
    it("enables auto-reload with threshold and pack", async () => {
      await setAutoReload("auto-test-1", "user", {
        enabled: true,
        threshold: 15,
        packId: "standard",
      });
      const balance = await getBalance("auto-test-1", "user");
      expect(balance.autoReloadEnabled).toBe(true);
      expect(balance.autoReloadThreshold).toBe(15);
      expect(balance.autoReloadPackId).toBe("standard");
    });

    it("disables auto-reload", async () => {
      await setAutoReload("auto-test-2", "user", { enabled: true });
      await setAutoReload("auto-test-2", "user", { enabled: false });
      const balance = await getBalance("auto-test-2", "user");
      expect(balance.autoReloadEnabled).toBe(false);
    });
  });

  // ── CSV Export ──────────────────────────────────────────────────────

  describe("caseUsageToCsv", () => {
    it("generates valid CSV", () => {
      const rows = [
        { caseSlug: "case-a", totalCredits: 15, queryCount: 5, lastUsed: "2026-07-18T10:00:00Z" },
        { caseSlug: "case-b", totalCredits: 3, queryCount: 1, lastUsed: "2026-07-17T14:00:00Z" },
      ];
      const csv = caseUsageToCsv(rows);
      expect(csv).toContain("Akte (Slug)");
      expect(csv).toContain("Credits (EUR)");
      expect(csv).toContain("case-a");
      expect(csv).toContain("15");
      expect(csv).toContain("case-b");
      expect(csv.split("\n").length).toBe(3);
    });
  });

  // ── Insufficient Credits Response ───────────────────────────────────

  describe("insufficientCreditsResponse", () => {
    it("returns 402 with balance and required", async () => {
      const response = insufficientCreditsResponse(3, 5);
      expect(response.status).toBe(402);
      const body = await response.json();
      expect(body.error).toBe("insufficient_credits");
      expect(body.balance).toBe(3);
      expect(body.required).toBe(5);
    });
  });
});
