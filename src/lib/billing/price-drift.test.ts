// Every price a visitor reads must be the price Stripe charges.
// BILLABLE_PLANS (src/lib/billing/plans.ts) is the source; marketing copy,
// FAQ, pricing-page metadata and the in-app display are checked against it.
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { BILLABLE_PLANS, BILLING_PLANS_DISPLAY } from "./plans";
import { professionalPricing } from "@/content/audiences";
import { PRICING_FAQ, LANDING } from "@/content/site";

const eur = (n: number) => `${n.toLocaleString("de-AT").replace(/\s/g, ".")} €`;
const solo = eur(BILLABLE_PLANS.pro.monthlyEur);
const kanzlei = eur(BILLABLE_PLANS.team.monthlyEur);

describe("marketing prices match the billing source", () => {
  test("formats like the copy (1.499 €)", () => {
    expect(kanzlei).toBe("1.499 €");
  });

  test("pricing tiers", () => {
    const tiers = professionalPricing().tiers;
    expect(tiers.find((t) => t.id === "pro")?.price).toBe(solo);
    expect(tiers.find((t) => t.id === "team")?.price).toBe(kanzlei);
  });

  test("in-app billing display", () => {
    expect(BILLING_PLANS_DISPLAY.find((p) => p.id === "pro")?.price).toContain(solo);
    expect(BILLING_PLANS_DISPLAY.find((p) => p.id === "team")?.price).toContain(kanzlei);
  });

  test("every euro amount in the FAQs is a real plan price", () => {
    const allowed = new Set([solo, kanzlei]);
    const text = JSON.stringify([PRICING_FAQ, LANDING]);
    const amounts = text.match(/\d{1,3}(?:\.\d{3})* €/g) ?? [];
    for (const a of amounts.filter((x) => /^(\d{3}|\d\.\d{3}) €$/.test(x))) {
      expect(allowed, `unknown price "${a}" in site copy`).toContain(a);
    }
  });

  test("pricing page metadata", () => {
    const src = readFileSync(path.join(process.cwd(), "src/app/at/pricing/page.tsx"), "utf8");
    expect(src).toContain(`Solo ${BILLABLE_PLANS.pro.monthlyEur} €`);
    expect(src).toContain(`Kanzlei ${kanzlei}`);
  });
});

describe("trial length in the copy matches the trial the product grants", () => {
  test("every 'N Tage testen/kostenlos/gratis' on the site says TRIAL_DAYS", async () => {
    const { execFileSync } = await import("node:child_process");
    const { TRIAL_DAYS } = await import("./trial");
    const out = execFileSync(
      "grep",
      ["-rnoE", '[0-9]+[ -]Tage?[^"`]{0,40}(testen|kostenlos|gratis|Testversion|Testphase)', "src"],
      { cwd: process.cwd(), encoding: "utf8" }
    );
    const hits = out
      .split("\n")
      .filter((l) => l && !l.includes(".test.") && !/Rekurs|Frist/.test(l));
    expect(hits.length).toBeGreaterThan(10);
    for (const line of hits) {
      const days = Number(
        line
          .split(":")
          .slice(2)
          .join(":")
          .match(/^(\d+)/)?.[1]
      );
      expect(days, line).toBe(TRIAL_DAYS);
    }
  });
});
