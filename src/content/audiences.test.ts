import { describe, expect, it } from "vitest";
import { audienceCopy, professionalPricing } from "./audiences";

describe("audience packaging", () => {
  it("routes professional access to /kanzlei", () => {
    const copy = audienceCopy("de");
    expect(copy.professional.href).toBe("/kanzlei");
  });

  it("maps the existing billable ids to Solo and Kanzlei", () => {
    const tiers = professionalPricing("de").tiers;
    expect(tiers.map((tier) => [tier.id, tier.name])).toEqual([
      ["pro", "Solo"],
      ["team", "Kanzlei"],
      ["ent", "Enterprise"],
    ]);
  });

  it("reserves team capabilities for Kanzlei", () => {
    const [solo, firm] = professionalPricing("de").tiers;
    expect(solo.features.join(" ")).toContain("Ohne Massen-Ingest");
    expect(firm.features.join(" ")).toContain("Massen-Ingest");
    expect(firm.features.join(" ")).toContain("WhatsApp");
  });

  it("uses CHF for the Swiss packages", () => {
    expect(professionalPricing("ch").tiers[0].price).toBe("CHF 249");
  });
});
