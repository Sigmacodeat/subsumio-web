# Corpus-Struktur-Referenz — Subsumio

**Stand: 2026-08-21**
**Zweck:** Einzige Wahrheit über Disk-Struktur, DB-Schema, Import-Pfade.
Jeder der sich fragt "welche Datei wohin?" findet es hier.

---

## 1. Disk-Struktur (Single Source of Truth)

```
law-corpus/
├── at-normen/              ← RAW (RIS-XML, norm-genau, 1 Norm = 1 Datei)
├── at-judikatur-vwgh/      ← RAW
├── at-landesrecht/         ← RAW
├── at-judikatur-ogh/       ← RAW
├── ... (alle Korpora)
│
├── _normalized/            ← NORMALIZED (kanonisch, bereinigt, dedupiert)
│   ├── at-normen/
│   ├── at-judikatur-vwgh/
│   ├── at-landesrecht/
│   ├── _index/             ← Memory-Index JSONs (pro Korpus)
│   ├── _versions/          ← Steward-Versionierung (aktiv)
│   ├── _steward-flags.json ← Quality-Flags (aktiv, vom Command Center gelesen)
│   └── _import-warteschlange.json ← Queue für Steward-Änderungen (aktiv)
│
├── _siegel/                ← Quality-Seal-Dateien (aktiv)
└── _dedupe-manifests/      ← Dedup-Manifeste (aktiv)
```

### Gelöschte historische Ordner (nicht mehr vorhanden)

- ~~`at/`~~ — altes Ganz-Gesetz-Format, ersetzt durch `at-normen/`
- ~~`_xml/`~~ — RIS-XML-Cache, nicht mehr benötigt (Defect-Scan clean)
- ~~`_veraltet/`~~ — ersetzte Gesetze (historisch)
- ~~`_ausserkraft/`~~ — ausser Kraft getretene Gesetze (historisch)
- ~~`_entfernt-dubletten/`~~ — Dedup-Audit-Trail (historisch)
- ~~`_quarantine-unikate/`~~ — Quarantäne-Audit-Trail (historisch)
- ~~`_normalized/_state/`~~ — Pipeline-Checkpoints (historisch)
- ~~`_normalized/_steward-audit.jsonl`~~ — Audit-Log (historisch)
- ~~`at-pruef/`~~ — leerer Test-Ordner

### RAW vs. NORMALIZED — Der Unterschied

| Aspekt             | RAW                                                                          | NORMALIZED                                                                                            |
| ------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Frontmatter        | RIS-Originalfelder (`gesetzesnummer`, `nor_id`, `paragraph`, `abbreviation`) | Kanonisches Schema (`schema_version: 1`, `doc_id`, `doc_class`, `paragraph_ref`, `abbr`, `body_hash`) |
| Body               | RIS-Original (`## Stammrechtssatz`, PDF-Artifacts, HTML-Entities)            | Bereinigt (`## Rechtssatz`, keine PDF-Artifacts, keine HTML-Entities)                                 |
| Dubletten          | Ja (zwei Fetcher-Generationen)                                               | Nein (dedupiert)                                                                                      |
| `schema_version`   | fehlt                                                                        | `1` (Qualitäts-Stempel)                                                                               |
| Chunker-Kompatibel | Teilweise (Header nicht standardisiert)                                      | Ja (standardisierte Header)                                                                           |

### WAS IST RICHTIG FÜR DAS AI-GEHIRN?

**NORMALIZED.** Drei Gründe:

1. Bessere Chunks: Body bereinigt, standardisierte Header → Chunker erkennt `## Rechtssatz`
2. Keine Dubletten: Ein Anwalt sieht jedes Dokument einmal, nicht dreimal
3. Bessere Metadaten: `doc_class`, `legal_area` (Array), `in_force_from/to` → präzise Filter

**RAW wird behalten als Backup, aber NIEMALS für Imports verwendet.**

---

## 2. DB-Schema (vereinfacht)

### Wichtige Tabellen

| Tabelle             | Zweck                                           | FK auf pages?  |
| ------------------- | ----------------------------------------------- | -------------- |
| `sources`           | Quellen-Registry (law-at-normen, etc.)          | —              |
| `pages`             | Ein Dokument = eine Page (§ 1 ABGB, ein Urteil) | —              |
| `content_chunks`    | Chunked Text einer Page (für Embedding/Suche)   | CASCADE DELETE |
| `links`             | Zitier-Beziehungen zwischen Pages               | CASCADE DELETE |
| `tags`              | Tags einer Page                                 | CASCADE DELETE |
| `page_versions`     | Versionierung einer Page                        | CASCADE DELETE |
| `corpus_snapshots`  | Versionierte Gesetzestexte                      | —              |
| `corpus_amendments` | §-Änderungen zwischen Snapshots                 | —              |

### pages-Tabelle (wichtigste Spalten)

| Spalte            | Typ             | Bedeutung                                |
| ----------------- | --------------- | ---------------------------------------- |
| `id`              | int PK          | Eindeutige ID                            |
| `source_id`       | text FK→sources | Welche Quelle (law-at-normen)            |
| `slug`            | text            | Eindeutig pro Source (abgb/p-1)          |
| `type`            | text            | Dokumenttyp                              |
| `page_kind`       | text            | markdown (default)                       |
| `title`           | text            | Titel                                    |
| `compiled_truth`  | text            | Der Body-Text                            |
| `frontmatter`     | jsonb           | Metadaten (schema_version, doc_id, etc.) |
| `content_hash`    | text            | Hash für Änderungserkennung              |
| `deleted_at`      | timestamptz     | Soft-Delete (NULL = aktiv)               |
| `is_current`      | boolean         | Aktuelle Version?                        |
| `generation`      | bigint          | Version-Nummer                           |
| `chunker_version` | smallint        | Chunker-Version                          |
| `source_path`     | text            | Pfad auf Disk                            |
| `ingested_via`    | text            | Import-Methode                           |
| `ingested_at`     | timestamptz     | Import-Zeitpunkt                         |

