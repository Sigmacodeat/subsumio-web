// Subsumio — central DACH localized content system.
// DE (Germany) is the default locale at "/", AT lives under "/at/",
// CH under "/ch/", EN under "/en".
// One source of truth: layouts render from these objects, never duplicate copy in JSX.
// AT and CH are generated from DE via deepMerge() with jurisdiction-specific overrides
// (legal references, professional titles, fee systems, currency).
// To add a new language: add it to SUPPORTED_LANGS, create /{lang}/* route folder,
// and add {lang} keys to all content objects below.

export const SUPPORTED_LANGS = ["de", "at", "ch", "en"] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];
export const DEFAULT_LANG: Lang = "de";

/** DACH German locales (share the same language, differ in jurisdiction). */
export const DACH_LANGS = ["de", "at", "ch"] as const;
export type DachLang = (typeof DACH_LANGS)[number];

/** hreflang locale code for each Lang. */
export const HREFLANG: Record<Lang, string> = {
  de: "de-DE",
  at: "de-AT",
  ch: "de-CH",
  en: "en",
};

/** Human-readable jurisdiction label for each Lang. */
export const JURISDICTION_LABEL: Record<Lang, string> = {
  de: "Deutschland",
  at: "Österreich",
  ch: "Schweiz",
  en: "International",
};

/**
 * Deep-merge a DE base object with jurisdiction-specific overrides.
 * Arrays and primitives are replaced wholesale; nested objects are merged recursively.
 * This avoids duplicating 500+ lines of DE content for AT/CH — only the fields
 * that differ (legal references, titles, currency) are specified in overrides.
 */
export type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

export function deepMerge<T>(base: T, overrides: DeepPartial<T> | undefined): T {
  if (!overrides) return base;
  if (Array.isArray(base) && Array.isArray(overrides)) {
    if (base.length === overrides.length) {
      return base.map((item, i) =>
        deepMerge(item, (overrides as readonly unknown[])[i] as DeepPartial<typeof item>)
      ) as T;
    }
    return overrides as T;
  }
  if (typeof base !== "object" || base === null || Array.isArray(base)) {
    return (overrides as T) ?? base;
  }
  const result = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(overrides)) {
    const ov = (overrides as Record<string, unknown>)[key];
    if (ov === undefined) continue;
    const bv = (result as Record<string, unknown>)[key];
    if (typeof bv === "object" && bv !== null && typeof ov === "object" && ov !== null) {
      result[key] = deepMerge(bv, ov as Partial<typeof bv>);
    } else {
      result[key] = ov;
    }
  }
  return result as T;
}

// Öffentliche Repo-URL der Open-Source-Engine. EINE Stelle zum Ändern —
// per NEXT_PUBLIC_ENGINE_REPO_URL überschreibbar. Auf den eigenen
// öffentlichen Fork setzen, bevor die Marketing-Seite live geht.
export const ENGINE_REPO_URL =
  process.env.NEXT_PUBLIC_ENGINE_REPO_URL || "https://github.com/subsumio";
export const ENGINE_REPO_INSTALL = ENGINE_REPO_URL.replace("https://github.com/", "github:");

/** Build a locale-aware path. p("de", "/pricing") => "/pricing"; p("en", "/pricing") => "/en/pricing" */
export function p(lang: Lang, path: string): string {
  if (lang === DEFAULT_LANG) return path === "" ? "/" : path;
  return path === "" || path === "/" ? `/${lang}` : `/${lang}${path}`;
}

/** Strip the locale prefix from a pathname, returning the bare path. */
export function stripLangPrefix(pathname: string): string {
  for (const l of SUPPORTED_LANGS) {
    if (l === DEFAULT_LANG) continue;
    if (pathname === `/${l}` || pathname === `/${l}/`) return "/";
    if (pathname.startsWith(`/${l}/`)) return pathname.slice(l.length + 1); // keep leading /
  }
  return pathname;
}

/** The same page in another language (for the language switcher). */
export function altPath(lang: Lang, pathname: string): string {
  // Default: switch to EN (preserving existing behaviour)
  if (lang === DEFAULT_LANG) {
    return pathname === "/" ? "/en" : `/en${pathname}`;
  }
  // Non-default: switch to DE (root)
  const stripped = stripLangPrefix(pathname);
  return stripped === "" ? "/" : stripped;
}

/** All language alternates for a given pathname, excluding the current lang.
 * Used by the language switcher dropdown and hreflang link tags. */
export function allAltPaths(
  lang: Lang,
  pathname: string
): { lang: Lang; href: string; label: string; hreflang: string }[] {
  const base = stripLangPrefix(pathname);
  return SUPPORTED_LANGS.filter((l) => l !== lang).map((l) => ({
    lang: l,
    href: p(l, base),
    label: JURISDICTION_LABEL[l],
    hreflang: HREFLANG[l],
  }));
}

// ---------------------------------------------------------------------------
// Navigation + Footer
// ---------------------------------------------------------------------------

export interface NavItem {
  label: string;
  href: string;
}

export interface MegaNavItem {
  label: string;
  href: string;
  description: string;
  icon: string;
  badge?: string;
  featured?: boolean;
}

export interface NavFeaturedContent {
  title: string;
  description: string;
  href: string;
  badge?: string;
  icon?: string;
}

export interface NavSection {
  label: string;
  items: readonly MegaNavItem[];
  ctaBottom?: { label: string; href: string };
  featuredContent?: NavFeaturedContent;
}

export interface NavContent {
  signIn: string;
  cta: string;
  ctaSecondary?: string;
  ctaSecondaryHref?: string;
  pricingLabel: string;
  pricingHref: string;
  announcement?: { text: string; href: string; badge?: string };
  sections: readonly NavSection[];
}

// --- NAV: DE base, AT/CH overrides (nav labels are identical, only
//     jurisdiction-specific descriptions differ) ---------------------------

const _navDe: NavContent = {
  signIn: "Anmelden",
  cta: "14 Tage testen",
  ctaSecondary: "Demo ansehen",
  ctaSecondaryHref: "/superbrain",
  pricingLabel: "Preise",
  pricingHref: "/pricing",
  announcement: {
    text: "Neu: 5-Layer-Qualitätsarchitektur für belegte Antworten",
    href: "/superbrain",
    badge: "AI",
  },
  sections: [
    {
      label: "Plattform",
      items: [
        {
          label: "Übersicht",
          href: "/",
          description: "KI-Kanzleisoftware — belegte Antworten, keine Halluzination",
          icon: "Layers",
          featured: true,
        },
        {
          label: "SuperBrain",
          href: "/superbrain",
          description: "Die KI-Engine — 5-Layer-Architektur, Dream Cycle",
          icon: "Brain",
          badge: "AI",
          featured: true,
        },
        {
          label: "Features",
          href: "/features",
          description: "Alle Funktionen auf einen Blick",
          icon: "Zap",
        },
        {
          label: "Sicherheit",
          href: "/security",
          description: "Deine Daten, deine Keys, deine Jurisdiktion",
          icon: "ShieldCheck",
        },
        {
          label: "WhatsApp-Copilot",
          href: "/whatsapp",
          description: "Zeiten buchen, Dokumente vom Handy",
          icon: "MessageSquare",
        },
        {
          label: "Download",
          href: "/download",
          description: "iOS, Android, Desktop-Apps",
          icon: "Download",
        },
      ],
      ctaBottom: { label: "Plattform ansehen", href: "/features" },
      featuredContent: {
        title: "SuperBrain 2.0",
        description:
          "Die nächste Generation KI — 5-Layer-Architektur, Dream Cycle, belegte Antworten ohne Halluzination",
        href: "/superbrain",
        badge: "AI",
        icon: "Brain",
      },
    },
    {
      label: "Lösungen",
      items: [
        {
          label: "Für Kanzleien",
          href: "/kanzlei",
          description: "Solo, Kanzlei und Enterprise im Vergleich",
          icon: "Landmark",
          featured: true,
        },
        {
          label: "Für Einzelanwälte",
          href: "/solutions/solo",
          description: "Ein Nutzer, volle Kanzlei-KI, kein IT-Aufwand",
          icon: "User",
        },
        {
          label: "Für Justiziariate",
          href: "/solutions/in-house",
          description: "Legal Ops mit nachvollziehbarer Wissensbasis",
          icon: "Building2",
        },
        {
          label: "Für mittelständische Kanzleien",
          href: "/solutions/mid-sized",
          description: "Schlanke Teams, überproportionale Wirkung",
          icon: "Users",
        },
      ],
      ctaBottom: { label: "Lösung finden", href: "/solutions/law-firms" },
      featuredContent: {
        title: "Kundenstories",
        description: "Wie Kanzleien mit Subsumio effizienter arbeiten und mehr Mandanten gewinnen",
        href: "/about",
        icon: "Sparkles",
      },
    },
    {
      label: "Ressourcen",
      items: [
        {
          label: "Dokumentation",
          href: "/docs",
          description: "Guides, API-Referenz, Setup-Hilfe",
          icon: "FileText",
        },
        {
          label: "Blog",
          href: "/blog",
          description: "Insights, Updates, Legal-Tech-Trends",
          icon: "Megaphone",
          badge: "Neu",
        },
        {
          label: "Partnerprogramm",
          href: "/partners",
          description: "Kunden empfehlen, 30 % wiederkehrend",
          icon: "Handshake",
        },
        {
          label: "Benchmark",
          href: "/benchmark-methodology",
          description: "Wie wir KI-Qualität messen",
          icon: "GitBranch",
        },
      ],
      ctaBottom: { label: "Doku öffnen", href: "/docs" },
      featuredContent: {
        title: "Erste Schritte",
        description: "Setup in 5 Minuten — Guides, API-Referenz, Tutorials für jeden Workflow",
        href: "/docs",
        icon: "Zap",
      },
    },
    {
      label: "Unternehmen",
      items: [
        {
          label: "Über uns",
          href: "/about",
          description: "Aus Österreich für DACH-Kanzleien",
          icon: "Info",
        },
        {
          label: "Kontakt",
          href: "/contact",
          description: "Kontakt zum Team",
          icon: "Mail",
        },
        {
          label: "Impressum",
          href: "/imprint",
          description: "Anbieterinfo und rechtliche Angaben",
          icon: "FileText",
        },
      ],
      featuredContent: {
        title: "Sprich mit uns",
        description: "Demo buchen oder Fragen stellen — wir antworten in unter 24 Stunden",
        href: "/contact",
        icon: "Mail",
      },
    },
  ],
};

/** IT-specific nav replacements from EN base. */

/** ES-specific nav replacements from EN base. */

/** PL-specific nav replacements from EN base. */

/** FR-specific nav replacements from EN base. */

/** NL-specific nav replacements from EN base. */

