# External Agent Skill Research — Evaluation & Action Items

> Date: 2026-06-11
> Kontext: Evaluierung externer Skill-Repos für potentielle Integration/Inspiration in GBrain

---

## 1. addyosmani/agent-skills

- **Link:** https://github.com/addyosmani/agent-skills
- **Lizenz:** nicht explizit genannt (OSS)
- **Beschreibung:** 24 Production-grade Engineering Skills für AI-Coding-Agents (Claude Code, Cursor, Gemini CLI etc.)
- **Format:** Markdown-Skill-Dateien (SKILL.md), IDE-Agent-kompatibel

### Key Features
- 7 Slash-Commands: `/spec`, `/plan`, `/build`, `/test`, `/review`, `/code-simplify`, `/ship`
- Lifecycle-Coverage: Define → Plan → Build → Verify → Review → Ship
- Fachskills: API Design, Frontend UI Engineering, TDD, Security, Performance, CI/CD, Observability
- Auto-Aktivierung: Skills aktivieren sich basierend auf Kontext (API-Design → api-and-interface-design)
- Anti-Rationalization Tables, Verification Gates

### Nutzen für GBrain
- **Einschätzung:** Niedrig bis Mittel
- **Begründung:** GBrain hat bereits eine extrem ausgefeilte Engineering-Discipline (Phase 0–6 Blueprint, `/ship`-Skill, CI-Gates, E2E-Lifecycle in `CLAUDE.md`). Addys Skills decken denselben generischen Dev-Lifecycle ab, aber auf IDE-Prompt-Ebene. Für GBrain *als Produkt* passen die nicht — GBrain ist keine generische Coding-Agent-Plattform.

### Action Items
- [ ] **Ignorieren als Dependency** — keine direkte Integration nötig
- [ ] **Optional:** Einzelne Skills persönlich in `.cursor/rules/` kopieren, wenn nützlich
- [ ] **Nicht als GBrain-Skill adaptieren** — Redundanz zu existierendem System zu hoch

---

## 2. phuryn/pm-skills

- **Link:** https://github.com/phuryn/pm-skills
- **Lizenz:** nicht explizit genannt
- **Beschreibung:** 100+ PM-Skills, Commands und Plugins für den gesamten Product-Management-Lebenszyklus
- **Format:** Claude-Code- / Cursor-Plugin, Markdown-basiert

### Key Features
- **Discovery:** `/discover`, Opportunity Solution Trees (Teresa Torres), Assumption Mapping, Customer Interviews (JTBD)
- **Strategy:** `/strategy`, Product Strategy Canvas, Lean Canvas, Business Model Canvas, Pricing Strategy
- **Execution:** `/write-prd`, Prioritization Frameworks, Metrics Dashboards (/north-star), Feature Backlog
- **Go-to-Market:** `/plan-launch`, Marketing/Growth, Competitor Analysis
- **Frameworks:** Teresa Torres, Marty Cagan, Alberto Savoia, JTBD

### Nutzen für GBrain
- **Einschätzung:** Hoch — als Konzept-Blueprint
- **Begründung:** Passen hervorragend zu GBrain's Founder/Investor-Fokus. Frameworks wie OST, Assumption Mapping, JTBD Interviews und Metrics Dashboards ergänzen bestehende Skills (`data-research`, Trajectory-Scoring, Founder Scorecard).
- **Aber:** Repos sind für Claude-Code-Prompts gebaut, nicht für GBrain's Manifest-basiertes Skill-System (`manifest.json`, `RESOLVER.md`, MECE-Validierung).

### Action Items
- [ ] **Konzepte extrahieren und als GBrain-Skills bauen:**
  - [ ] `opportunity-solution-tree` — OST aus Brain-Daten für Company/Portfolio generieren
  - [ ] `interview-prep` — JTBD-Script basierend auf Brain-Kontext (Company, Founder, Historie)
  - [ ] `assumption-mapping` — Risiko-Matrix für Portfolio-Unternehmen aus Brain-Facts
  - [ ] `metrics-dashboard` — North-Star + Input Metrics aus `facts.event_type`
  - [ ] `product-strategy-canvas` — 9-Section Strategy aus Brain-Wissen
- [ ] **Nicht 1:1 übernehmen** — fremde Markdown-Prompts sind inkompatibel mit GBrain's Skill-System
- [ ] **Via `skill-creator` + `testing` validieren**, wenn Skills gebaut werden

---

## 3. refactoringhq/tolaria

- **Link:** https://github.com/refactoringhq/tolaria
- **Lizenz:** AGPL-3.0-or-later
- **Beschreibung:** Desktop-App (Tauri + React) für Markdown-Knowledge-Bases
- **Format:** Desktop-GUI, lokale Markdown-Dateien + Git

### Key Features
- **Files-first:** Plain Markdown mit YAML Frontmatter, portable, kein Export nötig
- **Git-first:** Jeder Vault ist ein Git-Repo, volle Version History
- **Offline-first, zero lock-in:** Keine Accounts, keine Subscriptions
- **AI-first but not AI-only:** `AGENTS.md` für Claude Code / Codex / Gemini CLI
- **Types as lenses, not schemas:** Navigation, keine Enforcement
- **Keyboard-first:** Power-User-Design, Command Palette
- **Inbox Workflow:** Getting Things Done-ähnlicher Capture-Flow

### Nutzen für GBrain
- **Einschätzung:** Niedrig (als Code), Mittel (als UX-Referenz)
- **Begründung:**
  - **Nicht als Code-Dependency:** AGPL ist kompliziert, Architektur (Dateien vs. DB) passt nicht
  - **Nicht als Skill-Vorlage:** Tolaria hat kein Skill-System im GBrain-Sinn
  - **UX-Referenz wertvoll**, falls GBrain jemals eine native Desktop-GUI plant
  - **Philosophischer Kontrast:** Tolaria's "Types as lenses" vs. GBrain's strenge Schema-Enforcement

### Action Items
- [ ] **Nicht integrieren** — keine praktische Verbindung zur aktuellen CLI+MCP-Architektur
- [ ] **Bookmarken für UX-Referenz**, falls Desktop-UI jemals Thema wird (Keyboard-first, Command Palette, Inbox Workflow)
- [ ] **Optional:** Tolaria's Inbox-Workflow als Inspiration für GBrain's `capture`-Skill prüfen

