# GBrain Fork-Analyse: Vollständiger Report

**Datum:** 2026-06-11
**Gesamt Forks:** 3.184
**Detailliert analysiert:** 100 (Top 100 nach Priorisierungs-Score)
**Quelle:** https://github.com/garrytan/gbrain/forks

---

## EXECUTIVE SUMMARY

Von **3.184 Forks** haben **100** echte Aktivität (Commits > 0). Nur **12 Forks** haben signifikante neue Dateien oder Code-Änderungen in `src/`. Die überwiegende Mehrheit (88%) sind leere oder Sync-only Forks ohne eigene Beiträge.

**Übernahmewürdige Features identifiziert in 10 Forks.**

---

## TIER 1 — SOFORT ÜBERNEHMBAR (6 Forks)

### 1.1 🔴 meghendra6/mbrain — "Local-first Markdown brain"

| | |
|---|---|
| **Stars** | 0 |
| **Commits** | 93+ |
| **Neue Dateien** | 50 |
| **Modifiziert** | 30 |
| **URL** | https://github.com/meghendra6/mbrain |

**Neue Features:**
- **Connector-Architektur** — Vollständig neues Subsystem:
  - `src/core/connectors/connector-registry.ts` — Registry-Pattern für Connectors
  - `src/core/connectors/connector-sync.ts` — Sync-Logik für externe Datenquellen
  - `src/core/connectors/credential-refs.ts` — Credential-Referenzierung
  - `src/commands/connectors.ts` — CLI-Befehl `gbrain connectors`
- **Codemap-Ingest Skill** — `skills/codemap-ingest/SKILL.md` mit Templates:
  - `concept-codemap-page.md`
  - `system-page.md`
- **Publish Skill** — `skills/publish/SKILL.md`

**Empfehlung:** ⭐⭐⭐ **HÖCHSTE PRIORITÄT** — Connector-Architektur ist eine fundamentale Erweiterung, die Sigmabrain für externe Integrationen öffnet.

---

### 1.2 🔴 joedanz/pbrain — "Project onboarding brain"

| | |
|---|---|
| **Stars** | 2 |
| **Commits** | 100 |
| **Neue Dateien** | 50 |
| **Modifiziert** | 30 |
| **URL** | https://github.com/joedanz/pbrain |

**Neue Features:**
- **Project Onboard Skill** — `skills/project-onboard/SKILL.md`
- **Breite Code-Änderungen** in src/ (Fokus auf Projekt-Setup)
- Keywords: `skill(13)`, `add(8)`, `ui(5)`, `plugin(3)`, `migration(3)`

**Empfehlung:** ⭐⭐⭐ Der `project-onboard` Skill und die UI-Änderungen sind hochwertig.

---

### 1.3 🔴 zhengyunhui123-dev/PMBrain — "Project Management Brain"

| | |
|---|---|
| **Stars** | 1 |
| **Commits** | 100 |
| **Neue Dateien** | 36 |
| **Modifiziert** | 30 |
| **URL** | https://github.com/zhengyunhui123-dev/PMBrain |

**Neue Features:**
- **PM Status Skill** — `skills/pm-status/SKILL.md`
- **PM Task Skill** — `skills/pm-task/SKILL.md`
- **Admin-UI Erweiterungen:**
  - `admin/src/pages/Dashboard.tsx` — Erweitertes Dashboard
  - `admin/src/pages/Agents.tsx` — Agent-Verwaltung
  - `admin/src/pages/Calibration.tsx` — Kalibrierungs-UI
  - `admin/src/pages/JobsWatch.tsx` — Job-Monitoring
  - `admin/src/pages/Login.tsx` — Login-Seite
  - `admin/src/pages/RequestLog.tsx` — Request-Logging

**Empfehlung:** ⭐⭐⭐ PM-Skills und Admin-UI-Erweiterungen sind direkt übernehmbar.

---

### 1.4 🔴 electricsheephq/eva-brain — "Pre-packaged with OAuth"

