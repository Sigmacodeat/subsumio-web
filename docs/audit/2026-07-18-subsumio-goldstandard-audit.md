# SUBSUMIO Gesamt-Audit: Datenbank, Korpus-Befüllung & AI-Anwalt im Goldstandard-Vergleich

**Datum:** 2026-07-18
**Fragestellung:** Ist die Umsetzung von SUBSUMIO (Datenbankdesign, Korpus-Befüllung, AI-Legal-Anwalt) Goldstandard und mindestens auf Augenhöhe mit Harvey, Legora & Co. im DACH-Raum?
**Methode:** Direktes Code-Audit (Engine, Migrationen, Chunker, Retrieval, Prompts, Verifikation, Eval) + Internet-Recherche (Harvey, Legora, Stanford RegLab, aktuelle Legal-RAG-Forschung).

---

## 1. Executive Summary

**Kurzfassung: Die Architektur ist konzeptionell auf Goldstandard-Niveau — in Teilbereichen sogar ahead of the public state of the art. Die Ausführung hat aber noch messbare Lücken, vor allem bei Korpus-Vollständigkeit (Embeddings), AT-Retrieval-Qualität und Live-Evaluierung. "Mindestens so gut wie Harvey/Legora im DACH" ist als Architektur-Aussage vertretbar, als belegte Aussage aktuell noch nicht.**

| Dimension                     | Note                            | Begründung                                                                                                                                                                                        |
| ----------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Datenbankdesign               | **Sehr gut (A-)**               | Temporale Gesetzesversionierung, Jurisdiktions-Fence per Trigger, pgvector + Trigramme, Soft-Delete, Generation-Counter für Cache-Invalidierung                                                   |
| Korpus-Befüllung              | **Gut, mit Baustellen (B)**     | §-aware Chunker v4 exzellent; aber 148.646 ausstehende Embeddings, 181 nicht suchbare Pages, 343 Oversized-Chunks                                                                                 |
| Retrieval                     | **Sehr gut (A-)**               | Hybrid (Keyword+Vektor) → RRF → LLM-Rerank → Dedup, legal Query-Expansion, parametrisiert per Eval-Sweeps                                                                                         |
| Antwort-Synthese & Prompts    | **Sehr gut (A-)**               | Strukturierte JSON-Ausgabe, Zitationspflicht, Jurisdiktions-Kollisionswarnungen (KSchG AT/DE etc.), Fail-closed bei fehlender Jurisdiktion                                                        |
| Halluzinations-Abwehr         | **Goldstandard (A)**            | Zwei-Schichten-Verifikation: deterministischer Guardrail (Tier 0) + Cross-Model-Verifikation (Tier 1), fail-closed bei Verifier-Fehler. Das adressiert exakt die Stanford-Kritik an Westlaw/Lexis |
| Evaluierung & Benchmarks      | **Ambitioniert, unfertig (B-)** | 17 Eval-Suites, Gold-Tasks, Holdout — aber Live-Harness nur mock-sicher, Holdout nicht extern versiegelt, CH-Goldtasks im Draft                                                                   |
| Rechtzeitigkeit/Versionierung | **Goldstandard (A)**            | `legal_source_versions` mit valid_from/valid_to/status — das können viele Wettbewerber nicht sauber                                                                                               |

---

## 2. Teil A — Technisches Audit (Ist-Zustand, mit Belegen)

### 2.1 Datenbankdesign

**Schema-Quellen:** `server/src/schema.sql` (1.439 Zeilen), `server/migrations/001–010`.

**Stärken:**

