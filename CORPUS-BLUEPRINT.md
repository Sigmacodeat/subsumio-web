# Corpus Blueprint — Kompletter Bestand & Gap-Analyse

**Stand:** 2026-08-01
**Ziel:** 100% Abdeckung aller DACH+EU Rechtsquellen für Subsumio Legal AI

---

## 1. AT — Österreich

### 1.1 AT Bundesrecht (Gesetze)

| Quelle | RIS API Total | Lokal | Abdeckung | Format |
|--------|--------------|-------|-----------|--------|
| `at/` (flach, ganzes Gesetz) | — | 2.313 | — | 1 Datei = 1 Gesetz, ganzer Text |
| `at-normen/` (pro Paragraph) | 440.840 Normen¹ | 2.096 Gesetze / 70.303 Paragraphen | ~16% der Normen² | 1 Verzeichnis = 1 Gesetz, 1 .md pro Paragraph |

¹ RIS API `Bundesrecht?Applikation=BrKons` liefert 440.840 Einzelnormen (inkl. historisch, aufgehoben). Die Anzahl **geltender** Gesetze ist ~2.000-2.500.
² 70.303 von 440.840 klingt wenig, aber viele RIS-Normen sind historische Versionen. Die 2.096 in `at-normen/` dürften die meisten **geltenden** Gesetze abdecken.

**⚠️ Duplikat-Problem:** `at/` und `at-normen/` enthalten **dieselben Gesetze** (ABGB in beiden). `at-normen/` ist die bessere Quelle (bessere Metadaten, pro-Paragraph). `at/` ist veraltet.

**Empfehlung:** Nur `at-normen/` importieren, `at/` verwerfen.

### 1.2 AT Landesrecht

| Quelle | RIS API Total | Lokal | Abdeckung |
|--------|--------------|-------|-----------|
| `at-landesrecht/` | 279.949 | 15.216 | 5,4% |

**🔴 Massive Gap:** 264.733 Landesrecht-Dokumente fehlen. Das ist 95% des AT-Landesrechts.

### 1.3 AT Judikatur

| Gericht | RIS API | Lokal | Abdeckung | Status |
|---------|---------|-------|-----------|--------|
| OGH (Justiz) | 138.445 | 86.183 | 62% | 🟡 partial |
| VwGH | 356.635 | 154.149 | 43% | 🟡 partial |
| VfGH | 24.082 | 41.883 | 174%³ | ✅ komplett³ |
| BVwG | 287.927 | 47.257 | 16% | 🔴 massiv unvollständig |
| LVwG | 76.632 | 74.244 | 97% | ✅ fast komplett |
| AsylGH | 53.113 | 53.113 | 100% | ✅ komplett |
| UVS | 25.939 | 26.337 | 101% | ✅ komplett |
| DSK | 1.878 | 1.873 | 99% | ✅ komplett |
| GBK | 1.042 | 1.042 | 100% | ✅ komplett |
| PVAK | 2.550 | 2.698 | 106% | ✅ komplett |
| DOK | 4.822 | 5.567 | 115% | ✅ komplett |
| UBAS | 4.052 | 4.052 | 100% | ✅ komplett |
| UMSE | 742 | 744 | 100% | ✅ komplett |

³ VfGH lokal > API: Lokale Dateien umfassen auch ältere Dokumente, API-Count variiert.

**Judikatur-Gesamt:**
- API Total: ~1.002.877
- Lokal: ~524.042
- **Gap: ~478.835 Dokumente (48% fehlen)**

### 1.4 AT Sonstige

| Quelle | Lokal | Hinweis |
|--------|-------|---------|
| `at-staatsvertraege/` | 1.048 | Staatsverträge |
| `at-literatur/` | 125 | Literatur |
| `_quarantine/` | 117.942 | 🔴 Duplikate — NICHT importieren |

---

## 2. DE — Deutschland

### 2.1 DE Gesetze

| Quelle | Offiziell | Lokal | Abdeckung |
|--------|-----------|-------|-----------|
| `de/` | ~13.000⁴ | 78 | **0,6%** |

⁴ gesetze-im-internet.de hat ~13.000 Bundesgesetze/Verordnungen.

**🔴 Katastrophal:** Nur 78 DE-Gesetze lokal. 99,4% fehlen.

### 2.2 DE Judikatur

| Quelle | Lokal | Hinweis |
|--------|-------|---------|
| `de-judikatur/` | 74.882 | BVerfG, BGH, BVerwG, BAG, BSG, BFH etc. |