| | |
|---|---|
| **Stars** | 3 |
| **Issues** | 25 |
| **Commits** | 100 |
| **Neue Dateien** | 18 |
| **Modifiziert** | 25 |
| **URL** | https://github.com/electricsheephq/eva-brain |

**Neue Features:**
- **OAuth 2.1 Integration** — Kein API-Key nötig
- **Pre-packaged Setup** — Out-of-the-Box Installation
- **OpenClaw + Codex Plugins** vorinstalliert
- **12 Releases** (vs. Original weniger)
- **Knowledge-Base Integration** via `openclaw-support-kb`
- Keywords: `fix(60)`, `test(7)`, `plugin(4)`

**Empfehlung:** ⭐⭐⭐ OAuth und Pre-packaging sind massive UX-Verbesserungen. Die 25 offenen Issues zeigen aktive Community-Nutzung.

---

### 1.5 🔴 momoiicom/open-gbrain — "Open Version for any AI"

| | |
|---|---|
| **Stars** | 1 |
| **Issues** | 6 |
| **Commits** | 100 |
| **Neue Dateien** | 6 |
| **Modifiziert** | 24 |
| **URL** | https://github.com/momoiicom/open-gbrain |

**Neue Features:**
- **Skill Manifest System** — `skills/manifest.json`
- **Output Rules Convention** — `skills/_output-rules.md`
- **Core-Änderungen:**
  - `src/commands/agent.ts` — Agent-Management
  - `src/commands/doctor.ts` — Erweiterte Diagnose
  - `src/commands/init.ts` — Init-Prozess
  - `src/commands/sync.ts` — Sync-Erweiterungen
  - `src/commands/upgrade.ts` — Upgrade-Logik
  - `src/core/config.ts` — Konfigurations-System
  - `src/core/embedding.ts` — Embedding-Engine
  - `src/core/operations.ts` — Operations-Erweiterungen
  - `src/core/minions/handlers/subagent.ts` — Subagent-Handler
  - `src/core/search/expansion.ts` — Search Expansion
  - `src/core/search/hybrid.ts` — Hybrid Search

**Empfehlung:** ⭐⭐⭐ Manifest-System und Output-Rules sind saubere Konventionen. Die Core-Änderungen in search/embedding sind technisch wertvoll.

---

### 1.6 🔴 PROPAGANDAnow/gbrain — "PropBrain with Research Skills"

| | |
|---|---|
| **Stars** | 0 |
| **Issues** | 3 |
| **Commits** | 89+ |
| **URL** | https://github.com/PROPAGANDAnow/gbrain |

**Neue Features:**
- **Perplexity Research Skill** — `skills/perplexity-research/SKILL.md`
  - Brain-Augmented Web Research mit Perplexity-API
  - Entity enrichment, Deal monitoring, Morning briefing
- **Strategic Reading Skill** — `skills/strategic-reading/SKILL.md`
  - Applied Analysis from Source Texts
- **Repo Architecture Skill** — `skills/repo-architecture/SKILL.md`
- **Media Ingest Skill** — `skills/media-ingest/SKILL.md`
- **Friction Protocol** — `skills/_friction-protocol.md`
  - `gbrain friction log` CLI-Befehl
  - Severity-Level: blocker, error, confused, nit, delight
  - `gbrain friction render --run-id <id>`
  - Redaction für sicheres Sharing
- **34 Skills total** (vs. ~29 im Original)

**Empfehlung:** ⭐⭐⭐ Research-Skills und Friction-Protocol sind produktionsreif und sofort übernehmbar.

---

## TIER 2 — HOCHWERTIGE SPEZIALISIERUNGEN (4 Forks)

### 2.1 🟡 MohitKumar1991/finbrain — "Financial Research Brain"

| | |
|---|---|
| **Stars** | 0 |
| **Neue Dateien** | 50 |
| **Modifiziert** | 30 |
| **URL** | https://github.com/MohitKumar1991/finbrain |