---

## 4. mvanhorn/last30days-skill

- **Link:** https://github.com/mvanhorn/last30days-skill
- **Lizenz:** MIT
- **Beschreibung:** AI Skill, der jedes Thema über Reddit, X, YouTube, HN, Polymarket, TikTok und Web recherchiert und eine grounded Synthese erzeugt
- **Format:** Python-Engine, Claude Code Skill

### Key Features
- **Multi-Source Research:** Reddit, X, YouTube, HN, Polymarket, TikTok, Web
- **Intelligent Topic Resolution:** Löst vor der Suche Handles, Subreddits, GitHub-Repos, Hashtags auf (z.B. "OpenClaw" → @steipete, r/openclaw)
- **Engagement-Scoring:** Upvotes, Views, Prediction-Market-Volumen statt SEO-Ranking
- **Cross-Source Cluster Merging:** Gleiche Story auf Reddit + X + YouTube = ein Item
- **Best Takes:** Zweiter Judge für Humor, Wit, Viralität
- **HTML Briefs:** Shareable, dark-mode, offline-fähig
- **SQLite Trend Monitoring:** `--store` für Akkumulation über Zeit, Watchlist-Scripts
- **Auto-Discovered Competitor Comparisons:** `/last30days OpenAI --competitors`

### Nutzen für GBrain
- **Einschätzung:** Hoch — als Blueprint für neuen Skill
- **Begründung:**
  - Konzeptionell hoch relevant für GBrain's Founder/Investor-Zielgruppe
  - Engagement-basiertes Scoring könnte `signal-detector` erweitern
  - Topic-Resolution-Engine ist clever und könnte GBrain's Suchstrategie bereichern
  - Trend-Monitoring über Zeit passt zu GBrain's Trajectory-Features
- **Aber:** Nicht als Code übernehmbar (Python, externe APIs), nicht als direkter Skill installierbar

### Action Items
- [ ] **Konzepte notieren und als GBrain-Skill bauen:**
  - [ ] `social-signal-capture` — Was sagt Reddit/X über [Company/Person/Trend] in den letzten 30 Tagen?
  - [ ] `trend-monitor` — Watchlist über Zeit mit Brain-Integration
  - [ ] `competitor-brief` — Auto-discovered Competitor Comparison mit Brain-Kontext
- [ ] **Architektur-Pattern studieren:** Topic-Resolution → parallel Search → Engagement-Scoring → Cluster-Merging → Synthese
- [ ] **Optional:** ScrapeCreators API oder ähnliche Datenquellen für GBrain evaluieren

---

## 5. soxoj/maigret (OSINT Username Dossier)

- **Link:** https://github.com/soxoj/maigret
- **Lizenz:** AGPL-3.0-or-later
- **Beschreibung:** OSINT-Tool: Sammelt Dossiers über Personen via Username über 3.000+ Sites. Recursive Search, Account-Extraction, Permutation-Engine.
- **Format:** Python-CLI + Library + Web Interface

### Key Features
- 3.000+ Site-Support (Default: 500 top-ranked; `-a` für alle)
- Recursive Search: Gefundene Accounts → neue Usernames → neue Suche
- Account-Extraction: Profildaten, Links zu anderen Accounts
- Permutation: `john doe` → `johndoe`, `j.doe`, `john_doe`, ...
- AI Analysis Mode (`--ai`): Investigation Summary via LLM
- Tor/I2P/Proxy-Support, CAPTCHA-Bypass
- HTML/PDF/JSON/CSV/D3-Graph Reports

### Warum die IDEE valide ist für GBrain

GBrain's `enrich`-Skill ist **bereits** ein "intelligence dossier"-System:

> *"A brain page should read like an intelligence dossier, not a LinkedIn scrape."* — `skills/enrich/SKILL.md`

GBrain hat bereits:
- **Tiered Enrichment** (Tier 1-3) mit Social Media Lookup als Quelle
- **Person pages** mit State, What They Believe, What They're Building, Trajectory, Network
- **Timeline tracking** mit `add_timeline_entry`
- **Signal detection** als always-on ambient capture

Was Maigret **zusätzlich** bietet, das GBrain nicht hat:
- **Username-basierte Discovery:** Ein Handle → alle Accounts auf allen Plattformen
- **Permutation:** Automatische Varianten-Generierung für Usernames
- **Skaliertes Multi-Source-Matching:** 3.000 Sites parallel
- **Recursive Resolution:** Account A → Link zu Account B → weiter suchen

### Warum Maigret SELBST nicht nutzbar ist

1. **AGPL-3.0:** Nicht in GBrain (nicht AGPL) integrierbar ohne Lizenz-Kontamination
2. **OSINT-Scraping:** Ethisch und rechtlich problematisch für ein kommerzielles Produkt
3. **Stack-Mismatch:** Python + 3.000 Site-Parser vs. GBrain's Bun/TypeScript
4. **Privacy-Conflict:** GBrain's `AGENTS.md` verbietet explizit: *"Never commit real names of people, companies, or funds into public artifacts"*. Maigret ist darauf ausgelegt, genau solche Daten zu sammeln.

### Der richtige Weg für GBrain

Statt Maigret zu integrieren, baut man einen **neuen GBrain-Skill** mit denselben PRINZIPIEN, aber:
- **API-basiert** statt Scraping (LinkedIn API, GitHub API, X API, ProductHunt API)
- **Opt-in / Consent-basiert** — nur für bekannte Kontakte, nicht für Fremde
- **Nur öffentlich geteilte Daten** — keine Hintergrund-Recherche
- **Im GBrain-Format** — `SKILL.md` mit MECE-Validierung

### Potenzielle GBrain-Skills aus Maigret-Inspiration

