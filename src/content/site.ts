// Subsumio — central content system.
// Austria (de-AT) is the only public market; everything below is the canonical
// Austrian copy rendered under /at. The Lang union still covers retired locales
// because the dashboard UI language (de/en) reuses it — retired public URLs are
// permanently redirected to /at in middleware.
// One source of truth: layouts render from these objects, never duplicate copy in JSX.
// To reactivate a market: restore routes and content from the locale archive
// tag documented under docs/archive/.

import { PROOF } from "./proof-points";

export const CONTENT_LANGS = ["de", "at", "ch", "en"] as const;
export type Lang = (typeof CONTENT_LANGS)[number];
export const SUPPORTED_LANGS: readonly Lang[] = ["at"];
export const DEFAULT_LANG: Lang = "at";

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

// Öffentliche Repo-URL der Open-Source-Engine. EINE Stelle zum Ändern —
// per NEXT_PUBLIC_ENGINE_REPO_URL überschreibbar. Auf den eigenen
// öffentlichen Fork setzen, bevor die Marketing-Seite live geht.
export const ENGINE_REPO_URL =
  process.env.NEXT_PUBLIC_ENGINE_REPO_URL || "https://github.com/subsumio";
export const ENGINE_REPO_INSTALL = ENGINE_REPO_URL.replace("https://github.com/", "github:");

/** Build a public-site path. Austria is the only market — every public route
 * lives under /at. */
export function p(path: string): string {
  return path === "" || path === "/" ? "/at" : `/at${path}`;
}

/** Strip the locale prefix from a pathname, returning the bare path. */
export function stripLangPrefix(pathname: string): string {
  for (const l of CONTENT_LANGS) {
    if (l === "de") continue;
    if (pathname === `/${l}` || pathname === `/${l}/`) return "/";
    if (pathname.startsWith(`/${l}/`)) return pathname.slice(l.length + 1); // keep leading /
  }
  return pathname;
}

/** The same page in another language (for the language switcher). */
export function altPath(lang: Lang, pathname: string): string {
  const stripped = stripLangPrefix(pathname);
  void lang;
  return p(stripped);
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
    href: p(base),
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
// ---------------------------------------------------------------------------
// Navigation + Footer
// ---------------------------------------------------------------------------

export const NAV: NavContent = {
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
          description: "Ihre Daten, Ihre Schlüssel, Ihre Jurisdiktion",
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
      ctaBottom: {
        label: "Plattform ansehen",
        href: "/features",
      },
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
          href: "/solutions/law-firms",
          description: "Gemeinsames Brain, Fristen und Kommunikation für Teams",
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
      ],
      ctaBottom: {
        label: "Lösung finden",
        href: "/solutions/law-firms",
      },
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
      ctaBottom: {
        label: "Doku öffnen",
        href: "/docs",
      },
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
          description: "Aus Österreich für österreichische Kanzleien",
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

export const FOOTER: {
  tagline: string;
  columns: { title: string; links: { label: string; href: string; external?: boolean }[] }[];
  note: string;
} = {
  tagline: "KI-Kanzleisoftware, die nie vergisst — das Kanzlei-Brain für Anwälte in Österreich.",
  columns: [
    {
      title: "Plattform",
      links: [
        {
          label: "Übersicht",
          href: "/",
        },
        {
          label: "SuperBrain",
          href: "/superbrain",
        },
        {
          label: "Features",
          href: "/features",
        },
        {
          label: "Sicherheit",
          href: "/security",
        },
        {
          label: "WhatsApp-Copilot",
          href: "/whatsapp",
        },
        {
          label: "Preise",
          href: "/pricing",
        },
        {
          label: "Download",
          href: "/download",
        },
      ],
    },
    {
      title: "Lösungen",
      links: [
        {
          label: "Für Kanzleien",
          href: "/solutions/law-firms",
        },
        {
          label: "Für Einzelanwälte",
          href: "/solutions/solo",
        },
        {
          label: "Für Justiziariate",
          href: "/solutions/in-house",
        },
      ],
    },
    {
      title: "Ressourcen",
      links: [
        {
          label: "Dokumentation",
          href: "/docs",
        },
        {
          label: "Blog",
          href: "/blog",
        },
        {
          label: "Benchmark",
          href: "/benchmark-methodology",
        },
        {
          label: "Partnerprogramm",
          href: "/partners",
        },
        {
          label: "Dashboard",
          href: "/dashboard",
          external: false,
        },
      ],
    },
    {
      title: "Unternehmen",
      links: [
        {
          label: "Über uns",
          href: "/about",
        },
        {
          label: "Kontakt",
          href: "/contact",
        },
        {
          label: "Impressum",
          href: "/imprint",
        },
      ],
    },
    {
      title: "Rechtliches",
      links: [
        {
          label: "AGB",
          href: "/terms",
        },
        {
          label: "Datenschutz",
          href: "/privacy",
        },
      ],
    },
  ],
  note: "Ihre Daten. Ihre Schlüssel. On-Premise auf eigener Hardware oder EU-Cloud mit AVV — DSGVO-konform, Ende-zu-Ende verschlüsselt, kein Training mit Ihren Daten.",
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

export const PRICING: {
  title: string;
  sub: string;
  tiers: PricingTier[];
  footnote: string;
} = {
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
        "Self-hosted — eigener Server, eigene Schlüssel",
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
        "Nächtliche Konsolidierung: Duplikate, Zitate, Widersprüche",
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
        "Einrichtungstermin inklusive",
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
      cta: "Demo vereinbaren",
      href: "mailto:hello@subsum.eu",
    },
  ],
  footnote:
    "Jahreszahlung −20 %. KI-Anfragen und Speicher-Kontingente sind je Plan inklusive. Mehrverbrauch wird zu transparenten Einheitspreisen am Monatsende abgerechnet — keine Überraschungsrechnung, kein stilles Drosseln. Zusatzpakete: 500 Anfragen für 199 €, 1.500 für 499 €, 5.000 für 1.499 €.",
};

