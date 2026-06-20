/**
 * Guards the legal industry → brain link. Subsumio is legal-only:
 * the signup industry must be valid and map to the gbrain-legal schema pack.
 */
import { describe, test, expect } from "bun:test";
import {
  INDUSTRY_PACK,
  INDUSTRIES,
  INDUSTRY_PROFILES,
  isValidIndustry,
  packForIndustry,
  profileForIndustry,
  themeForIndustry,
} from "./industry-pack";

describe("industry-pack", () => {
  test("legal is accepted and maps to the gbrain-legal pack", () => {
    expect(isValidIndustry("legal")).toBe(true);
    expect(packForIndustry("legal")).toBe("gbrain-legal");
  });

  test("'other' is valid but has no vertical pack", () => {
    expect(isValidIndustry("other")).toBe(true);
    expect(packForIndustry("other")).toBeNull();
  });

  test("unknown / empty → invalid, null pack", () => {
    expect(isValidIndustry("tax")).toBe(false);
    expect(isValidIndustry("banking")).toBe(false);
    expect(isValidIndustry(null)).toBe(false);
    expect(isValidIndustry(undefined)).toBe(false);
    expect(packForIndustry(null)).toBeNull();
    expect(packForIndustry("banking")).toBeNull();
  });

  test("INDUSTRIES = mapped verticals + 'other'", () => {
    expect(INDUSTRIES.size).toBe(Object.keys(INDUSTRY_PACK).length + 1);
    expect(INDUSTRIES.has("other")).toBe(true);
    expect(INDUSTRIES.has("legal")).toBe(true);
  });

  test("legal has complete brand profile and theme", () => {
    const profile = profileForIndustry("legal");
    expect(profile).toBeTruthy();
    expect(profile?.brand).toBe("Subsumio");
    expect(profile?.dashboardHref).toBe("/dashboard");
    expect(profile?.marketingHref.startsWith("/")).toBe(true);
    expect(profile?.pack).toBe("gbrain-legal");
    const theme = themeForIndustry("legal");
    expect(theme.primary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(theme.secondary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(theme.gradientFrom).toMatch(/^#[0-9a-f]{6}$/i);
    expect(theme.gradientVia).toMatch(/^#[0-9a-f]{6}$/i);
    expect(theme.gradientTo).toMatch(/^#[0-9a-f]{6}$/i);
    expect(Object.keys(INDUSTRY_PROFILES)).toEqual(Object.keys(INDUSTRY_PACK));
  });
});
