// /compare — honest competitive comparison. EN + DE.
//
// RULES FOR THIS FILE (UWG-safe comparative content):
// - Every third-party claim comes from a public, linked source (see sources[]).
// - Unknowns are marked "n/a" / "k. A." — never guessed as ✗ or ✓.
// - Rows where competitors beat us say so plainly. The page loses several
//   rows on purpose; that's what makes the rows we win credible.
// - Prices that aren't public are "individual"; reported estimates are
//   labeled as reports, not facts. Snapshot date is shown on the page.

import type { Lang } from "./site";

/** Cell prefix conventions the renderer colorizes:
 *  "✓" green · "✗" rose · "~" amber (partial) · "k. A." / "n/a" gray. */
export interface CompareTable {
  title: string;
  sub: string;
  cols: string[]; // first column is Subsumio
  rows: { label: string; cells: string[] }[];
  footnotes: string[];
}

export interface CompareContent {
  metaTitle: string;
  metaDesc: string;
  badge: string;
  h1a: string;
  h1b: string;
  sub: string;
  snapshot: string;
  honestyTitle: string;
  honestyText: string;
  legal: CompareTable;
  gov: CompareTable;
  km: CompareTable;
  whenThem: { title: string; items: string[] };
  whenUs: { title: string; items: string[] };
  disclaimer: string;
  sourcesTitle: string;
  sources: { label: string; href: string }[];
  faq: { q: string; a: string }[];
  faqTitle: string;
  ctaTitle: string;
  ctaSub: string;
  ctaButton: string;
}

