/**
 * Guards the industry → brain link. Subsumio supports multiple industries:
 * each signup industry must be valid and map to its schema pack.
 */
import { describe, test, expect } from "vitest";
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
  test("legal is accepted and maps to the subsumio-legal pack", () => {
    expect(isValidIndustry("legal")).toBe(true);
    expect(packForIndustry("legal")).toBe("subsumio-legal");
  });

  test("tax is accepted and maps to the subsumio-tax pack", () => {
    expect(isValidIndustry("tax")).toBe(true);
    expect(packForIndustry("tax")).toBe("subsumio-tax");
  });

  test("'other' is valid but has no vertical pack", () => {
    expect(isValidIndustry("other")).toBe(true);
    expect(packForIndustry("other")).toBeNull();
  });

  test("unknown / empty → invalid, null pack", () => {
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
    expect(INDUSTRIES.has("tax")).toBe(true);
  });

  test("legal has complete brand profile and theme", () => {
    const profile = profileForIndustry("legal");
    expect(profile).toBeTruthy();
    expect(profile?.brand).toBe("Subsumio");
    expect(profile?.dashboardHref).toBe("/dashboard");
    expect(profile?.marketingHref.startsWith("/")).toBe(true);
    expect(profile?.pack).toBe("subsumio-legal");
    const theme = themeForIndustry("legal");
    expect(theme.primary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(theme.secondary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(theme.gradientFrom).toMatch(/^#[0-9a-f]{6}$/i);
    expect(theme.gradientVia).toMatch(/^#[0-9a-f]{6}$/i);
    expect(theme.gradientTo).toMatch(/^#[0-9a-f]{6}$/i);
    expect(Object.keys(INDUSTRY_PROFILES)).toEqual(Object.keys(INDUSTRY_PACK));
  });

  test("tax has complete brand profile and theme", () => {
    const profile = profileForIndustry("tax");
    expect(profile).toBeTruthy();
    expect(profile?.brand).toBe("Subsumio Tax");
    expect(profile?.dashboardHref).toBe("/dashboard");
    expect(profile?.marketingHref.startsWith("/")).toBe(true);
    expect(profile?.pack).toBe("subsumio-tax");
    const theme = themeForIndustry("tax");
    expect(theme.primary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(theme.secondary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(theme.gradientFrom).toMatch(/^#[0-9a-f]{6}$/i);
    expect(theme.gradientVia).toMatch(/^#[0-9a-f]{6}$/i);
    expect(theme.gradientTo).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test("tax theme differs from legal theme", () => {
    const legalTheme = themeForIndustry("legal");
    const taxTheme = themeForIndustry("tax");
    expect(legalTheme.primary).not.toBe(taxTheme.primary);
    expect(legalTheme.gradientFrom).not.toBe(taxTheme.gradientFrom);
  });
});
