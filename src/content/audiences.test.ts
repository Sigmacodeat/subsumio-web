import { describe, expect, it } from "vitest";
import { audienceCopy, professionalPricing } from "./audiences";

describe("audience packaging", () => {
  it("routes professional access to the law-firms solution page", () => {
    const copy = audienceCopy();
    expect(copy.professional.href).toBe("/solutions/law-firms");
  });

  it("maps the existing billable ids to Solo and Kanzlei", () => {
    const tiers = professionalPricing().tiers;
    expect(tiers.map((tier) => [tier.id, tier.name])).toEqual([
      ["pro", "Solo"],
      ["team", "Kanzlei"],
      ["ent", "Enterprise"],
    ]);
  });

  it("reserves team capabilities for Kanzlei", () => {
    const [solo, firm] = professionalPricing().tiers;
    expect(solo.features.join(" ")).toContain("Ohne Massen-Ingest");
    expect(firm.features.join(" ")).toContain("Massen-Ingest");
    expect(firm.features.join(" ")).toContain("WhatsApp");
  });

  it("prices in EUR for the Austrian market", () => {
    expect(professionalPricing().tiers[0].price).toBe("249 €");
  });
});