export const PRICING_FAQ: { title: string; items: { q: string; a: string }[] } = {
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
      q: "Wie funktioniert die monatliche Abrechnung?",
      a: "Solo und Kanzlei werden monatlich abgerechnet und sind monatlich kündbar. Kanzlei enthält fünf Nutzer; Enterprise-Konditionen werden individuell vereinbart.",
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
};

export const LANDING = {
  badge: "KI-Kanzleisoftware & Anwaltssoftware für Österreich",
  heroBadges: [
    `Neu: ${PROOF.recall8.value} Recall mit 5-Layer-Verifikation`,
    "Verschwiegenheit nach § 9 Abs. 2 RAO im Systemdesign",
    "EU-Cloud oder On-Premise — Ihre Wahl",
  ],
  h1a: "Antworten aus Ihren Akten.",
  h1b: "Mit Quelle. In Sekunden.",
  heroTagline: "KI-Kanzleisoftware für Anwälte in Österreich — mit belegten Antworten.",
  sub: "Sie fragen in normaler Sprache — Subsumio antwortet mit seitengenauen Fundstellen aus Ihren Akten. Für Anwälte in Österreich.",
  heroTrustItems: [
    {
      icon: "CreditCard",
      label: "Keine Kreditkarte",
    },
    {
      icon: "Scale",
      label: "§ 9 Abs. 2 RAO",
    },
    {
      icon: "Globe",
      label: "EU-Cloud",
    },
  ],
  trustStripItems: [
    {
      icon: "ShieldCheck",
      label: "DSGVO-konform",
    },
    {
      icon: "BadgeCheck",
      label: "SOC 2 Vorbereitung",
    },
    {
      icon: "FileCheck",
      label: "ISO 27001 geplant",
    },
    {
      icon: "Globe",
      label: "EU-Cloud",
    },
    {
      icon: "Server",
      label: "On-Premise",
    },
  ],
  painTitle: "Was kostet Sie Suchen — jeden Tag?",
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
    you: "Sie",
    q: "Was muss ich vor der Verhandlung Bauer morgen wissen?",
    a: "Akte Bauer ./. Hofer GmbH — Vertragsbruch, 84.000 €. Landesgericht Wien, Abt. 12. Verhandlung morgen, 09:30.\n\n**3 offene Punkte:**\n1. Replik heute fällig — entworfen, noch nicht eingebracht\n2. Gutachten von Dr. Klein fehlt noch (angefordert 3. März)\n3. Mandant hat den vorgeschlagenen Vergleichsrahmen nicht bestätigt\n\n⚠️ Frist: Die Replik ist eine Notfrist — Einbringung endet um Mitternacht. Zum Gutachten seit 3. März nichts Neues — nachfassen.",
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
    {
      value: PROOF.recall8.value,
      label: `Retrieval-Trefferquote (${PROOF.recall8.metric}, ${PROOF.recall8.benchmark}, ${PROOF.recall8.sampleSize} Fragen)`,
    },
    {
      value: "3",
      label: "Jurisdiktionen: AT, DE, CH",
    },
    {
      value: "0",
      label: "Mandantendaten-Lecks — by design",
    },
    {
      value: "14",
      label: "Tage gratis testen",
    },
  ],
  statsNote:
    "Engine-Klasse Retrieval, kein Chat-Wrapper. Jede Antwort nennt die Quelle — oder sagt ehrlich, wenn die Akte nichts hergibt.",
  featuresTitle: "Was Ihre Kanzlei ab heute kann",
  featuresSub: "Sechs Fähigkeiten, gebaut für Anwälte — nicht nachträglich angepasst.",
  features: [
    {
      icon: "Brain",
      color: "violet",
      title: "Antworten mit Fundstellen",
      desc: "Jede Antwort zitiert die exakte Stelle in Ihren Akten. Ein Klick zur Verifikation — keine halluzinierten Quellen, keine Blackbox.",
    },
    {
      icon: "CalendarClock",
      color: "amber",
      title: "Fristen automatisch berechnet",
      desc: "Not- und Berufungsfristen nach ZPO und ABGB — mit Feiertagsverschiebung. Der tägliche Digest markiert, was kritisch wird.",
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
      desc: "Jeder neue Mandant wird gegen den gesamten Aktenbestand geprüft — § 10 RAO. Konflikte vor Mandatsannahme.",
    },
    {
      icon: "Calculator",
      color: "blue",
      title: "Minuten buchen, Rechnungen in einem Klick",
      desc: "Minuten buchen, Auslagen erfassen, Rechnungen erstellen. Buchhaltungsexport in einem Klick.",
    },
    {
      icon: "Shield",
      color: "violet",
      title: "Ihre Daten, Ihre Kontrolle",
      desc: "Der Subsumio-Dienst auf Ihrer Hardware mit Ihren Schlüsseln — oder verwaltete EU-Cloud mit AVV. Ihre Daten, Ihre Kontrolle.",
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
      text: "Sie trinken Kaffee. Subsumio hat schon alle Fristen für heute geprüft — eine Notfrist läuft um Mitternacht, markiert und mit der Akte verlinkt. Der tägliche Digest liegt im Posteingang. Du weißt, was heute wichtig ist, bevor du den ersten Schriftsatz öffnest.",
    },
    {
      role: "Mittag · 12:15",
      text: "Auf dem Rückweg vom Gericht: „Zeit 0,5h Akte Müller, Widerspruch S.3 vs S.7 prüfen.“ Subsumio bucht die Zeit, findet den Widerspruch in den Schriftsätzen, legt alles in der Akte ab — während du noch unterwegs bist.",
    },
    {
      role: "Abend · 18:45",
      text: "„Entwirf die Replik dafür.“ Subsumio zieht die Argumente aus den Akten, zitiert S.3 und S.7, schlägt den Antrag vor. Sie prüfen die Fundstellen in einem Klick, bestätigst, fertig. Der Schriftsatz geht raus — mit Quellen, nicht mit Bauchgefühl.",
    },
  ],
  comparisonTitle: "Warum nicht einfach ChatGPT, Notion AI oder eine Vektor-Datenbank?",
  comparisonSub: "Allgemeine KI-Tools sind nicht für Anwälte gebaut. Subsumio ist es.",
  comparison: [
    {
      feature: "Fundstellen pro Antwort",
      subsumio: "Seitengenaue Zitate aus Ihren Akten",
      others: "Keine Fundstellen oder unüberprüfbar",
    },
    {
      feature: "Halluzination-Schutz",
      subsumio: "Gap-Analyse statt Halluzination — sagt ‚keine Antwort‘",
      others: "Halluziniert Quellen und Paragrafen",
    },
    {
      feature: "Berufsgeheimnis (§ 9 Abs. 2 RAO)",
      subsumio: "Self-Hosting oder EU-Cloud mit AVV — kein Dritter sieht Mandantendaten",
      others: "US-Cloud, kein AVV, keine Berufsgeheimnis-Konformität",
    },
    {
      feature: "österreichisches Recht",
      subsumio: "ABGB, ZPO, EO, UGB — korrekte Fristen und Paragrafen",
      others: "Keine österreichische Rechtskenntnis",
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
      a: 'Jene liefern Dokumente oder Textabschnitte. Subsumio liefert eine synthetisierte Antwort mit seitengenauen Zitaten, nutzt einen typisierten Wissensgraphen für Beziehungsfragen und zeigt explizit, was in der Akte noch fehlt (Gap-Analyse). Der Unterschied zwischen „irgendwo steht etwas" und „hier steht die Antwort, und hier fehlt noch etwas".',
    },
    {
      q: "Wo liegen meine Daten — und wie unterstützt Subsumio die Verschwiegenheit?",
      a: "Sie wählen: Self-Hosting auf eigener Hardware mit eigenen Schlüsseln, oder verwaltete EU-Cloud mit AVV. Mandantendaten verlassen nie die EU. Kein Dritter verarbeitet sie ohne ausdrückliche Freigabe. Die Architektur ist für Berufsgeheimnisträger gebaut — § 9 Abs. 2 RAO.",
    },
    {
      q: "Brauche ich IT-Kenntnisse oder eigene Server?",
      a: "Nein. Bei gehosteten Plänen ist alles verwaltet — keine API-Keys, keine Infrastruktur. Sie laden Dokumente hoch, stellen Fragen, bekommen Antworten. Wenn Sie E-Mails schreiben kannst, kannst du Subsumio bedienen. Enterprise-On-Premise läuft auf deiner Hardware mit deinen Schlüsseln.",
    },
    {
      q: "Trainiert Subsumio auf meinen Daten?",
      a: "Niemals. Ihr Kanzleiwissen gehört Ihnen. On-Premise bleibt alles auf Ihrer Infrastruktur. In der EU-Cloud wird es verschlüsselt und mandantensepariert verarbeitet — keine andere Kanzlei hat Zugriff.",
    },
    {
      q: "Funktioniert das mit unserer bestehenden Software?",
      a: "Ja. Subsumio importiert aus gängigen Buchhaltungssystemen, RA-Micro, anwalt.at und jedem System, das Dokumente exportieren kann. E-Mails über IMAP, WhatsApp über Meta Business API. Subsumio ersetzt nichts — es ergänzt deine Software um ein Kanzlei-Brain.",
    },
    {
      q: "Was passiert, wenn eine Antwort falsch ist?",
      a: "Jede Antwort nennt die Quelle — Sie prüfen in einem Klick. Wenn die Akte keine Antwort enthält, sagt Subsumio das explizit statt zu halluzinieren. Sie behalten immer die letzte Entscheidung.",
    },
    {
      q: "Wie werden Fristen berechnet?",
      a: "Not- und Berufungsfristen nach ZPO und ABGB — mit korrekter Monatsarithmetik und Feiertagsverschiebung. Eingehende Dokumente werden auf fristauslösende Ereignisse analysiert. Der tägliche Digest markiert kritische Fristen vor Ablauf.",
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
    {
      label: "Preise & Pläne",
      href: "/pricing",
    },
    {
      label: "Sicherheit & § 9 Abs. 2 RAO",
      href: "/security",
    },
    {
      label: "Features im Überblick",
      href: "/features",
    },
    {
      label: "Für Einzelanwälte",
      href: "/solutions/solo",
    },
    {
      label: "Für Kanzleien",
      href: "/solutions/law-firms",
    },
  ],
};