Offizielle Gesamtzahl unbekannt (rechtsprechung-im-internet.de). 74.882 ist eine solide Basis.

### 2.3 DE Literatur

| Quelle | Lokal |
|--------|-------|
| `de-literatur/` | 10.448 |

---

## 3. CH — Schweiz

### 3.1 CH Gesetze (BBL)

| Quelle | Offiziell | Lokal | Abdeckung |
|--------|-----------|-------|-----------|
| `ch/` | ~25.000⁵ | 18 | **0,07%** |
| `ch-fr/` | — | 5 | FR-Übersetzungen |
| `ch-it/` | — | 5 | IT-Übersetzungen |

⁵ admin.ch hat ~25.000 Erlasse (SR-Systematische Rechtssammlung).

**🔴 Katastrophal:** Nur 18+5+5 = 28 CH-Gesetze lokal. 99,9% fehlen.

### 3.2 CH Judikatur

| Quelle | Lokal |
|--------|-------|
| `ch-judikatur/` | 4.338 | BGer, BGE etc. |

### 3.3 CH Literatur

| Quelle | Lokal |
|--------|-------|
| `ch-literatur/` | 676 |

---

## 4. EU

| Quelle | Offiziell | Lokal | Abdeckung |
|--------|-----------|-------|-----------|
| `eu/` | ~400.000⁶ | 8.039 | **2%** |

⁶ EUR-Lex hat ~400.000 Dokumente (Richtlinien, Verordnungen, Entscheidungen, Judikatur).

**🔴 Massiv unvollständig:** 98% der EU-Dokumente fehlen.

---

## 5. Zusammenfassung Gap-Analyse

### Nach Jurisdiktion

| Jurisdiktion | Offiziell | Lokal | Abdeckung | Status |
|-------------|-----------|-------|-----------|--------|
| AT Bundesrecht | ~2.500 geltende | 2.096 (at-normen) | ~84% | 🟡 |
| AT Landesrecht | 279.949 | 15.216 | 5,4% | 🔴 |
| AT Judikatur | ~1.002.877 | ~524.042 | 52% | 🟡 |
| DE Gesetze | ~13.000 | 78 | 0,6% | 🔴 |
| DE Judikatur | unbekannt | 74.882 | — | 🟡 |
| CH Gesetze | ~25.000 | 28 | 0,1% | 🔴 |
| CH Judikatur | unbekannt | 4.338 | — | 🟡 |
| EU | ~400.000 | 8.039 | 2% | 🔴 |

### Priorisierung für Download

| Priorität | Quelle | Fehlend | Aufwand | Begründung |
|-----------|--------|---------|---------|------------|
| **P0** | AT Landesrecht | 264.733 | mittel | DACH-first, große Gap |
| **P0** | AT Judikatur BVwG | 240.670 | mittel | Größte Judikatur-Gap |
| **P0** | AT Judikatur VwGH | 202.486 | mittel | Wichtigste AT-Judikatur |
| **P0** | AT Judikatur OGH | 52.262 | gering | Wichtigste AT-Judikatur |
| **P1** | DE Gesetze | ~12.922 | gering | DACH, fast nichts da |
| **P1** | CH Gesetze | ~24.972 | gering | DACH, fast nichts da |
| **P1** | EU | ~391.961 | hoch | Sehr groß, aber wichtig |
| **P2** | DE Judikatur | unbekannt | — | Basis vorhanden |
| **P2** | CH Judikatur | unbekannt | — | Basis vorhanden |

---

## 6. Kritische Probleme vor Neu-Import

### 6.1 Duplikate im Corpus

- `at/` (2.313) vs `at-normen/` (2.096) — **dieselben Gesetze**, verschiedene Struktur
- `_quarantine/` (117.942) — bestätigte Duplikate, **niemals importieren**
- `batch-import-from-disk.ts` hat **keine Quarantine-Exclusion** — muss gefixt werden

### 6.2 Disk-Space

- **16 GB frei** auf `/dev/disk3s1`
- Aktuelle DB: 113 GB (Docker Volume)
- Neue DB geschätzt: ~70 GB
- **Parallele DB nicht möglich** — alte DB muss zuerst weg

### 6.3 Format-Inkonsistenz Judikatur

- Alte Judikatur-Dateien: gemischte Feldnamen (deutsch + englisch)
- Neue Judikatur-Dateien: englische Feldnamen, strukturiert
- Import-Code muss beide Formate erkennen (ist implementiert via `isCourtDecisionPage`)