const _navEn: NavContent = {
  signIn: "Sign in",
  cta: "Start free trial",
  ctaSecondary: "Watch demo",
  ctaSecondaryHref: "/superbrain",
  pricingLabel: "Pricing",
  pricingHref: "/pricing",
  announcement: {
    text: "New: 5-layer quality architecture for cited answers",
    href: "/superbrain",
    badge: "AI",
  },
  sections: [
    {
      label: "Platform",
      items: [
        {
          label: "Overview",
          href: "/",
          description: "AI legal software — cited answers, zero hallucinations",
          icon: "Layers",
          featured: true,
        },
        {
          label: "SuperBrain",
          href: "/superbrain",
          description: "The AI engine — 5-layer architecture, Dream Cycle",
          icon: "Brain",
          badge: "AI",
          featured: true,
        },
        {
          label: "Features",
          href: "/features",
          description: "Every capability, nothing hidden",
          icon: "Zap",
        },
        {
          label: "Security",
          href: "/security",
          description: "Your data, your keys, your jurisdiction",
          icon: "ShieldCheck",
        },
        {
          label: "WhatsApp Copilot",
          href: "/whatsapp",
          description: "Book time, file documents from your phone",
          icon: "MessageSquare",
        },
        {
          label: "Download",
          href: "/download",
          description: "iOS, Android, desktop apps",
          icon: "Download",
        },
      ],
      ctaBottom: { label: "See the platform", href: "/features" },
      featuredContent: {
        title: "SuperBrain 2.0",
        description:
          "The next generation AI — 5-layer architecture, Dream Cycle, cited answers without hallucination",
        href: "/superbrain",
        badge: "AI",
        icon: "Brain",
      },
    },
    {
      label: "Solutions",
      items: [
        {
          label: "For Law Firms",
          href: "/kanzlei",
          description: "Compare Solo, Firm and Enterprise",
          icon: "Landmark",
          featured: true,
        },
        {
          label: "For Solo Lawyers",
          href: "/solutions/solo",
          description: "One seat, one brain, zero overhead",
          icon: "User",
        },
        {
          label: "For In-House",
          href: "/solutions/in-house",
          description: "Legal ops with auditable memory",
          icon: "Building2",
        },
        {
          label: "For Mid-Sized Firms",
          href: "/solutions/mid-sized",
          description: "Lean team, outsized impact",
          icon: "Users",
        },
      ],
      ctaBottom: { label: "Find your solution", href: "/solutions/law-firms" },
      featuredContent: {
        title: "Customer Stories",
        description: "How firms work more efficiently with Subsumio and win more clients",
        href: "/about",
        icon: "Sparkles",
      },
    },
    {
      label: "Resources",
      items: [
        {
          label: "Documentation",
          href: "/docs",
          description: "Guides, API reference, setup help",
          icon: "FileText",
        },
        {
          label: "Blog",
          href: "/blog",
          description: "Insights, updates, legal-tech trends",
          icon: "Megaphone",
          badge: "New",
        },
        {
          label: "Partner Program",
          href: "/partners",
          description: "Refer clients, earn 30% recurring",
          icon: "Handshake",
        },
        {
          label: "Benchmark",
          href: "/benchmark-methodology",
          description: "How we measure AI quality",
          icon: "GitBranch",
        },
      ],
      ctaBottom: { label: "Open docs", href: "/docs" },
      featuredContent: {
        title: "Getting Started",
        description: "Setup in 5 minutes — guides, API reference, tutorials for every workflow",
        href: "/docs",
        icon: "Zap",
      },
    },
    {
      label: "Company",
      items: [
        {
          label: "About",
          href: "/about",
          description: "Built in Austria for DACH law",
          icon: "Info",
        },
        { label: "Contact", href: "/contact", description: "Talk to our team", icon: "Mail" },
        {
          label: "Imprint",
          href: "/imprint",
          description: "Legal notice and provider info",
          icon: "FileText",
        },
      ],
      featuredContent: {
        title: "Talk to us",
        description: "Book a demo or ask questions — we respond in under 24 hours",
        href: "/contact",
        icon: "Mail",
      },
    },
  ],
};

export const NAV: Record<Lang, NavContent> = {
  en: _navEn,
  de: _navDe,
  at: _navDe,
  ch: _navDe,
};

const _footerEn = {
  tagline: "AI legal software that never forgets — the firm brain for lawyers in Europe.",
  columns: [
    {
      title: "Platform",
      links: [
        { label: "Overview", href: "/" },
        { label: "SuperBrain", href: "/superbrain" },
        { label: "Features", href: "/features" },
        { label: "Security", href: "/security" },
        { label: "WhatsApp Copilot", href: "/whatsapp" },
        { label: "Pricing", href: "/pricing" },
        { label: "Download", href: "/download" },
      ],
    },
    {
      title: "Solutions",
      links: [
        { label: "For Legal Professionals", href: "/kanzlei" },
        { label: "For Law Firms", href: "/solutions/law-firms" },
        { label: "For Solo Lawyers", href: "/solutions/solo" },
        { label: "For In-House", href: "/solutions/in-house" },
        { label: "For Mid-Sized Firms", href: "/solutions/mid-sized" },
      ],
    },
    {
      title: "Resources",
      links: [
        { label: "Documentation", href: "/docs" },
        { label: "Blog", href: "/blog" },
        { label: "Benchmark", href: "/benchmark-methodology" },
        { label: "Partner Program", href: "/partners" },
        { label: "Dashboard", href: "/dashboard", external: false },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About", href: "/about" },
        { label: "Contact", href: "/contact" },
        { label: "Imprint", href: "/imprint" },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Terms of service", href: "/terms" },
        { label: "Privacy", href: "/privacy" },
      ],
    },
  ],
  note: "Your data, your keys. Self-hosted on your hardware or our EU cloud with DPA — GDPR-ready, end-to-end encrypted, zero training on your data.",
};

export const FOOTER: Record<
  Lang,
  {
    tagline: string;
    columns: { title: string; links: { label: string; href: string; external?: boolean }[] }[];
    note: string;
  }
> = {
  en: _footerEn,
  de: {
    tagline: "KI-Kanzleisoftware, die nie vergisst — das Kanzlei-Brain für Anwälte in Europa.",
    columns: [
      {
        title: "Plattform",
        links: [
          { label: "Übersicht", href: "/" },
          { label: "SuperBrain", href: "/superbrain" },
          { label: "Features", href: "/features" },
          { label: "Sicherheit", href: "/security" },
          { label: "WhatsApp-Copilot", href: "/whatsapp" },
          { label: "Preise", href: "/pricing" },
          { label: "Download", href: "/download" },
        ],
      },
      {
        title: "Lösungen",
        links: [
          { label: "Kanzlei-Zugang", href: "/kanzlei" },
          { label: "Für Kanzleien", href: "/solutions/law-firms" },
          { label: "Für Einzelanwälte", href: "/solutions/solo" },
          { label: "Für Justiziariate", href: "/solutions/in-house" },
          { label: "Für Mittelständische", href: "/solutions/mid-sized" },
        ],
      },
      {
        title: "Ressourcen",
        links: [
          { label: "Dokumentation", href: "/docs" },
          { label: "Blog", href: "/blog" },
          { label: "Benchmark", href: "/benchmark-methodology" },
          { label: "Partnerprogramm", href: "/partners" },
          { label: "Dashboard", href: "/dashboard", external: false },
        ],
      },
      {
        title: "Unternehmen",
        links: [
          { label: "Über uns", href: "/about" },
          { label: "Kontakt", href: "/contact" },
          { label: "Impressum", href: "/imprint" },
        ],
      },
      {
        title: "Rechtliches",
        links: [
          { label: "AGB", href: "/terms" },
          { label: "Datenschutz", href: "/privacy" },
        ],
      },
    ],
    note: "Deine Daten. Deine Schlüssel. On-Premise auf eigener Hardware oder EU-Cloud mit AVV — DSGVO-konform, Ende-zu-Ende verschlüsselt, kein Training auf deinen Daten.",
  },
  at: {
    tagline: "KI-Kanzleisoftware, die nie vergisst — das Kanzlei-Brain für Anwälte in Österreich.",
    columns: [
      {
        title: "Plattform",
        links: [
          { label: "Übersicht", href: "/" },
          { label: "SuperBrain", href: "/superbrain" },
          { label: "Features", href: "/features" },
          { label: "Sicherheit", href: "/security" },
          { label: "WhatsApp-Copilot", href: "/whatsapp" },
          { label: "Preise", href: "/pricing" },
          { label: "Download", href: "/download" },
        ],
      },
      {
        title: "Lösungen",
        links: [
          { label: "Kanzlei-Zugang", href: "/kanzlei" },
          { label: "Für Kanzleien", href: "/solutions/law-firms" },
          { label: "Für Einzelanwälte", href: "/solutions/solo" },
          { label: "Für Justiziariate", href: "/solutions/in-house" },
          { label: "Für Mittelständische", href: "/solutions/mid-sized" },
        ],
      },
      {
        title: "Ressourcen",
        links: [
          { label: "Dokumentation", href: "/docs" },
          { label: "Blog", href: "/blog" },
          { label: "Benchmark", href: "/benchmark-methodology" },
          { label: "Partnerprogramm", href: "/partners" },
          { label: "Dashboard", href: "/dashboard", external: false },
        ],
      },
      {
        title: "Unternehmen",
        links: [
          { label: "Über uns", href: "/about" },
          { label: "Kontakt", href: "/contact" },
          { label: "Impressum", href: "/imprint" },
        ],
      },
      {
        title: "Rechtliches",
        links: [
          { label: "AGB", href: "/terms" },
          { label: "Datenschutz", href: "/privacy" },
        ],
      },
    ],
    note: "Deine Daten. Deine Schlüssel. On-Premise auf eigener Hardware oder EU-Cloud mit AVV — DSGVO-konform, Ende-zu-Ende verschlüsselt, kein Training mit deinen Daten.",
  },
  ch: {
    tagline: "KI-Kanzleisoftware, die nie vergisst — das Kanzlei-Brain für Anwälte in der Schweiz.",
    columns: [
      {
        title: "Plattform",
        links: [
          { label: "Übersicht", href: "/" },
          { label: "SuperBrain", href: "/superbrain" },
          { label: "Features", href: "/features" },
          { label: "Sicherheit", href: "/security" },
          { label: "WhatsApp-Copilot", href: "/whatsapp" },
          { label: "Preise", href: "/pricing" },
          { label: "Download", href: "/download" },
        ],
      },
      {
        title: "Lösungen",
        links: [
          { label: "Kanzlei-Zugang", href: "/kanzlei" },
          { label: "Für Kanzleien", href: "/solutions/law-firms" },
          { label: "Für Einzelanwälte", href: "/solutions/solo" },
          { label: "Für Justiziariate", href: "/solutions/in-house" },
          { label: "Für Mittelständische", href: "/solutions/mid-sized" },
        ],
      },
      {
        title: "Ressourcen",
        links: [
          { label: "Dokumentation", href: "/docs" },
          { label: "Blog", href: "/blog" },
          { label: "Benchmark", href: "/benchmark-methodology" },
          { label: "Partnerprogramm", href: "/partners" },
          { label: "Dashboard", href: "/dashboard", external: false },
        ],
      },
      {
        title: "Unternehmen",
        links: [
          { label: "Über uns", href: "/about" },
          { label: "Kontakt", href: "/contact" },
          { label: "Impressum", href: "/imprint" },
        ],
      },
      {
        title: "Rechtliches",
        links: [
          { label: "AGB", href: "/terms" },
          { label: "Datenschutz", href: "/privacy" },
        ],
      },
    ],
    note: "Deine Daten. Deine Schlüssel. On-Premise auf eigener Hardware oder EU-Cloud mit AVV — DSGVO-konform, Ende-zu-Ende verschlüsselt, kein Training mit deinen Daten.",
  },
};

// ---------------------------------------------------------------------------
// Pricing (single source of truth — used by landing teaser + /pricing page)
// ---------------------------------------------------------------------------

export interface PricingTier {
  id: string;
  name: string;
  price: string;
  priceMonthly?: string;
  period: string;
  periodMonthly?: string;
  blurb: string;
  features: string[];
  cta: string;
  href: string;
  highlight?: boolean;
}

const _pricingEn = {
  title: "Legal software pricing — per seat, no lock-in",
  sub: "Per seat, billed annually. Your firm's brain on infrastructure you control — EU-hosted or on-premise.",
  tiers: [
    {
      id: "free",
      name: "Community",
      price: "€0",
      period: "forever",
      blurb:
        "For solo lawyers exploring AI-assisted case work. Free forever, no credit card required.",
      features: [
        "Self-hosted — your server, your keys",
        "100 AI queries/mo included",
        "5 GB local storage",
        "Case Q&A with page-level citations",
        "Deadline tracking (ZPO/BGB/ABGB)",
        "Community support",
      ],
      cta: "Start free",
      href: "/signup",
    },
    {
      id: "pro",
      name: "Pro",
      price: "€890",
      priceMonthly: "€1,113",
      period: "/seat/mo",
      periodMonthly: "/seat/mo",
      blurb: "For the lawyer who can't afford to miss anything. Annual billing saves 20%.",
      features: [
        "Fully managed — no API keys needed",
        "1,000 AI queries/seat/mo included",
        "75 GB cloud storage per seat",
        "300 WhatsApp messages/mo included",
        "24/7 Dream Cycle (dedupe, citations, contradictions)",
        "Live usage meter — transparent overages",
        "Priority support",
        "Overage: €0.45/query · €0.25/WA msg",
      ],
      cta: "Start Pro",
      href: "/signup",
      highlight: true,
    },
    {
      id: "team",
      name: "Team",
      price: "€1,290",
      priceMonthly: "€1,613",
      period: "/seat/mo",
      periodMonthly: "/seat/mo",
      blurb:
        "One shared brain, every lawyer's matters indexed together. From 5 seats. Annual billing saves 20%.",
      features: [
        "Everything in Pro",
        "Shared institutional memory",
        "4,000 AI queries/seat/mo included",
        "200 GB cloud storage per seat",
        "1,000 WhatsApp messages/mo included",
        "Per-user scoped access — fuzz-tested, zero leaks",
        "Admin & usage analytics",
        "Onboarding session included",
        "Overage: €0.40/query · €0.20/WA msg",
      ],
      cta: "Start Team",
      href: "/signup",
    },
    {
      id: "ent",
      name: "Enterprise",
      price: "from €1,890",
      period: "/seat/mo",
      blurb:
        "Compliance-grade for regulated firms. From 20 seats, on your infrastructure or EU cloud.",
      features: [
        "15,000 AI queries/seat/mo (Fair Use beyond)",
        "5,000 WhatsApp messages/seat/mo",
        "500 GB storage per seat",
        "EU cloud, S3-compatible object storage or on-prem",
        "Custom retention policy",
        "DPA, SLA, SSO/SAML",
        "Maximum-recall search mode",
        "Dedicated CSM & integration help",
        "Overage: €0.35/query · €0.15/WA msg",
      ],
      cta: "Book a demo",
      href: "mailto:hello@subsum.eu",
    },
  ],
  footnote:
    "Annual billing −20 %. Included AI query and storage quotas shown per plan. Overages billed at transparent per-unit rates at month end — no surprise bills, no silent throttling. Token add-on packs available: 500 queries for €199, 1,500 for €499, 5,000 for €1,499.",
};

