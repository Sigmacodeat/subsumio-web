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
  cta: "30 Tage testen",
  ctaSecondary: "Demo ansehen",
  ctaSecondaryHref: "/superbrain",
  pricingLabel: "Preise",
  pricingHref: "/pricing",
  announcement: {
    text: "Neu: Zitierte Normen in Antworten werden gegen die Rechtsquellen geprüft",
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
          description: "Wie Subsumio Antworten prüft und Kanzleiwissen aufbaut",
          icon: "Brain",
          badge: "AI",
          featured: true,
        },
        {
          label: "Funktionen",
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
          label: "Assistent auf WhatsApp",
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
          "Wie Subsumio Kanzleiwissen in fünf Prüfschritten aufbaut und über Nacht auf Widersprüche prüft",
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
          description: "Gemeinsames Kanzleiwissen, Fristen und Kommunikation für Teams",
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
          label: "Für Rechtsabteilungen",
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
  tagline: "KI-Kanzleisoftware, die nie vergisst — das Kanzleiwissen für Anwälte in Österreich.",
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
          label: "Funktionen",
          href: "/features",
        },
        {
          label: "Sicherheit",
          href: "/security",
        },
        {
          label: "Assistent auf WhatsApp",
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
          label: "Für Rechtsabteilungen",
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
          label: "Zur Anwendung",
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
  note: "Ihre Daten. Ihre Schlüssel. On-Premise auf eigener Hardware oder EU-Cloud mit AVV — DSGVO-konform, verschlüsselt übertragen, kein Training mit Ihren Daten.",
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

export const PRICING_FAQ: { title: string; items: { q: string; a: string }[] } = {
  title: "Preisfragen",
  items: [
    {
      q: "Gibt es eine kostenlose Testversion?",
      a: "Ja. Solo und Kanzlei testen Sie 30 Tage mit vollem Funktionsumfang, ohne Kreditkarte. Wählen Sie danach keinen Tarif, endet der Test automatisch.",
    },
    {
      q: "Kann ich jederzeit den Plan wechseln?",
      a: "Ja. Der Tarifwechsel ist jederzeit unter „Plan & Abrechnung“ möglich. Änderungen werden zum nächsten Abrechnungszeitraum wirksam — ohne Gebühren für den Wechsel.",
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
      a: "Nein. Mehrverbrauch entsteht nur über KI-Guthaben, das Sie selbst dazukaufen; die Preise stehen oben auf dieser Seite und unter „Plan & Abrechnung“. Sie sehen den Verbrauch live und wir fragen, bevor sich etwas ändert.",
    },
  ],
};

export const LANDING = {
  badge: "KI-Kanzleisoftware & Anwaltssoftware für Österreich",
  heroBadges: [
    "Jede Antwort mit geprüfter Fundstelle",
    "Verschwiegenheit nach § 9 Abs. 2 RAO im Systemdesign",
    "EU-Cloud oder On-Premise — Ihre Wahl",
  ],
  h1a: "Antworten aus Ihren Akten.",
  h1b: "Mit Quelle. In Sekunden.",
  sub: "Sie fragen in normaler Sprache. Subsumio antwortet mit seitengenauen Fundstellen aus Ihren Akten — und sagt offen, wenn die Akte nichts hergibt.",
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
  painTitle: "Was kostet Sie Suchen — jeden Tag?",
  painSub:
    "Jede Kanzlei verliert abrechenbare Zeit an Dinge, die eine Maschine besser macht — wenn sie für Anwälte gebaut ist.",
  pains: [
    {
      value: "Suchen statt arbeiten",
      label: "In Ordnern, E-Mails und alten Schriftsätzen. Zeit, die niemand verrechnen kann.",
    },
    {
      value: "Eine übersehene Notfrist",
      label: "genügt für einen Haftpflichtfall. Menschlich übersehen, maschinell vermeidbar.",
    },
    {
      value: "Fundstellen von Hand prüfen",
      label: "Jedes Zitat wird nachgeschlagen, bevor der Schriftsatz hinausgeht.",
    },
    {
      value: "Wochen der Einarbeitung",
      label: "Neue Kolleginnen und Kollegen brauchen lange, bis sie das Kanzleiwissen selbst finden.",
    },
  ],
  ctaPrimary: "30 Tage kostenlos testen",
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
        sources: ["zpo/§272", "akten/bauer-hofer"],
      },
    ],
  },
  stats: [
    {
      value: PROOF.recall8.value,
      label: `Trefferquote beim Wiederfinden der richtigen Stelle (${PROOF.recall8.benchmark}, ${PROOF.recall8.sampleSize} Fragen)`,
    },
    {
      value: "AT",
      label: "Gebaut für österreichisches Recht: ABGB, ZPO, EO, UGB, RAO",
    },
    {
      value: "0",
      label: "Training auf Ihren Mandantendaten — vertraglich ausgeschlossen",
    },
    {
      value: "14",
      label: "Tage gratis testen",
    },
  ],
  statsNote:
    "Eigene Suchtechnik statt Chat-Aufsatz. Jede Antwort nennt die Quelle — oder sagt ehrlich, wenn die Akte nichts hergibt.",
  featuresTitle: "Was Ihre Kanzlei ab heute kann",
  featuresSub: "Sechs Fähigkeiten, gebaut für Anwälte — nicht nachträglich angepasst.",
  features: [
    {
      icon: "Brain",
      color: "violet",
      title: "Antworten mit Fundstellen",
      desc: "Jede Antwort zitiert die genaue Stelle in Ihren Akten. Ein Klick öffnet das Dokument an dieser Stelle. Fehlt ein Beleg, steht das dabei.",
    },
    {
      icon: "CalendarClock",
      color: "amber",
      title: "Fristen automatisch berechnet",
      desc: "Not- und Rechtsmittelfristen nach ZPO und ABGB, samt Fristenhemmung und Feiertagen. Die tägliche Übersicht zeigt, was knapp wird.",
    },
    {
      icon: "MessageSquare",
      color: "emerald",
      title: "Unterwegs über WhatsApp",
      desc: "Zeiten buchen, Belege ablegen, Sprachnotizen diktieren. Alles landet in der richtigen Akte, aufbewahrt nach BAO.",
    },
    {
      icon: "ShieldAlert",
      color: "rose",
      title: "Konflikte vor Mandatsannahme",
      desc: "Jede neue Partei wird gegen den gesamten Aktenbestand geprüft, wie es § 10 RAO verlangt. Treffer sehen Sie, bevor Sie das Mandat annehmen.",
    },
    {
      icon: "Calculator",
      color: "blue",
      title: "Leistungen und Honorar",
      desc: "Zeiten und Auslagen erfassen, Honorar nach RATG oder Stundensatz abrechnen, Rechnungen als PDF versenden und an die Buchhaltung übergeben.",
    },
    {
      icon: "Shield",
      color: "violet",
      title: "Ihre Daten, Ihre Kontrolle",
      desc: "Auf Ihrem eigenen Server mit Ihren Schlüsseln oder in der verwalteten EU-Cloud mit Auftragsverarbeitungsvertrag. Sie entscheiden.",
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
      title: "Zusammenhänge erkennen",
      desc: "Beim Speichern erkennt Subsumio Personen, Fristen und Zusammenhänge und verknüpft sie mit der Akte. Automatisch, ohne Datenpflege von Hand.",
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
      text: "Sie trinken Kaffee. Subsumio hat schon alle Fristen für heute geprüft — eine Notfrist läuft um Mitternacht, markiert und mit der Akte verlinkt. Der tägliche Digest liegt im Posteingang. Sie wissen, was heute wichtig ist, bevor Sie den ersten Schriftsatz öffnest.",
    },
    {
      role: "Mittag · 12:15",
      text: "Auf dem Rückweg vom Gericht: „Zeit 0,5h Akte Müller, Widerspruch S.3 vs S.7 prüfen.“ Subsumio bucht die Zeit, findet den Widerspruch in den Schriftsätzen, legt alles in der Akte ab — während Sie noch unterwegs sind.",
    },
    {
      role: "Abend · 18:45",
      text: "„Entwirf die Replik dafür.“ Subsumio zieht die Argumente aus den Akten, zitiert S.3 und S.7, schlägt den Antrag vor. Sie prüfen die Fundstellen in einem Klick, bestätigst, fertig. Der Schriftsatz geht raus — mit Quellen, nicht mit Bauchgefühl.",
    },
  ],
  comparisonTitle: "Warum nicht einfach ein allgemeines KI-Werkzeug?",
  comparisonSub: "Allgemeine KI-Tools sind nicht für Anwälte gebaut. Subsumio ist es.",
  comparison: [
    {
      feature: "Fundstellen pro Antwort",
      subsumio: "Seitengenaue Zitate aus Ihren Akten",
      others: "Keine Fundstellen oder unüberprüfbar",
    },
    {
      feature: "Erfundene Quellen",
      subsumio: "Jede Fundstelle wird gegen die Quelle geprüft; fehlt ein Beleg, steht das dabei",
      others: "Erfinden mitunter Entscheidungen und Paragrafen",
    },
    {
      feature: "Berufsgeheimnis (§ 9 Abs. 2 RAO)",
      subsumio: "Eigener Server oder EU-Cloud mit Auftragsverarbeitungsvertrag",
      others: "Oft US-Cloud, Auftragsverarbeitung unklar",
    },
    {
      feature: "Österreichisches Recht",
      subsumio: "ABGB, ZPO, EO, UGB, RAO: Fristen und Paragrafen nach österreichischem Recht",
      others: "Meist auf deutsches oder US-Recht trainiert",
    },
    {
      feature: "Training auf Mandantendaten",
      subsumio: "Nein, vertraglich ausgeschlossen",
      others: "Oft ja oder unklar",
    },
  ],
  faqTitle: "Häufige Fragen",
  faq: [
    {
      q: "Was unterscheidet Subsumio von allgemeinen KI-Werkzeugen?",
      a: "Allgemeine Werkzeuge kennen Ihre Akten nicht und belegen ihre Aussagen nicht. Subsumio antwortet aus Ihren Akten und dem RIS, nennt zu jeder Aussage Seite und Absatz, erkennt Zusammenhänge zwischen Personen, Fristen und Dokumenten und sagt ausdrücklich, was in der Akte noch fehlt.",
    },
    {
      q: "Wo liegen meine Daten — und wie unterstützt Subsumio die Verschwiegenheit?",
      a: "Sie wählen: Self-Hosting auf eigener Hardware mit eigenen Schlüsseln, oder verwaltete EU-Cloud mit AVV. Mandantendaten verlassen nie die EU. Kein Dritter verarbeitet sie ohne ausdrückliche Freigabe. Die Architektur ist für Berufsgeheimnisträger gebaut — § 9 Abs. 2 RAO.",
    },
    {
      q: "Brauche ich IT-Kenntnisse oder eigene Server?",
      a: "Nein. Bei gehosteten Plänen ist alles verwaltet — keine API-Keys, keine Infrastruktur. Sie laden Dokumente hoch, stellen Fragen, bekommen Antworten. Wenn Sie E-Mails schreiben können, können Sie Subsumio bedienen. Enterprise-On-Premise läuft auf Ihrer Hardware mit Ihren Schlüsseln.",
    },
    {
      q: "Trainiert Subsumio auf meinen Daten?",
      a: "Niemals. Ihr Kanzleiwissen gehört Ihnen. On-Premise bleibt alles auf Ihrer Infrastruktur. In der EU-Cloud wird es verschlüsselt und mandantensepariert verarbeitet — keine andere Kanzlei hat Zugriff.",
    },
    {
      q: "Funktioniert das mit unserer bestehenden Software?",
      a: "Ja. Subsumio übernimmt Dokumente aus jedem System, das sie exportieren kann (PDF, Word, E-Mail-Archive), ruft Ihr E-Mail-Postfach per IMAP ab, ordnet E-Mails der Akte zu und bindet WhatsApp Business, DocuSign und Word an. Subsumio ersetzt Ihre Kanzleisoftware nicht — es macht deren Inhalte abfragbar.",
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
      a: "Solo 249 € pro Monat für einen Nutzer, Kanzlei 1.499 € pro Monat inklusive fünf Nutzern, Enterprise auf Anfrage. Beide Tarife sind monatlich kündbar. Nutzungslimits und Mehrverbrauch werden vor Abschluss ausgewiesen und sind in der Übersicht jederzeit sichtbar. 30 Tage gratis, keine Kreditkarte.",
    },
  ],
  ctaTitle: "Hören Sie auf zu suchen. Fragen Sie.",
  ctaSub:
    "30 Tage volle Testversion. Keine Kreditkarte, kein IT-Aufwand. Ihr Team ist morgen produktiver.",
  ctaButton: "30 Tage kostenlos testen",
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
      label: "Funktionen im Überblick",
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
  trialDaysFree: "30 Tage gratis · Keine Kreditkarte",
  threeMinAnswer: "3 Min. zur ersten belegten Antwort",
  euHosted: "EU-gehostet oder On-Premise",
  seeFullPricing: "Alle Preisdetails ansehen",
  gdprReady: "DSGVO-konform",
  professionalSecrecy: "Berufsgeheimnis per Architektur",
  transparentFair: "Preise",
  noGamesTitle: "Keine Spielchen bei den Preisen",
  noGamesSub: "Fixer Monatspreis, monatlich kündbar, Export jederzeit.",
  stillQuestions: "Noch Fragen?",
  writeUs: "Schreiben Sie uns — wir antworten persönlich.",
  startFree: "30 Tage kostenlos testen",
  seePlans: "Pläne ansehen",
  trustedBy: "Gebaut für Kanzleien in Österreich",
  watchDemo: "Demo ansehen",
  trySubsumio: "Subsumio testen",
  ariaFeatures: "Funktionen",
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
  comparisonFeature: "Kriterium",
  comparisonOthers: "Andere KI-Tools",
  exploreAllFeatures: "Alle Funktionen ansehen",
  readSecurityDetails: "Sicherheit im Detail",
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
  certificationsEyebrow: "Fundament",
  trustHeading: "Gebaut auf österreichischem Berufsrecht, nicht nachträglich angepasst",
  testimonialsTitle: "Was Anwälte über Subsumio sagen",
  testimonialsSub: "Echte Stimmen aus österreichischen Kanzleien.",
  navOverview: "Übersicht",
  navMatters: "Akten",
  navDeadlines: "Fristen",
  navIntake: "Posteingang",
  navChat: "Assistent",
  workflowMatter: "Akte",
  workflowDoc: "Dok",
  workflowRisk: "Risiko",
  workflowTask: "Aufgabe",
  featuresWorkflowTitle: "Jede Funktion folgt dem Arbeitsablauf der Kanzlei.",
  featuresWorkflowSub:
    "Akte, Assistent, Frist, Quelle und Freigabe greifen ineinander. Deshalb beschreibt Subsumio jede Funktion im Kontext der Oberfläche, in der Anwälte sie wirklich benutzen.",
  featuresChecklist1: "Quelle geprüft",
  featuresChecklist2: "Berechtigung aktiv",
  featuresChecklist3: "Nächster Schritt vorbereitet",
  featuresGraphCaption: "Zusammenhänge, beim Speichern erkannt",
  featuresSecurityTitle: "Gebaut für vertrauliche Arbeit",
  featuresSecuritySub:
    "EU-Hosting, On-Premise im Enterprise-Tarif, getrennte Datenräume je Kanzlei und Kennzeichnung nach Art. 50 KI-VO. Die vollständige Darstellung hat eine eigene Seite.",
  featuresGlanceTitle: "Fünf Bereiche im Detail",
  featuresEmptyState:
    "Durch Tests erzwungen, nicht durch Policy-Dokumente — deterministisches, prüfbares Verhalten.",
  downloadHint: "2 Fristen diese Woche — Klagebeantwortung Müller am Do",
  verticalSeePricing: "Preise ansehen",
  verticalSeeLive: "Live ansehen",
  verticalTrialNote:
    "30 Tage kostenlos testen · Keine Kreditkarte erforderlich",
  verticalTrustNote: "EU-Cloud · On-Premise (Enterprise) · DSGVO · § 9 Abs. 2 RAO",
  verticalFeaturesSub:
    "Von Fristenkontrolle bis Widerspruchserkennung — jede Antwort mit Fundstelle.",
  subpagesConfirmationNote: "Alles bestätigungspflichtig — nichts landet ungesehen in der Akte.",
  typingLabel: "tippt…",
  todayLabel: "Heute",
  confirmedLabel: "Bestätigt",
  messageLabel: "Nachricht",
  verificationLabel: "Fünffach geprüft",
  tryYourselfLabel: "Jetzt selbst fragen",
  replayLabel: "Nochmal ansehen",
  askLabel: "Fragen",
  placeholderDemo: "Fragen Sie die Demo-Akte…",
  liveLabel: "live",
  liveDemoPrefix: "Live aus der Demo-Akte:",
  ariaProductDemo: "Produkt-Demo Konversation",
  ariaSubsumioEngine: "So arbeitet Subsumio",
  engineTraits: "abfragbar · belegt · isoliert",
  lawFirmLabel: "Rechtsanwälte",
  lawFirmName: "Kanzlei Müller",
  activeLabel: "Aktiv",
  scriptedLabel: "Beispielantwort",
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
    "Ein Foto oder Dokument mit Aktenkürzel in der Bildunterschrift wird in der richtigen Akte abgelegt.",
  voiceNote: "Sprachnotiz unterwegs",
  voiceNoteDesc:
    "Diktat nach dem Termin — transkribiert und der Akte angehängt, bevor Sie im Büro sind.",
  dashboardNotDatasheet: "Das Produkt statt Datenblatt",
  docsTitle: "Jede Beschreibung zeigt auf einen echten Kanzlei-Workflow.",
  docsSub:
    "Die Docs sind nicht als rohe API-Liste gedacht. Sie erklären, welche Funktion in Subsumio sichtbar ist, welchen Kanzlei-Prozess sie verbessert und welche Sicherheitsannahme dahintersteht.",
  backToTopAria: "Zurück nach oben",
  docsSearchPlaceholder: "Funktionen suchen…",
  docsNoResults: "Keine Funktion gefunden für",
  docsFeatureCount: "Funktionen",
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
  mostPopular: "Empfohlen für Kanzleien ab 2 Personen",
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
  whatsappDetail: "Assistent auf WhatsApp im Detail",
  securityDetail: "Sicherheit & DSGVO im Detail",
  liveDemoRegion: "Live-Demo",
  matterLabel: "Akte",
  copilotLabel: "Assistent",
  reviewLabel: "Freigabe",
  inDashboard: "In Subsumio",
  commandCenter: "Übersicht",
  liveMatterContext: "Live-Aktenkontext",
  verifiableLabel: "prüfbar",
  exploreSecurity: "Sicherheit ansehen",
  exploreLabel: "Ansehen",
  askYourBrain: "Fragen Sie Ihr Kanzleiwissen…",
  gapWarning: "⚠ Tagsatzung Do 14 Uhr: Vollmacht fehlt in der Akte",
  worksOffline: "Startet auch ohne Netz",
  installNow: "Subsumio jetzt installieren",
  getStarted: "30 Tage kostenlos testen",
  seeFeatures: "Funktionen ansehen",
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
    title: "EU-Cloud oder On-Premise",
    desc: "EU-Cloud in allen Tarifen, On-Premise im Enterprise-Tarif.",
  },
  {
    title: "Keine Bindung",
    desc: "Vollständiger Datenexport jederzeit — Ihre Akten gehören Ihnen.",
  },
  {
    title: "Monatlich kündbar",
    desc: "Solo und Kanzlei werden monatlich abgerechnet. Enterprise wird individuell vereinbart.",
  },
];

