import { describe, it, expect } from "vitest";
import { HERO_VARIANTS, type HeroVariant } from "./ab-test";

describe("A/B Test Hero Variants", () => {
  it("has exactly 2 variants A and B", () => {
    const keys = Object.keys(HERO_VARIANTS) as HeroVariant[];
    expect(keys).toEqual(["A", "B"]);
  });

  it("every variant has DE and EN with h1a and h1b", () => {
    for (const key of Object.keys(HERO_VARIANTS) as HeroVariant[]) {
      const v = HERO_VARIANTS[key];
      expect(v.de.h1a).toBeTruthy();
      expect(v.de.h1b).toBeTruthy();
      expect(v.en.h1a).toBeTruthy();
      expect(v.en.h1b).toBeTruthy();
    }
  });

  it("variant B is keyword-rich (contains Kanzleisoftware)", () => {
    expect(HERO_VARIANTS.B.de.h1a).toContain("Kanzleisoftware");
  });

  it("variant B EN contains 'AI legal software'", () => {
    expect(HERO_VARIANTS.B.en.h1a).toContain("AI legal software");
  });
});
