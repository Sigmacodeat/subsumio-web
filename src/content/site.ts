// Subsumio — central bilingual content system.
// EN is the default locale (global market), DE lives under /de.
// One source of truth: layouts render from these objects, never duplicate copy in JSX.

export type Lang = "en" | "de";

// Öffentliche Repo-URL der Open-Source-Engine. EINE Stelle zum Ändern —
// per NEXT_PUBLIC_ENGINE_REPO_URL überschreibbar. Auf den eigenen
// öffentlichen Fork setzen, bevor die Marketing-Seite live geht.
export const ENGINE_REPO_URL =
  process.env.NEXT_PUBLIC_ENGINE_REPO_URL || "https://github.com/subsumio/subsumio";
export const ENGINE_REPO_INSTALL =
  ENGINE_REPO_URL.replace("https://github.com/", "github:");

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

export const NAV = {
  en: {
    features: "Features",
    solutions: "Solutions",
    pricing: "Pricing",
    compare: "Compare",
    partners: "Partners",
    docs: "Docs",
    signIn: "Sign in",
    cta: "Get started",
    comingSoonLabel: "Coming soon",
    // Subsumio product nav.
    subsumioItems: [
      { label: "Product", href: "/subsumio" },
      { label: "WhatsApp copilot", href: "/whatsapp" },
      { label: "Security", href: "/security" },
      { label: "Pricing", href: "/pricing" },
    ],
    solutionItems: [
      { label: "Law Firms — Subsumio", href: "/subsumio", desc: "Matters, deadlines, WhatsApp intake, time, expenses and invoicing" },
    ],
  },
  de: {
    features: "Features",
    solutions: "Lösungen",
    pricing: "Preise",
    compare: "Vergleich",
    partners: "Partner",
    docs: "Docs",
    signIn: "Anmelden",
    cta: "Jetzt starten",
    comingSoonLabel: "Bald verfügbar",
    subsumioItems: [
      { label: "Produkt", href: "/subsumio" },
      { label: "WhatsApp-Copilot", href: "/whatsapp" },
      { label: "Sicherheit", href: "/security" },
      { label: "Preise", href: "/pricing" },
    ],
    solutionItems: [
      { label: "Kanzleien — Subsumio", href: "/subsumio", desc: "Akten, Fristen, WhatsApp-Eingang, Zeiten, Auslagen und Rechnungen" },
    ],
  },
} as const;

