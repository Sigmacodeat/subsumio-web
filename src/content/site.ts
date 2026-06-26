// Subsumio — central bilingual content system.
// EN is the default locale (global market), DE lives under /de.
// One source of truth: layouts render from these objects, never duplicate copy in JSX.

export type Lang = "en" | "de";

// Öffentliche Repo-URL der Open-Source-Engine. EINE Stelle zum Ändern —
// per NEXT_PUBLIC_ENGINE_REPO_URL überschreibbar. Auf den eigenen
// öffentlichen Fork setzen, bevor die Marketing-Seite live geht.
export const ENGINE_REPO_URL =
  process.env.NEXT_PUBLIC_ENGINE_REPO_URL || "https://github.com/subsumio/subsumio";
export const ENGINE_REPO_INSTALL = ENGINE_REPO_URL.replace("https://github.com/", "github:");

/** Build a locale-aware path. p("de", "/pricing") => "/de/pricing"; p("en", "") => "/" */
export function p(lang: Lang, path: string): string {
  if (lang === "de") return path === "" || path === "/" ? "/de" : `/de${path}`;
  return path === "" ? "/" : path;
}

/** The same page in the other language (for the language switcher). */
export function altPath(lang: Lang, pathname: string): string {
  if (lang === "en") return pathname === "/" ? "/de" : `/de${pathname}`;
  const stripped = pathname.replace(/^\/de/, "");
  return stripped === "" ? "/" : stripped;
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

export const NAV: Record<Lang, NavContent> = {
  en: {
    signIn: "Sign in",
    cta: "Get started",
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
  de: {
    signIn: "Anmelden",
    cta: "Jetzt starten",
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
            description: "Sprich mit unserem Team",
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
  },
};

export const FOOTER = {
  en: {
    tagline: "The brain your firm never had.",
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
    tagline: "Das KI-Gehirn für deine Kanzlei.",
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
} as const;

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
        id: "community",
        name: "Community",
        price: "€0",
        period: "forever",
        blurb: "For solo lawyers exploring AI-assisted case work. Free forever, no credit card required.",
        features: [
          "Self-hosted — your server, your keys",
          "50 AI queries/mo included",
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
        blurb: "One shared brain, every lawyer's matters indexed together. From 5 seats. Annual billing saves 20%.",
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
        blurb: "Compliance-grade for regulated firms. From 20 seats, on your infrastructure or EU cloud.",
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
        cta: "Talk to us",
        href: "mailto:hello@subsum.eu",
      },
    ],
    footnote:
      "Annual billing −20 %. Included AI query and storage quotas shown per plan. Overages billed at transparent per-unit rates at month end — no surprise bills, no silent throttling. Token add-on packs available: 500 queries for €199, 1,500 for €499, 5,000 for €1,499.",
  },
  de: {
    title: "Kanzleisoftware Preise — pro Nutzer, kein Lock-in",
    sub: "Pro Nutzer, jährliche Abrechnung. Dein Kanzleiwissen auf Infrastruktur, die du kontrollierst — EU-gehostet oder On-Premise.",
    tiers: [
      {
        id: "community",
        name: "Community",
        price: "0 €",
        period: "für immer",
        blurb: "Für Einzelanwälte, die KI-gestützte Aktenarbeit erkunden. Kostenlos für immer, keine Kreditkarte nötig.",
        features: [
          "Self-hosted — dein Server, deine Keys",
          "50 KI-Anfragen/Mon. inklusive",
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
        cta: "Sprich mit uns",
        href: "mailto:hello@subsum.eu",
      },
    ],
    footnote:
      "Jahreszahlung −20 %. KI-Anfragen und Speicher-Kontingente sind je Plan inklusive. Mehrverbrauch wird zu transparenten Einheitspreisen am Monatsende abgerechnet — keine Überraschungsrechnung, kein stilles Drosseln. Zusatzpakete: 500 Anfragen für 199 €, 1.500 für 499 €, 5.000 für 1.499 €.",
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
        a: "Ja. Jeder gehostete Plan startet mit einem 14-Tage-Reverse-Trial — voller Zugriff, keine Kreditkarte. Wenn Subsumio nicht das Richtige für dich ist, kündige innerhalb von 14 Tagen für eine volle Rückerstattung.",
      },
      {
        q: "Kann ich jederzeit den Plan wechseln?",
        a: "Ja. Upgrade oder Downgrade aus dem Dashboard jederzeit möglich. Änderungen werden zum nächsten Abrechnungszeitraum wirksam — keine Strafgebühren, kein Lock-in.",
      },
      {
        q: "Wie funktioniert die jährliche Abrechnung?",
        a: "Jahreszahlung gibt dir 20% Rabatt auf den Monatspreis. Du wirst einmal pro Jahr pro Nutzer abgerechnet. Monatsabrechnung ist verfügbar, wenn du mehr Flexibilität möchtest.",
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
// Landing page
// ---------------------------------------------------------------------------

export const LANDING = {
  en: {
    badge: "AI legal software",
    h1a: "Every matter,",
    h1b: "one cited answer.",
    sub: "Subsumio turns matters, deadlines, emails and documents into cited answers you can trust — AI legal software built for law firms in AT, DE and CH.",
    ctaPrimary: "Get started",
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
      { value: "72", label: "API endpoints, fully documented" },
      { value: "3", label: "jurisdictions — AT · DE · CH" },
      { value: "0", label: "client-data leaks, by design" },
    ],
    statsNote: "Not a chat wrapper — engine-class retrieval where every AI answer cites its exact source.",
    featuresTitle: "Built for law firms. Not adapted for them.",
    featuresSub:
      "From deadline control to contradiction detection — every answer cited, every deadline tracked, no hallucinations.",
    features: [
      {
        icon: "Brain",
        color: "violet",
        title: "Answers with citations",
        desc: "Every AI answer cites the exact pages it comes from. Verify in one click before anything goes into a brief — no hallucinated references.",
      },
      {
        icon: "CalendarClock",
        color: "amber",
        title: "Deadlines, automatically",
        desc: "Statutory and appeal deadlines computed per ZPO/BGB/ABGB with correct month arithmetic and weekend roll-forward. A daily email digest flags what's critical.",
      },
      {
        icon: "MessageSquare",
        color: "emerald",
        title: "WhatsApp copilot",
        desc: "Book time, file documents, send voice notes from your phone. Everything lands in the right matter — confirmation-gated, nothing reaches the file unseen.",
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
        desc: "On every write, typed edges — people, deadlines, relationships — are extracted as a legal knowledge graph. No extra LLM calls.",
      },
      {
        step: "03",
        icon: "Search",
        title: "Ask",
        desc: "Plain-language questions. Hybrid retrieval across vector, keyword and graph finds the decisive passages.",
      },
      {
        step: "04",
        icon: "Brain",
        title: "Cited answer",
        desc: "A synthesized answer with page-level citations — plus an honest note on what the file is still missing.",
      },
    ],
    scenariosTitle: "Real workflows",
    scenariosSub: "From the engine, not a mockup — three workflows your team will recognize.",
    scenarios: [
      {
        role: "Incoming post",
        text: "Upload the day's mail and a scanned contract, then ask: “Which deadlines does this trigger?” — every statutory date is calculated per ZPO/BGB/ABGB, calendared and linked to the matter.",
      },
      {
        role: "Trial prep",
        text: "Send a voice note and a PDF by WhatsApp with a matter reference, book 20 minutes, then ask: “Where do the opposing party's statements contradict each other?” — the Dream Cycle finds it across filings, exhibits and protocols.",
      },
      {
        role: "Onboarding a new associate",
        text: "Index five years of matters and pleadings. The new associate asks: “Have we argued something like this before?” — and finds the 2023 brief in seconds, with page-level citations.",
      },
    ],
    faqTitle: "Questions, answered",
    faq: [
      {
        q: "How is this different from Notion AI, Glean or a vector database?",
        a: "Those return documents or chunks. Subsumio returns a synthesized answer with citations, walks a typed knowledge graph for relationship questions (“who invested in X?”), and tells you what it doesn't know — the gap analysis is the part that changes how you work.",
      },
      {
        q: "Where does my data live?",
        a: "Your choice. Self-host the engine on your own hardware, or use our managed EU cloud. Enterprise plans support on-prem and a signed DPA.",
      },
      {
        q: "Do I need API keys or a server?",
        a: "No. Sign up and your brain runs — fully managed, no keys, no infrastructure. Enterprise self-hosting runs on your own hardware with your own keys.",
      },
      {
        q: "What happens when I hit my plan limits?",
        a: "You see usage live in the dashboard and we ask before anything changes. No surprise bills, no silent throttling.",
      },
      {
        q: "Do you train on our data?",
        a: "Never. Your knowledge is yours alone — never used to train shared models. Self-hosted, nothing leaves your building; on our EU cloud it stays encrypted and isolated per customer.",
      },
    ],
    ctaTitle: "Your matters deserve better.",
    ctaSub: "Three minutes to first cited answer. No credit card.",
    ctaButton: "Get started with Subsumio",
  },
  de: {
    badge: "KI-Kanzleisoftware",
    h1a: "Jede Akte,",
    h1b: "eine belegte Antwort.",
    sub: "Subsumio bringt Akten, Fristen, Mails und Dokumente in eine KI-Kanzleisoftware — jede Antwort mit Quellenangabe, keine Halluzination. Gebaut für Kanzleien in AT, DE und CH.",
    ctaPrimary: "Jetzt starten",
    ctaSecondary: "Demo ansehen",
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
    stats: [
      { value: "97,9 %", label: "Recall@5 — Retrieval-Benchmark" },
      { value: "72", label: "API-Endpunkte, voll dokumentiert" },
      { value: "3", label: "Jurisdiktionen — AT · DE · CH" },
      { value: "0", label: "bekannte Mandantendaten-Leaks" },
    ],
    statsNote: "Kein Chat-Wrapper. Engine-Klasse Retrieval — jede KI-Antwort nennt die exakte Quellenangabe.",
    featuresTitle: "Für Kanzleien gebaut. Nicht nachträglich angepasst.",
    featuresSub:
      "Von Fristenkontrolle bis Widerspruchserkennung — jede Antwort belegt, jede Frist im Blick, keine Halluzination.",
    features: [
      {
        icon: "Brain",
        color: "violet",
        title: "Antworten mit Fundstellen",
        desc: "Jede KI-Antwort zitiert die exakten Fundstellen. Ein Klick zur Verifikation, bevor etwas in den Schriftsatz geht — keine halluzinierten Quellen mehr.",
      },
      {
        icon: "CalendarClock",
        color: "amber",
        title: "Fristen, automatisch",
        desc: "Notfristen und Berufungsfristen nach ZPO/BGB/ABGB mit korrekter Monatsarithmetik und Wochenend-Verschiebung. Täglicher E-Mail-Digest für kritische Fristen.",
      },
      {
        icon: "MessageSquare",
        color: "emerald",
        title: "WhatsApp-Copilot",
        desc: "Zeiten buchen, Dokumente ablegen, Sprachnotizen vom Handy. Alles landet in der richtigen Akte — bestätigungspflichtig, nichts erreicht die Akte ungesehen.",
      },
      {
        icon: "ShieldAlert",
        color: "rose",
        title: "Kollisionsprüfung (§ 43a BRAO / § 10 RAO / BGFA)",
        desc: "Jeder neue Mandant oder Gegner wird serverseitig gegen den gesamten Aktenbestand geprüft — Konflikte werden gemeldet, bevor das Mandat angenommen wird. Deckt § 43a BRAO (DE), § 10 RAO (AT) und BGFA (CH) ab.",
      },
      {
        icon: "Calculator",
        color: "blue",
        title: "Zeiten, Auslagen, Rechnungen & DATEV",
        desc: "Minuten nach Anwalt und Tätigkeit buchen, abrechenbare Auslagen erfassen, Rechnungen aus offener Arbeit erstellen, DATEV-ready exportieren (DE) bzw. ADATEV (AT).",
      },
      {
        icon: "Shield",
        color: "violet",
        title: "On-Premise oder EU-Cloud",
        desc: "Die vollständige Engine auf eigener Kanzlei-Infrastruktur — oder verwaltete EU-Cloud mit AVV. Mandantendaten bleiben unter deiner Kontrolle.",
      },
    ],
    howTitle: "So funktioniert's: vom Dokument zur belegten Antwort",
    how: [
      {
        step: "01",
        icon: "Database",
        title: "Füttern",
        desc: "Akten, Mails, PDFs, Sprachnotizen, WhatsApp. Subsumio zerlegt, vektorisiert und indiziert automatisch. OCR holt Text auch aus Scans.",
      },
      {
        step: "02",
        icon: "Network",
        title: "Strukturieren",
        desc: "Bei jedem Speichern erkennt die Engine Personen, Fristen und Beziehungen und baut daraus einen juristischen Wissensgraphen. Ohne manuelle Datenpflege.",
      },
      {
        step: "03",
        icon: "Search",
        title: "Fragen",
        desc: "Fragen in normaler Sprache. Hybrid-Suche aus Vektor, Stichwort und Graph findet die entscheidenden Stellen.",
      },
      {
        step: "04",
        icon: "Brain",
        title: "Belegte Antwort",
        desc: "Synthetisierte Antwort mit seitengenauen Zitaten — plus ehrlicher Hinweis, was in der Akte noch fehlt.",
      },
    ],
    scenariosTitle: "Kanzlei-Workflows aus der Praxis",
    scenariosSub: "Echte Abläufe aus dem Produkt — drei Szenarien, die jeder Anwalt kennt.",
    scenarios: [
      {
        role: "Eingangspost",
        text: "Die Tagespost und einen gescannten Vertrag hochladen, dann fragen: „Welche Fristen löst das aus?“ — jedes gesetzliche Datum wird nach ZPO/BGB/ABGB berechnet, im Kalender eingetragen und mit der Akte verknüpft.",
      },
      {
        role: "Verhandlungsvorbereitung",
        text: "Sprachnotiz und PDF per WhatsApp mit Aktenzeichen schicken, 20 Minuten buchen, dann fragen: „Wo widersprechen sich die Schriftsätze der Gegenseite?“ — der Dream Cycle findet es über Schriftsätze, Anlagen und Protokolle hinweg.",
      },
      {
        role: "Neuer Mitarbeiter",
        text: "Fünf Jahre Akten und Schriftsätze indexieren. Der neue Mitarbeiter fragt: „Haben wir schon mal so etwas argumentiert?“ — und findet den Schriftsatz von 2023 in Sekunden, mit seitengenauen Zitaten.",
      },
    ],
    faqTitle: "Fragen, beantwortet",
    faq: [
      {
        q: "Was unterscheidet das von Notion AI, Glean oder einer Vektor-Datenbank?",
        a: "Die liefern Dokumente oder Chunks. Subsumio liefert eine synthetisierte Antwort mit Zitaten, läuft für Beziehungsfragen („wer hat in X investiert?“) über einen typisierten Wissensgraphen und sagt dir, was es nicht weiß — die Gap-Analyse verändert, wie du arbeitest.",
      },
      {
        q: "Wo liegen meine Daten?",
        a: "Deine Wahl. Self-hoste die Engine auf eigener Hardware oder nutze unsere verwaltete EU-Cloud. Enterprise-Pläne unterstützen On-Prem und einen AVV.",
      },
      {
        q: "Brauche ich API-Keys oder einen Server?",
        a: "Nein. Bei gehosteten Plänen ist Subsumio vollständig verwaltet: keine API-Keys, keine eigene Infrastruktur. Enterprise-On-Premise läuft auf eigener Hardware mit eigenen Schlüsseln.",
      },
      {
        q: "Was passiert, wenn ich an Plan-Limits stoße?",
        a: "Du siehst den Verbrauch live im Dashboard, und wir fragen, bevor sich etwas ändert. Keine Überraschungsrechnung, kein stilles Drosseln.",
      },
      {
        q: "Trainiert ihr auf meinen Daten?",
        a: "Niemals. Dein Kanzleiwissen gehört allein dir und wird nicht zum Training geteilter Modelle genutzt. On-Premise bleibt alles auf deiner Infrastruktur; in der EU-Cloud wird es verschlüsselt und mandantensepariert verarbeitet.",
      },
    ],
    ctaTitle: "Deine Kanzlei. Endlich abfragbar.",
    ctaSub: "Drei Minuten bis zur ersten belegten Antwort. Keine Kreditkarte.",
    ctaButton: "Mit Subsumio starten",
  },
} as const;

// ---------------------------------------------------------------------------
// UI_STRINGS — shared bilingual strings used across marketing components.
// Single source of truth for inline labels, badges, aria-labels, CTAs.
// ---------------------------------------------------------------------------

export const UI_STRINGS: Record<Lang, Record<string, string>> = {
  en: {
    // Landing — trust signals
    noCreditCard: "No credit card",
    threeMinAnswer: "3 min to first cited answer",
    euHosted: "EU-hosted or self-hosted",
    liveDemoAria: "Live demo",
    inActionBadge: "In action",
    dashboardTitle: "Attach a file. Ask. Cited answer.",
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
    getStarted: "Get started",
    seeFeatures: "See features",
    pushNotifications: "Push notifications",
    biometricUnlock: "Biometric unlock",
    sendToSubsumio: "“Send to Subsumio”",
    comingSoonTo: "Coming soon to",
  },
  de: {
    // Landing — trust signals
    noCreditCard: "Keine Kreditkarte",
    threeMinAnswer: "3 Min. zur ersten belegten Antwort",
    euHosted: "EU-gehostet oder On-Premise",
    liveDemoAria: "Live-Demo",
    inActionBadge: "In Aktion",
    dashboardTitle: "Datei anhängen. Fragen. Zitierte Antwort.",
    dashboardSub:
      "Dateien per Upload, Google Drive oder Anwaltssoftware in die Wissensbasis — dann im Chat fragen, mit seitengenauen Quellen.",
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
    askYourBrain: "Frag dein Brain…",
    gapWarning: "⚠ Lücke: Do 14 Uhr ohne Notiz",
    worksOffline: "Funktioniert offline",
    installNow: "Subsumio jetzt installieren",
    getStarted: "Jetzt starten",
    seeFeatures: "Features ansehen",
    pushNotifications: "Push-Benachrichtigungen",
    biometricUnlock: "Biometrische Entsperrung",
    sendToSubsumio: "„An Subsumio senden“",
    comingSoonTo: "Bald im",
  },
};

// ---------------------------------------------------------------------------
// VALUE_PROPS — pricing page value propositions (bilingual).
// Used by pricing-page.tsx. Moved here for single-source-of-truth.
// ---------------------------------------------------------------------------

export const VALUE_PROPS: Record<
  Lang,
  { title: string; desc: string }[]
> = {
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
  de: [
    {
      title: "Keine versteckten Kosten",
      desc: "Was auf der Preisliste steht, zahlst du. Keine Überraschungen bei der Rechnung.",
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
      title: "Kostenlos starten",
      desc: "Der Community-Plan ist kostenlos. Upgrade jederzeit, downgrade auch.",
    },
  ],
};
