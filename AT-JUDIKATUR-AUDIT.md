# AT Judikatur — Kompletter Audit & Perfektions-Plan

**Stand:** 2026-08-01
**Ziel:** 100% perfekte AT-Judikatur-Daten für KI-Brain — normalisiert, strukturiert, vollständig

---

## 1. AUDIT-ERGEBNISSE

### 1.1 Frontmatter-Qualität ✅ GUT

| Prüfung | Ergebnis | Status |
|---------|----------|--------|
| English fields (court, case_number, decision_date, ecli, type, jurisdiction) | 100% | ✅ |
| content_hash vorhanden | 99%+ | ✅ |
| type: court_decision | 100% | ✅ |
| jurisdiction: at | 100% | ✅ |
| ECLI vorhanden | variiert (46-100%) | 🟡 |
| Deutsche Felder (legacy) | 0-58% (Doppelung) | 🟡 |

**Fazit:** Frontmatter ist KI-tauglich. Englische Feldnamen überall vorhanden, Import-Code funktioniert.

### 1.2 RIS API Cross-Reference ✅ PERFEKT

Stichprobe VwGH (10 API-Dokumente vs. lokale Dateien):
- **7/10 matchen** mit lokalen Dateien
- **Metadaten 100% korrekt**: case_number, decision_date, ECLI übereinstimmend
- **3/10 nicht lokal** — das sind die neuesten Entscheidungen (Download hinkt hinterher)

**Fazit:** Die heruntergeladenen Daten sind korrekt. Keine Verfälschung, keine falsche Zuordnung.

### 1.3 Duplikat-Prüfung ✅ GUT

- ECLIs die in mehreren Quellen erscheinen: **1** (nur der leere String)
- Keine Cross-Source-Duplikate
- `_quarantine/` hat 117.942 Duplikate (bereits isoliert)

### 1.4 Body-Content-Qualität 🔴 KRITISCH

**Das ist der Hauptshowstopper.** Viele Dateien haben unstrukturierte Text-Blobs statt sauberem Markdown.

| Quelle | Total | Sample Structured | Sample Blob | Blob-% | Bewertung |
|--------|-------|-------------------|-------------|--------|-----------|
| at-judikatur-bvwg | 47.257 | 4/30 | 26/30 | **87%** | 🔴 katastrophal |
| at-judikatur-pvak | 2.698 | 7/30 | 23/30 | **77%** | 🔴 katastrophal |
| at-judikatur-vfgh | 41.883 | 9/30 | 21/30 | **70%** | 🔴 katastrophal |
| at-judikatur-dsk | 1.873 | 10/30 | 20/30 | **67%** | 🔴 katastrophal |
| at-judikatur-gbk | 1.042 | 11/30 | 19/30 | **63%** | 🔴 katastrophal |
| at-judikatur-umse | 744 | 12/30 | 18/30 | **60%** | 🔴 katastrophal |
| at-judikatur-dok | 5.567 | 12/30 | 18/30 | **60%** | 🔴 katastrophal |
| at-judikatur (OGH) | 86.559 | 19/30 | 11/30 | **37%** | 🟡 schlecht |
| at-judikatur-lvwg | 74.244 | 20/30 | 10/30 | **33%** | 🟡 schlecht |
| at-judikatur-vwgh | 154.149 | 20/30 | 10/30 | **33%** | 🟡 schlecht |
| at-judikatur-ubas | 4.052 | 23/30 | 7/30 | **23%** | 🟡 mäßig |
| at-judikatur-uvs | 26.337 | 23/30 | 7/30 | **23%** | 🟡 mäßig |
| at-judikatur-asylgh | 53.113 | 27/30 | 3/30 | **10%** | ✅ gut |

**Blob-Beispiel (kaputt):**
```
Verwaltungsgerichtshof10.12.201810.12.2018www.ris.bka.gv.atSeite 1 von 1...
```
Keine Zeilenumbrüche, keine `##`-Überschriften, keine Struktur. Der Legal-Decision-Chunker kann diese nicht verarbeiten — sie fallen auf den generischen Markdown-Chunker zurück → schlechte Chunks → schlechte Retrieval-Qualität.

**Strukturiertes Beispiel (gut):**
```markdown
# Verwaltungsgerichtshof (VwGH) — 2000/06/0066

## Gericht
Verwaltungsgerichtshof

## Entscheidungsdatum
20.12.2001

## Geschäftszahl
2000/06/0066

## Rechtssatz
Das Vorliegen eines konsensgemäßen Zustandes...
```

