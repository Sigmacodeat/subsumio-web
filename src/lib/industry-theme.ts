import type { CSSProperties } from "react";
import { themeForIndustry, type IndustryTheme } from "./industry-pack";

export type BrandThemeStyle = CSSProperties & {
  "--brand-primary": string;
  "--brand-primary-hover": string;
  "--brand-secondary": string;
  "--brand-tertiary": string;
  "--brand-glow": string;
  "--brand-gradient-from": string;
  "--brand-gradient-via": string;
  "--brand-gradient-to": string;
};

export function styleForTheme(theme: IndustryTheme): BrandThemeStyle {
  return {
    "--brand-primary": theme.primary,
    "--brand-primary-hover": theme.primaryHover,
    "--brand-secondary": theme.secondary,
    "--brand-tertiary": theme.tertiary,
    "--brand-glow": theme.glow,
    "--brand-gradient-from": theme.gradientFrom,
    "--brand-gradient-via": theme.gradientVia,
    "--brand-gradient-to": theme.gradientTo,
  };
}

export function styleForIndustry(industry: string | null | undefined): BrandThemeStyle {
  return styleForTheme(themeForIndustry(industry));
}