// ---------------------------------------------------------------------------
// UI_STRINGS — shared strings used across marketing components.
// Single source of truth for inline labels, badges, aria-labels, CTAs.
// ---------------------------------------------------------------------------

export const UI_STRINGS: Record<string, string> = {
  skipToContent: "Zum Inhalt springen",
  ariaMainNav: "Hauptnavigation",
  ariaHome: "Subsumio Startseite",
  ariaMobileNav: "Mobile Navigation",
  ariaCloseMenu: "Menü schließen",
  ariaLanguage: "Sprache",
  footerLegalTagline: "KI-Kanzleisoftware & Legal Intelligence für Anwälte",
  footerHostingLine:
    "EU-Cloud oder On-Premise · AVV inklusive · Verschwiegenheit nach § 9 Abs. 2 RAO im Blick",
  noCreditCard: "Keine Kreditkarte",
  trialDaysFree: "14 Tage gratis · Keine Kreditkarte",
  threeMinAnswer: "3 Min. zur ersten belegten Antwort",
  euHosted: "EU-gehostet oder On-Premise",
  seeFullPricing: "Alle Preisdetails ansehen",
  gdprReady: "DSGVO-konform",
  professionalSecrecy: "Berufsgeheimnis per Architektur",
  transparentFair: "Transparent & fair",
  noGamesTitle: "Keine Spielchen bei den Preisen",
  noGamesSub: "Kein Kleingedrucktes, keine Überraschungen auf der Rechnung.",
  stillQuestions: "Noch Fragen?",
  writeUs: "Schreib uns — wir antworten persönlich.",
  startFree: "Kostenlos starten",
  seePlans: "Pläne ansehen",
  trustedBy: "Vertraut von Kanzleien in Österreich",
  watchDemo: "Demo ansehen",
  trySubsumio: "Subsumio testen",
  ariaFeatures: "Features",
  ariaPricing: "Preise",
  ariaKeyMetrics: "Kennzahlen",
  ariaFaq: "FAQ",
  ariaCta: "Handlungsaufforderung",
  ariaComparison: "Vergleich",
  ariaRealWorkflows: "Praxis-Workflows",
  ariaCostOfInaction: "Was es Sie kostet",
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
    "Alles, was Sie über das SuperBrain, die nächtliche Konsolidierung und die 5-Ebenen-Architektur wissen müssen.",
  youLabel: "Sie",
  sourcesLabel: "Quellen:",
  thinkingLabel: "Durchsuche Wissensgraph…",
  verifyingLabel: "Belege werden geprüft",
  verifiedLabel: "Belege im Korpus gefunden",
  citePendingLabel: "wird geprüft",
  scrollToExplore: "Scrollen zum Erkunden",
  certificationsEyebrow: "Zertifizierungen & Integrationen",
  trustHeading: "Vertrauen, das man belegen kann",
  testimonialsTitle: "Was Anwälte über Subsumio sagen",
  testimonialsSub: "Echte Stimmen aus österreichischen Kanzleien.",
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
  verticalTrustNote: "Self-hosted · EU-Cloud · DSGVO-konform · § 9 Abs. 2 RAO im Blick",
  verticalFeaturesSub:
    "Von Fristenkontrolle bis Widerspruchserkennung — alles auf Ihrer Infrastruktur, jede Antwort mit Fundstelle.",
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
  demoReadOnlyNote: "Demo im Lesemodus · Ihre Daten bleiben bei Ihnen",
  seePlatform: "Plattform ansehen",
  questionsAnswered: "Fragen, beantwortet",
  notQuiteRight: "Nicht ganz das Richtige für Sie?",
  seeSolution: "Lösung ansehen",
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
  dashboardNotDatasheet: "Dashboard statt Datenblatt",
  docsTitle: "Jede Beschreibung zeigt auf einen echten Kanzlei-Workflow.",
  docsSub:
    "Die Docs sind nicht als rohe API-Liste gedacht. Sie erklären, welche Funktion im Dashboard sichtbar ist, welchen Kanzlei-Prozess sie verbessert und welche Sicherheitsannahme dahintersteht.",
  backToTopAria: "Zurück nach oben",
  docsSearchPlaceholder: "Features suchen…",
  docsNoResults: "Keine Features gefunden für",
  docsFeatureCount: "Features",
  docsCategoryCount: "Kategorien",
  docsStatsBadge: "Komplett dokumentiert",
  docsClearSearch: "Suche zurücksetzen",
  followContext: "Kontext folgen",
  menuAria: "Menü",
  dismissAnnouncement: "Mitteilung schließen",
  languageLabel: "Sprache / Language",
  readInGerman: "Auf Deutsch lesen",
  readInEnglish: "Read in English",
  pricingBadge: "Preise",
  mostPopular: "Beliebteste Wahl",
  billingAnnual: "Jährlich",
  billingMonthly: "Monatlich",
  toggleBilling: "Abrechnung umschalten",
  fullPricingFaq: "Alle Preise & FAQ",
  openMatter: "Akte öffnen",
  sendQuestion: "Frage senden",
  checkDeadline: "Frist prüfen",
  searchPlaceholder: "Suchen…",
  timeLabel: "09:42",
  mattersLabel: "Akten",
  mattersCount: "Akten",
  deadlinesLabel: "Fristen",
  urgentLabel: "dringend",
  signatureLabel: "Stärken",
  capabilitiesBadge: "Funktionen",
  seeAllCapabilities: "Alle Funktionen ansehen",
  whatsappDetail: "WhatsApp-Copilot im Detail",
  securityDetail: "Sicherheit & DSGVO im Detail",
  liveDemoRegion: "Live-Demo",
  matterLabel: "Akte",
  copilotLabel: "Copilot",
  reviewLabel: "Freigabe",
  inDashboard: "Im Dashboard",
  commandCenter: "Command Center",
  liveMatterContext: "Live-Aktenkontext",
  verifiableLabel: "prüfbar",
  exploreSecurity: "Sicherheit ansehen",
  exploreLabel: "Ansehen",
  askYourBrain: "Fragen Sie Ihr Kanzleiwissen…",
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

export const VALUE_PROPS: { title: string; desc: string }[] = [
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
    title: "Monatlich kündbar",
    desc: "Solo und Kanzlei werden monatlich abgerechnet. Enterprise wird individuell vereinbart.",
  },
];

