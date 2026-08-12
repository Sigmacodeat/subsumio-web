/**
 * RIS Delta Library — Change-Feed-Abfrage für inkrementelle Corpus-Sync.
 *
 * Nutzt die RIS OGD REST API v2.6 mit dem `ImRisSeit` Parameter, um Dokumente
 * zu finden, die seit dem letzten Sync auf RIS neu aufgenommen oder geändert
 * wurden. Der Cursor (last_cycle_at) wird in `pipeline_state` persistiert.
 *
 * Unterstützte Applikationen:
 *   Bundesrecht: BrKons, BgblAuth, Begut, RegV
 *   Landesrecht: LrKons
 *   Judikatur:   Justiz, Vwgh, Vfgh, Bvwg, Lvwg, AsylGH, Uvs, Dsk, Gbk, Pvak, Dok, Ubas, Umse
 *   Sonstige:    Erlaesse, Avsv, Avn, Spg, KmGer
 *
 * Workflow pro Applikation:
 *   1. Cursor lesen (last_cycle_at aus pipeline_state)
 *   2. ImRisSeit-Intervall wählen (EinerWoche oder ZweiWochen als overlap)
 *   3. Paginiert alle geänderten Dokumente holen
 *   4. Client-side Filter: nur Dokumente mit Geaendert/Veroeffentlicht > Cursor
 *   5. Für jedes Dokument: ID, DokumentUrl, ContentUrls extrahieren
 *   6. Caller entscheidet: fetch XML → write disk → markiereZumImport
 *
 * RIS OGD Compliance:
 *   - 1.5s Pause zwischen Requests (ris-proxy.ts)
 *   - acquireRisLock für single-connection mode
 *   - User-Agent gesetzt
 *
 * Keine Deletion-Erkennung via REST API — dafür würde die SOAP
 * Historyabfrage benötigt. Deletions werden stattdessen durch den
 * Mengen-Abgleich (corpus-pipeline Layer 3) abgefangen.
 */

import { fetchWithRetry } from "./backfill-utils";
import { proxyFetchOptions, getUserAgent } from "./ris-proxy";

const RIS_BASE = "https://data.bka.gv.at/ris/api/v2.6";
const RIS_UA = { "User-Agent": getUserAgent() };

// ── Types ──────────────────────────────────────────────────────────────

export type RisEndpoint = "Bundesrecht" | "Landesrecht" | "Judikatur" | "Sonstige";

export interface DeltaApplikation {
  /** RIS Applikation-Code, z.B. "BrKons", "Justiz", "LrKons" */
  applikation: string;
  /** REST-Endpoint, z.B. "Bundesrecht", "Judikatur", "Landesrecht" */
  endpoint: RisEndpoint;
  /** Corpus-Verzeichnis auf Disk, z.B. "at-normen", "at-judikatur" */
  corpusDir: string;
  /** Lesbarer Label für Dashboard */
  label: string;
  /** pipeline_state source_key, z.B. "ris-delta-BrKons" */
  stateKey: string;
}

export interface DeltaDocument {
  /** RIS Dokument-ID, z.B. "NOR40060075" oder "JOR_2026_03_0016" */
  id: string;
  /** Applikation, z.B. "BrKons" */
  applikation: string;
  /** Datum der letzten Änderung auf RIS (Geaendert oder Veroeffentlicht) */
  changedAt: string;
  /** Dokument-URL auf ris.bka.gv.at */
  dokumentUrl: string;
  /** XML-URL für Content-Fetch */
  xmlUrl: string | null;
  /** HTML-URL (Fallback) */
  htmlUrl: string | null;
  /** PDF-URL (für Artefakte) */
  pdfUrl: string | null;
  /** Kurztitel (falls in Metadaten vorhanden) */
  kurztitel: string | null;
  /** Gesetzesnummer (für Bundesrecht/Landesrecht) */
  gesetzesnummer: string | null;
  /** Geschäftszahl (für Judikatur) */
  geschaeftszahl: string | null;
  /** Artikel/Paragraph/Anlage-Bezeichnung, z.B. "§ 1152" */
  artikelParagraphAnlage: string | null;
  /** Änderungs-Typ: "new" (Veroeffentlicht vorhanden, Geaendert null) oder "changed" */
  changeType: "new" | "changed";
}