export const FOOTER = {
  en: {
    tagline: "The brain your firm never had.",
    columns: [
      {
        title: "Product",
        links: [
          { label: "Features", href: "/features" },
          { label: "Pricing", href: "/pricing" },
          { label: "Compare us honestly", href: "/compare" },
          { label: "Dashboard", href: "/dashboard", external: false },
          { label: "Download the app", href: "/download" },
          { label: "Docs", href: "/docs" },
        ],
      },
      {
        title: "Subsumio",
        links: [
          { label: "Product overview", href: "/subsumio" },
          { label: "WhatsApp copilot", href: "/whatsapp" },
          { label: "Security", href: "/security" },
        ],
      },
      {
        title: "Grow with us",
        links: [
          { label: "Partner program", href: "/partners" },
          { label: "Refer a customer — earn 30%", href: "/partners#affiliate" },
        ],
      },
      {
        title: "Legal",
        links: [
          { label: "Terms of service", href: "/terms" },
          { label: "Privacy", href: "/privacy" },
          { label: "Imprint", href: "/imprint" },
        ],
      },
    ],
    note: "Your data, your keys — self-hosted on your hardware or our EU cloud. Built for confidentiality-first work.",
  },
  de: {
    tagline: "Das Gedächtnis deiner Firma.",
    columns: [
      {
        title: "Produkt",
        links: [
          { label: "Features", href: "/features" },
          { label: "Preise", href: "/pricing" },
          { label: "Ehrlicher Vergleich", href: "/compare" },
          { label: "Dashboard", href: "/dashboard", external: false },
          { label: "App herunterladen", href: "/download" },
          { label: "Docs", href: "/docs" },
        ],
      },
      {
        title: "Subsumio",
        links: [
          { label: "Produktübersicht", href: "/subsumio" },
          { label: "WhatsApp-Copilot", href: "/whatsapp" },
          { label: "Sicherheit", href: "/security" },
        ],
      },
      {
        title: "Wachse mit uns",
        links: [
          { label: "Partnerprogramm", href: "/partners" },
          { label: "Kunden empfehlen — 30 % verdienen", href: "/partners#affiliate" },
        ],
      },
      {
        title: "Rechtliches",
        links: [
          { label: "AGB", href: "/terms" },
          { label: "Datenschutz", href: "/privacy" },
          { label: "Impressum", href: "/imprint" },
        ],
      },
    ],
    note: "Deine Daten, deine Keys — self-hosted auf eurer Hardware oder in unserer EU-Cloud. Gebaut für vertraulichkeitskritische Arbeit.",
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

export const PRICING: Record<Lang, { title: string; sub: string; tiers: PricingTier[]; footnote: string }> = {
  en: {
    title: "Premium memory for teams that run on knowledge.",
    sub: "Per seat, billed annually. Your company's brain on infrastructure you control — EU-hosted or on-premise.",
    tiers: [
      {
        id: "pro", name: "Pro", price: "€290", priceMonthly: "€363", period: "/seat/mo", periodMonthly: "/seat/mo",
        blurb: "For the professional who lives on their knowledge. Annual billing saves 20%.",
        features: ["Fully managed — no API keys needed", "25,000 pages · 50 GB cloud storage", "2,000 AI queries/seat/mo included", "Fair-use WhatsApp & document import", "24/7 Dream Cycle (dedupe, citations, contradictions)", "Live usage meter — transparent overages", "Priority support"],
        cta: "Start Pro", href: "/signup", highlight: true,
      },
      {
        id: "team", name: "Team", price: "€490", priceMonthly: "€613", period: "/seat/mo", periodMonthly: "/seat/mo",
        blurb: "One shared brain, scoped per user. From 5 seats. Annual billing saves 20%.",
        features: ["Everything in Pro", "Shared institutional memory", "10,000 AI queries/seat/mo included", "250 GB cloud storage per seat", "Per-user scoped access — fuzz-tested, zero leaks", "Admin & usage analytics", "Onboarding session included"],
        cta: "Start Team", href: "/signup",
      },
      {
        id: "ent", name: "Enterprise", price: "Custom", period: "annual",
        blurb: "Compliance-grade. From 20 seats, your infrastructure or EU cloud.",
        features: ["Unlimited AI queries & storage (Fair Use)", "EU cloud, Vercel Blob/S3 or on-prem", "Custom retention policy", "DPA, SLA, SSO/SAML", "Maximum-recall search mode", "Dedicated CSM & integration help"],
        cta: "Talk to us", href: "mailto:hello@subsum.eu",
      },
    ],
    footnote: "Annual billing −20 %. Included AI query and storage quotas shown per plan. Overages billed at transparent per-unit rates at month end — no surprise bills, no silent throttling.",
  },
  de: {
    title: "Premium-Gedächtnis für Teams, die von Wissen leben.",
    sub: "Pro Seat, jährliche Abrechnung. Das Gehirn eurer Firma auf Infrastruktur, die ihr kontrolliert — EU-gehostet oder On-Premise.",
    tiers: [
      {
        id: "pro", name: "Pro", price: "290 €", priceMonthly: "363 €", period: "/Seat/Mon.", periodMonthly: "/Seat/Mon.",
        blurb: "Für Professionals, die von ihrem Wissen leben. Jahreszahlung spart 20%.",
        features: ["Voll verwaltet — keine API-Keys nötig", "25.000 Seiten · 50 GB Cloud-Speicher", "2.000 KI-Anfragen/Seat/Mon. inklusive", "Fair-Use WhatsApp- & Dokumenten-Import", "24/7 Dream Cycle (Dedupe, Zitate, Widersprüche)", "Live-Verbrauchsanzeige — transparente Mehrkosten", "Priorisierter Support"],
        cta: "Pro starten", href: "/signup", highlight: true,
      },
      {
        id: "team", name: "Team", price: "490 €", priceMonthly: "613 €", period: "/Seat/Mon.", periodMonthly: "/Seat/Mon.",
        blurb: "Ein gemeinsames Brain, pro Nutzer gescoped. Ab 5 Seats. Jahreszahlung spart 20%.",
        features: ["Alles aus Pro", "Geteiltes Firmen-Gedächtnis", "10.000 KI-Anfragen/Seat/Mon. inklusive", "250 GB Cloud-Speicher pro Seat", "Zugriff pro Nutzer gescoped — fuzz-getestet, null Leaks", "Admin & Nutzungs-Analytics", "Onboarding-Session inklusive"],
        cta: "Team starten", href: "/signup",
      },
      {
        id: "ent", name: "Enterprise", price: "Individuell", period: "jährlich",
        blurb: "Compliance-tauglich. Ab 20 Seats, eure Infrastruktur oder EU-Cloud.",
        features: ["Unbegrenzte KI-Anfragen & Speicher (Fair Use)", "EU-Cloud, Vercel Blob/S3 oder On-Prem", "Individuelle Aufbewahrungsrichtlinie", "AVV, SLA, SSO/SAML", "Maximum-Recall-Suchmodus", "Dedizierter CSM & Integrationshilfe"],
        cta: "Sprich mit uns", href: "mailto:hello@subsum.eu",
      },
    ],
    footnote: "Jahreszahlung −20 %. KI-Anfragen und Speicher-Kontingente je Plan inklusive. Mehrverbrauch wird zu transparenten Einheitspreisen am Monatsende abgerechnet — keine Überraschungsrechnung, kein stilles Drosseln.",
  },
};

// ---------------------------------------------------------------------------
// Pricing FAQ (pricing-specific — not a duplicate of the landing FAQ)
// ---------------------------------------------------------------------------

export const PRICING_FAQ: Record<Lang, { title: string; items: { q: string; a: string }[] }> = {
  en: {
    title: "Pricing questions",
    items: [
      { q: "Is there a free trial?", a: "Yes. Every hosted plan starts with a 14-day reverse trial — full access, no credit card. If Subsumio isn't for you, cancel within 14 days for a full refund." },
      { q: "Can I switch plans anytime?", a: "Yes. Upgrade or downgrade from the dashboard at any time. Changes take effect at the next billing cycle — no penalties, no lock-in." },
      { q: "How does annual billing work?", a: "Annual billing gives you 20% off the monthly price. You're billed once per year per seat. Monthly billing is available if you prefer flexibility." },
      { q: "What happens to my data if I cancel?", a: "You can export everything at any time. After cancellation, your data is retained for 30 days, then permanently deleted — or you can request immediate deletion." },
      { q: "Are there any hidden fees?", a: "No. Overages are billed at transparent per-unit rates shown in the dashboard. You see usage live and we ask before anything changes." },
    ],
  },
  de: {
    title: "Preisfragen",
    items: [
      { q: "Gibt es eine kostenlose Testversion?", a: "Ja. Jeder gehostete Plan startet mit einem 14-Tage-Reverse-Trial — voller Zugriff, keine Kreditkarte. Wenn Subsumio nicht für dich ist, kündige innerhalb von 14 Tagen für eine volle Rückerstattung." },
      { q: "Kann ich jederzeit den Plan wechseln?", a: "Ja. Upgrade oder Downgrade aus dem Dashboard jederzeit möglich. Änderungen werden zum nächsten Abrechnungszeitraum wirksam — keine Strafgebühren, kein Lock-in." },
      { q: "Wie funktioniert die jährliche Abrechnung?", a: "Jahreszahlung gibt dir 20% Rabatt auf den Monatspreis. Du wirst einmal pro Jahr pro Seat abgerechnet. Monatsabrechnung ist verfügbar, wenn du mehr Flexibilität möchtest." },
      { q: "Was passiert mit meinen Daten bei Kündigung?", a: "Du kannst jederzeit alles exportieren. Nach Kündigung werden deine Daten 30 Tage aufbewahrt, dann dauerhaft gelöscht — oder du kannst sofortige Löschung beantragen." },
      { q: "Gibt es versteckte Gebühren?", a: "Nein. Mehrverbrauch wird zu transparenten Einheitspreisen abgerechnet, die im Dashboard sichtbar sind. Du siehst den Verbrauch live und wir fragen, bevor sich etwas ändert." },
    ],
  },
};

// ---------------------------------------------------------------------------
// Landing page
// ---------------------------------------------------------------------------

export const LANDING = {
  en: {
    badge: "AI legal workspace",
    h1a: "Your firm forgets.",
    h1b: "Subsumio doesn't.",
    sub: "Subsumio turns matters, deadlines, emails, documents and research into one cited legal workspace for law firms.",
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
      { value: "14,713", label: "statute paragraphs, citable" },
      { value: "3", label: "jurisdictions — AT · DE · CH" },
      { value: "10 yr", label: "GoBD-proof retention" },
      { value: "0", label: "client-data leaks, by design" },
    ],
    statsNote: "Built on a verified DACH statute corpus — every AI answer names its source.",
    featuresTitle: "Built for law firms",
    featuresSub: "From deadline control to contradiction detection — every answer cited, every deadline tracked.",
    features: [
      { icon: "Brain", color: "violet", title: "Answers with citations", desc: "Every AI answer cites the exact pages it comes from. Verify in one click before anything goes into a brief — no hallucinated references." },
      { icon: "CalendarClock", color: "amber", title: "Deadlines, automatically", desc: "Statutory and appeal deadlines computed per ZPO/BGB/ABGB with correct month arithmetic and weekend roll-forward. A daily email digest flags what's critical." },
      { icon: "MessageSquare", color: "emerald", title: "WhatsApp copilot", desc: "Book time, file documents, send voice notes from your phone. Everything lands in the right matter — confirmation-gated, nothing reaches the file unseen." },
    ],
    howTitle: "From document to cited answer",
    how: [
      { step: "01", icon: "Database", title: "Feed it", desc: "Matters, emails, PDFs, voice notes, WhatsApp. Subsumio chunks, embeds and indexes automatically. OCR pulls text from scans too." },
      { step: "02", icon: "Network", title: "It understands", desc: "On every write, typed edges — people, deadlines, relationships — are extracted as a legal knowledge graph. No extra LLM calls." },
      { step: "03", icon: "Search", title: "Ask", desc: "Plain-language questions. Hybrid retrieval across vector, keyword and graph finds the decisive passages." },
      { step: "04", icon: "Brain", title: "Cited answer", desc: "A synthesized answer with page-level citations — plus an honest note on what the file is still missing." },
    ],
    scenariosTitle: "What a workday with Subsumio looks like",
    scenariosSub: "Illustrative scenarios based on what the engine does in production.",
    scenarios: [
      { role: "A paralegal", text: "Uploads the incoming post and a scanned contract, then asks: “Which deadlines does this trigger?” — every statutory date is calculated, calendared and linked to the matter." },
      { role: "A lawyer", text: "Sends a voice note and a PDF by WhatsApp with a matter reference, books 20 minutes, then asks: “Where do the opposing party's statements contradict each other?” — the file, time and answer are in one brain." },
      { role: "A managing partner", text: "Indexes five years of matters and pleadings. A new associate asks: “Have we argued something like this before?” — and finds the 2023 brief in seconds." },
    ],
    faqTitle: "Questions, answered",
    faq: [
      { q: "How is this different from Notion AI, Glean or a vector database?", a: "Those return documents or chunks. Subsumio returns a synthesized answer with citations, walks a typed knowledge graph for relationship questions (“who invested in X?”), and tells you what it doesn't know — the gap analysis is the part that changes how you work." },
      { q: "Where does my data live?", a: "Your choice. Self-host the engine on your own hardware, or use our managed EU cloud. Enterprise plans support on-prem and a signed DPA." },
      { q: "Do I need API keys or a server?", a: "No. Sign up and your brain runs — fully managed, no keys, no infrastructure. Enterprise self-hosting runs on your own hardware with your own keys." },
      { q: "What happens when I hit my plan limits?", a: "You see usage live in the dashboard and we ask before anything changes. No surprise bills, no silent throttling." },
      { q: "Do you train on our data?", a: "Never. Your knowledge is yours alone — never used to train shared models. Self-hosted, nothing leaves your building; on our EU cloud it stays encrypted and isolated per customer." },
    ],
    ctaTitle: "Your brain is waiting.",
    ctaSub: "Three minutes to first answer on hosted plans. No credit card.",
    ctaButton: "Get started with Subsumio",
  },
  de: {
    badge: "KI-Legal-Workspace",
    h1a: "Deine Firma vergisst.",
    h1b: "Subsumio nicht.",
    sub: "Subsumio macht Akten, Fristen, E-Mails, Dokumente und Recherche zu einem belegten Legal Workspace für Kanzleien.",
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
      { value: "14.713", label: "Gesetzesparagraphen, zitierbar" },
      { value: "3", label: "Jurisdiktionen — AT · DE · CH" },
      { value: "10 J.", label: "GoBD-revisionssichere Aufbewahrung" },
      { value: "0", label: "Mandantendaten-Leaks, by design" },
    ],
    statsNote: "Auf einem geprüften DACH-Gesetzeskorpus — jede KI-Antwort nennt ihre Quelle.",
    featuresTitle: "Für Kanzleien gebaut",
    featuresSub: "Von Fristenkontrolle bis Widerspruchserkennung — jede Antwort belegt, jede Frist im Blick.",
    features: [
      { icon: "Brain", color: "violet", title: "Antworten mit Fundstellen", desc: "Jede KI-Antwort zitiert die exakten Fundstellen. Ein Klick zur Verifikation, bevor etwas in den Schriftsatz geht — keine halluzinierten Quellen mehr." },
      { icon: "CalendarClock", color: "amber", title: "Fristen, automatisch", desc: "Notfristen und Berufungsfristen nach ZPO/BGB/ABGB mit korrekter Monatsarithmetik und Wochenend-Verschiebung. Täglicher E-Mail-Digest für kritische Fristen." },
      { icon: "MessageSquare", color: "emerald", title: "WhatsApp-Copilot", desc: "Zeiten buchen, Dokumente ablegen, Sprachnotizen vom Handy. Alles landet in der richtigen Akte — bestätigungspflichtig, nichts erreicht die Akte ungesehen." },
    ],
    howTitle: "Vom Dokument zur belegten Antwort",
    how: [
      { step: "01", icon: "Database", title: "Füttern", desc: "Akten, Mails, PDFs, Sprachnotizen, WhatsApp. Subsumio zerlegt, vektorisiert und indiziert automatisch. OCR holt Text auch aus Scans." },
      { step: "02", icon: "Network", title: "Es versteht", desc: "Bei jedem Schreibvorgang werden typisierte Kanten — Personen, Fristen, Beziehungen — als juristischer Wissensgraph extrahiert. Ohne zusätzliche LLM-Calls." },
      { step: "03", icon: "Search", title: "Fragen", desc: "Fragen in normaler Sprache. Hybrid-Suche aus Vektor, Stichwort und Graph findet die entscheidenden Stellen." },
      { step: "04", icon: "Brain", title: "Belegte Antwort", desc: "Synthetisierte Antwort mit seitengenauen Zitaten — plus ehrlicher Hinweis, was in der Akte noch fehlt." },
    ],
    scenariosTitle: "So sieht ein Arbeitstag mit Subsumio aus",
    scenariosSub: "Illustrative Szenarien — basierend auf dem, was die Engine produktiv leistet.",
    scenarios: [
      { role: "Eine Kanzleiassistentin", text: "Lädt die Eingangspost und einen gescannten Vertrag hoch und fragt: „Welche Fristen löst das aus?“ — jede gesetzliche Frist wird berechnet, eingetragen und mit der Akte verknüpft." },
      { role: "Ein Anwalt", text: "Schickt Sprachnotiz und PDF per WhatsApp mit Aktenzeichen, bucht 20 Minuten und fragt: „Wo widersprechen sich die Aussagen der Gegenseite?“ — Datei, Zeit und Antwort liegen in einem Brain." },
      { role: "Ein Kanzleipartner", text: "Indiziert fünf Jahre Akten und Schriftsätze. Ein neuer Associate fragt: „Haben wir so etwas schon mal argumentiert?“ — und findet den Schriftsatz von 2023 in Sekunden." },
    ],
    faqTitle: "Fragen, beantwortet",
    faq: [
      { q: "Was unterscheidet das von Notion AI, Glean oder einer Vektor-Datenbank?", a: "Die liefern Dokumente oder Chunks. Subsumio liefert eine synthetisierte Antwort mit Zitaten, läuft für Beziehungsfragen („wer hat in X investiert?“) über einen typisierten Wissensgraphen und sagt dir, was es nicht weiß — die Gap-Analyse verändert, wie du arbeitest." },
      { q: "Wo liegen meine Daten?", a: "Deine Wahl. Self-hoste die Engine auf eigener Hardware oder nutze unsere verwaltete EU-Cloud. Enterprise-Pläne unterstützen On-Prem und einen AVV." },
      { q: "Brauche ich API-Keys oder einen Server?", a: "Nein. Anmelden, Brain läuft — voll verwaltet, keine Keys, keine Infrastruktur. Enterprise-Self-Hosting läuft auf eurer eigenen Hardware mit euren eigenen Keys." },
      { q: "Was passiert, wenn ich an Plan-Limits stoße?", a: "Du siehst den Verbrauch live im Dashboard, und wir fragen, bevor sich etwas ändert. Keine Überraschungsrechnung, kein stilles Drosseln." },
      { q: "Trainiert ihr auf unseren Daten?", a: "Niemals. Euer Wissen gehört allein euch — es wird nie zum Training geteilter Modelle genutzt. Self-hosted verlässt nichts euer Haus; in unserer EU-Cloud bleibt es verschlüsselt und pro Kunde isoliert." },
    ],
    ctaTitle: "Dein Brain wartet.",
    ctaSub: "Drei Minuten bis zur ersten Antwort auf gehosteten Plänen. Keine Kreditkarte.",
    ctaButton: "Mit Subsumio starten",
  },
} as const;
