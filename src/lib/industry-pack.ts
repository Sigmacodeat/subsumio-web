// industry-pack — the link between a branch landing page and the brain that
// gets provisioned for that branch.
//
// Each branch page (/subsumio, /taxumio, /compliance, /insurance, /realestate,
// /vc, /consulting, /recruiting) deep-links to /signup?industry=<key>. This
// module is the SINGLE SOURCE that (a) validates which industry keys are
// accepted and (b) maps each to the gbrain schema pack that configures the
// tenant's brain for that vertical (page types, link verbs, calibration).
//
// Provisioning (signup → engine brain) should call packForIndustry(user.industry)
// and apply the returned pack to the new tenant's source via the engine
// (`gbrain onboard` / schema-pack apply). Until the engine + provisioning path
// are live this is a no-op lookup; wiring it here means the mapping is correct
// and ready the moment provisioning runs.

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

export const SIGMABRAIN_THEME: IndustryTheme = {
  primary: "#2f6bff",
  primaryHover: "#4f80ff",
  secondary: "#20d3c2",
  tertiary: "#8b5cf6",
  glow: "rgba(47, 107, 255, 0.24)",
  gradientFrom: "#20d3c2",
  gradientVia: "#2f6bff",
  gradientTo: "#8b5cf6",
};

/** Single source for signup, marketing, pricing, dashboard, and schema-pack routing. */
export const INDUSTRY_PROFILES = {
  legal: {
    key: "legal",
    label: { en: "Law firm / legal team", de: "Kanzlei / Rechtsabteilung" },
    brand: "Subsumio",
    dashboardHref: "/dashboard",
    marketingHref: "/subsumio",
    pack: "gbrain-legal",
    signature: {
      title: { en: "Matter memory with procedural discipline", de: "Aktegedächtnis mit Verfahrensdisziplin" },
      proof: { en: "Cases, deadlines, actors and documents stay connected as a legal graph.", de: "Akten, Fristen, Beteiligte und Dokumente bleiben als juristischer Graph verbunden." },
      items: [
        { en: "Case contradictions", de: "Widersprüche in Akten" },
        { en: "Deadline-aware answers", de: "Fristenbewusste Antworten" },
        { en: "Cited drafting context", de: "Zitierter Schriftsatzkontext" },
      ],
    },
    // Premium legal palette: royal blue (trust) + teal (success/clarity).
    // Teal (#14b8a6) sits between blue and green — it brings growth/success
    // energy without kitsch, and pairs elegantly with navy on dark surfaces.
    // Used by Stripe, Wise, and modern fintech for exactly this reason.
    theme: {
      primary: "#1d4ed8",
      primaryHover: "#2563eb",
      secondary: "#14b8a6",
      tertiary: "#0ea5e9",
      glow: "rgba(20, 184, 166, 0.24)",
      gradientFrom: "#14b8a6",
      gradientVia: "#1d4ed8",
      gradientTo: "#0f172a",
    },
  },
  tax: {
    key: "tax",
    label: { en: "Tax & accounting", de: "Steuerberatung & WP" },
    brand: "Taxumio",
    dashboardHref: "/dashboard/tax",
    marketingHref: "/taxumio",
    pack: "gbrain-tax",
    signature: {
      title: { en: "Advisory memory beside DATEV", de: "Beratungsgedächtnis neben DATEV" },
      proof: { en: "Client rationale, filing deadlines and invoices become one explainable history.", de: "Gestaltungsgründe, Fristen und Rechnungen werden eine erklärbare Historie." },
      items: [
        { en: "Client rationale", de: "Mandanten-Begründung" },
        { en: "Filing deadlines", de: "Bescheid- und Abgabefristen" },
        { en: "GoBD-ready context", de: "GoBD-fähiger Kontext" },
      ],
    },
    theme: {
      primary: "#059669",
      primaryHover: "#10b981",
      secondary: "#84cc16",
      tertiary: "#22d3ee",
      glow: "rgba(5, 150, 105, 0.24)",
      gradientFrom: "#84cc16",
      gradientVia: "#059669",
      gradientTo: "#22d3ee",
    },
  },
  compliance: {
    key: "compliance",
    label: { en: "Compliance / GRC", de: "Compliance / GRC" },
    brand: "Compliumio",
    dashboardHref: "/dashboard/compliance",
    marketingHref: "/compliance",
    pack: "gbrain-compliance",
    signature: {
      title: { en: "Evidence trails, not checkbox theatre", de: "Nachweisspuren statt Häkchen-Theater" },
      proof: { en: "Obligations, controls, policies and incidents stay audit-ready.", de: "Pflichten, Kontrollen, Richtlinien und Vorfälle bleiben prüfbar." },
      items: [
        { en: "Control effectiveness", de: "Kontrollwirksamkeit" },
        { en: "EU AI Act inventory", de: "EU-AI-Act-Inventar" },
        { en: "AML/GDPR evidence", de: "AML/DSGVO-Nachweise" },
      ],
    },
    theme: {
      primary: "#d97706",
      primaryHover: "#f59e0b",
      secondary: "#2563eb",
      tertiary: "#fbbf24",
      glow: "rgba(217, 119, 6, 0.22)",
      gradientFrom: "#fbbf24",
      gradientVia: "#d97706",
      gradientTo: "#2563eb",
    },
  },
  insurance: {
    key: "insurance",
    label: { en: "Insurance", de: "Versicherung" },
    brand: "Versumio",
    dashboardHref: "/dashboard/insurance",
    marketingHref: "/insurance",
    pack: "gbrain-insurance",
    signature: {
      title: { en: "Coverage memory for every renewal", de: "Deckungsgedächtnis für jede Verlängerung" },
      proof: { en: "Policies, claims, carriers and promises connect before the client call.", de: "Policen, Schäden, Versicherer und Zusagen verbinden sich vor dem Kundentermin." },
      items: [
        { en: "Renewal radar", de: "Renewal-Radar" },
        { en: "Coverage gaps", de: "Deckungslücken" },
        { en: "Claims history", de: "Schadenhistorie" },
      ],
    },
    theme: {
      primary: "#0284c7",
      primaryHover: "#0ea5e9",
      secondary: "#22d3ee",
      tertiary: "#2f6bff",
      glow: "rgba(14, 165, 233, 0.24)",
      gradientFrom: "#22d3ee",
      gradientVia: "#0284c7",
      gradientTo: "#2f6bff",
    },
  },
  realestate: {
    key: "realestate",
    label: { en: "Real estate / property", de: "Immobilien / Property" },
    brand: "Immumio",
    dashboardHref: "/dashboard/realestate",
    marketingHref: "/realestate",
    pack: "gbrain-realestate",
    signature: {
      title: { en: "Lease intelligence for every asset", de: "Mietvertragsintelligenz für jedes Objekt" },
      proof: { en: "Properties, units, leases and tenants stay queryable across the portfolio.", de: "Objekte, Einheiten, Mietverträge und Mieter bleiben portfolioübergreifend abfragbar." },
      items: [
        { en: "Lease clauses", de: "Mietvertragsklauseln" },
        { en: "Break options", de: "Break-Optionen" },
        { en: "Portfolio context", de: "Portfoliokontext" },
      ],
    },
    theme: {
      primary: "#0f766e",
      primaryHover: "#14b8a6",
      secondary: "#34d399",
      tertiary: "#64748b",
      glow: "rgba(20, 184, 166, 0.22)",
      gradientFrom: "#34d399",
      gradientVia: "#0f766e",
      gradientTo: "#64748b",
    },
  },
  vc: {
    key: "vc",
    label: { en: "VC / Private Equity", de: "VC / Private Equity" },
    brand: "Investumio",
    dashboardHref: "/dashboard/vc",
    marketingHref: "/vc",
    pack: "gbrain-investor",
    signature: {
      title: { en: "Dealflow memory with relationship edge", de: "Dealflow-Gedächtnis mit Beziehungs-Vorsprung" },
      proof: { en: "Founders, intros, memos and LP notes compound into a proprietary graph.", de: "Founder, Intros, Memos und LP-Notizen verzinsen sich als proprietärer Graph." },
      items: [
        { en: "Warm intro paths", de: "Warme Intro-Pfade" },
        { en: "Founder commitments", de: "Founder-Zusagen" },
        { en: "IC memo context", de: "IC-Memo-Kontext" },
      ],
    },
    theme: {
      primary: "#ca8a04",
      primaryHover: "#eab308",
      secondary: "#3b82f6",
      tertiary: "#f59e0b",
      glow: "rgba(234, 179, 8, 0.22)",
      gradientFrom: "#fbbf24",
      gradientVia: "#ca8a04",
      gradientTo: "#3b82f6",
    },
  },
  consulting: {
    key: "consulting",
    label: { en: "Consulting / agency", de: "Beratung / Agentur" },
    brand: "Consultumio",
    dashboardHref: "/dashboard/consulting",
    marketingHref: "/consulting",
    pack: "gbrain-consulting",
    signature: {
      title: { en: "Reusable institutional memory", de: "Wiederverwendbares Institutional Memory" },
      proof: { en: "Decks, retros, proposals and learnings stop being buried project by project.", de: "Decks, Retros, Angebote und Learnings verschwinden nicht mehr projektweise." },
      items: [
        { en: "Reusable assets", de: "Wiederverwendbare Assets" },
        { en: "Project retros", de: "Projekt-Retros" },
        { en: "Client context", de: "Kundenkontext" },
      ],
    },
    theme: {
      primary: "#e11d48",
      primaryHover: "#f43f5e",
      secondary: "#6366f1",
      tertiary: "#fb7185",
      glow: "rgba(225, 29, 72, 0.2)",
      gradientFrom: "#fb7185",
      gradientVia: "#e11d48",
      gradientTo: "#6366f1",
    },
  },
  recruiting: {
    key: "recruiting",
    label: { en: "Executive search / recruiting", de: "Executive Search / Recruiting" },
    brand: "Talentumio",
    dashboardHref: "/dashboard/recruiting",
    marketingHref: "/recruiting",
    pack: "gbrain-recruiting",
    signature: {
      title: { en: "A proprietary talent graph", de: "Ein proprietärer Talent-Graph" },
      proof: { en: "Candidates, mandates, references and consent signals survive every handoff.", de: "Kandidaten, Mandate, Referenzen und Einwilligungen überleben jeden Handoff." },
      items: [
        { en: "Candidate fit", de: "Kandidaten-Fit" },
        { en: "Warm introductions", de: "Warme Vorstellungen" },
        { en: "Consent-aware dossiers", de: "Einwilligungsbewusste Dossiers" },
      ],
    },
    theme: {
      primary: "#c026d3",
      primaryHover: "#d946ef",
      secondary: "#2563eb",
      tertiary: "#f0abfc",
      glow: "rgba(192, 38, 211, 0.2)",
      gradientFrom: "#f0abfc",
      gradientVia: "#c026d3",
      gradientTo: "#2563eb",
    },
  },
  medical: {
    key: "medical",
    label: { en: "Medical practice", de: "Arztpraxis / Medizin" },
    brand: "Medumio",
    dashboardHref: "/dashboard/medical",
    marketingHref: "/signup?industry=medical",
    pack: "gbrain-medical",
    signature: {
      title: { en: "Clinical context without chaos", de: "Medizinischer Kontext ohne Chaos" },
      proof: { en: "Records, treatments, documents and follow-ups stay structured and confidential.", de: "Befunde, Behandlungen, Dokumente und Wiedervorlagen bleiben strukturiert und vertraulich." },
      items: [
        { en: "Follow-up memory", de: "Wiedervorlagen-Gedächtnis" },
        { en: "Treatment context", de: "Behandlungskontext" },
        { en: "Confidential records", de: "Vertrauliche Akten" },
      ],
    },
    theme: {
      primary: "#0891b2",
      primaryHover: "#06b6d4",
      secondary: "#2dd4bf",
      tertiary: "#60a5fa",
      glow: "rgba(8, 145, 178, 0.22)",
      gradientFrom: "#2dd4bf",
      gradientVia: "#0891b2",
      gradientTo: "#60a5fa",
    },
  },
} as const satisfies Record<string, IndustryProfile>;

