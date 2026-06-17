// Sigmabrain — central bilingual content system.
// EN is the default locale (global market), DE lives under /de.
// One source of truth: layouts render from these objects, never duplicate copy in JSX.

export type Lang = "en" | "de";

// Öffentliche Repo-URL der Open-Source-Engine. EINE Stelle zum Ändern —
// per NEXT_PUBLIC_ENGINE_REPO_URL überschreibbar. Auf den eigenen
// öffentlichen Fork setzen, bevor die Marketing-Seite live geht.
export const ENGINE_REPO_URL =
  process.env.NEXT_PUBLIC_ENGINE_REPO_URL || "https://github.com/sigmabrain/sigmabrain";
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
    // Subsumio-host nav (brand === "subsumio"): the standalone product site has
    // its own pages, not the platform's Solutions dropdown.
    subsumioItems: [
      { label: "Product", href: "/subsumio/produkt" },
      { label: "WhatsApp copilot", href: "/subsumio/whatsapp" },
      { label: "Security", href: "/subsumio/sicherheit" },
      { label: "Pricing", href: "/pricing" },
    ],
    // Taxumio-host nav (brand === "taxumio").
    taxumioItems: [
      { label: "Pricing", href: "/pricing" },
      { label: "All solutions", href: "/" },
    ],
    solutionItems: [
      { label: "Law Firms — Subsumio", href: "/subsumio", desc: "Matters, deadlines, WhatsApp intake, time, expenses and invoicing" },
      { label: "Tax & Accounting — Taxumio", href: "/taxumio", desc: "The practice memory next to DATEV", comingSoon: true },
      { label: "Compliance & GRC — Compliumio", href: "/compliance", desc: "GDPR, AML, EU AI Act — obligations, controls and the evidence trail", comingSoon: true },
      { label: "Insurance Brokers — Versumio", href: "/insurance", desc: "Coverage, claims history, renewals — the agency's memory", comingSoon: true },
      { label: "Real Estate — Immumio", href: "/realestate", desc: "Leases, tenants, renewals, due diligence — the property memory", comingSoon: true },
      { label: "VC & Private Equity — Investumio", href: "/vc", desc: "Deal memory, founder tracking, the relationship graph", comingSoon: true },
      { label: "Consulting & Agencies — Consultumio", href: "/consulting", desc: "Institutional memory: reuse past work, onboard fast", comingSoon: true },
      { label: "Executive Search — Talentumio", href: "/recruiting", desc: "Your proprietary, queryable talent graph", comingSoon: true },
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
      { label: "Produkt", href: "/subsumio/produkt" },
      { label: "WhatsApp-Copilot", href: "/subsumio/whatsapp" },
      { label: "Sicherheit", href: "/subsumio/sicherheit" },
      { label: "Preise", href: "/pricing" },
    ],
    taxumioItems: [
      { label: "Preise", href: "/pricing" },
      { label: "Alle Lösungen", href: "/" },
    ],
    solutionItems: [
      { label: "Kanzleien — Subsumio", href: "/subsumio", desc: "Akten, Fristen, WhatsApp-Eingang, Zeiten, Auslagen und Rechnungen" },
      { label: "Steuerberater & WP — Taxumio", href: "/taxumio", desc: "Das Kanzleigedächtnis neben DATEV", comingSoon: true },
      { label: "Compliance & GRC — Compliumio", href: "/compliance", desc: "DSGVO, GwG, EU AI Act — Pflichten, Kontrollen und der Nachweis", comingSoon: true },
      { label: "Versicherungsmakler — Versumio", href: "/insurance", desc: "Deckung, Schadenhistorie, Verlängerungen — das Makler-Gedächtnis", comingSoon: true },
      { label: "Immobilien — Immumio", href: "/realestate", desc: "Mietverträge, Mieter, Verlängerungen, Due Diligence — das Objekt-Gedächtnis", comingSoon: true },
      { label: "VC & Private Equity — Investumio", href: "/vc", desc: "Deal-Gedächtnis, Founder-Tracking, Beziehungsgraph", comingSoon: true },
      { label: "Beratung & Agenturen — Consultumio", href: "/consulting", desc: "Institutional Memory: Vorarbeit wiederverwenden, schnell onboarden", comingSoon: true },
      { label: "Executive Search — Talentumio", href: "/recruiting", desc: "Euer proprietärer, abfragbarer Talent-Graph", comingSoon: true },
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
          { label: "Overview", href: "/subsumio" },
          { label: "Product", href: "/subsumio/produkt" },
          { label: "WhatsApp copilot", href: "/subsumio/whatsapp" },
          { label: "Security & GDPR", href: "/subsumio/sicherheit" },
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
          { label: "Security & data protection", href: "/security" },
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
          { label: "Übersicht", href: "/subsumio" },
          { label: "Produkt", href: "/subsumio/produkt" },
          { label: "WhatsApp-Copilot", href: "/subsumio/whatsapp" },
          { label: "Sicherheit & DSGVO", href: "/subsumio/sicherheit" },
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
          { label: "Sicherheit & Datenschutz", href: "/security" },
          { label: "AGB", href: "/terms" },
          { label: "Datenschutz-Erklärung", href: "/privacy" },
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
  period: string;
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
        id: "pro", name: "Pro", price: "€290", period: "/seat/mo",
        blurb: "For the professional who lives on their knowledge.",
        features: ["Fully managed — no API keys needed", "25,000 pages · 50 GB cloud storage", "2,000 AI queries/seat/mo included", "Fair-use WhatsApp & document import", "24/7 Dream Cycle (dedupe, citations, contradictions)", "Live usage meter — transparent overages", "Priority support"],
        cta: "Start Pro", href: "/signup", highlight: true,
      },
      {
        id: "team", name: "Team", price: "€490", period: "/seat/mo",
        blurb: "One shared brain, scoped per user. From 5 seats.",
        features: ["Everything in Pro", "Shared institutional memory", "10,000 AI queries/seat/mo included", "250 GB cloud storage per seat", "Per-user scoped access — fuzz-tested, zero leaks", "Admin & usage analytics", "Onboarding session included"],
        cta: "Start Team", href: "/signup",
      },
      {
        id: "ent", name: "Enterprise", price: "Custom", period: "annual",
        blurb: "Compliance-grade. From 20 seats, your infrastructure or EU cloud.",
        features: ["Unlimited AI queries & storage (Fair Use)", "EU cloud, Vercel Blob/S3 or on-prem", "Custom retention policy", "DPA, SLA, SSO/SAML", "Maximum-recall search mode", "Dedicated CSM & integration help"],
        cta: "Talk to us", href: "mailto:hello@sigmabrain.com",
      },
    ],
    footnote: "Annual billing −20 %. Included AI query and storage quotas shown per plan. Overages billed at transparent per-unit rates at month end — no surprise bills, no silent throttling.",
  },
  de: {
    title: "Premium-Gedächtnis für Teams, die von Wissen leben.",
    sub: "Pro Seat, jährliche Abrechnung. Das Gehirn eurer Firma auf Infrastruktur, die ihr kontrolliert — EU-gehostet oder On-Premise.",
    tiers: [
      {
        id: "pro", name: "Pro", price: "290 €", period: "/Seat/Mon.",
        blurb: "Für Professionals, die von ihrem Wissen leben.",
        features: ["Voll verwaltet — keine API-Keys nötig", "25.000 Seiten · 50 GB Cloud-Speicher", "2.000 KI-Anfragen/Seat/Mon. inklusive", "Fair-Use WhatsApp- & Dokumenten-Import", "24/7 Dream Cycle (Dedupe, Zitate, Widersprüche)", "Live-Verbrauchsanzeige — transparente Mehrkosten", "Priorisierter Support"],
        cta: "Pro starten", href: "/signup", highlight: true,
      },
      {
        id: "team", name: "Team", price: "490 €", period: "/Seat/Mon.",
        blurb: "Ein gemeinsames Brain, pro Nutzer gescoped. Ab 5 Seats.",
        features: ["Alles aus Pro", "Geteiltes Firmen-Gedächtnis", "10.000 KI-Anfragen/Seat/Mon. inklusive", "250 GB Cloud-Speicher pro Seat", "Zugriff pro Nutzer gescoped — fuzz-getestet, null Leaks", "Admin & Nutzungs-Analytics", "Onboarding-Session inklusive"],
        cta: "Team starten", href: "/signup",
      },
      {
        id: "ent", name: "Enterprise", price: "Individuell", period: "jährlich",
        blurb: "Compliance-tauglich. Ab 20 Seats, eure Infrastruktur oder EU-Cloud.",
        features: ["Unbegrenzte KI-Anfragen & Speicher (Fair Use)", "EU-Cloud, Vercel Blob/S3 oder On-Prem", "Individuelle Aufbewahrungsrichtlinie", "AVV, SLA, SSO/SAML", "Maximum-Recall-Suchmodus", "Dedizierter CSM & Integrationshilfe"],
        cta: "Sprich mit uns", href: "mailto:hello@sigmabrain.com",
      },
    ],
    footnote: "Jahreszahlung −20 %. KI-Anfragen und Speicher-Kontingente je Plan inklusive. Mehrverbrauch wird zu transparenten Einheitspreisen am Monatsende abgerechnet — keine Überraschungsrechnung, kein stilles Drosseln.",
  },
};