| Konzept | GBrain-Skill | Beschreibung |
|---|---|---|
| Username Discovery | `handle-resolve` | Ein Handle → bekannte Accounts auf GitHub, X, LinkedIn, ProductHunt (API-basiert) |
| Social Enrichment | `social-signal-enrich` | Auto-Anreicherung von Person-Seiten aus öffentlichen Social-Media-Signalen |
| Permutation | `username-variants` | Generiere likely Username-Varianten für Personen-Suchen |
| Dossier-Report | `entity-dossier` | Generiere ein sharebares Briefing über eine Person/Company aus Brain-Daten |

### Action Items
- [ ] **Maigret als Code nicht integrieren** (AGPL, Scraping, Stack)
- [ ] **Architektur-Patterns studieren:** Username-Resolution → Multi-Source → Recursive → Synthese
- [ ] **Konzept als GBrain-Skill bauen:** `social-signal-enrich` oder `entity-dossier`
- [ ] **API-First-Strategie:** Welche APIs (GitHub, LinkedIn, X, ProductHunt) sind für Founder-Daten verfügbar?
- [ ] **Privacy-Gate:** Nur für bekannte Kontakte, keine Fremd-Recherche, immer opt-in

---

## 6. x1xhlol/system-prompts-and-models-of-ai-tools (Competitive Intelligence)

- **Link:** https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools
- **Lizenz:** nicht explizit genannt
- **Beschreibung:** Geleakte/extrahierte System Prompts von 20+ AI-Tools (Claude Code, Cursor, Devin, Windsurf, Kiro, Lovable, Perplexity, Replit, Trae, etc.)
- **Format:** Markdown/Text-Sammlung, keine Bibliothek

### Key Features
- 20+ Tools: Augment Code, Claude Code, Cursor, Devin AI, Windsurf, Kiro, Lovable, Manus, Perplexity, Replit, Trae, VSCode Agent, Warp.dev, Xcode, Z.ai Code, etc.
- Reverse-Engineered Prompt Extraction
- Interne Tools & AI Models

### Warum es NICHT direkt nutzbar ist

1. **Rechtliche Grauzone:** Proprietäre Prompts, wahrscheinlich ToS-Verstoß
2. **Kein Code:** Reine Text-Sammlung, keine API, keine Bibliothek
3. **Nicht im GBrain-Skill-Format:** Random Prompts, nicht als `SKILL.md` strukturiert

### Warum es als Competitive Intelligence dennoch relevant ist

GBrain hat bereits ein extrem ausgefeiltes Agent-System. Aber: **Wie machen es die anderen?**

| Bereich | Learning-Opportunität |
|---|---|
| **RESOLVER.md-Verbesserung** | Wie strukturieren Claude Code, Cursor, Devin ihre Routing-Logik? |
| **MCP-Op-Design** | Wie formulieren andere Tool-Descriptions für bessere Tool-Calling-Accuracy? |
| **Agent-Personas** | Wie definieren andere Agenten-Rollen mit Constraints und Capabilities? |
| **Context Management** | Wie handhaben andere lange Kontext-Fenster und Memory? |
| **Reasoning Patterns** | Welche Chain-of-Thought / ReAct-Varianten verwenden State-of-the-Art-Tools? |
| **Skill-Format** | Gibt es Prompt-Patterns, die GBrain's `SKILL.md`-Format verbessern könnten? |

### Action Items
- [ ] **Nicht in GBrain integrieren** (rechtlich problematisch, kein Code)
- [ ] **In GBrain's Brain aufnehmen** als Competitive Intelligence unter `concepts/agent-architecture/` oder `research/ai-tool-prompts/`
- [ ] **Als persönliche Research-Quelle nutzen** zur Verbesserung von GBrain's Agent-System

---

## 7. obra/superpowers (Agentic Skills Framework)

- **Link:** https://github.com/obra/superpowers
- **Lizenz:** nicht explizit genannt
- **Beschreibung:** Agentic skills framework & software development methodology für Coding-Agents
- **Format:** Markdown-Skill-Dateien für Claude Code, Codex, Cursor, Copilot CLI, Gemini CLI etc.

### Key Features
- **Automatic skill activation:** Skills triggern automatisch basierend auf Kontext
- **Basic Workflow (7 Steps):**
  1. `brainstorming` — Sokratische Design-Refinement vor dem Code
  2. `using-git-worktrees` — Isolierte Workspaces auf neuem Branch
  3. `writing-plans` — Bite-sized Tasks (2-5 Min), mit File Paths + Code + Verification
  4. `subagent-driven-development` — Fresh Subagent pro Task, Two-Stage Review (spec compliance → code quality)
  5. `test-driven-development` — RED-GREEN-REFACTOR, löscht Code written before tests
  6. `requesting-code-review` — Pre-review mit Severity-Blocking
  7. `finishing-a-development-branch` — Merge/PR/Keep/Discard Entscheidung

### Skills Library
- **Testing:** test-driven-development (mit anti-patterns reference)
- **Debugging:** systematic-debugging (4-phase root cause), verification-before-completion
- **Collaboration:** brainstorming, writing-plans, executing-plans, dispatching-parallel-agents, code-review, git-worktrees, finishing-branch
- **Meta:** writing-skills (Skill-Erstellung mit Best Practices), using-superpowers

### Vergleich mit GBrain

| Superpowers | GBrain |
|---|---|
| Subagent-driven-development | `minion-orchestrator` — Unified Minions für shell jobs + LLM subagent orchestration |
| dispatching-parallel-agents | GBrain's subagent-routing conventions |
| test-driven-development | GBrain's `ci:local` + E2E lifecycle + `testing` skill |
| writing-plans | GBrain's Phase 1 Blueprint + `skill-creator` |
| using-git-worktrees | GBrain's `git-workflow-and-versioning` (im `ship`-Skill) |
| writing-skills | GBrain's `skill-creator` + `skill-optimizer` + MECE-Validierung |

### Was GBrain lernen könnte

- **Two-Stage Review (spec compliance → code quality):** GBrain hat Cross-Modal-Review (`cross-modal-review` Skill), aber keine explizite Two-Stage-Review im Subagent-Kontext. Das könnte `minion-orchestrator` verbessern.
- **Bite-sized Task-Definition (2-5 Min):** GBrain's Phase 1 Blueprint ist umfangreicher, aber die Granularität "2-5 Min pro Task" ist eine gute Heuristik.
- **Automatic skill activation:** GBrain's `RESOLVER.md` hat Intent-Routing, aber keinen auto-trigger auf Coding-Kontext. Könnte inspirierend sein.
- **Brainstorming als Skill:** GBrain hat `brain-ops`, aber keinen dedizierten Design-Brainstorming-Skill vor dem Coding.