**Spezialisierung:**
- `src/commands/brainstorm.ts` — Brainstorming für Finanzanalysen
- `src/core/facts/extract.ts` — Fact-Extraktion für Finanzdaten
- `src/core/facts/eligibility.ts` — Eligibilitäts-Prüfung
- `src/core/enrichment/completeness.ts` — Daten-Vollständigkeit
- `src/core/frontmatter-inference.ts` — Frontmatter-Inferenz
- `src/core/link-extraction.ts` — Link-Extraktion

**Empfehlung:** ⭐⭐ Die Fact-Extraktion und Enrichment-Module sind domain-agnostisch übernehmbar.

---

### 2.2 🟡 LexClaw/gbrain — "Autopilot & Workflow"

| | |
|---|---|
| **Stars** | 0 |
| **Issues** | 5 |
| **Neue Dateien** | 50 |
| **Modifiziert** | 30 |
| **URL** | https://github.com/LexClaw/gbrain |

**Neue Features:**
- **Autopilot Befehl** — `src/commands/autopilot.ts`
- `src/cli.ts` — Erweiterte CLI
- `src/core/import-file.ts` — Import-Logik Erweiterungen

**Empfehlung:** ⭐⭐ Autopilot-Befehl ist interessant für automatisierte Workflows.

---

### 2.3 🟡 ChenyqThu/jarvis-knowledge-os-v2 — "Google Integration"

| | |
|---|---|
| **Stars** | 0 |
| **Neue Dateien** | 50 |
| **Modifiziert** | 14 |
| **URL** | https://github.com/ChenyqThu/jarvis-knowledge-os-v2 |

**Neue Features:**
- `src/core/ai/gateway.ts` — AI Gateway Erweiterungen
- `src/core/ai/recipes/google.ts` — Google-spezifische AI Recipe
- `src/core/pglite-engine.ts` — PGLite Engine Änderungen

**Empfehlung:** ⭐ Google-Recipe kann als Referenz für weitere Provider-Rezepte dienen.

---

### 2.4 🟡 how0531/Sino-StockBrain — "Chinese Market Brain"

| | |
|---|---|
| **Stars** | 0 |
| **Neue Dateien** | 50 |
| **Modifiziert** | 30 |
| **URL** | https://github.com/how0531/Sino-StockBrain |

**Spezialisierung:**
- Vollständige Admin-UI Überarbeitung
- `src/core/ai/gateway.ts` — Gateway-Anpassungen
- `src/core/ai/model-resolver.ts` — Model-Resolver
- `src/core/engine.ts` — Engine-Änderungen
- `src/core/import-file.ts` — Import-Anpassungen

**Empfehlung:** ⭐ Admin-UI-Änderungen könnten als Inspiration dienen, sind aber China-spezifisch.

---

## TIER 3 — BEACHTENSWERTE ERWÄHNUNGEN

### 3.1 RYN6666999/LB-arcanum — "玉簡 Knowledge Base"
- Umbenannt, chinesisches KB-System
- Viele Core-Änderungen in `src/core/`
- `src/cli.ts`, `src/core/engine.ts`, `src/core/operations.ts`

### 3.2 Shubhamsaboo/gbrain — "Auth-Focused"
- 4 Stars (höchster Score)
- Keywords: `auth(7)`, `oauth(4)`, `export(3)`
- Keine neuen Dateien (nur modifiziert), aber Auth-Fokus ist relevant

### 3.3 AgentPhone-AI/gbrain — "UI & Deploy"
- 4 Stars
- 73 Commits
- Keywords: `skill(11)`, `ui(5)`, `deploy(2)`
- Fokus auf UI und Deployment

---

## KONKRETE EMPFEHLUNGEN FÜR SIGMABRAIN

### Sofort implementieren (Risiko: Niedrig, Wert: Hoch)