/** industry key (from ?industry=) → bundled gbrain schema pack name. */
export const INDUSTRY_PACK = Object.fromEntries(
  Object.entries(INDUSTRY_PROFILES).map(([key, profile]) => [key, profile.pack]),
) as { [K in keyof typeof INDUSTRY_PROFILES]: NonNullable<(typeof INDUSTRY_PROFILES)[K]["pack"]> };

export type Industry = keyof typeof INDUSTRY_PACK;

/** Valid signup industry values: every mapped vertical + the generic "other". */
export const INDUSTRIES: ReadonlySet<string> = new Set([
  ...Object.keys(INDUSTRY_PROFILES),
  "other",
]);

/** Is this a known signup industry value? */
export function isValidIndustry(industry: string | null | undefined): boolean {
  return !!industry && INDUSTRIES.has(industry);
}

/** The schema pack that configures a brain for this industry, or null
 *  ("other"/unknown → no vertical pack, generic base brain). */
export function packForIndustry(industry: string | null | undefined): string | null {
  if (!industry) return null;
  return (INDUSTRY_PACK as Record<string, string>)[industry] ?? null;
}

export function profileForIndustry(industry: string | null | undefined): IndustryProfile | null {
  if (!industry || industry === "other") return null;
  return (INDUSTRY_PROFILES as Record<string, IndustryProfile>)[industry] ?? null;
}

export function themeForIndustry(industry: string | null | undefined): IndustryTheme {
  return profileForIndustry(industry)?.theme ?? SIGMABRAIN_THEME;
}
