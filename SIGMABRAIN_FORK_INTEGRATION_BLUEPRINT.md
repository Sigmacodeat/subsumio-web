# Sigmabrain Fork-Integration Blueprint

## Ziel
Alle identifizierten Innovationen aus den GBrain-Forks (pbrain, PMBrain, eva-brain, gbrain-mini) in Sigmabrain integrieren.

## Kern-Userflows
1. **Power-User**: Nutzt Obsidian als Vault-Frontend, Sigmabrain als Backend. Bi-temporale Kanten zeigen Karriere-Verläufe.
2. **Project Manager**: Importiert .docx/.xlsx/.mp3 direkt, verwendet Admin-Console für Überblick.
3. **Developer**: Nutzt pbrain-ähnliche Projekt-Onboarding-Funktionen.

## Features & Quellen

### 1. Bi-temporale Kanten (pbrain v0.3.0) — HIGH
**Was**: Links merken sich ihre Historie. `valid_from`, `valid_to`, `superseded_by` auf Kanten.
**User-Value**: "Wo hat Alice vorher gearbeitet?" "Wann hat sich die Investitionsbeziehung geändert?"
**Implementierung**:
- Schema-Migration: `links` Tabelle erweitern um `valid_from`, `valid_to`, `superseded_by` (nullable)
- Engine: `addLink` schreibt neue Version, `supersedeLink` setzt `valid_to` auf alte Kante
- `getLinks` filtert standardmäßig auf `valid_to IS NULL` (aktuelle Kanten)
- `gbrain graph-query --history` zeigt alle Versionen
- Migration: bestehende Kanten bekommen `valid_from = created_at`, `valid_to = NULL`

### 2. Obsidian-Kompatibilität (pbrain) — HIGH
**Was**: Jede Seite ist standard Markdown mit `[[Wikilinks]]`, YAML-Frontmatter (`tags:`, `aliases:`), inline `#tag`-Footern.
**User-Value**: Obsidian-Graph-View, Backlinks, Dataview-Plugin lesen Sigmabrain nativ.
**Implementierung**:
- `aliases:` in Frontmatter → `pages.aliases` JSONB-Spalte oder separate `page_aliases` Tabelle
- `#tag`-Extraktion aus Markdown-Footern (letzte Zeile oder inline)
- Obsidian-Graph-Export API: `gbrain export obsidian-graph` → JSON für Obsidian-Graph-View
- Atomare Schreibvorgänge mit 60-Sekunden-Cooldown auf aktuell editierte Dateien
- `gbrain doctor --obsidian` prüft: wikilink-Integrity, tag-Parsing, slug-Collisions

### 3. Duplicate Entity Prevention (pbrain) — MEDIUM
**Was**: Beim Erstellen neuer Entitäten werden ähnliche Slugs vorgeschlagen.
**User-Value**: Keine Dopplungen von Personen/Companies.
**Implementierung**:
- `put_page` Skill: vor dem Write `gbrain search --slug-similarity <slug>`
- UI: "Ähnliche Entitäten gefunden: people/alice-chen, people/alice-cheng"

### 4. Audio-Import (PMBrain) — MEDIUM
**Was**: `.mp3`, `.wav`, `.m4a` direkt importieren.
**User-Value**: Meetings, Voice-Memos ins Brain.
**Implementierung**:
- `extract-document.ts` erweitern um Audio-Formate
- Speech-to-Text via OpenAI Whisper API (oder lokales Modell)
- Transkript wird als Markdown-Page mit `type: transcription` importiert

### 5. Admin Console Visualisierung (PMBrain) — MEDIUM
**Was**: Browser-Admin zeigt Datenquellen, Vektorisierungs-Coverage, MCP-Status, Task-Health.
**User-Value**: Visueller Überblick über Brain-Zustand.
**Implementierung**:
- `Dashboard.tsx` erweitern:
  - Sources-Chart (Anzahl Pages pro Source)
  - Embedding-Coverage-Chart (% vektorisiert)
  - MCP-Status-Panel (verbundene Clients)
  - Task-Health-Panel (laufende/abgeschlossene Jobs)
  - Link-Temporal-View (bi-temporale Kanten visualisiert)

### 6. Natural Language Console (PMBrain) — LOW
**Was**: Im Admin-Browser NL-Input: "Importiere Projekt-Dokumente", "Sync alle Quellen"
**User-Value**: Kein CLI für einfache Operationen nötig.
**Implementierung**:
- Neue Admin-Seite `NLConsole.tsx`
- Intent-Recognition via konfiguriertem LLM
- Mapping auf erlaubte Sigmabrain-Operationen

### 7. Multi-Model Support (open-gbrain, PMBrain) — ALREADY DONE
Sigmabrain unterstützt bereits Anthropic, OpenAI, DeepSeek, custom endpoints.

### 8. Office Document Import — MOSTLY DONE
Sigmabrain unterstützt bereits `.pdf`, `.docx`, `.xlsx`, `.csv`, `.tsv`, `.eml`.
Fehlt: `.mp3`, `.wav`, `.m4a`, `.xls`.

### 9. Eval Framework — ALREADY DONE
Sigmabrain hat bereits `eval-retrieval-quality`, `eval-export`, `eval-replay`, `eval-cross-modal`, `eval-longmemeval`, `eval-suspected-contradictions`.
pbrain's strukturierte Pipeline ist interessant aber redundant.

## Architektur-Entscheidungen
- Bi-temporale Kanten: Spalten auf `links` Tabelle (keine separate History-Tabelle) für Einfachheit
- Obsidian-Integration: Opt-in via Config-Flag `obsidian_compatible: true`
- Audio-Import: Async-Job-Queue (bestehende Minions-Infrastruktur)
- Admin-Visualisierung: Recharts oder einfache SVG-Charts (kein schweres Framework)

## Edge-Cases
- Bi-temporale Kanten: Was passiert bei `removeLink`? → `valid_to = now()` statt DELETE
- Obsidian-Cooldown: Was wenn der Nutzer Obsidian nicht benutzt? → Cooldown nur wenn Datei im Brain-Verzeichnis existiert und mtime < 60s
- Audio-Import: Große Dateien → Chunking, Whisper hat 25MB-Limit

## Definition of Done
- [ ] Alle Features haben Tests
- [ ] `gbrain doctor` erkennt alle neuen Features
- [ ] Admin-Console zeigt neue Visualisierungen
- [ ] Keine Regressions in bestehenden Tests (`bun test`)
