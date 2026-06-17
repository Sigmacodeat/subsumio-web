// Consultumio — dedicated landing page for consultancies & agencies.
// Reuses BrandedVerticalContent. The wedge: institutional memory that compounds
// (reuse past work, onboard fast). Honest: not a PSA/time-tracking tool.

import type { Lang } from "./site";
import type { BrandedVerticalContent } from "./taxumio";

export const CONSULTING: Record<Lang, BrandedVerticalContent> = {
  en: {
    metaTitle: "Consultumio — institutional memory that compounds",
    metaDesc:
      "Pitch history, project learnings and client context in one brain that answers 'have we done this before?' New hires productive in days. Consultumio is Sigmabrain for consultancies and agencies.",
    badge: "Consultumio — the firm's institutional memory",
    h1a: "You solved this in 2023.",
    h1b: "Consultumio remembers where.",
    sub: "Five years of decks, project docs and client notes become one brain that answers “have we done this before, and what did we learn?” — so you stop reinventing and start reusing. Self-hosted or EU cloud; client work stays confidential.",
    ctaPrimary: "Start your firm brain",
    ctaSecondary: "Compare honestly",
    cockpit: {
      title: "consultumio — firm cockpit",
      digestLabel: "Today's reuse signals",
      digestItems: [
        "New RFP matches a 2023 pricing study — reusable deck found",
        "Proposal due — widget-co (overdue!)",
        "Onboarding: 2 new hires querying the brain",
      ],
      invoiceLabel: "Project retro filed · acme-2024",
      invoiceValue: "+9pp",
      datevLabel: "Reuse search exported",
      aiBadge: "AI-generated · review required",
    },
    demo: {
      windowTitle: "consultumio — firm brain",
      you: "You",
      q: "Have we ever done a pricing study for a B2B marketplace? What did we learn?",
      a: `Yes — 2 engagements:

1. **widget-co (2023)** — willingness-to-pay study, 14 interviews. Key learning: take-rate sensitivity clustered by seller size, not category.
2. **acme-example (2024)** — pricing relaunch reused the 2023 tiered model; margin +9pp.

Reusable assets: interview guide (2023), pricing model deck v3.

⚠️ Gap: no post-mortem filed for the 2024 engagement.`,
      sourcesLabel: "Sources:",
      sources: ["projects/widget-co-2023", "projects/acme-2024", "assets/pricing-deck-v3"],
    },
    dayTitle: "A day at the firm, with Consultumio",
    daySub: "Not another folder to search — the brain answers across every project, deck and note.",
    steps: [
      { time: "08:30", icon: "Search", title: "An RFP lands — you ask the firm, not the hallway", desc: "“Have we done this before?” returns ranked past projects, reusable assets and what was learned, with sources — in seconds." },
      { time: "10:00", icon: "FileText", title: "Draft the approach from proven structure", desc: "An engagement scope built on cited prior work: objectives, workstreams, timeline, risks — a draft, not a blank page." },
      { time: "13:00", icon: "Brain", title: "A new hire ramps by querying, not interrupting", desc: "“How do we usually approach this?” is answered by the brain instead of a senior's afternoon. Onboarding in days." },
      { time: "15:00", icon: "Layers", title: "Client-safe separation, always", desc: "Per-client and per-team scoping, fuzz-tested. Confidential engagements never surface where they shouldn't." },
      { time: "17:00", icon: "Zap", title: "Capture the retro before it's forgotten", desc: "What worked, what didn't, the reusable assets — filed so the next team finds it. Knowledge compounds instead of walking out." },
    ],
    toolsTitle: "The firm tools that ship today",
    toolsSub: "Every tile below is a live page in the dashboard — not a roadmap.",
    tools: [
      { icon: "Brain", title: "Ask-the-firm Q&A", desc: "Project learnings, client context and reusable assets synthesized with citations.", href: "/dashboard/query" },
      { icon: "Search", title: "Reuse search", desc: "“Have we done this before?” — ranked past work with what's reusable.", href: "/dashboard/research" },
      { icon: "FileText", title: "Scope & proposal drafting", desc: "Engagement scopes built on cited prior projects.", href: "/dashboard/drafting" },
      { icon: "Network", title: "Relationship graph", desc: "Who knows whom at which client — extracted from notes.", href: "/dashboard/graph" },
      { icon: "Layers", title: "Per-client scoping", desc: "Fuzz-tested isolation so confidential engagements stay confidential.", href: "/dashboard/team" },
      { icon: "Database", title: "Secure knowledge vault", desc: "Decks, project docs and learnings — confidential, searchable.", href: "/dashboard/vault" },
    ],
    trustTitle: "Built for client confidentiality",
    trust: [
      { icon: "Shield", title: "Confidentiality by architecture", desc: "Self-host on firm hardware — client work never reaches a third party. Or EU cloud with a DPA." },
      { icon: "Layers", title: "Client-safe separation", desc: "Per-client and per-team scoping, fuzz-tested for zero cross-client leaks." },
      { icon: "Zap", title: "Knowledge that compounds", desc: "Retros and reusable assets stay in the brain when people leave." },
      { icon: "Database", title: "Your data, your export", desc: "GDPR Art. 20 one-click export of account and brain. No lock-in." },
    ],
    honesty:
      "Honest scope: Consultumio is the firm's institutional memory — projects, proposals, learnings and reusable assets, queryable with citations. It complements your storage and PSA/time-tracking tools; it is NOT a PSA, a time-tracker, or a document store, and it doesn't replace a consultant's judgment.",
    faqTitle: "Fair questions",
    faq: [
      { q: "We have SharePoint/Drive/Notion. Why this?", a: "Those store documents. Consultumio answers questions across them — synthesized, cited, with gaps flagged. It complements your storage; it doesn't replace it." },
      { q: "How long until it's useful?", a: "First useful answers come from your first bulk import — typically a day. The brain compounds from there; the Dream Cycle keeps it clean automatically." },
      { q: "Can clients get access?", a: "Scoped access makes client-facing slices possible — a client sees their project brain, never your firm's." },
      { q: "Is client work confidential?", a: "Self-hosted, it never leaves your infrastructure; hosted runs in the EU with a DPA. Per-client scoping is fuzz-tested." },
    ],
    ctaTitle: "Stop paying for the same lesson twice.",
    ctaSub: "Import one practice area's archive and watch the first 'we already solved this' moment.",
    ctaButton: "Start your firm brain",
  },
  de: {
    metaTitle: "Consultumio — Institutional Memory, das sich verzinst",
    metaDesc:
      "Pitch-Historie, Projekt-Learnings und Mandantenkontext in einem Gehirn, das beantwortet „haben wir das schon gemacht?“ Neue Mitarbeiter in Tagen produktiv. Consultumio ist Sigmabrain für Beratungen und Agenturen.",
    badge: "Consultumio — das Institutional Memory der Beratung",
    h1a: "Ihr habt das 2023 gelöst.",
    h1b: "Consultumio weiß, wo.",
    sub: "Fünf Jahre Decks, Projektdokumente und Mandantennotizen werden ein Gehirn, das beantwortet „haben wir das schon gemacht, und was haben wir gelernt?“ — damit ihr nicht neu erfindet, sondern wiederverwendet. Self-hosted oder EU-Cloud; Mandantenarbeit bleibt vertraulich.",
    ctaPrimary: "Firmen-Gehirn starten",
    ctaSecondary: "Ehrlich vergleichen",
    cockpit: {
      title: "consultumio — firmen-cockpit",
      digestLabel: "Reuse-Signale heute",
      digestItems: [
        "Neues RFP passt zu Pricing-Studie 2023 — Deck gefunden",
        "Angebot fällig — widget-co (überfällig!)",
        "Onboarding: 2 neue Mitarbeiter fragen das Brain",
      ],
      invoiceLabel: "Projekt-Retro abgelegt · acme-2024",
      invoiceValue: "+9pp",
      datevLabel: "Reuse-Suche exportiert",
      aiBadge: "KI-generiert · zu prüfen",
    },
    demo: {
      windowTitle: "consultumio — firmen-gehirn",
      you: "Du",
      q: "Haben wir je eine Pricing-Studie für einen B2B-Marktplatz gemacht? Was haben wir gelernt?",
      a: `Ja — 2 Projekte:

1. **widget-co (2023)** — Zahlungsbereitschafts-Studie, 14 Interviews. Learning: Take-Rate-Sensitivität clustert nach Verkäufergröße, nicht Kategorie.
2. **acme-example (2024)** — Pricing-Relaunch nutzte das Stufenmodell von 2023; Marge +9pp.

Wiederverwendbar: Interview-Leitfaden (2023), Pricing-Model-Deck v3.

⚠️ Lücke: kein Post-Mortem zum 2024er-Projekt abgelegt.`,
      sourcesLabel: "Quellen:",
      sources: ["projects/widget-co-2023", "projects/acme-2024", "assets/pricing-deck-v3"],
    },
    dayTitle: "Ein Firmen-Tag mit Consultumio",
    daySub: "Kein weiterer Ordner zum Durchsuchen — das Gehirn antwortet über jedes Projekt, Deck und jede Notiz.",
    steps: [
      { time: "08:30", icon: "Search", title: "Ein RFP kommt — ihr fragt die Firma, nicht den Flur", desc: "„Haben wir das schon gemacht?“ liefert gerankte frühere Projekte, wiederverwendbare Assets und Learnings mit Quellen — in Sekunden." },
      { time: "10:00", icon: "FileText", title: "Den Ansatz aus bewährter Struktur entwerfen", desc: "Ein Scope auf Basis zitierter Vorarbeit: Ziele, Workstreams, Timeline, Risiken — ein Entwurf, kein leeres Blatt." },
      { time: "13:00", icon: "Brain", title: "Ein Neuzugang ramped durch Fragen, nicht Stören", desc: "„Wie gehen wir das üblicherweise an?“ beantwortet das Brain statt eines Senior-Nachmittags. Onboarding in Tagen." },
      { time: "15:00", icon: "Layers", title: "Mandantensichere Trennung, immer", desc: "Pro-Mandant- und Pro-Team-Scoping, fuzz-getestet. Vertrauliche Projekte tauchen nie auf, wo sie nicht dürfen." },
      { time: "17:00", icon: "Zap", title: "Die Retro festhalten, bevor sie vergessen wird", desc: "Was funktionierte, was nicht, die wiederverwendbaren Assets — abgelegt, sodass das nächste Team sie findet." },
    ],
    toolsTitle: "Die Firmen-Tools, die heute da sind",
    toolsSub: "Jede Kachel unten ist eine live Seite im Dashboard — keine Roadmap.",
    tools: [
      { icon: "Brain", title: "Frag-die-Firma-Q&A", desc: "Projekt-Learnings, Mandantenkontext und wiederverwendbare Assets synthetisiert, mit Zitaten.", href: "/dashboard/query" },
      { icon: "Search", title: "Reuse-Suche", desc: "„Haben wir das schon gemacht?“ — gerankte Vorarbeit mit dem, was wiederverwendbar ist.", href: "/dashboard/research" },
      { icon: "FileText", title: "Scope- & Angebots-Entwurf", desc: "Engagement-Scopes auf Basis zitierter früherer Projekte.", href: "/dashboard/drafting" },
      { icon: "Network", title: "Beziehungsgraph", desc: "Wer kennt wen bei welchem Mandanten — aus Notizen extrahiert.", href: "/dashboard/graph" },
      { icon: "Layers", title: "Pro-Mandant-Scoping", desc: "Fuzz-getestete Isolation, damit vertrauliche Projekte vertraulich bleiben.", href: "/dashboard/team" },
      { icon: "Database", title: "Sicherer Wissens-Vault", desc: "Decks, Projektdokumente und Learnings — vertraulich, durchsuchbar.", href: "/dashboard/vault" },
    ],
    trustTitle: "Gebaut für Mandanten-Vertraulichkeit",
    trust: [
      { icon: "Shield", title: "Vertraulichkeit per Architektur", desc: "Self-hosted auf Firmen-Hardware — Mandantenarbeit erreicht keinen Dritten. Oder EU-Cloud mit AVV." },
      { icon: "Layers", title: "Mandantensichere Trennung", desc: "Pro-Mandant- und Pro-Team-Scoping, fuzz-getestet auf null Cross-Mandanten-Lecks." },
      { icon: "Zap", title: "Wissen, das sich verzinst", desc: "Retros und wiederverwendbare Assets bleiben im Brain, wenn Leute gehen." },
      { icon: "Database", title: "Eure Daten, euer Export", desc: "DSGVO Art. 20 Ein-Klick-Export von Konto und Brain. Kein Lock-in." },
    ],
    honesty:
      "Ehrlicher Rahmen: Consultumio ist das Institutional Memory der Firma — Projekte, Angebote, Learnings und wiederverwendbare Assets, abfragbar mit Quellen. Es ergänzt euren Speicher und eure PSA-/Zeiterfassungs-Tools; es ist KEINE PSA, kein Time-Tracker und kein Dokumentenspeicher und ersetzt nicht die Beurteilung eines Beraters.",
    faqTitle: "Faire Fragen",
    faq: [
      { q: "Wir haben SharePoint/Drive/Notion. Warum das?", a: "Die speichern Dokumente. Consultumio beantwortet Fragen über sie hinweg — synthetisiert, zitiert, mit Lücken markiert. Es ergänzt euren Speicher, ersetzt ihn nicht." },
      { q: "Wie lange bis es nützlich ist?", a: "Erste nützliche Antworten kommen aus eurem ersten Bulk-Import — meist ein Tag. Das Brain verzinst sich danach; der Dream Cycle hält es automatisch sauber." },
      { q: "Können Mandanten Zugriff bekommen?", a: "Scoped Access macht mandantenseitige Ausschnitte möglich — ein Mandant sieht sein Projekt-Brain, nie das der Firma." },
      { q: "Ist Mandantenarbeit vertraulich?", a: "Self-hosted verlässt sie eure Infrastruktur nie; hosted läuft in der EU mit AVV. Das Pro-Mandant-Scoping ist fuzz-getestet." },
    ],
    ctaTitle: "Hört auf, dieselbe Lektion zweimal zu bezahlen.",
    ctaSub: "Importiert das Archiv eines Bereichs und erlebt den ersten „das haben wir schon gelöst“-Moment.",
    ctaButton: "Firmen-Gehirn starten",
  },
};