- **Temporale Gesetzesversionierung** (`legal_source_versions`, schema.sql:69–85): pro Gesetz Versionen mit `valid_from`/`valid_to`, `status ∈ {current, superseded, withdrawn}`, `content_hash`, `source_url`, Unique-Constraint auf (source, statute, version_date). Das ist die Voraussetzung für Point-in-Time-Recherche ("geltende Fassung am 1.3.2024") — ein Feature, das selbst große Anbieter nur teilweise sauber können.
- **Jurisdiktions-Fence auf DB-Ebene** (schema.sql:184–200): Trigger `enforce_statute_source_jurisdiction` verweigert Statuten-Pages im falschen Jurisdiktions-Source. Defense-in-depth gegen AT/DE-Kontamination — genau der Fehlertyp, den die Stanford-Studie als kritisch identifiziert.
- **pgvector + pg_trgm + pgcrypto** (schema.sql:3–6): Vektor-, Trigramm- und Hash-Grundlagen korrekt.
- **Reife Betriebs-Features:** Soft-Delete mit 72h-Recovery-Fenster, `chunker_version` pro Source (erzwingt Re-Chunking bei Chunker-Upgrade), `generation`-Counter pro Page für Cache-Invalidierung, `embedding_signature` für Modell-Provenienz, `last_retrieved_at` als Staleness-Signal.

**Schwächen:**

- **Kein vollständiger Legal-Knowledge-Graph auf Norm-Ebene.** Es gibt `legal_graph_edges` (Migration 004) und Takes/Graph im Think-Pfad, aber keine durchgängig typisierte Relation zwischen Normen (änder­/aufhebt/verweist-auf) wie sie die Forschung (GraphRAG, Legal-Ontologien) als nächsten Qualitätssprung beschreibt. Verweise zwischen §§ werden primär über Text-/Konzept-Expansion gelöst (`server/src/core/legal/concept-map.ts`), nicht über einen persistierten Zitationsgraphen mit gerichteten Kanten.
- **Migrationen nie gegen echte Postgres round-trip-verifiziert** — eigener Befund aus dem LAB-DACH-Audit: „nicht gegen eine isolierte echte PostgreSQL-Testdatenbank migriert und round-trip-verifiziert. Das ist vor Deployment Pflicht." (`docs/audits/2026-07-13-lab-dach-v4-full-system-audit.md:38`)

### 2.2 Korpus-Befüllung (Ingestion & Chunking)

**Produktionsstand (Hetzner-DB, eigenes Audit vom selben Tag):** 378.267 Pages, 2.074.526 Chunks, 1.925.880 embedded → **92,8 % Coverage** (`docs/audit/2026-07-18-embedding-corpus-zwischenstand.md`).

**Stärken:**

- **§-aware Legal-Statute-Chunker v4** (`server/src/core/chunkers/legal-statute.ts:1–100`): Splittet an juristischen Strukturgrenzen (Absatz `(1)`, Ziffer `1.`, Litera `a)`), nicht an Wortzählung; jeder Chunk trägt `paragraph_ref`, `statute_abbr`, `jurisdiction`, `absatz`, `chunk_role`. 250 Wörter Zielgröße, 30 Overlap, 6.000-Zeichen-Hardcap. Das entspricht exakt dem, was die aktuelle Fachliteratur als Best Practice für Legal-RAG empfiehlt (struktur- bzw. parent-aware Chunking statt Fixed-Size).
- **Separater Entscheidungs-Chunker** (`legal-decision.ts`) für Judikatur.
- **Chunker-Versionierung** (`LEGAL_CHUNKER_VERSION = 4`): Erzwingt Re-Chunks bei Algorithmus-Änderung — verhindert stille Korpus-Drift.
- **Embedding-Consistency-Guard** (`server/src/core/embedding-consistency-guard.ts`) + Signaturen: verhindert Modell-Mischung im selben Index (häufiger Produktionsfehler bei RAG-Systemen).
- **Mehrprovider-fähiges Embedding-Gateway** (`server/src/core/ai/gateway.ts`, `embedding.ts`): asymmetrische Query-/Dokument-Embeddings unterstützt (Voyage-Stil), Retry-/Abort-Logik, Preis-Ledger.
- **Delta-Sync & Dedup** für Judikatur-Sync; Source-Lifecycle-Migration 006.

**Schwächen (nach Schwere):**