export const COMPARE: Record<Lang, CompareContent> = {
  en: {
    metaTitle: "Subsumio vs. Harvey, Legora, CoCounsel, Glean — an honest comparison",
    metaDesc:
      "Where enterprise legal AI beats Subsumio (legal research, drafting), and where Subsumio wins (your own files, self-hosting, EU data residency, confidentiality by architecture). No sugarcoating — every claim sourced.",
    badge: "Honest comparison · June 2026",
    h1a: "We lose several rows of this table.",
    h1b: "That's why you can trust the rest.",
    sub: "Subsumio is not a legal research tool and not a contract drafter. It's the knowledge layer over your firm's OWN files. Here is exactly where the market leaders are better — and where we are.",
    snapshot:
      "Snapshot: June 2026. Third-party data from public sources (linked below). Prices marked “individual” are not published by the vendor.",
    honestyTitle: "What Subsumio is NOT built for",
    honestyText:
      "If you need any of the following as your primary tool, buy it from the companies below — they are genuinely good at it: legal research against case-law databases (CoCounsel/Westlaw, Lexis+ AI, vLex, Beck-Noxtua/beck-online), contract drafting and redlining (Harvey, Legora, Spellbook in Word), M&A due-diligence workflows (Luminance, Harvey). Subsumio answers a different question: what does YOUR firm already know — across matters, emails, memos and meetings — with citations and explicit gaps.",
    legal: {
      title: "Subsumio vs. enterprise legal AI",
      sub: "Harvey, Legora, CoCounsel (Thomson Reuters), Beck-Noxtua, Luminance — against the knowledge layer.",
      cols: ["Subsumio", "Harvey", "Legora", "CoCounsel", "Beck-Noxtua", "Luminance"],
      rows: [
        {
          label: "Legal research w/ case-law database",
          cells: [
            "✗ none — not our category",
            "✓ (LexisNexis partnership)",
            "✓",
            "✓ Westlaw — category leader",
            "✓ beck-online, German law",
            "✗ contract focus",
          ],
        },
        {
          label: "Drafting / contract redlining",
          cells: ["✗", "✓", "✓", "✓", "✓", "✓ (contracts)"],
        },
        {
          label: "Legal-specific model / training",
          cells: [
            "✗ general LLMs via API",
            "✓ building custom legal foundation models (Harvey Labs, June 2026)",
            "✓ model-agnostic (OpenAI + Anthropic)",
            "✓",
            "✓ own German legal AI trained on beck-online",
            "✓ proprietary legal LLM (150M+ documents)",
          ],
        },
        {
          label: "Public legal benchmark (Vals VLAIR)",
          cells: [
            "✗ not tested — retrieval benchmarks only",
            "✓ top scores; also open-sourced Legal Agent Benchmark (LAB, May 2026)",
            "k. A.",
            "✓ top scores",
            "k. A.",
            "k. A.",
          ],
        },
        {
          label: "Q&A over your own documents, cited",
          cells: ["✓ page-level citations", "✓", "✓", "✓", "✓", "✓"],
        },
        {
          label: "Cross-matter contradiction surfacing",
          cells: [
            "✓ Dream Cycle, automatic",
            "k. A.",
            "k. A.",
            "k. A.",
            "k. A.",
            "~ in contract review",
          ],
        },
        {
          label: "Typed knowledge graph over your data",
          cells: ["✓ extracted on every write", "k. A.", "k. A.", "✗", "k. A.", "✗"],
        },
        {
          label: "Gap analysis (“what's NOT in the file”)",
          cells: ["✓ in every answer", "k. A.", "k. A.", "k. A.", "k. A.", "k. A."],
        },
        {
          label: "Beyond legal (deals, clients, firm memory)",
          cells: ["✓ cross-domain by design", "✗ legal-focused", "✗", "✗", "✗", "✗"],
        },
        {
          label: "Compounding firm brain (learns from every matter)",
          cells: [
            "✓ your brain knows every case you've run",
            "k. A.",
            "k. A.",
            "k. A.",
            "k. A.",
            "k. A.",
          ],
        },
        {
          label: "Self-hosting / on-premise option",
          cells: [
            "✓ full engine on your hardware",
            "✗ cloud",
            "✗ cloud",
            "✗ cloud",
            "✗ sovereign EU cloud, no self-host",
            "✓ on-premise offered",
          ],
        },
        {
          label: "No training on your data",
          cells: [
            "✓ never trains shared models",
            "✓ never trains on customer data by default",
            "✓ zero AI training on your data",
            "k. A.",
            "✓ does not use customer data for model training",
            "✓ no third-party data sharing",
          ],
        },
        {
          label: "Published entry price",
          cells: [
            "€299/seat/mo (Starter, monthly) · €690/seat/mo (Professional, annual)",
            "individual (reports: ~$1,200/seat/mo, 20-seat minimum; $300M ARR, $11B valuation)",
            "individual (reports: ~$3,000/user/yr, 10-seat min = $30k/yr floor; $100M ARR, $5.6B valuation)",
            "$104–$639/user/mo depending on plan (public configurator, ≤10 attorneys); bundled with Westlaw — no standalone CoCounsel",
            "€350/user/mo self-service (3 licenses = €1,050/mo); €410/user/mo after 12 months",
            "individual (enterprise-only; reports: $50k+/yr; $30M ARR)",
          ],
        },
        {
          label: "Seat minimum",
          cells: [
            "✓ from 1 (Starter)",
            "✗ ~20 (reports)",
            "✗ 10 seats (reports)",
            "✓ solo plans exist (online up to 10 attorneys)",
            "✗ 3 licenses",
            "k. A.",
          ],
        },
        {
          label: "Agentic AI / multi-step workflows",
          cells: [
            "✓ agent system with skills + eval",
            "✓ 25,000+ custom agents, Agent Builder (Mar 2026)",
            "✓ Agent, Workflows builder",
            "✓ agentic workflows, Deep Research",
            "✓ function combination across research/analysis/drafting",
            "✓ multi-agent architecture (Jan 2026 update)",
          ],
        },
        {
          label: "Word / Outlook integration",
          cells: [
            "✓ Word Add-in",
            "✓ Word, deeper MS 365 integration",
            "✓ Word + Outlook add-ins",
            "✓ Microsoft 365 integration",
            "✓ Microsoft integration",
            "✓ Word, Outlook, Salesforce, VDRs",
          ],
        },
        {
          label: "Mobile app",
          cells: ["✓ native mobile app", "✓ Harvey Mobile", "k. A.", "k. A.", "k. A.", "k. A."],
        },
      ],
      footnotes: [
        "“k. A.” = no public information found; we do not guess competitors' gaps.",
        "Harvey/CoCounsel benchmark standing: Vals Legal AI Report (VLAIR). Subsumio has not participated in any legal benchmark — our published numbers are retrieval benchmarks (Recall@5, P@5), a different discipline.",
        "Luminance offers on-premise deployment — self-hosting is NOT unique to Subsumio. The difference: with Subsumio it's your own matter files made answerable, on infrastructure you fully control.",
      ],
    },
    gov: {
      title: "Governance, security & EU compliance",
      sub: "The questions a DACH/EU firm's IT and data-protection officer ask first — and where Subsumio already has a shipped answer.",
      cols: ["Subsumio", "Harvey", "CoCounsel", "Beck-Noxtua", "Glean"],
      rows: [
        {
          label: "EU AI Act Art. 50 — AI output labeled (visible + machine-readable)",
          cells: [
            "✓ badge + frontmatter + X-AI-Generated header",
            "k. A.",
            "k. A.",
            "k. A.",
            "k. A.",
          ],
        },
        {
          label: "Four-eyes / human approval gate for agent actions",
          cells: ["✓ approval queue, documented reason", "k. A.", "k. A.", "k. A.", "k. A."],
        },
        {
          label: "Source-coverage / hallucination-caution badge on answers",
          cells: ["✓ grounded / partial / unsupported", "k. A.", "k. A.", "k. A.", "k. A."],
        },
        {
          label: "GoBD building blocks (10-yr retention stamp, tamper-evidence, Verfahrensdoku)",
          cells: [
            "✓ for law firms — building blocks, not a “audit-proof” claim",
            "✗",
            "✗",
            "✗",
            "✗",
          ],
        },
        {
          label: "DACH legal interfaces (beA drafts, RVG, conflict check, RIS/openlegaldata)",
          cells: [
            "✓ native",
            "✗",
            "✗",
            "~ German law focus, § 203 StGB / § 43a BRAO compliant",
            "✗",
          ],
        },
        {
          label: "MFA / 2FA (TOTP) for the dashboard",
          cells: ["✓ built in", "✓ via SSO/IdP", "✓ via SSO/IdP", "k. A.", "✓ via SSO/IdP"],
        },
        {
          label: "Team / org model with roles & invites",
          cells: [
            "✓ org entity, member/admin/owner",
            "✓ enterprise admin",
            "k. A.",
            "k. A.",
            "✓ enterprise admin console",
          ],
        },
        {
          label: "GDPR Art. 20 data export (account + brain, JSON)",
          cells: ["✓ one click", "k. A.", "k. A.", "k. A.", "k. A."],
        },
        {
          label: "SSO (SAML/OIDC) + SCIM",
          cells: [
            "~ on the roadmap (WorkOS path)",
            "✓ SAML SSO, audit logs, IP allow-listing",
            "✓ SSO integration",
            "k. A.",
            "✓ category standard",
          ],
        },
        {
          label: "SOC 2 / ISO 27001 certification",
          cells: [
            "✗ not yet — self-host compensates",
            "✓ SOC 2 Type II + ISO 27001",
            "✓ (Thomson Reuters)",
            "k. A.",
            "✓",
          ],
        },
      ],
      footnotes: [
        "This matrix shows governance building blocks we actively ship. Where a competitor publishes nothing on a row, it reads “k. A.” — we do NOT claim they lack it.",
        "GoBD and the EU AI Act labeling are honest building blocks, not certifications: full GoBD conformance needs process documentation + an auditor's sign-off, and the AI Act classification is per-feature.",
        "Two rows we lose on purpose: SSO/SCIM is on our roadmap (the standard WorkOS path), and we are not yet SOC 2 / ISO 27001 certified — self-hosting on your own infrastructure is the interim answer for regulated buyers.",
      ],
    },
    km: {
      title: "Subsumio vs. enterprise knowledge tools",
      sub: "Glean and Notion AI organize company knowledge — the closest neighbors to what Subsumio actually does.",
      cols: ["Subsumio", "Glean", "Notion AI"],
      rows: [
        {
          label: "Q&A over company knowledge, cited",
          cells: ["✓ + explicit gap analysis", "✓", "~ within Notion content"],
        },
        {
          label: "Knowledge graph",
          cells: [
            "✓ typed edges (invested_in, works_at, …), queryable",
            "✓ enterprise graph (people, docs, activity)",
            "✗",
          ],
        },
        {
          label: "SaaS connectors (Slack, Jira, Drive, …)",
          cells: [
            "~ folders, email, MCP, API — no 100+ connector catalog",
            "✓ 100+ connectors — category leader",
            "~ Notion ecosystem",
          ],
        },
        {
          label: "Document ingestion (PDF, DOCX, EML, XLSX, audio)",
          cells: ["✓ native, incl. scanned-PDF OCR fallback", "✓ via connectors", "~ imports"],
        },
        {
          label: "Self-hosting / on-premise",
          cells: ["✓ full engine on your hardware", "✗ SaaS-only", "✗ SaaS-only"],
        },
        {
          label: "No training on your data",
          cells: ["✓ never trains shared models", "k. A.", "k. A."],
        },
        {
          label: "Entry price & minimum",
          cells: [
            "€299/seat/mo Starter · €690 Professional, from 1 seat",
            "~$50/user/mo base + ~$15/user/mo Work AI add-on (reports: ~$65/user/mo all-in, ~100-seat minimum, ~$60k/yr entry)",
            "$20/user/mo (Business plan, AI included; retired standalone $8 add-on May 2025)",
          ],
        },
      ],
      footnotes: [
        "Glean's connector catalog and enterprise rollout tooling are ahead of ours — for a 5,000-person company wiring 30 SaaS tools, Glean is the safer pick today.",
        "Notion AI assumes your knowledge lives in Notion. Subsumio assumes it lives in files, emails and notes — wherever they are.",
      ],
    },
    whenThem: {
      title: "Choose the others when…",
      items: [
        "You need legal research with citable case law → CoCounsel, Lexis+ AI, vLex; German law → Beck-Noxtua.",
        "You draft and redline contracts in Word all day → Spellbook; enterprise workflows → Harvey, Legora.",
        "You run M&A due diligence and want on-premise from an established vendor → also evaluate Luminance.",
        "You're 1,000+ employees and need 30 SaaS tools indexed → Glean.",
      ],
    },
    whenUs: {
      title: "Choose Subsumio when…",
      items: [
        "The knowledge that wins your cases sits in YOUR files, emails and notes — and nobody can query it.",
        "Confidentiality rules out third-party clouds: self-host the full engine on your own hardware, in your own jurisdiction.",
        "You want top-tier synthesis without a Big-Law contract: per-seat, from a single seat, no 20-seat minimum.",
        "Your firm's memory spans more than law: clients, deals, relationships — one graph, one brain.",
      ],
    },
    disclaimer:
      "All third-party information from public sources as of June 2026, linked below; no guarantee of completeness. Vendors change pricing and features — corrections welcome at hello@subsum.eu and will be published.",
    sourcesTitle: "Sources",
    sources: [
      {
        label: "Vals Legal AI Report (benchmark)",
        href: "https://www.vals.ai/industry-reports/vlair-2-27-25",
      },
      {
        label: "Harvey pricing reports (Bind Legal)",
        href: "https://bindlegal.com/resources/comparisons/harvey-pricing-2026/",
      },
      { label: "Harvey ARR & valuation (Sacra)", href: "https://sacra.com/c/harvey/" },
      {
        label: "Harvey $11B raise (official)",
        href: "https://www.harvey.ai/blog/harvey-raises-at-dollar11-billion-valuation-to-scale-agents-across-law-firms-and-enterprises",
      },
      {
        label: "Harvey custom legal models (Law.com)",
        href: "https://www.law.com/legaltechnews/2026/06/18/harvey-announces-development-of-custom-legal-specific-ai-models-",
      },
      { label: "Harvey security (official)", href: "https://www.harvey.ai/security" },
      {
        label: "Thomson Reuters CoCounsel public pricing",
        href: "https://sales.legalsolutions.thomsonreuters.com/en-us/products/cocounsel-legal/700/plans-pricing",
      },
      {
        label: "CoCounsel pricing analysis (Costbench)",
        href: "https://costbench.com/software/ai-legal-tools/cocounsel/",
      },
      { label: "Legora ARR & valuation (Sacra)", href: "https://sacra.com/c/legora/" },
      {
        label: "Legora review & pricing (GC AI)",
        href: "https://gc.ai/blog/legora-legal-ai-review",
      },
      { label: "Legora security (official)", href: "https://legora.com/security" },
      {
        label: "Beck-Noxtua self-service pricing (official)",
        href: "https://www.beck-noxtua.de/en/self-service/",
      },
      { label: "Beck-Noxtua product (official)", href: "https://www.beck-noxtua.de/en/product/" },
      {
        label: "Luminance on-premise & pricing reports",
        href: "https://bindlegal.com/resources/comparisons/luminance-pricing-2026/",
      },
      { label: "Luminance security (official)", href: "https://www.luminance.com/security/" },
      { label: "Spellbook pricing", href: "https://spellbook.com/pricing" },
      { label: "Glean pricing reports (Vendr)", href: "https://www.vendr.com/marketplace/glean" },
      {
        label: "Glean pricing TCO analysis (Workativ)",
        href: "https://workativ.com/ai-agent/blog/glean-pricing",
      },
      {
        label: "Notion AI pricing 2026 (AI Productivity)",
        href: "https://aiproductivity.ai/blog/notion-pricing/",
      },
      { label: "Notion pricing (official)", href: "https://www.notion.com/en-gb/pricing" },
    ],
    faqTitle: "Fair questions",
    faq: [
      {
        q: "Why should I trust a comparison you wrote yourselves?",
        a: "Because we publish the rows we lose: no legal research, no drafting, no legal benchmark participation, fewer connectors than Glean. Every third-party claim links to a public source, unknowns are marked “k. A.” instead of guessed, and we publish corrections.",
      },
      {
        q: "Is Subsumio a Harvey alternative?",
        a: "Only if what you actually need is the knowledge layer, not the legal workspace. Many firms will run both: Harvey/Noxtua for research and drafting, Subsumio as the queryable memory over their own matters. We replace neither Westlaw nor a lawyer.",
      },
      {
        q: "Why choose Subsumio over Harvey or CoCounsel?",
        a: "Because they run on someone else's cloud and someone else's model, and they index licensed case law. Subsumio indexes YOUR matters and runs on infrastructure you control — self-hosted or EU cloud — with a WhatsApp copilot your lawyers use daily. Same calibre of synthesis, your jurisdiction, your data. The honest catch, stated above: we don't do legal research.",
      },
      {
        q: "Self-hosting exists at Luminance too. What's different?",
        a: "Correct — and we say so in the table. The difference: with Subsumio it's your own matter files made answerable, on your own hardware, with deterministic page-level citations your IT can verify.",
      },
    ],
    ctaTitle: "The fairest test: your own files.",
    ctaSub:
      "Import one closed matter and ask the first question. If it doesn't convince you, you've lost an afternoon — not a six-figure contract.",
    ctaButton: "Test it on your own files",
  },
  de: {
    metaTitle: "Subsumio vs. Harvey, Legora, CoCounsel, Glean — der ehrliche Vergleich",
    metaDesc:
      "Wo Enterprise-Legal-AI Subsumio schlägt (Rechtsrecherche, Drafting) — und wo Subsumio gewinnt (eigene Akten, Self-Hosting, EU-Datenhaltung, Vertraulichkeit per Architektur). Ohne Schönreden, jede Angabe mit Quelle.",
    badge: "Ehrlicher Vergleich · Juni 2026",
    h1a: "Wir verlieren mehrere Zeilen dieser Tabelle.",
    h1b: "Deshalb kannst du dem Rest vertrauen.",
    sub: "Subsumio ist kein Rechtsrecherche-Tool und kein Vertragsgenerator. Es ist die Wissensschicht über den EIGENEN Akten eurer Kanzlei. Hier steht exakt, wo die Marktführer besser sind — und wo wir.",
    snapshot:
      "Stand: Juni 2026. Drittanbieter-Daten aus öffentlichen Quellen (unten verlinkt). Mit „individuell“ markierte Preise veröffentlicht der Anbieter nicht.",
    honestyTitle: "Wofür Subsumio NICHT gebaut ist",
    honestyText:
      "Wer Folgendes als Hauptwerkzeug braucht, kauft es bei den Anbietern unten — die sind darin wirklich gut: Rechtsrecherche gegen Rechtsdatenbanken (CoCounsel/Westlaw, Lexis+ AI, vLex, Beck-Noxtua/beck-online), Schriftsatz- und Vertragsentwurf inkl. Redlining (Harvey, Legora, Spellbook in Word), M&A-Due-Diligence-Workflows (Luminance, Harvey). Subsumio beantwortet eine andere Frage: Was weiß EURE Kanzlei bereits — über Mandate, Mails, Memos und Besprechungen hinweg — mit Zitaten und expliziten Lücken.",
    legal: {
      title: "Subsumio vs. Enterprise-Legal-AI",
      sub: "Harvey, Legora, CoCounsel (Thomson Reuters), Beck-Noxtua, Luminance — gegen die Wissensschicht.",
      cols: ["Subsumio", "Harvey", "Legora", "CoCounsel", "Beck-Noxtua", "Luminance"],
      rows: [
        {
          label: "Rechtsrecherche mit Rechtsdatenbank",
          cells: [
            "✗ keine — nicht unsere Kategorie",
            "✓ (LexisNexis-Partnerschaft)",
            "✓",
            "✓ Westlaw — Kategorie-Führer",
            "✓ beck-online, deutsches Recht",
            "✗ Vertragsfokus",
          ],
        },
        {
          label: "Drafting / Vertrags-Redlining",
          cells: ["✗", "✓", "✓", "✓", "✓", "✓ (Verträge)"],
        },
        {
          label: "Legal-spezifisches Modell / Training",
          cells: [
            "✗ generelle LLMs via API",
            "✓ baut eigene Legal-Foundation-Modelle (Harvey Labs, Juni 2026)",
            "✓ modell-agnostisch (OpenAI + Anthropic)",
            "✓",
            "✓ eigene deutsche Legal-KI trainiert auf beck-online",
            "✓ proprietäres Legal-LLM (150M+ Dokumente)",
          ],
        },
        {
          label: "Öffentlicher Legal-Benchmark (Vals VLAIR)",
          cells: [
            "✗ nicht getestet — nur Retrieval-Benchmarks",
            "✓ Top-Werte; zusätzlich Legal Agent Benchmark (LAB, Mai 2026) offengelegt",
            "k. A.",
            "✓ Top-Werte",
            "k. A.",
            "k. A.",
          ],
        },
        {
          label: "Q&A über eigene Dokumente, mit Quellen",
          cells: ["✓ seitengenaue Zitate", "✓", "✓", "✓", "✓", "✓"],
        },
        {
          label: "Widerspruchs-Erkennung über die ganze Akte",
          cells: [
            "✓ Dream Cycle, automatisch",
            "k. A.",
            "k. A.",
            "k. A.",
            "k. A.",
            "~ in der Vertragsprüfung",
          ],
        },
        {
          label: "Typisierter Wissensgraph über eure Daten",
          cells: ["✓ bei jedem Schreibvorgang extrahiert", "k. A.", "k. A.", "✗", "k. A.", "✗"],
        },
        {
          label: "Gap-Analyse („was FEHLT in der Akte“)",
          cells: ["✓ in jeder Antwort", "k. A.", "k. A.", "k. A.", "k. A.", "k. A."],
        },
        {
          label: "Über Legal hinaus (Deals, Mandanten, Firmenwissen)",
          cells: ["✓ cross-domain gebaut", "✗ legal-fokussiert", "✗", "✗", "✗", "✗"],
        },
        {
          label: "Compounding-Brain (lernt aus jedem Mandat)",
          cells: [
            "✓ euer Brain kennt jeden Fall, den ihr je geführt habt",
            "k. A.",
            "k. A.",
            "k. A.",
            "k. A.",
            "k. A.",
          ],
        },
        {
          label: "Self-Hosting / On-Premise",
          cells: [
            "✓ volle Engine auf eurer Hardware",
            "✗ Cloud",
            "✗ Cloud",
            "✗ Cloud",
            "✗ souveräne EU-Cloud, kein Self-Host",
            "✓ On-Premise verfügbar",
          ],
        },
        {
          label: "Kein Training mit euren Daten",
          cells: [
            "✓ trainiert nie geteilte Modelle",
            "✓ trainiert standardmäßig nicht mit Kundendaten",
            "✓ kein KI-Training mit euren Daten",
            "k. A.",
            "✓ nutzt Kundendaten nicht für Modelltraining",
            "✓ keine Weitergabe an Dritte",
          ],
        },
        {
          label: "Veröffentlichter Einstiegspreis",
          cells: [
            "299 €/Seat/Monat (Starter, monatlich) · 690 €/Seat/Monat (Professional, jährlich)",
            "individuell (Berichte: ~1.200 $/Seat/Monat, 20-Seat-Minimum; 300M $ ARR, 11Mrd $ Bewertung)",
            "individuell (Berichte: ~3.000 $/User/Jahr, 10-Seat-Min = 30k $/Jahr Floor; 100M $ ARR, 5,6Mrd $ Bewertung)",
            "104–639 $/User/Monat je nach Plan (öffentl. Konfigurator, ≤10 Anwälte); gebündelt mit Westlaw — kein Standalone-CoCounsel",
            "350 €/User/Monat Self-Service (3 Lizenzen = 1.050 €/Monat); 410 €/User/Monat nach 12 Monaten",
            "individuell (nur Enterprise; Berichte: 50k $+/Jahr; 30M $ ARR)",
          ],
        },
        {
          label: "Seat-Minimum",
          cells: [
            "✓ ab 1 (Starter)",
            "✗ ~20 (Berichte)",
            "✗ 10 Seats (Berichte)",
            "✓ Solo-Pläne existieren (online bis 10 Anwälte)",
            "✗ 3 Lizenzen",
            "k. A.",
          ],
        },
        {
          label: "Agentic AI / mehrstufige Workflows",
          cells: [
            "✓ Agenten-System mit Skills + Eval",
            "✓ 25.000+ Custom Agents, Agent Builder (März 2026)",
            "✓ Agent, Workflows-Builder",
            "✓ Agentic Workflows, Deep Research",
            "✓ Funktionskombination über Recherche/Analyse/Drafting",
            "✓ Multi-Agent-Architektur (Januar 2026 Update)",
          ],
        },
        {
          label: "Word- / Outlook-Integration",
          cells: [
            "✓ Word Add-in",
            "✓ Word, tiefere MS-365-Integration",
            "✓ Word + Outlook Add-ins",
            "✓ Microsoft 365 Integration",
            "✓ Microsoft Integration",
            "✓ Word, Outlook, Salesforce, VDRs",
          ],
        },
        {
          label: "Mobile App",
          cells: ["✓ native Mobile App", "✓ Harvey Mobile", "k. A.", "k. A.", "k. A.", "k. A."],
        },
      ],
      footnotes: [
        "„k. A.“ = keine öffentliche Angabe gefunden; wir raten Lücken der Konkurrenz nicht.",
        "Benchmark-Stand Harvey/CoCounsel: Vals Legal AI Report (VLAIR). Subsumio hat an keinem Legal-Benchmark teilgenommen — unsere veröffentlichten Zahlen sind Retrieval-Benchmarks (Recall@5, P@5), eine andere Disziplin.",
        "Luminance bietet On-Premise — Self-Hosting ist NICHT einzigartig bei Subsumio. Der Unterschied: mit Subsumio sind es eure eigenen Aktendaten, abfragbar gemacht, auf Infrastruktur, die ihr vollständig kontrolliert.",
      ],
    },
    gov: {
      title: "Governance, Sicherheit & EU-Compliance",
      sub: "Die Fragen, die IT und Datenschutzbeauftragte einer DACH/EU-Kanzlei zuerst stellen — und wo Subsumio bereits eine ausgelieferte Antwort hat.",
      cols: ["Subsumio", "Harvey", "CoCounsel", "Beck-Noxtua", "Glean"],
      rows: [
        {
          label: "EU AI Act Art. 50 — KI-Output gekennzeichnet (sichtbar + maschinenlesbar)",
          cells: [
            "✓ Badge + Frontmatter + X-AI-Generated-Header",
            "k. A.",
            "k. A.",
            "k. A.",
            "k. A.",
          ],
        },
        {
          label: "Vier-Augen-/Freigabe-Gate für Agenten-Aktionen",
          cells: ["✓ Freigabe-Queue, dokumentierter Grund", "k. A.", "k. A.", "k. A.", "k. A."],
        },
        {
          label: "Quellendeckungs-/Halluzinations-Vorsicht-Badge an Antworten",
          cells: ["✓ gut gestützt / teilweise / ungestützt", "k. A.", "k. A.", "k. A.", "k. A."],
        },
        {
          label:
            "GoBD-Bausteine (10-J-Aufbewahrungsstempel, Manipulations-Evidenz, Verfahrensdoku)",
          cells: ["✓ für Kanzleien — Bausteine, kein „revisionssicher“-Claim", "✗", "✗", "✗", "✗"],
        },
        {
          label:
            "DACH-Legal-Schnittstellen (beA-Entwürfe, RVG, Kollisionsprüfung, RIS/openlegaldata)",
          cells: ["✓ nativ", "✗", "✗", "~ deutsches Recht, § 203 StGB / § 43a BRAO konform", "✗"],
        },
        {
          label: "MFA / 2FA (TOTP) fürs Dashboard",
          cells: ["✓ eingebaut", "✓ via SSO/IdP", "✓ via SSO/IdP", "k. A.", "✓ via SSO/IdP"],
        },
        {
          label: "Team-/Org-Modell mit Rollen & Invites",
          cells: [
            "✓ Org-Entity, member/admin/owner",
            "✓ Enterprise-Admin",
            "k. A.",
            "k. A.",
            "✓ Enterprise-Admin-Konsole",
          ],
        },
        {
          label: "DSGVO Art. 20 Datenexport (Konto + Brain, JSON)",
          cells: ["✓ ein Klick", "k. A.", "k. A.", "k. A.", "k. A."],
        },
        {
          label: "SSO (SAML/OIDC) + SCIM",
          cells: [
            "~ auf der Roadmap (WorkOS-Weg)",
            "✓ SAML SSO, Audit-Logs, IP-Allow-Listing",
            "✓ SSO-Integration",
            "k. A.",
            "✓ Kategorie-Standard",
          ],
        },
        {
          label: "SOC 2 / ISO 27001 Zertifizierung",
          cells: [
            "✗ noch nicht — Self-Host kompensiert",
            "✓ SOC 2 Type II + ISO 27001",
            "✓ (Thomson Reuters)",
            "k. A.",
            "✓",
          ],
        },
      ],
      footnotes: [
        "Diese Matrix zeigt Governance-Bausteine, die wir aktiv ausliefern. Wo ein Wettbewerber dazu nichts veröffentlicht, steht „k. A.“ — wir behaupten NICHT, dass er es nicht hat.",
        "GoBD und die EU-AI-Act-Kennzeichnung sind ehrliche Bausteine, keine Zertifikate: volle GoBD-Konformität braucht Verfahrensdoku + Prüfer-Abnahme, die AI-Act-Einstufung ist je Feature zu bewerten.",
        "Zwei Zeilen verlieren wir bewusst: SSO/SCIM ist auf unserer Roadmap (Standard-WorkOS-Weg), und wir sind noch nicht SOC-2-/ISO-27001-zertifiziert — Self-Hosting auf eurer eigenen Infrastruktur ist bis dahin die Antwort für regulierte Käufer.",
      ],
    },
    km: {
      title: "Subsumio vs. Enterprise-Wissens-Tools",
      sub: "Glean und Notion AI organisieren Firmenwissen — die nächsten Nachbarn dessen, was Subsumio wirklich tut.",
      cols: ["Subsumio", "Glean", "Notion AI"],
      rows: [
        {
          label: "Q&A über Firmenwissen, mit Quellen",
          cells: ["✓ + explizite Gap-Analyse", "✓", "~ innerhalb von Notion-Inhalten"],
        },
        {
          label: "Wissensgraph",
          cells: [
            "✓ typisierte Kanten (invested_in, works_at, …), abfragbar",
            "✓ Enterprise-Graph (Personen, Docs, Aktivität)",
            "✗",
          ],
        },
        {
          label: "SaaS-Konnektoren (Slack, Jira, Drive, …)",
          cells: [
            "~ Ordner, E-Mail, MCP, API — kein 100+-Konnektoren-Katalog",
            "✓ 100+ Konnektoren — Kategorie-Führer",
            "~ Notion-Ökosystem",
          ],
        },
        {
          label: "Dokument-Ingestion (PDF, DOCX, EML, XLSX, Audio)",
          cells: ["✓ nativ, inkl. Scanned-PDF-OCR-Fallback", "✓ via Konnektoren", "~ Importe"],
        },
        {
          label: "Self-Hosting / On-Premise",
          cells: ["✓ volle Engine auf eurer Hardware", "✗ nur SaaS", "✗ nur SaaS"],
        },
        {
          label: "Kein Training mit euren Daten",
          cells: ["✓ trainiert nie geteilte Modelle", "k. A.", "k. A."],
        },
        {
          label: "Einstiegspreis & Minimum",
          cells: [
            "299 €/Seat/Monat Starter · 690 € Professional, ab 1 Seat",
            "~50 $/User/Monat Basis + ~15 $/User/Monat Work-AI-Add-on (Berichte: ~65 $/User/Monat gesamt, ~100-Seat-Minimum, ~60k $/Jahr Einstieg)",
            "20 $/User/Monat (Business-Plan, KI inklusive; Standalone-$8-Add-on Mai 2025 eingestellt)",
          ],
        },
      ],
      footnotes: [
        "Gleans Konnektoren-Katalog und Enterprise-Rollout-Tooling sind unserem voraus — für 5.000 Mitarbeiter mit 30 SaaS-Tools ist Glean heute die sicherere Wahl.",
        "Notion AI setzt voraus, dass euer Wissen in Notion liegt. Subsumio setzt voraus, dass es in Dateien, Mails und Notizen liegt — wo auch immer.",
      ],
    },
    whenThem: {
      title: "Wählt die anderen, wenn…",
      items: [
        "ihr Rechtsrecherche mit zitierfähiger Rechtsprechung braucht → CoCounsel, Lexis+ AI, vLex; deutsches Recht → Beck-Noxtua.",
        "ihr den ganzen Tag Verträge in Word entwerft und redlined → Spellbook; Enterprise-Workflows → Harvey, Legora.",
        "ihr M&A-Due-Diligence fahrt und On-Premise vom etablierten Anbieter wollt → auch Luminance evaluieren.",
        "ihr 1.000+ Mitarbeiter habt und 30 SaaS-Tools indexieren müsst → Glean.",
      ],
    },
    whenUs: {
      title: "Wählt Subsumio, wenn…",
      items: [
        "das Wissen, das eure Fälle gewinnt, in EUREN Akten, Mails und Notizen liegt — und niemand es abfragen kann.",
        "Verschwiegenheit Dritt-Clouds ausschließt: volle Engine self-hosted auf eurer Hardware, in eurer Jurisdiktion.",
        "ihr Spitzen-Synthese ohne Big-Law-Vertrag wollt: pro Seat, ab einem einzigen Seat, kein 20-Seat-Minimum.",
        "das Gedächtnis eurer Firma mehr als Recht umfasst: Mandanten, Deals, Beziehungen — ein Graph, ein Brain.",
      ],
    },
    disclaimer:
      "Alle Drittanbieter-Angaben aus öffentlichen Quellen, Stand Juni 2026, unten verlinkt; keine Gewähr für Vollständigkeit. Anbieter ändern Preise und Funktionen — Korrekturen an hello@subsum.eu werden veröffentlicht.",
    sourcesTitle: "Quellen",
    sources: [
      {
        label: "Vals Legal AI Report (Benchmark)",
        href: "https://www.vals.ai/industry-reports/vlair-2-27-25",
      },
      {
        label: "Harvey-Preis-Berichte (Bind Legal)",
        href: "https://bindlegal.com/resources/comparisons/harvey-pricing-2026/",
      },
      { label: "Harvey ARR & Bewertung (Sacra)", href: "https://sacra.com/c/harvey/" },
      {
        label: "Harvey 11Mrd-$-Runde (offiziell)",
        href: "https://www.harvey.ai/blog/harvey-raises-at-dollar11-billion-valuation-to-scale-agents-across-law-firms-and-enterprises",
      },
      {
        label: "Harvey Custom Legal Models (Law.com)",
        href: "https://www.law.com/legaltechnews/2026/06/18/harvey-announces-development-of-custom-legal-specific-ai-models-",
      },
      { label: "Harvey Security (offiziell)", href: "https://www.harvey.ai/security" },
      {
        label: "Thomson Reuters CoCounsel öffentliche Preise",
        href: "https://sales.legalsolutions.thomsonreuters.com/en-us/products/cocounsel-legal/700/plans-pricing",
      },
      {
        label: "CoCounsel Preis-Analyse (Costbench)",
        href: "https://costbench.com/software/ai-legal-tools/cocounsel/",
      },
      { label: "Legora ARR & Bewertung (Sacra)", href: "https://sacra.com/c/legora/" },
      {
        label: "Legora Review & Preise (GC AI)",
        href: "https://gc.ai/blog/legora-legal-ai-review",
      },
      { label: "Legora Security (offiziell)", href: "https://legora.com/security" },
      {
        label: "Beck-Noxtua Self-Service Preise (offiziell)",
        href: "https://www.beck-noxtua.de/en/self-service/",
      },
      { label: "Beck-Noxtua Produkt (offiziell)", href: "https://www.beck-noxtua.de/en/product/" },
      {
        label: "Luminance On-Premise & Preis-Berichte",
        href: "https://bindlegal.com/resources/comparisons/luminance-pricing-2026/",
      },
      { label: "Luminance Security (offiziell)", href: "https://www.luminance.com/security/" },
      { label: "Spellbook-Preise", href: "https://spellbook.com/pricing" },
      { label: "Glean-Preis-Berichte (Vendr)", href: "https://www.vendr.com/marketplace/glean" },
      {
        label: "Glean TCO-Analyse (Workativ)",
        href: "https://workativ.com/ai-agent/blog/glean-pricing",
      },
      {
        label: "Notion AI Preise 2026 (AI Productivity)",
        href: "https://aiproductivity.ai/blog/notion-pricing/",
      },
      { label: "Notion Preise (offiziell)", href: "https://www.notion.com/en-gb/pricing" },
    ],
    faqTitle: "Faire Fragen",
    faq: [
      {
        q: "Warum sollte ich einem Vergleich trauen, den ihr selbst geschrieben habt?",
        a: "Weil wir die Zeilen veröffentlichen, die wir verlieren: keine Rechtsrecherche, kein Drafting, keine Legal-Benchmark-Teilnahme, weniger Konnektoren als Glean. Jede Drittanbieter-Angabe verlinkt eine öffentliche Quelle, Unbekanntes steht als „k. A.“ statt geraten — und Korrekturen werden veröffentlicht.",
      },
      {
        q: "Ist Subsumio eine Harvey-Alternative?",
        a: "Nur wenn ihr tatsächlich die Wissensschicht braucht, nicht den Legal-Workspace. Viele Kanzleien werden beides fahren: Harvey/Noxtua für Recherche und Drafting, Subsumio als abfragbares Gedächtnis über die eigenen Mandate. Wir ersetzen weder Westlaw noch einen Anwalt.",
      },
      {
        q: "Warum Subsumio statt Harvey oder CoCounsel?",
        a: "Weil die auf fremder Cloud und fremdem Modell laufen und lizenzierte Rechtsprechung indexieren. Subsumio indexiert EURE Mandate und läuft auf Infrastruktur, die ihr kontrolliert — self-hosted oder EU-Cloud — mit einem WhatsApp-Copilot, den eure Anwälte täglich nutzen. Gleiche Synthese-Qualität, eure Jurisdiktion, eure Daten. Der ehrliche Haken, siehe oben: Wir machen keine Rechtsrecherche.",
      },
      {
        q: "Self-Hosting gibt es bei Luminance auch. Was ist anders?",
        a: "Korrekt — und das steht in der Tabelle. Der Unterschied: mit Subsumio sind es eure eigenen Aktendaten, abfragbar gemacht, auf eurer eigenen Hardware, mit deterministischen seitengenauen Zitaten, die eure IT prüfen kann.",
      },
    ],
    ctaTitle: "Der fairste Test: eure eigenen Akten.",
    ctaSub:
      "Importiert ein abgeschlossenes Mandat und stellt die erste Frage. Überzeugt es nicht, habt ihr einen Nachmittag verloren — keinen sechsstelligen Vertrag.",
    ctaButton: "Mit euren eigenen Akten testen",
  },
};