export const PRICING: Record<
  Lang,
  { title: string; sub: string; tiers: PricingTier[]; footnote: string }
> = {
  en: _pricingEn,
  de: {
    title: "Kanzleisoftware Preise — pro Nutzer, kein Lock-in",
    sub: "Pro Nutzer, jährliche Abrechnung. Dein Kanzleiwissen auf Infrastruktur, die du kontrollierst — EU-gehostet oder On-Premise.",
    tiers: [
      {
        id: "free",
        name: "Community",
        price: "0 €",
        period: "für immer",
        blurb:
          "Für Einzelanwälte, die KI-gestützte Aktenarbeit erkunden. Kostenlos für immer, keine Kreditkarte nötig.",
        features: [
          "Self-hosted — dein Server, deine Keys",
          "100 KI-Anfragen/Mon. inklusive",
          "5 GB lokaler Speicher",
          "Akten-Q&A mit seitengenauen Zitaten",
          "Fristenverwaltung (ZPO/BGB/ABGB)",
          "Community-Support",
        ],
        cta: "Kostenlos starten",
        href: "/signup",
      },
      {
        id: "pro",
        name: "Pro",
        price: "890 €",
        priceMonthly: "1.113 €",
        period: "/Nutzer/Mon.",
        periodMonthly: "/Nutzer/Mon.",
        blurb:
          "Für Anwälte, die es sich nicht leisten können, etwas zu übersehen. Jahreszahlung spart 20 %.",
        features: [
          "Voll verwaltet — keine API-Keys nötig",
          "1.000 KI-Anfragen/Nutzer/Mon. inklusive",
          "75 GB Cloud-Speicher pro Nutzer",
          "300 WhatsApp-Nachrichten/Mon. inklusive",
          "Dream Cycle: Deduplizierung, Zitate, Widersprüche",
          "Live-Verbrauchsanzeige — transparente Mehrkosten",
          "Priorisierter Support",
          "Mehrverbrauch: 0,45 €/Anfrage · 0,25 €/WA",
        ],
        cta: "Pro starten",
        href: "/signup",
        highlight: true,
      },
      {
        id: "team",
        name: "Team",
        price: "1.290 €",
        priceMonthly: "1.613 €",
        period: "/Nutzer/Mon.",
        periodMonthly: "/Nutzer/Mon.",
        blurb:
          "Ein gemeinsames Brain — jede Akte jedes Anwalts, gemeinsam abfragbar. Ab 5 Nutzern. Jahreszahlung spart 20 %.",
        features: [
          "Alles aus Pro",
          "Geteiltes Kanzleiwissen",
          "4.000 KI-Anfragen/Nutzer/Mon. inklusive",
          "200 GB Cloud-Speicher pro Nutzer",
          "1.000 WhatsApp-Nachrichten/Mon. inklusive",
          "Rollenbasierte Zugriffe pro Akte und Nutzer",
          "Admin- und Nutzungsanalyse",
          "Onboarding-Session inklusive",
          "Mehrverbrauch: 0,40 €/Anfrage · 0,20 €/WA",
        ],
        cta: "Team starten",
        href: "/signup",
      },
      {
        id: "ent",
        name: "Enterprise",
        price: "ab 1.890 €",
        period: "/Nutzer/Mon.",
        blurb:
          "Compliance-Klasse für regulierte Kanzleien. Ab 20 Nutzern, auf deiner Infrastruktur oder in der EU-Cloud.",
        features: [
          "15.000 KI-Anfragen/Nutzer/Mon. (Fair Use darüber)",
          "5.000 WhatsApp-Nachrichten/Nutzer/Mon.",
          "500 GB Speicher pro Nutzer",
          "EU-Cloud, S3-kompatibler Objektspeicher oder On-Prem",
          "Individuelle Aufbewahrungsrichtlinie",
          "AVV, SLA, SSO/SAML",
          "Maximum-Recall-Suchmodus",
          "Dedizierter CSM & Integrationshilfe",
          "Mehrverbrauch: 0,35 €/Anfrage · 0,15 €/WA",
        ],
        cta: "Demo vereinbaren",
        href: "mailto:hello@subsum.eu",
      },
    ],
    footnote:
      "Jahreszahlung −20 %. KI-Anfragen und Speicher-Kontingente sind je Plan inklusive. Mehrverbrauch wird zu transparenten Einheitspreisen am Monatsende abgerechnet — keine Überraschungsrechnung, kein stilles Drosseln. Zusatzpakete: 500 Anfragen für 199 €, 1.500 für 499 €, 5.000 für 1.499 €.",
  },
  at: {
    title: "Kanzleisoftware Preise — pro Nutzer, kein Lock-in",
    sub: "Pro Nutzer, jährliche Abrechnung. Dein Kanzleiwissen auf Infrastruktur, die du kontrollierst — EU-gehostet oder On-Premise.",
    tiers: [
      {
        id: "free",
        name: "Community",
        price: "0 €",
        period: "für immer",
        blurb:
          "Für Einzelanwälte, die KI-gestützte Aktenarbeit erkunden. Kostenlos für immer, keine Kreditkarte nötig.",
        features: [
          "Self-hosted — dein Server, deine Keys",
          "100 KI-Anfragen/Mon. inklusive",
          "5 GB lokaler Speicher",
          "Akten-Q&A mit seitengenauen Zitaten",
          "Fristenverwaltung (ZPO/ABGB)",
          "Community-Support",
        ],
        cta: "Kostenlos starten",
        href: "/signup",
      },
      {
        id: "pro",
        name: "Pro",
        price: "890 €",
        priceMonthly: "1.113 €",
        period: "/Nutzer/Mon.",
        periodMonthly: "/Nutzer/Mon.",
        blurb:
          "Für Anwälte, die es sich nicht leisten können, etwas zu übersehen. Jahreszahlung spart 20 %.",
        features: [
          "Voll verwaltet — keine API-Keys nötig",
          "1.000 KI-Anfragen/Nutzer/Mon. inklusive",
          "75 GB Cloud-Speicher pro Nutzer",
          "300 WhatsApp-Nachrichten/Mon. inklusive",
          "Dream Cycle: Deduplizierung, Zitate, Widersprüche",
          "Live-Verbrauchsanzeige — transparente Mehrkosten",
          "Priorisierter Support",
          "Mehrverbrauch: 0,45 €/Anfrage · 0,25 €/WA",
        ],
        cta: "Pro starten",
        href: "/signup",
        highlight: true,
      },
      {
        id: "team",
        name: "Team",
        price: "1.290 €",
        priceMonthly: "1.613 €",
        period: "/Nutzer/Mon.",
        periodMonthly: "/Nutzer/Mon.",
        blurb:
          "Ein gemeinsames Brain — jede Akte jedes Anwalts, gemeinsam abfragbar. Ab 5 Nutzern. Jahreszahlung spart 20 %.",
        features: [
          "Alles aus Pro",
          "Geteiltes Kanzleiwissen",
          "4.000 KI-Anfragen/Nutzer/Mon. inklusive",
          "200 GB Cloud-Speicher pro Nutzer",
          "1.000 WhatsApp-Nachrichten/Mon. inklusive",
          "Rollenbasierte Zugriffe pro Akte und Nutzer",
          "Admin- und Nutzungsanalyse",
          "Onboarding-Session inklusive",
          "Mehrverbrauch: 0,40 €/Anfrage · 0,20 €/WA",
        ],
        cta: "Team starten",
        href: "/signup",
      },
      {
        id: "ent",
        name: "Enterprise",
        price: "ab 1.890 €",
        period: "/Nutzer/Mon.",
        blurb:
          "Compliance-Klasse für regulierte Kanzleien. Ab 20 Nutzern, auf deiner Infrastruktur oder in der EU-Cloud.",
        features: [
          "15.000 KI-Anfragen/Nutzer/Mon. (Fair Use darüber)",
          "5.000 WhatsApp-Nachrichten/Nutzer/Mon.",
          "500 GB Speicher pro Nutzer",
          "EU-Cloud, S3-kompatibler Objektspeicher oder On-Prem",
          "Individuelle Aufbewahrungsrichtlinie",
          "AVV, SLA, SSO/SAML",
          "Maximum-Recall-Suchmodus",
          "Dedizierter CSM & Integrationshilfe",
          "Mehrverbrauch: 0,35 €/Anfrage · 0,15 €/WA",
        ],
        cta: "Demo vereinbaren",
        href: "mailto:hello@subsum.eu",
      },
    ],
    footnote:
      "Jahreszahlung −20 %. KI-Anfragen und Speicher-Kontingente sind je Plan inklusive. Mehrverbrauch wird zu transparenten Einheitspreisen am Monatsende abgerechnet — keine Überraschungsrechnung, kein stilles Drosseln. Zusatzpakete: 500 Anfragen für 199 €, 1.500 für 499 €, 5.000 für 1.499 €.",
  },
  ch: {
    title: "Kanzleisoftware Preise — pro Nutzer, kein Lock-in",
    sub: "Pro Nutzer, jährliche Abrechnung. Dein Kanzleiwissen auf Infrastruktur, die du kontrollierst — EU-gehostet oder On-Premise.",
    tiers: [
      {
        id: "free",
        name: "Community",
        price: "CHF 0",
        period: "für immer",
        blurb:
          "Für Einzelanwälte, die KI-gestützte Aktenarbeit erkunden. Kostenlos für immer, keine Kreditkarte nötig.",
        features: [
          "Self-hosted — dein Server, deine Keys",
          "100 KI-Anfragen/Mon. inklusive",
          "5 GB lokaler Speicher",
          "Akten-Q&A mit seitengenauen Zitaten",
          "Fristenverwaltung (ZPO/OR/ZGB)",
          "Community-Support",
        ],
        cta: "Kostenlos starten",
        href: "/signup",
      },
      {
        id: "pro",
        name: "Pro",
        price: "CHF 890",
        priceMonthly: "CHF 1'113",
        period: "/Nutzer/Mon.",
        periodMonthly: "/Nutzer/Mon.",
        blurb:
          "Für Anwälte, die es sich nicht leisten können, etwas zu übersehen. Jahreszahlung spart 20 %.",
        features: [
          "Voll verwaltet — keine API-Keys nötig",
          "1.000 KI-Anfragen/Nutzer/Mon. inklusive",
          "75 GB Cloud-Speicher pro Nutzer",
          "300 WhatsApp-Nachrichten/Mon. inklusive",
          "Dream Cycle: Deduplizierung, Zitate, Widersprüche",
          "Live-Verbrauchsanzeige — transparente Mehrkosten",
          "Priorisierter Support",
          "Mehrverbrauch: CHF 0.45/Anfrage · CHF 0.25/WA",
        ],
        cta: "Pro starten",
        href: "/signup",
        highlight: true,
      },
      {
        id: "team",
        name: "Team",
        price: "CHF 1'290",
        priceMonthly: "CHF 1'613",
        period: "/Nutzer/Mon.",
        periodMonthly: "/Nutzer/Mon.",
        blurb:
          "Ein gemeinsames Brain — jede Akte jedes Anwalts, gemeinsam abfragbar. Ab 5 Nutzern. Jahreszahlung spart 20 %.",
        features: [
          "Alles aus Pro",
          "Geteiltes Kanzleiwissen",
          "4.000 KI-Anfragen/Nutzer/Mon. inklusive",
          "200 GB Cloud-Speicher pro Nutzer",
          "1.000 WhatsApp-Nachrichten/Mon. inklusive",
          "Rollenbasierte Zugriffe pro Akte und Nutzer",
          "Admin- und Nutzungsanalyse",
          "Onboarding-Session inklusive",
          "Mehrverbrauch: CHF 0.40/Anfrage · CHF 0.20/WA",
        ],
        cta: "Team starten",
        href: "/signup",
      },
      {
        id: "ent",
        name: "Enterprise",
        price: "ab CHF 1'890",
        period: "/Nutzer/Mon.",
        blurb:
          "Compliance-Klasse für regulierte Kanzleien. Ab 20 Nutzern, auf deiner Infrastruktur oder in der EU-Cloud.",
        features: [
          "15.000 KI-Anfragen/Nutzer/Mon. (Fair Use darüber)",
          "5.000 WhatsApp-Nachrichten/Nutzer/Mon.",
          "500 GB Speicher pro Nutzer",
          "EU-Cloud, S3-kompatibler Objektspeicher oder On-Prem",
          "Individuelle Aufbewahrungsrichtlinie",
          "AVV, SLA, SSO/SAML",
          "Maximum-Recall-Suchmodus",
          "Dedizierter CSM & Integrationshilfe",
          "Mehrverbrauch: CHF 0.35/Anfrage · CHF 0.15/WA",
        ],
        cta: "Demo vereinbaren",
        href: "mailto:hello@subsum.eu",
      },
    ],
    footnote:
      "Jahreszahlung −20 %. KI-Anfragen und Speicher-Kontingente sind je Plan inklusive. Mehrverbrauch wird zu transparenten Einheitspreisen am Monatsende abgerechnet — keine Überraschungsrechnung, kein stilles Drosseln. Zusatzpakete: 500 Anfragen für CHF 199, 1'500 für CHF 499, 5'000 für CHF 1'499.",
  },
};

