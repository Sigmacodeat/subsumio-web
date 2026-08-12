#!/usr/bin/env bun
/**
 * Korpus-Normalizer — überführt Rohdateien in das kanonische Schema v1.
 *
 * PRINZIP: deterministisch, idempotent, batch-weise mit harter Prüfschleuse.
 * Kein LLM. Regeln, die man lesen, testen und wiederholen kann.
 *
 * SICHERHEITSGARANTIE: Der Normtext wird NICHT verändert. Nach jeder Datei
 * vergleicht `assertBodyUnchanged()` alle Nicht-Überschriften-Zeilen vorher
 * und nachher. Bei jedem Unterschied wird die Datei abgelehnt statt
 * geschrieben. Ein Normalisierer, der Recht umformuliert, ist ein Fehler,
 * kein Feature.
 *
 * Verwendung:
 *   bun server/scripts/normalize/normalize-corpus.ts --corpus at-normen --dry-run
 *   bun server/scripts/normalize/normalize-corpus.ts --corpus at-normen --batch 500
 *   bun server/scripts/normalize/normalize-corpus.ts --corpus at-normen --batch 500 --resume
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "fs";
import { join, dirname, relative } from "path";
import { createHash } from "crypto";
import {
  SCHEMA_VERSION, NORMALIZER_VERSION, FIELD_ORDER,
  serializeCanonical, validateCanonical, validateBody,
  type CanonicalFrontmatter, type DocClass, type SourceFormat, type ValidationIssue,
} from "./canonical-schema.ts";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const arg = (n: string, d?: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const CORPUS = arg("--corpus");
const BATCH = parseInt(arg("--batch", "500")!, 10);
const LIMIT = parseInt(arg("--limit", "0")!, 10);
const DRY = args.includes("--dry-run");
const RESUME = args.includes("--resume");
/**
 * Datei mit je einem Pfad pro Zeile.
 *
 * ⚠ NUR für Korpora OHNE Doubletten verwenden. `selectWinners()` trifft die
 * Doubletten-Auswahl ausschließlich innerhalb der übergebenen Liste. Enthält
 * die Liste Doubletten, deren beste Fassung fehlt, kürt der Lauf eine
 * schlechtere zum Gewinner und überschreibt die gute normalisierte Datei.
 * Bei at-judikatur wären das 31.286 von 86.559 Dateien gewesen.
 *
 * Für Korpora mit Doubletten deshalb IMMER den Vollauf fahren — nur dort
 * rechnet die Auswahl über den gesamten Bestand.
 */
const FILE_LIST = arg("--file-list");

const CORPUS_ROOT = process.env.LAW_CORPUS_ROOT ?? join(import.meta.dir, "..", "..", "..", "law-corpus");
const OUT_ROOT = process.env.NORMALIZED_ROOT ?? join(CORPUS_ROOT, "_normalized");
const STATE_DIR = join(OUT_ROOT, "_state");

if (!CORPUS) {
  console.error("--corpus <name> erforderlich");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Wert-Reinigung
// ---------------------------------------------------------------------------
const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'",
  "&nbsp;": " ", "&#160;": " ", "&#8217;": "'", "&shy;": "",
};

/** Entfernt NBSP, Mehrfach-Leerzeichen, HTML-Entities, Rand-Whitespace. */
export function clean(v: string | null | undefined): string | null {
  if (v == null) return null;
  let s = String(v);
  s = s.replace(/&(amp|lt|gt|quot|apos|nbsp|shy|#160|#8217);/g, (m) => ENTITIES[m] ?? m);
  s = s.replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
  s = s.replace(/ /g, " ");        // NBSP
  s = s.replace(/[​-‍﻿]/g, ""); // Zero-Width
  // Jeden Whitespace-Lauf auf EIN Leerzeichen bringen — auch einzelne
  // Tabulatoren und Zeilenumbrüche. Die frühere Fassung fasste nur
  // mehrfache Leerzeichen zusammen, wodurch 39 Titel einen Tabulator
  // behielten und als Zitier-Label mit \t in der Datenbank landeten.
  s = s.replace(/\s+/g, " ");
  s = s.replace(/^["']|["']$/g, "");
  s = s.trim();
  return s === "" || s === "null" ? null : s;
}

/** Jedes Datum wird YYYY-MM-DD. Akzeptiert ISO, ISO-Timestamp, DE-Format. */
export function toIsoDate(v: string | null | undefined): string | null {
  const s = clean(v);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);           // ISO / ISO-TS
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);            // 26.10.2018
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})$/);                              // nur Jahr → nicht verwertbar
  return null;
}

