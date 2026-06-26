// industry-pack — Subsumio legal only.
//
// Maps the legal industry to the subsumio schema pack that configures the
// tenant brain for the legal vertical (page types, link verbs, calibration).

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
  pack: string | null;
  signature: {
    title: { en: string; de: string };
    proof: { en: string; de: string };
    items: { en: string; de: string }[];
  };
  theme: IndustryTheme;
}

export const SUBSUMIO_THEME: IndustryTheme = {
  primary: "#1e40af",
  primaryHover: "#2563eb",
  secondary: "#3b82f6",
  tertiary: "#6366f1",
  glow: "rgba(30, 64, 175, 0.12)",
  gradientFrom: "#1e40af",
  gradientVia: "#3b82f6",
  gradientTo: "#6366f1",
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
        de: "Aktegedaechtnis mit Verfahrensdisziplin",
      },
      proof: {
        en: "Cases, deadlines, actors and documents stay connected as a legal graph.",
        de: "Akten, Fristen, Beteiligte und Dokumente bleiben als juristischer Graph verbunden.",
      },
      items: [
        { en: "Case contradictions", de: "Widersprueche in Akten" },
        { en: "Deadline-aware answers", de: "Fristenbewusste Antworten" },
        { en: "Cited drafting context", de: "Zitierter Schriftsatzkontext" },
      ],
    },
    theme: SUBSUMIO_THEME,
  },
} as const satisfies Record<string, IndustryProfile>;

export const INDUSTRY_PACK = Object.fromEntries(
  Object.entries(INDUSTRY_PROFILES).map(([key, profile]) => [key, profile.pack])
) as { [K in keyof typeof INDUSTRY_PROFILES]: NonNullable<(typeof INDUSTRY_PROFILES)[K]["pack"]> };

export type Industry = keyof typeof INDUSTRY_PACK;

export const INDUSTRIES: ReadonlySet<string> = new Set([
  ...Object.keys(INDUSTRY_PROFILES),
  "other",
]);

export function isValidIndustry(industry: string | null | undefined): boolean {
  return !!industry && INDUSTRIES.has(industry);
}

export function packForIndustry(industry: string | null | undefined): string | null {
  if (!industry) return null;
  return (INDUSTRY_PACK as Record<string, string>)[industry] ?? null;
}

export function profileForIndustry(industry: string | null | undefined): IndustryProfile | null {
  if (!industry || industry === "other") return null;
  return (INDUSTRY_PROFILES as Record<string, IndustryProfile>)[industry] ?? null;
}

export function themeForIndustry(industry: string | null | undefined): IndustryTheme {
  return profileForIndustry(industry)?.theme ?? SUBSUMIO_THEME;
}