// ---------------------------------------------------------------------------
// Pricing FAQ (pricing-specific — not a duplicate of the landing FAQ)
// ---------------------------------------------------------------------------

const _pricingFaqEn = {
  title: "Pricing questions",
  items: [
    {
      q: "Is there a free trial?",
      a: "Yes. Every hosted plan starts with a 14-day reverse trial — full access, no credit card. If Subsumio isn't for you, cancel within 14 days for a full refund.",
    },
    {
      q: "Can I switch plans anytime?",
      a: "Yes. Upgrade or downgrade from the dashboard at any time. Changes take effect at the next billing cycle — no penalties, no lock-in.",
    },
    {
      q: "How does monthly billing work?",
      a: "Solo and Firm are billed monthly and can be canceled monthly. Firm includes five users; Enterprise terms are agreed individually.",
    },
    {
      q: "What happens to my data if I cancel?",
      a: "You can export everything at any time. After cancellation, your data is retained for 30 days, then permanently deleted — or you can request immediate deletion.",
    },
    {
      q: "Are there any hidden fees?",
      a: "No. Overages are billed at transparent per-unit rates shown in the dashboard. You see usage live and we ask before anything changes.",
    },
  ],
};

export const PRICING_FAQ: Record<Lang, { title: string; items: { q: string; a: string }[] }> = {
  en: _pricingFaqEn,
  de: {
    title: "Preisfragen",
    items: [
      {
        q: "Gibt es eine kostenlose Testversion?",
        a: "Ja. Jeder gehostete Plan startet mit einem 14-Tage-Reverse-Trial — voller Zugriff, keine Kreditkarte. Wenn Subsumio nicht das Richtige für dich ist, kündigst du innerhalb von 14 Tagen für eine volle Rückerstattung.",
      },
      {
        q: "Kann ich jederzeit den Plan wechseln?",
        a: "Ja. Upgrade oder Downgrade aus dem Dashboard jederzeit möglich. Änderungen werden zum nächsten Abrechnungszeitraum wirksam — keine Strafgebühren, kein Lock-in.",
      },
      {
        q: "Wie funktioniert die monatliche Abrechnung?",
        a: "Solo und Kanzlei werden monatlich abgerechnet und sind monatlich kündbar. Kanzlei enthält fünf Nutzer; Enterprise-Konditionen werden individuell vereinbart.",
      },
      {
        q: "Was passiert mit meinen Daten bei Kündigung?",
        a: "Du kannst jederzeit alles exportieren. Nach Kündigung werden deine Daten 30 Tage aufbewahrt, dann dauerhaft gelöscht — oder du kannst sofortige Löschung beantragen.",
      },
      {
        q: "Gibt es versteckte Gebühren?",
        a: "Nein. Mehrverbrauch wird zu transparenten Einheitspreisen abgerechnet, die im Dashboard sichtbar sind. Du siehst den Verbrauch live und wir fragen, bevor sich etwas ändert.",
      },
    ],
  },
  at: {
    title: "Preisfragen",
    items: [
      {
        q: "Gibt es eine kostenlose Testversion?",
        a: "Ja. Jeder gehostete Plan startet mit einem 14-Tage-Reverse-Trial — voller Zugriff, keine Kreditkarte. Wenn Subsumio nicht das Richtige für dich ist, kündigst du innerhalb von 14 Tagen für eine volle Rückerstattung.",
      },
      {
        q: "Kann ich jederzeit den Plan wechseln?",
        a: "Ja. Upgrade oder Downgrade aus dem Dashboard jederzeit möglich. Änderungen werden zum nächsten Abrechnungszeitraum wirksam — keine Strafgebühren, kein Lock-in.",
      },
      {
        q: "Wie funktioniert die monatliche Abrechnung?",
        a: "Solo und Kanzlei werden monatlich abgerechnet und sind monatlich kündbar. Kanzlei enthält fünf Nutzer; Enterprise-Konditionen werden individuell vereinbart.",
      },
      {
        q: "Was passiert mit meinen Daten bei Kündigung?",
        a: "Du kannst jederzeit alles exportieren. Nach Kündigung werden deine Daten 30 Tage aufbewahrt, dann dauerhaft gelöscht — oder du kannst sofortige Löschung beantragen.",
      },
      {
        q: "Gibt es versteckte Gebühren?",
        a: "Nein. Mehrverbrauch wird zu transparenten Einheitspreisen abgerechnet, die im Dashboard sichtbar sind. Du siehst den Verbrauch live und wir fragen, bevor sich etwas ändert.",
      },
    ],
  },
  ch: {
    title: "Preisfragen",
    items: [
      {
        q: "Gibt es eine kostenlose Testversion?",
        a: "Ja. Jeder gehostete Plan startet mit einem 14-Tage-Reverse-Trial — voller Zugriff, keine Kreditkarte. Wenn Subsumio nicht das Richtige für dich ist, kündigst du innerhalb von 14 Tagen für eine volle Rückerstattung.",
      },
      {
        q: "Kann ich jederzeit den Plan wechseln?",
        a: "Ja. Upgrade oder Downgrade aus dem Dashboard jederzeit möglich. Änderungen werden zum nächsten Abrechnungszeitraum wirksam — keine Strafgebühren, kein Lock-in.",
      },
      {
        q: "Wie funktioniert die monatliche Abrechnung?",
        a: "Solo und Kanzlei werden monatlich abgerechnet und sind monatlich kündbar. Kanzlei enthält fünf Nutzer; Enterprise-Konditionen werden individuell vereinbart.",
      },
      {
        q: "Was passiert mit meinen Daten bei Kündigung?",
        a: "Du kannst jederzeit alles exportieren. Nach Kündigung werden deine Daten 30 Tage aufbewahrt, dann dauerhaft gelöscht — oder du kannst sofortige Löschung beantragen.",
      },
      {
        q: "Gibt es versteckte Gebühren?",
        a: "Nein. Mehrverbrauch wird zu transparenten Einheitspreisen abgerechnet, die im Dashboard sichtbar sind. Du siehst den Verbrauch live und wir fragen, bevor sich etwas ändert.",
      },
    ],
  },
};
// ---------------------------------------------------------------------------

/**
 * Recursively apply string replacements to all string values in an object.
 * Used to create AT/CH landing variants from DE base without duplicating
 * 300+ lines — only the jurisdiction-specific terms are replaced.
 */
export function applyReplacements<T>(obj: T, replacements: Record<string, string>): T {
  if (typeof obj === "string") {
    let result: string = obj as string;
    for (const [from, to] of Object.entries(replacements)) {
      result = result.split(from).join(to);
    }
    return result as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => applyReplacements(item, replacements)) as unknown as T;
  }
  if (typeof obj === "object" && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      result[key] = applyReplacements((obj as Record<string, unknown>)[key], replacements);
    }
    return result as unknown as T;
  }
  return obj;
}

/** AT-specific string replacements applied to DE base content. */
export const AT_REPLACEMENTS: Record<string, string> = {
  "ZPO/BGB/ABGB": "ZPO/ABGB",
  "ZPO, BGB und ABGB": "ZPO und ABGB",
  "§ 43a BRAO, § 10 RAO, BGFA": "§ 10 RAO und BGFA",
  "§ 43a BRAO (DE), § 10 RAO (AT) und BGFA (CH)": "§ 10 RAO (AT) und BGFA (CH)",
  "§ 203 StGB": "§ 9 RAO",
  "DATEV-Export (DE) und ADATEV (AT)": "ADATEV-Export",
  "DATEV-Export (DE) oder ADATEV (AT)": "ADATEV-Export",
  "und DATEV": "und ADATEV",
  "für Deutschland": "für Österreich",
  "in Deutschland": "in Österreich",
  // NOTE: No Du→Sie conversion — the whole DACH site addresses the reader
  // informally with "Du". AT keeps only jurisdiction + Austrian-spelling swaps.
  Schadensersatz: "Schadenersatz",
  Schmerzensgeld: "Schmerzengeld",
  "ZPO & BGB": "ZPO & ABGB",
  "ZPO/BGB": "ZPO/ABGB",
  "DATEV-ready": "ADATEV-ready",
  "DATEV-Export": "ADATEV-Export",
  "& DATEV": "& ADATEV",
  "§ 43a BRAO / § 10 RAO / BGFA": "§ 10 RAO / § 43a BRAO / BGFA",
};

/** CH-specific string replacements applied to DE base content. */
const CH_REPLACEMENTS: Record<string, string> = {
  "ZPO/BGB/ABGB": "ZPO/OR/ZGB",
  "ZPO, BGB und ABGB": "ZPO, OR und ZGB",
  "§ 43a BRAO, § 10 RAO, BGFA": "BGFA",
  "§ 43a BRAO (DE), § 10 RAO (AT) und BGFA (CH)": "BGFA (CH), § 43a BRAO (DE) und § 10 RAO (AT)",
  "§ 203 StGB": "Art. 321 StGB",
  "DATEV-Export (DE) und ADATEV (AT)": "Swissdec-Export",
  "DATEV-Export (DE) oder ADATEV (AT)": "Swissdec-Export",
  "und DATEV": "und Swissdec",
  "für Deutschland": "für die Schweiz",
  "in Deutschland": "in der Schweiz",
  "Landesgericht Wien": "Bezirksgericht Zürich",
  "84.000 €": "CHF 84'000",
  // NOTE: No Du→Sie conversion — the whole DACH site uses informal "Du".
  // CH keeps only jurisdiction + currency/court swaps.
};

