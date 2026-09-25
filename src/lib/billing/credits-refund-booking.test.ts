/**
 * A credit booked up front for an answer that never came is taken back —
 * exactly once, never more than was booked, only for the owner who paid.
 * Runs against the in-memory fallback (no PG pool in the test env).
 */
import { describe, it, expect } from "vitest";
import { addCredits, deductCredits, getBalance, refundConsumptionBooking } from "./credits";

describe("refundConsumptionBooking", () => {
  it("restores the balance of a failed booking once", async () => {
    const owner = `refund-owner-${Date.now()}`;
    await addCredits(owner, "user", 5);
    const before = (await getBalance(owner, "user")).balance;
    const booked = await deductCredits(owner, "user", 1, {
      operation: "think",
      idempotencyKey: `think-${owner}`,
    });
    expect(booked.ok).toBe(true);
    expect((await getBalance(owner, "user")).balance).toBe(before - 1);

    const first = await refundConsumptionBooking(owner, "user", `think-${owner}`);
    expect(first.refunded).toBe(1);
    expect((await getBalance(owner, "user")).balance).toBe(before);

    const again = await refundConsumptionBooking(owner, "user", `think-${owner}`);
    expect(again.refunded).toBe(0);
    expect((await getBalance(owner, "user")).balance).toBe(before);
  });

  it("refunds nothing for an unknown booking or another owner's booking", async () => {
    const owner = `refund-a-${Date.now()}`;
    const other = `refund-b-${Date.now()}`;
    await addCredits(owner, "user", 3);
    await addCredits(other, "user", 3);
    await deductCredits(owner, "user", 1, { operation: "think", idempotencyKey: `k-${owner}` });

    expect((await refundConsumptionBooking(owner, "user", "no-such-key")).refunded).toBe(0);
    expect((await refundConsumptionBooking(other, "user", `k-${owner}`)).refunded).toBe(0);
    expect((await getBalance(other, "user")).balance).toBe(3);
  });
});
