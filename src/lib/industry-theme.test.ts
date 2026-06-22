import { describe, test, expect } from "vitest";
import { styleForTheme, styleForIndustry } from "./industry-theme";
import { SUBSUMIO_THEME, themeForIndustry } from "./industry-pack";

describe("styleForTheme", () => {
  test("maps all theme properties to CSS custom properties", () => {
    const style = styleForTheme(SUBSUMIO_THEME);
    expect(style["--brand-primary"]).toBe(SUBSUMIO_THEME.primary);
    expect(style["--brand-primary-hover"]).toBe(SUBSUMIO_THEME.primaryHover);
    expect(style["--brand-secondary"]).toBe(SUBSUMIO_THEME.secondary);
    expect(style["--brand-tertiary"]).toBe(SUBSUMIO_THEME.tertiary);
    expect(style["--brand-glow"]).toBe(SUBSUMIO_THEME.glow);
    expect(style["--brand-gradient-from"]).toBe(SUBSUMIO_THEME.gradientFrom);
    expect(style["--brand-gradient-via"]).toBe(SUBSUMIO_THEME.gradientVia);
    expect(style["--brand-gradient-to"]).toBe(SUBSUMIO_THEME.gradientTo);
  });

  test("returns object with all 8 CSS custom properties", () => {
    const style = styleForTheme(SUBSUMIO_THEME);
    const keys = Object.keys(style).filter((k) => k.startsWith("--brand-"));
    expect(keys).toHaveLength(8);
  });

  test("works with custom theme", () => {
    const customTheme = {
      primary: "#ff0000",
      primaryHover: "#cc0000",
      secondary: "#00ff00",
      tertiary: "#0000ff",
      glow: "rgba(255,0,0,0.5)",
      gradientFrom: "#ff0000",
      gradientVia: "#00ff00",
      gradientTo: "#0000ff",
    };
    const style = styleForTheme(customTheme);
    expect(style["--brand-primary"]).toBe("#ff0000");
    expect(style["--brand-glow"]).toBe("rgba(255,0,0,0.5)");
  });
});

describe("styleForIndustry", () => {
  test("returns style for legal industry", () => {
    const style = styleForIndustry("legal");
    expect(style["--brand-primary"]).toBeTruthy();
    expect(style["--brand-primary"]).toBe(SUBSUMIO_THEME.primary);
  });

  test("returns default style for null", () => {
    const style = styleForIndustry(null);
    expect(style["--brand-primary"]).toBeTruthy();
  });

  test("returns default style for undefined", () => {
    const style = styleForIndustry(undefined);
    expect(style["--brand-primary"]).toBeTruthy();
  });

  test("returns default style for unknown industry", () => {
    const style = styleForIndustry("nonexistent");
    expect(style["--brand-primary"]).toBeTruthy();
  });

  test("returns same style as styleForTheme(themeForIndustry(x))", () => {
    const style1 = styleForIndustry("legal");
    const style2 = styleForTheme(themeForIndustry("legal"));
    expect(style1).toEqual(style2);
  });
});