const _landingDe = {
  badge: "KI-Kanzleisoftware & Anwaltssoftware für Deutschland",
  heroBadges: [
    "Neu: 99,8 % Recall mit 5-Layer-Verifikation",
    "§ 203 StGB-konform durch Architektur",
    "EU-Cloud oder On-Premise — deine Wahl",
  ],
  h1a: "Antworten aus deinen Akten.",
  h1b: "Mit Quelle. In Sekunden.",
  heroTagline: "KI-Kanzleisoftware für Anwälte in Deutschland — mit belegten Antworten.",
  sub: "Du fragst in normaler Sprache — Subsumio antwortet mit seitengenauen Fundstellen aus deinen Akten. Für Anwälte in Deutschland, Österreich und der Schweiz.",
  heroTrustItems: [
    { icon: "CreditCard", label: "Keine Kreditkarte" },
    { icon: "Scale", label: "§ 203 StGB" },
    { icon: "Globe", label: "EU-Cloud" },
  ],
  heroQACard: {
    question: "Wo widersprechen sich die Schriftsätze der Gegenseite?",
    answer:
      "Akte Bauer ./. Hofer: Plädoyer der Gegenseite S. 3 claims „keine Kenntnis“ vom Vertrag — S. 7 zitiert denselben Vertrag als Beleg. Widerspruch erkannt.",
    sources: [
      { label: "akte/bauer-hofer", href: "/superbrain" },
      { label: "schriftsatz/gegenseite", href: "/superbrain" },
    ],
    confidenceLabel: "5-Layer verifiziert",
  },
  trustStripItems: [
    { icon: "ShieldCheck", label: "DSGVO-konform" },
    { icon: "BadgeCheck", label: "SOC 2 Vorbereitung" },
    { icon: "FileCheck", label: "ISO 27001 geplant" },
    { icon: "Globe", label: "EU-Cloud" },
    { icon: "Server", label: "On-Premise" },
  ],
  painTitle: "Was kostet dich Suchen — jeden Tag?",
  painSub:
    "Jede Kanzlei verliert abrechenbare Zeit an Dinge, die eine Maschine besser macht — wenn sie für Anwälte gebaut ist.",
  pains: [
    {
      value: "40 %",
      label: "abrechenbare Zeit geht für Recherche und Wiederauffinden verloren",
    },
    {
      value: "1 Notfrist",
      label: "genügt für einen Haftpflichtfall — menschlich übersehen, maschinell vermeidbar",
    },
    {
      value: "3 Std.",
      label: "pro Schriftsatz für manuelle Quellenprüfung — Subsumio braucht Sekunden",
    },
    {
      value: "Wochen",
      label: "Einarbeitung neuer Mitarbeiter, bis sie das Kanzleiwissen selbständig finden",
    },
  ],
  ctaPrimary: "14 Tage kostenlos testen",
  ctaSecondary: "Live-Demo ansehen",
  demo: {
    windowTitle: "subsumio — fragen",
    you: "Du",
    q: "Was muss ich vor der Verhandlung Bauer morgen wissen?",
    a: `Akte Bauer ./. Hofer GmbH — Vertragsbruch, 84.000 €. Landesgericht Wien, Abt. 12. Verhandlung morgen, 09:30.

**3 offene Punkte:**
1. Replik heute fällig — entworfen, noch nicht eingebracht
2. Gutachten von Dr. Klein fehlt noch (angefordert 3. März)
3. Mandant hat den vorgeschlagenen Vergleichsrahmen nicht bestätigt

⚠️ Frist: Die Replik ist eine Notfrist — Einbringung endet um Mitternacht. Zum Gutachten seit 3. März nichts Neues — nachfassen.`,
    sourcesLabel: "Quellen:",
    sources: ["akten/bauer-hofer", "fristen/replik", "dokumente/gutachten-klein"],
  },
  showreel: {
    turns: [
      {
        question: "Was muss ich vor der Verhandlung Bauer morgen wissen?",
        answer:
          "Akte Bauer ./. Hofer GmbH — Vertragsbruch, 84.000 €. LG Wien, Abt. 12. Verhandlung morgen 09:30. 3 offene Punkte: Replik heute fällig, Gutachten Dr. Klein fehlt, Vergleich unbestätigt. ⚠️ Notfrist — Einbringung endet um Mitternacht.",
        sources: ["akten/bauer-hofer", "fristen/replik", "dokumente/gutachten-klein"],
      },
      {
        question: "Wo widersprechen sich die Schriftsätze der Gegenseite?",
        answer:
          'Plädoyer S. 3: „keine Kenntnis" vom Vertrag. S. 7: zitiert denselben Vertrag als Beleg. Widerspruch erkannt — Beweiswert geschwächt.',
        sources: ["schriftsatz/gegenseite", "akten/bauer-hofer"],
      },
      {
        question: "Entwirf die Replik dafür.",
        answer:
          "Argument 1: Widerspruch S.3 vs S.7 — Beweiswert geschwächt. Argument 2: Vertragskenntnis nach S.7 begründet Leistungspflicht. Antrag: Beweiswürdigung auf Widerspruch stützen.",
        sources: ["zpo/§520", "akten/bauer-hofer"],
      },
    ],
  },
  stats: [
    { value: "99,8 %", label: "Retrieval-Trefferquote (Recall@8, LongMemEval, 500 Fragen)" },
    { value: "3", label: "Jurisdiktionen: AT, DE, CH" },
    { value: "0", label: "Mandantendaten-Lecks — by design" },
    { value: "14", label: "Tage gratis testen" },
  ],
  statsNote:
    "Engine-Klasse Retrieval, kein Chat-Wrapper. Jede Antwort nennt die Quelle — oder sagt ehrlich, wenn die Akte nichts hergibt.",
  featuresTitle: "Was deine Kanzlei ab heute kann",
  featuresSub: "Sechs Fähigkeiten, gebaut für Anwälte — nicht nachträglich angepasst.",
  features: [
    {
      icon: "Brain",
      color: "violet",
      title: "Antworten mit Fundstellen",
      desc: "Jede Antwort zitiert die exakte Stelle in deinen Akten. Ein Klick zur Verifikation — keine halluzinierten Quellen, keine Blackbox.",
    },
    {
      icon: "CalendarClock",
      color: "amber",
      title: "Fristen automatisch berechnet",
      desc: "Not- und Berufungsfristen nach ZPO, BGB und ABGB — mit Feiertagsverschiebung. Der tägliche Digest markiert, was kritisch wird.",
    },
    {
      icon: "MessageSquare",
      color: "emerald",
      title: "Alles über WhatsApp — ohne App-Wechsel",
      desc: "Zeiten buchen, Dokumente ablegen, Sprachnotizen vom Handy. Alles landet in der richtigen Akte — GoBD-konform.",
    },
    {
      icon: "ShieldAlert",
      color: "rose",
      title: "Konflikte vor Mandatsannahme",
      desc: "Jeder neue Mandant wird gegen den gesamten Aktenbestand geprüft — § 43a BRAO, § 10 RAO, BGFA. Konflikte vor Mandatsannahme.",
    },
    {
      icon: "Calculator",
      color: "blue",
      title: "Minuten buchen, Rechnungen in einem Klick",
      desc: "Minuten buchen, Auslagen erfassen, Rechnungen erstellen. DATEV-Export (DE) und ADATEV (AT) in einem Klick.",
    },
    {
      icon: "Shield",
      color: "violet",
      title: "Deine Daten, deine Kontrolle",
      desc: "Die Engine auf deiner Hardware mit deinen Schlüsseln — oder verwaltete EU-Cloud mit AVV. Deine Daten, deine Kontrolle.",
    },
  ],
  howTitle: "So funktioniert KI-Kanzleisoftware: vom Dokument zur belegten Antwort",
  how: [
    {
      step: "01",
      icon: "Database",
      title: "Dokumente einpflegen",
      desc: "Akten, Mails, PDFs, Sprachnotizen, WhatsApp-Nachrichten. Subsumio zerlegt, vektorisiert und indiziert automatisch — OCR extrahiert Text auch aus gescannten Dokumenten.",
    },
    {
      step: "02",
      icon: "Network",
      title: "Wissensgraph aufbauen",
      desc: "Bei jedem Speichern erkennt die Engine Personen, Fristen und Beziehungen und baut daraus einen juristischen Wissensgraphen. Vollautomatisch, ohne manuelle Datenpflege.",
    },
    {
      step: "03",
      icon: "Search",
      title: "In normaler Sprache fragen",
      desc: "Fragen in Alltagssprache. Hybride Suche aus Vektor, Stichwort und Graph findet die entscheidenden Passagen — über alle Akten und Schriftsätze hinweg.",
    },
    {
      step: "04",
      icon: "Brain",
      title: "Antwort mit Fundstellen + Gap-Analyse",
      desc: "Eine synthetisierte Antwort mit seitengenauen Zitaten — plus ehrlicher Hinweis, was in der Akte noch fehlt. Die Gap-Analyse zeigt offene Risiken, bevor sie zu Problemen werden.",
    },
  ],
  scenariosTitle: "Ein Tag mit Subsumio",
  scenariosSub:
    "Drei Momente, die zeigen, was sich ändert — nicht in der Theorie, sondern im Alltag.",
  scenarios: [
    {
      role: "Morgen · 07:30",
      text: "Du trinkst Kaffee. Subsumio hat schon alle Fristen für heute geprüft — eine Notfrist läuft um Mitternacht, markiert und mit der Akte verlinkt. Der tägliche Digest liegt im Posteingang. Du weißt, was heute wichtig ist, bevor du den ersten Schriftsatz öffnest.",
    },
    {
      role: "Mittag · 12:15",
      text: "Auf dem Rückweg vom Gericht: „Zeit 0,5h Akte Müller, Widerspruch S.3 vs S.7 prüfen.“ Subsumio bucht die Zeit, findet den Widerspruch in den Schriftsätzen, legt alles in der Akte ab — während du noch unterwegs bist.",
    },
    {
      role: "Abend · 18:45",
      text: "„Entwirf die Replik dafür.“ Subsumio zieht die Argumente aus den Akten, zitiert S.3 und S.7, schlägt den Antrag vor. Du prüfst die Fundstellen in einem Klick, bestätigst, fertig. Der Schriftsatz geht raus — mit Quellen, nicht mit Bauchgefühl.",
    },
  ],
  comparisonTitle: "Warum nicht einfach ChatGPT, Notion AI oder eine Vektor-Datenbank?",
  comparisonSub: "Allgemeine KI-Tools sind nicht für Anwälte gebaut. Subsumio ist es.",
  comparison: [
    {
      feature: "Fundstellen pro Antwort",
      subsumio: "Seitengenaue Zitate aus deinen Akten",
      others: "Keine Fundstellen oder unüberprüfbar",
    },
    {
      feature: "Halluzination-Schutz",
      subsumio: "Gap-Analyse statt Halluzination — sagt ‚keine Antwort‘",
      others: "Halluziniert Quellen und Paragrafen",
    },
    {
      feature: "Berufsgeheimnis (§ 203 StGB)",
      subsumio: "Self-Hosting oder EU-Cloud mit AVV — kein Dritter sieht Mandantendaten",
      others: "US-Cloud, kein AVV, keine Berufsgeheimnis-Konformität",
    },
    {
      feature: "DACH-Recht",
      subsumio: "ABGB, BGB, ZGB, ZPO, EO, HGB — korrekte Fristen und Paragrafen",
      others: "Keine DACH-spezifische Rechtskenntnis",
    },
    {
      feature: "Training auf Mandantendaten",
      subsumio: "Nein — niemals",
      others: "Oft ja, oder unklar",
    },
  ],
  faqTitle: "Häufige Fragen",
  faq: [
    {
      q: "Was unterscheidet Subsumio von ChatGPT, Notion AI oder einer Vektor-Datenbank?",
      a: `Jene liefern Dokumente oder Textabschnitte. Subsumio liefert eine synthetisierte Antwort mit seitengenauen Zitaten, nutzt einen typisierten Wissensgraphen für Beziehungsfragen und zeigt explizit, was in der Akte noch fehlt (Gap-Analyse). Der Unterschied zwischen „irgendwo steht etwas" und „hier steht die Antwort, und hier fehlt noch etwas".`,
    },
    {
      q: "Wo liegen meine Daten — und ist das § 203 StGB-konform?",
      a: "Du wählst: Self-Hosting auf eigener Hardware mit eigenen Schlüsseln, oder verwaltete EU-Cloud mit AVV. Mandantendaten verlassen nie die EU. Kein Dritter verarbeitet sie ohne ausdrückliche Freigabe. Die Architektur ist für Berufsgeheimnisträger gebaut — § 203 StGB, § 9 RAO, BGFA.",
    },
    {
      q: "Brauche ich IT-Kenntnisse oder eigene Server?",
      a: "Nein. Bei gehosteten Plänen ist alles verwaltet — keine API-Keys, keine Infrastruktur. Du lädst Dokumente hoch, stellst Fragen, bekommst Antworten. Wenn du E-Mails schreiben kannst, kannst du Subsumio bedienen. Enterprise-On-Premise läuft auf deiner Hardware mit deinen Schlüsseln.",
    },
    {
      q: "Trainiert Subsumio auf meinen Daten?",
      a: "Niemals. Dein Kanzleiwissen gehört dir. On-Premise bleibt alles auf deiner Infrastruktur. In der EU-Cloud wird es verschlüsselt und mandantensepariert verarbeitet — keine andere Kanzlei hat Zugriff.",
    },
    {
      q: "Funktioniert das mit unserer bestehenden Software?",
      a: "Ja. Subsumio importiert aus DATEV, RA-Micro, anwalt.de und jedem System, das Dokumente exportieren kann. E-Mails über IMAP, WhatsApp über Meta Business API. Subsumio ersetzt nichts — es ergänzt deine Software um ein Kanzlei-Brain.",
    },
    {
      q: "Was passiert, wenn eine Antwort falsch ist?",
      a: "Jede Antwort nennt die Quelle — du prüfst in einem Klick. Wenn die Akte keine Antwort enthält, sagt Subsumio das explizit statt zu halluzinieren. Du behältst immer die letzte Entscheidung.",
    },
    {
      q: "Wie werden Fristen berechnet?",
      a: "Not- und Berufungsfristen nach ZPO, BGB und ABGB — mit korrekter Monatsarithmetik und Feiertagsverschiebung. Eingehende Dokumente werden auf fristauslösende Ereignisse analysiert. Der tägliche Digest markiert kritische Fristen vor Ablauf.",
    },
    {
      q: "Was kostet Subsumio — und gibt es versteckte Gebühren?",
      a: "Community kostenlos, Pro ab 890 €/Nutzer/Mon., Team ab 1.290 €, Enterprise ab 1.890 €. Jahreszahlung spart 20 %. Mehrverbrauch zu transparenten Einheitspreisen — sichtbar im Dashboard. 14 Tage gratis, keine Kreditkarte.",
    },
  ],
  ctaTitle: "Hör auf zu suchen. Fang an zu fragen.",
  ctaSub:
    "14 Tage volle Testversion. Keine Kreditkarte, kein IT-Aufwand. Dein Team ist morgen produktiver.",
  ctaButton: "14 Tage kostenlos testen",
  relatedLinks: [
    { label: "Preise & Pläne", href: "/pricing" },
    { label: "Sicherheit & § 203 StGB", href: "/security" },
    { label: "Features im Überblick", href: "/features" },
    { label: "Für Einzelanwälte", href: "/solutions/solo" },
    { label: "Für Kanzleien", href: "/solutions/law-firms" },
  ],
};