export interface DeltaResult {
  applikation: string;
  documents: DeltaDocument[];
  totalHits: number;
  pagesFetched: number;
  cursor: string | null;
  newCursor: string;
}

// ── Applikation-Registry ───────────────────────────────────────────────

export const DELTA_APPLIKATIONS: DeltaApplikation[] = [
  // Bundesrecht
  { applikation: "BrKons", endpoint: "Bundesrecht", corpusDir: "at-normen", label: "Bundesrecht (konsolidiert)", stateKey: "ris-delta-BrKons" },
  // Landesrecht
  { applikation: "LrKons", endpoint: "Landesrecht", corpusDir: "at-landesrecht", label: "Landesrecht (konsolidiert)", stateKey: "ris-delta-LrKons" },
  // Judikatur
  { applikation: "Justiz", endpoint: "Judikatur", corpusDir: "at-judikatur", label: "OGH Judikatur", stateKey: "ris-delta-Justiz" },
  { applikation: "Vwgh", endpoint: "Judikatur", corpusDir: "at-judikatur-vwgh", label: "VwGH Judikatur", stateKey: "ris-delta-Vwgh" },
  { applikation: "Vfgh", endpoint: "Judikatur", corpusDir: "at-judikatur-vfgh", label: "VfGH Judikatur", stateKey: "ris-delta-Vfgh" },
  { applikation: "Bvwg", endpoint: "Judikatur", corpusDir: "at-judikatur-bvwg", label: "BVwG Judikatur", stateKey: "ris-delta-Bvwg" },
  { applikation: "Lvwg", endpoint: "Judikatur", corpusDir: "at-judikatur-lvwg", label: "LVwG Judikatur", stateKey: "ris-delta-Lvwg" },
  { applikation: "AsylGH", endpoint: "Judikatur", corpusDir: "at-judikatur-asylgh", label: "AsylGH Judikatur", stateKey: "ris-delta-AsylGH" },
  { applikation: "Uvs", endpoint: "Judikatur", corpusDir: "at-judikatur-uvs", label: "UVS Judikatur", stateKey: "ris-delta-Uvs" },
  { applikation: "Dsk", endpoint: "Judikatur", corpusDir: "at-judikatur-dsk", label: "DSK Judikatur", stateKey: "ris-delta-Dsk" },
  { applikation: "Gbk", endpoint: "Judikatur", corpusDir: "at-judikatur-gbk", label: "GBK Judikatur", stateKey: "ris-delta-Gbk" },
  { applikation: "Pvak", endpoint: "Judikatur", corpusDir: "at-judikatur-pvak", label: "PVAK Judikatur", stateKey: "ris-delta-Pvak" },
  { applikation: "Dok", endpoint: "Judikatur", corpusDir: "at-judikatur-dok", label: "DOK Judikatur", stateKey: "ris-delta-Dok" },
  { applikation: "Ubas", endpoint: "Judikatur", corpusDir: "at-judikatur-ubas", label: "UBAS Judikatur", stateKey: "ris-delta-Ubas" },
  { applikation: "Umse", endpoint: "Judikatur", corpusDir: "at-judikatur-umse", label: "UMSE Judikatur", stateKey: "ris-delta-Umse" },
];

// ── ImRisSeit Intervall-Auswahl ────────────────────────────────────────

type ImRisSeitValue = "EinerWoche" | "ZweiWochen" | "EinemMonat" | "DreiMonaten" | "SechsMonaten" | "EinemJahr";

