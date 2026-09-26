/**
 * PDF-Barrierefreiheit (BFSG / WCAG) für alle jsPDF-Erzeuger.
 *
 * Was jsPDF 4.x kann und hier gesetzt wird:
 *  - Dokumentsprache im Catalog (`/Lang (de-AT)`) — Screenreader wählen die
 *    richtige Sprachausgabe.
 *  - Titel/Betreff/Autor/Erzeuger im Info-Dictionary.
 *  - `/ViewerPreferences <</DisplayDocTitle true>>` — der Dokumenttitel (nicht
 *    der Dateiname) erscheint in der Titelleiste des Viewers (PDF/UA-Pflicht).
 *    jsPDF hat dafür keine API; wir schreiben den Eintrag über den internen
 *    `putCatalog`-Hook, denselben Mechanismus, den das setLanguage-Plugin nutzt.
 *  - Lesezeichen (Outline) als navigierbare Überschriftenhierarchie plus
 *    `PageMode /UseOutlines`.
 *  - Mindestschriftgröße 9 pt über `accessibleFontSize`.
 *
 * Was jsPDF NICHT kann (siehe docs/BARRIEREFREIHEIT-PDF.md): Struktur-Tags
 * (StructTreeRoot, /MarkInfo Marked true), Alternativtexte für Bilder,
 * Tabellen-Semantik. Für volle PDF/UA-Konformität ist eine Umstellung auf
 * HTML→PDF (Chromium, `tagged: true`) oder pdf-lib mit eigenem StructTree nötig.
 */
import type { jsPDF } from "jspdf";

/** Mindestschriftgröße für Fließ- und Fußtext in erzeugten PDFs (pt). */
export const PDF_MIN_FONT_PT = 9;

/** Standard-Dokumentsprache; DE-Kanzleien können `de-DE` übergeben. */
export const PDF_DEFAULT_LANG = "de-AT";

export type PdfLang = "de-AT" | "de-DE" | "de" | "en";

export interface PdfAccessibilityOptions {
  /** Dokumenttitel — erscheint in der Titelleiste des Viewers. */
  title: string;
  /** Betreff/Zweck des Dokuments (z. B. „Honorarnote R-2026-001“). */
  subject: string;
  /** Verfasser:in — in der Regel die Kanzlei. */
  author?: string;
  /** Schlagwörter, kommagetrennt. */
  keywords?: string;
  /** Sprache des Dokuments (BCP 47). Standard: de-AT. */
  lang?: PdfLang;
  /** Erzeugende Anwendung. Standard: Subsumio. */
  creator?: string;
}

export const PDF_CREATOR = "Subsumio Kanzleisoftware";

/** Merkt sich, welche Dokumente den Catalog-Hook bereits tragen (idempotent). */
const hooked = new WeakSet<object>();

type InternalWithEvents = {
  events?: { subscribe?: (event: string, cb: () => void) => unknown };
  write?: (...args: string[]) => unknown;
};

/**
 * Setzt Sprache, Metadaten, Anzeigemodus und Titelleisten-Anzeige auf einem
 * jsPDF-Dokument. Vor dem ersten `text()` aufrufen; alle Aufrufe sind
 * defensiv (fehlende Plugin-Methoden werden übersprungen), damit die Funktion
 * auch mit gemockten Dokumenten in Unit-Tests läuft.
 */
export function applyPdfAccessibility(doc: jsPDF, opts: PdfAccessibilityOptions): jsPDF {
  const lang = opts.lang ?? PDF_DEFAULT_LANG;
  const d = doc as unknown as Record<string, unknown>;

  if (typeof d.setLanguage === "function") {
    (d.setLanguage as (code: string) => unknown)(lang);
  }
  if (typeof d.setDocumentProperties === "function") {
    (d.setDocumentProperties as (p: Record<string, string>) => unknown)({
      title: opts.title,
      subject: opts.subject,
      author: opts.author ?? PDF_CREATOR,
      keywords: opts.keywords ?? "",
      creator: opts.creator ?? PDF_CREATOR,
    });
  }
  // Volle Breite, fortlaufend, Lesezeichenleiste offen — Nutzer:innen mit
  // Vergrößerung sehen so den Text ohne horizontales Scrollen.
  if (typeof d.setDisplayMode === "function") {
    (d.setDisplayMode as (z: string, l: string, m: string) => unknown)(
      "fullwidth",
      "continuous",
      "UseOutlines"
    );
  }

  const internal = (d.internal ?? {}) as InternalWithEvents;
  if (
    !hooked.has(doc as object) &&
    typeof internal.events?.subscribe === "function" &&
    typeof internal.write === "function"
  ) {
    const write = internal.write;
    internal.events.subscribe("putCatalog", () => {
      write("/ViewerPreferences <</DisplayDocTitle true>>");
    });
    hooked.add(doc as object);
  }
  return doc;
}

export interface PdfBookmark {
  title: string;
  options: { pageNumber: number };
  children: unknown[];
}

/**
 * Fügt ein Lesezeichen (Outline-Eintrag) hinzu — die einzige Form von
 * Überschriftenhierarchie, die jsPDF schreiben kann. `parent` = null für
 * Ebene 1; für Unterpunkte den Rückgabewert des Elternteils übergeben.
 */
export function addPdfBookmark(
  doc: jsPDF,
  title: string,
  pageNumber: number,
  parent: PdfBookmark | null = null
): PdfBookmark | null {
  const outline = (doc as unknown as { outline?: { add?: unknown } }).outline;
  if (!outline || typeof outline.add !== "function") return null;
  return (outline.add as (p: unknown, t: string, o: { pageNumber: number }) => PdfBookmark)(
    parent,
    title,
    { pageNumber }
  );
}

/** Erzwingt die Mindestschriftgröße (9 pt) für Text, der gelesen werden soll. */
export function accessibleFontSize(size: number): number {
  return Math.max(PDF_MIN_FONT_PT, size);
}

/** Aktuelle Seitennummer eines jsPDF-Dokuments (1-basiert), defensiv. */
export function currentPageNumber(doc: jsPDF): number {
  const d = doc as unknown as { getNumberOfPages?: () => number };
  return typeof d.getNumberOfPages === "function" ? d.getNumberOfPages() : 1;
}

/** Platzhalter für „Seite X von Y“ — wird von `finalizePdfPageTotals` ersetzt. */
export const PDF_TOTAL_PAGES_TOKEN = "{gesamt}";

/**
 * Ersetzt den Platzhalter `{gesamt}` in allen Seitentexten durch die
 * tatsächliche Seitenzahl (jsPDF `putTotalPages`). Nach dem letzten `text()`
 * und vor `save()/output()` aufrufen.
 */
export function finalizePdfPageTotals(doc: jsPDF): void {
  const d = doc as unknown as { putTotalPages?: (token: string) => unknown };
  if (typeof d.putTotalPages === "function") d.putTotalPages(PDF_TOTAL_PAGES_TOKEN);
}
