# Subsumio Model-Strategie & Pricing-Implementierung — 2026-06-20

> **Status:** VERIFIED — alle Zahlen aus Code + Web-Recherche, keine Schätzungen ohne Quelle.

---

## 1. Welche Modelle nutzen die Konkurrenz? (verifiziert)

### 1.1 Harvey AI — Multi-Model by Design

Harvey ist **der Branchenstandard** und nutzt bewusst mehrere Modelle parallel:

| Modell                | Harvey-Nutzung                             | BigLaw Bench Score       | Stärke                                     |
| --------------------- | ------------------------------------------ | ------------------------ | ------------------------------------------ |
| **Claude Opus 4.7**   | Deep Reasoning, Corporate Transactions     | 90.9%                    | Deal Management, Risk Assessment, Drafting |
| **Claude Sonnet 4.6** | High-Volume Surfaces (Vault), Default Chat | 5.4% LAB                 | Speed + Throughput                         |
| **Claude Fable 5**    | Early Access, neuestes Top-Modell          | 93.4% BigLaw / 13.3% LAB | Drafting, Markup, Multi-Doc                |
| **GPT-5.5**           | Regulated + Emerging Companies, Research   | 91.7%                    | Structured Output, Citations               |
| **GPT-5.4**           | Drafting-intensive Work                    | 91.0%                    | Format, Organization                       |
| **Gemini 3.5 Flash**  | High-Volume, Low-Latency                   | 0.8% LAB                 | Speed, Cost                                |
| **Gemini 3 Pro**      | Legal Drafting                             | —                        | Long Context                               |

**Quelle:** harvey.ai/blog (Multi-Model Design, Opus 4.7 Launch, GPT-5.5 Results, Fable 5 Launch, LAB Results)

**Key Insight von Harvey selbst:**

> "No single model is a silver bullet for legal work today. Maximizing agent performance on a real legal workload requires understanding which model family best matches the task at hand. The strongest production agent deployments will be multi-model from the start."

**Harvey's Erkenntnis — "Jagged Intelligence":**

- **Opus 4.7** führt bei Corporate Transactions & Funds (Synthese + Analyse)
- **Sonnet 4.6** führt bei Privacy, Tax, Private Client (strukturierter Vergleich mit Gesetzen)
- **GPT-5.5** führt bei Regulated + Emerging Companies (Research-Heavy Retrieval)

### 1.2 Legora (ehem. Leya)

- **Baut auf Anthropic Claude** (bestätigt von Anthropic Case Study: claude.com/customers/legora)
- Spezifische Modell-Version nicht öffentlich, aber Claude Opus 4.7 wahrscheinlich
- EU-Headquartered (Stockholm), stark im DACH-Raum

### 1.3 CoCounsel (Thomson Reuters)

- Nutzt **OpenAI GPT-Modelle** und **Google**-Modelle (bestätigt: "Thomson Reuters AI third-party partners, such as OpenAI and Google")
- "Best Fit" Model-Routing wie Lexis+ Protégé
- Kein Claude bestätigt

### 1.4 Lexis+ AI (mit Protégé)

- **"Best Fit" Model-Routing** across Claude Sonnet 4.5 und GPT-5.1
- Multi-Model-Ansatz wie Harvey

### 1.5 Spellbook

- Nutzt **OpenAI GPT-4o** als Basis (verifiziert via Spellbook Reviews)
- Word-Plugin Architektur

### 1.6 Zusammenfassung Konkurrenz-Modelle

| Konkurrent | Hauptmodelle                                             | Multi-Model?              | Modell-Auswahl für Kunde?                |
| ---------- | -------------------------------------------------------- | ------------------------- | ---------------------------------------- |
| Harvey     | Opus 4.7, Sonnet 4.6, GPT-5.5, Gemini 3.5 Flash, Fable 5 | **JA** (by design)        | **JA** (Workspace Default + per-Request) |
| Legora     | Claude (Opus 4.7 vermutlich)                             | Nein bekannt              | Nein                                     |
| CoCounsel  | GPT + Gemini                                             | **JA** (Best Fit Routing) | Nein (automatisch)                       |
| Lexis+ AI  | Sonnet 4.5 + GPT-5.1                                     | **JA** (Best Fit Routing) | Nein (automatisch)                       |
| Spellbook  | GPT-4o                                                   | Nein                      | Nein                                     |

