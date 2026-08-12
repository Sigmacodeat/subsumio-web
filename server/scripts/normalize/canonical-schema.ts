/**
 * Kanonisches Korpus-Schema v1 — der ausführbare Vertrag.
 *
 * WARUM: Der Rohkorpus hat 78 verschiedene Frontmatter-Feldnamen für ~25
 * Konzepte (ID allein hat 8 Namen: document_id, id, nor_id, doc_id,
 * dokumentnummer, alte_dokumentnummer, celex, oai_identifier). Schlimmer:
 * identische Feldnamen tragen unterschiedliche Wertformate —
 * `inkrafttretensdatum` ist 169.208x ISO und 9.387x deutsches Datum,
 * `title` ist 112.728x in Wahrheit eine ECLI.
 *
 * Ein LLM darf das NICHT umschreiben: Rechtstexte dürfen nicht paraphrasiert
 * werden, 704k Aufrufe sind weder bezahlbar noch reproduzierbar, und dieser
 * Korpus hatte bereits einmal erfundene Gesetzestexte. Deshalb: deterministische
 * Regeln, versioniert, mit hartem Validator davor.
 *
 * NICHT-ZIEL: Inhalt verändern. Der Normalizer fasst NUR Metadaten und
 * Abschnitts-Überschriften an. Der Normtext selbst wird byteweise
 * durchgereicht — geprüft über body_hash.
 */

export const SCHEMA_VERSION = 1;
export const NORMALIZER_VERSION = 1;

/** Dokumentklasse — ersetzt die 8 konkurrierenden type-Felder. */
export type DocClass = "statute" | "decision" | "literature";

/**
 * Herkunftsformat — beantwortet "ist diese Datei XML-rein?" per Abfrage.
 * `pdf`: aus der Textschicht eines amtssignierten PDF extrahiert. Für Bezirke
 * und KmGer führt RIS ausschließlich PDF — dort gibt es kein XML und kein HTML.
 */
export type SourceFormat = "xml" | "html" | "api" | "pdf" | "unknown";

/**
 * Kanonisches Frontmatter. JEDES Feld ist in JEDER Datei vorhanden.
 * Unbekannt = null bzw. []. Niemals weglassen — sonst ist "fehlt" von
 * "unbekannt" nicht unterscheidbar und jede Abfrage muss raten.
 */
export interface CanonicalFrontmatter {
  // --- Identität -----------------------------------------------------------
  schema_version: number;
  doc_id: string;                 // kanonische ID (RIS-Dokumentnummer, NOR-ID, CELEX)
  doc_id_alt: string[];           // alle weiteren bekannten IDs
  doc_class: DocClass;
  doc_subtype: string | null;     // "Bundesgesetz" | "Verordnung" | "Erkenntnis" | "Rechtssatz" | ...
  jurisdiction: string;           // at | de | ch | eu
  language: string;               // de | fr | it

  // --- Benennung -----------------------------------------------------------
  title: string;                  // Langtitel — NIE eine ECLI
  short_title: string | null;     // Kurztitel
  abbr: string | null;            // Abkürzung (ABGB, UGB)

  // --- Gesetz --------------------------------------------------------------
  statute_id: string | null;      // Gesetzesnummer
  paragraph_ref: string | null;   // "§ 1044" | "Art. 4" | "Anl. 3"
  promulgation_organ: string | null; // "BGBl. I Nr. 16/2020"
  in_force_from: string | null;   // ISO-Datum, IMMER YYYY-MM-DD
  in_force_to: string | null;     // ISO-Datum
  eli: string | null;
  region: string | null;          // Bundesland / Kanton

  // --- Entscheidung --------------------------------------------------------
  court: string | null;
  court_code: string | null;      // ogh | vwgh | vfgh | bvwg | ...
  case_number: string | null;
  ecli: string | null;            // NUR wenn echte ECLI
  decision_date: string | null;   // ISO-Datum, IMMER YYYY-MM-DD
  decision_type: string | null;   // Erkenntnis | Beschluss | Urteil | Rechtssatz
  cited_norms: string[];          // aus normen/norms, aufgetrennt

  // --- Klassifikation ------------------------------------------------------
  legal_area: string[];           // aus legal_area + indizes
  keywords: string[];             // aus keywords + schlagworte