/** Trennt Semikolon-/Komma-Listen in echte Listen, dedupliziert, sortiert nicht um. */
export function toList(v: string | null | undefined, sep = /[;\n]/): string[] {
  const s = clean(v);
  if (!s || s === "[]") return [];
  const out: string[] = [];
  for (const part of s.split(sep)) {
    const p = clean(part);
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

const RE_ECLI = /^ECLI:[A-Z]{2}:[A-Za-z0-9._:-]+$/;

// ---------------------------------------------------------------------------
// Roh-Frontmatter lesen (tolerant — die Rohdaten sind kein sauberes YAML)
// ---------------------------------------------------------------------------
interface Raw { fm: Record<string, string>; list: Record<string, string[]>; body: string }

export function parseRaw(text: string): Raw {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fm: {}, list: {}, body: text };
  const fm: Record<string, string> = {};
  const list: Record<string, string[]> = {};
  let currentKey: string | null = null;
  for (const line of m[1].split("\n")) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && currentKey) {
      (list[currentKey] ??= []).push(item[1].trim().replace(/^["']|["']$/g, ""));
      continue;
    }
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_]*):[ \t]*(.*)$/);
    if (kv) {
      currentKey = kv[1];
      fm[kv[1]] = kv[2];
      if (kv[2].trim() === "") list[kv[1]] ??= [];
    }
  }
  return { fm, list, body: text.slice(m[0].length) };
}

const hash16 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex").slice(0, 16);

// ---------------------------------------------------------------------------
// Mapping: 78 Rohfelder → 35 kanonische Felder
// ---------------------------------------------------------------------------
const pick = (fm: Record<string, string>, ...keys: string[]): string | null => {
  for (const k of keys) {
    const v = clean(fm[k]);
    if (v) return v;
  }
  return null;
};

function docClassOf(fm: Record<string, string>): DocClass {
  const t = (clean(fm.type) ?? "").toLowerCase();
  if (t === "law" || t === "statute") return "statute";
  if (t === "court_decision" || t === "judikatur" || t === "decision") return "decision";
  if (t === "literatur" || t === "literature" || t === "article") return "literature";
  // Fallback über vorhandene Felder statt Raten
  if (fm.court || fm.gericht || fm.case_number || fm.geschaeftszahl) return "decision";
  return "statute";
}

function sourceFormatOf(fm: Record<string, string>, url: string): SourceFormat {
  const explicit = clean(fm.source_format);
  if (explicit === "xml") return "xml";
  if (url.endsWith(".xml")) return "xml";
  if (url.includes("data.bka.gv.at/ris/api")) return "api";
  if (url.includes("Dokument.wxe") || url.endsWith(".html") || url.includes("/eli/")) return "html";
  return "unknown";
}