/* ── Hero product demo + scroll story (AT, de) ─────────────────────────────
   Real Austrian example: Klagebeantwortung binnen vier Wochen (§ 230 ZPO).
   Dates are illustrative; the matter is fictional. */
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

/* ── Product demo (replica of the real dashboard) ─────────────────────────
   One Austrian example, end to end. Dates are illustrative, the matter is
   fictional. § 230 ZPO: Klagebeantwortung binnen vier Wochen. */
export const PRODUCT_DEMO = {
  ariaLabel:
    "Beispiel aus Subsumio: Frage zur Klagebeantwortung, Antwort mit geprüften Fundstellen aus ZPO und Akte, Fristvorschlag im Fristenbuch.",
  user: "Mag. Huber",
  brainStats: "1.247 Seiten · 89 Einträge",
  matter: "Novak gg. Versicherung AG",
  matterNumber: "2026-003",
  question: "Bis wann muss die Klagebeantwortung eingebracht werden?",
  thinking: "Liest Zustellnachweis und ZPO …",
  answer: [
    "Die Klagebeantwortung ist binnen vier Wochen ab Zustellung der Klage einzubringen (§ 230 ZPO).",
    "Laut Zustellnachweis in der Akte wurde die Klage am 16.09.2026 zugestellt.",
    "Fristende ist daher der 14.10.2026. Die Frist ist nicht verlängerbar.",
  ],
  documents: [
    {
      name: "Klage_Zustellnachweis.pdf",
      meta: "Zustellung 16.09.2026 · 2 Seiten",
      hit: true,
      kind: "pdf",
    },
    { name: "Klage_Novak_Versicherung.pdf", meta: "Klage · 14 Seiten", hit: true, kind: "pdf" },
    { name: "Vollmacht_Novak.pdf", meta: "Vollmacht · 1 Seite", hit: false, kind: "pdf" },
    {
      name: "Korrespondenz Versicherung AG",
      meta: "E-Mail · 4 Nachrichten",
      hit: false,
      kind: "mail",
    },
    { name: "Polizze_Auszug.pdf", meta: "Beilage ./B · 6 Seiten", hit: false, kind: "pdf" },
  ],
  deadline: {
    title: "Klagebeantwortung",
    date: "14.10.2026",
    basis: "§ 230 ZPO, Zustellung 16.09.2026",
  },
  deadlineSummary: "3 Fristen aus allen Akten",
  deadlines: [
    {
      key: "new",
      title: "Klagebeantwortung",
      matter: "Novak gg. Versicherung AG · 2026-003",
      status: "Notfrist",
      tone: "warning",
      date: "14.10.2026",
    },
    {
      key: "a",
      title: "Vorfrist Klagebeantwortung",
      matter: "Novak gg. Versicherung AG · 2026-003",
      status: "Vorfrist",
      tone: "info",
      date: "07.10.2026",
    },
    {
      key: "b",
      title: "Berufung",
      matter: "Gruber gg. Immo GmbH · 2026-004",
      status: "Ausstehend",
      tone: "default",
      date: "21.10.2026",
    },
    {
      key: "c",
      title: "Vorbereitende Tagsatzung",
      matter: "Maier gg. Stadt Wien · 2026-002",
      status: "Termin",
      tone: "default",
      date: "03.12.2026",
    },
  ],
  sceneLabels: {
    frage: "Frage an den Assistenten",
    akte: "Subsumio liest die Akte",
    fundstelle: "Antwort mit Fundstellen",
    frist: "Frist im Fristenbuch",
  },
} as const;
