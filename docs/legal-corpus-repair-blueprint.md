# Legal-Corpus-Repair-Blueprint — Industrielevel (Harvey / Elgora)

**Status:** Blueprint (Phase 1)  
**Scope:** DB-gestützte, versionskontrollierte, RAG-optimierte Rechtskorpuserneuerung für DE, AT, CH, EU  
**Ausgangslage (tatsächlich aus DB `sigmabrain` ermittelt, nicht geraten):**

| Komponente                                                                                                            | Befund                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sources`                                                                                                             | 14 Rows, **ausschließlich AT**, kein `local_path`, kein `last_sync_at`, kein `chunker_version`, `source_type` fehlt in dieser Tabelle                   |
| `pages`                                                                                                               | 42.422 Rows, 7.701 `legal/judikatur/...`, sonst AT-Bezirke/Gemeinden/AV/AVSV/BMERL; **keine** `legal/statutes/...` Slugs; keine DE/CH/EU-Statuten-Pages |
| `content_chunks`                                                                                                      | 115.412 Rows, **0 Embeddings** aller 3 Spalten, **0 `token_count`**, `search_vector` vorhanden (Trigger)                                                |
| `content_chunk_labels`                                                                                                | 38.912 Labels (`court_case`, `ecli`), **0 Embeddings**                                                                                                  |
| `legal_source_versions`                                                                                               | **0 Rows**                                                                                                                                              |
| `corpus_snapshots` / `corpus_snapshot_paragraphs` / `corpus_amendments`                                               | **0 Rows**                                                                                                                                              |
| `output_dependencies` / `links` / `raw_data` / `ingest_log` / `ingest_sessions` / `page_versions` / `facts` / `files` | **0 Rows**                                                                                                                                              |
| `tags`                                                                                                                | 25 Rows                                                                                                                                                 |
| `config`                                                                                                              | 5 Keys (`chunk_strategy`, `embedding_model` etc.)                                                                                                       |

---

## 1. Ziel des Repair-Programms

Ein Produktions-Ready-Legal-Corpus, das Harvey/Elgora-näher kommt:

1. **Jede heruntergeladene Rechtsquelle** ist als `source` mit Lifecycle, Lizenz, Sync-Modus, local_path und Quellentyp (`primary_legislation`, `regulation`, `case_law_supreme` …) erfasst.
2. **Jede Rechtsnorm** liegt als `page` mit canonical Slug (`legal/{jurisdiction}/{abbr}`) vor und ist über `legal_source_versions` versionshistorisiert.
3. **Jeder Chunk** hat validen `embedding`, `token_count`, `search_vector` und semantische Metadaten (`statute_abbr`, `paragraph_ref`, `absatz`, `ziffer`, `canonical_label`, `court`, `ecli`, `decision_date`).
4. **Judikatur ist mit Normen verlinkt** über `links` und `content_chunk_labels`.
5. **Jede KI-Antwort** speichert `output_dependencies`, damit Änderungen im Corpus zu Re-verification führen.
6. **Sync ist reproduzierbar** über `ingest_sessions`, `ingest_log`, `corpus_snapshots`, `parser_golden_files` und `connector_quarantine`.

---

## 2. Kern-Userflows (nach Repair)

### 2.1 Operator / Legal-Data-Engineer

1. **Source anlegen** → wählt Jurisdiction, Quellentyp, Lizenz, Sync-Modus, API-URL.
2. **Delta-Sync starten** → System fetcht, parst, versioniert, chunked, embeddet, speichert Snapshot.
3. **Gap-Report lesen** → Matrix zeigt Coverage pro Jurisdiction × Rechtsgebiet × Quelltyp.
4. **Amendment-Alarm** → `corpus_amendments` + `output_dependencies` markieren betroffene Antworten als `pending` re-verification.
5. **Parser-Drift prüfen** → `parser_golden_files` vergleicht gegen Fixture-Hash.

### 2.2 Anwalt / Enduser

1. Frage stellen → System durchsucht **alle** verfügbaren Quellen (Gesetze, Verordnungen, Judikatur, Materialien).
2. Antwort mit **gültigen Zitaten** (`[source:slug]`) und Geltungsdatum.
3. Bei Amendments Hinweis: „Diese Antwort bezieht sich auf eine überholte Fassung von § X“.

### 2.3 CI / QA

1. `de-legal-retrieval` und `at-legal-retrieval` Benchmarks gegen die neuen Chunks laufen.
2. Mindestens 90 % Hit@5 für DE, 85 % für AT (mit LLM-Rerank).
3. Neues Gesetz wird **nicht** deployed, bis Parser Golden-File Test passiert.

---

## 3. UI-Elemente & Interaktionen

### 3.1 Admin-UI: Source-Registry

- **Tabelle** aller Sources mit Spalten: ID, Name, Jurisdiction, Type, Lifecycle, last_sync, item_count, health.
- **Aktionen pro Source:** Sync now, View logs, Edit license, Archive, Golden-file diff.
- **Filter:** Jurisdiction, source_type, lifecycle_state, legal_area.

### 3.2 Coverage-Dashboard

- Heatmap Jurisdiction × Rechtsgebiet × Quelltyp.
- Farben: ✅ available, 🔶 planned, ❌ gap.
- Drill-down auf fehlende Quellen.

### 3.3 Corpus-Health / Doctor

- Kacheln: Missing embeddings, Orphan pages, Drifted parsers, Unverified outputs, Quarantine count.
- Klick öffnet Detail-Liste.

### 3.4 Amendment-Workflow

- Liste neuer `corpus_amendments` mit betroffenen `output_dependencies` und betroffenen `pages`.
- Button „Re-verify affected outputs“.

---

## 4. Datenmodell & State-Management

### 4.1 Erforderliche Schema-Änderungen / Befüllung

#### A. `sources` erweitern

Aktuell fehlen Felder, die in `server/migrations/006_source_lifecycle.sql` bereits definiert sind, aber anscheinend nicht in der aktiven Tabelle vorhanden sind (z. B. `source_type`). Prüfen, ob Migration 006 wirklich ausgeführt wurde, oder zwei verschiedene `sources`-Schemas existieren. Tatsächlich ist `source_type` in `006_source_lifecycle.sql` definiert, aber `\d sources` zeigt es **nicht**. Das ist ein **Schema-Drift / nicht ausgeführte Migration**.

Erforderliche `sources`-Felder:

| Feld                | Typ         | Inhalt                                                                                                                                                    |
| ------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                | text        | `law-{j}-{abbr}` bzw. `law-{j}-judikatur-{court}`                                                                                                         |
| `name`              | text        | Anzeigename                                                                                                                                               |
| `jurisdiction`      | text        | `DE` / `AT` / `CH` / `EU`                                                                                                                                 |
| `source_type`       | text        | `primary_legislation`, `regulation`, `case_law_supreme`, `case_law_instance`, `materials`, `authority_practice`, `literature_open`, `literature_licensed` |
| `lifecycle_state`   | text        | `discovered` → `parser_ready` → `general_availability`                                                                                                    |
| `local_path`        | text        | z. B. `law-corpus/de`, `server/law-corpus/de-judikatur`                                                                                                   |
| `last_sync_at`      | timestamptz | letzter erfolgreicher Sync                                                                                                                                |
| `chunker_version`   | text        | z. B. `legal-v2`                                                                                                                                          |
| `config`            | jsonb       | API-URL, sync_mode, fetch_options, license                                                                                                                |
| `newest_content_at` | timestamptz | neueste Dokumentänderung in der Quelle                                                                                                                    |

#### B. `pages` erweitern & korrigieren

- **Slug-Pattern:**
  - Statuten: `legal/{jurisdiction}/{abbr}` (z. B. `legal/de/bgb`)
  - Verordnungen: `legal/{jurisdiction}/vo/{abbr}`
  - Judikatur: `legal/judikatur/{jurisdiction}/{court}/{case_number}`
  - Materialien: `legal/materials/{jurisdiction}/{drucksache}`
- **Füllen:** `source_path`, `import_filename`, `content_hash`, `effective_date`, `effective_date_source`.
- **Einfügen:** `legal/statutes/...` Pages für alle Dateien in `law-corpus/{de,at,ch,eu}`.

#### C. `content_chunks` aufholen

- **Batch-Embedding** aller 115.412 Chunks mit `text-embedding-3-large` (1536d) oder `text-embedding-3-small` (je Benchmark).
- **Token-Counting** über `tiktoken`/`gpt-tokenizer`.
- **Metadaten-Extraktion** pro Chunk:
  - `statute_abbr`
  - `paragraph_ref`
  - `absatz`
  - `ziffer`
  - `canonical_label`
  - `language`
  - `chunk_role` (`norm`, `judgement`, `rationale`, `commentary`)

#### D. `content_chunk_labels` embedden

- 38.912 Labels (`court_case`, `ecli`) ohne Embeddings → separaten Embedding-Lauf.

#### E. `legal_source_versions` befüllen

Für jede Statuten-Datei in `law-corpus/*` eine Zeile:

```
source_id, statute_abbr, version_date, retrieved_at, source_url, content_hash, valid_from, status='current'
```

#### F. `corpus_snapshots` + `corpus_snapshot_paragraphs`

- Bei jedem Sync: neuer `corpus_snapshots`-Eintrag mit `content_hash` + `paragraph_count`.
- `corpus_snapshot_paragraphs` speichert `paragraph_hashes` pro Slug.

#### G. `links` befüllen

- Aus `frontmatter->>'normen'` der Judikatur-Pages.
- Aus internen Verweisen in `compiled_truth` (§ → Statuten-Slug).
- `link_source='mentions'` oder `'frontmatter'`.

#### H. `output_dependencies` aktivieren

- Jede KI-Antwort speichert genutzte `source_slug`, `paragraph_ref`, `snapshot_hash`.
- `corpus_amendments` löst `reverify_status='pending'` aus.

#### I. `ingest_log` + `ingest_sessions`

- Jeder Fetch/Sync als Session protokollieren.
- Fehler → `connector_quarantine`.

---

## 5. Architektur-Entscheidungen

### 5.1 Source-Lifecycle statt lose Ordner

Alle `law-corpus/` und `server/law-corpus/`-Ordner werden zu `sources` mit `local_path`. Keine „stille“ Dateiimporte mehr.

### 5.2 Einheitliche Canonical-Slugs

```
legal/{jurisdiction}/{statute_abbr}
legal/{jurisdiction}/vo/{regulation_abbr}
legal/judikatur/{jurisdiction}/{court}/{case_number-or-ecli}
legal/materials/{jurisdiction}/{dokument_id}
```

Das macht Citations, Links und Dependencies deterministisch.

### 5.3 Chunking-Strategie

- **Statuten:** 1 Absatz = 1 Chunk; Header-Chunk pro §/Artikel für Kontext.
- **Judikatur:** `Leitsatz`, `Tatbestand`, `Entscheidungsgründe` als separate `chunk_role`.
- **Verordnungen:** identisch Statuten.
- **Materialien:** pro Drucksachen-Abschnitt.

### 5.4 Embedding-Strategie

- Zweispurig:
  - **Chunk-Embedding** (`embedding` 1536d) für semantische Suche.
  - **Label-Embedding** (`content_chunk_labels.embedding`) für Norm- / Gerichts-Lookups.
- Hybrid-Search bleibt: keyword (`search_vector`) + vector + RRF + LLM-Rerank.

### 5.5 Versionierung

- Jede Rechtsquelle bekommt `legal_source_versions` pro `version_date`.
- `corpus_snapshots` speichert den Gesamtzustand eines Syncs.
- `output_dependencies` speichert den Snapshot-Hash, der bei der Antwort verwendet wurde.

### 5.6 Parser-Golden-Files

- Für jede Source ein Fixture pro wichtigem Gesetz/Entscheid.
- CI läuft `parse` → `hash` → `expected_hash`.
- Bei Drift → `parser_golden_files.validation_error` + Blockade.

---

## 6. Edge-Cases & Fehlerszenarien

| Szenario                                   | Handling                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Gesetz hat keine §-Überschriften (AT)      | Parser generiert `## § 1` aus `^§\s*\d+` Matches; Fallback-Regex.                                |
| EU-Richtlinie < 1 KB                       | In Quarantäne (`connector_quarantine` reason `content_empty`) oder als Metadaten-Only markieren. |
| Embedding-API fail                         | Sync-Job pausiert, `ingest_log` Eintrag mit Fehler, Retry-Backoff.                               |
| Neues Gesetz verändert alte §-Nummerierung | `corpus_snapshot_paragraphs` Hash diff → `corpus_amendments` Eintrag.                            |
| Quellentyp nicht klar                      | `source_type` Default `discovered`, manuelle Review in `source_license_reviews`.                 |
| Kollision Slug                             | `source_id` + `slug` UNIQUE; bei Update wird alte Page auf `deleted_at` gesetzt.                 |
| Multi-Tenant Isolation                     | `sources` Scope bleibt Tenant-übergreifend; `page_permissions` für Zugriff.                      |
| Verordnungs-Abkürzung doppelt              | Prefix `vo/` in slug; `statute_abbr` mit `_vo` Suffix.                                           |

---

## 7. Definition of Done (Repair)

- [ ] `sources` enthält **alle** 4 Jurisdiktionen und alle 8 Quellentypen mit `source_type` & `lifecycle_state`.
- [ ] `sources` deckt `law-corpus/{de,at,ch,eu}` und `server/law-corpus/{de,at,ch}-judikatur` ab.
- [ ] `pages` enthält `legal/statutes/...`, `legal/judikatur/...` Slugs für alle Dateien.
- [ ] `content_chunks.embedding` ist für **≥ 99 %** der Chunks befüllt.
- [ ] `content_chunks.token_count` ist für **≥ 99 %** der Chunks befüllt.
- [ ] `content_chunk_labels.embedding` ist befüllt.
- [ ] `legal_source_versions` enthält für jedes Statut mindestens eine `current`-Version mit `content_hash`.
- [ ] `corpus_snapshots` speichert jeden Sync mit `paragraph_count` und `content_hash`.
- [ ] `links` enthält ≥ 50 % der sichtbaren internen Verweise in Judikatur- und Statutentexten.
- [ ] `output_dependencies` wird bei jeder KI-Antwort geschrieben.
- [ ] `ingest_log`/`ingest_sessions` protokollieren jeden Sync.
- [ ] `parser_golden_files` hat je Source mind. 3 Fixtures und CI-Tests.
- [ ] `de-legal-retrieval` Hit@5 ≥ 90 %, `at-legal-retrieval` Hit@5 ≥ 85 %.
- [ ] Coverage-Matrix `src/lib/legal-source-coverage.ts` ist mit `item_count` und `status` synchronisiert.

---

## 8. Arbeitspakete (Reihenfolge)

### Phase 0 — Sofortmaßnahmen (0–2 Tage)

1. **Schema-Drift beheben:**
   - Prüfen, warum `source_type`, `lifecycle_state` aus Migration 006 nicht in `sources` sind.
   - `sources` mit notwendigen Spalten versehen oder Migration nachführen.
2. **Embeddings aufholen:**
   - 115.412 Chunk-Embeddings berechnen (Batch, OpenRouter/embedding-3-small oder -large).
   - 38.912 Label-Embeddings berechnen.
   - `token_count` für alle Chunks ermitteln.
3. **RAG-Smoke-Test:**
   - 20 Benchmark-Queries laufen lassen; wenn Recall einbricht, Chunking anpassen.

### Phase 1 — Source-Registry & Statuten (1 Woche)

1. Sources für `law-de`, `law-at`, `law-ch`, `law-eu` + Verordnungen + Judikatur anlegen.
2. Canonical Slug-Schema implementieren.
3. `legal/statutes/...` Pages für alle Dateien in `law-corpus/{de,at,ch,eu}` importieren.
4. `legal_source_versions` befüllen.
5. AT-Gesetze neu parsen mit Überschrift-Heuristik (`§`, `Art.`).
6. EU directives < 1 KB in Quarantäne oder aussortieren.
7. EU regulations importieren.

### Phase 2 — Verordnungen & Materialien (1 Woche)

1. Verordnungen für DE/AT/CH über APIs beziehen.
2. Gesetzesmaterialien (BT-Drucksachen, Regierungsvorlagen AT, Botschaften CH) anbinden.
3. `corpus_snapshots` + `corpus_snapshot_paragraphs` in Sync einbauen.
4. `parser_golden_files` pro Source anlegen.

### Phase 3 — Judikatur & Verlinkung (1 Woche)

1. `server/law-corpus/*-judikatur` in `pages`/`content_chunks` überführen.
2. Norm-Referenzen (`frontmatter->>'normen'`) in `links` + `content_chunk_labels` extrahieren.
3. `output_dependencies` in Generate-Pipeline integrieren.
4. `corpus_amendments` Detection bauen.

### Phase 4 — Industrialisierung (2 Wochen)

1. Delta-Sync für alle Sources.
2. `ingest_log` + `ingest_sessions` vollständig nutzen.
3. `connector_quarantine` & Retry-Logik.
4. Admin-UI: Source-Registry, Coverage-Dashboard, Corpus-Health.
5. Lizenz-Review-Workflow (`source_license_reviews`).
6. CI-Pipeline mit Retrieval-Benchmarks.

---

## 9. Kritische Annahmen & Abhängigkeiten

- **API-Zugriffe:**
  - gesetze-im-internet.de XML (DE)
  - RIS-OGD v2.6 (AT)
  - Fedlex API v1 (CH)
  - EUR-Lex Web Services + Cellar (EU)
- **Lizenzen:** AT/CH/EU Texte sind CC-BY/CC0. DE Gesetze sind public domain. BGH/OLG Volltexte teilweise lizenziert (juris).
- **Embeddings-Quota:** 115k + 39k Embeddings ≈ 154k Calls. Bei OpenAI 3-small ≈ $1.5–3, bei OpenRouter 3-small ≈ vergleichbar.
- **Compute:** HNSW-Index auf 1536d × 115k ist schnell aufbauend; bei > 1 Mio. Chunks wird Work-Mem/Index-Konfiguration relevant.

---

## 10. Erfolgsmetriken

| Metrik                          | Ziel                                       |
| ------------------------------- | ------------------------------------------ |
| Quellen pro Jurisdiction        | DE ≥ 8, AT ≥ 8, CH ≥ 8, EU ≥ 6             |
| Statuten-Pages                  | DE ≥ 400, AT ≥ 2.000, CH ≥ 200, EU ≥ 2.000 |
| Chunks mit Embedding            | 100 %                                      |
| `legal_source_versions`         | ≥ Anzahl Statuten                          |
| `links`                         | ≥ 100k (inkl. Judikatur-Normen)            |
| `de-legal-retrieval` Hit@5      | ≥ 90 %                                     |
| `at-legal-retrieval` Hit@5      | ≥ 85 %                                     |
| Output-Dependencies geschrieben | 100 % der legalen Antworten                |