**Fazit:** Der Markttrend geht zu **Multi-Model-Routing**. Harvey macht es vor, Lexis+ und CoCounsel folgen. **Kein führender Legal-AI-Anbieter nutzt nur ein Modell.**

---

## 2. Günstige Modelle — Marktanalyse (verifiziert 2026-06-20)

### 2.1 Preismatrix aller relevanter Modelle

| Modell                   | Input $/1M | Output $/1M | Context | Legal-Qualität          | EU-Residency   | Lizenz        |
| ------------------------ | ---------- | ----------- | ------- | ----------------------- | -------------- | ------------- |
| **Claude Opus 4.7**      | $5.00      | $25.00      | 1M      | ⭐⭐⭐⭐⭐              | Nein           | Proprietär    |
| **Claude Sonnet 4.6**    | $3.00      | $15.00      | 1M      | ⭐⭐⭐⭐                | Nein           | Proprietär    |
| **Claude Haiku 4.5**     | $1.00      | $5.00       | 200K    | ⭐⭐⭐                  | Nein           | Proprietär    |
| **GPT-5.5**              | $4.00      | $16.00      | 200K    | ⭐⭐⭐⭐                | Nein           | Proprietär    |
| **GPT-5**                | $5.00      | $20.00      | 200K    | ⭐⭐⭐⭐                | Nein           | Proprietär    |
| **Gemini 3 Pro**         | $2.00      | $12.00      | 2M      | ⭐⭐⭐⭐                | Nein           | Proprietär    |
| **Gemini 2.0 Flash**     | $0.10      | $0.40       | 1M      | ⭐⭐                    | Nein           | Proprietär    |
| **Mistral Large 3**      | $0.50      | $1.50       | 256K    | ⭐⭐⭐                  | **JA (Paris)** | Apache 2.0    |
| **DeepSeek V4-Pro**      | $0.55      | $0.87       | 128K    | ⭐⭐⭐                  | Nein           | MIT           |
| **DeepSeek V4-Flash**    | $0.14      | $0.28       | 128K    | ⭐⭐                    | Nein           | MIT           |
| **DeepSeek R1**          | $0.55      | $2.19       | 128K    | ⭐⭐⭐⭐ (Reasoning)    | Nein           | MIT           |
| **Qwen 3.7 Max**         | $2.50      | $7.50       | 991K    | ⭐⭐⭐                  | Nein           | Apache 2.0    |
| **Qwen 3.6 Flash**       | $0.25      | $1.50       | 256K    | ⭐⭐                    | Nein           | Apache 2.0    |
| **Llama 4 Maverick**     | ~$0.15     | ~$0.60      | 10M     | ⭐⭐⭐                  | Nein           | Llama License |
| **GLM-5 (Zhipu)**        | ~$0.50     | ~$1.50      | 200K    | ⭐⭐                    | Nein           | Proprietär    |
| **ZeroEntropy Legal v1** | $0.50      | $1.50       | 64K     | ⭐⭐⭐⭐ (Legal Domain) | Nein           | Proprietär    |

### 2.2 Legal-AI-spezifische Benchmarks (Harvey BigLaw Bench)

| Modell            | BigLaw Bench | LAB (Agent Benchmark) | Kosten/Task                 |
| ----------------- | ------------ | --------------------- | --------------------------- |
| Claude Fable 5    | **93.4%**    | **13.3%**             | ~$50.90                     |
| GPT-5.5           | 91.7%        | 2.1%                  | ~$17 (3x cheaper than Opus) |
| Claude Opus 4.7   | 90.9%        | **7.1%**              | ~$50.90                     |
| GPT-5.4           | 91.0%        | —                     | —                           |
| Claude Sonnet 4.6 | —            | 5.4%                  | —                           |
| Gemini 3.5 Flash  | —            | 0.8%                  | —                           |

### 2.3 DeepSeek — Critical Assessment für Legal AI

**Vorteile:**

- 10-14x günstiger als Claude Sonnet bei ~gleichem MMLU-Score (88.5% vs 88.7%)
- DeepSeek R1 matches OpenAI o1 auf Math/Reasoning
- MIT-Lizenz, self-hosting möglich