### Was redundant ist

- Das gesamte TDD + CI/CD + Shipping-Framework. GBrain's `CLAUDE.md` + `/ship` Skill + `ci:local` sind weiter.
- Die Collaboration-Skills (brainstorming, writing-plans, executing-plans). GBrain's Blueprint-System (Phase 0–6) deckt das ab.

### Action Items
- [ ] **Nicht als Framework integrieren** — zu ähnlich zu agent-skills und GBrain's bestehendem System
- [ ] **Konzepte studieren für bestehende Skills:**
  - [ ] Two-Stage Review in `minion-orchestrator` prüfen
  - [ ] Task-Granularität (2-5 Min) in GBrain's Phase 1 Blueprint evaluieren
  - [ ] Auto-Trigger auf Coding-Kontext in `RESOLVER.md` prüfen
- [ ] **Optional:** `brainstorming`-Skill als dedizierten Pre-Coding-Design-Skill in GBrain erstellen

---

## 8. activeloopai/hivemind — DIREKTKONKURRENT

- **Link:** https://github.com/activeloopai/hivemind
- **Lizenz:** nicht explizit genannt
- **Beschreibung:** **"One brain for all your agents"** — Shared Memory für Coding-Agents (Claude Code, Codex, Cursor, Hermes, Pi)
- **Format:** npm-Package + Deeplake Cloud Backend
- **Backed by:** Activeloop (Deeplake — vector database company)

### Core Pipeline: Capture → Codify → Propagate → Compound

1. **Capture:** Jede Agent-Interaktion (prompt, tool call, response) wird als structured trace in Deeplake gespeichert
2. **Codify:** Background worker minet Traces für wiederkehrende Patterns → auto-generiert `SKILL.md` files
3. **Propagate:** Skills werden in jeden verbundenen Agent's Context injiziert
4. **Compound:** Der Agent deines Junior Engineers ist schärfer, weil der Senior's Agent letzte Woche etwas herausgefunden hat

### Key Features

| Feature | Beschreibung |
|---|---|
| **Session Tracing** | Jede Agent-Session wird vollständig aufgezeichnet |
| **Skillify (Auto)** | Auto-codifiziert wiederkehrende Patterns aus Traces in `SKILL.md` Dateien |
| **Semantic Search** | Hybrid lexical + semantic (nomic-embed-text-v1.5), lokal oder cloud |
| **Codebase Graph** | Live Graph aus Traces: files, symbols, imports, tatsächlich traversierte Edges |
| **Cross-Agent Rules** | Team-Prinzipien, die in jeden Agent injiziert werden |
| **Goals + KPIs** | VFS-backed (Virtual File System) unter `~/.deeplake/memory/goal/` und `kpi/` |
| **Summaries** | AI-written wiki summaries nach jeder Session mit 768-dim embeddings |
| **Multi-Agent** | Claude Code, Codex, Cursor, Hermes, Pi, OpenClaw |
| **Team Workspace** | Shared Deeplake workspace — alle Teammitglieder teilen das gleiche Memory |

### Vergleich: Hivemind vs. GBrain

| Aspekt | **Hivemind** | **GBrain** |
|---|---|---|
| **Slogan** | "One brain for all your agents" | "Personal knowledge brain" |
| **Backend** | Deeplake Cloud (SaaS) | PGLite lokal oder eigener Postgres |
| **Fokus** | Team/Collaboration (Enterprise) | Personal (Investor/Founder) |
| **Data Ownership** | Cloud (Activeloop), shared workspace | Lokal, git-basiert, user-owned |
| **Session Tracing** | Vollständig (jede Interaktion) | Kein Session-Tracing, nur brain pages |
| **Auto-Skillify** | Aus Traces (Background worker) | `skillify` Skill (manuelle/periodische) |
| **Skill-Format** | `SKILL.md` (ähnlich GBrain) | `SKILL.md` + `manifest.json` + `RESOLVER.md` |
| **Search** | Hybrid semantic + lexical über Traces | Hybrid RAG über brain pages |
| **Entity System** | Codebase graph (files, symbols, imports) | Person/Company/Concept pages mit Backlinks |
| **Goals/KPIs** | VFS-backed mit CLI | Daily Task Manager + Reports |
| **Privacy** | Cloud-basiert, workspace-shared | Lokal-first, offline-first |
| **Agent-Integration** | Multi-Agent (Claude, Codex, Cursor...) | Primär MCP + Thin-Client |
| **Schema** | Keine explizite Schema-Enforcement | Strikte Schema-Packs (brain-taxonomist) |

### Was Hivemind besser macht

1. **Session Tracing:** Vollständige Aufzeichnung jeder Agent-Interaktion → später durchsuchbar. GBrain hat das nicht.
2. **Team Collaboration:** Shared workspace, cross-agent rules, teammate skill propagation. GBrain ist solo.
3. **Auto-Skillify aus Traces:** Passiver Skill-Mining aus echten Sessions. GBrain's `skillify` ist manueller.
4. **Codebase Graph:** Traversierbare Graph aus tatsächlich genutzten Code-Pfaden. GBrain hat keinen Code-Graph.
5. **Multi-Agent:** Echte Multi-Agent-Integration (Claude + Cursor + Codex gleichzeitig). GBrain ist MCP-zentriert.
6. **Enterprise-Readiness:** Cloud-SaaS, Team-Features, Workspace-Isolation.

### Was GBrain besser macht

