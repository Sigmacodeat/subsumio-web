// industry-pack — Subsumio multi-industry registry.
//
// Maps each industry (legal, tax, …) to its schema pack that configures the
// tenant brain for that vertical (page types, link verbs, calibration).
// To add a new industry: add it to INDUSTRY_PROFILES with its own theme,
// brand, signature, and pack name. The rest of the system (sidebar,
// quick-create, onboarding, admin) reads from this registry.

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

export const TAX_THEME: IndustryTheme = {
  primary: "#047857",
  primaryHover: "#059669",
  secondary: "#10b981",
  tertiary: "#14b8a6",
  glow: "rgba(4, 120, 87, 0.12)",
  gradientFrom: "#047857",
  gradientVia: "#10b981",
  gradientTo: "#14b8a6",
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
  tax: {
    key: "tax",
    label: { en: "Tax advisory / accounting", de: "Steuerberatung / Buchhaltung" },
    brand: "Subsumio Tax",
    dashboardHref: "/dashboard",
    marketingHref: "/tax",
    pack: "subsumio-tax",
    signature: {
      title: {
        en: "Client memory with tax deadline discipline",
        de: "Mandantengedaechtnis mit Steuerfristen-Disziplin",
      },
      proof: {
        en: "Tax returns, assessments, deadlines and documents stay connected as a financial graph.",
        de: "Steuererklaerungen, Bescheide, Fristen und Dokumente bleiben als Finanz-Graph verbunden.",
      },
      items: [
        { en: "Tax deadline contradictions", de: "Widersprueche in Steuerfristen" },
        { en: "AO-aware deadline answers", de: "AO-bewusste Fristenantworten" },
        { en: "Cited assessment context", de: "Zitierter Bescheidkontext" },
      ],
    },
    theme: TAX_THEME,
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
