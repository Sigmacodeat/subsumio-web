# Barrierefreiheit erzeugter PDFs (BFSG / BaFG)

Stand: 2026-09-26. Betrifft alle PDFs, die Subsumio selbst erzeugt und die an
Mandant:innen oder Behörden gehen: Honorarnoten (`src/lib/invoice-pdf.ts`),
Schriftsatz-Entwürfe (`src/lib/legal-draft-pdf.ts`), Vollmachten
(`src/lib/poa-template.ts`) und ZUGFeRD-/Factur-X-Rechnungen
(`src/lib/e-invoice/zugferd.ts`, pdf-lib).

Gemeinsame Hilfsdatei: `src/lib/pdf-accessibility.ts`
(`applyPdfAccessibility(doc, { title, subject, lang })`, `addPdfBookmark`,
`accessibleFontSize`, `finalizePdfPageTotals`). Jeder jsPDF-Erzeuger ruft sie
vor dem ersten `text()` auf. Unit-Tests mit echter jsPDF-Instanz:
`src/lib/pdf-accessibility.test.ts`.

## Was erreicht ist

| Anforderung (PDF/UA, WCAG 2.2)               | Stand      | Wie                                                                                                                                                                                                                                             |
| -------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dokumentsprache (`/Lang`)                    | erfüllt    | `doc.setLanguage("de-AT")` (jsPDF-Plugin `setlanguage`); `pdfDoc.setLanguage()` bei pdf-lib. Optional `de-DE` per `lang`-Feld.                                                                                                                  |
| Dokumenttitel, Betreff, Autor, Erzeuger      | erfüllt    | `setDocumentProperties` (jsPDF) bzw. `setTitle/setSubject/setAuthor/setCreator` (pdf-lib)                                                                                                                                                       |
| Titel in der Titelleiste (`DisplayDocTitle`) | erfüllt    | jsPDF hat keine API; wir schreiben `/ViewerPreferences <</DisplayDocTitle true>>` über den internen `putCatalog`-Hook (derselbe Mechanismus wie das Sprach-Plugin). pdf-lib: `catalog.getOrCreateViewerPreferences().setDisplayDocTitle(true)`. |
| Text als Text (kein Bild)                    | erfüllt    | Alle Inhalte über `text()`/`autoTable`; nur QR-Codes sind Bilder und tragen eine Textunterschrift.                                                                                                                                              |
| Logische Lesereihenfolge                     | weitgehend | Inhalt wird linear von oben nach unten gezeichnet (Kopf → Empfänger → Titel → Tabellen → Summen → Zahlung). Ohne Tags ist sie für AT nur heuristisch ableitbar.                                                                                 |
| Mindestschriftgröße 9 pt                     | erfüllt    | Fußzeilen und QR-Beschriftungen von 7/8 pt auf `PDF_MIN_FONT_PT` = 9 angehoben; Wasserzeichen (48 pt) ist dekorativ.                                                                                                                            |
| Überschriftenhierarchie                      | teilweise  | Als Lesezeichen (Outline): Rechnung → Honorar/Auslagen/Summen/Zahlung; Vollmacht → Umfang/Unterschrift; Schriftsatz → Markdown-Überschriften. `PageMode /UseOutlines` öffnet die Leiste.                                                        |
| Seitenzahlen „Seite X von Y“                 | erfüllt    | `putTotalPages` im Schriftsatz-Erzeuger                                                                                                                                                                                                         |
| Anzeigemodus                                 | erfüllt    | `setDisplayMode("fullwidth", "continuous", "UseOutlines")` — kein horizontales Scrollen bei Vergrößerung                                                                                                                                        |

## Was fehlt (und warum)

jsPDF 4.2.1 und pdf-lib 1.17.1 können **keine getaggten PDFs** schreiben. Damit
fehlen für PDF/UA-1 (ISO 14289) bzw. EN 301 549 Abschnitt 10:

- `/MarkInfo <</Marked true>>` und ein `StructTreeRoot` mit Struktur-Tags
  (`H1…H6`, `P`, `Table/TR/TH/TD`, `L/LI`, `Figure`). Screenreader lesen den
  Text zwar vor, kennen aber keine Überschriften-, Tabellen- oder
  Listen-Semantik; Tabellenzellen werden nicht zu Spaltenköpfen zugeordnet.
- Alternativtexte für Bilder (QR-Codes). Wir kompensieren mit einer sichtbaren
  Textunterschrift („GiroCode / EPC-QR“), das ersetzt kein `/Alt`.
- Artefakt-Kennzeichnung für Wasserzeichen, Fußzeilen und Trennlinien.
- Echte Tab-/Lesereihenfolge (`/Tabs /S`), Unicode-Mapping ist mit den
  Standardschriften vorhanden, aber ohne `ToUnicode`-Garantie für Sonderzeichen.
- XMP-Metadaten mit `pdfuaid:part` (Konformitätskennzeichnung). Die
  Info-Dictionary-Felder sind gesetzt, ein XMP-Paket schreibt keine der beiden
  Bibliotheken.

Wir behaupten deshalb **nicht** PDF/UA-Konformität; die Barrierefreiheits-
erklärung (`/at/barrierefreiheit`) führt „erzeugte PDFs ohne Struktur-Tags“ als
bekannte Einschränkung.

## Empfohlene Umstellung

Reihenfolge nach Aufwand/Nutzen:

1. **HTML → PDF über Chromium** (Playwright/Puppeteer, `page.pdf({ tagged: true, outline: true })`).
   Die Erzeuger werden zu React/HTML-Vorlagen mit echten `<h1>`, `<table>`,
   `<th scope>`, `<img alt>`; Chromium schreibt den StructTree, `/MarkInfo`,
   `/Lang` und Artefakte selbst. Vorteile: dieselben Vorlagen wie die
   Web-Vorschau, WCAG-Prüfung mit axe im Browser vor dem Rendern. Nachteile:
   Server-seitig (Chromium-Prozess im Web-Container, ~150 MB), Client-seitige
   Erzeugung entfällt. Für Honorarnoten und Vollmachten (server-signiert,
   archiviert) ohnehin der richtige Ort.
2. **pdf-lib mit eigenem StructTree** für ZUGFeRD: pdf-lib erlaubt beliebige
   Low-Level-Objekte (`context.obj`, `PDFDict`), also lassen sich `MarkInfo`,
   `StructTreeRoot`, `ParentTree` und `MCID`-markierte Inhalte von Hand
   schreiben. Aufwändig und fehleranfällig; nur sinnvoll, weil die
   PDF/A-3-Einbettung (`markPdfA3`) bereits in pdf-lib passiert. Alternative:
   das Chromium-PDF aus Schritt 1 in pdf-lib laden und nur die XML-Anlage +
   `AF`-Beziehung ergänzen (die Tags bleiben erhalten).
3. **Validierung in CI**: veraPDF (`--flavour ua1`) oder PAC 2024 gegen die
   Fixtures aus `src/lib/pdf-accessibility.test.ts`, sobald getaggte PDFs
   entstehen.

Bis dahin gilt: Metadaten, Sprache, Lesezeichen, Mindestschrift und
Titelleisten-Anzeige sind gesetzt und getestet; Struktur-Tags bleiben die
dokumentierte Lücke.