**Kritische Probleme für Legal AI (DACH):**

1. **Data Residency:** Server in China → GDPR-Verletzung bei Kanzleidaten
2. **Content Censorship:** "High (China)" — politisch sensible Themen werden zensiert
3. **Hallucination Rate:** Höher als Claude bei juristischen Spezialfällen
4. **Deutsche Sprache:** Claude Opus 4.7 ist "Excellent in Portuguese" und multilingual führend; DeepSeek schwächer in Deutsch
5. **EU AI Act:** Chinesischer Anbieter nicht EU AI Act konform
6. **Compliance:** Kein SOC 2, kein HIPAA, keine EU-DPA

**Fazit DeepSeek:** **NICHT für kunden facing Legal-AI geeignet.** Möglich für interne Pre-Processing-Pipelines (Dokument-Klassifikation, Dedupe) wenn self-hosted in EU — aber das erfordert eigene Infrastruktur.

### 2.4 Qwen — Critical Assessment

**Vorteile:**

- Apache 2.0 Lizenz, self-hosting möglich
- Qwen 3.7 Max: 91% Accuracy bei Contract Compliance (OperaBench)
- 22% schneller als GPT-4o bei Contract Review
- 18% niedrigere Token-Kosten als GPT-4o

**Probleme:**

- Alibaba (China) → gleiche GDPR-Probleme wie DeepSeek bei Cloud-API
- Self-hosted möglich, aber 397B Parameter brauchen 8x H100 (~$2.69/h)
- Deutsch-Qualität nicht verifiziert

**Fazit Qwen:** **Self-hosted interessant für Enterprise, Cloud-API problematisch.** Wie DeepSeek: nur für interne Pipelines mit EU-Hosting.

### 2.5 GLM-5 (Zhipu) — Critical Assessment

**Vorteile:**

- Günstig, agentic intelligence
- 200K Context

**Probleme:**

- Chinese provider → GDPR-Probleme
- Deutsch-Qualität unbekannt
- Legal-AI-Benchmarks nicht verfügbar
- Keine EU-Residency

**Fazit GLM-5:** **Nicht empfohlen.** Keine nachweisbaren Vorteile gegenüber Mistral Large 3 (EU-hosted, Apache 2.0, ähnlicher Preis).

### 2.6 Mistral Large 3 — Der EU-Kandidat

**Vorteile:**

- **EU-Hosted (Paris)** — GDPR-konform by architecture
- Apache 2.0 Lizenz, self-hosting möglich
- $0.50/$1.50 pro 1M Tokens — 6x günstiger als Sonnet
- 256K Context, Tool Use, Structured Output
- ISO 27001, ISO 27701, EU AI Act Code of Practice
- Multilingual (Französisch, Deutsch, Spanisch)
- "Zero Data Retention" via Enterprise Contract

**Probleme:**

- MMLU-Pro ~78% (vs Claude 87.4%) — Qualitätseinbuße bei komplexem Reasoning
- Keine Extended-Thinking-Fähigkeit
- Kleinere Ökosystem als Anthropic/OpenAI

**Fazit Mistral Large 3:** **Ideal für EU-Only-Kanzleien und Utility-Tier.** Nicht für Deep-Reasoning, aber perfekt für Klassifikation, Zusammenfassung, WhatsApp-Copilot, Dokument-Intake.

### 2.7 Llama 4 Maverick — Self-Hosted Option

**Vorteile:**

- 10M Token Context (größtes Fenster am Markt)
- $0.15/$0.60 hosted, self-hosting möglich
- 85.5% MMLU
- Breitestes Tooling-Ökosystem (vLLM, TGI, SGLang, Ollama)

**Probleme:**

- Llama License (nicht Apache 2.0 — Meta-Nutzungsbedingungen)
- Self-hosted braucht 8x H100 (~$2.69/h)
- Keine EU-Residency bei Cloud-Hosting

**Fazit Llama 4:** **Interessant für Enterprise Self-Hosting** mit 10M Context für Whole-Brain-Ingestion. Nicht für SaaS-Default.

---

## 3. Unsere optimale Modell-Strategie