  // --- Provenienz ----------------------------------------------------------
  source: string;                 // ris-ogd | rechtsprechung-im-internet | ...
  source_url: string;
  source_format: SourceFormat;
  retrieved_at: string | null;    // ISO-Datum
  license: string | null;
  content_hash: string;           // Hash der GESAMTEN Datei (bestehende Semantik)
  body_hash: string;              // Hash NUR des Normtextes — Beweis der Unversehrtheit
  normalized_at: string;
  normalizer_version: number;
}

/** Feldreihenfolge — fixiert, damit Diffs lesbar bleiben und Dateien stabil sind. */
export const FIELD_ORDER: (keyof CanonicalFrontmatter)[] = [
  "schema_version", "doc_id", "doc_id_alt", "doc_class", "doc_subtype",
  "jurisdiction", "language",
  "title", "short_title", "abbr",
  "statute_id", "paragraph_ref", "promulgation_organ", "in_force_from",
  "in_force_to", "eli", "region",
  "court", "court_code", "case_number", "ecli", "decision_date",
  "decision_type", "cited_norms",
  "legal_area", "keywords",
  "source", "source_url", "source_format", "retrieved_at", "license",
  "content_hash", "body_hash", "normalized_at", "normalizer_version",
];

/** Kontrolliertes Vokabular der Abschnitts-Überschriften im Body. */
export const CANONICAL_SECTIONS = [
  "Norm", "Rechtssatz", "Leitsatz", "Spruch", "Tenor",
  "Sachverhalt", "Entscheidungsgründe", "Entscheidungstexte", "Text",
  "Anmerkung", "Schlagworte", "Index",
] as const;

// ---------------------------------------------------------------------------
// Validator — die Schleuse. Nichts kommt in den Import, was hier durchfällt.
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  field: string;
  code: string;
  detail: string;
}

