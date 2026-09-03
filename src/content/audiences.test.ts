import { describe, expect, it } from "vitest";
import { audienceCopy, privateOffers, professionalPricing } from "./audiences";

describe("audience packaging", () => {
  it("keeps private and professional access on separate routes", () => {
    const copy = audienceCopy("de");
    expect(copy.private.href).toBe("/privat");
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

  it("does not present private access as legal advice", () => {
    const offers = privateOffers("de");
    expect(offers.sub).toContain("kein Ersatz für individuelle Rechtsberatung");
    expect(
      offers.offers.every((offer) => !offer.features.join(" ").includes("Massen-Ingest"))
    ).toBe(true);
  });

  it("uses CHF for the Swiss packages", () => {
    expect(professionalPricing("ch").tiers[0].price).toBe("CHF 249");
    expect(privateOffers("ch").offers[1].price).toBe("CHF 19");
  });
});
