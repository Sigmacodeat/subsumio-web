# GBrain Fork-Analyse: Vollständiger Plan & Ergebnisse

**Datum:** 2026-06-11
**Gesamt Forks:** 3184
**Quelle:** https://github.com/garrytan/gbrain/forks

---

## PHASE 0 — ERGEBNIS ÜBERSICHT ( bereits ermittelt )

| Metrik | Wert |
|--------|------|
| Gesamt Forks | **3.184** |
| Mit Umbenennung (eigene Branding) | **203** |
| Mit Stars > 0 | **83** |
| Mit offenen Issues | **38** |
| Pushed in letzten 7 Tagen | **350** |

---

## PHASE 1 — PRIORISIERUNGSSYSTEM

Da 3.184 Forks manuell unmöglich sind, wird ein mehrdimensionales Scoring angewendet:

| Signal | Gewichtung | Begründung |
|--------|-----------|------------|
| **Umbenannte Repos** | +20 Punkte | Eigene Vision = echter Fork, nicht nur Kopie |
| **Stars** | +10 pro Star | Community-Interesse = Qualitätsindikator |
| **Offene Issues** | +3 pro Issue | Aktive Entwicklung / Bug-Diskussion |
| **Forks des Forks** | +5 pro Fork | Weiterverbreitung |
| **Größenabweichung** | +5/+10 Punkte | Code-Änderungen (hinzugefügt/entfernt) |
| **Recent Push** | +15/+10/+5 Punkte | Aktivität (<7d / <30d / <60d) |

---

## PHASE 2 — TOP-KANDIDATEN (manuell geprüft)

### 🔴 TIER 1 — Hohe Übernahmewahrscheinlichkeit

#### 1. PROPAGANDAnow/gbrain ("PropBrain")
- **Score:** 65 | **Stars:** 0 | **Issues:** 3 | **Commits:** 89+
- **URL:** https://github.com/PROPAGANDAnow/gbrain
- **Beschreibung:** Umbenannt zu "PropBrain", hat **34 Skills** (Original hat weniger)
- **Neue Skills identifiziert:**
  - `perplexity-research` — Brain-Augmented Web Research mit Perplexity-Integration
  - `strategic-reading` — Applied Analysis from Source Texts
  - `repo-architecture` — Architektur-Analyse-Skill
  - `media-ingest` — Medien-Ingestion
- **Neue Konvention:**
  - `_friction-protocol.md` — `gbrain friction log` CLI-Befehl für UX-Feedback
    - Severity-Level: blocker, error, confused, nit + delight
    - Automatisches Rendering: `gbrain friction render --run-id <id>`
    - Redaction für sicheres Sharing in PRs/Issues
- **Empfehlung:** ⭐⭐⭐ **HÖCHSTE PRIORITÄT** — Friction-Protocol und Research-Skills sind produktionsreife Erweiterungen

#### 2. momoiicom/open-gbrain
- **Score:** 60 | **Stars:** 1 | **Issues:** 6
- **URL:** https://github.com/momoiicom/open-gbrain
- **Beschreibung:** "Open Version that can work with any AI"
- **Neue Artefakte:**
  - `skills/manifest.json` — Skill-Manifest für externe Integration
  - `skills/_output-rules.md` — Output-Formatierungsregeln
- **Skills:** 29 Skills (ggf. neue / modifizierte)
- **Empfehlung:** ⭐⭐ Manifest-System und Output-Rules prüfen

#### 3. electricsheephq/eva-brain
- **Score:** 60 | **Stars:** 3 | **Issues:** 25
- **URL:** https://github.com/electricsheephq/eva-brain
- **Beschreibung:** "Pre-packaged Gbrain for easy setup. Includes Openclaw + Codex plugins (includes OAuth so no API needed)."
- **Features:**
  - OAuth 2.1 Integration (kein API-Key nötig)
  - OpenClaw + Codex Plugins vorinstalliert
  - Knowledge-Base Integration via openclaw-support-kb
  - 12 Releases (vs. Original weniger)
- **Empfehlung:** ⭐⭐⭐ **HÖCHSTE PRIORITÄT** — OAuth und Pre-packaging sind massive UX-Verbesserungen

### 🟡 TIER 2 — Mittlere Übernahmewahrscheinlichkeit

#### 4. meghendra6/mbrain
- **Score:** 55 | **Commits:** 93+ | **Umbenannt:** Ja
- **URL:** https://github.com/meghendra6/mbrain
- **Beschreibung:** "Local-first Markdown brain for AI agents"
- **Status:** Aktiv entwickelt (Commits bis 2026-06-11)
- **Empfehlung:** ⭐⭐ Commits diff analysieren — möglicherweise Local-first-Optimierungen

#### 5. Nick-2003/gbrain-deploy
- **Score:** 55 | **Stars:** 1 | **Umbenannt:** Ja
- **URL:** https://github.com/Nick-2003/gbrain-deploy
- **Beschreibung:** Deploy-Fokus
- **Status:** Aktiv entwickelt (Commits Mai–Juni 2026)
- **Empfehlung:** ⭐⭐ Deployment-Automation prüfen

#### 6. LexClaw/gbrain
- **Score:** 45 | **Issues:** 5
- **URL:** https://github.com/LexClaw/gbrain
- **Status:** Aktiv entwickelt (Commits Mai–Juni 2026)
- **Empfehlung:** ⭐⭐ Issues lesen — oft enthalten Feature-Requests, die auf upstream fehlen

#### 7. joedanz/pbrain
- **Score:** 55 | **Stars:** 2 | **Umbenannt:** Ja (pbrain)
- **URL:** https://github.com/joedanz/pbrain
- **Empfehlung:** ⭐ Commits/Diffs prüfen