/**
 * Wählt das kleinste ImRisSeit-Intervall, das den Cursor abdeckt.
 * RIS unterstützt nur feste Intervalle, keine arbitrary dates.
 * Wir nehmen den kleinsten Intervall, der größer als das Cursor-Alter ist,
 * und filtern client-side auf den exakten Cursor.
 *
 * Bei sehr altem Cursor (> 1 Jahr) nehmen wir "EinemJahr" — das ist das
 * maximale Intervall. In diesem Fall sollte ein Full-Re-Sync erwogen werden.
 */
export function chooseImRisSeit(cursor: string | null): ImRisSeitValue {
  if (!cursor) return "EinemMonat"; // Erster Lauf: hole letzten Monat
  const ageMs = Date.now() - new Date(cursor).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays <= 7) return "EinerWoche";
  if (ageDays <= 14) return "ZweiWochen";
  if (ageDays <= 31) return "EinemMonat";
  if (ageDays <= 92) return "DreiMonaten";
  if (ageDays <= 183) return "SechsMonaten";
  return "EinemJahr";
}

// ── API-Aufruf ─────────────────────────────────────────────────────────

/**
 * Holt eine Seite der RIS-Suche mit ImRisSeit-Filter.
 * Returns null bei Fehler (nach allen Retries).
 */
async function fetchDeltaPage(
  endpoint: RisEndpoint,
  applikation: string,
  imRisSeit: ImRisSeitValue,
  page: number,
): Promise<{ refs: unknown[]; totalHits: number } | null> {
  const url = new URL(`${RIS_BASE}/${endpoint}`);
  url.searchParams.set("Applikation", applikation);
  url.searchParams.set("DokumenteProSeite", "OneHundred");
  url.searchParams.set("Seitennummer", String(page));
  url.searchParams.set("ImRisSeit", imRisSeit);
  // Für Judikatur: alle Rechtssätze inkludieren
  if (endpoint === "Judikatur") {
    url.searchParams.set("AlleRechtssaetze", "true");
  }

  const proxyOpts = proxyFetchOptions();
  const res = await fetchWithRetry(url.toString(), {
    headers: RIS_UA,
    maxRetries: 3,
    timeoutMs: 30_000,
    proxyFetchOptions: proxyOpts,
  });

  if (!res || !res.ok) return null;

  const data = (await res.json()) as Record<string, unknown>;
  const results = (data?.OgdSearchResult as Record<string, unknown>)?.OgdDocumentResults as
    | { Hits?: { "#text"?: string }; OgdDocumentReference?: unknown }
    | undefined;

  if (!results) return { refs: [], totalHits: 0 };

  const totalHits = results.Hits?.["#text"] ? parseInt(results.Hits["#text"], 10) : 0;
  const refsRaw = results.OgdDocumentReference;
  const refs = Array.isArray(refsRaw) ? refsRaw : refsRaw ? [refsRaw] : [];

  return { refs, totalHits };
}

// ── Metadaten-Extraktion ───────────────────────────────────────────────

interface ParsedRef {
  id: string;
  changedAt: string;
  dokumentUrl: string;
  xmlUrl: string | null;
  htmlUrl: string | null;
  pdfUrl: string | null;
  kurztitel: string | null;
  gesetzesnummer: string | null;
  geschaeftszahl: string | null;
  artikelParagraphAnlage: string | null;
  changeType: "new" | "changed";
}

/**
 * Extrahiert die relevanten Felder aus einem OgdDocumentReference.
 *
 * Die RIS-API liefert `OgdDocumentReference` als Array ODER als einzelnes
 * Objekt — wir normalisieren das im Caller. Hier bekommen wir ein einzelnes.
 */