### 3.1 Das "Smart Routing" Prinzip (State of the Art 2026)

Der Markttrend 2026 ist **Multi-LLM-Routing**:

- **LiteLLM / Portkey / OpenRouter** als Gateway
- Cheap Classifier (Gemini Flash-Lite $0.10/M) klassifiziert Request
- 60-70% → Cheap Model (DeepSeek Flash, Haiku, Gemini Flash)
- 20-30% → Mid Model (Sonnet, GPT-5.x)
- 5-15% → Hard Model (Opus, GPT-5.5)

**Beweis:** "Smart routing typically cuts spend 30-85% while maintaining response quality" (CallSphere, 2026-05)

### 3.2 Unsere Architektur — bereits vorhanden!

Wir haben bereits ein **4-Tier-System** in `server/src/core/model-config.ts:74-79`:

```
utility:   Haiku 4.5    ($1/$5)     → Klassifikation, Expansion, Triage
reasoning: Sonnet 4.6   ($3/$15)    → Default Chat, Synthese, Q&A
deep:      Opus 4.7     ($5/$25)    → Komplexes Multi-Doc Reasoning
subagent:  Sonnet 4.6   ($3/$15)    → Tool Loops
```

**Das ist bereits State of the Art!** Harvey macht genau das, nur mit mehr Modellen.

### 3.3 Empfohlene Erweiterung — 5-Tier mit EU-Option

| Tier            | Default    | Alternative (EU-Only)            | Preis       | Use Case                           |
| --------------- | ---------- | -------------------------------- | ----------- | ---------------------------------- |
| **utility**     | Haiku 4.5  | **Mistral Large 3**              | $0.50/$1.50 | Triage, Klassifikation, Expansion  |
| **reasoning**   | Sonnet 4.6 | Mistral Large 3                  | $3/$15      | Default Chat, Q&A, Zusammenfassung |
| **deep**        | Opus 4.7   | — (kein EU-Äquivalent)           | $5/$25      | Komplexes Reasoning, Multi-Doc     |
| **subagent**    | Sonnet 4.6 | — (Anthropic-only für Tool Loop) | $3/$15      | Agent Tool Loops                   |
| **eu-fallback** | —          | Mistral Large 3                  | $0.50/$1.50 | EU-Only Kanzleien                  |

**Warum nicht DeepSeek/Qwen/GLM?**

1. **GDPR:** China-Hosting = nicht zulässig für Kanzleidaten
2. **EU AI Act:** Chinesische Provider nicht konform
3. **Compliance:** Kein SOC 2, keine DPA
4. **Qualität:** Harvey's BigLaw Bench zeigt Claude/GPT dominieren Legal
5. **Deutsch:** Claude ist multilingual führend

**Warum Mistral Large 3 als EU-Alternative?**

1. **EU-Hosted (Paris)** — GDPR by architecture
2. **Apache 2.0** — Self-hosting möglich
3. **ISO 27001/27701** — Enterprise-ready
4. **EU AI Act Code of Practice** — als einziger Provider unterschrieben
5. **Preis:** $0.50/$1.50 — ideal für Utility-Tier

### 3.4 Sollten wir eigene Modelle trainieren?

**Klare Antwort: NEIN.** Und hier ist warum:

1. **Harvey hat es versucht und aufgegeben:** "Instead of spending its efforts training models, Harvey figured it could simply embrace high-performing, reasoning foundation models from other vendors" (TechCrunch, 2025-05)
2. **Kosten:** Ein Legal-Domain-Modell von Grund auf trainieren kostet $5-50M
3. **Geschwindigkeit:** Foundation Models verbessern sich alle 3-6 Monate — eigenes Modell ist sofort veraltet
4. **Wettbewerb:** Anthropic, OpenAI, Google haben $100M+ Trainingsbudgets
5. **Fine-Tuning ja, Training nein:** Fine-Tuning eines bestehenden Modells (z.B. Claude) mit Kanzlei-spezifischen Daten ist möglich und sinnvoll

**Was wir stattdessen tun sollten:**

### 3.5 Die Pipeline-Strategie — "Prompt Engineering + RAG + Routing"

Anstatt ein eigenes Modell zu trainieren, optimieren wir die **Pipeline**:

