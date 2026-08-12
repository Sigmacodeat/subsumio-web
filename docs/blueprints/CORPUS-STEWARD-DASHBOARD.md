# Blueprint: Corpus Steward Dashboard

**Stand:** 2026-08-06
**Ziel:** Browser-basierte Browse/Search/Edit/Oberfläche für die 713.438 normalisierten AT-Dateien in `law-corpus/_normalized/`.

---

## 1. Ziel (User-Sicht)

Admins können im Browser:
- Die 25 AT-Korpora durchblättern (paginiert, gefiltert)
- Einzelne Dateien öffnen (Frontmatter + Body)
- Frontmatter-Felder editieren (court, date, ECLI, etc.)
- Body-Text editieren (Markdown)
- Dateien als "verified" / "needs review" / "defective" markieren
- Volltext-Suche über Frontmatter + Body
- Zufällige Stichproben pro Korpus ziehen
- Review-Workflow: Flag → Vorschlag → Approve → Apply

## 2. Architektur

### Backend (API Routes)
```
src/app/api/admin/corpus-files/
  ├── list/route.ts     GET    — paginierte Datei-Liste pro Korpus
  ├── read/route.ts     GET    — einzelne Datei (frontmatter + body)
  ├── write/route.ts    PUT    — Datei schreiben (mit .bak + audit)
  ├── search/route.ts   GET    — Volltext-Suche
  ├── flag/route.ts     POST   — Quality-Flag setzen
  └── sample/route.ts   GET    — Zufallsstichprobe
```

### Frontend (Tab in admin/corpus)
```
src/components/dashboard/corpus-steward/
  ├── CorpusStewardTab.tsx       — Haupt-Tab-Container
  ├── CorpusFileBrowser.tsx      — Liste + Filter + Pagination
  ├── CorpusFileViewer.tsx       — Datei-Ansicht (Frontmatter + Body)
  ├── CorpusFileEditor.tsx       — Editier-Modus
  └── QualityFlagBadge.tsx       — Flag-Anzeige
```

### Persistenz
- **Quality Flags:** `law-corpus/_normalized/_steward-flags.json` (Sidecar, überlebt Re-Import)
- **Audit-Log:** `law-corpus/_normalized/_steward-audit.jsonl` (append-only)
- **Backups:** `.bak` Dateien neben den Originalen

## 3. Security

- Path-Confinement: nur `law-corpus/_normalized/at-*/` erlaubt
- Kein `..` Traversal
- Admin-only (`action: "admin.*"`)
- Backup vor jedem Write
- Audit-Log für jede Änderung

## 4. Edge Cases

- 713K Dateien → Server-side Pagination (50/page)
- Suche → Server-side (grep über Dateinamen + Frontmatter, limit 100)
- Große Dateien → Body auf 100KB limitiert in UI
- Concurrent Edits → Last-Write-Wins + content_hash Check
