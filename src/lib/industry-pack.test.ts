import { describe, test, expect } from "vitest";
import {
  ACTIVE_INDUSTRIES,
  INDUSTRIES,
  INDUSTRY_PACK,
  INDUSTRY_PROFILES,
  isValidIndustry,
  packForIndustry,
  profileForIndustry,
  themeForIndustry,
} from "./industry-pack";

describe("industry-pack", () => {
  test("only Legal is active and maps to the canonical pack", () => {
    expect([...ACTIVE_INDUSTRIES]).toEqual(["legal"]);
    expect([...INDUSTRIES]).toEqual(["legal"]);
    expect(Object.keys(INDUSTRY_PACK)).toEqual(["legal"]);
    expect(isValidIndustry("legal")).toBe(true);
    expect(packForIndustry("legal")).toBe("subsumio-legal");
  });

  test("archived and unknown industries are rejected", () => {
    expect(isValidIndustry("tax")).toBe(false);
    expect(isValidIndustry("other")).toBe(false);
    expect(isValidIndustry(null)).toBe(false);
    expect(isValidIndustry(undefined)).toBe(false);
    expect(packForIndustry("tax")).toBeNull();
    expect(profileForIndustry("tax")).toBeNull();
  });

  test("Legal has the complete Subsumio profile and token-based theme", () => {
    const profile = profileForIndustry("legal");
    expect(profile).toBeTruthy();
    expect(profile?.brand).toBe("Subsumio");
    expect(profile?.dashboardHref).toBe("/dashboard");
    expect(profile?.marketingHref).toBe("/");
    expect(profile?.pack).toBe("subsumio-legal");
    expect(Object.keys(INDUSTRY_PROFILES)).toEqual(["legal"]);

    const theme = themeForIndustry("legal");
    expect(theme.primary).toBe("var(--brand-500)");
    expect(theme.secondary).toBe("var(--brand-400)");
    expect(theme.gradientFrom).toBe("var(--brand-700)");
  });

  test("unknown legacy metadata falls back to the Subsumio theme", () => {
    expect(themeForIndustry("tax")).toEqual(themeForIndustry("legal"));
  });
});