### 🟢 TIER 3 — Spezialisierte Forks (Domain-specific)

#### 8. MohitKumar1991/finbrain
- **Score:** 45 | **Umbenannt:** Ja
- **Beschreibung:** "A fork of Gbrain optimized for storing financial research"
- **URL:** https://github.com/MohitKumar1991/finbrain
- **Empfehlung:** ⭐ Domain-Spezialisierung als Skill extrahierbar

#### 9. kilo323/gbrain-docker-nouse
- **Score:** 50 | **Umbenannt:** Ja
- **Beschreibung:** Docker-Fokus (Größe 28MB vs. Original 61MB — stark reduziert)
- **URL:** https://github.com/kilo323/gbrain-docker-nouse
- **Empfehlung:** ⭐ Docker-Optimierungen prüfen

#### 10. caroline-zhu/zinbrain
- **Score:** 50 | **Umbenannt:** Ja
- **Beschreibung:** "Zingage's Agent Brain"
- **URL:** https://github.com/caroline-zhu/zinbrain
- **Empfehlung:** ⭐ Branchen-Spezialisierung?

---

## PHASE 3 — VOLLSTÄNDIGER DURCHGANG ALLER 3.184 FORKS

### Problemstellung
Ohne GitHub Personal Access Token (PAT) ist die API auf **60 Requests/Stunde** limitiert. Für 3.184 Forks mit Detail-Analyse (Commits, Diffs, File-Listen) werden **~5.000+ Requests** benötigt.

### Lösung: Drei-Stufen-Approach

#### Stufe A — Metadaten-Analyse (✅ ERFOLGT)
- Alle 3.184 Forks gesammelt via `GET /repos/{owner}/{repo}/forks`
- Gespeichert in `/tmp/gbrain-forks-all.json` (18MB)
- Top 100 priorisiert nach Scoring-System

#### Stufe B — Commit-Analyse der Top 100 (⚠️ BENÖTIGT TOKEN)
Für jeden der Top-100-Kandidaten:
- `GET /repos/{fork}/commits?since={fork_date}`
- Commit-Messages auf Feature-Keywords parsen:
  - `skill`, `feature`, `add`, `new`, `oauth`, `docker`, `deploy`, `manifest`, `friction`, `research`, `ingest`, `connector`
- Speichern in `/tmp/gbrain-forks-commits.json`

#### Stufe C — Detaillierte Diff-Analyse der Top 20 (⚠️ BENÖTIGT TOKEN)
Für jeden Top-20-Kandidaten:
- `GET /repos/garrytan/gbrain/compare/master...{owner}:{repo}:master`
- Neue Files identifizieren
- Modifizierte Files auf Feature-Relevanz prüfen
- README-Diffs auf neue Features prüfen

### Benötigtes Token
```bash
# Fine-Grained PAT oder Classic PAT
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
# Rate Limit: 5.000 req/h (suffizient für Stufe B+C)
```

---

## PHASE 4 — KONKRETE EMPFEHLUNGEN FÜR SIGMABRAIN

### Sofort übernehmbar (ohne weitere Analyse)

1. **Friction Protocol** (`_friction-protocol.md`)
   - Quelle: PROPAGANDAnow/gbrain
   - Wert: Systematisches UX-Feedback ohne manuelle Bug-Reports
   - Komplexität: Niedrig (reine Markdown-Konvention + CLI-Wrapper)
   - Pfad: `skills/_friction-protocol.md`

2. **Perplexity Research Skill**
   - Quelle: PROPAGANDAnow/gbrain
   - Wert: Web-Research mit Brain-Augmentation
   - Komplexität: Mittel (API-Integration)
   - Pfad: `skills/perplexity-research/SKILL.md`

3. **Strategic Reading Skill**
   - Quelle: PROPAGANDAnow/gbrain
   - Wert: Angewandte Quellenanalyse
   - Komplexität: Mittel
   - Pfad: `skills/strategic-reading/SKILL.md`

### Weiter zu prüfen (benötigt Diff-Analyse)

4. **OAuth 2.1 Integration** — electricsheephq/eva-brain
5. **Pre-packaged Setup** — electricsheephq/eva-brain
6. **Skill Manifest System** — momoiicom/open-gbrain
7. **Output Rules Convention** — momoiicom/open-gbrain
8. **Docker-Optimierung** — kilo323/gbrain-docker-nouse
9. **Local-first Optimierungen** — meghendra6/mbrain

---

## PHASE 5 — NÄCHSTE SCHRITTE

1. **[BENÖTIGT] GitHub Token bereitstellen** für Rate-Limit-Erhöhung auf 5.000 req/h
2. **Skript erweitern:** Commit-Analyse + Diff-Analyse für Top 100
3. **Feature-Extraktion:** Identifizierte Features in Sigmabrain-Struktur überführen
4. **Regression-Tests:** Für jede Übernahme Tests schreiben

---

## ANHANG: SKRIPTE

- `scripts/analyze-forks.ts` — Sammelt alle Forks via GitHub API
- `scripts/fork-prioritizer.ts` — Scored und priorisiert alle Forks
- `scripts/analyze-forks-summary.ts` — Statistiken und Übersichten

**Ergebnis-Dateien:**
- `/tmp/gbrain-forks-all.json` — Alle 3.184 Forks mit Metadaten
- `/tmp/gbrain-forks-top100.json` — Top 100 priorisierte Kandidaten
- `/tmp/gbrain-forks-active.json` — Detail-Analyse der ersten 45
- `/tmp/gbrain-forks-report.md` — Markdown-Report der ersten 45
