// Features page — every engine capability, explained for buyers. EN + DE.
// Grouped into interactive categories; each has an optional terminal demo.

import { type Lang, applyReplacements } from "./site";

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

const _deFeatures: FeaturesContent = {
  metaTitle: "Subsumio Features — KI-Kanzleisoftware Funktionen für Rechtsanwälte",
  metaDesc:
    "Belegte KI-Antworten mit Fundstellen, selbstverdrahtender Wissensgraph, Hybrid-Retrieval, WhatsApp-Copilot — jede Funktion im Produkt, keine Halluzination.",
  badge: "Alle Funktionen im Überblick",
  h1a: "Alles, was es kann.",
  h1b: "Nichts versteckt.",
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
  ctaButton: "Demo anfragen",
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

const _enFeatures: FeaturesContent = {
  metaTitle: "Subsumio Features — AI legal software capabilities for law firms",
  metaDesc:
    "Cited AI answers, self-wiring knowledge graph, hybrid retrieval, WhatsApp copilot — every capability in the product, no hallucinations.",
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
          title: "Hearing & meeting prep",
          desc: "Ask before a client call or hearing: last contact, open commitments, contradictions found, what changed since. Walk in briefed, not hunting.",
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
          title: "Automated overnight jobs",
          desc: "Cron-based ingestion, enrichment and reports. The production deployment runs 66 autonomous jobs — the brain is always current when you sit down in the morning.",
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
        "Built agent-first: your AI assistant, Claude or Cursor operates the brain directly via MCP. Humans get a dashboard; agents get a protocol. Same data, same citations, same isolation rules.",
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
  ctaTitle: "Ready to see it in your firm?",
  ctaSub: "Up and running in minutes. First cited answer the same day.",
  ctaButton: "Request a demo",
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
};

export const FEATURES_PAGE: Record<Lang, FeaturesContent> = {
  en: _enFeatures,
  de: _deFeatures,
  at: _deFeatures,
  ch: _deFeatures,
  it: applyReplacements(JSON.parse(JSON.stringify(_enFeatures)), {
    "Subsumio Features — AI legal software capabilities for law firms":
      "Funzioni Subsumio — capacità del software legale AI per studi legali",
    "Cited AI answers, self-wiring knowledge graph, hybrid retrieval, WhatsApp copilot — every capability in the product, no hallucinations.":
      "Risposte AI citate, knowledge graph auto-configurantesi, retrieval ibrido, copilot WhatsApp — ogni capacità nel prodotto, nessuna allucinazione.",
    "Full capability tour": "Tour completo delle funzioni",
    "Everything it does.": "Tutto ciò che fa.",
    "Nothing hidden.": "Niente di nascosto.",
    "Five capability areas, one engine. Click through — every claim here ships in the product, with deterministic citations you can verify.":
      "Cinque aree di funzionalità, un motore. Clicca — ogni affermazione qui è nel prodotto, con citazioni deterministiche verificabili.",
    "Answers & Synthesis": "Risposte & Sintesi",
    "Knowledge Graph": "Knowledge Graph",
    "Hybrid Retrieval": "Retrieval Ibrido",
    "Dream Cycle": "Ciclo Dream",
    Integrations: "Integrazioni",
    "Ready to see it in your firm?": "Pronto a vederlo nel tuo studio?",
    "Up and running in minutes. First cited answer the same day.":
      "Operativo in minuti. Prima risposta citata lo stesso giorno.",
    "Request a demo": "Richiedi una demo",
    "Questions, answered": "Domande, risposte",
    // Category titles
    "One answer instead of ten documents": "Una risposta invece di dieci documenti",
    "A graph that wires itself": "Un grafo che si cabla da solo",
    "Finds what single-method search misses": "Trova ciò che la ricerca a metodo singolo perde",
    "Your brain gets smarter while you sleep": "Il tuo brain diventa più intelligente mentre dormi",
    "Meets your tools where they are": "Incontra i tuoi strumenti dove sono",
    // Category intros
    "Most tools stop at retrieval: here are your chunks, good luck. Subsumio reads them for you and writes the answer — and tells you what it couldn't find.":
      "La maggior parte degli strumenti si ferma al retrieval: ecco i tuoi chunk, buona fortuna. Subsumio li legge per te e scrive la risposta — e ti dice cosa non ha trovato.",
    "Every page write extracts entities and typed relationships — with zero extra LLM calls. Relationship questions get graph answers, not keyword guesses.":
      "Ogni scrittura di pagina estrae entità e relazioni tipizzate — senza chiamate LLM aggiuntive. Le domande relazionali ottengono risposte dal grafo, non ipotesi da keyword.",
    "Vector similarity, BM25 keyword match and graph traversal — fused with reciprocal rank fusion. Three recall arms, one ranked result.":
      "Similarità vettoriale, match BM25 e attraversamento del grafo — fusi con reciprocal rank fusion. Tre braccia di recall, un risultato classificato.",
    "A 24/7 background agent maintains the brain so it compounds instead of rotting. You wake up to a cleaner, sharper knowledge base every day.":
      "Un agente in background 24/7 mantiene il brain così si compone invece di degradarsi. Ti svegli ogni giorno con una knowledge base più pulita e affilata.",
    "Built agent-first: your AI assistant, Claude or Cursor operates the brain directly via MCP. Humans get a dashboard; agents get a protocol. Same data, same citations, same isolation rules.":
      "Costruito agent-first: il tuo assistente AI, Claude o Cursor opera il brain direttamente via MCP. Gli umani ottengono una dashboard; gli agenti un protocollo. Stessi dati, stessi citati, stesse regole di isolamento.",
    // Item titles — synthesis
    "Synthesized prose answers": "Risposte in prosa sintetizzate",
    "Citations on every claim": "Citazioni su ogni affermazione",
    "Gap analysis": "Analisi delle lacune",
    "Hearing & meeting prep": "Preparazione udienza & riunione",
    // Item titles — graph
    "Typed edges, automatic": "Archi tipizzati, automatici",
    "Relational queries": "Query relazionali",
    "Entity enrichment": "Arricchimento entità",
    "Benchmarked recall": "Recall misurato",
    // Item titles — retrieval
    "Vector + BM25 + graph, fused": "Vettoriale + BM25 + grafo, fuso",
    "Three cost modes": "Tre modalità di costo",
    "Smart caching": "Caching intelligente",
    "Intent-aware ranking": "Ranking consapevole dell'intento",
    // Item titles — dream
    Deduplication: "Deduplicazione",
    "Citation repair": "Riparazione citazioni",
    "Contradiction detection": "Rilevamento contraddizioni",
    "Automated overnight jobs": "Job notturni automatizzati",
    // Item titles — integrations
    "MCP server": "Server MCP",
    "Full CLI": "CLI completa",
    "Bulk import": "Import massivo",
    "Web dashboard & PWA": "Dashboard web & PWA",
    // Item descriptions — synthesis
    "Cross-document synthesis over people, companies, deals and ideas — written out, not pasted together.":
      "Sintesi cross-documento su persone, aziende, deal e idee — scritta, non incollata insieme.",
    "Each statement links to its source page. One click to verify before you rely on it.":
      "Ogni affermazione linka alla sua pagina di origine. Un clic per verificare prima di affidartene.",
    "The answer ends with what the brain does NOT know yet — so silence never masquerades as certainty.":
      "La risposta termina con ciò che il brain NON sa ancora — così il silenzio non si maschera mai da certezza.",
    "Ask before a client call or hearing: last contact, open commitments, contradictions found, what changed since. Walk in briefed, not hunting.":
      "Chiedi prima di una chiamata cliente o udienza: ultimo contatto, impegni aperti, contraddizioni trovate, cosa è cambiato. Entra preparato, non cercando.",
    // Item descriptions — graph
    "invested_in, works_at, founded, attended, advises — extracted on write, no tagging, no data entry.":
      "invested_in, works_at, founded, attended, advises — estratti alla scrittura, senza tagging, senza inserimento dati.",
    [`"Who invested in X?" "What connects A and B?" resolve by walking the graph — questions vector search can't answer.`]: `"Chi ha investito in X?" "Cosa collega A e B?" si risolvono camminando il grafo — domande che la ricerca vettoriale non può rispondere.`,
    "People and companies accumulate context across every mention; the brain consolidates overnight.":
      "Persone e aziende accumulano contesto da ogni menzione; il brain consolida durante la notte.",
    "97.9% Recall@5 and +31.4 P@5 points over vector-only RAG on a 240-page benchmark corpus.":
      "97,9% Recall@5 e +31,4 punti P@5 rispetto a RAG solo vettoriale su un corpus di benchmark di 240 pagine.",
    // Item descriptions — retrieval
    "Semantic similarity catches paraphrases, keywords catch exact terms, the graph catches relationships. Fusion beats each alone.":
      "La similarità semantica cattura parafrasi, le keyword catturano termini esatti, il grafo cattura relazioni. La fusione batte ciascuno da solo.",
    "conservative, balanced, tokenmax — pick your quality/cost point. Token budgets are enforced, not vibes.":
      "conservative, balanced, tokenmax — scegli il tuo punto qualità/costo. I budget di token sono applicati, non impressioni.",
    "Similar queries hit a semantic cache (~50% cost reduction in steady use) — with strict isolation so settings changes never serve stale results.":
      "Query simili colpiscono una cache semantica (~50% riduzione costi in uso continuo) — con isolamento rigoroso così le modifiche non servono mai risultati stale.",
    "Relational questions trigger graph recall automatically; lookups stay lean. The engine adapts per query.":
      "Le domande relazionali attivano il recall del grafo automaticamente; i lookup restano snelli. L'engine si adatta per query.",
    // Item descriptions — dream
    "Duplicate people and company pages are detected and merged — the graph stays canonical.":
      "Pagine duplicate di persone e aziende vengono rilevate e unite — il grafo resta canonico.",
    "Broken or stale citations are found and re-linked automatically.":
      "Citazioni rotte o stale vengono trovate e ri-linkate automaticamente.",
    "Conflicting facts across documents get flagged with both sources — gold for case files and due diligence.":
      "Fatti conflittuali tra documenti vengono segnalati con entrambe le fonti — oro per fascicoli e due diligence.",
    "Cron-based ingestion, enrichment and reports. The production deployment runs 66 autonomous jobs — the brain is always current when you sit down in the morning.":
      "Ingestion, arricchimento e report basati su cron. Il deployment di produzione esegue 66 job autonomi — il brain è sempre aggiornato quando ti siedi al mattino.",
    // Item descriptions — integrations
    "Native Model Context Protocol — Claude Code, Claude Desktop, Cursor and any MCP client query the brain as a tool.":
      "Model Context Protocol nativo — Claude Code, Claude Desktop, Cursor e qualsiasi client MCP interrogano il brain come strumento.",
    "Every operation is scriptable. Bulk imports, exports, search, graph queries — automation-ready.":
      "Ogni operazione è scriptabile. Import massivi, export, ricerca, query del grafo — pronti per l'automazione.",
    "Markdown, PDFs, meeting notes, email exports. Years of backlog ingest in one run with live progress.":
      "Markdown, PDF, note di riunioni, export email. Anni di backlog in un'unica esecuzione con progresso live.",
    "Query, graph explorer, upload, settings — installable on iOS, iPadOS and Android as an app.":
      "Query, esploratore grafo, upload, impostazioni — installabile su iOS, iPadOS e Android come app.",
    // FAQ
    "Do I need to train or fine-tune a model?": "Devo allenare o fare fine-tuning di un modello?",
    "No. Subsumio uses retrieval-augmented generation with your own knowledge graph. No model training, no fine-tuning — your data stays yours.":
      "No. Subsumio usa retrieval-augmented generation con il tuo knowledge graph. Nessun training, nessun fine-tuning — i tuoi dati restano tuoi.",
    "Can I use it with my existing tools?": "Posso usarlo con i miei strumenti esistenti?",
    "Yes. Subsumio integrates via MCP (Model Context Protocol), REST API, and a full CLI. It works alongside Claude, Cursor, and any MCP-compatible agent.":
      "Sì. Subsumio si integra via MCP (Model Context Protocol), REST API e CLI completa. Funziona insieme a Claude, Cursor e qualsiasi agente compatibile MCP.",
    "How accurate are the citations?": "Quanto sono accurate le citazioni?",
    "Every claim in a synthesized answer links directly to its source page. You can verify any statement with one click — no black-box answers.":
      "Ogni affermazione in una risposta sintetizzata linka direttamente alla sua pagina di origine. Puoi verificare qualsiasi statement con un clic — nessuna risposta black-box.",
    "Is my data secure?": "I miei dati sono sicuri?",
    "All data is encrypted at rest and in transit. Self-hosting is available. No data is shared with third parties or used for model training.":
      "Tutti i dati sono cifrati at-rest e in-transit. Il self-hosting è disponibile. Nessun dato è condiviso con terzi o usato per il training dei modelli.",
  }),
  es: applyReplacements(JSON.parse(JSON.stringify(_enFeatures)), {
    "Subsumio Features — AI legal software capabilities for law firms":
      "Funciones Subsumio — capacidades de software legal IA para bufetes",
    "Cited AI answers, self-wiring knowledge graph, hybrid retrieval, WhatsApp copilot — every capability in the product, no hallucinations.":
      "Respuestas IA citadas, knowledge graph auto-configurable, retrieval híbrido, copilot WhatsApp — cada capacidad en el producto, sin alucinaciones.",
    "Full capability tour": "Tour completo de funciones",
    "Everything it does.": "Todo lo que hace.",
    "Nothing hidden.": "Nada oculto.",
    "Five capability areas, one engine. Click through — every claim here ships in the product, with deterministic citations you can verify.":
      "Cinco áreas de funcionalidad, un motor. Haz clic — cada afirmación aquí está en el producto, con citas determinísticas verificables.",
    "Answers & Synthesis": "Respuestas & Síntesis",
    "Knowledge Graph": "Knowledge Graph",
    "Hybrid Retrieval": "Retrieval Híbrido",
    "Dream Cycle": "Ciclo Dream",
    Integrations: "Integraciones",
    "Ready to see it in your firm?": "¿Listo para verlo en tu bufete?",
    "Up and running in minutes. First cited answer the same day.":
      "Operativo en minutos. Primera respuesta citada el mismo día.",
    "Request a demo": "Solicitar una demo",
    "Questions, answered": "Preguntas, respondidas",
    // Category titles
    "One answer instead of ten documents": "Una respuesta en vez de diez documentos",
    "A graph that wires itself": "Un grafo que se cablea solo",
    "Finds what single-method search misses": "Encuentra lo que la búsqueda de método único pierde",
    "Your brain gets smarter while you sleep":
      "Tu brain se vuelve más inteligente mientras duermes",
    "Meets your tools where they are": "Encuentra tus herramientas donde están",
    // Category intros
    "Most tools stop at retrieval: here are your chunks, good luck. Subsumio reads them for you and writes the answer — and tells you what it couldn't find.":
      "La mayoría de herramientas se detienen en el retrieval: aquí están tus chunks, buena suerte. Subsumio los lee por ti y escribe la respuesta — y te dice lo que no pudo encontrar.",
    "Every page write extracts entities and typed relationships — with zero extra LLM calls. Relationship questions get graph answers, not keyword guesses.":
      "Cada escritura de página extrae entidades y relaciones tipadas — sin llamadas LLM adicionales. Las preguntas relacionales obtienen respuestas del grafo, no conjeturas de keywords.",
    "Vector similarity, BM25 keyword match and graph traversal — fused with reciprocal rank fusion. Three recall arms, one ranked result.":
      "Similitud vectorial, match BM25 y recorrido del grafo — fusionados con reciprocal rank fusion. Tres brazos de recall, un resultado clasificado.",
    "A 24/7 background agent maintains the brain so it compounds instead of rotting. You wake up to a cleaner, sharper knowledge base every day.":
      "Un agente en background 24/7 mantiene el brain para que se compile en lugar de degradarse. Te despiertas cada día con una base de conocimiento más limpia y afilada.",
    "Built agent-first: your AI assistant, Claude or Cursor operates the brain directly via MCP. Humans get a dashboard; agents get a protocol. Same data, same citations, same isolation rules.":
      "Construido agent-first: tu asistente IA, Claude o Cursor opera el brain directamente vía MCP. Los humanos obtienen un dashboard; los agentes un protocolo. Mismos datos, mismas citas, mismas reglas de aislamiento.",
    // Item titles — synthesis
    "Synthesized prose answers": "Respuestas en prosa sintetizadas",
    "Citations on every claim": "Citas en cada afirmación",
    "Gap analysis": "Análisis de lagunas",
    "Hearing & meeting prep": "Preparación de audiencia y reunión",
    // Item titles — graph
    "Typed edges, automatic": "Aristas tipadas, automáticas",
    "Relational queries": "Consultas relacionales",
    "Entity enrichment": "Enriquecimiento de entidades",
    "Benchmarked recall": "Recall medido",
    // Item titles — retrieval
    "Vector + BM25 + graph, fused": "Vectorial + BM25 + grafo, fusionado",
    "Three cost modes": "Tres modos de costo",
    "Smart caching": "Caching inteligente",
    "Intent-aware ranking": "Ranking consciente del intent",
    // Item titles — dream
    Deduplication: "Deduplicación",
    "Citation repair": "Reparación de citas",
    "Contradiction detection": "Detección de contradicciones",
    "Automated overnight jobs": "Jobs nocturnos automatizados",
    // Item titles — integrations
    "MCP server": "Servidor MCP",
    "Full CLI": "CLI completa",
    "Bulk import": "Import masivo",
    "Web dashboard & PWA": "Dashboard web y PWA",
    // Item descriptions — synthesis
    "Cross-document synthesis over people, companies, deals and ideas — written out, not pasted together.":
      "Síntesis cross-documento sobre personas, empresas, deals e ideas — escrita, no pegada.",
    "Each statement links to its source page. One click to verify before you rely on it.":
      "Cada afirmación enlaza a su página de origen. Un clic para verificar antes de confiar en ella.",
    "The answer ends with what the brain does NOT know yet — so silence never masquerades as certainty.":
      "La respuesta termina con lo que el brain NO sabe aún — así el silencio nunca se disfraza de certeza.",
    "Ask before a client call or hearing: last contact, open commitments, contradictions found, what changed since. Walk in briefed, not hunting.":
      "Pregunta antes de una llamada o audiencia: último contacto, compromisos abiertos, contradicciones encontradas, qué cambió. Entra preparado, no buscando.",
    // Item descriptions — graph
    "invested_in, works_at, founded, attended, advises — extracted on write, no tagging, no data entry.":
      "invested_in, works_at, founded, attended, advises — extraídos al escribir, sin tagging, sin entrada de datos.",
    [`"Who invested in X?" "What connects A and B?" resolve by walking the graph — questions vector search can't answer.`]: `"¿Quién invirtió en X?" "¿Qué conecta A y B?" se resuelven caminando el grafo — preguntas que la búsqueda vectorial no puede responder.`,
    "People and companies accumulate context across every mention; the brain consolidates overnight.":
      "Personas y empresas acumulan contexto en cada mención; el brain consolida durante la noche.",
    "97.9% Recall@5 and +31.4 P@5 points over vector-only RAG on a 240-page benchmark corpus.":
      "97,9% Recall@5 y +31,4 puntos P@5 sobre RAG solo vectorial en un corpus de benchmark de 240 páginas.",
    // Item descriptions — retrieval
    "Semantic similarity catches paraphrases, keywords catch exact terms, the graph catches relationships. Fusion beats each alone.":
      "La similitud semántica captura paráfrasis, las keywords capturan términos exactos, el grafo captura relaciones. La fusión supera a cada uno por separado.",
    "conservative, balanced, tokenmax — pick your quality/cost point. Token budgets are enforced, not vibes.":
      "conservative, balanced, tokenmax — elige tu punto calidad/costo. Los presupuestos de tokens se aplican, no impresiones.",
    "Similar queries hit a semantic cache (~50% cost reduction in steady use) — with strict isolation so settings changes never serve stale results.":
      "Consultas similares golpean una caché semántica (~50% reducción de costos en uso continuo) — con aislamiento estricto para que los cambios nunca sirvan resultados stale.",
    "Relational questions trigger graph recall automatically; lookups stay lean. The engine adapts per query.":
      "Las preguntas relacionales activan el recall del grafo automáticamente; los lookup se mantienen ágiles. El engine se adapta por consulta.",
    // Item descriptions — dream
    "Duplicate people and company pages are detected and merged — the graph stays canonical.":
      "Páginas duplicadas de personas y empresas se detectan y fusionan — el grafo se mantiene canónico.",
    "Broken or stale citations are found and re-linked automatically.":
      "Citas rotas o stale se encuentran y re-enlazan automáticamente.",
    "Conflicting facts across documents get flagged with both sources — gold for case files and due diligence.":
      "Hechos conflictivos entre documentos se marcan con ambas fuentes — oro para expedientes y due diligence.",
    "Cron-based ingestion, enrichment and reports. The production deployment runs 66 autonomous jobs — the brain is always current when you sit down in the morning.":
      "Ingestion, enriquecimiento e informes basados en cron. El deployment de producción ejecuta 66 jobs autónomos — el brain siempre está actualizado cuando te sientas por la mañana.",
    // Item descriptions — integrations
    "Native Model Context Protocol — Claude Code, Claude Desktop, Cursor and any MCP client query the brain as a tool.":
      "Model Context Protocol nativo — Claude Code, Claude Desktop, Cursor y cualquier cliente MCP consultan el brain como herramienta.",
    "Every operation is scriptable. Bulk imports, exports, search, graph queries — automation-ready.":
      "Cada operación es scriptable. Imports masivos, exports, búsqueda, consultas de grafo — listos para automatización.",
    "Markdown, PDFs, meeting notes, email exports. Years of backlog ingest in one run with live progress.":
      "Markdown, PDFs, notas de reuniones, exports de email. Años de backlog en una ejecución con progreso en vivo.",
    "Query, graph explorer, upload, settings — installable on iOS, iPadOS and Android as an app.":
      "Consulta, explorador de grafo, upload, ajustes — instalable en iOS, iPadOS y Android como app.",
    // FAQ
    "Do I need to train or fine-tune a model?":
      "¿Necesito entrenar o hacer fine-tuning de un modelo?",
    "No. Subsumio uses retrieval-augmented generation with your own knowledge graph. No model training, no fine-tuning — your data stays yours.":
      "No. Subsumio usa retrieval-augmented generation con tu propio knowledge graph. Sin entrenamiento, sin fine-tuning — tus datos siguen siendo tuyos.",
    "Can I use it with my existing tools?": "¿Puedo usarlo con mis herramientas existentes?",
    "Yes. Subsumio integrates via MCP (Model Context Protocol), REST API, and a full CLI. It works alongside Claude, Cursor, and any MCP-compatible agent.":
      "Sí. Subsumio se integra vía MCP (Model Context Protocol), REST API y CLI completa. Funciona junto a Claude, Cursor y cualquier agente compatible con MCP.",
    "How accurate are the citations?": "¿Qué tan precisas son las citas?",
    "Every claim in a synthesized answer links directly to its source page. You can verify any statement with one click — no black-box answers.":
      "Cada afirmación en una respuesta sintetizada enlaza directamente a su página de origen. Puedes verificar cualquier statement con un clic — sin respuestas black-box.",
    "Is my data secure?": "¿Mis datos están seguros?",
    "All data is encrypted at rest and in transit. Self-hosting is available. No data is shared with third parties or used for model training.":
      "Todos los datos se cifran en reposo y en tránsito. Self-hosting disponible. Ningún dato se comparte con terceros ni se usa para entrenamiento de modelos.",
  }),
  pl: applyReplacements(JSON.parse(JSON.stringify(_enFeatures)), {
    "Subsumio Features — AI legal software capabilities for law firms":
      "Funkcje Subsumio — możliwości oprogramowania prawnego AI dla kancelarii",
    "Cited AI answers, self-wiring knowledge graph, hybrid retrieval, WhatsApp copilot — every capability in the product, no hallucinations.":
      "Odpowiedzi AI z cytatami, samokonfigurujący graf wiedzy, retrieval hybrydowy, copilot WhatsApp — każda funkcja w produkcie, bez halucynacji.",
    "Full capability tour": "Pełny przegląd funkcji",
    "Everything it does.": "Wszystko, co robi.",
    "Nothing hidden.": "Nic ukrytego.",
    "Five capability areas, one engine. Click through — every claim here ships in the product, with deterministic citations you can verify.":
      "Pięć obszarów funkcjonalności, jeden silnik. Kliknij — każda deklaracja tutaj jest w produkcie, z deterministycznymi cytatami do weryfikacji.",
    "Answers & Synthesis": "Odpowiedzi & Synteza",
    "Knowledge Graph": "Graf Wiedzy",
    "Hybrid Retrieval": "Retrieval Hybrydowy",
    "Dream Cycle": "Cykl Dream",
    Integrations: "Integracje",
    "Ready to see it in your firm?": "Gotowy, by zobaczyć to w swojej kancelarii?",
    "Up and running in minutes. First cited answer the same day.":
      "Działa w kilka minut. Pierwsza odpowiedź z cytatem tego samego dnia.",
    "Request a demo": "Zamów demo",
    "Questions, answered": "Pytania, odpowiedziane",
    // Category titles
    "One answer instead of ten documents": "Jedna odpowiedź zamiast dziesięciu dokumentów",
    "A graph that wires itself": "Graf, który się sam kableluje",
    "Finds what single-method search misses": "Znajduje to, czego wyszukiwanie jedną metodą pomija",
    "Your brain gets smarter while you sleep": "Twój brain staje się mądrzejszy, gdy śpisz",
    "Meets your tools where they are": "Spotyka Twoje narzędzia tam, gdzie są",
    // Category intros
    "Most tools stop at retrieval: here are your chunks, good luck. Subsumio reads them for you and writes the answer — and tells you what it couldn't find.":
      "Większość narzędzi zatrzymuje się na retrieval: oto Twoje chunki, powodzenia. Subsumio czyta je za Ciebie i pisze odpowiedź — i mówi Ci, czego nie znalazło.",
    "Every page write extracts entities and typed relationships — with zero extra LLM calls. Relationship questions get graph answers, not keyword guesses.":
      "Każdy zapis strony ekstrahuje encje i typizowane relacje — bez dodatkowych wywołań LLM. Pytania relacyjne otrzymują odpowiedzi z grafu, nie zgadywanie keywordów.",
    "Vector similarity, BM25 keyword match and graph traversal — fused with reciprocal rank fusion. Three recall arms, one ranked result.":
      "Podobieństwo wektorowe, match BM25 i traversowanie grafu — połączone reciprocal rank fusion. Trzy ramiona recall, jeden rankowany wynik.",
    "A 24/7 background agent maintains the brain so it compounds instead of rotting. You wake up to a cleaner, sharper knowledge base every day.":
      "Agent w tle 24/7 utrzymuje brain, aby się rozwijał zamiast degradował. Budzisz się każdego dnia z czystszą, ostrzejszą bazą wiedzy.",
    "Built agent-first: your AI assistant, Claude or Cursor operates the brain directly via MCP. Humans get a dashboard; agents get a protocol. Same data, same citations, same isolation rules.":
      "Zbudowany agent-first: Twój asystent AI, Claude lub Cursor operuje brain bezpośrednio przez MCP. Ludzie otrzymują dashboard; agenci protokół. Te same dane, te same cytaty, te same reguły izolacji.",
    // Item titles — synthesis
    "Synthesized prose answers": "Syntetyzowane odpowiedzi prozą",
    "Citations on every claim": "Cytaty przy każdej tezie",
    "Gap analysis": "Analiza luk",
    "Hearing & meeting prep": "Przygotowanie do rozprawy i spotkania",
    // Item titles — graph
    "Typed edges, automatic": "Typizowane krawędzie, automatyczne",
    "Relational queries": "Zapytania relacyjne",
    "Entity enrichment": "Wzbogacanie encji",
    "Benchmarked recall": "Recall zmierzony",
    // Item titles — retrieval
    "Vector + BM25 + graph, fused": "Wektorowy + BM25 + graf, połączone",
    "Three cost modes": "Trzy tryby kosztów",
    "Smart caching": "Inteligentne cachowanie",
    "Intent-aware ranking": "Ranking świadomy intencji",
    // Item titles — dream
    Deduplication: "Deduplikacja",
    "Citation repair": "Naprawa cytatów",
    "Contradiction detection": "Wykrywanie sprzeczności",
    "Automated overnight jobs": "Zautomatyzowane joby nocne",
    // Item titles — integrations
    "MCP server": "Serwer MCP",
    "Full CLI": "Pełna CLI",
    "Bulk import": "Import masowy",
    "Web dashboard & PWA": "Dashboard web i PWA",
    // Item descriptions — synthesis
    "Cross-document synthesis over people, companies, deals and ideas — written out, not pasted together.":
      "Synteza cross-document nad osobami, firmami, transakcjami i ideami — napisana, nie sklejona.",
    "Each statement links to its source page. One click to verify before you rely on it.":
      "Każda teza linkuje do swojej strony źródłowej. Jeden klik do weryfikacji, zanim na niej polegasz.",
    "The answer ends with what the brain does NOT know yet — so silence never masquerades as certainty.":
      "Odpowiedź kończy się tym, czego brain JESZCZE NIE wie — więc cisza nigdy nie udaje pewności.",
    "Ask before a client call or hearing: last contact, open commitments, contradictions found, what changed since. Walk in briefed, not hunting.":
      "Zapytaj przed rozmową z klientem lub rozprawą: ostatni kontakt, otwarte zobowiązania, znalezione sprzeczności, co się zmieniło. Wejdź przygotowany, nie szukając.",
    // Item descriptions — graph
    "invested_in, works_at, founded, attended, advises — extracted on write, no tagging, no data entry.":
      "invested_in, works_at, founded, attended, advises — ekstrahowane przy zapisie, bez tagowania, bez wpisywania danych.",
    [`"Who invested in X?" "What connects A and B?" resolve by walking the graph — questions vector search can't answer.`]: `"Kto zainwestował w X?" "Co łączy A i B?" rozwiązuje się przechodząc po grafie — pytania, na które wyszukiwanie wektorowe nie może odpowiedzieć.`,
    "People and companies accumulate context across every mention; the brain consolidates overnight.":
      "Osoby i firmy akumulują kontekst z każdej wzmianki; brain konsoliduje przez noc.",
    "97.9% Recall@5 and +31.4 P@5 points over vector-only RAG on a 240-page benchmark corpus.":
      "97,9% Recall@5 i +31,4 punktów P@5 nad RAG tylko wektorowym na korpusie benchmarkowym 240 stron.",
    // Item descriptions — retrieval
    "Semantic similarity catches paraphrases, keywords catch exact terms, the graph catches relationships. Fusion beats each alone.":
      "Podobieństwo semantyczne łapie parafrazy, keywordy łapią dokładne terminy, graf łapie relacje. Fuzja bije każdą z osobna.",
    "conservative, balanced, tokenmax — pick your quality/cost point. Token budgets are enforced, not vibes.":
      "conservative, balanced, tokenmax — wybierz swój punkt jakość/koszt. Budżety tokenów są egzekwowane, nie przeczucia.",
    "Similar queries hit a semantic cache (~50% cost reduction in steady use) — with strict isolation so settings changes never serve stale results.":
      "Podobne zapytania trafiają w cache semantyczny (~50% redukcja kosztów w ciągłym użyciu) — z ścisłą izolacją, żeby zmiany ustawień nigdy nie serwowały starych wyników.",
    "Relational questions trigger graph recall automatically; lookups stay lean. The engine adapts per query.":
      "Pytania relacyjne automatycznie uruchamiają recall grafu; lookupy zostają szczupłe. Engine dostosowuje się per zapytanie.",
    // Item descriptions — dream
    "Duplicate people and company pages are detected and merged — the graph stays canonical.":
      "Duplikaty stron osób i firm są wykrywane i scalane — graf zostaje kanoniczny.",
    "Broken or stale citations are found and re-linked automatically.":
      "Zepsute lub stare cytaty są znajdowane i re-linkowane automatycznie.",
    "Conflicting facts across documents get flagged with both sources — gold for case files and due diligence.":
      "Sprzeczne fakty między dokumentami są flagowane z oboma źródłami — złoto dla akt i due diligence.",
    "Cron-based ingestion, enrichment and reports. The production deployment runs 66 autonomous jobs — the brain is always current when you sit down in the morning.":
      "Ingestion, wzbogacanie i raporty oparte na cron. Deployment produkcyjny uruchamia 66 autonomicznych jobów — brain jest zawsze aktualny, gdy siadasz rano.",
    // Item descriptions — integrations
    "Native Model Context Protocol — Claude Code, Claude Desktop, Cursor and any MCP client query the brain as a tool.":
      "Natywny Model Context Protocol — Claude Code, Claude Desktop, Cursor i każdy klient MCP odpytują brain jako narzędzie.",
    "Every operation is scriptable. Bulk imports, exports, search, graph queries — automation-ready.":
      "Każda operacja jest skryptowalna. Importy masowe, exporty, wyszukiwanie, zapytania grafu — gotowe do automatyzacji.",
    "Markdown, PDFs, meeting notes, email exports. Years of backlog ingest in one run with live progress.":
      "Markdown, PDFy, notatki ze spotkań, exporty email. Lata backlogu w jednym przebiegu z postępem na żywo.",
    "Query, graph explorer, upload, settings — installable on iOS, iPadOS and Android as an app.":
      "Zapytania, eksplorator grafu, upload, ustawienia — instalowalne na iOS, iPadOS i Android jako app.",
    // FAQ
    "Do I need to train or fine-tune a model?": "Czy muszę trenować lub fine-tunować model?",
    "No. Subsumio uses retrieval-augmented generation with your own knowledge graph. No model training, no fine-tuning — your data stays yours.":
      "Nie. Subsumio używa retrieval-augmented generation z Twoim własnym grafem wiedzy. Bez treningu modelu, bez fine-tuningu — Twoje dane zostają Twoje.",
    "Can I use it with my existing tools?":
      "Czy mogę używać tego z moimi istniejącymi narzędziami?",
    "Yes. Subsumio integrates via MCP (Model Context Protocol), REST API, and a full CLI. It works alongside Claude, Cursor, and any MCP-compatible agent.":
      "Tak. Subsumio integruje się przez MCP (Model Context Protocol), REST API i pełną CLI. Działa razem z Claude, Cursor i każdym agentem kompatybilnym z MCP.",
    "How accurate are the citations?": "Jak dokładne są cytaty?",
    "Every claim in a synthesized answer links directly to its source page. You can verify any statement with one click — no black-box answers.":
      "Każda teza w syntetyzowanej odpowiedzi linkuje bezpośrednio do swojej strony źródłowej. Możesz zweryfikować każdy statement jednym kliknięciem — bez odpowiedzi black-box.",
    "Is my data secure?": "Czy moje dane są bezpieczne?",
    "All data is encrypted at rest and in transit. Self-hosting is available. No data is shared with third parties or used for model training.":
      "Wszystkie dane są szyfrowane at-rest i in-transit. Self-hosting jest dostępny. Żadne dane nie są udostępniane stronom trzecim ani używane do treningu modeli.",
  }),
  fr: applyReplacements(JSON.parse(JSON.stringify(_enFeatures)), {
    "Subsumio Features — AI legal software capabilities for law firms":
      "Fonctionnalités Subsumio — capacités du logiciel juridique IA pour cabinets",
    "Cited AI answers, self-wiring knowledge graph, hybrid retrieval, WhatsApp copilot — every capability in the product, no hallucinations.":
      "Réponses IA citées, knowledge graph auto-configurant, retrieval hybride, copilot WhatsApp — chaque capacité dans le produit, sans hallucinations.",
    "Full capability tour": "Tour complet des fonctionnalités",
    "Everything it does.": "Tout ce qu'il fait.",
    "Nothing hidden.": "Rien de caché.",
    "Five capability areas, one engine. Click through — every claim here ships in the product, with deterministic citations you can verify.":
      "Cinq domaines de fonctionnalités, un moteur. Cliquez — chaque affirmation ici est dans le produit, avec des citations déterministes vérifiables.",
    "Answers & Synthesis": "Réponses & Synthèse",
    "Knowledge Graph": "Knowledge Graph",
    "Hybrid Retrieval": "Retrieval Hybride",
    "Dream Cycle": "Cycle Dream",
    Integrations: "Intégrations",
    "Ready to see it in your firm?": "Prêt à le voir dans votre cabinet?",
    "Up and running in minutes. First cited answer the same day.":
      "Opérationnel en minutes. Première réponse citée le même jour.",
    "Request a demo": "Demander une démo",
    "Questions, answered": "Questions, réponses",
    // Category titles
    "One answer instead of ten documents": "Une réponse au lieu de dix documents",
    "A graph that wires itself": "Un graphe qui se cable seul",
    "Finds what single-method search misses": "Trouve ce que la recherche à méthode unique manque",
    "Your brain gets smarter while you sleep":
      "Votre brain devient plus intelligent pendant que vous dormez",
    "Meets your tools where they are": "Rencontre vos outils là où ils sont",
    // Category intros
    "Most tools stop at retrieval: here are your chunks, good luck. Subsumio reads them for you and writes the answer — and tells you what it couldn't find.":
      "La plupart des outils s'arrêtent au retrieval: voici vos chunks, bonne chance. Subsumio les lit pour vous et écrit la réponse — et vous dit ce qu'il n'a pas pu trouver.",
    "Every page write extracts entities and typed relationships — with zero extra LLM calls. Relationship questions get graph answers, not keyword guesses.":
      "Chaque écriture de page extrait entités et relations typées — sans appels LLM supplémentaires. Les questions relationnelles obtiennent des réponses du graphe, pas des suppositions de keywords.",
    "Vector similarity, BM25 keyword match and graph traversal — fused with reciprocal rank fusion. Three recall arms, one ranked result.":
      "Similarité vectorielle, match BM25 et traversée du graphe — fusionnés avec reciprocal rank fusion. Trois bras de recall, un résultat classé.",
    "A 24/7 background agent maintains the brain so it compounds instead of rotting. You wake up to a cleaner, sharper knowledge base every day.":
      "Un agent en background 24/7 maintient le brain pour qu'il se compose au lieu de se dégrader. Vous vous réveillez chaque jour avec une base de connaissance plus propre et plus affûtée.",
    "Built agent-first: your AI assistant, Claude or Cursor operates the brain directly via MCP. Humans get a dashboard; agents get a protocol. Same data, same citations, same isolation rules.":
      "Construit agent-first: votre assistant IA, Claude ou Cursor opère le brain directement via MCP. Les humains obtiennent un dashboard; les agents un protocole. Mêmes données, mêmes citations, mêmes règles d'isolement.",
    // Item titles — synthesis
    "Synthesized prose answers": "Réponses en prose synthétisées",
    "Citations on every claim": "Citations sur chaque affirmation",
    "Gap analysis": "Analyse des lacunes",
    "Hearing & meeting prep": "Préparation audience et réunion",
    // Item titles — graph
    "Typed edges, automatic": "Arêtes typées, automatiques",
    "Relational queries": "Requêtes relationnelles",
    "Entity enrichment": "Enrichissement des entités",
    "Benchmarked recall": "Recall mesuré",
    // Item titles — retrieval
    "Vector + BM25 + graph, fused": "Vectoriel + BM25 + graphe, fusionné",
    "Three cost modes": "Trois modes de coût",
    "Smart caching": "Caching intelligent",
    "Intent-aware ranking": "Ranking conscient de l'intent",
    // Item titles — dream
    Deduplication: "Déduplication",
    "Citation repair": "Réparation des citations",
    "Contradiction detection": "Détection de contradictions",
    "Automated overnight jobs": "Jobs nocturnes automatisés",
    // Item titles — integrations
    "MCP server": "Serveur MCP",
    "Full CLI": "CLI complète",
    "Bulk import": "Import en masse",
    "Web dashboard & PWA": "Dashboard web et PWA",
    // Item descriptions — synthesis
    "Cross-document synthesis over people, companies, deals and ideas — written out, not pasted together.":
      "Synthèse cross-document sur personnes, entreprises, deals et idées — écrite, non collée ensemble.",
    "Each statement links to its source page. One click to verify before you rely on it.":
      "Chaque affirmation lie à sa page source. Un clic pour vérifier avant de vous y fier.",
    "The answer ends with what the brain does NOT know yet — so silence never masquerades as certainty.":
      "La réponse se termine par ce que le brain NE sait PAS encore — ainsi le silence ne se déguise jamais en certitude.",
    "Ask before a client call or hearing: last contact, open commitments, contradictions found, what changed since. Walk in briefed, not hunting.":
      "Demandez avant un appel client ou une audience: dernier contact, engagements ouverts, contradictions trouvées, ce qui a changé. Entrez préparé, pas en chasse.",
    // Item descriptions — graph
    "invested_in, works_at, founded, attended, advises — extracted on write, no tagging, no data entry.":
      "invested_in, works_at, founded, attended, advises — extraits à l'écriture, sans tagging, sans saisie de données.",
    [`"Who invested in X?" "What connects A and B?" resolve by walking the graph — questions vector search can't answer.`]: `"Qui a investi dans X?" "Qu'est-ce qui relie A et B?" se résolvent en parcourant le graphe — des questions que la recherche vectorielle ne peut pas répondre.`,
    "People and companies accumulate context across every mention; the brain consolidates overnight.":
      "Personnes et entreprises accumulent du contexte à chaque mention; le brain consolide pendant la nuit.",
    "97.9% Recall@5 and +31.4 P@5 points over vector-only RAG on a 240-page benchmark corpus.":
      "97,9% Recall@5 et +31,4 points P@5 sur RAG uniquement vectoriel sur un corpus de benchmark de 240 pages.",
    // Item descriptions — retrieval
    "Semantic similarity catches paraphrases, keywords catch exact terms, the graph catches relationships. Fusion beats each alone.":
      "La similarité sémantique capture les paraphrases, les keywords capturent les termes exacts, le graphe capture les relations. La fusion bat chacun seul.",
    "conservative, balanced, tokenmax — pick your quality/cost point. Token budgets are enforced, not vibes.":
      "conservative, balanced, tokenmax — choisissez votre point qualité/coût. Les budgets de tokens sont appliqués, pas des impressions.",
    "Similar queries hit a semantic cache (~50% cost reduction in steady use) — with strict isolation so settings changes never serve stale results.":
      "Des requêtes similaires touchent un cache sémantique (~50% de réduction de coûts en usage continu) — avec isolation stricte pour que les changements ne servent jamais de résultats stale.",
    "Relational questions trigger graph recall automatically; lookups stay lean. The engine adapts per query.":
      "Les questions relationnelles déclenchent le recall du graphe automatiquement; les lookup restent légers. L'engine s'adapte par requête.",
    // Item descriptions — dream
    "Duplicate people and company pages are detected and merged — the graph stays canonical.":
      "Les pages dupliquées de personnes et d'entreprises sont détectées et fusionnées — le graphe reste canonique.",
    "Broken or stale citations are found and re-linked automatically.":
      "Les citations cassées ou stale sont trouvées et re-linkées automatiquement.",
    "Conflicting facts across documents get flagged with both sources — gold for case files and due diligence.":
      "Les faits conflictuels entre documents sont signalés avec les deux sources — de l'or pour les dossiers et le due diligence.",
    "Cron-based ingestion, enrichment and reports. The production deployment runs 66 autonomous jobs — the brain is always current when you sit down in the morning.":
      "Ingestion, enrichissement et rapports basés sur cron. Le déploiement de production exécute 66 jobs autonomes — le brain est toujours à jour quand vous vous asseyez le matin.",
    // Item descriptions — integrations
    "Native Model Context Protocol — Claude Code, Claude Desktop, Cursor and any MCP client query the brain as a tool.":
      "Model Context Protocol natif — Claude Code, Claude Desktop, Cursor et tout client MCP interrogent le brain comme outil.",
    "Every operation is scriptable. Bulk imports, exports, search, graph queries — automation-ready.":
      "Chaque opération est scriptable. Imports en masse, exports, recherche, requêtes de graphe — prêts pour l'automatisation.",
    "Markdown, PDFs, meeting notes, email exports. Years of backlog ingest in one run with live progress.":
      "Markdown, PDFs, notes de réunions, exports d'emails. Des années de backlog en une exécution avec progression en direct.",
    "Query, graph explorer, upload, settings — installable on iOS, iPadOS and Android as an app.":
      "Requête, explorateur de graphe, upload, paramètres — installable sur iOS, iPadOS et Android comme app.",
    // FAQ
    "Do I need to train or fine-tune a model?": "Dois-je entraîner ou fine-tuner un modèle?",
    "No. Subsumio uses retrieval-augmented generation with your own knowledge graph. No model training, no fine-tuning — your data stays yours.":
      "Non. Subsumio utilise retrieval-augmented generation avec votre propre knowledge graph. Pas d'entraînement, pas de fine-tuning — vos données restent vôtres.",
    "Can I use it with my existing tools?": "Puis-je l'utiliser avec mes outils existants?",
    "Yes. Subsumio integrates via MCP (Model Context Protocol), REST API, and a full CLI. It works alongside Claude, Cursor, and any MCP-compatible agent.":
      "Oui. Subsumio s'intègre via MCP (Model Context Protocol), REST API et CLI complète. Il fonctionne aux côtés de Claude, Cursor et tout agent compatible MCP.",
    "How accurate are the citations?": "Quelle est la précision des citations?",
    "Every claim in a synthesized answer links directly to its source page. You can verify any statement with one click — no black-box answers.":
      "Chaque affirmation dans une réponse synthétisée lie directement à sa page source. Vous pouvez vérifier chaque statement d'un clic — pas de réponses black-box.",
    "Is my data secure?": "Mes données sont-elles sécurisées?",
    "All data is encrypted at rest and in transit. Self-hosting is available. No data is shared with third parties or used for model training.":
      "Toutes les données sont chiffrées au repos et en transit. Self-hosting disponible. Aucune donnée n'est partagée avec des tiers ni utilisée pour l'entraînement de modèles.",
  }),
  nl: applyReplacements(JSON.parse(JSON.stringify(_enFeatures)), {
    "Subsumio Features — AI legal software capabilities for law firms":
      "Subsumio Functies — mogelijkheden van AI juridische software voor advocatenkantoren",
    "Cited AI answers, self-wiring knowledge graph, hybrid retrieval, WhatsApp copilot — every capability in the product, no hallucinations.":
      "Geciteerde AI-antwoorden, zelf-configurerende knowledge graph, hybride retrieval, WhatsApp copilot — elke mogelijkheid in het product, geen hallucinaties.",
    "Full capability tour": "Volledige functietour",
    "Everything it does.": "Alles wat het doet.",
    "Nothing hidden.": "Niets verborgen.",
    "Five capability areas, one engine. Click through — every claim here ships in the product, with deterministic citations you can verify.":
      "Vijf functionaliteitsgebieden, één engine. Klik door — elke bewering hier zit in het product, met deterministische citaten die je kunt verifiëren.",
    "Answers & Synthesis": "Antwoorden & Synthese",
    "Knowledge Graph": "Knowledge Graph",
    "Hybrid Retrieval": "Hybride Retrieval",
    "Dream Cycle": "Dream Cyclus",
    Integrations: "Integraties",
    "Ready to see it in your firm?": "Klaar om het in je kantoor te zien?",
    "Up and running in minutes. First cited answer the same day.":
      "Operationeel in minuten. Eerste geciteerde antwoord dezelfde dag.",
    "Request a demo": "Vraag een demo aan",
    "Questions, answered": "Vragen, beantwoord",
    // Category titles
    "One answer instead of ten documents": "Eén antwoord in plaats van tien documenten",
    "A graph that wires itself": "Een graaf die zichzelf bekabelt",
    "Finds what single-method search misses": "Vindt wat zoekmethode-alleen mist",
    "Your brain gets smarter while you sleep": "Je brain wordt slimmer terwijl je slaapt",
    "Meets your tools where they are": "Ontmoet je tools waar ze zijn",
    // Category intros
    "Most tools stop at retrieval: here are your chunks, good luck. Subsumio reads them for you and writes the answer — and tells you what it couldn't find.":
      "De meeste tools stoppen bij retrieval: hier zijn je chunks, succes. Subsumio leest ze voor je en schrijft het antwoord — en vertelt je wat het niet kon vinden.",
    "Every page write extracts entities and typed relationships — with zero extra LLM calls. Relationship questions get graph answers, not keyword guesses.":
      "Elke pagina-schrijfactie extraheert entiteiten en getypeerde relaties — zonder extra LLM-calls. Relatievragen krijgen graaf-antwoorden, geen keyword-gissingen.",
    "Vector similarity, BM25 keyword match and graph traversal — fused with reciprocal rank fusion. Three recall arms, one ranked result.":
      "Vectorgelijkenis, BM25 keyword-match en graaf-traversaal — gefuseerd met reciprocal rank fusion. Drie recall-armen, één gerangschikt resultaat.",
    "A 24/7 background agent maintains the brain so it compounds instead of rotting. You wake up to a cleaner, sharper knowledge base every day.":
      "Een 24/7 background-agent onderhoudt de brain zodat hij zich opstapelt in plaats van vervalt. Je wordt elke dag wakker met een schonere, scherpere kennisbank.",
    "Built agent-first: your AI assistant, Claude or Cursor operates the brain directly via MCP. Humans get a dashboard; agents get a protocol. Same data, same citations, same isolation rules.":
      "Agent-first gebouwd: je AI-assistent, Claude of Cursor bedient de brain direct via MCP. Mensen krijgen een dashboard; agents krijgen een protocol. Dezelfde data, dezelfde citaten, dezelfde isolatieregels.",
    // Item titles — synthesis
    "Synthesized prose answers": "Gesynthetiseerde proza-antwoorden",
    "Citations on every claim": "Citaten bij elke bewering",
    "Gap analysis": "Gap-analyse",
    "Hearing & meeting prep": "Zitting- en vergadervoorbereiding",
    // Item titles — graph
    "Typed edges, automatic": "Getypeerde kanten, automatisch",
    "Relational queries": "Relationele queries",
    "Entity enrichment": "Entiteit-verrijking",
    "Benchmarked recall": "Recall gemeten",
    // Item titles — retrieval
    "Vector + BM25 + graph, fused": "Vector + BM25 + graaf, gefuseerd",
    "Three cost modes": "Drie kostmodi",
    "Smart caching": "Slimme caching",
    "Intent-aware ranking": "Intent-bewust ranking",
    // Item titles — dream
    Deduplication: "Deduplicatie",
    "Citation repair": "Citaat-reparatie",
    "Contradiction detection": "Tegenstrijdigheidsdetectie",
    "Automated overnight jobs": "Geautomatiseerde nachtelijke jobs",
    // Item titles — integrations
    "MCP server": "MCP-server",
    "Full CLI": "Volledige CLI",
    "Bulk import": "Bulk-import",
    "Web dashboard & PWA": "Web-dashboard en PWA",
    // Item descriptions — synthesis
    "Cross-document synthesis over people, companies, deals and ideas — written out, not pasted together.":
      "Cross-document synthese over personen, bedrijven, deals en ideeën — uitgeschreven, niet samengeplakt.",
    "Each statement links to its source page. One click to verify before you rely on it.":
      "Elke bewering linkt naar zijn bronpagina. Eén klik om te verifiëren voordat je erop vertrouwt.",
    "The answer ends with what the brain does NOT know yet — so silence never masquerades as certainty.":
      "Het antwoord eindigt met wat de brain NOG NIET weet — zodat stilte zich nooit als zekerheid voordoet.",
    "Ask before a client call or hearing: last contact, open commitments, contradictions found, what changed since. Walk in briefed, not hunting.":
      "Vraag vóór een cliëntgesprek of zitting: laatste contact, open toezeggingen, gevonden tegenstrijdigheden, wat veranderd is. Loop binnen voorbereid, niet zoekend.",
    // Item descriptions — graph
    "invested_in, works_at, founded, attended, advises — extracted on write, no tagging, no data entry.":
      "invested_in, works_at, founded, attended, advises — geëxtraheerd bij schrijven, zonder tagging, zonder data-invoer.",
    [`"Who invested in X?" "What connects A and B?" resolve by walking the graph — questions vector search can't answer.`]: `"Wie investeerde in X?" "Wat verbindt A en B?" worden opgelost door de graaf te doorlopen — vragen die vectorzoek niet kan beantwoorden.`,
    "People and companies accumulate context across every mention; the brain consolidates overnight.":
      "Personen en bedrijven accumuleren context bij elke vermelding; de brain consolideert 's nachts.",
    "97.9% Recall@5 and +31.4 P@5 points over vector-only RAG on a 240-page benchmark corpus.":
      "97,9% Recall@5 en +31,4 P@5-punten over alleen-vector RAG op een 240-pagina benchmark-corpus.",
    // Item descriptions — retrieval
    "Semantic similarity catches paraphrases, keywords catch exact terms, the graph catches relationships. Fusion beats each alone.":
      "Semantische gelijkenis vangt parafrases, keywords vangen exacte termen, de graaf vangt relaties. Fusie verslaat elk afzonderlijk.",
    "conservative, balanced, tokenmax — pick your quality/cost point. Token budgets are enforced, not vibes.":
      "conservative, balanced, tokenmax — kies je kwaliteit/kosten-punt. Token-budgetten worden gehandhaafd, geen vibes.",
    "Similar queries hit a semantic cache (~50% cost reduction in steady use) — with strict isolation so settings changes never serve stale results.":
      "Vergelijkbare queries raken een semantische cache (~50% kostenreductie in continu gebruik) — met strikte isolatie zodat instellingswijzigingen nooit stale resultaten leveren.",
    "Relational questions trigger graph recall automatically; lookups stay lean. The engine adapts per query.":
      "Relatievragen activeren automatisch graaf-recall; lookups blijven slank. De engine past zich per query aan.",
    // Item descriptions — dream
    "Duplicate people and company pages are detected and merged — the graph stays canonical.":
      "Dubbele personen- en bedrijfspagina's worden gedetecteerd en samengevoegd — de graaf blijft canoniek.",
    "Broken or stale citations are found and re-linked automatically.":
      "Gebroken of stale citaten worden gevonden en automatisch opnieuw gelinkt.",
    "Conflicting facts across documents get flagged with both sources — gold for case files and due diligence.":
      "Tegenstrijdige feiten tussen documenten worden gemarkeerd met beide bronnen — goud voor dossiers en due diligence.",
    "Cron-based ingestion, enrichment and reports. The production deployment runs 66 autonomous jobs — the brain is always current when you sit down in the morning.":
      "Cron-gebaseerde ingestion, verrijking en rapporten. De productie-deployment draait 66 autonome jobs — de brain is altijd actueel als je 's ochtends gaat zitten.",
    // Item descriptions — integrations
    "Native Model Context Protocol — Claude Code, Claude Desktop, Cursor and any MCP client query the brain as a tool.":
      "Natiev Model Context Protocol — Claude Code, Claude Desktop, Cursor en elke MCP-client bevragen de brain als tool.",
    "Every operation is scriptable. Bulk imports, exports, search, graph queries — automation-ready.":
      "Elke operatie is scriptbaar. Bulk-imports, exports, zoekopdrachten, graaf-queries — automatisering-klaar.",
    "Markdown, PDFs, meeting notes, email exports. Years of backlog ingest in one run with live progress.":
      "Markdown, PDF's, notulen, email-exports. Jaren aan backlog in één run met live voortgang.",
    "Query, graph explorer, upload, settings — installable on iOS, iPadOS and Android as an app.":
      "Query, graaf-verkenner, upload, instellingen — installeerbaar op iOS, iPadOS en Android als app.",
    // FAQ
    "Do I need to train or fine-tune a model?": "Moet ik een model trainen of fine-tunen?",
    "No. Subsumio uses retrieval-augmented generation with your own knowledge graph. No model training, no fine-tuning — your data stays yours.":
      "Nee. Subsumio gebruikt retrieval-augmented generation met je eigen knowledge graph. Geen model-training, geen fine-tuning — je data blijft van jou.",
    "Can I use it with my existing tools?": "Kan ik het gebruiken met mijn bestaande tools?",
    "Yes. Subsumio integrates via MCP (Model Context Protocol), REST API, and a full CLI. It works alongside Claude, Cursor, and any MCP-compatible agent.":
      "Ja. Subsumio integreert via MCP (Model Context Protocol), REST API en een volledige CLI. Het werkt naast Claude, Cursor en elke MCP-compatibele agent.",
    "How accurate are the citations?": "Hoe nauwkeurig zijn de citaten?",
    "Every claim in a synthesized answer links directly to its source page. You can verify any statement with one click — no black-box answers.":
      "Elke bewering in een gesynthetiseerd antwoord linkt direct naar zijn bronpagina. Je kunt elke statement met één klik verifiëren — geen black-box-antwoorden.",
    "Is my data secure?": "Zijn mijn gegevens veilig?",
    "All data is encrypted at rest and in transit. Self-hosting is available. No data is shared with third parties or used for model training.":
      "Alle gegevens worden versleuteld at-rest en in-transit. Self-hosting is beschikbaar. Geen gegevens worden gedeeld met derden of gebruikt voor model-training.",
  }),
};
