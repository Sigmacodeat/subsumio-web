// Vertical funnel pages — VC/PE, Legal, Tax, Consulting, Recruiting. EN + DE.

import type { Lang } from "./site";

export interface VerticalContent {
  slug: string;
  navLabel: string;
  metaTitle: string;
  metaDesc: string;
  badge: string;
  h1a: string;
  h1b: string;
  sub: string;
  painsTitle: string;
  pains: { title: string; desc: string }[];
  demo: { windowTitle: string; you: string; q: string; a: string; sourcesLabel: string; sources: string[] };
  featuresTitle: string;
  features: { icon: string; title: string; desc: string }[];
  proofTitle: string;
  proof: string;
  faq: { q: string; a: string }[];
  ctaTitle: string;
  ctaSub: string;
  ctaButton: string;
}

export const VERTICAL_SLUGS = ["vc", "legal", "tax", "consulting", "recruiting"] as const;
export type VerticalSlug = (typeof VERTICAL_SLUGS)[number];

export const VERTICALS: Record<Lang, Record<VerticalSlug, VerticalContent>> = {
  en: {
    vc: {
      slug: "vc",
      navLabel: "VC & Private Equity",
      metaTitle: "Sigmabrain for VC & Private Equity — your fund's deal memory",
      metaDesc: "Deal memos, founder tracking, meeting prep. Ask 'who invested in X?' and get an answer with sources — from a knowledge graph built for investors.",
      badge: "For VC, PE & angel investors",
      h1a: "Your fund's memory,",
      h1b: "always in the room.",
      sub: "Every founder call, deal memo, LP update and intro — one brain that answers 'what\'s open with this founder?' before you walk into the meeting.",
      painsTitle: "Sound familiar?",
      pains: [
        { title: "Meeting prep eats your mornings", desc: "Re-reading old notes, scrolling email threads, asking associates 'where did we leave this?' — for every single meeting." },
        { title: "Relationship knowledge lives in heads", desc: "Who introduced this founder? Which LP asked about climate deals? When the partner who knows leaves, the answer leaves with them." },
        { title: "CRMs store fields, not context", desc: "Your CRM knows the deal stage. It can't tell you what the founder promised in March or which commitments you still owe." },
      ],
      demo: {
        windowTitle: "sigmabrain — fund brain",
        you: "You",
        q: "Which founders did we pass on in the last 12 months who have since raised?",
        a: `4 matches found:

1. **Mara T. (devtools)** — passed Oct '25 ("too early"). Raised $4M seed in March, led by fund-a.
2. **K. Osei (fintech infra)** — passed Jan '26 on valuation. Series A announced May, 3x the cap we balked at.
3. + 2 more with sources.

⚠️ Gap: no notes on why we passed on #3 — the memo was never filed.`,
        sourcesLabel: "Sources:",
        sources: ["deals/mara-devtools", "memos/2026-01-osei", "news/ingested"],
      },
      featuresTitle: "Built on a graph that already speaks your language",
      features: [
        { icon: "GitBranch", title: "invested_in, founded, advises", desc: "The knowledge graph extracts investor-grade edges from every note you write — no tagging, no data entry." },
        { icon: "Brain", title: "Meeting prep in one question", desc: "Open items, last contact, promises made — synthesized with sources before every call." },
        { icon: "Zap", title: "Overnight enrichment", desc: "The Dream Cycle consolidates new founder and company intel while you sleep — wake up to a sharper brain." },
        { icon: "Shield", title: "Discretion by architecture", desc: "Self-host or EU cloud. Your deal flow never trains anyone else's model." },
      ],
      proofTitle: "Proven at fund scale",
      proof: "The engine behind Sigmabrain runs a production brain with 146,000+ pages, 24,500 people and 5,300 companies — operated daily by one of the most networked investors in the world. The graph schema you get is the one built for that job.",
      faq: [
        { q: "Does it replace our CRM?", a: "No — it sits on top of the unstructured layer your CRM can't hold: notes, memos, call transcripts, email context. Many funds run both; the brain answers questions, the CRM tracks pipeline." },
        { q: "Can associates and partners see different things?", a: "Yes. Per-user scoped access is fuzz-tested across every read path. An associate sees their scope, never another partner's private notes." },
        { q: "How does data get in?", a: "Drop folders, forward emails, paste meeting notes, or connect your agent (Claude Code, MCP) to write directly. Bulk import handles years of backlog." },
      ],
      ctaTitle: "Walk into every meeting prepared.",
      ctaSub: "Start with one quarter of deal memos. Ask your first question 3 minutes later.",
      ctaButton: "Start your fund brain",
    },
    legal: {
      slug: "legal",
      navLabel: "Law Firms",
      metaTitle: "Subsumio — AI case management for law firms in Austria & Germany",
      metaDesc: "Subsumio is the AI legal software for lawyers: manage case files & documents, automate deadlines per ZPO/BGB/ABGB, get AI analysis with citations — GDPR-compliant, EU-hosted or self-hosted.",
      badge: "Legal software for Austria & Germany",
      h1a: "500 pages of case file.",
      h1b: "One question away.",
      sub: "Subsumio is the case management software for law firms: centrally manage files & documents, automate deadlines per ZPO/BGB/ABGB, and get AI legal analysis with page-level citations — GDPR-compliant and EU-hosted.",
      painsTitle: "Sound familiar?",
      pains: [
        { title: "Case knowledge buried in PDFs", desc: "The decisive detail is on page 347 of a brief someone else read eight months ago." },
        { title: "US clouds are a non-starter", desc: "Client files in a US-hosted AI tool? Your professional duty of confidentiality says no — and so do your clients." },
        { title: "Knowledge walks out with people", desc: "When a senior associate leaves, years of matter context leave too — unless the firm's knowledge lives somewhere durable and answerable." },
      ],
      demo: {
        windowTitle: "subsumio — case brain",
        you: "You",
        q: "Where do the opposing party's submissions contradict their witness statements?",
        a: `3 contradictions found:

1. **Delivery date** — Statement of claim says March 12; witness K. states "end of April" (protocol p. 14).
2. **Payment terms** — Brief of Jan 9 claims 30 days net; the contract exhibit shows 14 days.
3. **Prior notice** — Defense asserts no warning was given; email exhibit B7 documents one.

⚠️ Gap: exhibit B7's authenticity hasn't been addressed by either side yet.`,
        sourcesLabel: "Sources:",
        sources: ["case/claim-2026-114", "exhibits/b7", "protocols/witness-k"],
      },
      featuresTitle: "Built for confidentiality-first work",
      features: [
        { icon: "CalendarClock", title: "Deadline control (ZPO & BGB)", desc: "Computes statutory and appeal deadlines with correct month arithmetic (§ 188 BGB) and weekend roll-forward (§ 222 ZPO) — with the governing statute cited. A daily email digest flags overdue and critical deadlines." },
        { icon: "MessageSquare", title: "WhatsApp matter copilot", desc: "Lawyers can send time entries, notes, tasks, deadlines, expenses, questions, PDFs, photos and voice notes from their phone. Subsumio stores them in the brain and links media to the right matter when the caption contains the case reference." },
        { icon: "FolderOpen", title: "Document vault with durable storage", desc: "Matter documents, WhatsApp media and uploaded evidence are kept in the vault with hash, source, size and storage metadata — local for self-hosting, Vercel Blob/S3-style cloud storage for hosted plans." },
        { icon: "Mail", title: "beA integration", desc: "German electronic legal mail (beA XML export) lands straight in the case file: sender, case reference and attachments captured and searchable — no copy-paste." },
        { icon: "ShieldAlert", title: "Conflict check (§ 43a BRAO)", desc: "Screens every new client or opposing party server-side against the entire case base and flags conflicts of interest before the mandate is accepted." },
        { icon: "Calculator", title: "Time, expenses, invoices & DATEV", desc: "Book minutes by lawyer/activity, capture billable expenses, create invoices from open work, mark billed entries and export a DATEV-ready accounting file." },
        { icon: "Landmark", title: "Case law DE & AT", desc: "Live search across openlegaldata/BGH (DE) and RIS-OGD (AT) — relevant judgements land in the brain, citable, in one click." },
        { icon: "Shield", title: "Your server, your jurisdiction", desc: "Self-host the full engine on firm hardware with local storage, or choose EU-hosted cloud with DPA and durable object storage. Client data never leaves your control." },
        { icon: "Zap", title: "Offline-first daily work", desc: "Cases, contacts, deadlines, invoices, vault, contracts and research keep local caches and queue changes until the cloud brain is reachable again." },
        { icon: "Brain", title: "Contradiction detection", desc: "The Dream Cycle surfaces conflicting statements across briefs, exhibits and protocols — with citations." },
        { icon: "Search", title: "Every claim, sourced", desc: "Answers cite the exact pages they come from. Verify in one click before anything goes into a brief." },
        { icon: "Layers", title: "Matter-level isolation", desc: "Scoped access per matter and per user — fuzz-tested, zero leaks between cases or teams." },
      ],
      proofTitle: "Engine-grade retrieval, not a chat wrapper",
      proof: "The retrieval core benchmarks at 97.9% Recall@5 with hybrid search and a knowledge graph — and because it runs on infrastructure you control, your IT governs every system that touches client data.",
      faq: [
        { q: "Is this legal advice software?", a: "No. Subsumio organizes and synthesizes your documents and notes. Legal judgment stays with the lawyers — the brain just makes sure nothing in the file escapes them." },
        { q: "Can we run it fully offline?", a: "The engine self-hosts on your hardware and the dashboard keeps local caches with a mutation queue for core legal workflows. Synthesis uses LLM APIs of your choosing; enterprise setups can route through EU endpoints or your own gateway." },
        { q: "How much data can we store?", a: "Self-hosted uses your own disk or S3-compatible storage. Hosted plans include cloud file storage by package and can scale to custom retention and storage volumes for enterprise firms." },
        { q: "What about GDPR and our bar obligations?", a: "Self-hosted means data never leaves your infrastructure. Hosted plans come with EU hosting and a DPA. Have your data protection officer talk to us — we speak their language." },
        { q: "How is this different from Harvey, Legora or Noxtua?", a: "They're excellent enterprise legal-AI workspaces — and they run on someone else's cloud and someone else's model. Subsumio gives you the same calibre of synthesis on infrastructure YOU control: self-hosted or EU cloud, your own files made answerable, with a WhatsApp copilot your lawyers use every day. It isn't legal research — it's your firm's own matters, with page-level citations and confidentiality by architecture." },
      ],
      ctaTitle: "The file knows the answer. Now you do too.",
      ctaSub: "Start with one closed matter as a pilot. No client data needs to leave your building.",
      ctaButton: "Try free",
    },
    tax: {
      slug: "tax",
      navLabel: "Tax & Accounting Firms",
      metaTitle: "Sigmabrain for Tax & Accounting Firms — the practice memory next to your practice software",
      metaDesc: "Client context, advisory history, email threads and meeting notes — one brain that answers 'what did we tell this client, and why?' Confidentiality-first: self-hosted or EU cloud.",
      badge: "For tax advisors, CPAs & accounting firms",
      h1a: "Your practice software knows the numbers.",
      h1b: "Sigmabrain knows the why.",
      sub: "Every client email, advisory memo and meeting note — one brain that answers 'why did we structure it this way in 2022, and what\'s still open?' before the annual review call.",
      painsTitle: "Sound familiar?",
      pains: [
        { title: "The reasoning lives outside the books", desc: "Your practice software holds the filings and the figures. The why — structuring decisions, client preferences, what was promised — is scattered across inboxes and meeting notes." },
        { title: "Staff shortage makes every head critical", desc: "When a senior accountant leaves, years of client context leave too. The rest of the team rebuilds it one awkward client call at a time." },
        { title: "Public AI tools are off-limits for client data", desc: "Professional confidentiality rules make consumer chatbots a liability. You need answers from your data — without your data leaving your control." },
      ],
      demo: {
        windowTitle: "sigmabrain — practice brain",
        you: "You",
        q: "Which of our clients are affected by the new e-invoicing mandate — and what have we already told them?",
        a: `12 affected clients found:

1. **widget-co LLC** — B2B revenue, not yet switched. Info letter sent Nov '25, no reply. No follow-up scheduled.
2. **acme-example KG** — migration in progress per meeting note of March 14; their ERP question to us is still open.
3. + 10 more with sources.

⚠️ Gap: for 4 clients the B2B share is unclear — master data incomplete.`,
        sourcesLabel: "Sources:",
        sources: ["clients/widget-co", "letters/2025-11-einvoicing", "meetings/2026-03-acme"],
      },
      featuresTitle: "Built to sit next to your practice software, not replace it",
      features: [
        { icon: "Shield", title: "Confidentiality by architecture", desc: "Self-host on firm hardware and client data never reaches a third party. Or choose EU cloud with a DPA and a contractual confidentiality commitment." },
        { icon: "Layers", title: "The unstructured layer", desc: "Filings and bookkeeping stay in your practice software. Sigmabrain holds what it can't: emails, advisory memos, structuring rationale, call notes." },
        { icon: "GitBranch", title: "Ownership structures as a graph", desc: "Shareholdings, group structures, who-advises-whom — typed edges extracted from your notes, queryable in plain language." },
        { icon: "Brain", title: "Annual review prep in one question", desc: "Advisory history, open items, deadline context — synthesized with sources before every client meeting." },
        { icon: "CalendarClock", title: "Deadline tracking with email digest", desc: "Filing and objection deadlines per client, computed with weekend roll-forward and surfaced in a daily email digest — overdue and critical items first." },
      ],
      proofTitle: "The firm's knowledge stays, even when people go",
      proof: "Sigmabrain's retrieval core benchmarks at 97.9% Recall@5 with hybrid search and a knowledge graph. For a profession where 7 in 10 firms report staff shortages, that's the difference between knowledge that walks out the door and knowledge that compounds.",
      faq: [
        { q: "Does it replace our practice software?", a: "No. Your practice management system keeps the structured world — filings, bookkeeping, deadlines. Sigmabrain holds the unstructured layer next to it and answers questions across both worlds' context." },
        { q: "How do we stay compliant with professional secrecy rules?", a: "Self-hosted means client data never leaves your infrastructure — no third party involved at all. Hosted plans run in the EU with a DPA and a contractual confidentiality commitment. Bring your data protection officer; we speak their language." },
        { q: "How does ten years of email history get in?", a: "Bulk import handles mailbox exports, document folders and meeting notes. Most firms start with one client folder and see their first useful answer the same day." },
      ],
      ctaTitle: "The next client call is won by what your firm already knows.",
      ctaSub: "Start with one client's folder as a pilot. No client data needs to leave your building.",
      ctaButton: "Start your practice brain",
    },
    consulting: {
      slug: "consulting",
      navLabel: "Consulting & Agencies",
      metaTitle: "Sigmabrain for Consulting & Agencies — institutional memory that compounds",
      metaDesc: "Pitch history, project learnings, client context in one brain. New hires productive in days, not months.",
      badge: "For consultancies & agencies",
      h1a: "You solved this in 2023.",
      h1b: "Sigmabrain remembers where.",
      sub: "Five years of decks, project docs and client notes become one brain that answers 'have we done this before?' — so you stop reinventing and start reusing.",
      painsTitle: "Sound familiar?",
      pains: [
        { title: "Knowledge walks out the door", desc: "Every departing senior takes client history, pricing instincts and project learnings with them." },
        { title: "New hires ramp for months", desc: "The answer to 'how do we usually approach this?' lives in 40 folders and three people's heads." },
        { title: "Pitches start from zero", desc: "You've written this proposal before — somewhere. Finding it takes longer than rewriting it." },
      ],
      demo: {
        windowTitle: "sigmabrain — firm brain",
        you: "You",
        q: "Have we ever done a pricing study for a B2B marketplace? What did we learn?",
        a: `Yes — 2 engagements:

1. **widget-co (2023)** — willingness-to-pay study, 14 interviews. Key learning: take-rate sensitivity clustered by seller size, not category.
2. **acme-example (2024)** — pricing relaunch. The tiered model from the 2023 study was reused; margin +9pp.

Reusable assets: interview guide (2023), pricing model deck v3.

⚠️ Gap: no post-mortem was filed for the 2024 engagement.`,
        sourcesLabel: "Sources:",
        sources: ["projects/widget-co-2023", "projects/acme-2024", "assets/pricing-deck-v3"],
      },
      featuresTitle: "Institutional memory, finally institutional",
      features: [
        { icon: "Brain", title: "Ask the firm, not the hallway", desc: "Project learnings, client context and reusable assets — synthesized into one answer with sources." },
        { icon: "Layers", title: "Client-safe separation", desc: "Per-client and per-team scoping, fuzz-tested. Confidential engagements stay confidential." },
        { icon: "Zap", title: "Onboarding in days", desc: "New consultants query the brain instead of interrupting seniors. The learning curve collapses." },
        { icon: "GitBranch", title: "Relationship graph included", desc: "Who knows whom at which client — extracted automatically from notes and meeting records." },
      ],
      proofTitle: "Retrieval that finds the needle",
      proof: "Hybrid search plus a self-wiring knowledge graph: +31.4 P@5 points over vector-only RAG in benchmarks. That's the difference between 'found the 2023 playbook' and 'gave up after page two of results.'",
      faq: [
        { q: "We have SharePoint/Drive/Notion. Why this?", a: "Those store documents. Sigmabrain answers questions across them — synthesized, cited, with gaps flagged. It complements your storage; it doesn't replace it." },
        { q: "How long until it's useful?", a: "First useful answers come from your first bulk import — typically a day of setup. The brain compounds from there; the Dream Cycle keeps it clean automatically." },
        { q: "Can clients get access?", a: "Scoped access makes client-facing slices possible — a client sees their project brain, never your firm's." },
      ],
      ctaTitle: "Stop paying for the same lesson twice.",
      ctaSub: "Import one practice area's archive and watch the first 'we already solved this' moment.",
      ctaButton: "Start your firm brain",
    },
    recruiting: {
      slug: "recruiting",
      navLabel: "Executive Search & Recruiting",
      metaTitle: "Sigmabrain for Executive Search & Recruiting — your proprietary talent graph",
      metaDesc: "Candidate history, placement memory, who-knows-whom. The biggest advantage in search is proprietary relationship data — Sigmabrain is where it compounds.",
      badge: "For executive search & recruiting firms",
      h1a: "Your edge is who you know.",
      h1b: "Sigmabrain remembers all of it.",
      sub: "Every candidate call, client brief, placement and referral — one talent graph that answers 'who fits this brief, and who can intro us?' before your competitor's researcher opens LinkedIn.",
      painsTitle: "Sound familiar?",
      pains: [
        { title: "Your ATS stores fields, not relationships", desc: "It knows the candidate's last title. It doesn't know she told you in 2024 she'd only move for a CTO seat — or who she trusts." },
        { title: "Placement knowledge leaves with consultants", desc: "When a partner exits, years of candidate context, client preferences and referral chains walk out the door." },
        { title: "Everyone searches the same LinkedIn", desc: "Public data is a commodity. The firms that win briefs are the ones with proprietary knowledge no database sells." },
      ],
      demo: {
        windowTitle: "sigmabrain — talent graph",
        you: "You",
        q: "Who in our network fits a CFO brief at a Series-B fintech — and who could intro us?",
        a: `3 strong fits found:

1. **R. Weber** — CFO at widget-co (fintech, exited '25). Told us Nov '25 she's open for the right Series-B. Intro path: bob-example (worked_with, 4 yrs).
2. **T. Klein** — VP Finance, ready for first CFO seat per March call. Direct relationship.
3. + 1 more with sources.

⚠️ Gap: no compensation expectations on file for #2 — last discussed 14 months ago.`,
        sourcesLabel: "Sources:",
        sources: ["people/r-weber", "calls/2026-03-klein", "placements/widget-co"],
      },
      featuresTitle: "Built on a who-knows-whom graph",
      features: [
        { icon: "GitBranch", title: "works_at, worked_with, referred_by", desc: "Typed relationship edges extracted from every call note and placement record — your referral chains become queryable." },
        { icon: "Brain", title: "Brief matching with memory", desc: "Match briefs against everything candidates ever told you — ambitions, dealbreakers, timing — not just their last title." },
        { icon: "Zap", title: "Dormant candidates resurface", desc: "The Dream Cycle consolidates new intel overnight; candidates whose situation changed bubble up before the market notices." },
        { icon: "Shield", title: "Your network stays yours", desc: "Self-hosted or EU cloud. Your proprietary talent graph never feeds someone else's matching model." },
      ],
      proofTitle: "Proprietary data is the moat — this is where it lives",
      proof: "The engine behind Sigmabrain runs a production brain with 24,500 people and their typed relationships. The consensus in the search industry is that the decisive advantage is proprietary relationship data, used well. Sigmabrain is the system that compounds it instead of letting it rot in call notes.",
      faq: [
        { q: "Does it replace our ATS?", a: "No — it sits on top of the unstructured layer your ATS can't hold: call notes, candidate context, referral chains, client preferences. The ATS tracks process; the brain answers questions." },
        { q: "What about GDPR and candidate data?", a: "Self-hosted means candidate data never leaves your infrastructure; hosted plans come with EU hosting and a DPA. Deletion requests are handled at the source — one place, not five tools." },
        { q: "Can consultants see each other's candidates?", a: "Your choice. Per-user scoped access is fuzz-tested across every read path — run one shared brain, per-desk scopes, or both." },
      ],
      ctaTitle: "The next brief is won by what you already know.",
      ctaSub: "Import one desk's call notes and ask your first who-fits question 3 minutes later.",
      ctaButton: "Start your talent graph",
    },
  },
  de: {
    vc: {
      slug: "vc",
      navLabel: "VC & Private Equity",
      metaTitle: "Sigmabrain für VC & Private Equity — das Deal-Gedächtnis deines Fonds",
      metaDesc: "Deal-Memos, Founder-Tracking, Meeting-Prep. Frag 'wer hat in X investiert?' und erhalte eine Antwort mit Quellen — aus einem Wissensgraphen für Investoren.",
      badge: "Für VC, PE & Business Angels",
      h1a: "Das Gedächtnis deines Fonds —",
      h1b: "immer mit im Raum.",
      sub: "Jeder Founder-Call, jedes Deal-Memo, jedes LP-Update — ein Brain, das 'was ist mit diesem Founder offen?' beantwortet, bevor du das Meeting betrittst.",
      painsTitle: "Kommt dir bekannt vor?",
      pains: [
        { title: "Meeting-Prep frisst deine Morgen", desc: "Alte Notizen lesen, Mail-Threads scrollen, Associates fragen 'wo standen wir?' — vor jedem einzelnen Termin." },
        { title: "Beziehungswissen lebt in Köpfen", desc: "Wer hat diesen Founder vorgestellt? Welcher LP fragte nach Climate-Deals? Geht der Partner, geht die Antwort mit." },
        { title: "CRMs speichern Felder, keinen Kontext", desc: "Dein CRM kennt die Deal-Stage. Es weiß nicht, was der Founder im März versprochen hat — und was du noch schuldest." },
      ],
      demo: {
        windowTitle: "sigmabrain — fund brain",
        you: "Du",
        q: "Bei welchen Foundern haben wir in den letzten 12 Monaten gepasst, die seitdem geraised haben?",
        a: `4 Treffer:

1. **Mara T. (DevTools)** — gepasst Okt. '25 ('zu früh'). $4M Seed im März, Lead: fund-a.
2. **K. Osei (Fintech-Infra)** — gepasst Jan. '26 wegen Bewertung. Series A im Mai, 3x der Cap, der uns zu hoch war.
3. + 2 weitere mit Quellen.

⚠️ Lücke: Zu Nr. 3 fehlt das Pass-Memo — wurde nie abgelegt.`,
        sourcesLabel: "Quellen:",
        sources: ["deals/mara-devtools", "memos/2026-01-osei", "news/ingested"],
      },
      featuresTitle: "Ein Graph, der deine Sprache schon spricht",
      features: [
        { icon: "GitBranch", title: "invested_in, founded, advises", desc: "Der Wissensgraph extrahiert Investoren-Kanten aus jeder Notiz — ohne Tagging, ohne Datenpflege." },
        { icon: "Brain", title: "Meeting-Prep in einer Frage", desc: "Offene Punkte, letzter Kontakt, gemachte Zusagen — synthetisiert mit Quellen, vor jedem Call." },
        { icon: "Zap", title: "Anreicherung über Nacht", desc: "Der Dream Cycle konsolidiert neue Founder- und Firmen-Infos, während du schläfst." },
        { icon: "Shield", title: "Diskretion per Architektur", desc: "Self-hosted oder EU-Cloud. Dein Dealflow trainiert niemals fremde Modelle." },
      ],
      proofTitle: "Bewährt im Fonds-Maßstab",
      proof: "Die Engine hinter Sigmabrain betreibt ein Produktions-Brain mit über 146.000 Seiten, 24.500 Personen und 5.300 Firmen — täglich genutzt von einem der bestvernetzten Investoren der Welt. Genau dieses Graph-Schema bekommst du.",
      faq: [
        { q: "Ersetzt das unser CRM?", a: "Nein — es sitzt auf der unstrukturierten Ebene, die dein CRM nicht halten kann: Notizen, Memos, Call-Transkripte, Mail-Kontext. Viele Fonds nutzen beides: Das Brain beantwortet Fragen, das CRM trackt die Pipeline." },
        { q: "Sehen Associates und Partner unterschiedliche Dinge?", a: "Ja. Zugriff pro Nutzer ist über jeden Lesepfad fuzz-getestet. Ein Associate sieht seinen Scope, nie die privaten Notizen eines Partners." },
        { q: "Wie kommen Daten rein?", a: "Ordner ablegen, Mails weiterleiten, Meeting-Notizen einfügen — oder deinen Agenten (Claude Code, MCP) direkt schreiben lassen. Bulk-Import verarbeitet Jahre an Backlog." },
      ],
      ctaTitle: "In jedes Meeting vorbereitet gehen.",
      ctaSub: "Starte mit einem Quartal Deal-Memos. Stell deine erste Frage 3 Minuten später.",
      ctaButton: "Fund Brain starten",
    },
    legal: {
      slug: "legal",
      navLabel: "Kanzleien",
      metaTitle: "Subsumio — Kanzleisoftware für Rechtsanwälte in Österreich & Deutschland",
      metaDesc: "Subsumio ist die KI-Kanzleisoftware für Rechtsanwälte: Akten & Dokumente verwalten, Fristen nach AVG/ABGB/ZPO automatisieren, juristische KI-Analysen mit Zitaten — DSGVO-konform, EU-gehostet oder self-hosted.",
      badge: "Kanzleisoftware für Österreich & Deutschland",
      h1a: "500 Seiten Akte.",
      h1b: "Eine Frage entfernt.",
      sub: "Subsumio ist die Kanzleisoftware für Rechtsanwälte in Österreich: Akten & Dokumente zentral verwalten, Fristen nach AVG/ABGB/ZPO automatisieren und juristische KI-Analysen mit Zitaten erhalten — DSGVO-konform und EU-gehostet.",
      painsTitle: "Kommt dir bekannt vor?",
      pains: [
        { title: "Aktenwissen begraben in PDFs", desc: "Das entscheidende Detail steht auf Seite 347 eines Schriftsatzes, den jemand anderes vor acht Monaten gelesen hat." },
        { title: "US-Clouds sind ein No-Go", desc: "Mandantenakten in einem US-gehosteten KI-Tool? Verschwiegenheitspflicht und Mandanten sagen Nein." },
        { title: "Wissen geht mit den Köpfen", desc: "Wenn ein erfahrener Anwalt geht, gehen Jahre an Aktenkontext mit — außer das Kanzleiwissen liegt dauerhaft und abfragbar an einem Ort." },
      ],
      demo: {
        windowTitle: "subsumio — case brain",
        you: "Du",
        q: "Wo widersprechen die Schriftsätze der Gegenseite ihren Zeugenaussagen?",
        a: `3 Widersprüche gefunden:

1. **Lieferdatum** — Klageschrift nennt 12. März; Zeuge K. sagt 'Ende April' (Protokoll S. 14).
2. **Zahlungsziel** — Schriftsatz vom 9. Jan. behauptet 30 Tage netto; die Vertragsanlage zeigt 14 Tage.
3. **Vorherige Mahnung** — Verteidigung bestreitet jede Mahnung; Anlage B7 dokumentiert eine.

⚠️ Lücke: Die Echtheit von Anlage B7 wurde bisher von keiner Seite thematisiert.`,
        sourcesLabel: "Quellen:",
        sources: ["akte/klage-2026-114", "anlagen/b7", "protokolle/zeuge-k"],
      },
      featuresTitle: "Gebaut für Verschwiegenheit zuerst",
      features: [
        { icon: "CalendarClock", title: "Fristenkontrolle nach ZPO & BGB", desc: "Berechnet Notfristen, Berufungs- und Beschwerdefristen mit korrekter Monatsarithmetik (§ 188 BGB) und Wochenend-Verschiebung (§ 222 ZPO) — inkl. Normzitat. Täglicher E-Mail-Digest für überfällige und kritische Fristen." },
        { icon: "MessageSquare", title: "WhatsApp-Kanzlei-Copilot", desc: "Anwälte erfassen Zeiten, Notizen, Aufgaben, Fristen, Auslagen, Fragen, PDFs, Fotos und Sprachnotizen direkt vom Handy. Subsumio speichert alles im Brain und ordnet Medien per Aktenzeichen in der Beschriftung der richtigen Akte zu." },
        { icon: "FolderOpen", title: "Dokumenten-Vault mit dauerhaftem Speicher", desc: "Aktiendokumente, WhatsApp-Medien und Beweise liegen im Vault mit Hash, Quelle, Größe und Storage-Metadaten — lokal self-hosted oder in der Cloud über Vercel Blob/S3-artigen Objektspeicher." },
        { icon: "Mail", title: "beA-Anbindung", desc: "beA-Nachrichten (XML-Export) werden direkt zur Akte: Absender, Aktenzeichen und Anlagen strukturiert erfasst und durchsuchbar — ohne Copy-&-Paste." },
        { icon: "ShieldAlert", title: "Kollisionsprüfung (§ 43a BRAO)", desc: "Prüft jeden neuen Mandanten oder Gegner serverseitig gegen den gesamten Aktenbestand und meldet Interessenkonflikte, bevor das Mandat angenommen wird." },
        { icon: "Calculator", title: "Zeiten, Auslagen, Rechnungen & DATEV", desc: "Minuten nach Anwalt/Tätigkeit buchen, abrechenbare Auslagen erfassen, Rechnungen aus offener Arbeit erstellen, Einträge als abgerechnet markieren und DATEV-ready exportieren." },
        { icon: "Landmark", title: "Rechtsprechung DE & AT", desc: "Live-Recherche in openlegaldata/BGH (DE) und RIS-OGD (AT) — relevante Urteile landen mit einem Klick zitierfähig im Brain." },
        { icon: "Shield", title: "Euer Server, eure Jurisdiktion", desc: "Volle Engine self-hosted auf Kanzlei-Hardware mit lokalem Speicher — oder EU-Cloud mit AVV und dauerhaftem Objektspeicher. Mandantendaten verlassen nie eure Kontrolle." },
        { icon: "Zap", title: "Offline-first Kanzleialltag", desc: "Akten, Kontakte, Fristen, Rechnungen, Vault, Verträge und Recherche nutzen lokale Caches und synchronisieren Änderungen, sobald das Cloud-Brain wieder erreichbar ist." },
        { icon: "Brain", title: "Widerspruchs-Erkennung", desc: "Der Dream Cycle findet widersprüchliche Aussagen über Schriftsätze, Anlagen und Protokolle hinweg — mit Zitaten." },
        { icon: "Search", title: "Jede Behauptung belegt", desc: "Antworten zitieren die exakten Fundstellen. Ein Klick zur Verifikation, bevor etwas in den Schriftsatz geht." },
        { icon: "Layers", title: "Trennung pro Mandat", desc: "Zugriff pro Mandat und Nutzer gescoped — fuzz-getestet, null Leaks zwischen Akten oder Teams." },
      ],
      proofTitle: "Engine-Klasse Retrieval, kein Chat-Wrapper",
      proof: "Der Retrieval-Kern erreicht 97,9 % Recall@5 mit Hybrid-Suche und Wissensgraph — und weil er auf Infrastruktur läuft, die ihr kontrolliert, steuert eure IT jedes System, das Mandantendaten berührt.",
      faq: [
        { q: "Ist das Rechtsberatungs-Software?", a: "Nein. Subsumio organisiert und synthetisiert eure Dokumente und Notizen. Die juristische Bewertung bleibt bei den Anwälten — das Brain stellt sicher, dass ihnen nichts aus der Akte entgeht." },
        { q: "Können wir komplett offline arbeiten?", a: "Die Engine läuft self-hosted auf eurer Hardware und das Dashboard hält lokale Caches plus Änderungs-Warteschlange für die wichtigsten Kanzlei-Workflows. Die Synthese nutzt LLM-APIs eurer Wahl; Enterprise-Setups können über EU-Endpunkte oder ein eigenes Gateway routen." },
        { q: "Wie viel Daten können wir speichern?", a: "Self-hosted nutzt euren eigenen Speicher oder S3-kompatiblen Objektspeicher. Hosted-Pakete enthalten Cloud-Dateispeicher je Paket; Enterprise bekommt individuelle Speichermengen und Aufbewahrungsregeln." },
        { q: "Was ist mit DSGVO und Berufsrecht?", a: "Self-hosted heißt: Daten verlassen eure Infrastruktur nicht. Gehostete Pläne kommen mit EU-Hosting und AVV. Lasst euren Datenschutzbeauftragten mit uns sprechen — wir sprechen seine Sprache." },
        { q: "Was unterscheidet das von Harvey, Legora oder Noxtua?", a: "Das sind exzellente Enterprise-Legal-AI-Workspaces — und sie laufen auf fremder Cloud und fremdem Modell. Subsumio liefert dieselbe Synthese-Qualität auf Infrastruktur, die IHR kontrolliert: self-hosted oder EU-Cloud, eure eigenen Akten abfragbar gemacht, mit einem WhatsApp-Copilot, den eure Anwälte täglich nutzen. Es ist keine Rechtsrecherche — es sind die eigenen Mandate eurer Kanzlei, mit seitengenauen Zitaten und Vertraulichkeit per Architektur." },
      ],
      ctaTitle: "Die Akte kennt die Antwort. Jetzt du auch.",
      ctaSub: "Startet mit einem abgeschlossenen Mandat als Pilot. Keine Mandantendaten müssen das Haus verlassen.",
      ctaButton: "Kostenlos testen",
    },
    tax: {
      slug: "tax",
      navLabel: "Steuerberater & WP",
      metaTitle: "Sigmabrain für Steuerkanzleien — das Kanzleigedächtnis neben DATEV",
      metaDesc: "Mandantenkontext, Gestaltungs-Historie, E-Mail-Verläufe und Besprechungsnotizen — ein Brain, das 'was haben wir diesem Mandanten gesagt, und warum?' beantwortet. § 203-sicher: self-hosted oder EU-Cloud.",
      badge: "Für Steuerberater, Wirtschaftsprüfer & Kanzleien",
      h1a: "DATEV kennt die Zahlen.",
      h1b: "Sigmabrain kennt das Warum.",
      sub: "Jede Mandanten-Mail, jedes Gestaltungs-Memo, jede Besprechungsnotiz — ein Brain, das 'warum haben wir das 2022 so strukturiert, und was ist noch offen?' beantwortet, bevor das Jahresgespräch beginnt.",
      painsTitle: "Kommt dir bekannt vor?",
      pains: [
        { title: "Die Begründung steht nicht in der Buchhaltung", desc: "DATEV hält Buchungen, Erklärungen und Fristen. Das Warum — Gestaltungsentscheidungen, Mandanten-Präferenzen, Zusagen — liegt verstreut in Postfächern und Besprechungsnotizen." },
        { title: "Fachkräftemangel macht jeden Kopf kritisch", desc: "Über 70 % der Kanzleien kämpfen um Personal. Geht eine erfahrene Kollegin, gehen Jahre Mandantenkontext mit — der Rest des Teams baut ihn in peinlichen Mandantengesprächen neu auf." },
        { title: "ChatGPT & Co. sind für Mandantendaten tabu", desc: "§ 203 StGB verlangt mehr als eine AVV: Ohne Verschwiegenheitsverpflichtung des Anbieters dürfen Mandantendaten gar nicht erst ins Tool. Die meisten US-Clouds fallen damit aus." },
      ],
      demo: {
        windowTitle: "sigmabrain — kanzlei brain",
        you: "Du",
        q: "Welche unserer Mandanten betrifft die E-Rechnungs-Pflicht — und was haben wir ihnen schon kommuniziert?",
        a: `12 betroffene Mandanten gefunden:

1. **widget-co GmbH** — B2B-Umsätze, noch nicht umgestellt. Info-Schreiben Nov. '25 gesendet, keine Reaktion. Wiedervorlage fehlt.
2. **acme-example KG** — Umstellung läuft laut Besprechungsnotiz vom 14. März; ihre ERP-Frage an uns ist noch offen.
3. + 10 weitere mit Quellen.

⚠️ Lücke: Bei 4 Mandanten ist der B2B-Anteil unklar — Stammdaten unvollständig.`,
        sourcesLabel: "Quellen:",
        sources: ["mandanten/widget-co", "schreiben/2025-11-erechnung", "besprechungen/2026-03-acme"],
      },
      featuresTitle: "Gebaut neben DATEV, nicht statt DATEV",
      features: [
        { icon: "Shield", title: "§ 203-sicher per Architektur", desc: "Self-hosted auf Kanzlei-Hardware erreichen Mandantendaten nie eine mitwirkende Person. Oder EU-Cloud mit AVV plus Verschwiegenheitsverpflichtung nach § 203 Abs. 4 StGB." },
        { icon: "Layers", title: "Die unstrukturierte Ebene", desc: "Erklärungen, Buchungen und Fristen bleiben in DATEV. Sigmabrain hält, was dort nicht hineinpasst: Mails, Gestaltungs-Memos, Begründungen, Gesprächsnotizen." },
        { icon: "GitBranch", title: "Beteiligungsstrukturen als Graph", desc: "Beteiligungen, Organschaften, Wer-berät-wen — typisierte Kanten aus euren Notizen, abfragbar in normaler Sprache." },
        { icon: "Brain", title: "Jahresgespräch in einer Frage", desc: "Gestaltungs-Historie, offene Punkte, Fristen-Kontext — synthetisiert mit Quellen, vor jedem Mandantentermin." },
        { icon: "CalendarClock", title: "Fristen-Tracking mit E-Mail-Digest", desc: "Abgabe- und Einspruchsfristen pro Mandant, mit Wochenend-Verschiebung berechnet und im täglichen E-Mail-Digest aufbereitet — überfällige und kritische zuerst." },
      ],
      proofTitle: "Das Kanzleiwissen bleibt — auch wenn Leute gehen",
      proof: "Der Retrieval-Kern von Sigmabrain erreicht 97,9 % Recall@5 mit Hybrid-Suche und Wissensgraph. In einem Berufsstand, in dem über 70 % der Kanzleien Fachkräftemangel melden, ist das der Unterschied zwischen Wissen, das zur Tür rausgeht, und Wissen, das sich verzinst.",
      faq: [
        { q: "Ersetzt das DATEV?", a: "Nein. DATEV behält die strukturierte Welt — Erklärungen, Buchhaltung, Fristen. Sigmabrain hält die unstrukturierte Ebene daneben und beantwortet Fragen über den Kontext beider Welten." },
        { q: "Wie passt das zu § 203 StGB und der BStBK-Linie?", a: "Self-hosted heißt: Mandantendaten verlassen eure Infrastruktur nicht — es gibt keine mitwirkende Person im Sinne von § 203 Abs. 4 StGB. Gehostete Pläne laufen in der EU mit AVV plus vertraglicher Verschwiegenheitsverpflichtung. Bringt euren Datenschutzbeauftragten mit — wir sprechen seine Sprache." },
        { q: "Wie kommen zehn Jahre E-Mail-Historie rein?", a: "Bulk-Import verarbeitet Postfach-Exporte, Dokumentenordner und Besprechungsnotizen. Die meisten Kanzleien starten mit einem Mandanten-Ordner und sehen die erste brauchbare Antwort am selben Tag." },
      ],
      ctaTitle: "Das nächste Mandantengespräch gewinnt, was die Kanzlei schon weiß.",
      ctaSub: "Startet mit dem Ordner eines Mandanten als Pilot. Keine Mandantendaten müssen das Haus verlassen.",
      ctaButton: "Kanzlei-Brain starten",
    },
    consulting: {
      slug: "consulting",
      navLabel: "Beratung & Agenturen",
      metaTitle: "Sigmabrain für Beratungen & Agenturen — Institutional Memory, das sich verzinst",
      metaDesc: "Pitch-Historie, Projekt-Learnings, Kundenkontext in einem Brain. Neue Kollegen in Tagen produktiv statt Monaten.",
      badge: "Für Beratungen & Agenturen",
      h1a: "Ihr habt das 2023 gelöst.",
      h1b: "Sigmabrain weiß noch wo.",
      sub: "Fünf Jahre Decks, Projektdokumente und Kundennotizen werden ein Brain, das 'haben wir das schon mal gemacht?' beantwortet — Schluss mit Neuerfinden.",
      painsTitle: "Kommt dir bekannt vor?",
      pains: [
        { title: "Wissen geht zur Tür raus", desc: "Jeder Senior, der geht, nimmt Kundenhistorie, Pricing-Gespür und Projekt-Learnings mit." },
        { title: "Neue Kollegen brauchen Monate", desc: "Die Antwort auf 'wie machen wir das üblicherweise?' liegt in 40 Ordnern und drei Köpfen." },
        { title: "Pitches starten bei null", desc: "Dieses Proposal gab es schon mal — irgendwo. Es zu finden dauert länger, als es neu zu schreiben." },
      ],
      demo: {
        windowTitle: "sigmabrain — firm brain",
        you: "Du",
        q: "Haben wir je eine Pricing-Studie für einen B2B-Marktplatz gemacht? Was haben wir gelernt?",
        a: `Ja — 2 Projekte:

1. **widget-co (2023)** — Zahlungsbereitschafts-Studie, 14 Interviews. Learning: Take-Rate-Sensitivität clustert nach Seller-Größe, nicht Kategorie.
2. **acme-example (2024)** — Pricing-Relaunch. Das Stufenmodell aus 2023 wurde wiederverwendet; Marge +9pp.

Wiederverwendbar: Interview-Leitfaden (2023), Pricing-Deck v3.

⚠️ Lücke: Für das 2024-Projekt wurde kein Post-Mortem abgelegt.`,
        sourcesLabel: "Quellen:",
        sources: ["projekte/widget-co-2023", "projekte/acme-2024", "assets/pricing-deck-v3"],
      },
      featuresTitle: "Institutional Memory — endlich institutionell",
      features: [
        { icon: "Brain", title: "Frag die Firma, nicht den Flur", desc: "Projekt-Learnings, Kundenkontext und wiederverwendbare Assets — als eine Antwort mit Quellen." },
        { icon: "Layers", title: "Mandantensichere Trennung", desc: "Scoping pro Kunde und Team, fuzz-getestet. Vertrauliche Projekte bleiben vertraulich." },
        { icon: "Zap", title: "Onboarding in Tagen", desc: "Neue Berater fragen das Brain statt die Seniors zu unterbrechen. Die Lernkurve kollabiert." },
        { icon: "GitBranch", title: "Beziehungsgraph inklusive", desc: "Wer kennt wen bei welchem Kunden — automatisch extrahiert aus Notizen und Meetings." },
      ],
      proofTitle: "Retrieval, das die Nadel findet",
      proof: "Hybrid-Suche plus selbstverdrahtender Wissensgraph: +31,4 P@5-Punkte gegenüber reinem Vector-RAG im Benchmark. Das ist der Unterschied zwischen 'Playbook von 2023 gefunden' und 'nach Seite zwei der Treffer aufgegeben'.",
      faq: [
        { q: "Wir haben SharePoint/Drive/Notion. Warum das hier?", a: "Die speichern Dokumente. Sigmabrain beantwortet Fragen darüber hinweg — synthetisiert, zitiert, mit markierten Lücken. Es ergänzt eure Ablage, es ersetzt sie nicht." },
        { q: "Wie lange bis es nützlich ist?", a: "Die ersten brauchbaren Antworten kommen mit dem ersten Bulk-Import — typisch ein Tag Setup. Danach verzinst sich das Brain; der Dream Cycle hält es automatisch sauber." },
        { q: "Können Kunden Zugriff bekommen?", a: "Scoped Access macht kundenseitige Ausschnitte möglich — ein Kunde sieht sein Projekt-Brain, nie das eurer Firma." },
      ],
      ctaTitle: "Hört auf, dieselbe Lektion zweimal zu bezahlen.",
      ctaSub: "Importiert das Archiv eines Bereichs und erlebt den ersten 'das hatten wir doch schon'-Moment.",
      ctaButton: "Firm Brain starten",
    },
    recruiting: {
      slug: "recruiting",
      navLabel: "Executive Search & Recruiting",
      metaTitle: "Sigmabrain für Executive Search & Recruiting — euer proprietärer Talent-Graph",
      metaDesc: "Kandidaten-Historie, Placement-Gedächtnis, Wer-kennt-wen. Der größte Vorteil im Search ist proprietäres Beziehungswissen — Sigmabrain ist der Ort, wo es sich verzinst.",
      badge: "Für Executive Search & Personalberatungen",
      h1a: "Euer Vorsprung ist, wen ihr kennt.",
      h1b: "Sigmabrain vergisst nichts davon.",
      sub: "Jeder Kandidaten-Call, jedes Mandat, jedes Placement, jede Empfehlung — ein Talent-Graph, der 'wer passt auf dieses Mandat, und wer kann uns vorstellen?' beantwortet, bevor der Researcher der Konkurrenz LinkedIn öffnet.",
      painsTitle: "Kommt dir bekannt vor?",
      pains: [
        { title: "Euer ATS speichert Felder, keine Beziehungen", desc: "Es kennt den letzten Titel der Kandidatin. Es weiß nicht, dass sie euch 2024 sagte, sie wechselt nur für einen CTO-Posten — oder wem sie vertraut." },
        { title: "Placement-Wissen geht mit Beratern", desc: "Verlässt ein Partner die Firma, gehen Jahre an Kandidaten-Kontext, Mandanten-Präferenzen und Empfehlungsketten mit." },
        { title: "Alle durchsuchen dasselbe LinkedIn", desc: "Öffentliche Daten sind Commodity. Mandate gewinnt, wer proprietäres Wissen hat, das keine Datenbank verkauft." },
      ],
      demo: {
        windowTitle: "sigmabrain — talent graph",
        you: "Du",
        q: "Wer in unserem Netzwerk passt auf ein CFO-Mandat bei einem Series-B-Fintech — und wer kann uns vorstellen?",
        a: `3 starke Treffer:

1. **R. Weber** — CFO bei widget-co (Fintech, Exit '25). Sagte uns im Nov. '25, sie sei offen für das richtige Series-B. Intro-Pfad: bob-example (worked_with, 4 Jahre).
2. **T. Klein** — VP Finance, laut März-Call bereit für den ersten CFO-Posten. Direkte Beziehung.
3. + 1 weitere mit Quellen.

⚠️ Lücke: Zu Nr. 2 fehlen Gehaltsvorstellungen — zuletzt vor 14 Monaten besprochen.`,
        sourcesLabel: "Quellen:",
        sources: ["people/r-weber", "calls/2026-03-klein", "placements/widget-co"],
      },
      featuresTitle: "Gebaut auf einem Wer-kennt-wen-Graphen",
      features: [
        { icon: "GitBranch", title: "works_at, worked_with, referred_by", desc: "Typisierte Beziehungs-Kanten aus jeder Call-Notiz und jedem Placement — eure Empfehlungsketten werden abfragbar." },
        { icon: "Brain", title: "Mandat-Matching mit Gedächtnis", desc: "Matche Mandate gegen alles, was Kandidaten euch je gesagt haben — Ambitionen, Dealbreaker, Timing — nicht nur den letzten Titel." },
        { icon: "Zap", title: "Schlafende Kandidaten tauchen auf", desc: "Der Dream Cycle konsolidiert neue Infos über Nacht; Kandidaten mit veränderter Situation steigen auf, bevor der Markt es merkt." },
        { icon: "Shield", title: "Euer Netzwerk bleibt eures", desc: "Self-hosted oder EU-Cloud. Euer proprietärer Talent-Graph füttert niemals das Matching-Modell eines anderen." },
      ],
      proofTitle: "Proprietäre Daten sind der Burggraben — hier leben sie",
      proof: "Die Engine hinter Sigmabrain betreibt ein Produktions-Brain mit 24.500 Personen und ihren typisierten Beziehungen. Der Konsens der Search-Branche: Der entscheidende Vorteil ist proprietäres Beziehungswissen, gut genutzt. Sigmabrain ist das System, das es verzinst, statt es in Call-Notizen verrotten zu lassen.",
      faq: [
        { q: "Ersetzt das unser ATS?", a: "Nein — es sitzt auf der unstrukturierten Ebene, die euer ATS nicht halten kann: Call-Notizen, Kandidaten-Kontext, Empfehlungsketten, Mandanten-Präferenzen. Das ATS trackt den Prozess; das Brain beantwortet Fragen." },
        { q: "Was ist mit DSGVO und Kandidatendaten?", a: "Self-hosted heißt: Kandidatendaten verlassen eure Infrastruktur nie; gehostete Pläne kommen mit EU-Hosting und AVV. Löschanfragen werden an einer Stelle erledigt — nicht in fünf Tools." },
        { q: "Sehen Berater die Kandidaten der anderen?", a: "Eure Entscheidung. Zugriff pro Nutzer ist über jeden Lesepfad fuzz-getestet — ein gemeinsames Brain, Desk-Scopes oder beides." },
      ],
      ctaTitle: "Das nächste Mandat gewinnt, was ihr schon wisst.",
      ctaSub: "Importiert die Call-Notizen eines Desks und stellt die erste Wer-passt-Frage 3 Minuten später.",
      ctaButton: "Talent-Graph starten",
    },
  },
};