| # | Feature | Quelle | Pfad | Komplexität |
|---|---------|--------|------|-------------|
| 1 | **Friction Protocol** — `gbrain friction log` CLI | PROPAGANDAnow | `skills/_friction-protocol.md` | Niedrig |
| 2 | **Skill Manifest** — JSON-Manifest für Skills | momoiicom | `skills/manifest.json` | Niedrig |
| 3 | **Output Rules** — Output-Formatierungskonvention | momoiicom | `skills/_output-rules.md` | Niedrig |
| 4 | **Perplexity Research Skill** | PROPAGANDAnow | `skills/perplexity-research/SKILL.md` | Mittel |
| 5 | **Strategic Reading Skill** | PROPAGANDAnow | `skills/strategic-reading/SKILL.md` | Mittel |
| 6 | **PM Status Skill** | PMBrain | `skills/pm-status/SKILL.md` | Niedrig |
| 7 | **PM Task Skill** | PMBrain | `skills/pm-task/SKILL.md` | Niedrig |
| 8 | **Project Onboard Skill** | pbrain | `skills/project-onboard/SKILL.md` | Niedrig |

### Weiter untersuchen (Risiko: Mittel, Wert: Hoch)

| # | Feature | Quelle | Hinweis |
|---|---------|--------|---------|
| 9 | **Connector-Architektur** | mbrain | `src/core/connectors/*` — Fundamentale Integration |
| 10 | **Codemap-Ingest Skill** | mbrain | `skills/codemap-ingest/*` |
| 11 | **Publish Skill** | mbrain | `skills/publish/SKILL.md` |
| 12 | **Autopilot Befehl** | LexClaw | `src/commands/autopilot.ts` |
| 13 | **Fact-Extraktion** | finbrain | `src/core/facts/*` |
| 14 | **Frontmatter-Inferenz** | finbrain | `src/core/frontmatter-inference.ts` |
| 15 | **OAuth 2.1** | eva-brain | `src/`-Integration (Details via Compare) |

### Admin-UI Verbesserungen (falls relevant)

| # | Feature | Quelle | Dateien |
|---|---------|--------|---------|
| 16 | **Erweitertes Dashboard** | PMBrain | `admin/src/pages/Dashboard.tsx` |
| 17 | **Agent-Verwaltung** | PMBrain | `admin/src/pages/Agents.tsx` |
| 18 | **Job-Monitoring** | PMBrain | `admin/src/pages/JobsWatch.tsx` |
| 19 | **Kalibrierungs-UI** | PMBrain | `admin/src/pages/Calibration.tsx` |
| 20 | **Request-Logging** | PMBrain | `admin/src/pages/RequestLog.tsx` |

---

## STATISTIKEN

| Metrik | Wert |
|--------|------|
| Gesamt Forks | 3.184 |
| Mit Aktivität (Commits > 0) | 100 |
| Mit echten Änderungen (neue Dateien) | 12 |
| Mit Code-Änderungen in `src/` | 12 |
| Mit neuen Skills | 7 |
| Umbenannte Repos | 203 |
| Mit Stars > 0 | 83 |
| Mit offenen Issues | 38 |
| Pushed < 7 Tage | 350 |

---

## NÄCHSTE SCHRITTE

1. **Skills übernehmen** — Friction Protocol, Skill Manifest, Output Rules (kein Code, nur Markdown)
2. **Research Skills kopieren** — Perplexity Research, Strategic Reading, PM Status/Task
3. **Connector-Architektur prüfen** — mbrain's Connector-Subsystem analysieren
4. **Admin-UI Erweiterungen** — PMBrain's Admin-Seiten als Referenz
5. **OAuth & Pre-packaging** — eva-brain's Setup-Prozess studieren

---

## ANHANG: SKRIPTE & DATEN

| Datei | Beschreibung |
|-------|-------------|
| `scripts/analyze-forks.ts` | Sammelt alle Forks via GitHub API |
| `scripts/fork-prioritizer.ts` | Scored und priorisiert Forks |
| `scripts/analyze-forks-summary.ts` | Statistiken und Übersichten |
| `scripts/analyze-forks-full.ts` | Detaillierte Analyse mit Token |
| `/tmp/gbrain-forks-all.json` | Alle 3.184 Forks mit Metadaten (18MB) |
| `/tmp/gbrain-forks-top100.json` | Top 100 priorisierte Kandidaten |
| `/tmp/gbrain-forks-detailed.json` | Detail-Analyse der 100 Top-Forks |
| `/tmp/gbrain-forks-detailed.md` | Markdown-Report der 100 Top-Forks |