/* ── Hero product demo + scroll story (AT, de) ─────────────────────────────
   Real Austrian example: Klagebeantwortung binnen vier Wochen (§ 243 Abs. 1 ZPO).
   Dates are illustrative; the matter is fictional. */
export const HERO_DEMO = {
  matter: "Novak ./. Versicherung AG",
  matterNumber: "2026-003",
  question: "Bis wann muss die Klagebeantwortung eingebracht werden?",
  answerLines: [
    "Die Klagebeantwortung ist binnen vier Wochen ab Zustellung der Klage einzubringen.",
    "Laut Zustellnachweis in der Akte wurde die Klage am 16.09.2026 zugestellt.",
    "Fristende ist daher der 14.10.2026 (Notfrist, keine Verlängerung möglich).",
  ],
  citations: [
    { label: "§ 243 Abs. 1 ZPO", source: "RIS, geltende Fassung", kind: "gesetz" as const },
    { label: "Klage_Zustellnachweis.pdf, S. 2", source: "Akte 2026-003", kind: "akte" as const },
  ],
  deadline: { title: "Klagebeantwortung", date: "14.10.2026", note: "Vorfrist 07.10.2026" },
  verified: "2 von 2 Fundstellen geprüft",
} as const;

export const SCROLL_STORY = {
  eyebrow: "So arbeitet Subsumio",
  title: "Von der Frage zur Frist in einem Durchgang",
  sub: "Kein Suchen in Ordnern, kein Abtippen von Fristen. Jede Antwort zeigt die Stelle, aus der sie kommt.",
  steps: [
    {
      key: "frage",
      title: "Fragen Sie in normaler Sprache",
      text: "Wie einer Kollegin. Subsumio versteht die Akte, die Parteien und das Verfahren, in dem Sie gerade arbeiten.",
    },
    {
      key: "akte",
      title: "Subsumio liest die Akte",
      text: "Schriftsätze, Zustellnachweise, E-Mails und Beilagen werden durchsucht, nicht nur nach Wörtern, sondern nach Bedeutung.",
    },
    {
      key: "fundstelle",
      title: "Jede Aussage hat eine Fundstelle",
      text: "Gesetz und Aktenseite werden zitiert und gegen den Rechtskorpus geprüft. Was nicht belegt ist, wird als solches markiert.",
    },
    {
      key: "frist",
      title: "Die Frist landet im Fristenbuch",
      text: "Erkannte Fristen werden mit Vorfrist vorgeschlagen. Sie prüfen, bestätigen, fertig. Nichts wird ohne Sie angelegt.",
    },
  ],
} as const;