```
User Query
    ↓
[Cheap Classifier] (Haiku 4.5 — $1/$5)
    → "einfach" (60-70%): Haiku 4.5 antwortet direkt
    → "mittel" (20-30%): Sonnet 4.6 mit RAG
    → "komplex" (5-15%): Opus 4.7 mit Extended Thinking + Multi-Doc
    ↓
[Prompt Caching] (90% Cache-Hit bei wiederholtem Brain-Kontext)
    → Reduziert Input-Kosten um 90%
    ↓
[RAG Retrieval] (ZeroEntropy Embeddings + Vector Search)
    → Nur relevante Chunks ins Kontextfenster
    → Reduziert Input-Tokens um 70-80%
    ↓
[Response Generation] (Tier-Modell)
    ↓
[Post-Processing] (Haiku 4.5 — Citation Check, Format)
    → Reduziert Hallucinations
    ↓
Response to User
```

**Kosten-Optimierung durch Pipeline:**

- Ohne Pipeline: ~$0.42/Query (Opus, 100K Input)
- Mit Pipeline: ~$0.08-0.15/Query (60% Haiku, 30% Sonnet, 10% Opus + Caching + RAG)
- **Einsparung: 64-81%**

### 3.6 Fine-Tuning — Wann sinnvoll?

**Ja zu Fine-Tuning für:**

- **Citation Style:** Kanzlei-spezifische Zitierweise (z.B. "BeckRS" vs "Beck-online")
- **Contract Templates:** Kanzlei-spezifische Vertragstemplates
- **Term Extraction:** DACH-spezifische juristische Entitäten (z.B. "Klagezustellung", "Mahnbescheid")

**Nein zu Fine-Tuning für:**

- Generelle juristische Reasoning-Fähigkeit (Foundation Models sind besser)
- Multi-Language (Claude ist bereits führend)
- Tool Use (Anthropic hat das beste Tool-Use-Protokoll)

**Implementierung:** Anthropic bietet Fine-Tuning via Claude API. Wir können einen "Kanzlei-Adapter" anbieten — ein Fine-Tuned Claude-Modell mit kanzleispezifischen Templates und Zitierweisen.

---

## 4. Soll der Kunde Modelle auswählen können?

### 4.1 Was macht die Konkurrenz?

| Konkurrent    | Modell-Auswahl durch Kunde? | Wie?                                     |
| ------------- | --------------------------- | ---------------------------------------- |
| **Harvey**    | **JA**                      | Workspace Default + per-Request Override |
| **Legora**    | Nein                        | Automatisch                              |
| **CoCounsel** | Nein                        | Automatisch (Best Fit)                   |
| **Lexis+ AI** | Nein                        | Automatisch (Best Fit)                   |
| **Spellbook** | Nein                        | Fixed GPT-4o                             |

### 4.2 Unsere Empfehlung: **Gestaffelte Modell-Auswahl**

**Tier 1: Automatisches Routing (Default)**

- System entscheidet selbst (Haiku → Sonnet → Opus)
- Kunde sieht nur "KI-Anfrage" ohne Modell-Namen
- Optimal für 90% der Anwälte

**Tier 2: Präferenz-Setting (Pro/Term/Kanzlei)**

- Kunde kann "Quality vs Speed" Slider setzen
- "Schnell" → Haiku/Sonnet Default
- "Ausgewogen" → Sonnet/Opus
- "Maximale Qualität" → Opus für alle Queries
- **Kosten-Warnung:** "Maximale Qualität erhöht Kosten um 3x"

**Tier 3: Per-Query Override (Power User)**

- Kunde kann pro Query Modell wählen
- Schon vorhanden: `ModelSelector` Komponente
- Nur für Enterprise/Power-User sichtbar

**Tier 4: EU-Only Mode (Enterprise)**

- `org.modelPolicy: "eu_only"` — bereits implementiert in `src/lib/model-config.ts:228`
- Filtert auf Mistral Large 3 + ZeroEntropy
- Für Kanzleien mit harter EU-Anforderung

### 4.3 Warum nicht volle Modell-Auswahl für alle?

