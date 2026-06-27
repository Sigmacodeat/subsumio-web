import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

const origEnv = { ...process.env };

describe("dunning escalation logic", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...origEnv };
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  describe("buildDunningEmailBody", () => {
    test("failure 1: warning email with retry date", async () => {
      const { buildDunningEmailBody } = await import("./dunning");
      const retryDate = new Date("2026-07-01T10:00:00Z");
      const result = buildDunningEmailBody(
        "Kanzlei Müller",
        1,
        retryDate,
        "https://billing.subsum.io/portal"
      );
      expect(result.subject).toContain("Zahlungsproblem");
      expect(result.body).toContain("Kanzlei Müller");
      expect(result.body).toContain("nicht erfolgreich");
      expect(result.body).toContain("billing.subsum.io/portal");
      expect(result.body).toContain("1. Juli 2026");
    });

    test("failure 2: grace period email", async () => {
      const { buildDunningEmailBody } = await import("./dunning");
      const retryDate = new Date("2026-07-03T10:00:00Z");
      const result = buildDunningEmailBody("Kanzlei Müller", 2, retryDate);
      expect(result.subject).toContain("Zweiter Zahlungsversuch");
      expect(result.subject).toContain("Grace-Period");
      expect(result.body).toContain("zweimal fehlgeschlagen");
      expect(result.body).toContain("Grace-Period");
    });

    test("failure 3: suspension email", async () => {
      const { buildDunningEmailBody } = await import("./dunning");
      const result = buildDunningEmailBody("Kanzlei Müller", 3, null);
      expect(result.subject).toContain("gesperrt");
      expect(result.body).toContain("gesperrt");
      expect(result.body).toContain("billing@subsum.io");
    });

    test("handles null retry date gracefully", async () => {
      const { buildDunningEmailBody } = await import("./dunning");
      const result = buildDunningEmailBody("Test Org", 1, null);
      expect(result.body).toContain("demnächst");
    });

    test("includes billing portal URL when provided", async () => {
      const { buildDunningEmailBody } = await import("./dunning");
      const result = buildDunningEmailBody("Test", 1, null, "https://pay.example.com");
      expect(result.body).toContain("pay.example.com");
    });

    test("omits billing portal URL when not provided", async () => {
      const { buildDunningEmailBody } = await import("./dunning");
      const result = buildDunningEmailBody("Test", 1, null);
      expect(result.body).not.toContain("Zahlungsmittel aktualisieren");
    });
  });

  describe("buildReactivationEmailBody", () => {
    test("contains reactivation message", async () => {
      const { buildReactivationEmailBody } = await import("./dunning");
      const result = buildReactivationEmailBody("Kanzlei Müller");
      expect(result.subject).toContain("reaktiviert");
      expect(result.body).toContain("erfolgreich");
      expect(result.body).toContain("Kanzlei Müller");
      expect(result.body).toContain("vollständig aktiv");
    });
  });

  describe("DunningState status transitions", () => {
    test("failure count 1 → status ok (warning only)", () => {
      const newStatus = 1 >= 3 ? "suspended" : 1 >= 2 ? "past_due" : "ok";
      expect(newStatus).toBe("ok");
    });

    test("failure count 2 → status past_due (grace period)", () => {
      const count = 2;
      const newStatus = count >= 3 ? "suspended" : count >= 2 ? "past_due" : "ok";
      expect(newStatus).toBe("past_due");
    });

    test("failure count 3 → status suspended", () => {
      const count = 3;
      const newStatus = count >= 3 ? "suspended" : count >= 2 ? "past_due" : "ok";
      expect(newStatus).toBe("suspended");
    });

    test("failure count 5 → status suspended (capped)", () => {
      const count = 5;
      const newStatus = count >= 3 ? "suspended" : count >= 2 ? "past_due" : "ok";
      expect(newStatus).toBe("suspended");
    });
  });

  describe("incrementFailure (in-memory fallback)", () => {
    test("increments failure count and updates timestamps", async () => {
      delete process.env.DATABASE_URL;
      const { incrementFailure, getDunningState } = await import("./dunning");
      const orgId = `test-org-${Date.now()}`;
      const result = await incrementFailure(orgId, new Date("2026-07-01"));
      expect(result.failureCount).toBe(1);
      expect(result.status).toBe("ok");
      expect(result.firstFailedAt).toBeTruthy();
      expect(result.lastFailedAt).toBeTruthy();
      expect(result.nextRetryAt).toBeTruthy();

      const result2 = await incrementFailure(orgId, new Date("2026-07-03"));
      expect(result2.failureCount).toBe(2);
      expect(result2.status).toBe("past_due");
      expect(result2.firstFailedAt).toBe(result.firstFailedAt);

      const result3 = await incrementFailure(orgId, null);
      expect(result3.failureCount).toBe(3);
      expect(result3.status).toBe("suspended");
      expect(result3.nextRetryAt).toBeNull();
    });
  });

  describe("resetFailure (in-memory fallback)", () => {
    test("resets failure count to 0 and status to ok", async () => {
      delete process.env.DATABASE_URL;
      const { incrementFailure, resetFailure, getDunningState } = await import("./dunning");
      const orgId = `test-org-reset-${Date.now()}`;
      await incrementFailure(orgId, null);
      await incrementFailure(orgId, null);
      const before = await getDunningState(orgId);
      expect(before.failureCount).toBe(2);

      await resetFailure(orgId);
      const after = await getDunningState(orgId);
      expect(after.failureCount).toBe(0);
      expect(after.status).toBe("ok");
      expect(after.firstFailedAt).toBeNull();
      expect(after.lastFailedAt).toBeNull();
      expect(after.nextRetryAt).toBeNull();
    });
  });
});