1. **Data Ownership:** Lokal, git-basiert, offline. Hivemind speichert alles in Activeloop's Cloud.
2. **Schema & Taxonomy:** Strikte Schema-Enforcement (brain-taxonomist) vs. Hivemind's loose tracing.
3. **Founder/Investor-Focus:** Entity-Tracking, Trajectory-Scoring, Founder Scorecards. Hivemind ist generisch.
4. **Skill-Ecosystem:** 60+ Skills, `skill-optimizer`, `skillpack-harvest`, `testing` Skill. Hivemind hat auto-generierte Skills, aber kein geplantes Ökosystem.
5. **Privacy:** Kein Session-Tracing, keine Cloud-Abhängigkeit. Hivemind zeigt explizit: *"All users in your Deeplake workspace can read this data."*
6. **Open Source:** GBrain's Core ist OSS (CLI + Skills). Hivemind ist ein npm-Plugin für einen proprietären Cloud-Service.

### Critical Learning für GBrain

Hivemind beweist, dass **"One brain for all your agents"** ein realer Markt ist. Aber:
- **Hivemind = Enterprise SaaS** (Team, Cloud, Tracing)
- **GBrain = Personal Power-Tool** (Lokal, Schema, Investor-Focus)

Die Positionierung ist unterschiedlich genug, um nebeneinander zu existieren. Aber GBrain sollte:
- **Session-Tracing evaluieren** — optional, opt-in, lokal
- **Team-Features planen** — aber als Add-on, nicht als Core
- **Auto-Skillify intensivieren** — `skillify` + `skill-optimizer` sind GBrain's Vorteil
- **Codebase-Graph evaluieren** — für `repo-architecture` Skill

### Action Items
- [ ] **In Brain aufnehmen** als `concepts/competitive-intelligence/hivemind.md`
- [ ] **Session-Tracing evaluieren:** Opt-in, lokal, privacy-preserving Trace-Speicherung für spätere Suche
- [ ] **Auto-Skillify vergleichen:** Hivemind's passiver Mining-Ansatz vs. GBrain's manuellem `skillify` Skill
- [ ] **Codebase-Graph evaluieren:** Für `repo-architecture` und `brain-ops`
- [ ] **Team-Features als Roadmap-Item:** Nicht als Core, aber als Enterprise-Tier planen
- [ ] **Hivemind testen:** `npm install -g @deeplake/hivemind && hivemind install` — Gegenüberstellung für Marketing
- [ ] **Differenzierung sharpen:** GBrain's Lokal-first, Schema-streng, Investor-Focus vs. Hivemind's Cloud-first, Team-first, Generisch

---

## Prioritäts-Matrix

| Repo | Direkter Nutzen | Integration-Aufwand | Empfohlene Aktion |
|---|---|---|---|
| **pm-skills** | Hoch | Hoch (neue Skills bauen) | Konzepte extrahieren → GBrain-Skills |
| **last30days-skill** | Hoch | Hoch (neue Skills bauen) | Blueprint für `social-signal`-Skills |
| **maigret (Idee)** | Mittel-Hoch | Hoch (neuer Skill) | API-basiertes `social-signal-enrich` bauen |
| **hivemind (Konkurrent)** | **Hoch** | Niedrig (Research, kein Code) | **Differenzierung verstehen, Konzepte lernen** |
| **system-prompts** | Mittel | Niedrig (Research, kein Code) | In Brain aufnehmen, als Competitive Intelligence |
| **superpowers (Ideen)** | Mittel | Mittel (bestehende Skills verbessern) | Konzepte studieren, Two-Stage Review, Task-Granularität |
| **agent-skills** | Niedrig | Niedrig (redundant) | Ignorieren |
| **tolaria** | Niedrig | Sehr hoch (AGPL, Architektur-Mismatch) | UX-Referenz bookmarken |

---

## 9. khoj-ai/khoj — DIREKTKONKURRENT (Self-Hostable AI Second Brain)

- **Link:** https://github.com/khoj-ai/khoj
- **Lizenz:** AGPL-3.0 (❌ Problematisch für kommerzielle SaaS)
- **Beschreibung:** Personal AI app — skaliert von On-Device bis Cloud-Enterprise. Chat mit lokalen/online LLMs, Dokumenten-Antworten, Custom Agents, Automatisierungen.
- **Stars:** ~30k+
- **Stack:** Python, PostgreSQL

### Key Features

| Feature | Beschreibung |
|---|---|
| **Multi-Format Ingestion** | PDF, Markdown, Notion, Word, org-mode, Bilder |
| **Custom Agents** | Agents mit custom knowledge, persona, chat model, tools |
| **Automatisierungen** | Personal newsletters, smart notifications |
| **Multi-Client** | Browser, Obsidian, Emacs, Desktop, Phone, WhatsApp |
| **Semantic Search** | Advanced semantic search über alle Dokumente |
| **Self-Hostable** | Docker, lokal, cloud-hybrid |
| **Image Generation** | Bildgenerierung, Sprachausgabe |

### Vergleich: Khoj vs. GBrain

| Aspekt | **Khoj** | **GBrain** |
|---|---|---|
| **Lizenz** | AGPL-3.0 (Copyleft) | Permissive (MIT-style) |
| **Slogan** | "Your AI second brain" | "Next Postgres for memory" |
| **Backend** | Python + PostgreSQL | Bun/TypeScript + PGLite/Postgres |
| **Knowledge Graph** | ❌ Kein Graph | ✅ Typed edges, self-wiring |
| **Dream Cycle** | ❌ Kein 24/7 Autopilot | ✅ Cron, lint, enrich, consolidate |
| **Skills-System** | ❌ Kein Skill-System | ✅ 60+ Skills, RESOLVER.md |
| **Schema-Enforcement** | ❌ Kein Schema | ✅ Schema-Packs, brain-taxonomist |
| **Entity Extraction** | ❌ Nicht explizit | ✅ Bei jeder Ingestion |
| **Multi-Brain** | ❌ Single-Brain | ✅ Multi-Brain, Multi-Source, Mounts |
| **SaaS-Ready** | ✅ Enterprise verfügbar | 🟡 Sigmabrain-SaaS in Bau |
| **Dokumenten-Handling** | ✅ PDF, Word, Notion, Bilder | ⚠️ Markdown/Audio/Video, PDF nur Upload |

### Was GBrain lernen kann