### 1.5 Ursache des Blob-Problems

Die `stripHtmlComplete()` Funktion in `backfill-utils.ts` konvertiert HTML-Tags:
- `<h1-6>` → `## ` ✅
- `</p>` → `\n\n` ✅
- `</div>` → `\n` ✅

**Aber:** RIS HTML für viele Judikatur-Dokumente hat keine semantische Struktur (`<h1>`, `<p>`). Der Inhalt steht in `<span>`, `<td>`, oder direkt in Textknoten. Die `stripHtmlComplete()` Funktion fügt für diese keine Zeilenumbrüche ein → Text-Blob.

Die `risXmlToText()` Funktion (XML-Pfad) wäre besser, aber:
1. XML-URL ist oft nicht verfügbar (404)
2. XML hat `<ueberschrift>` → `## $1` Konvertierung, aber viele Dokumente haben keine `<ueberschrift>` Tags
3. Die Fallback-Reihenfolge ist XML → HTML → OGD Search

### 1.6 at/ vs at-normen/ 🟡 DUPlikat

| Quelle | Format | Größe ABGB | Metadaten | Bewertung |
|--------|--------|-----------|-----------|-----------|
| `at/abgb.md` | PDF-Export, ganzes Gesetz | 744 KB | title, abbreviation, gesetzesnummer | 🟡 flach |
| `at-normen/abgb/*.md` | XML, pro Paragraph | 1.665 KB (1387 Dateien) | nor_id, paragraph, statute, indizes, eli | ✅ besser |

**Fazit:** `at-normen/` ist die bessere Quelle. `at/` verwerfen.

### 1.7 Schema-Kompatibilität ✅ OK

Die DB-Schema-Spalten passen zu den Frontmatter-Feldern:
- `court` ← frontmatter.court ✅
- `case_number` ← frontmatter.case_number ✅
- `ecli` ← frontmatter.ecli ✅
- `decision_date` ← frontmatter.decision_date ✅
- `statute_abbr` ← frontmatter.abbreviation ✅
- `paragraph_ref` ← frontmatter.paragraph ✅
- `canonical_label` ← wird aus court+case_number generiert ✅

---

## 2. PROBLEME — PRIORISIERT

| # | Problem | Ausmaß | Auswirkung | Priorität |
|---|---------|--------|-----------|-----------|
| P1 | **Blob-Bodies** (kein Markdown) | ~40% aller Judikatur-Dateien | KI-Chunker kann nicht arbeiten, schlechte Retrieval | 🔴 P0 |
| P2 | **Unvollständige Downloads** | 48% fehlen (478K Dateien) | Lücken im Corpus | 🟡 P1 |
| P3 | **ECLI fehlt** bei einigen Quellen | 4-54% ohne ECLI | Schlechtere Zitierung | 🟡 P2 |
| P4 | **at/ vs at-normen/ Duplikat** | 2.313 vs 2.096 Gesetze | Verwirrung, Doppel-Import | 🟡 P2 |
| P5 | **Deutsche Feldnamen (legacy)** | 0-58% haben beide | Kein Problem (englisch immer da) | 🟢 P3 |

---

## 3. PERFEKTIONS-PLAN

### Phase 1: Blob-Fix (P0 — kritisch)

**Ziel:** Alle Judikatur-Dateien haben saubere Markdown-Struktur mit `##`-Überschriften.

**Strategie:** Re-Backfill der Blob-Dateien mit verbesserter XML-Parsing.

1. **Blob-Detektor-Skript** erstellen:
   - Scannt alle `at-judikatur-*/` Dateien
   - Prüft ob Body `## ` enthält
   - Schreibt Liste der Blob-Dateien in `/tmp/blob-files.txt`

2. **Verbesserter XML-Parser** in `backfill-judikatur-text.ts`:
   - XML `<absatz>` → `\n\n` (nicht nur `\n`)
   - XML `<ueberschrift>` → `\n## $1\n`
   - XML `<liste>` `<li>` → `\n- $1`
   - XML `<tabelle>` → Markdown-Tabelle
   - Fallback: Wenn XML keine Struktur hat, füge Absätze nach Satzenden ein

3. **Re-Backfill** nur der Blob-Dateien:
   - Liest `/tmp/blob-files.txt`
   - Fetch XML neu für jede Datei
   - Wenn XML nicht verfügbar: HTML mit verbessertem `stripHtmlComplete()`
   - Schreibt sauberen Body zurück (Frontmatter bleibt)

