# Gerichtsfeste Zitat-Provenienz — Implementierungsplan

> Ziel: Jedes Zitat in einer synthetisierten Antwort trägt **Akte → Seite →
> (Absatz/Zeichenoffset) → optional Bounding-Box**, sodass eine Aussage
> gerichtsfest auf die Quellstelle zurückführbar ist. Stand: 2026-06-28.
>
> **Kern (Seiten-Auflösung) ist bereits gebaut + unit-getestet**
> (`src/core/citation-provenance.ts`, 8 Tests). Dieser Plan beschreibt die
> Verdrahtung ins volle Vertikal — bewusst getrennt, weil Chunker + Schema
> engine-parity-kritisch sind (CLAUDE.md: Postgres+PGLite im Gleichschritt) und
> Bounding-Box-Genauigkeit research-grade ist.

## Was schon da ist (verifiziert)

1. **Seitenmarker im Extraktionstext:** `extractPdf` schreibt `--- Page N ---` je
   Seite, getrennt durch `###***###` (`src/core/extract-document.ts`). Die
   Seiteninfo lebt also bereits im extrahierten Markdown.
2. **Provenienz-Kern (NEU, fertig):** `src/core/citation-provenance.ts` —
   `parsePageSegments` / `pageForOffset` / `pageForPassage` /
   `provenanceForChunk`. Pure, deterministisch, 8 Unit-Tests grün (inkl.
   Seitengrenzen-überspannende Chunks, Marker-Zeilen, marker-lose Dokumente).
3. **Web→UI-Plumbing:** `src/lib/citation-gate.ts` leitet `page_number`,
   `char_offset_start/end`, `passage_text` bereits **unverändert** durch — wenn
   die Engine sie liefert, landen sie im Frontend.

**Die Lücke:** zwischen (1)+(2) und (3) fehlt die Propagation auf Chunk-Ebene —
Chunks tragen kein strukturiertes `page_number`, also liefert die `query`-Op es
nicht, also bleibt das UI-Feld leer.

## Stufe A — Seiten-Provenienz (hoher Wert, tractable)

Deckt ~80% des gerichtlichen Werts: „Akte Müller ./. Meier, Seite 12".

- [ ] **Schema:** `content_chunks` um `page_number INT NULL`,
      `page_number_end INT NULL`, `char_offset_in_page INT NULL` erweitern.
      Migration in `MIGRATIONS` (`src/core/migrate.ts`), additiv/nullable; in der
      Bootstrap-Probe-Menge ergänzen (`test/schema-bootstrap-coverage.test.ts`).
      **Beide Engines im Gleichschritt** (`postgres-engine.ts` + `pglite-engine.ts`),
      gepinnt durch `test/e2e/engine-parity.test.ts`.
- [ ] **Chunker** (`src/core/chunkers/`): beim Chunken eines PDF-abgeleiteten
      Dokuments `parsePageSegments(fullMarkdown)` einmal berechnen, pro Chunk
      `provenanceForChunk(segments, chunkStart, chunkEnd)` aufrufen und
      `page_number`/`page_number_end`/`char_offset_in_page` schreiben. No-op für
      Dokumente ohne Seitenmarker (Kern gibt dann null → Spalten bleiben NULL).
- [ ] **Schreibpfad:** `import-file.ts` Chunk-Insert um die neuen Spalten ergänzen.
- [ ] **Query-Op:** in der Citation-/Chunk-Projektion der `query`-Op
      `page_number` + `char_offset_*` mit ausliefern (das Feld, das
      `citation-gate` schon erwartet).
- [ ] **UI:** Zitat-Badge zeigt „S. {page_number}"; Klick scrollt im
      Dokument-Viewer zur Seite (Deep-Link `#page=N`).
- **Akzeptanz:** Eine Antwort zu einem PDF-Akt zeigt pro Zitat die korrekte
  Seitenzahl; Stichprobe gegen das Original stimmt.

## Stufe B — Absatz/Zeichen-Genauigkeit (mittel)

- [ ] `char_offset_in_page` (bereits vom Kern geliefert) im UI nutzen, um die
      **Passage** auf der Seite zu highlighten (Text-Suche + Markierung im Viewer).
- [ ] `passage_text` exakt aus dem Chunk schneiden statt nur Excerpt.
- **Akzeptanz:** Klick aufs Zitat hebt die konkrete Passage hervor, nicht nur die
  Seite.

## Stufe C — Bounding-Box (research-grade, ehrlich als hart markiert)

Pixel-genaue Box (x,y,w,h) auf der Seite. **Schwierig**, weil der Text durch
mehrere Transformationen läuft (PDF-Textlayer **oder** OCR → Whitespace-Normal.
→ Markdown-Synthese → Chunking), die die Koordinaten nicht mitführen.

- [ ] PDF-Textlayer-Pfad: `unpdf`/pdf.js liefert pro Text-Item Transform-Matrix
      → Box. Diese Koordinaten beim Extrahieren mitschreiben (parallel zum Text),
      statt sie zu verwerfen.
- [ ] OCR-Pfad: die OCR-Engine muss Wort-/Zeilen-Boxen liefern (Tesseract `hocr`/
      `tsv`, bzw. die Vision-OCR mit Box-Ausgabe) — sonst keine Box für Scans.
- [ ] Mapping Chunk-Passage → Box über die mitgeführten Item-Koordinaten.
- [ ] Viewer rendert ein Overlay-Rechteck auf der Seite.
- **Akzeptanz:** Klick aufs Zitat zeichnet die Box auf der Original-Seite.
  Realistisch: zuverlässig nur für Text-Layer-PDFs; Scans abhängig von der
  OCR-Box-Qualität (mit Stufe-D-Benchmark messen).

## Dokument-Viewer (Voraussetzung für B/C, fehlt komplett)

Kein PDF-Viewer im Frontend. Für Deep-Link/Highlight/Box braucht es einen
(z. B. `pdf.js`-basiert) in `src/components/legal/`, der die Originaldatei über
`/api/files/:slug` lädt, zu `#page=N` springt und Highlight/Box-Overlays zeichnet.
Stufe A kommt mit einem simplen `#page=N`-Deep-Link aus; B/C brauchen den vollen
Viewer.

## Reihenfolge

1. **Stufe A** komplett (Schema → Chunker → Query → Seiten-Badge). Größter
   Wert/Aufwand-Hebel, baut auf dem fertigen Kern.
2. Dokument-Viewer (pdf.js) → **Stufe B** (Passage-Highlight).
3. **Stufe C** (Box) nur für Text-Layer-PDFs zuerst; Scans nach dem
   OCR-Box-Benchmark (Phase 4 der Haupt-Roadmap).

## Engine-Parity-Hinweis (Pflicht)

Schema + Chunker sind im geteilten Engine-Kern. Jede Änderung MUSS in
`postgres-engine.ts` UND `pglite-engine.ts` landen, mit Migration in
`migrate.ts` und Abdeckung in `schema-bootstrap-coverage` + `engine-parity`.
Ein Chunker-Bug korrumpiert das gesamte Retrieval — daher: erst gegen eine echte
Engine (Deploy/Staging) verifizieren, bevor man Stufe A live vertraut.