1. **148.646 Chunks ohne Embedding (7,2 %).** Betroffen: `law-de-judikatur` 93.682 (82,0 % Coverage), `law-at-judikatur-lvwg` 37.995 (82,5 %), `law-at-judikatur-vfgh` 8.933 (**nur 57,7 %**), `law-eu-regulations` 6.139, `law-ch-judikatur` 1.846. Diese Dokumente sind für die Vektorsuche praktisch unsichtbar — ausgerechnet VfGH (Verfassungsgerichtshof!) ist der schwächste Source.
2. **181 Pages ohne Chunks** (law-ch 130, law-de 44, law-at 4): u. a. `Art. 1 StGB (CH)`, `§ 1354 BGB`, `§ 1059 ABGB`. Diese Normen sind **nicht vektorsuchbar**. Ursache laut Eigenaudit ungeklärt.
3. **343 Oversized-Chunks > 6.000 Zeichen** (340 davon `law-at-judikatur-uvs`) — verletzt die eigene Chunker-Spezifikation.
4. **Embedding-Modell: OpenAI text-embedding-3-small (1536d) via OpenRouter.** Solide und günstig, aber kein legal-/deutsch-spezialisiertes Modell. Die Eval-Zahlen (s. u.) zeigen, dass gerade AT darunter leidet. Ein Wechsel z. B. auf ein multilingual-/deutsch-starkes Modell (oder Fine-Tuned-Legal-Embedding) ist der größte einzelne Qualitätshebel am Retrieval.
5. **Encoding-/Duplikat-Checks im Eigenaudit noch offen** („noch nicht geprüft").

### 2.3 Der AI-Anwalt (Retrieval → Synthese → Verifikation)

**Pipeline:** `server/src/core/search/hybrid.ts` (2.852 Zeilen), `server/src/core/think/*`, `server/src/core/citation-guardrail.ts`, `server/src/core/think/cross-verify.ts`.

**Retrieval — Goldstandard-Elemente:**

- Hybrid Keyword (`websearch_to_tsquery`) + Vektor → **RRF (k=60)** → Intent-Gewichtung → Exact-Match-Boost → **LLM-Rerank (Top-25)** → Cosine-Dedup (0,88, max 5/Page) → Autocut/Token-Budget (hybrid.ts:1–44).
- **Deutsche Legal-Query-Behandlung:** relaxed-OR-Fallback für juristische Anfragen mit deutschen Stopwortlisten (hybrid.ts:48–68), Erkennung von ~100 DACH-Rechtstermini (hybrid.ts:70–72), Legal-Query-Expansion + §-Extraktion (`think/legal-query-expand.ts`, `legal/concept-map.ts`).
- **Semantischer Query-Cache mit Generations-Invalidierung**, Telemetrie, Court-Recency-/Area-Boosts.
- **Parametrisierung ist eval-getrieben**, nicht geraten: `server/src/eval/dach-legal-retrieval/optimization-config.json` dokumentiert Sweep-Ergebnisse (RRF-k, Rerank-TopN, Chunkgröße, Dedup-Schwellen).

**Synthese & Prompts — Stärken:**

- GATHER → MERGE → SYNTHESIZE mit **strukturierter JSON-Ausgabe** (answer + citations-Array + gaps), damit Zitate deterministisch persistiert werden und nicht auf Prosa-Stabilität des Modells vertraut wird (`think/prompt.ts:61–94`).
- **Anti-Prompt-Injection:** User-Input als `<untrusted-user-input>` markiert, Takes als DATA deklariert.
- **Konflikt- und Lücken-Pflicht:** widersprechende Quellen müssen in „Conflicts" beide genannt, fehlende Daten in „Gaps" benannt werden — keine stillschweigende Auswahl.
- **Legal-Mode mit Jurisdiktions-Kollisionswarnungen** (prompt.ts:100–120): explizite AT/DE/CH-Disambiguierung (KSchG = Kündigungsschutz DE vs. Konsumentenschutz AT, StGB/ZPO/StPO/GmbHG/UStG/EStG/InsO…). Das ist ein DACH-spezifischer Qualitätsfaktor, den Harvey/Legora in dieser Granularität öffentlich nicht nachweisen.
- **Fail-closed** bei fehlender Jurisdiktion im Legal-Mode.

**Halluzinations-Abwehr — das Kernstück:**

- **Tier 0 — deterministischer Citation-Guardrail** (`citation-guardrail.ts:1–15`): fünf rein regelbasierte Checks (Zitat-Präsenz im Kontext, Gesetzes-Whitelist mit ~150 DACH/EU-Abkürzungen, Nicht-§-Referenzen, Hedging-Erkennung, Cross-Law-Kontamination). Null Zusatzkosten, O(n).
- **Tier 1 — Cross-Model-Verifikation** (`think/cross-verify.ts:38–62`): ein zweites Modell prüft semantisch auf Existenz, korrekte Anwendung, Jurisdiktion, Ableitungen und Erfindungen (~$0,003/Query). **Fail-closed:** Bei Verifier-Fehler → `NEEDS_HUMAN_REVIEW`, niemals still „verifiziert" (cross-verify.ts:70–86).

Das ist genau die Architektur, die die Stanford-RegLab-Studie implizit fordert: Existenzen-Check **plus** Anwendungs-Check (die gefährlichere Fehlerart „real case, wrong proposition"). Öffentlich belegt ist ein vergleichbarer Zwei-Schichten-Ansatz bei keinem Wettbewerber im DACH.

### 2.4 Evaluierung

- **17 Eval-Suites** (`server/src/eval/`): dach-legal-retrieval, de-/at-legal-retrieval(-live), at-judikatur-retrieval, lab-dach (Gold-Tasks + Rubric-Judge + Cross-Judge), subsumption, fristen-extraction, jurisdiction-isolation, e2e-pipeline/-production u. a.
- **Gemessene Retrieval-Werte** (`optimization-config.json:54–63`):
  - DE: Hit@5 96,0 % → **100 %** mit Rerank, MRR 0,842
  - AT: Hit@5 61,7 % → **86,7 %** mit Rerank, **MRR nur 0,370 → 0,670**
- **Holdout-Manifest** mit 7 versiegelten Gold-Tasks (DE/AT/CH, litigation + criminal) mit Hashes.
- **Offene Punkte (Eigenaudit 2026-07-13):** Live-Harness bewusst nur mock-sicher; Holdout liegt im Repo (nicht extern versiegelt); CH-Goldtasks `draft` (fachjuristische Prüfung ausstehend); Goldtask-Metadaten mit Zukunftsdaten; kein einheitlicher Claim–Evidence-Vertrag; Registry nicht überall Single-Source-of-Truth.

**Interpretation:** AT ist die Schwachstelle — MRR 0,670 vs. DE 0,842 heißt: die erste relevante Antwort steht im AT-Schnitt erst um Rang ~2–3 statt ~1. Hauptverdacht: Embedding-Modell (EN-lastig) + fehlende Embeddings (VfGH 57,7 %).

---

## 3. Teil B — Marktrecherche: Was ist der Goldstandard?

### 3.1 Harvey & Legora (Stand 2026)

- **Harvey:** ~$11 Mrd. Bewertung, Multi-Model-Routing (Claude/GPT/Gemini), 500+ vor- und 25.000 kundeneigene Agents, Vault, LexisNexis-Content-Allianz, Workflow-/Agenten-Orchestrierung. Kein tiefer DACH-Gesetzescontent, US-Hosting. (Quelle: eigene Competitive-Analyse `docs/audits/COMPETITIVE_AUDIT_2026-06-30.md`; HAQQ-Blog: „Harvey … use fine-tuned LLMs with RAG — no formal ontology. They claim 91% accuracy")
- **Legora:** ~$5,6 Mrd. Bewertung, „aOS": Tabular Review (Grid über Dokumentensets), Workflows, Research mit Zitations-Synthese auf **Source-Level** (nicht character-level), Portal, Word/Outlook-Add-ins, Monitors (Regulatory-Tracking), Agent-Modus. (Quellen: vaquill.ai Legora Review 2026-06-20; gc.ai Legora Review 2026-06-03)

**Wichtig:** Beide sind primär _Workflow-Plattformen über eigenen Dokumenten + angeschlossenen Content_. Keiner veröffentlicht Retrieval-Metriken (Hit@k, MRR) oder Halluzinationsraten für den DACH-Rechtsraum. Eure gemessenen Werte (DE MRR 0,842) sind mehr Transparenz, als die Wettbewerber bieten.

### 3.2 Die Realität der Halluzination (Stanford RegLab 2024/2025, peer-reviewed JELS)

- Lexis+ AI: **17 %** Halluzination; Westlaw AI-Assisted Research: **33 %**; GPT-4 Baseline: **43 %** — trotz „hallucination-free"-Marketing. (Magesh et al., arXiv:2405.20362)
- Zwei Fehlerarten: **Fabrikation** (Zitat existiert nicht) und **Fehlausrichtung** (Zitat existiert, stützt die Behauptung aber nicht). Letztere ist gefährlicher, weil sie oberflächliche Prüfung übersteht.
- Konsequenz der Forschung (respan.ai, 2026-05): Existenzen-Check ist notwendig, nicht hinreichend — man braucht einen separaten **Alignment-Check** Zitat ↔ Behauptung. → Genau das ist eure Tier-0/Tier-1-Kombination.

### 3.3 Goldstandard-Checkliste Legal-RAG 2026 (Forschungskonsens)

| #   | Prinzip                                                                                                                       | Quelle                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | Hybride Suche (BM25/Keyword + semantisch) + Reranking                                                                         | u. a. SBV-LawGraph (ACIIDS 2026): +12 % Recall über BM25, +8 % über AdvancedRAG                        |
| 2   | Struktur-/Parent-aware Chunking an juristischen Grenzen (§/Abs), kleine Chunks für Retrieval, größerer Kontext für das Modell | edtek.ai Chunking-Guide 2026-04                                                                        |
| 3   | Reiche Metadaten (Jurisdiktion, Gericht, Datum, **Geltungsstatus**) + zeitliche Versionierung                                 | arXiv 2509.09467 (Legal-RAG-Survey)                                                                    |
| 4   | Zitations-Verifikation in zwei Stufen: Existenz + inhaltliche Stützung; fail-closed zu Human-Review                           | Stanford RegLab; respan.ai                                                                             |
| 5   | Legal Knowledge Graph / Ontologie für Norm-Relationen (ändert/hebt auf/verweist)                                              | Graphwise GraphRAG (60 % → >90 % Accuracy in Enterprise-Deployments); LegalGraphRAG (arXiv 2605.28120) |
| 6   | Eval-Harness mit Gold-Datensatz, versiegeltem Holdout, Regression-Gate bei jeder Änderung                                     | Stanford: „the legal industry needs thorough and transparent benchmarks"; edtek.ai                     |
| 7   | Neutral-/Refusal-Verhalten bei fehlender Evidenz statt erfundener Antwort                                                     | SBV-LawGraph; Stanford (Groundedness-Achse)                                                            |

---

## 4. Teil C — Der direkte Vergleich

| Goldstandard-Kriterium                  | Harvey                                       | Legora              | **SUBSUMIO (gemessen am Code)**                                                                       |
| --------------------------------------- | -------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------- |
| Hybride Suche + Rerank                  | ja (undokumentiert)                          | ja (undokumentiert) | **ja — RRF k=60 + LLM-Rerank Top-25, eval-parametriert**                                              |
| Struktur-Chunking (§/Abs)               | n/a (Content-fremd)                          | n/a                 | **ja — eigener §-aware Chunker v4 mit Absatz/Ziffer/Litera**                                          |
| Temporale Gesetzesversionierung         | über Lexis-Content                           | teilweise           | **ja — eigenes `legal_source_versions` mit valid_from/to**                                            |
| Zitations-Existenzcheck                 | Shepard's/KeyCite-Äquivalent nur via Partner | Source-Level        | **ja — deterministisch (Tier 0)**                                                                     |
| Zitations-Alignment-Check (semantisch)  | nicht öffentlich                             | nicht öffentlich    | **ja — Cross-Model (Tier 1), fail-closed**                                                            |
| Jurisdiktions-Kollisionsschutz AT/DE/CH | nein (US-Fokus)                              | begrenzt            | **ja — Prompt-Warnungen + DB-Trigger + Guardrail**                                                    |
| Legal Knowledge Graph (Norm-Relationen) | nein (laut HAQQ)                             | nein (laut HAQQ)    | **teilweise — `legal_graph_edges` + Concept-Map, aber kein durchgängiger typisierter Zitationsgraph** |
| Veröffentlichte Retrieval-Metriken      | nein                                         | nein                | **ja (intern): DE MRR 0,842 / AT 0,670, Hit@5 100 %/86,7 %**                                          |
| Versiegelter externer Benchmark-Holdout | nein                                         | nein                | **nein — Holdout liegt im Repo (offener Punkt)**                                                      |
| DACH-Korpus-Tiefe                       | nein                                         | begrenzt            | **ja — 378k Pages / 2,07 M Chunks (AT/DE/CH/EU, Gesetze + Judikatur)**                                |

**Verdict:**

1. **Methodik: Ja, Goldstandard.** Die gewählte Architektur (§-aware Chunking → hybrides RRF-Retrieval mit Rerank → strukturierte Synthese mit Zitationspflicht → zweistufige Verifikation mit fail-closed Human-Review) entspricht Punkt für Punkt dem Forschungskonsens 2026 und adressiert präzise die dokumentierten Schwächen der Marktführer (Stanford-Studie).
2. **Robustheit: größtenteils ja.** Fail-closed-Verhalten an mehreren Stellen (Verifier-Fehler, fehlende Jurisdiktion, Live-Eval-Weigerung, DB-Trigger) zeigt reifes Engineering. Das ist besser als „happy path"-RAG bei vielen Wettbewerbern.
3. **Aber:** Goldstandard auf dem Papier ≠ belegte Überlegenheit. Gegen Harvey/Legora „mindestens gleichwertig im DACH" kann erst behauptet werden, wenn die Lücken in Abschnitt 5 geschlossen sind — vor allem AT-Retrieval und Live-Evals.

---

## 5. Lücken nach Schweregrad (priorisiert)

### Kritisch (blockieren jede „Harvey-Level"-Behauptung)

1. **AT-Retrieval deutlich schwächer als DE** (MRR 0,670 vs. 0,842; Hit@5 86,7 %). Für ein DACH-Produkt mit AT-Schwerpunkt (beA-Integration!) ist das das wichtigste Qualitätsdefizit. Maßnahmen: Embedding-Backlog schließen, deutsch-/legal-optimiertes Embedding-Modell evaluieren (A/B gegen text-embedding-3-small im Sweep-Harness), AT-Goldtask-Set erweitern.
2. **148.646 ausstehende Embeddings** — u. a. VfGH nur 57,7 % embedded. Verfassungsjudikatur halb unsichtbar ist inhaltlich nicht vertretbar.
3. **Kein Live-Eval-Harness** — alle Benchmarks laufen mock/offline. Ohne Live-Messung (echtes Gateway, Kosten/Latenz/Judge-Routing) gibt es keine belastbare öffentliche Aussage. (Eigenaudit: No-Go für „Harvey eingeholt"-Claims.)

### Hoch

4. **181 Pages ohne Chunks** (inkl. Art. 1 StGB CH, § 1354 BGB, § 1059 ABGB) — Ursachenanalyse + Re-Chunk.
5. **Holdout nicht extern versiegelt** (liegt im Repo) + Goldtask-Metadaten mit Zukunftsdaten → Benchmark-Glaubwürdigkeit gefährdet.
6. **CH-Goldtasks im Draft** — ohne fachjuristisches Review keine CH-Qualitätsaussage.
7. **343 Oversized-Chunks > 6.000 Zeichen** (UVS) — verletzt eigene Spec, Embedding-Qualität fraglich.

### Mittel (strategisch, Differenzierungschance)

8. **Kein typisierter Norm-Zitationsgraph** (ändert/aufhebt/verweist-auf, Point-in-Time-Traversierung). Die Forschung (GraphRAG: 60 % → >90 % Accuracy) sieht hier den nächsten Sprung — und kein Wettbewerber hat es im DACH. Eure `legal_source_versions`-Basis legt den Grundstein dafür bereits.
9. **Registry nicht überall Single-Source-of-Truth** (inline Modell-/Jurisdiktionsregeln in der Pipeline); Claim–Evidence-Vertrag erst im ersten Slice umgesetzt.
10. **Migrationen nicht gegen echte Postgres round-trip-getestet** (Pflicht vor Deployment).

---

## 6. Empfohlene Reihenfolge (abgeleitet aus Befunden + eigenem Epic-6-Plan)

1. **Embedding-Backlog auf 100 %** (VfGH → LvWG → DE-Judikatur → EU-Regulations → CH), danach 181 chunklose Pages reparieren, 343 Oversized-Chunks re-chunken.
2. **AT-Retrieval-Offensive:** Embedding-Modell-Sweep (mind. 2 Alternativmodelle gegen text-embedding-3-small, AT-Goldset), Ergebnis in `optimization-config.json` dokumentieren.
3. **Live-Eval-Gateway anschließen** (Epic 6.5), danach ersten echten DACH-Benchmark-Lauf (DE+AT; CH erst nach Review).
4. **Holdout extern versiegeln**, Goldtask-Metadaten bereinigen, CH fachjuristisch reviewen lassen.
5. **Claim–Evidence-Vertrag + Registry-Wiring abschließen** (Epic 6.1/7/8), Migrationen gegen isolierte Postgres verifizieren (Epic 6.4).
6. **Strategisch (Differenzierung):** Norm-Zitationsgraph mit Geltungs-Traversierung auf Basis von `legal_source_versions` + `legal_graph_edges` — das wäre ein Feature, das weder Harvey noch Legora im DACH haben.

---

## 7. Quellen (Extern)

- Magesh et al., „Hallucination-Free? Assessing the Reliability of Leading AI Legal Research Tools", Stanford RegLab/HAI, arXiv:2405.20362; peer-reviewed J. Empirical Legal Studies 2025 — Lexis+ AI 17 %, Westlaw 33 %, GPT-4 43 % Halluzination.
- respan.ai, „Why Legal AI Still Hallucinates Citations", 2026-05 — Existenzen- vs. Alignment-Check.
- vaquill.ai, „Legora Review", 2026-06-20; gc.ai, „Legora Legal AI Review", 2026-06-03 — Legora aOS, Tabular Review, Source-Level-Zitate.
- haqq.ai, „Legal Ontology AI", 2026-04 — Harvey: fine-tuned LLMs + RAG, keine formale Ontologie, ~91 % Accuracy-Claim.
- Phan et al., „SBV-LawGraph", ACIIDS 2026 — Hybrid+Graph schlägt BM25/AdvancedRAG um bis zu 12 % Recall.
- edtek.ai, „Chunking Strategies for Legal & Reference RAG Systems", 2026-04 — Parent-Document-/Struktur-Chunking als Default für Legal.
- Graphwise, „GraphRAG in Compliance and Legal Workflows", 2026-01 — 60 % → >90 % Accuracy durch Graph-Grounding (Herstellerangabe).
- arXiv 2509.09467, Legal-RAG-Survey — Metadaten-Anreicherung, Ontologien, Geltungsstatus.
- Intern: `docs/audits/2026-07-13-lab-dach-v4-full-system-audit.md`, `docs/audit/2026-07-18-embedding-corpus-zwischenstand.md`, `docs/audits/COMPETITIVE_AUDIT_2026-06-30.md`.