### Slug-Uniqueness: `(source_id, slug)` — nicht slug allein!

Jede Source hat ihren eigenen Slug-Namensraum:

- `law-at-normen` → `legal/statutes/at/abgb/p-1`
- `law-at-landesrecht` → `legal/statutes/at/landesrecht/gnr-10000476/art-1`
- `law-at-judikatur-vwgh` → `legal/judikatur/at/vwgh/2011-11-29-2010-10-0060`

### Soft-Delete

Alle Queries filtern `WHERE deleted_at IS NULL`. Soft-deleted Pages sind
unsichtbar, aber reversibel (restore via `clear deleted_at`).
Hard-Delete cascaded durch `content_chunks`, `links`, `tags`, etc.

---

## 3. Import-Pfade — WELCHES SKRIPT NIMMT WAS?

### KANONISCHES IMPORT-SKRIPT

```
bun run server/scripts/batch-import-from-disk.ts \
  --source law-at-normen \
  --disk-dir law-corpus/_normalized/at-normen \
  --batch-size 200 --sleep-ms 0 \
  --no-embed --slug-from-path --force-rechunk \
  --cursor-file /tmp/import-cursor-law-at-normen.json
```

**IMMER `--disk-dir law-corpus/_normalized/$dir`, NIEMALS `law-corpus/$dir`.**

---

## 4. Source-IDs → Disk-Ordner → Slug-Namensraum

| Source-ID               | Disk-Ordner (NORM)               | Slug-Prefix                        | Dokumenttyp                |
| ----------------------- | -------------------------------- | ---------------------------------- | -------------------------- |
| law-at-normen           | \_normalized/at-normen           | legal/statutes/at/                 | Bundesgesetze (ABGB, etc.) |
| law-at-landesrecht      | \_normalized/at-landesrecht      | legal/statutes/at/landesrecht/     | Landesrecht                |
| law-at-gemeinden        | \_normalized/at-gemeinden        | legal/statutes/at/gemeinden/       | Gemeinderecht              |
| law-at-bezirke          | \_normalized/at-bezirke          | legal/statutes/at/bezirke/         | Bezirksrecht               |
| law-at-bmerl            | \_normalized/at-bmerl            | legal/statutes/at/erlaesse/        | Erlasse                    |
| law-at-avn              | \_normalized/at-avn              | legal/statutes/at/avn/             | AVN                        |
| law-at-avsv             | \_normalized/at-avsv             | legal/statutes/at/avsv/            | AVSV                       |
| law-at-kmger            | \_normalized/at-kmger            | legal/statutes/at/kmger/           | KM-Gerichte                |
| law-at-spg              | \_normalized/at-spg              | legal/statutes/at/spg/             | SPG                        |
| law-at-staatsvertraege  | \_normalized/at-staatsvertraege  | legal/statutes/at/staatsvertraege/ | Staatsverträge             |
| law-at-literatur        | \_normalized/at-literatur        | legal/literatur/at/                | Literatur                  |
| law-at-judikatur-ogh    | \_normalized/at-judikatur        | legal/judikatur/at/ogh/            | OGH-Judikatur              |
| law-at-judikatur-vwgh   | \_normalized/at-judikatur-vwgh   | legal/judikatur/at/vwgh/           | VwGH                       |
| law-at-judikatur-vfgh   | \_normalized/at-judikatur-vfgh   | legal/judikatur/at/vfgh/           | VfGH                       |
| law-at-judikatur-bvwg   | \_normalized/at-judikatur-bvwg   | legal/judikatur/at/bvwg/           | BVwG                       |
| law-at-judikatur-asylgh | \_normalized/at-judikatur-asylgh | legal/judikatur/at/asylgh/         | AsylGH                     |
| law-at-judikatur-lvwg   | \_normalized/at-judikatur-lvwg   | legal/judikatur/at/lvwg/           | LVwG                       |
| law-at-judikatur-uvs    | \_normalized/at-judikatur-uvs    | legal/judikatur/at/uvs/            | UVS                        |
| law-at-judikatur-ubas   | \_normalized/at-judikatur-ubas   | legal/judikatur/at/ubas/           | UBAS                       |
| law-at-judikatur-umse   | \_normalized/at-judikatur-umse   | legal/judikatur/at/umse/           | UMSE                       |
| law-at-judikatur-dsk    | \_normalized/at-judikatur-dsk    | legal/judikatur/at/dsk/            | DSK                        |
| law-at-judikatur-gbk    | \_normalized/at-judikatur-gbk    | legal/judikatur/at/gbk/            | GBK                        |
| law-at-judikatur-pvak   | \_normalized/at-judikatur-pvak   | legal/judikatur/at/pvak/           | PVAK                       |
| law-at-judikatur-dok    | \_normalized/at-judikatur-dok    | legal/judikatur/at/dok/            | DOK                        |

### Gelöschte Source-IDs (nicht mehr in DB)

- ~~`law-at`~~ — altes Ganz-Gesetz-Format, ersetzt durch `law-at-normen`
- ~~`default`~~ — leer, historisches Relikt

---

## 5. Langfristig: DE/CH/EU normalisieren

DE/CH/EU haben "Blob-Bodies" (keine `##` Header) und müssen denselben
Normalisierungs-Prozess durchlaufen wie AT.