### 6.4 Embedding-Kosten

- text-embedding-3-small: $0,02/1M tokens
- Geschätzte Tokens für alle fehlenden Quellen: ~500M tokens
- **Kosten: ~$10** für kompletten Re-Import
- API-Throughput: mehrere Stunden

---

## 7. Blueprint: Vorgehen

### Phase 0: Vorbereitung (1 Tag)

1. **Quarantine-Exclusion** in `batch-import-from-disk.ts` implementieren
2. **Autovacuum-Config persistent** in postgresql.conf schreiben
3. **HNSW-Parameter** prüfen: `m=32, ef_construction=128` (Harvey-grade)
4. **Backup-Strategie**: Alte DB als Docker-Image exportieren (vor Löschung)

### Phase 1: Download fehlender Quellen (parallel, mehrere Tage)

**P0 — AT (höchste Priorität):**
- AT Landesrecht: `fetch-all-at-landesrecht.ts` → +264.733 Dateien
- AT Judikatur BVwG: `fetch-all-at-judikatur.ts --court bvwg` → +240.670
- AT Judikatur VwGH: `fetch-all-at-judikatur.ts --court vwgh` → +202.486
- AT Judikatur OGH: `fetch-all-at-judikatur.ts --court ogh` → +52.262

**P1 — DE/CH/EU:**
- DE Gesetze: `fetch-de-gesetze.ts` (neu erstellen) → +12.922
- CH Gesetze: `fetch-ch-bbl.ts` (neu erstellen) → +24.972
- EU: `fetch-eu-corpus.ts` erweitern → +391.961

### Phase 2: DB-Reset & Neu-Import (1-2 Tage)

1. **Alte DB stoppen** (`docker stop subsumio-db-local`)
2. **Alte DB-Volume löschen** (`docker volume rm subsumio-db-local`) — nach Backup!
3. **Neue DB-Container** starten mit korrekter Config
4. **Schema initialisieren** (`gbrain migrate --to postgres`)
5. **Import** pro Source mit `--bulk --no-embed`:
   - `at-normen` (nicht `at/` — vermeidet Duplikate)
   - `at-landesrecht`
   - `at-judikatur-*` (alle Gerichte)
   - `at-staatsvertraege`
   - `de`, `de-judikatur`, `de-literatur`
   - `ch`, `ch-judikatur`, `ch-literatur`
   - `eu`
6. **Embedding-Backfill** via `auto-embed-pending.ts`

### Phase 3: Validierung (halber Tag)

1. Source-Isolation: Jeder Chunk hat `source_id` ✅
2. Embedding-Abdeckung: 100% ✅
3. Metadaten: `statute_abbr`, `paragraph_ref`, `canonical_label` ✅
4. DACH-Benchmark: Retrieval-Qualität testen
5. Suchlatenz: <300ms mit HNSW

### Phase 4: Cutover

1. App auf neue DB umstellen (`.env` → `DATABASE_URL`)
2. Alte DB-Backup behalten (Docker-Image)
3. Monitoring: Autovacuum, Query-Latenz, Embedding-Abdeckung

---

## 8. Zeitabschätzung

| Phase | Dauer | Parallelisierbar |
|-------|-------|------------------|
| 0: Vorbereitung | 1 Tag | nein |
| 1: Downloads | 5-10 Tage | ja (mehrere Skripte parallel) |
| 2: DB-Reset & Import | 1-2 Tage | nein |
| 3: Embedding-Backfill | 6-12 Stunden | ja (API-Limit) |
| 4: Validierung | 0,5 Tage | nein |
| **Total** | **~2 Wochen** | |

---

## 9. Entscheidungspunkte

1. **Alte DB löschen oder behalten?**
   - Behalten: Braucht 113 GB Disk (nicht verfügbar)
   - Löschen: Kein Fallback, aber sauberer Start
   - **Empfehlung:** Backup als Docker-Image exportieren, dann löschen

2. `at/` vs `at-normen/` — welche importieren?
   - **Empfehlung:** Nur `at-normen/` (bessere Metadaten, pro-Paragraph, keine Duplikate)

3. DE/CH/EU Downloads jetzt oder später?
   - **Empfehlung:** Zuerst AT 100% (DACH-first), dann DE/CH/EU parallel

4. Re-Chunking v4/v5 erzwingen?
   - **Empfehlung:** Ja — aktuelle Chunker-Versionen nutzen (v5 legal-decision, v4 legal-statute, v3 markdown)