function parseRef(ref: Record<string, unknown>, applikation: string): ParsedRef | null {
  const data = ref?.Data as Record<string, unknown> | undefined;
  if (!data) return null;

  const meta = data.Metadaten as Record<string, unknown> | undefined;
  if (!meta) return null;

  const technisch = meta.Technisch as Record<string, unknown> | undefined;
  const id = technisch?.ID as string | undefined;
  if (!id) return null;

  const allgemein = meta.Allgemein as Record<string, unknown> | undefined;
  const geaendert = allgemein?.Geaendert as string | undefined;
  const veroeffentlicht = allgemein?.Veroeffentlicht as string | undefined;
  const dokumentUrl = allgemein?.DokumentUrl as string | undefined;

  // changedAt: Geaendert hat Priorität, fallback Veroeffentlicht
  const changedAt = geaendert || veroeffentlicht || "";
  if (!changedAt) return null;

  const changeType: "new" | "changed" = geaendert && !veroeffentlicht ? "changed" : "new";

  // Content-URLs extrahieren
  const dokListe = data.Dokumentliste as Record<string, unknown> | undefined;
  const contentRef = dokListe?.ContentReference as unknown;
  const contentRefs = Array.isArray(contentRef) ? contentRef : contentRef ? [contentRef] : [];

  let xmlUrl: string | null = null;
  let htmlUrl: string | null = null;
  let pdfUrl: string | null = null;

  for (const cr of contentRefs as Record<string, unknown>[]) {
    const contentType = cr?.ContentType as string | undefined;
    if (contentType !== "MainDocument") continue;
    const urls = cr?.Urls as Record<string, unknown> | undefined;
    const contentUrls = urls?.ContentUrl as unknown;
    const urlArr = Array.isArray(contentUrls) ? contentUrls : contentUrls ? [contentUrls] : [];
    for (const cu of urlArr as Record<string, unknown>[]) {
      const dataType = cu?.DataType as string | undefined;
      const url = cu?.Url as string | undefined;
      if (!url) continue;
      if (dataType === "Xml") xmlUrl = url;
      else if (dataType === "Html") htmlUrl = url;
      else if (dataType === "Pdf") pdfUrl = url;
    }
  }

  // Endpoint-spezifische Metadaten
  let kurztitel: string | null = null;
  let gesetzesnummer: string | null = null;
  let geschaeftszahl: string | null = null;
  let artikelParagraphAnlage: string | null = null;

  const bundesrecht = meta.Bundesrecht as Record<string, unknown> | undefined;
  if (bundesrecht) {
    kurztitel = (bundesrecht.Kurztitel as string) || null;
    gesetzesnummer = (bundesrecht.Gesetzesnummer as string) || null;
    artikelParagraphAnlage = (bundesrecht.ArtikelParagraphAnlage as string) || null;
  }

  const landesrecht = meta.Landesrecht as Record<string, unknown> | undefined;
  if (landesrecht) {
    kurztitel = (landesrecht.Kurztitel as string) || null;
    gesetzesnummer = (landesrecht.Gesetzesnummer as string) || null;
    artikelParagraphAnlage = (landesrecht.ArtikelParagraphAnlage as string) || null;
  }

  const judikatur = meta.Judikatur as Record<string, unknown> | undefined;
  if (judikatur) {
    kurztitel = (judikatur.Kurztitel as string) || null;
    const gz = judikatur.Geschaeftszahl as unknown;
    if (gz) {
      const gzItem = (gz as Record<string, unknown>)?.item;
      geschaeftszahl = Array.isArray(gzItem) ? (gzItem[0] as string) : (gzItem as string) || null;
    }
    artikelParagraphAnlage = (judikatur.ArtikelParagraphAnlage as string) || null;
  }

  const sonstige = meta.Sonstige as Record<string, unknown> | undefined;
  if (sonstige) {
    kurztitel = (sonstige.Kurztitel as string) || null;
  }

  return {
    id,
    changedAt,
    dokumentUrl: dokumentUrl || "",
    xmlUrl,
    htmlUrl,
    pdfUrl,
    kurztitel,
    gesetzesnummer,
    geschaeftszahl,
    artikelParagraphAnlage,
    changeType,
  };
}

// ── Delta-Abfrage ──────────────────────────────────────────────────────