const _landingEn = {
  badge: "AI legal software & law firm software for Europe",
  heroBadges: [
    "New: 99.8% Recall with 5-layer verification",
    "§ 203 StGB compliant by architecture",
    "EU-Cloud or On-Premise — your choice",
  ],
  h1a: "Answers from your files.",
  h1b: "Cited. In seconds.",
  heroTagline: "AI legal software for lawyers in Europe — with cited answers.",
  sub: "Ask in plain language — Subsumio answers with page-level citations from your files. For lawyers in Germany, Austria and Switzerland.",
  heroTrustItems: [
    { icon: "CreditCard", label: "No credit card" },
    { icon: "Scale", label: "§ 203 StGB" },
    { icon: "Globe", label: "EU-Cloud" },
  ],
  heroQACard: {
    question: "Where do the opposing party's filings contradict each other?",
    answer:
      'Matter Bauer ./. Hofer: Opposing counsel\'s brief p. 3 claims "no knowledge" of the contract — p. 7 cites the same contract as evidence. Contradiction found.',
    sources: [
      { label: "matter/bauer-hofer", href: "/superbrain" },
      { label: "brief/opposing-counsel", href: "/superbrain" },
    ],
    confidenceLabel: "5-layer verified",
  },
  trustStripItems: [
    { icon: "ShieldCheck", label: "GDPR-ready" },
    { icon: "BadgeCheck", label: "SOC 2 preparation" },
    { icon: "FileCheck", label: "ISO 27001 planned" },
    { icon: "Globe", label: "EU-Cloud" },
    { icon: "Server", label: "On-Premise" },
  ],
  painTitle: "What does searching cost you — every day?",
  painSub:
    "Every firm loses billable time to things a machine does better — when it's built for lawyers.",
  pains: [
    {
      value: "40%",
      label: "of billable time lost to research and re-finding documents",
    },
    {
      value: "1 deadline",
      label: "a single missed statutory deadline is enough for a malpractice claim",
    },
    { value: "3 hrs", label: "per brief for manual citation checking — Subsumio takes seconds" },
    {
      value: "Weeks",
      label: "onboarding new associates, until they can navigate firm knowledge alone",
    },
  ],
  ctaPrimary: "Start free trial",
  ctaSecondary: "See it live",
  demo: {
    windowTitle: "subsumio — ask",
    you: "You",
    q: "What do I need to know before the Bauer hearing tomorrow?",
    a: `Matter Bauer ./. Hofer GmbH — breach of contract, € 84,000. Regional Court Vienna, Dept. 12. Hearing tomorrow, 09:30.

**3 things still open:**
1. Reply brief due today — drafted, not yet filed
2. Expert report from Dr. Klein still missing (requested March 3)
3. Client hasn't confirmed the settlement range you proposed

⚠️ Deadline: the reply brief is a statutory deadline — filing closes at midnight. Nothing newer than March 3 on the expert — follow up.`,
    sourcesLabel: "Sources:",
    sources: ["matters/bauer-hofer", "deadlines/reply-brief", "documents/expert-klein"],
  },
  showreel: {
    turns: [
      {
        question: "What do I need to know before the Bauer hearing tomorrow?",
        answer:
          "Matter Bauer ./. Hofer Inc — breach of contract, €84,000. Vienna Regional Court, Dept. 12. Hearing tomorrow 09:30. 3 open items: reply brief due today, expert report Dr. Klein missing, settlement unconfirmed. ⚠️ Statutory deadline — filing closes at midnight.",
        sources: ["matters/bauer-hofer", "deadlines/reply-brief", "documents/expert-klein"],
      },
      {
        question: "Where do the opposing party's filings contradict each other?",
        answer:
          'Brief p. 3: "no knowledge" of the contract. p. 7: cites the same contract as evidence. Contradiction found — evidentiary value weakened.',
        sources: ["brief/opposing-counsel", "matters/bauer-hofer"],
      },
      {
        question: "Draft the reply brief for this.",
        answer:
          "Argument 1: Contradiction p.3 vs p.7 — evidentiary value weakened. Argument 2: Contract knowledge per p.7 establishes performance obligation. Prayer: rely on contradiction in evidence assessment.",
        sources: ["cpc/§520", "matters/bauer-hofer"],
      },
    ],
  },
  stats: [
    { value: "99.8%", label: "Retrieval accuracy (Recall@8, LongMemEval, 500 questions)" },
    { value: "3", label: "Jurisdictions: AT, DE, CH" },
    { value: "0", label: "Client-data leaks — by design" },
    { value: "14", label: "Days free trial" },
  ],
  statsNote:
    "Engine-class retrieval, not a chat wrapper. Every answer cites its source — or honestly says the file doesn't contain one.",
  featuresTitle: "What your firm can do from today",
  featuresSub: "Six capabilities, built for lawyers — not adapted for them.",
  features: [
    {
      icon: "Brain",
      color: "violet",
      title: "Answers with citations",
      desc: "Every answer cites the exact page in your files. One click to verify — no hallucinated sources, no black box.",
    },
    {
      icon: "CalendarClock",
      color: "amber",
      title: "Deadlines, automatically",
      desc: "Statutory and appeal deadlines per ZPO/BGB/ABGB — with holiday roll-forward. The daily digest flags what's critical.",
    },
    {
      icon: "MessageSquare",
      color: "emerald",
      title: "Everything via WhatsApp — no app switching",
      desc: "Book time, file documents, send voice notes from your phone. Everything lands in the right matter — GoBD-compliant.",
    },
    {
      icon: "ShieldAlert",
      color: "rose",
      title: "Conflicts caught before intake",
      desc: "Every new client checked against your entire matter database — § 43a BRAO, § 10 RAO, BGFA. Conflicts before mandate acceptance.",
    },
    {
      icon: "Calculator",
      color: "blue",
      title: "Track time, bill in one click",
      desc: "Book minutes, track expenses, generate invoices. DATEV export (DE) and ADATEV (AT) in one click.",
    },
    {
      icon: "Shield",
      color: "violet",
      title: "Your data, your control",
      desc: "The engine on your hardware with your keys — or managed EU cloud with DPA. Your data, your control.",
    },
  ],
  howTitle: "How AI legal software works: from document to cited answer",
  how: [
    {
      step: "01",
      icon: "Database",
      title: "Feed it",
      desc: "Matters, emails, PDFs, voice notes, WhatsApp. Subsumio chunks, embeds and indexes automatically. OCR pulls text from scans too.",
    },
    {
      step: "02",
      icon: "Network",
      title: "It understands",
      desc: "On every write, typed edges — people, deadlines, relationships — are extracted as a legal knowledge graph. No extra LLM calls, no manual data entry.",
    },
    {
      step: "03",
      icon: "Search",
      title: "Ask",
      desc: "Plain-language questions. Hybrid retrieval across vector, keyword and graph finds the decisive passages — across all matters and pleadings.",
    },
    {
      step: "04",
      icon: "Brain",
      title: "Answer with citations + gap analysis",
      desc: "A synthesized answer with page-level citations — plus an honest note on what the file is still missing. The gap analysis surfaces open risks before they become problems.",
    },
  ],
  scenariosTitle: "A day with Subsumio",
  scenariosSub: "Three moments that show what changes — not in theory, but in daily practice.",
  scenarios: [
    {
      role: "Morning · 07:30",
      text: "You drink coffee. Subsumio has already checked all deadlines for today — a statutory deadline expires at midnight, flagged and linked to the matter. The daily digest is in your inbox. You know what matters today before you open the first brief.",
    },
    {
      role: "Noon · 12:15",
      text: 'On your way back from court: "Book 0.5h matter Müller, check contradiction p.3 vs p.7." Subsumio books the time, finds the contradiction in the filings, files everything in the matter — while you\'re still on your way back.',
    },
    {
      role: "Evening · 18:45",
      text: '"Draft the reply brief for this." Subsumio pulls the arguments from the files, cites p.3 and p.7, proposes the prayer. You verify the citations in one click, confirm, done. The brief goes out — with sources, not gut feeling.',
    },
  ],
  comparisonTitle: "Why not just ChatGPT, Notion AI or a vector database?",
  comparisonSub: "General AI tools aren't built for lawyers. Subsumio is.",
  comparison: [
    {
      feature: "Citations per answer",
      subsumio: "Page-level citations from your matters",
      others: "No citations or unverifiable",
    },
    {
      feature: "Hallucination guard",
      subsumio: "Gap analysis instead of hallucination — says 'no answer'",
      others: "Hallucinates sources and statutes",
    },
    {
      feature: "Professional secrecy (§ 203 StGB)",
      subsumio: "Self-hosting or EU cloud with DPA — no third party sees client data",
      others: "US cloud, no DPA, no professional secrecy compliance",
    },
    {
      feature: "DACH law",
      subsumio: "ABGB, BGB, ZGB, ZPO, EO, HGB — correct deadlines and statutes",
      others: "No DACH-specific legal knowledge",
    },
    {
      feature: "Training on client data",
      subsumio: "No — never",
      others: "Often yes, or unclear",
    },
  ],
  faqTitle: "Common questions",
  faq: [
    {
      q: "How is this different from ChatGPT, Notion AI or a vector database?",
      a: `Those return documents or chunks. Subsumio returns a synthesized answer with page-level citations, uses a typed knowledge graph for relationship questions, and tells you what it doesn't know — the gap analysis. The difference between "something somewhere says X" and "here's the answer, and here's what's still missing".`,
    },
    {
      q: "Where does my data live — and is it § 203 StGB compliant?",
      a: "Your choice: self-host on your own hardware with your own keys, or managed EU cloud with DPA. Client data never leaves the EU. No third party processes it without explicit release. The architecture is built for confidentiality holders — § 203 StGB, § 9 RAO, BGFA.",
    },
    {
      q: "Do I need IT skills or my own servers?",
      a: "No. Hosted plans are fully managed — no API keys, no infrastructure. Upload documents, ask questions, get answers. If you can write an email, you can use Subsumio. Enterprise on-premise runs on your hardware with your keys.",
    },
    {
      q: "Do you train on our data?",
      a: "Never. Your knowledge is yours. On-premise stays on your infrastructure. In the EU cloud it's encrypted and isolated per customer — no other firm has access.",
    },
    {
      q: "Does it work with our existing software?",
      a: "Yes. Subsumio imports from DATEV, RA-Micro, anwalt.de and any system that exports documents. Emails via IMAP, WhatsApp via Meta Business API. Subsumio doesn't replace anything — it adds a firm brain to your existing stack.",
    },
    {
      q: "What happens if an answer is wrong?",
      a: "Every answer cites its source — you verify in one click. If the file doesn't contain an answer, Subsumio says so explicitly instead of hallucinating. You always keep the final decision.",
    },
    {
      q: "How are deadlines calculated?",
      a: "Statutory and appeal deadlines per ZPO, BGB and ABGB — with correct month arithmetic and holiday roll-forward. Incoming documents are analyzed for deadline-triggering events. The daily digest flags critical deadlines before they expire.",
    },
    {
      q: "What does Subsumio cost — and are there hidden fees?",
      a: "Community free, Pro from €890/user/mo., Team from €1,290, Enterprise from €1,890. Annual billing saves 20%. Overages at transparent per-unit rates — visible in the dashboard. 14 days free, no credit card.",
    },
  ],
  ctaTitle: "Stop searching. Start asking.",
  ctaSub: "14 days full trial. No credit card, no IT setup. Your team is more productive tomorrow.",
  ctaButton: "Start free trial",
  relatedLinks: [
    { label: "Pricing & plans", href: "/en/pricing" },
    { label: "Security & § 203 StGB", href: "/en/security" },
    { label: "Features overview", href: "/en/features" },
    { label: "For solo lawyers", href: "/en/solutions/solo" },
    { label: "For law firms", href: "/en/solutions/law-firms" },
  ],
};