const RE_ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RE_ECLI = /^ECLI:[A-Z]{2}:[A-Za-z0-9._:-]+$/;
const RE_HASH = /^[0-9a-f]{16}$/;
const RE_DIRTY = / |\s{2,}|&(#\d+|amp|nbsp|quot|lt|gt);/;

/**
 * Prüft ein kanonisches Frontmatter gegen den Vertrag.
 * Leeres Ergebnis = importierbar. Sonst: Datei bleibt draußen.
 */
export function validateCanonical(fm: Partial<CanonicalFrontmatter>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const bad = (field: string, code: string, detail: string) =>
    issues.push({ field, code, detail });

  // 1. Vollständigkeit — jedes Feld MUSS existieren (auch als null).
  for (const key of FIELD_ORDER) {
    if (!(key in fm)) bad(key, "missing_field", "Feld fehlt komplett");
  }

  // 2. Pflichtwerte
  if (!fm.doc_id) bad("doc_id", "empty", "doc_id ist die Primärschlüssel-Identität");
  if (!fm.title) bad("title", "empty", "title darf nie leer sein");
  if (!fm.source_url) bad("source_url", "empty", "Zitierfähigkeit erfordert source_url");
  if (!fm.content_hash || !RE_HASH.test(fm.content_hash))
    bad("content_hash", "bad_format", `erwartet 16 Hex-Zeichen, bekam "${fm.content_hash}"`);
  if (!fm.body_hash || !RE_HASH.test(fm.body_hash))
    bad("body_hash", "bad_format", `erwartet 16 Hex-Zeichen, bekam "${fm.body_hash}"`);
  if (fm.schema_version !== SCHEMA_VERSION)
    bad("schema_version", "version_mismatch", `erwartet ${SCHEMA_VERSION}`);

  // 3. Enums
  if (!["statute", "decision", "literature"].includes(fm.doc_class as string))
    bad("doc_class", "bad_enum", String(fm.doc_class));
  if (!["xml", "html", "api", "pdf", "unknown"].includes(fm.source_format as string))
    bad("source_format", "bad_enum", String(fm.source_format));
  if (!/^(at|de|ch|eu)$/.test(fm.jurisdiction ?? ""))
    bad("jurisdiction", "bad_enum", String(fm.jurisdiction));

  // 4. Datumsformate — genau EIN Format, sonst sortiert und filtert die DB falsch.
  for (const f of ["in_force_from", "in_force_to", "decision_date", "retrieved_at"] as const) {
    const v = fm[f];
    if (v != null && !RE_ISO_DATE.test(v))
      bad(f, "bad_date", `erwartet YYYY-MM-DD, bekam "${v}"`);
  }

  // 5. ECLI — entweder echt oder null. Kein Freitext im ECLI-Feld.
  if (fm.ecli != null && !RE_ECLI.test(fm.ecli))
    bad("ecli", "not_an_ecli", `"${fm.ecli}"`);

  // 6. title darf keine ECLI sein (112.728 Altfälle)
  if (fm.title && RE_ECLI.test(fm.title))
    bad("title", "title_is_ecli", "ECLI gehört in ecli, nicht in title");

  // 7. Listenfelder müssen Listen sein
  for (const f of ["doc_id_alt", "cited_norms", "legal_area", "keywords"] as const) {
    if (!Array.isArray(fm[f])) bad(f, "not_a_list", typeof fm[f]);
  }

  // 8. Sauberkeit — NBSP, Mehrfach-Leerzeichen, HTML-Entities
  for (const [k, v] of Object.entries(fm)) {
    if (typeof v === "string" && RE_DIRTY.test(v))
      bad(k, "dirty_value", `Steuer-/Mehrfachzeichen in "${v.slice(0, 60)}"`);
    if (Array.isArray(v))
      for (const item of v)
        if (typeof item === "string" && RE_DIRTY.test(item))
          bad(k, "dirty_value", `Steuer-/Mehrfachzeichen in "${String(item).slice(0, 60)}"`);
  }

  // 9. Klassenspezifische Pflichten
  if (fm.doc_class === "decision") {
    if (!fm.court) bad("court", "required_for_decision", "Entscheidung ohne Gericht");
    if (!fm.decision_date) bad("decision_date", "required_for_decision", "Entscheidung ohne Datum");
  }
  if (fm.doc_class === "statute") {
    if (!fm.abbr && !fm.short_title && !fm.title)
      bad("abbr", "required_for_statute", "Gesetz ohne jede Benennung");
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Inhalts-Schleuse — die zweite Hälfte. Ein Frontmatter kann tadellos sein,
// während im Body Website-Navigation steht. Genau das ist bei at-bezirke der
// Fall: 2.484 Dateien mit sauberen Metadaten und null Verordnungstext.
// Metadaten-Validierung allein hätte sie alle durchgewunken.
// ---------------------------------------------------------------------------

/** Reste der RIS-Weboberfläche — beweist, dass die HTML-Seite statt des Dokuments geholt wurde. */
const RE_CHROME = /Accesskey \d|Seitenbereiche:|Zur Navigationsleiste|Zum Seitenanfang|Druckansicht|Navigation im Suchergebnis/;
/** Screenreader-Dopplung aus dem HTML — jede Abkürzung steht doppelt da. */
const RE_SR_ONLY = /römisch\s+[IVXLC]|Paragraph (eins|zwei|drei|vier|fünf)\b|Absatz (eins|zwei|drei)\b|Bundesgesetzblatt Teil (eins|zwei)\b/;
/** Body enthält nur die RIS-Metadatentabelle, keinen Normtext. */
const RE_META_DUMP = /Landesgesetzblatt Nr\.|Gesetzgebungsperiode|Datum des Landtagsbeschlusses|Begleitende Dokumente/;
/** Platzhalter statt Inhalt. */
const RE_STUB = /Volltext nicht abrufbar|nicht abrufbar — siehe Quelle/;

/**
 * PDF-Seitenumbruch im Fließtext — Kopf-/Fußzeile der Druckfassung.
 *
 * Gefunden über die Modell-Stichprobe, nicht über Regeln: der Erlass
 * ERL_BMJ_20260601_2026_0_455_612 enthält mitten im Satz
 * "…im gleichen Haushalt leben.Bundesministerium für Justiz01.07.2026Erlässe
 * der Bundesministerienwww.ris.bka.gv.atSeite 2 von 2www.ris.bka.gv.atSeite 1
 * von 1Bundesministerium…".
 *
 * NICHT per Regex entfernbar: der Text beginnt dort mitten im Satz und die
 * Seiten stehen in falscher Reihenfolge. Wer nur die Kopfzeile herausschneidet,
 * erhält ein Dokument, das sauber aussieht und inhaltlich falsch ist. Solche
 * Dokumente müssen als XML neu geholt werden — dort trennt RIS Kopf- und
 * Fußzeilen in <kzinhalt>/<fzinhalt> ab.
 */
const RE_PDF_PAGEBREAK = /www\.ris\.bka\.gv\.at\s*Seite \d+ von \d+|Seite \d+ von \d+\s*www\.ris\.bka\.gv\.at/;
/** Behördlicher Briefkopf aus der Druckfassung. */
const RE_LETTERHEAD = /DVR:\s*\d{7}|UID:\s*ATU\d+|P\.b\.b\. Erscheinungsort/;
/** Body besteht nur aus einem Bildverweis — in RIS nicht digitalisierte Anlagen. */
const RE_IMAGE_ONLY = /^[\s\S]{0,80}\/Dokumente\/\S+\.(png|jpg|gif|pdf)\s*$/;

/**
 * "Substanztext" = Body ohne Überschriften, Bildpfade und URLs.
 * Ersetzt die frühere Marker-Heuristik: die suchte nach "§ 1"/"Art. 1" und
 * verwarf dadurch gültiges Recht — die Waffenembargo-Liste in Anl. 1
 * 2. AußWV 2019 (reiner Fließtext) und "Artikel II" der Bgld.
 * Gemeindeordnung (römische Ziffer, kein \d). Gemessen wird jetzt, ob
 * überhaupt Text da ist, nicht ob er einem Muster gehorcht.
 */
function substanceText(body: string): string {
  return body
    .split("\n")
    .filter((l) => !/^#{1,6}\s/.test(l))
    .join(" ")
    .replace(/\/?Dokumente\/\S+/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Inhaltliche Überschriften, die belegen, dass eine Entscheidung Substanz hat. */
const DECISION_CONTENT_SECTIONS = /^##\s+(Rechtssatz|Leitsatz|Spruch|Tenor|Text|Entscheidungsgründe|Entscheidungstexte|Sachverhalt)\s*$/m;

/**
 * Prüft den Body. Diese Schleuse entscheidet, ob überhaupt Recht in der
 * Datei steht — nicht nur, ob die Metadaten hübsch aussehen.
 */
export function validateBody(body: string, docClass: DocClass): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const bad = (code: string, detail: string) => issues.push({ field: "body", code, detail });
  const text = body.trim();

  if (text.length === 0) return [{ field: "body", code: "empty_body", detail: "kein Inhalt" }];
  if (RE_STUB.test(text)) bad("stub", "Platzhalter statt Volltext");
  if (RE_CHROME.test(text)) bad("website_chrome", "RIS-Seitennavigation im Body — HTML-Seite statt Dokument geholt");
  if (RE_PDF_PAGEBREAK.test(text)) bad("pdf_pagebreak", "Kopf-/Fußzeile der Druckfassung im Fließtext — Seitenreihenfolge unzuverlässig");
  if (RE_LETTERHEAD.test(text)) bad("letterhead", "behördlicher Briefkopf im Fließtext");
  // Sprachausgabe-Dopplung: verwerfen NUR bei hoher Dichte.
  //
  // Als Ja/Nein-Regel war das die teuerste Fehlentscheidung der Schleuse:
  // 20.823 BvwG-Entscheidungen fielen durch, darunter eine mit 194.292
  // Zeichen wegen SECHS Treffern. Der Rest des Textes war vollständiges,
  // brauchbares Recht — verworfen wurde er trotzdem.
  //
  // An 1.200 Dateien gemessen: die höchste Dichte im gesamten Korpus liegt
  // bei 0,97 Treffern je 1.000 Zeichen, der Median bei 0,049. Kein Dokument
  // ist durchgehend die Sprachausgabe-Fassung — die gab es vor dem
  // Reparaturlauf, seither sind es vereinzelte Fundstellen-Artefakte
  // ("Bundesgesetzblatt Teil eins, Nr. 38 aus 2011" statt "BGBl. I Nr. 38/2011").
  //
  // Die Schwelle von 2,0 verwirft heute nichts und bleibt als Wächter: fiele
  // ein Fetcher wieder auf die HTML-Sprachausgabe zurück, läge die Dichte um
  // Größenordnungen höher. Für einen Anwalt ist eine Entscheidung mit
  // holpriger Fundstellenangabe unendlich viel besser als keine Entscheidung.
  const srTreffer = text.match(new RegExp(RE_SR_ONLY.source, "g"))?.length ?? 0;
  if (srTreffer > 0) {
    const dichte = (srTreffer * 1000) / Math.max(text.length, 1);
    if (dichte >= 2.0) {
      bad("screenreader_dupes", `sr-only-Dopplung durchgehend (${dichte.toFixed(2)}/1000 Zeichen)`);
    }
  }
  if (/^RIS Dokument/m.test(text)) bad("ris_prefix", '"RIS Dokument"-Präfix');

  const substance = substanceText(body);

  // Nicht digitalisierte Anlage: RIS führt nur ein Bild. Kein Defekt der
  // Pipeline, aber auch nichts, was man sinnvoll einbetten kann.
  if (RE_IMAGE_ONLY.test(text) || (substance.length < 20 && /\/Dokumente\/\S+\.(png|jpg|gif|pdf)/.test(text)))
    bad("image_only", "Anlage liegt in RIS nur als Bild vor — nicht einbettbar");

  // Nur-Metadaten-Dump: RIS-Tabellenlabels ohne jeden Normtext
  else if (RE_META_DUMP.test(text) && substance.length < 400)
    bad("meta_dump_only", "nur RIS-Metadatentabelle, kein Normtext");

  else if (docClass === "statute") {
    // at-normen hat legitime Kurzparagraphen — § 1044 ABGB sind 128 Zeichen.
    // Gemessen wird deshalb nur, ob überhaupt Substanztext vorhanden ist.
    if (substance.length < 40) bad("too_short", `${substance.length} Zeichen Substanztext`);
  }

  else if (docClass === "decision") {
    if (!DECISION_CONTENT_SECTIONS.test(body))
      bad("no_content_section", "keine inhaltliche Sektion (Rechtssatz/Spruch/Text/…)");
    // Ein Rechtssatz ist ein verdichteter Satz — Kürze ist sein Wesensmerkmal,
    // kein Defekt. Die an Volltext-Urteilen geeichte 200-Zeichen-Grenze verwarf
    // dadurch 921 von 8.000 VwGH-Dokumenten, darunter vollständige Sätze wie
    // "Der VwGH ist für Entscheidungen über Anträge auf bedingte Entlassung
    // aus einer Freiheitsstrafe (§ 46 StGB) nicht zuständig." (157 Zeichen).
    // Für Rechtssätze gilt deshalb dieselbe niedrige Schwelle wie für
    // Gesetzesparagraphen; ein Volltext-Urteil ohne Rechtssatz muss weiterhin
    // Substanz haben.
    // "Kein RS." ist der RIS-Vermerk, dass zu dieser Entscheidung KEIN
    // Rechtssatz existiert — ein Verwaltungseintrag, kein Recht. Die für
    // echte Rechtssätze gesenkte Schwelle ließ diese Platzhalter durch
    // (52 Zeichen: "Verwaltungsgerichtshof 12.09.1996 95/20/0268 Kein RS").
    // Ein Anwalt darf so etwas nie als Treffer sehen; deshalb explizit raus.
    if (/\bKein\s+RS\.?\s*$/.test(substance)) {
      bad("kein_rechtssatz", "RIS-Vermerk 'Kein RS.' statt Inhalt");
    } else {
      const istRechtssatz = /^##\s+(Rechtssatz|Stammrechtssatz|Leitsatz)\s*$/m.test(body);
      const mindest = istRechtssatz ? 40 : 200;
      if (substance.length < mindest)
        bad("too_short", `${substance.length} Zeichen Substanztext${istRechtssatz ? " (Rechtssatz)" : ""}`);
    }
  }

  return issues;
}

/** Serialisiert kanonisches Frontmatter in stabiles, deterministisches YAML. */
export function serializeCanonical(fm: CanonicalFrontmatter): string {
  const lines: string[] = ["---"];
  for (const key of FIELD_ORDER) {
    const v = fm[key];
    if (Array.isArray(v)) {
      if (v.length === 0) lines.push(`${key}: []`);
      else {
        lines.push(`${key}:`);
        for (const item of v) lines.push(`  - ${yamlScalar(String(item))}`);
      }
    } else if (v === null || v === undefined) {
      lines.push(`${key}: null`);
    } else if (typeof v === "number") {
      lines.push(`${key}: ${v}`);
    } else {
      lines.push(`${key}: ${yamlScalar(String(v))}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

/**
 * YAML-Skalar. Alles, was YAML als Datum, Zahl oder Bool umtypisieren würde,
 * wird zitiert — sonst wird aus `statute_id: 10008540` eine Zahl (führende
 * Nullen weg) und aus `in_force_from: 1995-01-01` ein Date-Objekt.
 * Diese Felder sind laut Schema Strings und müssen Strings bleiben.
 */
function yamlScalar(s: string): string {
  if (s === "") return '""';
  const wouldRetype = /^[\d.:-]+$/.test(s) || /^(true|false|null|yes|no|on|off|~)$/i.test(s);
  if (!wouldRetype && /^[A-Za-z0-9][A-Za-z0-9 ._/§()-]*$/.test(s) && !/: /.test(s)) return s;
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
