// Subsumio legal-industry registry.
//
// The former Taxumio profile is preserved in the archive tag documented in
// docs/archive/TAXUMIO_ARCHIVE_MANIFEST.md. The active product is Legal-only.

export interface IndustryTheme {
  primary: string;
  primaryHover: string;
  secondary: string;
  tertiary: string;
  glow: string;
  gradientFrom: string;
  gradientVia: string;
  gradientTo: string;
}

export interface IndustryProfile {
  key: string;
  label: { en: string; de: string };
  brand: string;
  dashboardHref: string;
  marketingHref: string;
  pack: string;
  signature: {
    title: { en: string; de: string };
    proof: { en: string; de: string };
    items: { en: string; de: string }[];
  };
  theme: IndustryTheme;
}

export const SUBSUMIO_THEME: IndustryTheme = {
  primary: "var(--brand-500)",
  primaryHover: "var(--brand-400)",
  secondary: "var(--brand-400)",
  tertiary: "hsl(260, 60%, 65%)",
  glow: "hsla(230, 60%, 52%, 0.12)",
  gradientFrom: "var(--brand-700)",
  gradientVia: "var(--brand-400)",
  gradientTo: "hsl(260, 60%, 65%)",
};

export const INDUSTRY_PROFILES = {
  legal: {
    key: "legal",
    label: { en: "Law firm / legal team", de: "Kanzlei / Rechtsabteilung" },
    brand: "Subsumio",
    dashboardHref: "/dashboard",
    marketingHref: "/",
    pack: "subsumio-legal",
    signature: {
      title: {
        en: "Matter memory with procedural discipline",
        de: "Aktengedächtnis mit Verfahrensdisziplin",
      },
      proof: {
        en: "Cases, deadlines, actors and documents stay connected as a legal graph.",
        de: "Akten, Fristen, Beteiligte und Dokumente bleiben als juristischer Graph verbunden.",
      },
      items: [
        { en: "Case contradictions", de: "Widersprüche in Akten" },
        { en: "Deadline-aware answers", de: "Fristenbewusste Antworten" },
        { en: "Cited drafting context", de: "Zitierter Schriftsatzkontext" },
      ],
    },
    theme: SUBSUMIO_THEME,
  },
} as const satisfies Record<string, IndustryProfile>;

export const INDUSTRY_PACK = {
  legal: INDUSTRY_PROFILES.legal.pack,
} as const;

export type Industry = keyof typeof INDUSTRY_PACK;

export const INDUSTRIES: ReadonlySet<string> = new Set(Object.keys(INDUSTRY_PROFILES));
export const ACTIVE_INDUSTRIES: ReadonlySet<string> = INDUSTRIES;

export function isValidIndustry(industry: string | null | undefined): industry is Industry {
  return !!industry && ACTIVE_INDUSTRIES.has(industry);
}

export function packForIndustry(industry: string | null | undefined): string | null {
  return isValidIndustry(industry) ? INDUSTRY_PACK[industry] : null;
}

export function profileForIndustry(industry: string | null | undefined): IndustryProfile | null {
  return isValidIndustry(industry) ? INDUSTRY_PROFILES[industry] : null;
}

export function themeForIndustry(_industry: string | null | undefined): IndustryTheme {
  return SUBSUMIO_THEME;
}