export const LANDING = {
  en: _landingEn,
  de: _landingDe,
  at: applyReplacements(JSON.parse(JSON.stringify(_landingDe)), AT_REPLACEMENTS),
  ch: applyReplacements(JSON.parse(JSON.stringify(_landingDe)), CH_REPLACEMENTS),
};

// ---------------------------------------------------------------------------
// UI_STRINGS — shared bilingual strings used across marketing components.
// Single source of truth for inline labels, badges, aria-labels, CTAs.
// ---------------------------------------------------------------------------

const _uiStringsDe: Record<string, string> = {
  skipToContent: "Zum Inhalt springen",
  ariaMainNav: "Hauptnavigation",
  ariaHome: "Subsumio Startseite",
  ariaMobileNav: "Mobile Navigation",
  ariaCloseMenu: "Menü schließen",
  ariaLanguage: "Sprache",
  footerLegalTagline: "KI-Kanzleisoftware & Legal Intelligence für Anwälte",
  footerHostingLine:
    "EU-Cloud oder On-Premise · DSGVO-konform · AVV inklusive · § 203 StGB-konform",
  // Landing — trust signals
  noCreditCard: "Keine Kreditkarte",
  trialDaysFree: "14 Tage gratis · Keine Kreditkarte",
  threeMinAnswer: "3 Min. zur ersten belegten Antwort",
  euHosted: "EU-gehostet oder On-Premise",
  liveDemoAria: "Live-Demo",
  inActionBadge: "In Aktion",
  dashboardTitle: "Datei anhängen. Fragen. Fundstellen statt Halluzination.",
  dashboardSub:
    "Dateien per Upload, Google Drive oder Anwaltssoftware in die Wissensbasis — dann im Chat fragen, mit seitengenauen Fundstellen.",
  seeFullPricing: "Alle Preisdetails ansehen",
  gdprReady: "DSGVO-konform",
  professionalSecrecy: "Berufsgeheimnis per Architektur",
  // Pricing page
  transparentFair: "Transparent & fair",
  noGamesTitle: "Keine Spielchen bei den Preisen",
  noGamesSub: "Kein Kleingedrucktes, keine Überraschungen auf der Rechnung.",
  stillQuestions: "Noch Fragen?",
  writeUs: "Schreib uns — wir antworten persönlich.",
  startFree: "Kostenlos starten",
  seePlans: "Pläne ansehen",
  trustedBy: "Vertraut von Kanzleien in Deutschland · AT · CH",
  watchDemo: "Demo ansehen",
  trySubsumio: "Subsumio testen",
  ariaFeatures: "Features",
  ariaPricing: "Preise",
  ariaKeyMetrics: "Kennzahlen",
  ariaFaq: "FAQ",
  ariaCta: "Handlungsaufforderung",
  ariaComparison: "Vergleich",
  ariaRealWorkflows: "Praxis-Workflows",
  ariaCostOfInaction: "Was es dich kostet",
  ariaUseCases: "Anwendungsfälle",
  ariaCompliance: "Compliance & Integrationen",
  ariaFaqSuperbrain: "Häufig gestellte Fragen",
  ariaSecurityTrust: "Sicherheit & Vertrauen",
  comparisonTableLabel: "Vergleich: Subsumio vs. andere KI-Tools",
  comparisonFeature: "Funktion",
  comparisonOthers: "Andere KI-Tools",
  exploreAllFeatures: "Alle Features ansehen",
  readSecurityDetails: "Security-Details ansehen",
  seePricingPlans: "Preise ansehen",
  faqSuperbrainTitle: "Häufig gestellte Fragen",
  faqSuperbrainSub:
    "Alles, was du über das SuperBrain, den Dream Cycle und die 5-Ebenen-Architektur wissen musst.",
  youLabel: "Du",
  sourcesLabel: "Quellen:",
  thinkingLabel: "Durchsuche Wissensgraph…",
  // Hero card verification pass — the answer is shown at once, only the
  // proof-checking is animated (see hero-qa-card.tsx).
  verifyingLabel: "Belege werden geprüft",
  verifiedLabel: "Belege im Korpus gefunden",
  citePendingLabel: "wird geprüft",
  scrollToExplore: "Scrollen zum Erkunden",
  certificationsEyebrow: "Zertifizierungen & Integrationen",
  trustHeading: "Vertrauen, das man belegen kann",
  testimonialsTitle: "Was Anwälte über Subsumio sagen",
  testimonialsSub: "Echte Stimmen aus Kanzleien in AT, DE und CH.",
  navOverview: "Übersicht",
  navMatters: "Akten",
  navDeadlines: "Fristen",
  navIntake: "Intake",
  navChat: "Chat",
  workflowMatter: "Akte",
  workflowDoc: "Dok",
  workflowRisk: "Risiko",
  workflowTask: "Aufgabe",
  featuresWorkflowTitle: "Jede Funktion läuft als Kanzlei-Workflow.",
  featuresWorkflowSub:
    "Akte, Copilot, Frist, Quelle und Freigabe greifen ineinander. Deshalb beschreibt Subsumio jede Funktion im Kontext der Oberfläche, in der Anwälte sie wirklich benutzen.",
  featuresChecklist1: "Quelle geprüft",
  featuresChecklist2: "Berechtigung aktiv",
  featuresChecklist3: "Nächster Schritt vorbereitet",
  featuresGraphCaption: "typisierte Kanten, bei jedem Speichern erkannt",
  featuresSecurityTitle: "Gebaut für vertrauliche Arbeit",
  featuresSecuritySub:
    "On-Premise-Betrieb, getestete Isolation, EU-AI-Act-Compliance und eine ehrliche Roadmap. Die vollständige Sicherheits- und Datenschutzdarstellung hat eine eigene Seite.",
  featuresGlanceTitle: "Fünf Funktionsbereiche, eine Engine",
  featuresEmptyState:
    "Durch Tests erzwungen, nicht durch Policy-Dokumente — deterministisches, prüfbares Verhalten.",
  downloadHint: "3 offene Zusagen in 4 Meetings diese Woche —",
  verticalSeePricing: "Preise ansehen",
  verticalSeeLive: "Live ansehen",
  verticalTrialNote:
    "14 Tage Reverse Trial · 14 Tage Geld-zurück-Garantie · Keine Kreditkarte erforderlich",
  verticalTrustNote: "Self-hosted · EU-Cloud · DSGVO-konform · § 203 StGB im Blick",
  verticalFeaturesSub:
    "Von Fristenkontrolle bis Widerspruchserkennung — alles auf deiner Infrastruktur, jede Antwort mit Fundstelle.",
  subpagesConfirmationNote: "Alles bestätigungspflichtig — nichts landet ungesehen in der Akte.",
  typingLabel: "tippt…",
  todayLabel: "Heute",
  confirmedLabel: "Bestätigt",
  messageLabel: "Nachricht",
  verificationLabel: "5-Layer verifiziert",
  tryYourselfLabel: "Jetzt selbst fragen",
  replayLabel: "Nochmal ansehen",
  askLabel: "Fragen",
  placeholderDemo: "Frag das Demo-Brain…",
  liveLabel: "live",
  liveDemoPrefix: "Live aus dem Demo-Brain:",
  ariaProductDemo: "Produkt-Demo Konversation",
  ariaSubsumioEngine: "Die Subsumio-Engine",
  engineTraits: "abfragbar · belegt · isoliert",
  lawFirmLabel: "Rechtsanwälte",
  lawFirmName: "Kanzlei Müller",
  activeLabel: "Aktiv",
  scriptedLabel: "Beispiel-Antwort · Live-Brain nach Deploy",
  rateLimitLabel: "Demo-Limit erreicht — später erneut.",
  noDemoMatches: "Keine Demo-Treffer — hier die Beispiel-Antwort.",
  demoReadOnlyNote: "Read-only Demo-Brain · deine Daten bleiben bei dir",
  // Solution page
  seePlatform: "Plattform ansehen",
  questionsAnswered: "Fragen, beantwortet",
  notQuiteRight: "Nicht ganz das Richtige für dich?",
  // Audience tabs
  seeSolution: "Lösung ansehen",
  // Subsumio subpages
  backToOverview: "Zur Übersicht",
  timeExpenses: "Zeit & Auslagen in Sekunden",
  timeExpensesDesc:
    "„Zeit 0,5h Akte Müller, Telefonat“ → erfasst, der Akte zugeordnet, ein Tipp zum Bestätigen.",
  receiptPhoto: "Beleg-Foto → richtige Akte",
  receiptPhotoDesc:
    "Dokument oder Foto mit Akten-Kürzel in der Caption landet revisionssicher im Vault.",
  voiceNote: "Sprachnotiz unterwegs",
  voiceNoteDesc:
    "Diktat nach dem Termin — transkribiert und der Akte angehängt, bevor du im Büro bist.",
  // Docs page
  dashboardNotDatasheet: "Dashboard statt Datenblatt",
  docsTitle: "Jede Beschreibung zeigt auf einen echten Kanzlei-Workflow.",
  docsSub:
    "Die Docs sind nicht als rohe API-Liste gedacht. Sie erklären, welche Funktion im Dashboard sichtbar ist, welchen Kanzlei-Prozess sie verbessert und welche Sicherheitsannahme dahintersteht.",
  // Back to top
  backToTopAria: "Zurück nach oben",
  // Docs page extras
  docsSearchPlaceholder: "Features suchen…",
  docsNoResults: "Keine Features gefunden für",
  docsFeatureCount: "Features",
  docsCategoryCount: "Kategorien",
  docsStatsBadge: "Komplett dokumentiert",
  docsClearSearch: "Suche zurücksetzen",
  // Product workflow showcase
  followContext: "Kontext folgen",
  // Chrome / nav
  menuAria: "Menü",
  dismissAnnouncement: "Mitteilung schließen",
  languageLabel: "Sprache / Language",
  readInGerman: "Auf Deutsch lesen",
  readInEnglish: "Read in English",
  // Branch pricing
  pricingBadge: "Preise",
  mostPopular: "Beliebteste Wahl",
  billingAnnual: "Jährlich",
  billingMonthly: "Monatlich",
  toggleBilling: "Abrechnung umschalten",
  fullPricingFaq: "Alle Preise & FAQ",
  // Dashboard reel
  openMatter: "Akte öffnen",
  sendQuestion: "Frage senden",
  checkDeadline: "Frist prüfen",
  searchPlaceholder: "Suchen…",
  timeLabel: "09:42",
  mattersLabel: "Akten",
  mattersCount: "Akten",
  deadlinesLabel: "Fristen",
  urgentLabel: "dringend",
  // Vertical page
  signatureLabel: "Stärken",
  capabilitiesBadge: "Funktionen",
  seeAllCapabilities: "Alle Funktionen ansehen",
  whatsappDetail: "WhatsApp-Copilot im Detail",
  securityDetail: "Sicherheit & DSGVO im Detail",
  // Live demo
  liveDemoRegion: "Live-Demo",
  // Features page
  matterLabel: "Akte",
  copilotLabel: "Copilot",
  reviewLabel: "Freigabe",
  inDashboard: "Im Dashboard",
  commandCenter: "Command Center",
  liveMatterContext: "Live-Aktenkontext",
  verifiableLabel: "prüfbar",
  exploreSecurity: "Sicherheit ansehen",
  exploreLabel: "Ansehen",
  // Partners page
  // Download page
  askYourBrain: "Frag dein Brain…",
  gapWarning: "⚠ Lücke: Do 14 Uhr ohne Notiz",
  worksOffline: "Funktioniert offline",
  installNow: "Subsumio jetzt installieren",
  getStarted: "14 Tage kostenlos testen",
  seeFeatures: "Features ansehen",
  pushNotifications: "Push-Benachrichtigungen",
  biometricUnlock: "Biometrische Entsperrung",
  sendToSubsumio: "„An Subsumio senden“",
  comingSoonTo: "Bald im",
};