function docIdOf(fm: Record<string, string>, url: string): string {
  const direct = pick(fm, "document_id", "dokumentnummer", "doc_id", "nor_id", "celex");
  if (direct) return direct;
  const id = clean(fm.id);
  if (id) return id.replace(/^ris-/, "");
  // Bis zum Trennzeichen lesen, dann dekodieren: Dokumentnummern enthalten
  // prozent-kodierte Umlaute (GEMRE_ST_60101_Pr%c3%a4s_… = "…Präs…"). Ein
  // Muster wie [A-Za-z0-9_]+ bricht am % ab und verschmilzt verschiedene
  // Gesetze zu einer ID — bei at-gemeinden betrifft das 177 Dateien.
  const m = url.match(/Dokumentnummer=([^&"'\s]+)/) ?? url.match(/\/Dokumente\/[^/]+\/([^/]+)\//);
  if (m) {
    try { return decodeURIComponent(m[1]); } catch { return m[1]; }
  }
  const eli = clean(fm.eli);
  if (eli) {
    const e = eli.match(/\/(NOR\d+|LNO\d+)$/);
    if (e) return e[1];
  }
  // Nicht-RIS-Quellen haben keine Dokumentnummer: die 125 Aufsätze des
  // Austrian Law Journal (alj.uni-graz.at/…/article/view/274) und die
  // ELI-Permalinks des alten Landesrechts fielen deshalb komplett durch die
  // Schleuse. Aus der Quell-URL wird eine stabile, wiederholbare ID gebildet:
  // Host + letztes Pfadsegment + Kurz-Hash der vollen URL gegen Kollisionen.
  if (url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, "").replace(/[^a-z0-9]+/gi, "-");
      const last = u.pathname.split("/").filter(Boolean).pop() ?? "doc";
      const short = createHash("sha256").update(url).digest("hex").slice(0, 6);
      return `${host}-${last}-${short}`.replace(/[^A-Za-z0-9_.-]+/g, "-");
    } catch { /* keine gültige URL */ }
  }
  return "";
}

export function mapToCanonical(raw: Raw, fallbackTitle: string): CanonicalFrontmatter {
  const { fm, list } = raw;
  const url = clean(fm.source_url) ?? "";
  const cls = docClassOf(fm);

  // Titel: 112.728 Dateien tragen eine ECLI im title-Feld — das ist kein Titel.
  let title = pick(fm, "title", "titel", "kurztitel", "statute", "work") ?? "";
  if (RE_ECLI.test(title)) {
    const alt = pick(fm, "titel", "kurztitel", "statute");
    const court = pick(fm, "court", "gericht");
    const cn = pick(fm, "case_number", "geschaeftszahl");
    title = alt ?? (court && cn ? `${court} — ${cn}` : fallbackTitle);
  }
  if (!title) title = fallbackTitle;

  const ecliRaw = pick(fm, "ecli");
  const ids = new Set<string>();
  for (const k of ["document_id", "dokumentnummer", "doc_id", "nor_id", "celex", "id", "alte_dokumentnummer", "oai_identifier"]) {
    const v = clean(fm[k]);
    if (v) ids.add(v.replace(/^ris-/, ""));
  }
  const docId = docIdOf(fm, url);
  ids.delete(docId);

  const keywords = [
    ...(list.keywords ?? []).map((x) => clean(x)).filter(Boolean) as string[],
    ...toList(fm.keywords),
    ...toList(fm.schlagworte),
  ];

  return {
    schema_version: SCHEMA_VERSION,
    doc_id: docId,
    doc_id_alt: [...ids],
    doc_class: cls,
    doc_subtype: pick(fm, "dokumenttyp", "entscheidungsart", "decision_type", "typ_detail", "typ"),
    jurisdiction: (clean(fm.jurisdiction) ?? "at").toLowerCase(),
    language: (clean(fm.language) ?? "de").toLowerCase(),

    title,
    short_title: pick(fm, "kurztitel", "titel"),
    // `GNR-20006265` ist KEINE Gesetzesabkürzung, sondern ein Platzhalter, den
    // der Fetcher aus der Gesetzesnummer gebaut hat, wo RIS keine Abkürzung
    // liefert. Als Zitat gelesen ("GNR-20006265 Art. 1") ist das eine
    // Pseudo-Fundstelle: sieht amtlich aus, sagt nichts. 73.078 Chunks waren
    // betroffen. Verworfen — dann greift der Titel als Fundstelle.
    abbr: (() => {
      const a = pick(fm, "abbreviation", "abbr");
      return a && /^GNR-\d+$/i.test(a) ? null : a;
    })(),

    statute_id: pick(fm, "gesetzesnummer", "statute_id"),
    paragraph_ref: pick(fm, "paragraph"),
    promulgation_organ: pick(fm, "kundmachungsorgan"),
    in_force_from: toIsoDate(fm.inkrafttretensdatum),
    in_force_to: toIsoDate(fm.ausserkrafttretensdatum),
    eli: pick(fm, "eli"),
    region: pick(fm, "bundesland", "state"),

    court: cls === "decision" ? pick(fm, "court", "gericht") : null,
    court_code: cls === "decision" ? pick(fm, "court_type") : null,
    case_number: cls === "decision" ? pick(fm, "case_number", "geschaeftszahl", "Zahl", "Zl", "AZ") : null,
    ecli: ecliRaw && RE_ECLI.test(ecliRaw) ? ecliRaw : null,
    decision_date: cls === "decision"
      ? toIsoDate(fm.decision_date) ?? toIsoDate(fm.date) ?? toIsoDate(fm.entscheidungsdatum)
      : null,
    decision_type: cls === "decision" ? pick(fm, "entscheidungsart", "decision_type", "dokumenttyp") : null,
    cited_norms: [...toList(fm.normen), ...toList(fm.norms), ...(list.normen ?? [])].filter(Boolean),

    legal_area: [...toList(fm.legal_area, /[;,]/), ...toList(fm.indizes, /;/)],
    keywords: [...new Set(keywords)],

    source: clean(fm.source) ?? "ris-ogd",
    source_url: url,
    source_format: sourceFormatOf(fm, url),
    retrieved_at: toIsoDate(fm.retrieved_at) ?? toIsoDate(fm.version_date),
    license: clean(fm.license),
    content_hash: clean(fm.content_hash) ?? "",
    body_hash: "",           // unten gesetzt
    normalized_at: new Date().toISOString().slice(0, 10),
    normalizer_version: NORMALIZER_VERSION,
  };
}

// ---------------------------------------------------------------------------
// Body: NUR Überschriften vereinheitlichen. Normtext bleibt unangetastet.
// ---------------------------------------------------------------------------
const SECTION_ALIASES: Record<string, string> = {
  "entscheidungsgruende": "Entscheidungsgründe",
  "begründung": "Entscheidungsgründe",
  "begruendung": "Entscheidungsgründe",
  "entscheidungstext": "Entscheidungstexte",
  "geschaeftszahl": "Geschäftszahl",
  "stammrechtssatz": "Rechtssatz",
  "leitsatz": "Leitsatz",
  "ausspruch": "Spruch",
  "tatbestand": "Sachverhalt",
};

export function normalizeBody(body: string): string {
  const out = body.split("\n").map((line) => {
    const m = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!m) return line;
    const key = m[2].toLowerCase().replace(/\s+/g, " ").trim();
    const canon = SECTION_ALIASES[key];
    return canon ? `${m[1]} ${canon}` : `${m[1]} ${m[2].replace(/\s+/g, " ").trim()}`;
  });
  return out.join("\n").replace(/\n{4,}/g, "\n\n\n").trimEnd() + "\n";
}