1. **Multi-Format Ingestion:** Khoj liest PDF, Word, Notion, org-mode nativ. GBrain braucht das dringend.
2. **Custom Agents:** Khoj's Agent-Builder mit Personas und Tools ist intuitiv. GBrain's Skills sind mächtiger, aber komplexer.
3. **Multi-Client:** Browser, Obsidian, Emacs, WhatsApp. GBrain ist CLI+MCP-zentriert.
4. **WhatsApp-Integration:** Für Voice-Notes und schnelle Erfassung.

### Warum Khoj KEIN direkter Code-Quelle ist

- **AGPL-3.0:** Jede Derivat-Arbeit muss AGPL sein — kommerzieller SaaS-Betrieb unmöglich.
- **Python-Stack:** Komplett anders als GBrain's Bun/TypeScript.
- **Kein Graph, kein Schema, kein Dream Cycle:** Khoj ist ein "Dokumenten-Chatbot", kein "Knowledge Brain".

### Action Items
- [ ] **In Brain aufnehmen** als Competitive Intelligence (`concepts/competitive-intelligence/khoj.md`)
- [ ] **Multi-Format-Ingestion als GBrain-Skill bauen** — Inspiration von Khoj, aber eigene Implementierung
- [ ] **Agent-Builder UI evaluieren** — für Sigmabrain-Dashboard (Custom Agents mit Personas)
- [ ] **AGPL-Lizenz-Note:** Niemals Code kopieren — nur Konzepte studieren

---

## 10. supermemoryai/supermemory — DIREKTKONKURRENT (Memory API)

- **Link:** https://github.com/supermemoryai/supermemory
- **Lizenz:** Nicht explizit genannt (vermutlich proprietär für SaaS, Open Source für Teile)
- **Beschreibung:** **"The Memory API for the AI era"** — Memory und Context Engine, extrem schnell, skalierbar, fully local.
- **Stars:** ~20k+
- **Backed by:** Y Combinator (S24)

### Core Pipeline

```
Your app / AI tool
↓
Supermemory
├── Memory Engine        → Extracts facts, tracks updates, resolves contradictions, auto-forgets
├── User Profiles        → Static facts + dynamic context, always fresh
├── Hybrid Search        → RAG + Memory in one query
├── Connectors           → Google Drive, Gmail, Notion, GitHub, Web Crawler
└── File Processing      → PDFs, images, videos, code → searchable chunks
```

### Key Features

| Feature | Beschreibung |
|---|---|
| **Memory Engine** | Extrahiert Fakten, tracked Updates, resolved Widersprüche, vergisst automatisch |
| **User Profiles** | `profile.static` (langfristig) + `profile.dynamic` (aktuell) |
| **Hybrid Search** | RAG + Memory kombiniert — nicht nur Dokumenten-Retrieval |
| **Connectors** | Google Drive, Gmail, Notion, OneDrive, GitHub, Web Crawler |
| **File Processing** | PDFs, Bilder, Videos, Code → searchable |
| **MCP Server** | `https://mcp.supermemory.ai/mcp` — OAuth, alle Clients |
| **Plugins** | Claude Code, Cursor, Windsurf, VS Code, OpenClaw, Hermes |
| **Self-Hosted** | `curl -fsSL https://supermemory.ai/install \| bash`, embedded graph engine |
| **Benchmarks** | LongMemEval, LoCoMo, ConvoMem — state of the art |

### Memory vs. RAG (Supermemory's Kern-Erkenntnis)

> "Memory is not RAG. RAG retrieves document chunks — stateless, same results for everyone. Memory extracts and tracks facts about users over time."

Supermemory resolved automatisch Widersprüche: "Ich bin nach SF gezogen" ersetzt "Ich wohne in NYC". Temporäre Fakten verfallen automatisch.

### Vergleich: Supermemory vs. GBrain

| Aspekt | **Supermemory** | **GBrain** |
|---|---|---|
| **Positionierung** | Memory API für Apps | Knowledge Brain für Agents |
| **Slogan** | "The Memory API" | "Next Postgres for memory" |
| **Memory Engine** | ✅ Fakten-Extraktion, Widerspruchs-Resolution, Auto-Forget | ⚠️ Partiell (Entity-Extraction, keine Widerspruchs-Resolution) |
| **User Profiles** | ✅ `static` + `dynamic` | ❌ Kein explizites User-Profile-System |
| **Connectors** | ✅ 6 Connectors (Google Drive, Gmail, Notion, GitHub...) | ⚠️ `media-ingest`, `voice-note-ingest` — keine externen Connectors |
| **File Processing** | ✅ PDF, Bilder, Videos, Code | ✅ PDF/DOCX/E-Mail/Excel (document-ingest Skill + OCR) |
| **Graph** | ✅ Graph Engine | ✅ Typed edges (komplexer) |
| **Self-Hosting** | ✅ One binary, zero config | ✅ PGLite, zero config |
| **Schema** | ❌ Kein Schema | ✅ Schema-Packs |
| **Dream Cycle** | ❌ Kein 24/7 Autopilot | ✅ Cron, lint, enrich, consolidate |
| **Skills** | ❌ Kein Skill-System | ✅ 60+ Skills |
| **SaaS** | ✅ Produktionsreif | 🟡 In Bau (Sigmabrain) |

### Was GBrain lernen kann (KRITISCH)

1. **Memory Engine mit Widerspruchs-Resolution:** GBrain hat Entity-Extraction, aber keine Logik für "neue Info ersetzt alte Info". Das ist ein **echtes Gap**.
2. **User Profiles:** `profile.static` + `profile.dynamic` für kontextuelles Agent-Verhalten. GBrain hat `people/` und `companies/` Seiten, aber kein "aktuelles Kontext-Profil".
3. **Connectors:** Google Drive, Gmail, Notion, GitHub — automatische Ingestion. GBrain braucht das für SaaS.
4. **Auto-Forget:** Temporäre Fakten automatisch verfallen lassen. GBrain hat `soul-audit` (manuelles Bereinigen), aber keinen automatischen Expiry.