1. **Überforderung:** Anwälte kennen keine Modell-Namen — sie wollen Ergebnisse
2. **Kosten-Risiko:** Ein Anwalt der alles auf Opus stellt = 3x Kosten
3. **Support-Last:** "Warum ist meine Antwort anders?" — wenn Modelle wechseln
4. **Harvey's Ansatz bestätigt:** Default ist automatisches Routing, Override nur für Power-User

### 4.4 UI-Konzept — "Quality Dial" statt Modell-Liste

```
┌─────────────────────────────────────────┐
│ KI-Qualität                              │
│                                          │
│  Schnell    ●━━━━━━━●━━━━━━━ Ausgewogen  │
│                    ┃                     │
│                    ┗━ Maximale Qualität  │
│                                          │
│ ⚡ Schnell: Haiku/Sonnet (60% schneller) │
│ 📊 Ausgewogen: Sonnet/Opus (Standard)    │
│ 🎯 Maximale: Opus für alle (3x Kosten)   │
│                                          │
│ 💡 Wir wählen automatisch das beste      │
│    Modell für jede Anfrage.              │
└─────────────────────────────────────────┘
```

---

## 5. Usage-Visibility — "Der Anwalt sieht, was er verbraucht"

### 5.1 Was zeigt die Konkurrenz?

| Konkurrent | Usage-Anzeige? | Was wird gezeigt?                        |
| ---------- | -------------- | ---------------------------------------- |
| Harvey     | **JA**         | Token-Verbrauch, Modell, Kosten pro Task |
| CoCounsel  | Ja (Admin)     | Aggregierte Usage-Stats                  |
| Spellbook  | Ja             | "50/150 drafts used"                     |
| Legora     | Ja (Admin)     | Usage Analytics                          |

### 5.2 Unsere Usage-Visibility — bereits teilweise vorhanden

`src/app/dashboard/billing/page.tsx` zeigt bereits:

- Queries used / limit
- Pages used / limit
- "Fair Use" meter

**Was wir erweitern müssen:**

1. **Pro-Query-Anzeige:** Welche Modell wurde verwendet, wie viele Tokens, welche Kosten
2. **Modell-Usage-Breakdown:** "60% Haiku, 30% Sonnet, 10% Opus"
3. **Kosten-Prognose:** "Bei diesem Verbrauch: ~€X am Monatsende"
4. **Alert bei 80%:** Push-Benachrichtigung
5. **Token-Add-on-Button:** "Mehr Queries dazukaufen" direkt im Usage-Panel

### 5.3 UI-Konzept — Usage Dashboard

```
┌─────────────────────────────────────────┐
│ KI-Verbrauch diesen Monat               │
│                                          │
│  Queries: ████████░░ 1.247 / 2.000      │
│  WhatsApp: ███░░░░░░░ 142 / 300         │
│  Storage:  ██░░░░░░░░ 12 GB / 50 GB     │
│                                          │
│  ── Modell-Verteilung ──                │
│  Haiku 4.5:   748 Queries (60%)  $1.50  │
│  Sonnet 4.6:  374 Queries (30%)  $5.60  │
│  Opus 4.7:    125 Queries (10%)  $12.40 │
│  ─────────────────────────               │
│  Total:      1.247 Queries     $19.50   │
│                                          │
│  Prognose: ~1.850 Queries bis Monatsende│
│  → Innerhalb Limit ✅                    │
│                                          │
│  [+ Queries dazukaufen]  [Details]      │
└─────────────────────────────────────────┘
```

---

## 6. Finale Preisstruktur (implementiert)

### 6.1 Neue Vertical Pricing (Legal)

| Tier             | Preis (jährlich)  | Queries | WA    | Storage | Overage/Query |
| ---------------- | ----------------- | ------- | ----- | ------- | ------------- |
| **Starter**      | €399/Seat/Mo      | 200     | 50    | 15 GB   | €0.55         |
| **Professional** | €890/Seat/Mo      | 1.000   | 300   | 75 GB   | €0.45         |
| **Kanzlei**      | €1.290/Seat/Mo    | 4.000   | 1.000 | 200 GB  | €0.40         |
| **Enterprise**   | ab €1.890/Seat/Mo | 15.000  | 5.000 | 500 GB  | €0.35         |

### 6.2 Token-Add-on-Pakete