/**
 * DIE SICHERUNG. Vergleicht jede Nicht-Überschriften-Zeile vorher/nachher.
 * Weicht ein einziges Zeichen des Normtextes ab, wird die Datei abgelehnt.
 */
export function assertBodyUnchanged(before: string, after: string): string | null {
  const textOf = (s: string) =>
    s.split("\n").filter((l) => !/^#{1,6}\s/.test(l)).join("\n").replace(/\s+/g, " ").trim();
  const a = textOf(before);
  const b = textOf(after);
  if (a === b) return null;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return `Normtext verändert an Position ${i}: "${a.slice(Math.max(0, i - 40), i + 40)}" → "${b.slice(Math.max(0, i - 40), i + 40)}"`;
    }
  }
  return "Normtext-Länge verändert";
}

// ---------------------------------------------------------------------------
// Batch-Lauf mit Prüfschleuse und Checkpoint
// ---------------------------------------------------------------------------
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (e.endsWith(".md")) out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Dedupe beim Schreiben — statt Löschen im Rohkorpus.
//
// Zwei Fetcher-Generationen haben dieselben RIS-Dokumente doppelt abgelegt
// (`kurzparkzonengebuhrenverordnung` vs `kurzparkzonengebuehrenverordnung`,
// beide auf dieselbe Dokumentnummer). Die Datenbank darf jedes Dokument nur
// einmal sehen, sonst liefert jede Suche denselben Treffer mehrfach.
//
// Gelöst wird das hier statt durch Löschen: der Rohkorpus bleibt vollständig,
// in `_normalized/` landet pro Dokument genau die beste Fassung. Ohne
// unwiderrufliche Aktion — der Rohbestand ist nicht in git.
// ---------------------------------------------------------------------------
interface Quality { path: string; chrome: boolean; stub: boolean; substance: number; fields: number }

const RE_CHROME_Q = /Accesskey \d|Seitenbereiche:|Zur Navigationsleiste|Zum Seitenanfang/;
const RE_STUB_Q = /Volltext nicht abrufbar/;