const _uiStringsEn: Record<string, string> = {
  skipToContent: "Skip to content",
  ariaMainNav: "Main navigation",
  ariaHome: "Subsumio home",
  ariaMobileNav: "Mobile navigation",
  ariaCloseMenu: "Close menu",
  ariaLanguage: "Language",
  footerLegalTagline: "AI legal software & legal intelligence for law firms",
  footerHostingLine: "EU cloud or self-hosted · GDPR-ready · AVV included · § 203 StGB compliant",
  // Landing — trust signals
  noCreditCard: "No credit card",
  trialDaysFree: "14 days free · No credit card",
  threeMinAnswer: "3 min to first cited answer",
  euHosted: "EU-hosted or self-hosted",
  liveDemoAria: "Live demo",
  inActionBadge: "In action",
  dashboardTitle: "Attach a file. Ask. Sources, not hallucinations.",
  dashboardSub:
    "Bring files in via upload, Google Drive or your practice software — then ask in chat, with page-level sources.",
  seeFullPricing: "See full pricing details",
  gdprReady: "GDPR-ready",
  professionalSecrecy: "Professional secrecy by design",
  // Pricing page
  transparentFair: "Transparent & fair",
  noGamesTitle: "No games with pricing",
  noGamesSub: "No fine print, no surprises on the bill.",
  stillQuestions: "Still have questions?",
  writeUs: "Write to us — we reply personally.",
  startFree: "Start free",
  seePlans: "See plans",
  trustedBy: "Trusted by law firms across AT · DE · CH",
  watchDemo: "Watch demo",
  trySubsumio: "Try Subsumio",
  ariaFeatures: "Features",
  ariaPricing: "Pricing",
  ariaKeyMetrics: "Key metrics",
  ariaFaq: "FAQ",
  ariaCta: "Call to action",
  ariaComparison: "Comparison",
  ariaRealWorkflows: "Real workflows",
  ariaCostOfInaction: "The cost of doing nothing",
  ariaUseCases: "Use cases",
  ariaCompliance: "Compliance & integrations",
  ariaFaqSuperbrain: "Frequently asked questions",
  ariaSecurityTrust: "Security & Trust",
  comparisonTableLabel: "Comparison: Subsumio vs. other AI tools",
  comparisonFeature: "Feature",
  comparisonOthers: "Other AI tools",
  exploreAllFeatures: "Explore all features",
  readSecurityDetails: "Read security details",
  seePricingPlans: "See pricing plans",
  faqSuperbrainTitle: "Frequently asked questions",
  faqSuperbrainSub:
    "Everything you need to know about the SuperBrain, the Dream Cycle and the 5-layer architecture.",
  youLabel: "You",
  sourcesLabel: "Sources:",
  thinkingLabel: "Searching knowledge graph…",
  // Hero card verification pass — see the German block above.
  verifyingLabel: "Checking citations",
  verifiedLabel: "citations found in corpus",
  citePendingLabel: "checking",
  scrollToExplore: "Scroll to explore",
  certificationsEyebrow: "Certifications & Integrations",
  trustHeading: "Trust you can verify",
  testimonialsTitle: "What lawyers say about Subsumio",
  testimonialsSub: "Real voices from law firms in AT, DE and CH.",
  navOverview: "Overview",
  navMatters: "Matters",
  navDeadlines: "Deadlines",
  navIntake: "Intake",
  navChat: "Chat",
  workflowMatter: "Matter",
  workflowDoc: "Doc",
  workflowRisk: "Risk",
  workflowTask: "Task",
  featuresWorkflowTitle: "Features run as a legal workflow.",
  featuresWorkflowSub:
    "Matter, copilot, deadline, source and approval work together. That is why Subsumio describes every capability in the dashboard context lawyers actually use.",
  featuresChecklist1: "Source verified",
  featuresChecklist2: "Permission active",
  featuresChecklist3: "Next step prepared",
  featuresGraphCaption: "typed edges, extracted on every write",
  featuresSecurityTitle: "Built for confidentiality-first work",
  featuresSecuritySub:
    "Self-hosting, tested isolation, EU AI Act compliance, and an honest roadmap. The full security and data-protection story lives on its own page.",
  featuresGlanceTitle: "Five capability areas, one engine",
  featuresEmptyState: "Enforced by tests, not policy docs — deterministic, verifiable behavior.",
  downloadHint: "3 open commitments across 4 meetings this week —",
  verticalSeePricing: "See pricing",
  verticalSeeLive: "See it live",
  verticalTrialNote: "14-day reverse trial · 14-day money-back guarantee · No credit card required",
  verticalTrustNote: "Self-hosted · EU cloud · GDPR-ready · professional secrecy by design",
  verticalFeaturesSub:
    "From deadline control to contradiction detection — all on your infrastructure, every answer cited.",
  subpagesConfirmationNote: "Everything confirmation-gated — nothing reaches the matter unseen.",
  typingLabel: "typing…",
  todayLabel: "Today",
  confirmedLabel: "Confirmed",
  messageLabel: "Message",
  verificationLabel: "5-layer verified",
  tryYourselfLabel: "Try it yourself",
  replayLabel: "Watch again",
  askLabel: "Ask",
  placeholderDemo: "Ask the demo brain…",
  liveLabel: "live",
  liveDemoPrefix: "Live from the demo brain:",
  ariaProductDemo: "Product demo conversation",
  ariaSubsumioEngine: "The Subsumio engine",
  engineTraits: "queryable · cited · scoped",
  lawFirmLabel: "Law Firm",
  lawFirmName: "Müller & Partners",
  activeLabel: "Active",
  scriptedLabel: "Example answer · live brain after deploy",
  rateLimitLabel: "Demo limit reached — try again later.",
  noDemoMatches: "No demo matches — here's the example answer.",
  demoReadOnlyNote: "Read-only demo brain · your data stays yours",
  // Solution page
  seePlatform: "See the platform",
  questionsAnswered: "Questions, answered",
  notQuiteRight: "Not quite the right fit?",
  // Audience tabs
  seeSolution: "See the solution",
  // Subsumio subpages
  backToOverview: "Back to overview",
  timeExpenses: "Time & expenses in seconds",
  timeExpensesDesc:
    '"Time 0.5h matter Müller, call" → captured, linked to the matter, one tap to confirm.',
  receiptPhoto: "Receipt photo → right matter",
  receiptPhotoDesc:
    "Document or photo with matter code in the caption lands audit-proof in the vault.",
  voiceNote: "Voice note on the go",
  voiceNoteDesc:
    "Dictate after the hearing — transcribed and attached to the matter before you're back at the office.",
  // Docs page
  dashboardNotDatasheet: "Dashboard, not a datasheet",
  docsTitle: "Every description points to a real legal workflow.",
  docsSub:
    "The docs are not a raw API inventory. They show which dashboard surface exists, which legal workflow it improves and which security assumption sits underneath it.",
  // Back to top
  backToTopAria: "Back to top",
  // Docs page extras
  docsSearchPlaceholder: "Search features…",
  docsNoResults: "No features found for",
  docsFeatureCount: "features",
  docsCategoryCount: "categories",
  docsStatsBadge: "Fully documented",
  docsClearSearch: "Clear search",
  // Product workflow showcase
  followContext: "Follow context",
  // Chrome / nav
  menuAria: "Menu",
  dismissAnnouncement: "Dismiss announcement",
  languageLabel: "Language",
  readInGerman: "Auf Deutsch lesen",
  readInEnglish: "Read in English",
  // Branch pricing
  pricingBadge: "Pricing",
  mostPopular: "Most popular",
  billingAnnual: "Annual",
  billingMonthly: "Monthly",
  toggleBilling: "Toggle billing",
  fullPricingFaq: "Full pricing & FAQ",
  // Dashboard reel
  openMatter: "Open matter",
  sendQuestion: "Send question",
  checkDeadline: "Check deadline",
  searchPlaceholder: "Search…",
  timeLabel: "9:42 AM",
  mattersLabel: "Matters",
  mattersCount: "matters",
  deadlinesLabel: "Deadlines",
  urgentLabel: "urgent",
  // Vertical page
  signatureLabel: "Strengths",
  capabilitiesBadge: "Capabilities",
  seeAllCapabilities: "See all capabilities",
  whatsappDetail: "Explore the WhatsApp copilot",
  securityDetail: "Security & GDPR in depth",
  // Live demo
  liveDemoRegion: "Live demo",
  // Features page
  matterLabel: "Matter",
  copilotLabel: "Copilot",
  reviewLabel: "Review",
  inDashboard: "Dashboard-native",
  commandCenter: "Command center",
  liveMatterContext: "Live matter context",
  verifiableLabel: "verifiable",
  exploreSecurity: "Explore security",
  exploreLabel: "Explore",
  // Partners page
  // Download page
  askYourBrain: "Ask your brain…",
  gapWarning: "⚠ Gap: Thu 2pm has no notes",
  worksOffline: "Works offline",
  installNow: "Install Subsumio now",
  getStarted: "Start free trial",
  seeFeatures: "See features",
  pushNotifications: "Push notifications",
  biometricUnlock: "Biometric unlock",
  sendToSubsumio: "“Send to Subsumio”",
  comingSoonTo: "Coming soon to",
};

export const UI_STRINGS: Record<Lang, Record<string, string>> = {
  en: _uiStringsEn,
  de: _uiStringsDe,
  at: _uiStringsDe,
  ch: _uiStringsDe,
};

// ---------------------------------------------------------------------------
// VALUE_PROPS — pricing page value propositions (bilingual).
// Used by pricing-page.tsx. Moved here for single-source-of-truth.
// ---------------------------------------------------------------------------

const _valuePropsDe = [
  {
    title: "Keine versteckten Kosten",
    desc: "Was auf der Preisliste steht, das zahlst du. Keine Überraschungen bei der Rechnung.",
  },
  {
    title: "Self-hosted oder Cloud",
    desc: "Du entscheidest, wo deine Daten liegen. EU-Cloud oder auf eigener Hardware.",
  },
  {
    title: "Open-Source Engine",
    desc: "Die Engine ist Open Source. Kein Vendor Lock-in, volle Kontrolle.",
  },
  {
    title: "Monatlich kündbar",
    desc: "Solo und Kanzlei werden monatlich abgerechnet. Enterprise wird individuell vereinbart.",
  },
];

const _valuePropsEn = [
  {
    title: "No hidden costs",
    desc: "What you see is what you pay. No surprises on the bill.",
  },
  {
    title: "Self-hosted or cloud",
    desc: "You decide where your data lives. EU cloud or your own hardware.",
  },
  {
    title: "Open-source engine",
    desc: "The engine is open source. No vendor lock-in, full control.",
  },
  {
    title: "Cancel monthly",
    desc: "Solo and Firm are billed monthly. Enterprise terms are agreed individually.",
  },
];

export const VALUE_PROPS: Record<Lang, { title: string; desc: string }[]> = {
  en: _valuePropsEn,
  de: _valuePropsDe,
  at: _valuePropsDe,
  ch: _valuePropsDe,
};