### Action Items
- [ ] **In Brain aufnehmen** als `concepts/competitive-intelligence/supermemory.md`
- [ ] **Memory-Engine-Design studieren:** Wie resolved Supermemory Widersprüche? → GBrain's Entity-System erweitern
- [ ] **User-Profile-System evaluieren:** `people/<person>.md` um "aktueller Kontext" erweitern
- [ ] **Auto-Forget-Mechanismus:** Temporäre Fakten mit TTL versehen (z.B. "meeting morgen" → Auto-Expire nach Datum)
- [ ] **Connector-Skills planen:** `google-drive-ingest`, `gmail-ingest`, `notion-ingest`, `github-ingest`

---

## 11. topoteretes/cognee — DIREKTKONKURRENT (AI Memory Platform)

- **Link:** https://github.com/topoteretes/cognee
- **Lizenz:** Apache-2.0 ✅
- **Beschreibung:** **"Open-source AI memory platform for agents"** — persistent long-term memory mit self-hosted knowledge graph engine.
- **Stars:** ~10k+

### Key Features

| Feature | Beschreibung |
|---|---|
| **Company Brain** | Unify data from various sources, enable agents with domain knowledge |
| **Knowledge Infrastructure** | Unified ingestion, graph/vector search, local, ontology grounding, multimodal |
| **Persistent Agents** | Learn from feedback, context management, cross-agent knowledge sharing |
| **Trustworthy Agents** | Agentic user/tenant isolation, traceability, OTEL collector, audit traits |
| **Ontology Grounding** | Concepts werden in ontologische Strukturen eingebettet |
| **Multimodal** | Nicht nur Text, auch Bilder/Videos |

### Vergleich: Cognee vs. GBrain

| Aspekt | **Cognee** | **GBrain** |
|---|---|---|
| **Lizenz** | Apache-2.0 ✅ | Permissive ✅ |
| **Slogan** | "AI memory platform for agents" | "Next Postgres for memory" |
| **Knowledge Graph** | ✅ Graph Engine | ✅ Typed edges |
| **Ontology Grounding** | ✅ Explicit | ⚠️ Implicit (Schema-Packs) |
| **Multimodal** | ✅ Angekündigt | ⚠️ Bild-OCR, Video/Audio |
| **Tenant Isolation** | ✅ Agentic isolation | ✅ Multi-Brain, fuzz-getestet |
| **Traceability** | ✅ OTEL, audit traits | ⚠️ Audit-Trail begrenzt |
| **Dream Cycle** | ❌ Nicht erwähnt | ✅ Cron, lint, enrich, consolidate |
| **Skills** | ❌ Nicht erwähnt | ✅ 60+ Skills |
| **Benchmarks** | ❌ Nicht erwähnt | ✅ BrainBench, LongMemEval |

### Was GBrain lernen kann

1. **Ontology Grounding:** Cognee embeddet Konzepte in explizite Ontologien. GBrain's Schema-Packs sind ähnlich, aber nicht als Ontologie modelliert.
2. **Traceability / Audit:** OTEL Collector + Audit Traits für enterprise-grade Observability.
3. **Multimodalität:** Cognee geht über Text hinaus (Bilder, Videos). GBrain braucht das für die Zukunft.

### Action Items
- [ ] **In Brain aufnehmen** als `concepts/competitive-intelligence/cognee.md`
- [ ] **Ontology-Modell evaluieren:** Können GBrain's Schema-Packs zu expliziten Ontologien werden?
- [ ] **Traceability erweitern:** OTEL-Integration für enterprise-grade Observability

---

## 12. Weitere ChatGPT-Empfehlungen — Kurze Einschätzung

| Repo | Lizenz | Einschätzung |
|---|---|---|
| **Mem0** | Kommerziell | Closed-Source SaaS mit API, kein OSS-Code. Nicht evaluierbar. |
| **Zep** | Kommerziell | Closed-Source Memory-Layer, API-only. Nicht evaluierbar. |
| **Letta** | OSS (?) | AI Agent Framework mit Memory. Nicht detailliert geprüft. |
| **Hindsight (Vectorize)** | Kommerziell | Enterprise Memory, API-only. Nicht evaluierbar. |
| **raold/second-brain** | Unbekannt | Niedrige Relevanz, vermutlich Experiment. |
| **flepied/second-brain-agent** | Unbekannt | Niedrige Relevanz, vermutlich Experiment. |
| **Vaquill-AI/awesome-legaltech** | N/A | Nur eine Liste, kein Code. Keine direkte Nutzbarkeit. |
| **danielrosehill/Personal-AI-Resources** | N/A | Nur eine Liste. Keine direkte Nutzbarkeit. |

**Fazit:** ChatGPT's Empfehlungen decken den Markt ab, aber die meisten sind entweder **kommerzielle Produkte** (Mem0, Zep, Hindsight) ohne OSS-Code oder **Listen** ohne Implementierung. Die drei OSS-Projekte (Khoj, Supermemory, Cognee) sind alle **Direktkonkurrenten** mit unterschiedlichen Stärken.

---

## Prioritäts-Matrix (aktualisiert)

| Repo | Direkter Nutzen | Integration-Aufwand | Empfohlene Aktion |
|---|---|---|---|
| **pm-skills** | Hoch | Hoch (neue Skills bauen) | Konzepte extrahieren → GBrain-Skills |
| **last30days-skill** | Hoch | Hoch (neue Skills bauen) | Blueprint für `social-signal`-Skills |
| **supermemory** | **Hoch** | Niedrig (Research, Konzepte) | **Memory-Engine, User Profiles, Auto-Forget, Connectors** |
| **hivemind (Konkurrent)** | **Hoch** | Niedrig (Research, kein Code) | Differenzierung verstehen, Konzepte lernen |
| **khoj (Konkurrent)** | Mittel-Hoch | Niedrig (Research, AGPL) | Multi-Format-Ingestion, Agent-Builder UI |
| **maigret (Idee)** | Mittel-Hoch | Hoch (neuer Skill) | API-basiertes `social-signal-enrich` bauen |
| **cognee (Konkurrent)** | Mittel | Niedrig (Research) | Ontology Grounding, Traceability |
| **system-prompts** | Mittel | Niedrig (Research, kein Code) | In Brain aufnehmen, als Competitive Intelligence |
| **superpowers (Ideen)** | Mittel | Mittel (bestehende Skills verbessern) | Konzepte studieren, Two-Stage Review, Task-Granularität |
| **agent-skills** | Niedrig | Niedrig (redundant) | Ignorieren |
| **tolaria** | Niedrig | Sehr hoch (AGPL, Architektur-Mismatch) | UX-Referenz bookmarken |
| **train-llm-from-scratch** | Niedrig | Irrelevant | Ignorieren (Lernprojekt) |
| **MoneyPrinterTurbo** | Niedrig | Irrelevant | Ignorieren (Video-Generation) |
| **MasterDnsVPN** | Niedrig | Irrelevant | Ignorieren (Netzwerk-Tool) |