4. **Validierung:**
   - Re-Run Blob-Detektor → sollte 0 Blobs finden
   - Stichprobe: 50 Dateien manuell prüfen

**Zeit:** 1-2 Tage (Skript + Re-Backfill von ~200K Dateien @ 1s = ~56h)

### Phase 2: Download-Vervollständigung (P1)

**Ziel:** 100% Abdeckung aller AT-Judikatur-Quellen.

**Reihenfolge** (kleinste zuerst für schnelle Erfolge):

| # | Quelle | Fehlend | Zeit @ 1s | Strategie |
|---|--------|---------|-----------|-----------|
| 1 | LVwG | 2.388 | 40 min | `--skip-text` dann Backfill |
| 2 | OGH | 52.262 | 14 h | `--skip-text` dann Backfill |
| 3 | VwGH | 202.486 | 56 h | `--skip-text` dann Backfill |
| 4 | BVwG | 240.670 | 67 h | `--skip-text` dann Backfill |

**Wichtig:** Nach Metadaten-Download muss Text-Backfill mit dem **verbesserten** XML-Parser laufen (Phase 1), sonst entstehen neue Blobs.

**Zeit:** 5-6 Tage (RIS-Lock serialisiert, Wochenende hat 1s Delay)

### Phase 3: ECLI-Backfill (P2)

Für Dateien ohne ECLI:
- Re-Fetch Metadaten von RIS API
- Extrahiere `EuropeanCaseLawIdentifier` aus `Metadaten.Judikatur`
- Schreibe in Frontmatter

**Zeit:** 2-4 Stunden

### Phase 4: Corpus-Bereinigung (P2)

1. `at/` Verzeichnis löschen (Duplikat von `at-normen/`)
2. `_quarantine/` löschen (117.942 Duplikate)
3. Deutsche Feldnamen aus Frontmatter entfernen (optional — stören nicht)

**Zeit:** 30 Minuten

### Phase 5: Import in neue DB

**Erst nach Phase 1-4:**

1. Neue DB-Container mit korrekter Config
2. Schema initialisieren
3. Import pro Source mit `--bulk --no-embed`:
   - `at-normen` (nicht `at/`)
   - `at-landesrecht`
   - `at-judikatur-*` (alle, jetzt mit sauberem Body)
   - `at-staatsvertraege`
4. Embedding-Backfill
5. Validierung

**Zeit:** 1-2 Tage

---

## 4. DEFINITION OF DONE — AT JUDIKATUR

- [ ] 0 Blob-Dateien (alle haben `##`-Struktur)
- [ ] 100% Download-Abdeckung für alle 13 Gerichte
- [ ] ECLI in 100% der Dateien (wo API ECLI liefert)
- [ ] Frontmatter: nur englische Feldnamen (optional)
- [ ] content_hash in 100% der Dateien
- [ ] Keine Duplikate (at/ gelöscht, _quarantine/ gelöscht)
- [ ] Import in neue DB: source_id 100%, embeddings 100%
- [ ] DACH-Benchmark: Retrieval-Qualität getestet

---

## 5. ZEITABSCHÄTZUNG

| Phase | Dauer | Abhängigkeit |
|-------|-------|-------------|
| 1: Blob-Fix | 1-2 Tage | keine |
| 2: Downloads | 5-6 Tage | RIS-Lock |
| 3: ECLI-Backfill | 2-4 Std | nach Phase 2 |
| 4: Bereinigung | 30 Min | nach Phase 3 |
| 5: DB-Import | 1-2 Tage | nach Phase 4 |
| **Total** | **~8-10 Tage** | |

**Parallelisierung:** Phase 1 (Blob-Fix) und Phase 2 (Downloads) können teilweise parallel laufen — Blob-Fix für bestehende Dateien, während Downloads neue holen.

---

## 6. EMPFOHLENE ERSTE AKTION

**Phase 1 zuerst** — Blob-Fix ist der kritischste Punkt. Ohne saubere Body-Struktur nützt auch ein kompletter Download nichts, weil der KI-Chunker die Daten nicht verarbeiten kann.

1. Blob-Detektor-Skript erstellen → genaue Zahl der Blob-Dateien
2. XML-Parser verbessern
3. Re-Backfill der Blob-Dateien
4. Validieren

**Erst wenn Phase 1 fertig:** Phase 2 (Downloads) starten.
