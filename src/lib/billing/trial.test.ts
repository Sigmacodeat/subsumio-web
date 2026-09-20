import { describe, test, expect } from "vitest";
import {
  TRIAL_DAYS,
  TRIAL_PLAN,
  effectivePlan,
  isTrialActive,
  stripeTrialEnd,
  trialDaysLeft,
  trialEndsAtFrom,
} from "./trial";
import { PRICING_FAQ } from "@/content/site";

const start = new Date("2026-09-19T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(start.getTime() + days * DAY);
const trialUser = { plan: "free" as const, trialEndsAt: trialEndsAtFrom(start) };
const END = TRIAL_DAYS;

describe("free trial", () => {
  test("lasts TRIAL_DAYS (30) from signup", () => {
    expect(TRIAL_DAYS).toBe(30);
    expect(Date.parse(trialEndsAtFrom(start)) - start.getTime()).toBe(TRIAL_DAYS * DAY);
  });

  test("runs on the full Kanzlei plan while active", () => {
    expect(isTrialActive(trialUser, at(1))).toBe(true);
    expect(effectivePlan(trialUser, at(END - 0.1))).toBe(TRIAL_PLAN);
    expect(TRIAL_PLAN).toBe("team");
  });

  test("ends by itself: back to the stored plan after the end date", () => {
    expect(isTrialActive(trialUser, at(END))).toBe(false);
    expect(effectivePlan(trialUser, at(END + 6))).toBe("free");
    expect(trialDaysLeft(trialUser, at(END + 6))).toBe(0);
  });

  test("a paid plan always wins over the trial", () => {
    expect(effectivePlan({ plan: "pro", trialEndsAt: trialUser.trialEndsAt }, at(1))).toBe("pro");
  });

  test("accounts without a trial (existing, SSO, SCIM) keep their plan", () => {
    expect(effectivePlan({ plan: "free" }, at(1))).toBe("free");
    expect(effectivePlan({ plan: "free", trialEndsAt: null }, at(1))).toBe("free");
    expect(effectivePlan({ plan: "free", trialEndsAt: "not-a-date" }, at(1))).toBe("free");
  });

  test("counts remaining days rounded up", () => {
    expect(trialDaysLeft(trialUser, start)).toBe(END);
    expect(trialDaysLeft(trialUser, at(END - 0.5))).toBe(1);
  });

  test("buying during the trial starts billing at trial end", () => {
    expect(stripeTrialEnd(trialUser, at(3))).toBe(
      Math.floor(Date.parse(trialUser.trialEndsAt) / 1000)
    );
  });

  test("no Stripe trial when less than 48 hours are left or none is active", () => {
    expect(stripeTrialEnd(trialUser, at(END - 1.5))).toBeNull();
    expect(stripeTrialEnd(trialUser, at(END + 1))).toBeNull();
    expect(stripeTrialEnd({ plan: "pro", trialEndsAt: trialUser.trialEndsAt }, at(1))).toBeNull();
  });

  test("matches what the pricing FAQ promises", () => {
    const promise = PRICING_FAQ.items.map((i) => i.a).join(" ");
    expect(promise).toContain(`${TRIAL_DAYS} Tage`);
    expect(promise).toContain("ohne Kreditkarte");
  });
});