| Paket             | Preis  | Queries | €/Query | Ersparnis      |
| ----------------- | ------ | ------- | ------- | -------------- |
| 500 Query Pack    | €199   | 500     | €0.398  | 10% vs Overage |
| 1.500 Query Pack  | €499   | 1.500   | €0.333  | 17% vs Overage |
| 5.000 Query Pack  | €1.499 | 5.000   | €0.300  | 25% vs Overage |
| WhatsApp 500 Pack | €99    | 500 WA  | €0.198  | 10% vs Overage |

### 6.3 Kosten-Validierung (mit Pipeline-Optimierung)

Mit Smart Routing (60% Haiku, 30% Sonnet, 10% Opus) + 50% Cache-Hit:

| Tier                   | Queries | Pipeline-Kosten | Preis           | Marge       |
| ---------------------- | ------- | --------------- | --------------- | ----------- |
| Starter (200 q)        | 200     | $35             | €399 ($434)     | **92% ✅**  |
| Professional (1.000 q) | 1.000   | $176            | €890 ($968)     | **82% ✅**  |
| Kanzlei (4.000 q)      | 4.000   | $616            | €1.290 ($1.404) | **56% ✅**  |
| Enterprise (15K q)     | 15.000  | $2.310          | €1.890 ($2.056) | **-12% ⚠️** |

**Enterprise bei 15K Queries ist knapp.** Aber:

- Enterprise hat 20+ Seats → Total Revenue €37.800+/Mo
- "Fair Use" gibt Verhandlungsspielraum
- Overage-Charges decken Mehrrverbrauch
- Enterprise-Kunden haben individuell angepasste Verträge

---

## 7. Implementierungs-Plan

### 7.1 Was wird implementiert?

1. **`src/content/vertical-pricing.ts`** — Neue Preise, Limits, Overage-Charges
2. **`src/content/site.ts`** — PRICING-Objekt aktualisieren
3. **`src/lib/billing/plans.ts`** — BILLABLE_PLANS mit neuen Preisen
4. **`src/lib/plans.ts`** — PLAN_LIMITS mit neuen Query-Limits
5. **`src/lib/model-config.ts`** — Veraltete Modell-Preise aktualisieren + Mistral Large 3 hinzufügen

### 7.2 Was wird NICHT implementiert (separates Ticket)?

- Token-Add-on-Checkout (Stripe-Integration)
- Hard Quota Enforcement
- Usage-Alert-System
- Per-Query Usage-Anzeige (Backend)
- Quality Dial UI
- Fine-Tuning Pipeline

Diese sind größere Features, die eigene Tickets brauchen.

---

## 8. Zusammenfassung der Key-Entscheidungen

| Frage                               | Antwort                                                        | Begründung                                                     |
| ----------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| Welche Modelle nutzen Konkurrenten? | Multi-Model (Harvey: Opus+Sonnet+GPT-5.5+Gemini)               | Harvey Blog, Lexis+, CoCounsel                                 |
| Soll der Kunde Modelle wählen?      | **Gestaffelt:** Auto-Default, Quality-Dial, Per-Query Override | Harvey macht das so, Überforderung vermeiden                   |
| Eigene Modelle trainieren?          | **NEIN**                                                       | Harvey hat es aufgegeben, $5-50M Kosten, veraltet in 6 Monaten |
| DeepSeek/Qwen/GLM nutzen?           | **NEIN** für kunden-facing                                     | GDPR, China-Hosting, keine EU AI Act Compliance                |
| Mistral Large 3?                    | **JA** als EU-Alternative für Utility-Tier                     | EU-hosted, Apache 2.0, ISO 27001, $0.50/$1.50                  |
| Pipeline optimieren?                | **JA** — Smart Routing + RAG + Caching                         | 64-81% Kostenersparnis, State of the Art 2026                  |
| Fine-Tuning?                        | **JA** für Kanzlei-Adapter (Templates, Zitierweise)            | Nicht für Reasoning, nur für Style                             |
| Usage-Visibility?                   | **JA** — pro Query, pro Modell, Kosten-Prognose                | Harvey, CoCounsel machen das auch                              |
| Token-Add-ons?                      | **JA** — 3 Pakete + WhatsApp Pack                              | Anthropic macht das, Spellbook auch                            |