---

## Master-Action-Items (aus allen Evaluierungen)

### Sofort (Next 30 Tage)
- [ ] **Supermemory's Memory-Engine studieren:** Widerspruchs-Resolution, Auto-Forget → GBrain Entity-System erweitern
- [x] **Document-Ingestion Pipeline implementieren:** `document-ingest` Skill + OCR-Fallback in `extract-document.ts` ✅
- [ ] **Schema-Packs für Verticals bauen:** Legal (Deadline-Calculator), Tax, Medical
- [ ] **User-Profile-System evaluieren:** `profile.static` + `profile.dynamic` für GBrain
- [ ] **Connector-Skills planen:** Google Drive, Gmail, Notion, GitHub (inspiriert von Supermemory)

### Mittelfristig (30-90 Tage)
- [ ] **PM-Skills bauen:** `opportunity-solution-tree`, `assumption-mapping`, `prd-author` (aus pm-skills)
- [ ] **Social-Signal-Skills bauen:** `last30days-skill`-Konzepte adaptieren
- [ ] **Session-Tracing evaluieren:** Opt-in, lokal (inspiriert von Hivemind)
- [ ] **Ontology-Grounding evaluieren:** Schema-Packs zu expliziten Ontologien (inspiriert von Cognee)

### Langfristig (90+ Tage)
- [ ] **Sigmabrain SaaS launch:** Domain, Stripe, Hosting, Multi-Tenant-Provisioning
- [ ] **Team-Features:** Shared workspaces (inspiriert von Hivemind, aber als Enterprise-Tier)
- [ ] **Native Apps:** iOS/Android via Capacitor (Subsumio's Scaffold als Referenz)
- [ ] **Vertical Skills:** Legal (Deadline-Calculator), Tax, Medical, Recruiting

---

## Nächster Schritt

Wenn Interesse besteht, die hochpriorisierten Skills (`pm-skills`-Konzepte, `last30days`-Konzepte) in GBrain zu adaptieren:

1. Einzelne PM-Frameworks priorisieren (z.B. OST → Interview-Prep → Assumption Mapping)
2. Pro Framework einen Blueprint nach GBrain's Phase 0–6 erstellen
3. Via `skill-creator` → `testing` → `skill-optimizer` pipeline abarbeiten

---

## Subsumio (Legal Ops CoPilot) — verifizierte Bewertung (11. Juni 2026)

- **Quelle:** lokaler Scan `~/Sigmacode IDE/subsumio-app` (AFFiNE-Fork, NestJS + Prisma + React + Electron)
- **Code übernehmen:** Nein — 100 % Stack-Mismatch (NestJS/Prisma vs. Bun/CLI/MCP). Bestätigt.
- **Konzept-für-Konzept gegen die echte Engine geprüft** (die ursprüngliche Analyse
  unterschätzte gbrain an drei Stellen):

| Subsumio-Konzept | Befund nach Code-Verifikation | Aktion |
|---|---|---|
| Document-Ingestion-Pipeline (PDF/OCR) | **Echte Lücke — bestätigt.** Engine konnte nur Markdown/Code/Bilder; `media-ingest` war Spezifikation ohne Implementierung. | ✅ **GEBAUT:** `src/core/extract-document.ts` — PDF (Text-Layer + OCR-Fallback via pdf2pic), DOCX, EML, CSV/TSV, XLSX, Audio-Transkription. Verdrahtet in `importFromFile`, `gbrain import` (default an), `gbrain sync` (Gate `GBRAIN_INGEST_DOCUMENTS`). Tests: `test/extract-document.test.ts`. |
| Entity-Extraktion bei Ingestion | **Keine Lücke.** Der Wissensgraph extrahiert typisierte Kanten bei jedem Write (edge-extractor, ohne Extra-LLM-Calls); enrich/signal-detector decken Anreicherung ab. | Keine. |
| Hybrid RAG + BM25-Tuning + Cache | **Keine Lücke — gbrain ist hier weiter.** Hybrid (Vector+BM25+Graph, RRF), `query_cache` mit knobs_hash-Isolation, Search-Modes als Kostenhebel. Subsumios In-Process-Cache (5 Min TTL) ist schwächer als unser DB-Cache mit Similarity-Lookup. | Keine. |
| Deadline-Extraktion + Feiertags-Kalkulation (DE/AT) | **Teil-Lücke.** Timeline-Ops existieren (`add_timeline_entry`), aber keine automatische Fristen-Erkennung bei Ingestion. Für die Legal/Tax-Vertikale wertvoll. | Kandidat: `deadline-extract`-Skill (Ingestion-Hook → timeline). Nach Wedge-Traktion. |
| ReAct-Agent mit Tool-Calling | **Keine Lücke.** MCP-Server IST das Tool-Calling-Interface (search/get_page/graph/timeline); `gbrain agent run` + minion-orchestrator decken Agent-Loops ab. | Keine. |
| Audit-Trail (chained hashes) | **Teil-Lücke.** Es gibt Audit-Logs (slug-fallback, content-sanity, mcp_request_log), aber keine Entity-Änderungshistorie mit Hash-Kette. Compliance-Argument für Legal/Tax-Enterprise. | Kandidat fürs Enterprise-Tier. Nicht jetzt (K10 Scope). |

**Netto-Ergebnis:** 1 echte Lücke (Document-Ingestion) — in dieser Session geschlossen.
2 Teil-Lücken als priorisierte Kandidaten notiert. 3 vermeintliche Lücken waren keine.
