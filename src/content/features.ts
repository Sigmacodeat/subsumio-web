import { PROOF } from "./proof-points";
// Features page — every engine capability, explained for buyers.
// Grouped into interactive categories; each has an optional terminal demo.

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

export const FEATURES_PAGE: FeaturesContent = {
  metaTitle: "Subsumio Features — KI-Kanzleisoftware Funktionen für Rechtsanwälte",
  metaDesc:
    "Belegte KI-Antworten mit Fundstellen, selbstverdrahtender Wissensgraph, Hybrid-Retrieval, WhatsApp-Copilot — jede Funktion im Produkt, keine Halluzination.",
  badge: "Alle Funktionen im Überblick",
  h1a: "Jede Funktion im Überblick.",
  h1b: "Jede Aussage belegt.",
  sub: "Fünf Funktionsbereiche, eine Engine. Klick dich durch — jede Aussage steckt im Produkt, mit nachprüfbaren Zitaten an jeder Antwort.",
  categories: [
    {
      id: "synthesis",
      icon: "Brain",
      label: "Antworten & Synthese",
      title: "Eine Antwort statt zehn Dokumenten",
      intro:
        "Die meisten Tools hören beim Retrieval auf: Hier sind deine Chunks, viel Glück. Subsumio liest sie für dich und schreibt die Antwort — und sagt dir, was es nicht finden konnte.",
      items: [
        {
          title: "Synthetisierte Prosa-Antworten",
          desc: "Dokumentübergreifende Synthese über Personen, Firmen, Deals und Ideen — ausformuliert, nicht zusammengeklebt.",
        },
        {
          title: "Zitate an jeder Behauptung",
          desc: "Jede Aussage verlinkt ihre Quellseite. Ein Klick zur Verifikation, bevor du dich darauf verlässt.",
        },
        {
          title: "Gap-Analyse",
          desc: "Die Antwort endet mit dem, was das Brain NICHT weiß — Schweigen tarnt sich nie als Gewissheit.",
        },
        {
          title: "Verhandlungs- und Terminvorbereitung",
          desc: "Frag vor dem Mandantengespräch oder der Verhandlung: letzter Kontakt, offene Zusagen, gefundene Widersprüche, was sich geändert hat. Vorbereitet in die Verhandlung, nicht suchend.",
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
          desc: `${PROOF.recall8.full} — gemessen gegenüber reinem Vector-RAG mit Hybrid-Suche + Graph.`,
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
          desc: "conservative, balanced, tokenmax — wähl deinen Qualitäts-/Kostenpunkt. Token-Budgets werden durchgesetzt, kein Bauchgefühl.",
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
      title: "Dein Brain wird schlauer, während du schläfst",
      intro:
        "Ein 24/7-Hintergrund-Agent wartet das Brain, damit es sich verzinst statt zu verrotten. Du wachst jeden Tag mit einer saubereren, schärferen Wissensbasis auf.",
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
          title: "Automatisierte Nacht-Jobs",
          desc: "Cron-basierte Aufnahme, Anreicherung und Reports. Das Produktions-Deployment fährt 66 autonome Jobs — das Brain ist aktuell, wenn du morgens den Rechner aufmachst.",
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
      title: "Holt deine Tools dort ab, wo sie sind",
      intro:
        "Agent-first gebaut: Dein KI-Assistent, Claude oder Cursor nutzen das Brain direkt per MCP. Menschen bekommen ein Dashboard; Agenten bekommen ein Protokoll. Gleiche Daten, gleiche Zitate, gleiche Isolation.",
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
          "  Dein Agent erinnert sich jetzt an alles, was nicht Code ist.",
        ],
      },
    },
  ],
  ctaTitle: "Bereit, es in deiner Kanzlei zu sehen?",
  ctaSub: "In Minuten startklar. Erste belegte Antwort am selben Tag.",
  ctaButton: "14 Tage kostenlos testen",
  faqTitle: "Fragen, beantwortet",
  faq: [
    {
      q: "Muss ich ein Modell trainieren oder fine-tunen?",
      a: "Nein. Subsumio nutzt Retrieval-augmented Generation mit deinem eigenen Wissensgraphen. Kein Modell-Training, kein Fine-Tuning — deine Daten bleiben deine Daten.",
    },
    {
      q: "Funktioniert es mit meinen bestehenden Tools?",
      a: "Ja. Subsumio integriert sich über MCP (Model Context Protocol), REST-API und eine vollwertige CLI. Es arbeitet zusammen mit Claude, Cursor und jedem MCP-kompatiblen Agent.",
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
};
