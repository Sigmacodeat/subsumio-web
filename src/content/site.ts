// Subsumio — central DACH-localized content system.
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

/** Human-readable jurisdiction label for each DACH lang. */
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
  if (typeof base !== "object" || base === null || Array.isArray(base)) {
    return (overrides as T) ?? base;
  }
  const result = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(overrides)) {
    const ov = (overrides as Record<string, unknown>)[key];
    if (ov === undefined) continue;
    const bv = (result as Record<string, unknown>)[key];
    if (
      typeof bv === "object" &&
      bv !== null &&
      !Array.isArray(bv) &&
      typeof ov === "object" &&
      ov !== null &&
      !Array.isArray(ov)
    ) {
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
  process.env.NEXT_PUBLIC_ENGINE_REPO_URL || "https://github.com/subsumio/subsumio";
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
}

export interface NavSection {
  label: string;
  items: readonly MegaNavItem[];
}

interface NavContent {
  signIn: string;
  cta: string;
  pricingLabel: string;
  pricingHref: string;
  sections: readonly NavSection[];
}

// --- NAV: DE base, AT/CH overrides (nav labels are identical, only
//     jurisdiction-specific descriptions differ) ---------------------------

const _navDe: NavContent = {
  signIn: "Anmelden",
  cta: "Demo anfragen",
  pricingLabel: "Preise",
  pricingHref: "/pricing",
  sections: [
    {
      label: "Plattform",
      items: [
        {
          label: "Übersicht",
          href: "/subsumio",
          description: "KI-Kanzleisoftware — belegte Antworten, keine Halluzination",
          icon: "Layers",
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
    },
    {
      label: "Lösungen",
      items: [
        {
          label: "Für Kanzleien",
          href: "/solutions/law-firms",
          description: "Volle Power für etablierte Kanzleien",
          icon: "Landmark",
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
          label: "Partnerprogramm",
          href: "/partners",
          description: "Kunden empfehlen, 30 % wiederkehrend",
          icon: "Handshake",
        },
      ],
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
    },
  ],
};

export const NAV: Record<Lang, NavContent> = {
  en: {
    signIn: "Sign in",
    cta: "Request a demo",
    pricingLabel: "Pricing",
    pricingHref: "/pricing",
    sections: [
      {
        label: "Platform",
        items: [
          {
            label: "Overview",
            href: "/subsumio",
            description: "AI legal software — cited answers, zero hallucinations",
            icon: "Layers",
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
      },
      {
        label: "Solutions",
        items: [
          {
            label: "For Law Firms",
            href: "/solutions/law-firms",
            description: "Full power for established firms",
            icon: "Landmark",
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
            label: "Partner Program",
            href: "/partners",
            description: "Refer clients, earn 30% recurring",
            icon: "Handshake",
          },
        ],
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
      },
    ],
  },
  de: _navDe,
  at: deepMerge(_navDe, {
    // AT: nav labels are identical to DE; only the "Über uns" description differs
    sections: [
      {
        label: "Plattform",
        items: [
          {
            label: "Übersicht",
            href: "/subsumio",
            description: "KI-Kanzleisoftware — belegte Antworten, keine Halluzination",
            icon: "Layers",
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
      },
      {
        label: "Lösungen",
        items: [
          {
            label: "Für Kanzleien",
            href: "/solutions/law-firms",
            description: "Volle Power für etablierte Kanzleien",
            icon: "Landmark",
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
            label: "Partnerprogramm",
            href: "/partners",
            description: "Kunden empfehlen, 30 % wiederkehrend",
            icon: "Handshake",
          },
        ],
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
          { label: "Kontakt", href: "/contact", description: "Kontakt zum Team", icon: "Mail" },
          {
            label: "Impressum",
            href: "/imprint",
            description: "Anbieterinfo und rechtliche Angaben",
            icon: "FileText",
          },
        ],
      },
    ],
  }),
  ch: deepMerge(_navDe, {
    // CH: nav labels identical to DE; "Über uns" description stays the same
    // (Subsumio is built in Austria, serving all DACH)
  }),
};

export const FOOTER: Record<
  Lang,
  {
    tagline: string;
    columns: { title: string; links: { label: string; href: string; external?: boolean }[] }[];
    note: string;
  }
> = {
  en: {
    tagline: "The memory layer for your law firm.",
    columns: [
      {
        title: "Platform",
        links: [
          { label: "Overview", href: "/subsumio" },
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
    note: "Your data, your keys. Self-hosted on your hardware or our EU cloud — GDPR-ready, end-to-end encrypted, zero training on your data.",
  },
  de: {
    tagline: "Das Kanzlei-Gedächtnis, das nie vergisst.",
    columns: [
      {
        title: "Plattform",
        links: [
          { label: "Übersicht", href: "/subsumio" },
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
    note: "Deine Daten. Deine Schlüssel. On-Premise auf eigener Hardware oder EU-Cloud — DSGVO-konform, Ende-zu-Ende verschlüsselt, kein Training auf deinen Daten.",
  },
  at: {
    tagline: "Das Kanzlei-Gedächtnis, das nie vergisst.",
    columns: [
      {
        title: "Plattform",
        links: [
          { label: "Übersicht", href: "/subsumio" },
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
    note: "Ihre Daten. Ihre Schlüssel. On-Premise auf eigener Hardware oder EU-Cloud — DSGVO-konform, Ende-zu-Ende verschlüsselt, kein Training auf Ihren Daten.",
  },
  ch: {
    tagline: "Das Kanzlei-Gedächtnis, das nie vergisst.",
    columns: [
      {
        title: "Plattform",
        links: [
          { label: "Übersicht", href: "/subsumio" },
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
    note: "Ihre Daten. Ihre Schlüssel. On-Premise auf eigener Hardware oder EU-Cloud — DSGVO-konform, Ende-zu-Ende verschlüsselt, kein Training auf Ihren Daten.",
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

export const PRICING: Record<
  Lang,
  { title: string; sub: string; tiers: PricingTier[]; footnote: string }
> = {
  en: {
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
        cta: "Request a demo",
        href: "mailto:hello@subsum.eu",
      },
    ],
    footnote:
      "Annual billing −20 %. Included AI query and storage quotas shown per plan. Overages billed at transparent per-unit rates at month end — no surprise bills, no silent throttling. Token add-on packs available: 500 queries for €199, 1,500 for €499, 5,000 for €1,499.",
  },
  de: {
    title: "Kanzleisoftware Preise — pro Nutzer, kein Lock-in",
    sub: "Pro Nutzer, jährliche Abrechnung. Ihr Kanzleiwissen auf Infrastruktur, die Sie kontrollieren — EU-gehostet oder On-Premise.",
    tiers: [
      {
        id: "free",
        name: "Community",
        price: "0 €",
        period: "für immer",
        blurb:
          "Für Einzelanwälte, die KI-gestützte Aktenarbeit erkunden. Kostenlos für immer, keine Kreditkarte nötig.",
        features: [
          "Self-hosted — Ihr Server, Ihre Keys",
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
          "Compliance-Klasse für regulierte Kanzleien. Ab 20 Nutzern, auf Ihrer Infrastruktur oder in der EU-Cloud.",
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
        cta: "Demo anfragen",
        href: "mailto:hello@subsum.eu",
      },
    ],
    footnote:
      "Jahreszahlung −20 %. KI-Anfragen und Speicher-Kontingente sind je Plan inklusive. Mehrverbrauch wird zu transparenten Einheitspreisen am Monatsende abgerechnet — keine Überraschungsrechnung, kein stilles Drosseln. Zusatzpakete: 500 Anfragen für 199 €, 1.500 für 499 €, 5.000 für 1.499 €.",
  },
  at: {
    title: "Kanzleisoftware Preise — pro Nutzer, kein Lock-in",
    sub: "Pro Nutzer, jährliche Abrechnung. Ihr Kanzleiwissen auf Infrastruktur, die Sie kontrollieren — EU-gehostet oder On-Premise.",
    tiers: [
      {
        id: "free",
        name: "Community",
        price: "0 €",
        period: "für immer",
        blurb:
          "Für Einzelanwälte, die KI-gestützte Aktenarbeit erkunden. Kostenlos für immer, keine Kreditkarte nötig.",
        features: [
          "Self-hosted — Ihr Server, Ihre Keys",
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
          "Compliance-Klasse für regulierte Kanzleien. Ab 20 Nutzern, auf Ihrer Infrastruktur oder in der EU-Cloud.",
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
        cta: "Demo anfragen",
        href: "mailto:hello@subsum.eu",
      },
    ],
    footnote:
      "Jahreszahlung −20 %. KI-Anfragen und Speicher-Kontingente sind je Plan inklusive. Mehrverbrauch wird zu transparenten Einheitspreisen am Monatsende abgerechnet — keine Überraschungsrechnung, kein stilles Drosseln. Zusatzpakete: 500 Anfragen für 199 €, 1.500 für 499 €, 5.000 für 1.499 €.",
  },
  ch: {
    title: "Kanzleisoftware Preise — pro Nutzer, kein Lock-in",
    sub: "Pro Nutzer, jährliche Abrechnung. Ihr Kanzleiwissen auf Infrastruktur, die Sie kontrollieren — EU-gehostet oder On-Premise.",
    tiers: [
      {
        id: "free",
        name: "Community",
        price: "CHF 0",
        period: "für immer",
        blurb:
          "Für Einzelanwälte, die KI-gestützte Aktenarbeit erkunden. Kostenlos für immer, keine Kreditkarte nötig.",
        features: [
          "Self-hosted — Ihr Server, Ihre Keys",
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
          "Compliance-Klasse für regulierte Kanzleien. Ab 20 Nutzern, auf Ihrer Infrastruktur oder in der EU-Cloud.",
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
        cta: "Demo anfragen",
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

export const PRICING_FAQ: Record<Lang, { title: string; items: { q: string; a: string }[] }> = {
  en: {
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
        q: "How does annual billing work?",
        a: "Annual billing gives you 20% off the monthly price. You're billed once per year per seat. Monthly billing is available if you prefer flexibility.",
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
  },
  de: {
    title: "Preisfragen",
    items: [
      {
        q: "Gibt es eine kostenlose Testversion?",
        a: "Ja. Jeder gehostete Plan startet mit einem 14-Tage-Reverse-Trial — voller Zugriff, keine Kreditkarte. Wenn Subsumio nicht das Richtige für Sie ist, kündigen Sie innerhalb von 14 Tagen für eine volle Rückerstattung.",
      },
      {
        q: "Kann ich jederzeit den Plan wechseln?",
        a: "Ja. Upgrade oder Downgrade aus dem Dashboard jederzeit möglich. Änderungen werden zum nächsten Abrechnungszeitraum wirksam — keine Strafgebühren, kein Lock-in.",
      },
      {
        q: "Wie funktioniert die jährliche Abrechnung?",
        a: "Jahreszahlung gibt Ihnen 20% Rabatt auf den Monatspreis. Sie werden einmal pro Jahr pro Nutzer abgerechnet. Monatsabrechnung ist verfügbar, wenn Sie mehr Flexibilität möchten.",
      },
      {
        q: "Was passiert mit meinen Daten bei Kündigung?",
        a: "Sie können jederzeit alles exportieren. Nach Kündigung werden Ihre Daten 30 Tage aufbewahrt, dann dauerhaft gelöscht — oder Sie können sofortige Löschung beantragen.",
      },
      {
        q: "Gibt es versteckte Gebühren?",
        a: "Nein. Mehrverbrauch wird zu transparenten Einheitspreisen abgerechnet, die im Dashboard sichtbar sind. Sie sehen den Verbrauch live und wir fragen, bevor sich etwas ändert.",
      },
    ],
  },
  at: {
    title: "Preisfragen",
    items: [
      {
        q: "Gibt es eine kostenlose Testversion?",
        a: "Ja. Jeder gehostete Plan startet mit einem 14-Tage-Reverse-Trial — voller Zugriff, keine Kreditkarte. Wenn Subsumio nicht das Richtige für Sie ist, kündigen Sie innerhalb von 14 Tagen für eine volle Rückerstattung.",
      },
      {
        q: "Kann ich jederzeit den Plan wechseln?",
        a: "Ja. Upgrade oder Downgrade aus dem Dashboard jederzeit möglich. Änderungen werden zum nächsten Abrechnungszeitraum wirksam — keine Strafgebühren, kein Lock-in.",
      },
      {
        q: "Wie funktioniert die jährliche Abrechnung?",
        a: "Jahreszahlung gibt Ihnen 20% Rabatt auf den Monatspreis. Sie werden einmal pro Jahr pro Nutzer abgerechnet. Monatsabrechnung ist verfügbar, wenn Sie mehr Flexibilität möchten.",
      },
      {
        q: "Was passiert mit meinen Daten bei Kündigung?",
        a: "Sie können jederzeit alles exportieren. Nach Kündigung werden Ihre Daten 30 Tage aufbewahrt, dann dauerhaft gelöscht — oder Sie können sofortige Löschung beantragen.",
      },
      {
        q: "Gibt es versteckte Gebühren?",
        a: "Nein. Mehrverbrauch wird zu transparenten Einheitspreisen abgerechnet, die im Dashboard sichtbar sind. Sie sehen den Verbrauch live und wir fragen, bevor sich etwas ändert.",
      },
    ],
  },
  ch: {
    title: "Preisfragen",
    items: [
      {
        q: "Gibt es eine kostenlose Testversion?",
        a: "Ja. Jeder gehostete Plan startet mit einem 14-Tage-Reverse-Trial — voller Zugriff, keine Kreditkarte. Wenn Subsumio nicht das Richtige für Sie ist, kündigen Sie innerhalb von 14 Tagen für eine volle Rückerstattung.",
      },
      {
        q: "Kann ich jederzeit den Plan wechseln?",
        a: "Ja. Upgrade oder Downgrade aus dem Dashboard jederzeit möglich. Änderungen werden zum nächsten Abrechnungszeitraum wirksam — keine Strafgebühren, kein Lock-in.",
      },
      {
        q: "Wie funktioniert die jährliche Abrechnung?",
        a: "Jahreszahlung gibt Ihnen 20% Rabatt auf den Monatspreis. Sie werden einmal pro Jahr pro Nutzer abgerechnet. Monatsabrechnung ist verfügbar, wenn Sie mehr Flexibilität möchten.",
      },
      {
        q: "Was passiert mit meinen Daten bei Kündigung?",
        a: "Sie können jederzeit alles exportieren. Nach Kündigung werden Ihre Daten 30 Tage aufbewahrt, dann dauerhaft gelöscht — oder Sie können sofortige Löschung beantragen.",
      },
      {
        q: "Gibt es versteckte Gebühren?",
        a: "Nein. Mehrverbrauch wird zu transparenten Einheitspreisen abgerechnet, die im Dashboard sichtbar sind. Sie sehen den Verbrauch live und wir fragen, bevor sich etwas ändert.",
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Landing page
// ---------------------------------------------------------------------------

/**
 * Recursively apply string replacements to all string values in an object.
 * Used to create AT/CH landing variants from DE base without duplicating
 * 300+ lines — only the jurisdiction-specific terms are replaced.
 */
function applyReplacements<T>(obj: T, replacements: Record<string, string>): T {
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
const AT_REPLACEMENTS: Record<string, string> = {
  "ZPO/BGB/ABGB": "ZPO/ABGB",
  "ZPO, BGB und ABGB": "ZPO und ABGB",
  "§ 43a BRAO, § 10 RAO, BGFA": "§ 10 RAO und BGFA",
  "§ 43a BRAO (DE), § 10 RAO (AT) und BGFA (CH)": "§ 10 RAO (AT) und BGFA (CH)",
  "§ 203 StGB": "§ 9 RAO",
  "DATEV-Export (DE) und ADATEV (AT)": "ADATEV-Export",
  "DATEV-Export (DE) oder ADATEV (AT)": "ADATEV-Export",
  "und DATEV": "und ADATEV",
  "für AT · DE · CH": "für Österreich",
  "deine Akten": "Ihre Akten",
  "deine Kontrolle": "Ihre Kontrolle",
  "deine Anwälte": "Ihre Anwälte",
  "deine Keys": "Ihre Keys",
  "deine Daten": "Ihre Daten",
  "deine Hardware": "Ihre Hardware",
  "deiner Infrastruktur": "Ihrer Infrastruktur",
  "deiner Kanzlei": "Ihrer Kanzlei",
  "dein Server": "Ihr Server",
  "dein Kanzleiwissen": "Ihr Kanzleiwissen",
  "du kontrollierst": "Sie kontrollieren",
  "Du wirst": "Sie werden",
  "Du kannst": "Sie können",
  "deine Kanzlei": "Ihre Kanzlei",
  "deinen Daten": "Ihren Daten",
  "deiner Arbeit": "Ihrer Arbeit",
  "dein Brain": "Ihr Brain",
  "dir ": "Ihnen ",
  "dich ": "Sie ",
  deine: "Ihre",
  deiner: "Ihrer",
  dir: "Ihnen",
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
  "für AT · DE · CH": "für die Schweiz",
  "Landesgericht Wien": "Bezirksgericht Zürich",
  "84.000 €": "CHF 84'000",
  "deine Akten": "Ihre Akten",
  "deine Kontrolle": "Ihre Kontrolle",
  "deine Anwälte": "Ihre Anwälte",
  "deine Keys": "Ihre Keys",
  "deine Daten": "Ihre Daten",
  "deine Hardware": "Ihre Hardware",
  "deiner Infrastruktur": "Ihrer Infrastruktur",
  "deiner Kanzlei": "Ihrer Kanzlei",
  "dein Server": "Ihr Server",
  "dein Kanzleiwissen": "Ihr Kanzleiwissen",
  "du kontrollierst": "Sie kontrollieren",
  "Du wirst": "Sie werden",
  "Du kannst": "Sie können",
  "deine Kanzlei": "Ihre Kanzlei",
  "deinen Daten": "Ihren Daten",
  "deiner Arbeit": "Ihrer Arbeit",
  "dein Brain": "Ihr Brain",
  "dir ": "Ihnen ",
  "dich ": "Sie ",
  deine: "Ihre",
  deiner: "Ihrer",
  dir: "Ihnen",
};

const _landingDe = {
  badge: "KI-Kanzleisoftware für AT · DE · CH",
  h1a: "Jede Akte,",
  h1b: "eine belegte Antwort.",
  sub: "Subsumio ist die KI-Kanzleisoftware für Rechtsanwälte in Österreich, Deutschland und der Schweiz. Akten, Fristen, Mails und Dokumente werden zu belegten Antworten — mit Fundstellen, nicht mit Halluzinationen.",
  ctaPrimary: "Demo vereinbaren",
  ctaSecondary: "Live-Demo ansehen",
  demo: {
    windowTitle: "subsumio — fragen",
    you: "Sie",
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
  stats: [
    { value: "97,9 %", label: "Recall@5 — Retrieval-Benchmark" },
    { value: "3", label: "Jurisdiktionen — AT · DE · CH" },
    { value: "0", label: "bekannte Mandantendaten-Leaks" },
    { value: "14", label: "Tage volle Testversion — keine Kreditkarte" },
  ],
  statsNote:
    "Kein Chat-Wrapper. Engine-Klasse Retrieval — jede KI-Antwort nennt die exakte Fundstelle.",
  featuresTitle: "Für Kanzleien gebaut. Nicht nachträglich angepasst.",
  featuresSub:
    "Von Fristenkontrolle nach ZPO/BGB/ABGB bis Widerspruchserkennung in Schriftsätzen — jede Antwort mit Fundstellen, jede Frist überwacht, keine Halluzination.",
  features: [
    {
      icon: "Brain",
      color: "violet",
      title: "Antworten mit Fundstellen",
      desc: "Jede KI-Antwort zitiert die exakten Fundstellen aus Ihren Akten. Ein Klick zur Verifikation, bevor etwas in den Schriftsatz geht — keine halluzinierten Quellen, keine Blackbox.",
    },
    {
      icon: "CalendarClock",
      color: "amber",
      title: "Fristen automatisch berechnet",
      desc: "Notfristen und Berufungsfristen nach ZPO, BGB und ABGB — mit korrekter Monatsarithmetik, Wochenend- und Feiertagsverschiebung. Täglicher E-Mail-Digest markiert kritische Fristen vor Fristablauf.",
    },
    {
      icon: "MessageSquare",
      color: "emerald",
      title: "WhatsApp-Copilot für die Kanzlei",
      desc: "Zeiten buchen, Dokumente ablegen, Sprachnotizen vom Handy. Alles landet in der richtigen Akte — bestätigungspflichtig, nichts erreicht die Akte ungesehen. GoBD-konform dokumentiert.",
    },
    {
      icon: "ShieldAlert",
      color: "rose",
      title: "Kollisionsprüfung nach § 43a BRAO, § 10 RAO, BGFA",
      desc: "Jeder neue Mandant oder Gegner wird serverseitig gegen den gesamten Aktenbestand geprüft — Konflikte werden gemeldet, bevor das Mandat angenommen wird. Deckt § 43a BRAO (DE), § 10 RAO (AT) und BGFA (CH) ab.",
    },
    {
      icon: "Calculator",
      color: "blue",
      title: "Zeiten, Auslagen, Rechnungen und DATEV",
      desc: "Minuten nach Anwalt und Tätigkeit buchen, abrechenbare Auslagen erfassen, Rechnungen aus offener Arbeit erstellen. DATEV-Export (DE) und ADATEV (AT) in einem Klick.",
    },
    {
      icon: "Shield",
      color: "violet",
      title: "On-Premise oder EU-Cloud mit AVV",
      desc: "Die vollständige Engine auf eigener Kanzlei-Infrastruktur mit eigenen Schlüsseln — oder verwaltete EU-Cloud mit AVV. Mandantendaten verlassen niemals Ihre Kontrolle.",
    },
  ],
  howTitle: "So funktioniert Subsumio: vom Dokument zur belegten Antwort",
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
      title: "Belegte Antwort erhalten",
      desc: "Eine synthetisierte Antwort mit seitengenauen Zitaten — plus ehrlicher Hinweis, was in der Akte noch fehlt. Die Gap-Analyse zeigt offene Risiken, bevor sie zu Problemen werden.",
    },
  ],
  scenariosTitle: "Kanzlei-Workflows aus der Praxis",
  scenariosSub: "Drei Abläufe aus dem Produkt, die jeder Anwalt sofort erkennt.",
  scenarios: [
    {
      role: "Eingangspost",
      text: "Tagespost und einen gescannten Vertrag hochladen, dann fragen: „Welche Fristen löst das aus?“ — jedes gesetzliche Datum wird nach ZPO/BGB/ABGB berechnet, im Kalender eingetragen und mit der Akte verknüpft. Manual Fristenbuch entfällt.",
    },
    {
      role: "Verhandlungsvorbereitung",
      text: "Sprachnotiz und PDF per WhatsApp mit Aktenzeichen schicken, 20 Minuten buchen, dann fragen: „Wo widersprechen sich die Schriftsätze der Gegenseite?“ — Subsumio findet Widersprüche über Schriftsätze, Anlagen und Protokolle hinweg in Sekunden.",
    },
    {
      role: "Mitarbeiter-Onboarding",
      text: "Fünf Jahre Akten und Schriftsätze indexieren. Der neue Mitarbeiter fragt: „Haben wir schon mal so etwas argumentiert?“ — und findet den Schriftsatz von 2023 in Sekunden, mit seitengenauen Zitaten. Einarbeitungszeit von Wochen auf Tage.",
    },
  ],
  faqTitle: "Häufige Fragen — klar beantwortet",
  faq: [
    {
      q: "Was unterscheidet Subsumio von Notion AI, Glean oder einer Vektor-Datenbank?",
      a: `Notion AI, Glean und Vektor-Datenbanken liefern Dokumente oder Textabschnitte. Subsumio liefert eine synthetisierte Antwort mit seitengenauen Zitaten, nutzt für Beziehungsfragen einen typisierten Wissensgraphen und gibt eine Gap-Analyse — es zeigt explizit, was in der Akte fehlt. Das ist der Unterschied zwischen \u201Eirgendwo steht etwas\u201C und \u201Ehier steht die Antwort, und hier fehlt noch etwas\u201C.`,
    },
    {
      q: "Wo liegen meine Kanzleidaten?",
      a: "Sie haben die Wahl: Self-Hosting der Engine auf eigener Hardware mit eigenen Schlüsseln oder unsere verwaltete EU-Cloud mit AVV. Enterprise-Pläne unterstützen On-Premise-Deployment und einen unterzeichneten AVV. Mandantendaten verlassen in keinem Fall die EU.",
    },
    {
      q: "Brauche ich API-Keys oder eigene Server-Infrastruktur?",
      a: "Nein. Bei gehosteten Plänen ist Subsumio vollständig verwaltet — keine API-Keys, keine eigene Infrastruktur, keine IT-Ressourcen nötig. Enterprise-On-Premise läuft auf eigener Hardware mit eigenen Schlüsseln.",
    },
    {
      q: "Was passiert, wenn ich an Plan-Limits stoße?",
      a: "Der Verbrauch ist live im Dashboard sichtbar. Wir fragen, bevor sich etwas ändert — keine Überraschungsrechnungen, kein stilles Drosseln. Mehrverbrauch wird zu transparenten Einheitspreisen abgerechnet.",
    },
    {
      q: "Trainiert Subsumio auf meinen Kanzleidaten?",
      a: "Niemals. Ihr Kanzleiwissen gehört allein Ihnen und wird nicht zum Training geteilter Modelle genutzt. On-Premise bleibt alles auf Ihrer Infrastruktur. In der EU-Cloud wird es verschlüsselt und mandantensepariert verarbeitet — keine andere Kanzlei hat Zugriff.",
    },
    {
      q: "Ist Subsumio mit § 203 StGB und Berufsgeheimnis-Pflichten vereinbar?",
      a: "Ja. Die Architektur ist für Berufsgeheimnisträger konzipiert: Kein Dritter verarbeitet Mandantendaten ohne ausdrückliche Freigabe. On-Premise bleibt die Datenverarbeitung vollständig innerhalb der Kanzlei. In der EU-Cloud erfolgt die Verarbeitung verschlüsselt und mandantensepariert.",
    },
  ],
  ctaTitle: "Ihre Kanzlei. Strukturiert abfragbar.",
  ctaSub: "14 Tage volle Testversion. Keine Kreditkarte. Kein IT-Aufwand.",
  ctaButton: "Demo vereinbaren",
};

export const LANDING = {
  en: {
    badge: "AI legal software for AT · DE · CH",
    h1a: "Every matter,",
    h1b: "one cited answer.",
    sub: "Subsumio is AI legal software for law firms in Austria, Germany and Switzerland. Matters, deadlines, emails and documents become cited answers — with page-level sources, not hallucinations.",
    ctaPrimary: "Request a demo",
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
    stats: [
      { value: "97.9%", label: "Recall@5 — retrieval benchmark" },
      { value: "3", label: "jurisdictions — AT · DE · CH" },
      { value: "0", label: "client-data leaks, by design" },
      { value: "14", label: "days full trial — no credit card" },
    ],
    statsNote:
      "Not a chat wrapper — engine-class retrieval where every AI answer cites its exact source.",
    featuresTitle: "Built for law firms. Not adapted for them.",
    featuresSub:
      "From deadline control per ZPO/BGB/ABGB to contradiction detection in pleadings — every answer cited, every deadline tracked, no hallucinations.",
    features: [
      {
        icon: "Brain",
        color: "violet",
        title: "Answers with citations",
        desc: "Every AI answer cites the exact pages it comes from. Verify in one click before anything goes into a brief — no hallucinated references, no black box.",
      },
      {
        icon: "CalendarClock",
        color: "amber",
        title: "Deadlines, automatically",
        desc: "Statutory and appeal deadlines computed per ZPO/BGB/ABGB with correct month arithmetic and weekend roll-forward. A daily email digest flags what's critical before the deadline expires.",
      },
      {
        icon: "MessageSquare",
        color: "emerald",
        title: "WhatsApp copilot",
        desc: "Book time, file documents, send voice notes from your phone. Everything lands in the right matter — confirmation-gated, nothing reaches the file unseen. GoBD-compliant.",
      },
      {
        icon: "ShieldAlert",
        color: "rose",
        title: "Conflict check (§ 43a BRAO / § 10 RAO / BGFA)",
        desc: "Every new client or opponent is checked server-side against your entire matter database — conflicts flagged before the mandate is accepted. Covers § 43a BRAO (DE), § 10 RAO (AT) and BGFA (CH).",
      },
      {
        icon: "Calculator",
        color: "blue",
        title: "Time, expenses, invoices & DATEV",
        desc: "Book minutes by lawyer and activity, track billable expenses, generate invoices from open work, export DATEV-ready (DE) or ADATEV (AT).",
      },
      {
        icon: "Shield",
        color: "violet",
        title: "Self-hosted or EU cloud",
        desc: "The full engine on your hardware with your keys — or managed EU cloud with DPA. Client data never leaves your control.",
      },
    ],
    howTitle: "How it works: from document to cited answer",
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
        title: "Cited answer",
        desc: "A synthesized answer with page-level citations — plus an honest note on what the file is still missing. The gap analysis surfaces open risks before they become problems.",
      },
    ],
    scenariosTitle: "Real workflows",
    scenariosSub: "From the engine, not a mockup — three workflows your team will recognize.",
    scenarios: [
      {
        role: "Incoming post",
        text: "Upload the day's mail and a scanned contract, then ask: 'Which deadlines does this trigger?' — every statutory date is calculated per ZPO/BGB/ABGB, calendared and linked to the matter. Manual deadline book eliminated.",
      },
      {
        role: "Trial prep",
        text: "Send a voice note and a PDF by WhatsApp with a matter reference, book 20 minutes, then ask: 'Where do the opposing party's statements contradict each other?' — Subsumio finds contradictions across filings, exhibits and protocols in seconds.",
      },
      {
        role: "Onboarding a new associate",
        text: "Index five years of matters and pleadings. The new associate asks: 'Have we argued something like this before?' — and finds the 2023 brief in seconds, with page-level citations. Onboarding from weeks to days.",
      },
    ],
    faqTitle: "Questions, answered",
    faq: [
      {
        q: "How is this different from Notion AI, Glean or a vector database?",
        a: 'Those return documents or chunks. Subsumio returns a synthesized answer with page-level citations, walks a typed knowledge graph for relationship questions ("who invested in X?"), and tells you what it doesn\'t know — the gap analysis is the part that changes how you work.',
      },
      {
        q: "Where does my data live?",
        a: "Your choice. Self-host the engine on your own hardware, or use our managed EU cloud. Enterprise plans support on-prem and a signed DPA. Client data never leaves the EU.",
      },
      {
        q: "Do I need API keys or a server?",
        a: "No. Sign up and your brain runs — fully managed, no keys, no infrastructure. Enterprise self-hosting runs on your own hardware with your own keys.",
      },
      {
        q: "What happens when I hit my plan limits?",
        a: "You see usage live in the dashboard and we ask before anything changes. No surprise bills, no silent throttling. Overages billed at transparent per-unit rates.",
      },
      {
        q: "Do you train on our data?",
        a: "Never. Your knowledge is yours alone — never used to train shared models. Self-hosted, nothing leaves your building; on our EU cloud it stays encrypted and isolated per customer.",
      },
      {
        q: "Is Subsumio compatible with § 203 StGB and professional secrecy obligations?",
        a: "Yes. The architecture is designed for confidentiality holders: no third party processes client data without explicit release. On-premise keeps data processing entirely within your firm. In the EU cloud, processing is encrypted and isolated per customer.",
      },
    ],
    ctaTitle: "Your firm. Structured and queryable.",
    ctaSub: "14-day full trial. No credit card. No IT overhead.",
    ctaButton: "Request a demo",
  },
  de: _landingDe,
  at: applyReplacements(JSON.parse(JSON.stringify(_landingDe)), AT_REPLACEMENTS),
  ch: applyReplacements(JSON.parse(JSON.stringify(_landingDe)), CH_REPLACEMENTS),
};

// ---------------------------------------------------------------------------
// UI_STRINGS — shared bilingual strings used across marketing components.
// Single source of truth for inline labels, badges, aria-labels, CTAs.
// ---------------------------------------------------------------------------

const _uiStringsDe: Record<string, string> = {
  // Landing — trust signals
  noCreditCard: "Keine Kreditkarte",
  threeMinAnswer: "3 Min. zur ersten belegten Antwort",
  euHosted: "EU-gehostet oder On-Premise",
  liveDemoAria: "Live-Demo",
  inActionBadge: "In Aktion",
  dashboardTitle: "Datei anhängen. Fragen. Belegte Antwort.",
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
  writeUs: "Schreiben Sie uns — wir antworten persönlich.",
  startFree: "Kostenlos starten",
  // Solution page
  seePlatform: "Plattform ansehen",
  questionsAnswered: "Fragen, beantwortet",
  notQuiteRight: "Nicht ganz das Richtige für Sie?",
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
    "Diktat nach dem Termin — transkribiert und der Akte angehängt, bevor Sie im Büro sind.",
  // Docs page
  dashboardNotDatasheet: "Dashboard statt Datenblatt",
  docsTitle: "Jede Beschreibung zeigt auf einen echten Kanzlei-Workflow.",
  docsSub:
    "Die Docs sind nicht als rohe API-Liste gedacht. Sie erklären, welche Funktion im Dashboard sichtbar ist, welchen Kanzlei-Prozess sie verbessert und welche Sicherheitsannahme dahintersteht.",
  // Back to top
  backToTopAria: "Zurück nach oben",
  // Product workflow showcase
  followContext: "Kontext folgen",
  // Chrome / nav
  menuAria: "Menü",
  readInGerman: "Auf Deutsch lesen",
  readInEnglish: "Read in English",
  // Branch pricing
  pricingBadge: "Preise",
  mostPopular: "Beliebteste Wahl",
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
  strengthsLabel: "Stärken",
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
  askYourBrain: "Fragen Sie Ihr Brain…",
  gapWarning: "⚠ Lücke: Do 14 Uhr ohne Notiz",
  worksOffline: "Funktioniert offline",
  installNow: "Subsumio jetzt installieren",
  getStarted: "Demo anfragen",
  seeFeatures: "Features ansehen",
  pushNotifications: "Push-Benachrichtigungen",
  biometricUnlock: "Biometrische Entsperrung",
  sendToSubsumio: "„An Subsumio senden“",
  comingSoonTo: "Bald im",
};

export const UI_STRINGS: Record<Lang, Record<string, string>> = {
  en: {
    // Landing — trust signals
    noCreditCard: "No credit card",
    threeMinAnswer: "3 min to first cited answer",
    euHosted: "EU-hosted or self-hosted",
    liveDemoAria: "Live demo",
    inActionBadge: "In action",
    dashboardTitle: "Attach a file. Ask. Get a cited answer.",
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
    // Product workflow showcase
    followContext: "Follow context",
    // Chrome / nav
    menuAria: "Menu",
    readInGerman: "Auf Deutsch lesen",
    readInEnglish: "Read in English",
    // Branch pricing
    pricingBadge: "Pricing",
    mostPopular: "Most popular",
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
    signatureLabel: "signature",
    strengthsLabel: "Stärken",
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
    getStarted: "Request a demo",
    seeFeatures: "See features",
    pushNotifications: "Push notifications",
    biometricUnlock: "Biometric unlock",
    sendToSubsumio: "“Send to Subsumio”",
    comingSoonTo: "Coming soon to",
  },
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
    desc: "Was auf der Preisliste steht, das zahlen Sie. Keine Überraschungen bei der Rechnung.",
  },
  {
    title: "Self-hosted oder Cloud",
    desc: "Sie entscheiden, wo Ihre Daten liegen. EU-Cloud oder auf eigener Hardware.",
  },
  {
    title: "Open-Source Engine",
    desc: "Die Engine ist Open Source. Kein Vendor Lock-in, volle Kontrolle.",
  },
  {
    title: "Kostenlos starten",
    desc: "Der Community-Plan ist kostenlos. Upgrade jederzeit, Downgrade auch.",
  },
];

export const VALUE_PROPS: Record<Lang, { title: string; desc: string }[]> = {
  en: [
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
      title: "Start free",
      desc: "The Community plan is free. Upgrade anytime, downgrade too.",
    },
  ],
  de: _valuePropsDe,
  at: _valuePropsDe,
  ch: _valuePropsDe,
};
