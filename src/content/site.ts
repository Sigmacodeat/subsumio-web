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
            description: "AI legal software for law firms in DACH",
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
            description: "Book time, file docs from your phone",
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
            description: "Legal ops with audit-ready memory",
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
            description: "KI-Kanzleisoftware für DACH",
            icon: "Layers",
          },
          {
            label: "Features",
            href: "/features",
            description: "Jede Funktion, nichts verborgen",
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
            description: "Ein Seat, ein Brain, null Overhead",
            icon: "User",
          },
          {
            label: "Für Justiziariate",
            href: "/solutions/in-house",
            description: "Legal Ops mit audit-ready Gedächtnis",
            icon: "Building2",
          },
          {
            label: "Für Mittelständische",
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
    note: "Your data, your keys — self-hosted on your hardware or our EU cloud. Built for confidentiality-first work.",
  },
  de: {
    tagline: "Das Brain deiner Kanzlei.",
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
    note: "Deine Daten, deine Keys — self-hosted auf deiner Hardware oder in unserer EU-Cloud. Gebaut für vertraulichkeitskritische Arbeit.",
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
        id: "pro",
        name: "Pro",
        price: "€890",
        priceMonthly: "€1,113",
        period: "/seat/mo",
        periodMonthly: "/seat/mo",
        blurb: "For the lawyer who lives on their knowledge. Annual billing saves 20%.",
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
        blurb: "One shared brain, scoped per user. From 5 seats. Annual billing saves 20%.",
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
        blurb: "Compliance-grade. From 20 seats, your infrastructure or EU cloud.",
        features: [
          "15,000 AI queries/seat/mo (Fair Use beyond)",
          "5,000 WhatsApp messages/seat/mo",
          "500 GB storage per seat",
          "EU cloud, Vercel Blob/S3 or on-prem",
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
    title: "Kanzleisoftware Preise — pro Seat, kein Lock-in",
    sub: "Pro Seat, jährliche Abrechnung. Das Brain deiner Kanzlei auf Infrastruktur, die du kontrollierst — EU-gehostet oder On-Premise.",
    tiers: [
      {
        id: "pro",
        name: "Pro",
        price: "890 €",
        priceMonthly: "1.113 €",
        period: "/Seat/Mon.",
        periodMonthly: "/Seat/Mon.",
        blurb: "Für Anwälte, die von ihrem Wissen leben. Jahreszahlung spart 20%.",
        features: [
          "Voll verwaltet — keine API-Keys nötig",
          "1.000 KI-Anfragen/Seat/Mon. inklusive",
          "75 GB Cloud-Speicher pro Seat",
          "300 WhatsApp-Nachrichten/Mon. inklusive",
          "24/7 Dream Cycle (Dedupe, Zitate, Widersprüche)",
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
        period: "/Seat/Mon.",
        periodMonthly: "/Seat/Mon.",
        blurb: "Ein gemeinsames Brain, pro Nutzer gescoped. Ab 5 Seats. Jahreszahlung spart 20%.",
        features: [
          "Alles aus Pro",
          "Geteiltes Firmen-Gedächtnis",
          "4.000 KI-Anfragen/Seat/Mon. inklusive",
          "200 GB Cloud-Speicher pro Seat",
          "1.000 WhatsApp-Nachrichten/Mon. inklusive",
          "Zugriff pro Nutzer gescoped — fuzz-getestet, null Leaks",
          "Admin & Nutzungs-Analytics",
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
        period: "/Seat/Mon.",
        blurb: "Compliance-tauglich. Ab 20 Seats, deine Infrastruktur oder EU-Cloud.",
        features: [
          "15.000 KI-Anfragen/Seat/Mon. (Fair Use darüber)",
          "5.000 WhatsApp-Nachrichten/Seat/Mon.",
          "500 GB Speicher pro Seat",
          "EU-Cloud, Vercel Blob/S3 oder On-Prem",
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
      "Jahreszahlung −20 %. KI-Anfragen und Speicher-Kontingente je Plan inklusive. Mehrverbrauch wird zu transparenten Einheitspreisen am Monatsende abgerechnet — keine Überraschungsrechnung, kein stilles Drosseln. Token-Add-on-Pakete: 500 Anfragen für 199 €, 1.500 für 499 €, 5.000 für 1.499 €.",
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
        a: "Ja. Jeder gehostete Plan startet mit einem 14-Tage-Reverse-Trial — voller Zugriff, keine Kreditkarte. Wenn Subsumio nicht für dich ist, kündige innerhalb von 14 Tagen für eine volle Rückerstattung.",
      },
      {
        q: "Kann ich jederzeit den Plan wechseln?",
        a: "Ja. Upgrade oder Downgrade aus dem Dashboard jederzeit möglich. Änderungen werden zum nächsten Abrechnungszeitraum wirksam — keine Strafgebühren, kein Lock-in.",
      },
      {
        q: "Wie funktioniert die jährliche Abrechnung?",
        a: "Jahreszahlung gibt dir 20% Rabatt auf den Monatspreis. Du wirst einmal pro Jahr pro Seat abgerechnet. Monatsabrechnung ist verfügbar, wenn du mehr Flexibilität möchtest.",
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
    sub: "Subsumio is the AI legal software that turns matters, deadlines, emails, documents and research into one cited workspace — built for DACH law firms.",
    ctaPrimary: "Get started",
    ctaSecondary: "See it answer",
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
    statsNote: "Engine-class retrieval, not a chat wrapper — every AI answer names its source.",
    featuresTitle: "Built for law firms",
    featuresSub:
      "From deadline control to contradiction detection — every answer cited, every deadline tracked.",
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
        title: "Conflict check (§ 43a BRAO)",
        desc: "Every new client or opponent is checked server-side against your entire matter database — conflicts flagged before the mandate is accepted.",
      },
      {
        icon: "Calculator",
        color: "blue",
        title: "Time, expenses, invoices & DATEV",
        desc: "Book minutes by lawyer and activity, track billable expenses, generate invoices from open work, export DATEV-ready.",
      },
      {
        icon: "Shield",
        color: "violet",
        title: "Self-hosted or EU cloud",
        desc: "The full engine on your hardware with your keys — or managed EU cloud with DPA. Client data never leaves your control.",
      },
    ],
    howTitle: "From document to cited answer",
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
    scenariosTitle: "Use cases",
    scenariosSub: "Real workflows from the engine — not mockups.",
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
    ctaTitle: "Your brain is waiting.",
    ctaSub: "Three minutes to first answer. No credit card.",
    ctaButton: "Get started with Subsumio",
  },
  de: {
    badge: "KI-Kanzleisoftware",
    h1a: "Jede Akte,",
    h1b: "eine belegte Antwort.",
    sub: "Subsumio ist die KI-Kanzleisoftware, die Akten, Fristen, E-Mails, Dokumente und Recherche zu einem belegten Workspace macht — gebaut für DACH-Kanzleien.",
    ctaPrimary: "Jetzt starten",
    ctaSecondary: "Antwort ansehen",
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
      { value: "0", label: "Mandantendaten-Leaks, by design" },
    ],
    statsNote: "Engine-Klasse Retrieval, kein Chat-Wrapper — jede KI-Antwort nennt ihre Quelle.",
    featuresTitle: "Für Kanzleien gebaut",
    featuresSub:
      "Von Fristenkontrolle bis Widerspruchserkennung — jede Antwort belegt, jede Frist im Blick.",
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
        title: "Kollisionsprüfung (§ 43a BRAO)",
        desc: "Jeder neue Mandant oder Gegner wird serverseitig gegen den gesamten Aktenbestand geprüft — Konflikte werden gemeldet, bevor das Mandat angenommen wird.",
      },
      {
        icon: "Calculator",
        color: "blue",
        title: "Zeiten, Auslagen, Rechnungen & DATEV",
        desc: "Minuten nach Anwalt und Tätigkeit buchen, abrechenbare Auslagen erfassen, Rechnungen aus offener Arbeit erstellen, DATEV-ready exportieren.",
      },
      {
        icon: "Shield",
        color: "violet",
        title: "Self-hosted oder EU-Cloud",
        desc: "Die volle Engine auf deiner Hardware mit deinen Keys — oder gemanagte EU-Cloud mit AVV. Mandantendaten verlassen nie deine Kontrolle.",
      },
    ],
    howTitle: "Vom Dokument zur belegten Antwort",
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
        title: "Es versteht",
        desc: "Bei jedem Schreibvorgang werden typisierte Kanten — Personen, Fristen, Beziehungen — als juristischer Wissensgraph extrahiert. Ohne zusätzliche LLM-Calls.",
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
    scenariosTitle: "Use Cases",
    scenariosSub: "Echte Workflows aus der Engine — keine Mockups.",
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
        a: "Nein. Anmelden, Brain läuft — voll verwaltet, keine Keys, keine Infrastruktur. Enterprise-Self-Hosting läuft auf deiner eigenen Hardware mit deinen eigenen Keys.",
      },
      {
        q: "Was passiert, wenn ich an Plan-Limits stoße?",
        a: "Du siehst den Verbrauch live im Dashboard, und wir fragen, bevor sich etwas ändert. Keine Überraschungsrechnung, kein stilles Drosseln.",
      },
      {
        q: "Trainiert ihr auf meinen Daten?",
        a: "Niemals. Dein Wissen gehört allein dir — es wird nie zum Training geteilter Modelle genutzt. Self-hosted verlässt nichts dein Haus; in unserer EU-Cloud bleibt es verschlüsselt und pro Kunde isoliert.",
      },
    ],
    ctaTitle: "Dein Brain wartet.",
    ctaSub: "Drei Minuten bis zur ersten Antwort. Keine Kreditkarte.",
    ctaButton: "Mit Subsumio starten",
  },
} as const;