function qualityOf(path: string, raw: Raw): Quality {
  const substance = raw.body
    .split("\n").filter((l) => !/^#{1,6}\s/.test(l)).join(" ")
    .replace(/https?:\/\/\S+/g, " ").replace(/\s+/g, " ").trim().length;
  return {
    path,
    chrome: RE_CHROME_Q.test(raw.body),
    stub: RE_STUB_Q.test(raw.body),
    substance,
    fields: Object.keys(raw.fm).length,
  };
}

/** Sauber schlägt schmutzig; bei <2 % Inhaltsunterschied gewinnen die Metadaten. */
function betterQ(a: Quality, b: Quality): Quality {
  if (a.stub !== b.stub) return a.stub ? b : a;
  if (a.chrome !== b.chrome) return a.chrome ? b : a;
  const max = Math.max(a.substance, b.substance);
  const equivalent = max > 0 && Math.abs(a.substance - b.substance) / max < 0.02;
  if (!equivalent) return a.substance > b.substance ? a : b;
  if (a.fields !== b.fields) return a.fields > b.fields ? a : b;
  return a.path < b.path ? a : b;
}

/** Vorlauf: bestimmt pro doc_id die Gewinnerdatei. */
function selectWinners(files: string[]): { winners: Set<string>; dropped: number } {
  const best = new Map<string, Quality>();
  const noId: string[] = [];
  for (const f of files) {
    let raw: Raw;
    try { raw = parseRaw(readFileSync(f, "utf8")); } catch { continue; }
    const url = clean(raw.fm.source_url) ?? "";
    const id = docIdOf(raw.fm, url);
    if (!id) { noId.push(f); continue; }
    const q = qualityOf(f, raw);
    const cur = best.get(id);
    best.set(id, cur ? betterQ(cur, q) : q);
  }
  const winners = new Set<string>([...best.values()].map((q) => q.path), );
  for (const f of noId) winners.add(f);   // ohne ID: nicht gruppierbar, durchlassen
  return { winners, dropped: files.length - winners.size };
}

interface BatchReport {
  batch: number; files: number; ok: number; rejected: number;
  issues: Record<string, number>; samples: { file: string; issues: ValidationIssue[] }[];
}

function main() {
  const srcDir = join(CORPUS_ROOT, CORPUS!);
  if (!existsSync(srcDir)) {
    console.error(`Korpus nicht gefunden: ${srcDir}`);
    process.exit(1);
  }
  const outDir = join(OUT_ROOT, CORPUS!);
  const ckptFile = join(STATE_DIR, `${CORPUS}.checkpoint`);

  // `--file-list` normalisiert gezielt einzelne Dateien mit DEMSELBEN Regelwerk
  // wie ein Vollauf.
  //
  // WARUM HIER UND NICHT IN EINEM EIGENEN SKRIPT: Für die Nachführung
  // refetchter Dateien gab es einen zweiten Normalizer mit eigenem,
  // "minimalem" Frontmatter-Bauer. Er kannte weder die Umwandlung von
  // ISO-Zeitstempeln in reine Datumsangaben noch das Verwerfen der erfundenen
  // `GNR-…`-Abkürzungen. Ergebnis: 32.147 roh importierte Seiten, 13.400
  // falsche Datumsformate und 5.305 wieder aufgetauchte GNR-Platzhalter —
  // Defekte, die vorher auf null standen. Zwei Implementierungen desselben
  // Vertrags driften auseinander; deshalb gibt es nur noch eine.
  let files = FILE_LIST
    ? readFileSync(FILE_LIST, "utf8").split("\n").map((l) => l.trim()).filter(Boolean)
        .map((p) => (p.startsWith("/") ? p : join(process.cwd(), p)))
        .filter((p) => existsSync(p))
    : walk(srcDir).sort();
  if (FILE_LIST) console.log(`[file-list] ${files.length} Dateien aus ${FILE_LIST}`);
  if (RESUME && existsSync(ckptFile)) {
    const done = parseInt(readFileSync(ckptFile, "utf8").trim(), 10) || 0;
    console.log(`[resume] überspringe ${done} bereits normalisierte Dateien`);
    files = files.slice(done);
  }
  if (LIMIT) files = files.slice(0, LIMIT);

  const totalFiles = files.length;
  // Die Doubletten-Auswahl MUSS über den gesamten Korpus rechnen, auch wenn
  // nur eine Teilmenge geschrieben wird. Rechnet sie nur über die Teilmenge,
  // kürt sie bei fehlender bester Fassung eine schlechtere zum Gewinner und
  // überschreibt die gute normalisierte Datei — bei at-judikatur hätte das
  // 31.286 von 86.559 Dateien betroffen.
  const auswahlBasis = FILE_LIST ? walk(srcDir).sort() : files;
  const { winners, dropped } = selectWinners(auswahlBasis);
  const vorher = files.length;
  files = files.filter((f) => winners.has(f));
  if (FILE_LIST && files.length < vorher) {
    console.log(`[file-list] ${vorher - files.length} Doubletten der Liste verworfen (Auswahl über den Gesamtkorpus)`);
  }

  console.log(`Korpus: ${CORPUS}`);
  console.log(`Dateien: ${totalFiles}   Doubletten übersprungen: ${dropped}   zu normalisieren: ${files.length}`);
  console.log(`Batchgröße: ${BATCH}   ${DRY ? "[DRY-RUN — nichts wird geschrieben]" : ""}`);
  console.log("─".repeat(78));

  let processed = 0, totalOk = 0, totalRejected = 0, batchNo = 0;
  const globalIssues: Record<string, number> = {};
  const rejects: { file: string; issues: ValidationIssue[] }[] = [];

  for (let start = 0; start < files.length; start += BATCH) {
    const slice = files.slice(start, start + BATCH);
    batchNo++;
    const rep: BatchReport = { batch: batchNo, files: slice.length, ok: 0, rejected: 0, issues: {}, samples: [] };

    for (const f of slice) {
      const rel = relative(srcDir, f);
      let text: string;
      try { text = readFileSync(f, "utf8"); }
      catch { rep.rejected++; continue; }

      const raw = parseRaw(text);
      const fallback = rel.replace(/\.md$/, "").replace(/[-/]/g, " ");
      const fm = mapToCanonical(raw, fallback);
      const newBody = normalizeBody(raw.body);

      // SICHERUNG vor allem anderen
      const drift = assertBodyUnchanged(raw.body, newBody);
      if (drift) {
        rep.rejected++;
        rep.issues["body_drift"] = (rep.issues["body_drift"] ?? 0) + 1;
        if (rejects.length < 50) rejects.push({ file: rel, issues: [{ field: "body", code: "body_drift", detail: drift }] });
        continue;
      }

      // content_hash IMMER neu berechnen. Die gespeicherten Hashes sind
      // wertlos: mehrstündige In-Place-Reparaturläufe haben Bodies umgeschrieben,
      // ohne den Hash im Frontmatter mitzuziehen — in einer Stichprobe von 8
      // OGH-Dateien passte kein einziger gespeicherter Hash mehr zum Inhalt
      // (weder Body, Body.trim noch Gesamtdatei). Übernähmen wir sie, trüge
      // das kanonische Format eine Integritätslüge weiter.
      fm.content_hash = hash16(text.trim());   // Hash der Quelldatei, contentHash()-Semantik
      fm.body_hash = hash16(newBody);          // Hash des Normtextes

      const issues = [...validateCanonical(fm), ...validateBody(newBody, fm.doc_class)];
      if (issues.length) {
        rep.rejected++;
        for (const i of issues) {
          const k = `${i.field}:${i.code}`;
          rep.issues[k] = (rep.issues[k] ?? 0) + 1;
          globalIssues[k] = (globalIssues[k] ?? 0) + 1;
        }
        if (rejects.length < 50) rejects.push({ file: rel, issues: issues.slice(0, 4) });
        continue;
      }

      rep.ok++;
      if (!DRY) {
        const dest = join(outDir, rel);
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, `${serializeCanonical(fm)}\n\n${newBody.replace(/^\n+/, "")}`, "utf8");
      }
    }

    processed += slice.length;
    totalOk += rep.ok;
    totalRejected += rep.rejected;

    const pct = ((rep.ok / rep.files) * 100).toFixed(1);
    const top = Object.entries(rep.issues).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([k, n]) => `${k}=${n}`).join("  ");
    console.log(`Batch ${String(batchNo).padStart(4)}  ${String(rep.ok).padStart(5)}/${String(rep.files).padEnd(5)} ok (${pct.padStart(5)}%)  ${top}`);

    if (!DRY) {
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(ckptFile, String(processed), "utf8");
    }
  }

  console.log("─".repeat(78));
  console.log(`GESAMT: ${totalOk}/${processed} normalisiert (${((totalOk / Math.max(processed, 1)) * 100).toFixed(1)}%), ${totalRejected} abgelehnt`);
  if (Object.keys(globalIssues).length) {
    console.log("\nAblehnungsgründe:");
    for (const [k, n] of Object.entries(globalIssues).sort((a, b) => b[1] - a[1]).slice(0, 20)) {
      console.log(`  ${String(n).padStart(7)}  ${k}`);
    }
  }
  if (rejects.length) {
    console.log("\nBeispiele:");
    for (const r of rejects.slice(0, 5)) {
      console.log(`  ${r.file}`);
      for (const i of r.issues) console.log(`      ${i.field} · ${i.code} · ${i.detail.slice(0, 90)}`);
    }
  }
}

if (import.meta.main) main();
