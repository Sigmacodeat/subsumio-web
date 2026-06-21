// Features page — every engine capability, explained for buyers. EN + DE.
// Grouped into interactive categories; each has an optional terminal demo.

import type { Lang } from "./site";

export interface FeatureCategory {
  id: string;
  icon: string;
  label: string;
  title: string;
  intro: string;
  items: { title: string; desc: string }[];
  demo?: { windowTitle: string; lines: string[] };
}

export interface FeaturesContent {
  metaTitle: string;
  metaDesc: string;
  badge: string;
  h1a: string;
  h1b: string;
  sub: string;
  categories: FeatureCategory[];
  ctaTitle: string;
  ctaSub: string;
  ctaButton: string;
  faqTitle: string;
  faq: { q: string; a: string }[];
}

export const FEATURES_PAGE: Record<Lang, FeaturesContent> = {
  en: {
    metaTitle: "Subsumio Features — AI knowledge graph for law firms",
    metaDesc:
      "Synthesis with citations, self-wiring knowledge graph, hybrid retrieval, Dream Cycle, MCP integrations. Every claim ships in the product.",
    badge: "Full capability tour",
    h1a: "Everything it does.",
    h1b: "Nothing hidden.",
    sub: "Five capability areas, one engine. Click through — every claim here ships in the product, with deterministic citations you can verify.",
    categories: [
      {
        id: "synthesis",
        icon: "Brain",
        label: "Answers & Synthesis",
        title: "One answer instead of ten documents",
        intro:
          "Most tools stop at retrieval: here are your chunks, good luck. Subsumio reads them for you and writes the answer — and tells you what it couldn't find.",
        items: [
          {
            title: "Synthesized prose answers",
            desc: "Cross-document synthesis over people, companies, deals and ideas — written out, not pasted together.",
          },
          {
            title: "Citations on every claim",
            desc: "Each statement links to its source page. One click to verify before you rely on it.",
          },
          {
            title: "Gap analysis",
            desc: "The answer ends with what the brain does NOT know yet — so silence never masquerades as certainty.",
          },
          {
            title: "Meeting prep mode",
            desc: "Ask about a person before a meeting: last contact, open commitments, what changed since.",
          },
        ],
        demo: {
          windowTitle: "subsumio — ask",
          lines: [
            "$ what's still open in the Bauer matter?",
            "→ 3 open items across 4 documents:",
            "  1. Reply brief to the court (drafted, not filed)",
            "  2. Expert report from Dr. Klein (requested, overdue)",
            "  3. Settlement range to confirm with the client",
            "  ⚠ Gap: no note filed for Thursday's client call",
          ],
        },
      },
      {
        id: "graph",
        icon: "Network",
        label: "Knowledge Graph",
        title: "A graph that wires itself",
        intro:
          "Every page write extracts entities and typed relationships — with zero extra LLM calls. Relationship questions get graph answers, not keyword guesses.",
        items: [
          {
            title: "Typed edges, automatic",
            desc: "invested_in, works_at, founded, attended, advises — extracted on write, no tagging, no data entry.",
          },
          {
            title: "Relational queries",
            desc: "“Who invested in X?” “What connects A and B?” resolve by walking the graph — questions vector search can't answer.",
          },
          {
            title: "Entity enrichment",
            desc: "People and companies accumulate context across every mention; the brain consolidates overnight.",
          },
          {
            title: "Benchmarked recall",
            desc: "97.9% Recall@5 and +31.4 P@5 points over vector-only RAG on a 240-page benchmark corpus.",
          },
        ],
        demo: {
          windowTitle: "subsumio — graph",
          lines: [
            "$ who acts in the Bauer matter?",
            "→ 4 parties via represents / opposing edges:",
            "  Dr. Weber (our counsel, since 2024)",
            "  Hofer GmbH (opposing party) · 2 more",
            "$ what connects Hofer GmbH and Dr. Klein?",
            "→ Hofer GmbH —retained→ Dr. Klein —expert_in→ Bauer matter",
          ],
        },
      },
      {
        id: "retrieval",
        icon: "Search",
        label: "Hybrid Retrieval",
        title: "Finds what single-method search misses",
        intro:
          "Vector similarity, BM25 keyword match and graph traversal — fused with reciprocal rank fusion. Three recall arms, one ranked result.",
        items: [
          {
            title: "Vector + BM25 + graph, fused",
            desc: "Semantic similarity catches paraphrases, keywords catch exact terms, the graph catches relationships. Fusion beats each alone.",
          },
          {
            title: "Three cost modes",
            desc: "conservative, balanced, tokenmax — pick your quality/cost point. Token budgets are enforced, not vibes.",
          },
          {
            title: "Smart caching",
            desc: "Similar queries hit a semantic cache (~50% cost reduction in steady use) — with strict isolation so settings changes never serve stale results.",
          },
          {
            title: "Intent-aware ranking",
            desc: "Relational questions trigger graph recall automatically; lookups stay lean. The engine adapts per query.",
          },
        ],
        demo: {
          windowTitle: "subsumio — search modes",
          lines: [
            "$ subsumio search modes",
            "→ mode: balanced",
            "  cache: on (hit rate 30d: 47%)",
            "  token budget: 12,000 · relational recall: on",
            "$ subsumio search stats --days 30",
            "→ 1,204 queries · 47% cached · avg 9.2k tokens",
          ],
        },
      },
      {
        id: "dream",
        icon: "Zap",
        label: "Dream Cycle",
        title: "Your brain gets smarter while you sleep",
        intro:
          "A 24/7 background agent maintains the brain so it compounds instead of rotting. You wake up to a cleaner, sharper knowledge base every day.",
        items: [
          {
            title: "Deduplication",
            desc: "Duplicate people and company pages are detected and merged — the graph stays canonical.",
          },
          {
            title: "Citation repair",
            desc: "Broken or stale citations are found and re-linked automatically.",
          },
          {
            title: "Contradiction detection",
            desc: "Conflicting facts across documents get flagged with both sources — gold for case files and due diligence.",
          },
          {
            title: "Scheduled jobs",
            desc: "Cron-based ingestion, enrichment and reports. The production deployment runs 66 autonomous jobs.",
          },
        ],
        demo: {
          windowTitle: "subsumio — overnight",
          lines: [
            "03:00 dream cycle started",
            "  merged 3 duplicate person pages",
            "  repaired 12 citations",
            "  flagged 1 contradiction (delivery date: Mar 12 vs 'end of April')",
            "  prepared morning brief: 2 meetings, 4 open items",
            "03:19 done — brain is sharper than yesterday",
          ],
        },
      },
      {
        id: "integrations",
        icon: "GitBranch",
        label: "Integrations",
        title: "Meets your tools where they are",
        intro:
          "Built agent-first: your AI assistant operates the brain directly. Humans get a dashboard; agents get a protocol.",
        items: [
          {
            title: "MCP server",
            desc: "Native Model Context Protocol — Claude Code, Claude Desktop, Cursor and any MCP client query the brain as a tool.",
          },
          {
            title: "Full CLI",
            desc: "Every operation is scriptable. Bulk imports, exports, search, graph queries — automation-ready.",
          },
          {
            title: "Bulk import",
            desc: "Markdown, PDFs, meeting notes, email exports. Years of backlog ingest in one run with live progress.",
          },
          {
            title: "Web dashboard & PWA",
            desc: "Query, graph explorer, upload, settings — installable on iOS, iPadOS and Android as an app.",
          },
        ],
        demo: {
          windowTitle: "claude code — with subsumio",
          lines: [
            "> claude: before I refactor, what do we know about this client's auth requirements?",
            "→ [subsumio MCP] 3 pages found:",
            "  meetings/2026-03-kickoff: SSO mandatory (Okta)",
            "  notes/security-review: no PII in logs",
            "  Your agent now remembers everything that isn't code.",
          ],
        },
      },
    ],
    ctaTitle: "Seen enough?",
    ctaSub: "Up and running in minutes. First answer the same day.",
    ctaButton: "Get started",
    faqTitle: "Questions, answered",
    faq: [
      {
        q: "Do I need to train or fine-tune a model?",
        a: "No. Subsumio uses retrieval-augmented generation with your own knowledge graph. No model training, no fine-tuning — your data stays yours.",
      },
      {
        q: "Can I use it with my existing tools?",
        a: "Yes. Subsumio integrates via MCP (Model Context Protocol), REST API, and a full CLI. It works alongside Claude, Cursor, and any MCP-compatible agent.",
      },
      {
        q: "How accurate are the citations?",
        a: "Every claim in a synthesized answer links directly to its source page. You can verify any statement with one click — no black-box answers.",
      },
      {
        q: "Is my data secure?",
        a: "All data is encrypted at rest and in transit. Self-hosting is available. No data is shared with third parties or used for model training.",
      },
    ],
  },
  de: {
    metaTitle: "Subsumio Features — KI-Wissensgraph für Anwaltskanzleien",
    metaDesc:
      "Synthese mit Zitaten, selbstverdrahtender Wissensgraph, Hybrid-Retrieval, Dream Cycle, MCP-Integrationen. Jede Aussage steckt im Produkt.",
    badge: "Die komplette Capability-Tour",
    h1a: "Alles, was es kann.",
    h1b: "Nichts versteckt.",
    sub: "Fünf Fähigkeits-Bereiche, eine Engine. Klicken Sie sich durch — jede Aussage steckt im Produkt, mit deterministischen Zitaten, die Sie prüfen können.",
    categories: [
      {
        id: "synthesis",
        icon: "Brain",
        label: "Antworten & Synthese",
        title: "Eine Antwort statt zehn Dokumenten",
        intro:
          "Die meisten Tools hören beim Retrieval auf: Hier sind Ihre Chunks, viel Glück. Subsumio liest sie für Sie und schreibt die Antwort — und sagt Ihnen, was es nicht finden konnte.",
        items: [
          {
            title: "Synthetisierte Prosa-Antworten",
            desc: "Dokumentübergreifende Synthese über Personen, Firmen, Deals und Ideen — ausformuliert, nicht zusammengeklebt.",
          },
          {
            title: "Zitate an jeder Behauptung",
            desc: "Jede Aussage verlinkt ihre Quellseite. Ein Klick zur Verifikation, bevor Sie sich darauf verlassen.",
          },
          {
            title: "Gap-Analyse",
            desc: "Die Antwort endet mit dem, was das Brain NICHT weiß — Schweigen tarnt sich nie als Gewissheit.",
          },
          {
            title: "Meeting-Prep-Modus",
            desc: "Fragen Sie vor dem Termin nach einer Person: letzter Kontakt, offene Zusagen, was sich geändert hat.",
          },
        ],
        demo: {
          windowTitle: "subsumio — fragen",
          lines: [
            "$ was ist in der Akte Bauer noch offen?",
            "→ 3 offene Punkte in 4 Dokumenten:",
            "  1. Replik ans Gericht (entworfen, nicht eingebracht)",
            "  2. Gutachten von Dr. Klein (angefordert, überfällig)",
            "  3. Vergleichsrahmen mit Mandant zu bestätigen",
            "  ⚠ Lücke: keine Notiz zum Mandantengespräch Do",
          ],
        },
      },
      {
        id: "graph",
        icon: "Network",
        label: "Wissensgraph",
        title: "Ein Graph, der sich selbst verdrahtet",
        intro:
          "Jeder Seiten-Write extrahiert Entitäten und typisierte Beziehungen — ohne zusätzliche LLM-Calls. Beziehungsfragen bekommen Graph-Antworten, kein Keyword-Raten.",
        items: [
          {
            title: "Typisierte Kanten, automatisch",
            desc: "invested_in, works_at, founded, attended, advises — beim Schreiben extrahiert, ohne Tagging, ohne Datenpflege.",
          },
          {
            title: "Relationale Queries",
            desc: "„Wer hat in X investiert?“ „Was verbindet A und B?“ werden über den Graphen beantwortet — Fragen, an denen Vektorsuche scheitert.",
          },
          {
            title: "Entitäten-Anreicherung",
            desc: "Personen und Firmen sammeln Kontext über jede Erwähnung; das Brain konsolidiert über Nacht.",
          },
          {
            title: "Benchmark-belegt",
            desc: "97,9 % Recall@5 und +31,4 P@5-Punkte gegenüber reinem Vector-RAG auf einem 240-Seiten-Benchmark-Korpus.",
          },
        ],
        demo: {
          windowTitle: "subsumio — graph",
          lines: [
            "$ wer wirkt in der Akte Bauer mit?",
            "→ 4 Beteiligte via vertritt / Gegenseite-Kanten:",
            "  Dr. Weber (unser Anwalt, seit 2024)",
            "  Hofer GmbH (Gegenpartei) · 2 weitere",
            "$ was verbindet Hofer GmbH und Dr. Klein?",
            "→ Hofer GmbH —beauftragt→ Dr. Klein —gutachter_in→ Akte Bauer",
          ],
        },
      },
      {
        id: "retrieval",
        icon: "Search",
        label: "Hybrid-Retrieval",
        title: "Findet, was Einzel-Methoden übersehen",
        intro:
          "Vektor-Ähnlichkeit, BM25-Keyword-Match und Graph-Traversal — fusioniert per Reciprocal Rank Fusion. Drei Recall-Arme, ein Ranking.",
        items: [
          {
            title: "Vector + BM25 + Graph, fusioniert",
            desc: "Semantik fängt Umschreibungen, Keywords fangen exakte Begriffe, der Graph fängt Beziehungen. Die Fusion schlägt jede Methode allein.",
          },
          {
            title: "Drei Kosten-Modi",
            desc: "conservative, balanced, tokenmax — wählen Sie Ihren Qualitäts-/Kostenpunkt. Token-Budgets werden durchgesetzt, kein Bauchgefühl.",
          },
          {
            title: "Intelligentes Caching",
            desc: "Ähnliche Queries treffen einen semantischen Cache (~50 % Kostenersparnis im Dauerbetrieb) — strikt isoliert, damit Einstellungsänderungen nie veraltete Ergebnisse liefern.",
          },
          {
            title: "Intent-bewusstes Ranking",
            desc: "Beziehungsfragen aktivieren Graph-Recall automatisch; einfache Lookups bleiben schlank. Die Engine passt sich pro Query an.",
          },
        ],
        demo: {
          windowTitle: "subsumio — search modes",
          lines: [
            "$ subsumio search modes",
            "→ Modus: balanced",
            "  Cache: an (Hit-Rate 30 Tage: 47 %)",
            "  Token-Budget: 12.000 · relationaler Recall: an",
            "$ subsumio search stats --days 30",
            "→ 1.204 Queries · 47 % gecacht · ø 9,2k Tokens",
          ],
        },
      },
      {
        id: "dream",
        icon: "Zap",
        label: "Dream Cycle",
        title: "Ihr Brain wird schlauer, während Sie schlafen",
        intro:
          "Ein 24/7-Hintergrund-Agent wartet das Brain, damit es sich verzinst statt zu verrotten. Sie wachen jeden Tag mit einer saubereren, schärferen Wissensbasis auf.",
        items: [
          {
            title: "Deduplizierung",
            desc: "Doppelte Personen- und Firmenseiten werden erkannt und gemerged — der Graph bleibt kanonisch.",
          },
          {
            title: "Zitat-Reparatur",
            desc: "Kaputte oder veraltete Zitate werden automatisch gefunden und neu verlinkt.",
          },
          {
            title: "Widerspruchs-Erkennung",
            desc: "Widersprüchliche Fakten über Dokumente hinweg werden mit beiden Quellen markiert — Gold für Akten und Due Diligence.",
          },
          {
            title: "Geplante Jobs",
            desc: "Cron-basierte Ingestion, Anreicherung und Reports. Das Produktions-Deployment fährt 66 autonome Jobs.",
          },
        ],
        demo: {
          windowTitle: "subsumio — über nacht",
          lines: [
            "03:00 Dream Cycle gestartet",
            "  3 doppelte Personenseiten gemerged",
            "  12 Zitate repariert",
            "  1 Widerspruch markiert (Lieferdatum: 12. März vs. „Ende April“)",
            "  Morning Brief vorbereitet: 2 Meetings, 4 offene Punkte",
            "03:19 fertig — das Brain ist schärfer als gestern",
          ],
        },
      },
      {
        id: "integrations",
        icon: "GitBranch",
        label: "Integrationen",
        title: "Holt Ihre Tools dort ab, wo sie sind",
        intro:
          "Agent-first gebaut: Ihr KI-Assistent bedient das Brain direkt. Menschen bekommen ein Dashboard; Agenten bekommen ein Protokoll.",
        items: [
          {
            title: "MCP-Server",
            desc: "Natives Model Context Protocol — Claude Code, Claude Desktop, Cursor und jeder MCP-Client nutzen das Brain als Tool.",
          },
          {
            title: "Vollständige CLI",
            desc: "Jede Operation ist skriptbar. Bulk-Imports, Exports, Suche, Graph-Queries — automatisierungsbereit.",
          },
          {
            title: "Bulk-Import",
            desc: "Markdown, PDFs, Meeting-Notizen, E-Mail-Exporte. Jahre an Backlog in einem Durchlauf, mit Live-Fortschritt.",
          },
          {
            title: "Web-Dashboard & PWA",
            desc: "Query, Graph-Explorer, Upload, Einstellungen — installierbar auf iOS, iPadOS und Android als App.",
          },
        ],
        demo: {
          windowTitle: "claude code — mit subsumio",
          lines: [
            "> claude: bevor ich refactore — was wissen wir über die Auth-Anforderungen dieses Kunden?",
            "→ [subsumio MCP] 3 Seiten gefunden:",
            "  meetings/2026-03-kickoff: SSO Pflicht (Okta)",
            "  notes/security-review: keine PII in Logs",
            "  Ihr Agent erinnert sich jetzt an alles, was nicht Code ist.",
          ],
        },
      },
    ],
    ctaTitle: "Genug gesehen?",
    ctaSub: "In Minuten startklar. Erste Antwort am selben Tag.",
    ctaButton: "Jetzt starten",
    faqTitle: "Fragen, beantwortet",
    faq: [
      {
        q: "Muss ich ein Modell trainieren oder fine-tunen?",
        a: "Nein. Subsumio nutzt Retrieval-augmented Generation mit Ihrem eigenen Wissensgraphen. Kein Modell-Training, kein Fine-Tuning — Ihre Daten bleiben Ihre Daten.",
      },
      {
        q: "Funktioniert es mit meinen bestehenden Tools?",
        a: "Ja. Subsumio integriert sich über MCP (Model Context Protocol), REST-API und eine vollwertige CLI. Es funktioniert alongside Claude, Cursor und jedem MCP-kompatiblen Agent.",
      },
      {
        q: "Wie genau sind die Zitate?",
        a: "Jede Aussage in einer synthetisierten Antwort verlinkt direkt auf ihre Quellseite. Jede Behauptung mit einem Klick verifizierbar — keine Black-Box-Antworten.",
      },
      {
        q: "Sind meine Daten sicher?",
        a: "Alle Daten werden verschlüsselt at-rest und in-transit. Self-Hosting ist verfügbar. Keine Daten werden an Dritte weitergegeben oder für Modell-Training verwendet.",
      },
    ],
  },
};