/**
 * Holt alle Dokumente einer Applikation, die seit dem Cursor geändert wurden.
 *
 * Paginiert durch alle Ergebnisse, filtert client-side auf changedAt > cursor.
 * Der Cursor wird als ISO-String (YYYY-MM-DD) erwartet.
 *
 * @param app Applikation-Konfiguration
 * @param cursor ISO-String des letzten erfolgreichen Syncs (null = erster Lauf)
 * @param maxPages Sicherheitslimit (default 500 = 50.000 Dokumente)
 * @returns Delta-Result mit allen geänderten Dokumenten
 */
export async function fetchDelta(
  app: DeltaApplikation,
  cursor: string | null,
  maxPages = 500,
): Promise<DeltaResult> {
  const imRisSeit = chooseImRisSeit(cursor);
  const documents: DeltaDocument[] = [];
  let totalHits = 0;
  let pagesFetched = 0;

  for (let page = 1; page <= maxPages; page++) {
    const result = await fetchDeltaPage(app.endpoint, app.applikation, imRisSeit, page);
    if (!result) {
      // Fehler nach allen Retries — abbrechen, Cursor nicht updaten
      return {
        applikation: app.applikation,
        documents,
        totalHits,
        pagesFetched,
        cursor,
        newCursor: cursor || new Date().toISOString(),
      };
    }

    totalHits = result.totalHits;
    pagesFetched = page;

    if (result.refs.length === 0) break;

    let allAfterCursor = true;
    for (const ref of result.refs as Record<string, unknown>[]) {
      const parsed = parseRef(ref, app.applikation);
      if (!parsed) continue;

      // Client-side Filter: nur Dokumente nach dem Cursor
      if (cursor && parsed.changedAt <= cursor) {
        allAfterCursor = false;
        continue;
      }

      documents.push({
        id: parsed.id,
        applikation: app.applikation,
        changedAt: parsed.changedAt,
        dokumentUrl: parsed.dokumentUrl,
        xmlUrl: parsed.xmlUrl,
        htmlUrl: parsed.htmlUrl,
        pdfUrl: parsed.pdfUrl,
        kurztitel: parsed.kurztitel,
        gesetzesnummer: parsed.gesetzesnummer,
        geschaeftszahl: parsed.geschaeftszahl,
        artikelParagraphAnlage: parsed.artikelParagraphAnlage,
        changeType: parsed.changeType,
      });
    }

    // Wenn alle Dokumente auf dieser Seite vor dem Cursor liegen, können wir
    // abbrechen — weitere Seiten werden noch älter sein (RIS sortiert nach
    // Änderungsdatum absteigend).
    if (cursor && !allAfterCursor && documents.length === 0) break;

    // Letzte Seite erreicht
    if (result.refs.length < 100) break;
  }

  // Neuer Cursor: jetzt (oder neuestes changedAt, falls vorhanden)
  const newCursor = documents.length > 0
    ? documents.reduce((latest, d) => (d.changedAt > latest ? d.changedAt : latest), documents[0].changedAt)
    : new Date().toISOString().slice(0, 10);

  return {
    applikation: app.applikation,
    documents,
    totalHits,
    pagesFetched,
    cursor,
    newCursor,
  };
}

// ── Hilfsfunktionen ────────────────────────────────────────────────────

/**
 * Liefert die Datumsgrenze für den Cursor als ISO-String (YYYY-MM-DD).
 * Wird für den client-side Filter verwendet.
 */
export function cursorToDate(cursor: string | null): string | null {
  if (!cursor) return null;
  try {
    return new Date(cursor).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

/**
 * Formatiert ein Delta-Result für die Log-Ausgabe.
 */
export function formatDeltaSummary(result: DeltaResult): string {
  const newCount = result.documents.filter((d) => d.changeType === "new").length;
  const changedCount = result.documents.filter((d) => d.changeType === "changed").length;
  return `${result.applikation}: ${result.documents.length} Dokumente (${newCount} neu, ${changedCount} geändert) von ${result.totalHits} Hits auf ${result.pagesFetched} Seiten`;
}