// ---------------------------------------------------------------------------
// Landing page
// ---------------------------------------------------------------------------

export const LANDING = {
  en: {
    badge: "One brain platform · tuned for every industry",
    h1a: "Your firm forgets.",
    h1b: "Sigmabrain doesn't.",
    sub: "One company-brain platform, tuned per industry — every meeting, deal, email and document becomes one cited answer instead of ten search results. Subsumio for law firms is live; more verticals are coming.",
    ctaPrimary: "Get started",
    ctaSecondary: "See it answer",
    demo: {
      windowTitle: "sigmabrain — ask",
      you: "You",
      q: "What do I need to know before my meeting with Alice tomorrow?",
      a: `Alice runs engineering at Acme (Series-B fintech). You last spoke April 22.

**3 things still open:**
1. Security review overdue (deadline May 1, no update)
2. 500-seat pricing sent April 25 — no reply yet
3. You promised a CISO intro — not done

⚠️ Gap: nothing new on Alice in 6 weeks. She may have replied on channels the brain doesn't see — ask.`,
      sourcesLabel: "Sources:",
      sources: ["people/alice", "meetings/alice-q1", "customers/acme"],
    },
    stats: [
      { value: "97.9%", label: "Recall@5 on BrainBench" },
      { value: "+31.4", label: "P@5 points vs. vector-only RAG" },
      { value: "146k", label: "pages in the largest production brain" },
      { value: "0", label: "leaks in multi-tenant fuzz testing" },
    ],
    statsNote: "Engine benchmarks from the retrieval core that powers Sigmabrain.",
    featuresTitle: "Not another RAG tool.",
    featuresSub: "The only stack that ships synthesis, graph traversal and gap analysis in one box.",
    features: [
      { icon: "Brain", color: "violet", title: "Answers, not chunks", desc: "Synthesized, cited prose across people, companies, deals and ideas — plus what the brain doesn't know yet." },
      { icon: "Network", color: "blue", title: "Self-wiring knowledge graph", desc: "Typed edges (invested_in, works_at, advises) extracted on every write. No extra LLM calls." },
      { icon: "Search", color: "emerald", title: "Hybrid retrieval", desc: "Vector + BM25 + graph traversal, fused. Finds what either method alone misses." },
      { icon: "Zap", color: "amber", title: "Dream Cycle", desc: "A 24/7 background agent dedupes, fixes citations, surfaces contradictions and preps your morning." },
      { icon: "Shield", color: "rose", title: "Your data stays yours", desc: "Self-host on your hardware, or pick our EU cloud. Auditable, encrypted, no vendor lock-in." },
      { icon: "Layers", color: "purple", title: "Team-safe by design", desc: "Per-user scoped access across every read path. Fuzz-tested for zero cross-user leaks." },
    ],
    howTitle: "Signal → Brain → Answer",
    how: [
      { step: "01", icon: "Database", title: "Feed it", desc: "Meetings, emails, PDFs, notes. Sigmabrain chunks, embeds and indexes automatically." },
      { step: "02", icon: "GitBranch", title: "It wires itself", desc: "People, companies and relationships become a graph — while you sleep, the Dream Cycle keeps it clean." },
      { step: "03", icon: "Brain", title: "Ask, don't search", desc: "Plain-language questions. Synthesized answers with sources and explicit gaps." },
    ],
    verticalsTitle: "Choose your solution",
    verticalsSub: "One platform, a dedicated brain for each industry. Subsumio for law firms is live — the rest are coming.",
    verticalCards: [
      { href: "/subsumio", title: "Law Firms — Subsumio", desc: "Case files, deadlines, WhatsApp intake, time, expenses and invoices — answerable from your own brain, self-hosted or EU cloud.", cta: "Go to Subsumio" },
      { href: "/taxumio", title: "Tax & Accounting — Taxumio", desc: "DATEV knows the numbers. The brain knows the why — advisory history, client context, open items, deadlines.", cta: "For tax & accounting", comingSoon: true },
      { href: "/vc", title: "VC & Private Equity", desc: "Who invested in what? What's open with this founder? Walk into every meeting prepared.", cta: "For investors", comingSoon: true },
      { href: "/consulting", title: "Consulting & Agencies", desc: "Pitch history, project learnings, client context — new hires productive in days.", cta: "For consultancies", comingSoon: true },
      { href: "/recruiting", title: "Executive Search & Recruiting", desc: "Who fits the brief, who can intro you — a proprietary talent graph that compounds.", cta: "For search firms", comingSoon: true },
    ],
    scenariosTitle: "What a workday with Sigmabrain looks like",
    scenariosSub: "Illustrative scenarios based on what the engine does in production.",
    scenarios: [
      { role: "An investor", text: "Uploads deal memos and meeting notes, then asks: “What's still open with the founders I met this week?” — one answer, every commitment listed, sources linked." },
      { role: "A lawyer", text: "Sends a voice note and a PDF by WhatsApp with a matter reference, books 20 minutes, then asks: “Where do the opposing party's statements contradict each other?” — the file, time and answer are in one brain." },
      { role: "A consulting team", text: "Indexes five years of decks and project docs. A new hire asks: “Have we solved something like this before?” — and finds the 2023 playbook in seconds." },
    ],
    faqTitle: "Questions, answered",
    faq: [
      { q: "How is this different from Notion AI, Glean or a vector database?", a: "Those return documents or chunks. Sigmabrain returns a synthesized answer with citations, walks a typed knowledge graph for relationship questions (“who invested in X?”), and tells you what it doesn't know — the gap analysis is the part that changes how you work." },
      { q: "Where does my data live?", a: "Your choice. Self-host the engine on your own hardware, or use our managed EU cloud. Enterprise plans support on-prem and a signed DPA." },
      { q: "Do I need API keys or a server?", a: "No. Sign up and your brain runs — fully managed, no keys, no infrastructure. Enterprise self-hosting runs on your own hardware with your own keys." },
      { q: "What happens when I hit my plan limits?", a: "You see usage live in the dashboard and we ask before anything changes. No surprise bills, no silent throttling." },
      { q: "Do you train on our data?", a: "Never. Your knowledge is yours alone — never used to train shared models. Self-hosted, nothing leaves your building; on our EU cloud it stays encrypted and isolated per customer." },
    ],
    ctaTitle: "Your brain is waiting.",
    ctaSub: "Three minutes to first answer on hosted plans. No credit card.",
    ctaButton: "Get started with Sigmabrain",
  },
  de: {
    badge: "Eine Brain-Plattform · für jede Branche abgestimmt",
    h1a: "Deine Firma vergisst.",
    h1b: "Sigmabrain nicht.",
    sub: "Eine Firmen-Brain-Plattform, pro Branche abgestimmt — jedes Meeting, jeder Deal, jede Mail, jedes Dokument wird zu einer belegten Antwort statt zehn Suchtreffern. Subsumio für Kanzleien ist live; weitere Branchen folgen.",
    ctaPrimary: "Jetzt starten",
    ctaSecondary: "Antwort ansehen",
    demo: {
      windowTitle: "sigmabrain — fragen",
      you: "Du",
      q: "Was muss ich vor dem Meeting mit Alice morgen wissen?",
      a: `Alice leitet Engineering bei Acme (Series-B Fintech). Letztes Gespräch: 22. April.

**3 offene Punkte:**
1. Security Review überfällig (Deadline 1. Mai, kein Update)
2. 500-Seat-Pricing am 25. April gesendet — keine Antwort
3. CISO-Intro zugesagt — noch offen

⚠️ Lücke: Seit 6 Wochen nichts Neues zu Alice. Antwort kam evtl. über Kanäle, die das Brain nicht sieht — nachfragen.`,
      sourcesLabel: "Quellen:",
      sources: ["people/alice", "meetings/alice-q1", "customers/acme"],
    },
    stats: [
      { value: "97,9 %", label: "Recall@5 im BrainBench" },
      { value: "+31,4", label: "P@5-Punkte vs. reines Vector-RAG" },
      { value: "146k", label: "Seiten im größten Produktions-Brain" },
      { value: "0", label: "Leaks im Multi-Tenant-Fuzz-Test" },
    ],
    statsNote: "Engine-Benchmarks des Retrieval-Kerns, der Sigmabrain antreibt.",
    featuresTitle: "Kein weiteres RAG-Tool.",
    featuresSub: "Der einzige Stack mit Synthese, Graph-Traversal und Gap-Analyse in einer Box.",
    features: [
      { icon: "Brain", color: "violet", title: "Antworten statt Chunks", desc: "Synthetisierte, zitierte Prosa über Personen, Firmen, Deals und Ideen — plus das, was dem Brain noch fehlt." },
      { icon: "Network", color: "blue", title: "Wissensgraph, der sich selbst verknüpft", desc: "Typisierte Kanten (invested_in, works_at, advises) bei jedem Schreibvorgang — ganz ohne zusätzliche LLM-Calls." },
      { icon: "Search", color: "emerald", title: "Hybrid-Retrieval", desc: "Vector + BM25 + Graph-Traversal, fusioniert. Findet, was jede Methode allein übersieht." },
      { icon: "Zap", color: "amber", title: "Dream Cycle", desc: "Ein Hintergrund-Agent rund um die Uhr: entdoppelt Einträge, korrigiert Quellenangaben, deckt Widersprüche auf und bereitet deinen Morgen vor." },
      { icon: "Shield", color: "rose", title: "Deine Daten bleiben deine", desc: "Self-hosted auf deiner Hardware oder in unserer EU-Cloud. Auditierbar, verschlüsselt, kein Vendor-Lock-in." },
      { icon: "Layers", color: "purple", title: "Team-sicher von Grund auf", desc: "Zugriff pro Nutzer abgegrenzt — über jeden einzelnen Lesepfad. Fuzz-getestet auf null Leaks." },
    ],
    howTitle: "Signal → Brain → Antwort",
    how: [
      { step: "01", icon: "Database", title: "Füttern", desc: "Meetings, E-Mails, PDFs, Notizen. Sigmabrain zerlegt, vektorisiert und indiziert automatisch." },
      { step: "02", icon: "GitBranch", title: "Es verdrahtet sich selbst", desc: "Personen, Firmen und Beziehungen werden zum Graphen — nachts hält der Dream Cycle alles sauber." },
      { step: "03", icon: "Brain", title: "Fragen statt suchen", desc: "Fragen in normaler Sprache. Synthetisierte Antworten mit Quellen und expliziten Lücken." },
    ],
    verticalsTitle: "Wähle deine Lösung",
    verticalsSub: "Eine Plattform, ein eigenes Brain pro Branche. Subsumio für Kanzleien ist live — der Rest folgt.",
    verticalCards: [
      { href: "/subsumio", title: "Kanzleien — Subsumio", desc: "Akten, Fristen, WhatsApp-Eingang, Zeiten, Auslagen und Rechnungen — abfragbar aus eurem eigenen Brain, self-hosted oder EU-Cloud.", cta: "Auf Subsumio gehen" },
      { href: "/taxumio", title: "Steuerberater & WP — Taxumio", desc: "DATEV kennt die Zahlen. Das Gehirn kennt das Warum — Gestaltungs-Historie, Mandantenkontext, offene Punkte, Fristen.", cta: "Für Steuerkanzleien", comingSoon: true },
      { href: "/vc", title: "VC & Private Equity", desc: "Wer hat in was investiert? Was ist mit diesem Founder offen? In jedes Meeting vorbereitet gehen.", cta: "Für Investoren", comingSoon: true },
      { href: "/consulting", title: "Beratung & Agenturen", desc: "Pitch-Historie, Projekt-Learnings, Kundenkontext — neue Kollegen in Tagen produktiv.", cta: "Für Beratungen", comingSoon: true },
      { href: "/recruiting", title: "Executive Search & Recruiting", desc: "Wer passt aufs Mandat, wer kann euch vorstellen — ein proprietärer Talent-Graph, der sich verzinst.", cta: "Für Personalberater", comingSoon: true },
    ],
    scenariosTitle: "So sieht ein Arbeitstag mit Sigmabrain aus",
    scenariosSub: "Illustrative Szenarien — basierend auf dem, was die Engine produktiv leistet.",
    scenarios: [
      { role: "Eine Investorin", text: "Lädt Deal-Memos und Meeting-Notizen hoch und fragt: „Was ist mit den Foundern dieser Woche noch offen?“ — eine Antwort, jede Zusage gelistet, Quellen verlinkt." },
      { role: "Ein Anwalt", text: "Schickt Sprachnotiz und PDF per WhatsApp mit Aktenzeichen, bucht 20 Minuten und fragt: „Wo widersprechen sich die Aussagen der Gegenseite?“ — Datei, Zeit und Antwort liegen in einem Brain." },
      { role: "Ein Beratungsteam", text: "Indiziert fünf Jahre Decks und Projektdokumente. Ein neuer Kollege fragt: „Haben wir so etwas schon mal gelöst?“ — und findet das Playbook von 2023 in Sekunden." },
    ],
    faqTitle: "Fragen, beantwortet",
    faq: [
      { q: "Was unterscheidet das von Notion AI, Glean oder einer Vektor-Datenbank?", a: "Die liefern Dokumente oder Chunks. Sigmabrain liefert eine synthetisierte Antwort mit Zitaten, läuft für Beziehungsfragen („wer hat in X investiert?“) über einen typisierten Wissensgraphen und sagt dir, was es nicht weiß — die Gap-Analyse verändert, wie du arbeitest." },
      { q: "Wo liegen meine Daten?", a: "Deine Wahl. Self-hoste die Engine auf eigener Hardware oder nutze unsere verwaltete EU-Cloud. Enterprise-Pläne unterstützen On-Prem und einen AVV." },
      { q: "Brauche ich API-Keys oder einen Server?", a: "Nein. Anmelden, Brain läuft — voll verwaltet, keine Keys, keine Infrastruktur. Enterprise-Self-Hosting läuft auf eurer eigenen Hardware mit euren eigenen Keys." },
      { q: "Was passiert, wenn ich an Plan-Limits stoße?", a: "Du siehst den Verbrauch live im Dashboard, und wir fragen, bevor sich etwas ändert. Keine Überraschungsrechnung, kein stilles Drosseln." },
      { q: "Trainiert ihr auf unseren Daten?", a: "Niemals. Euer Wissen gehört allein euch — es wird nie zum Training geteilter Modelle genutzt. Self-hosted verlässt nichts euer Haus; in unserer EU-Cloud bleibt es verschlüsselt und pro Kunde isoliert." },
    ],
    ctaTitle: "Dein Brain wartet.",
    ctaSub: "Drei Minuten bis zur ersten Antwort auf gehosteten Plänen. Keine Kreditkarte.",
    ctaButton: "Mit Sigmabrain starten",
  },
} as const;
