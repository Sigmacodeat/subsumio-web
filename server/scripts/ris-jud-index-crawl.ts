#!/usr/bin/env bun
/**
 * RIS Judikatur — document-exact index per court.
 *
 * The full scan (fetch-all-at-judikatur.ts) only knows a hit COUNT per court;
 * which decisions are missing locally cannot be told from that. This crawler
 * lists every document RIS OGD returns for a court and writes one line per
 * document, so fetch-jud-from-index.ts can fetch exactly the missing ones and
 * the inventory can name them.
 *
 * What the full scan got wrong and this crawler does not:
 *   1. It started at COURT_CONFIGS.defaultFrom (VwGH 1990, OGH 2000, …), so
 *      older decisions were never listed. Here the walk goes back year by
 *      year until RIS reports 0 hits for "EntscheidungsdatumBis=<year-1>-12-31".
 *   2. An HTTP error on one page ended the whole year silently. Here a page
 *      error makes the window fail its self-check and it is split.
 *   3. Nobody checked the listed documents against RIS's Hits. Here every
 *      window must list exactly Hits distinct ids; if not it is split
 *      (year → months → days) and retried. A day that still does not
 *      reconcile is recorded as incomplete — never dropped.
 *
 * Output (under <LAW_CORPUS_ROOT>/_state/):
 *   ris-index-jud-<court>.jsonl      one IndexLine per document (see below)
 *   ris-index-jud-<court>.meta.json  IndexMeta: totals, per-window self-check
 *   ris-index-jud-<court>.parts/     resume state, removed after a finished run
 *
 * Usage:
 *   bun scripts/ris-jud-index-crawl.ts --court ogh
 *   bun scripts/ris-jud-index-crawl.ts --court all --resume
 *
 * Pace: risMassPause before EVERY request (0.5 req/s per process), RIS lock
 * like the other fetchers, User-Agent RIS_USER_AGENT. Never shorten this.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { acquireRisLock, releaseRisLock } from "./ris-lock";
import { risMassPause, RIS_PAUSE_MS, RIS_USER_AGENT } from "./ris-pace";
import { proxyFetchOptions } from "./ris-proxy";
import { COURT_CONFIGS } from "./ris-jud-courts";
import { CORPUS_ROOT, extractHtmlUrl } from "./fetch-all-at-judikatur";
import { decisionTypeOf } from "./judikatur-file";
import {
  extractRisReferences,
  mapRisReference,
} from "../src/core/ingestion/connectors/legal-judgements.ts";

const RIS_BASE = "https://data.bka.gv.at/ris/api/v2.6";
export const PAGE_SIZE = 100;
/** Oldest year the backwards walk may reach — a guard, not an expectation. */
const OLDEST_YEAR = 1700;
const MAX_RETRIES = 3;

// ── Types ──────────────────────────────────────────────────────────────

/** Inclusive date window, YYYY-MM-DD on both ends. */
export interface DateWindow {
  from: string;
  to: string;
}

/** Self-check result of one leaf window (one that was not split further). */
export interface WindowRecord extends DateWindow {
  /** RIS Hits for exactly this window (-1: the first page never came back). */
  hits: number;
  /** Distinct document ids listed for it. */
  listed: number;
  ok: boolean;
  error?: string;
}

/** The fields buildMarkdown needs, minus the text — plus the API's HTML URL for the text fetch. */
export interface IndexLineMeta {
  court: string;
  /** ISO timestamp exactly as mapRisReference yields it (= JudikaturDoc.date). */
  date: string;
  az: string;
  ecli?: string;
  legalArea: string;
  keywords: string[];
  normen: string[];
  decisionType?: string;
  url: string;
  title: string;
  htmlUrl: string;
}

/**
 * One document. `id` is the RIS Dokumentnummer (Technisch.ID, e.g.
 * JJT_20200512_OGH0002_0010OB00001_20A0000_000), `kurztitel` a display label
 * (Geschäftszahl, else the id). Other scripts read exactly these two keys.
 */
export interface IndexLine {
  id: string;
  kurztitel: string;
  /** Entscheidungsdatum, YYYY-MM-DD ("" if RIS gives none). */
  datum: string;
  /** Dokumenttyp lower-cased: "rechtssatz", "text", … ("unbekannt" if absent). */
  typ: string;
  meta: IndexLineMeta;
}

/** One top-level window (a year, or the "future" window) with everything found in it. */
export interface WindowPart {
  window: DateWindow;
  records: WindowRecord[];
  lines: IndexLine[];
  /** Hits for "EntscheidungsdatumBis = day before window.from" (null: not asked). */
  olderHits: number | null;
}

export interface IndexMeta {
  court: string;
  label: string;
  applikation: string;
  /** Corpus directory under LAW_CORPUS_ROOT (COURT_CONFIGS[court].outDir). */
  corpus: string;
  startedAt: string;
  crawledAt: string;
  /** Hits of the query without any date filter (null: that query failed). */
  risTotal: number | null;
  /** Distinct document ids in the index. */
  listed: number;
  /** Sum of the leaf windows' Hits. */
  windowHitsSum: number;
  /** risTotal − windowHitsSum: documents no date window can reach (no or unparseable date). */
  undatedHits: number | null;
  complete: boolean;
  incompleteWindows: number;
  windows: WindowRecord[];
  notes: string[];
}

export interface CrawlDeps {
  /** GET a RIS OGD URL and return the parsed JSON; throws after retries. */
  fetchJson(url: string): Promise<unknown>;
  /** Runs before every request (production: risMassPause). */
  pause(): Promise<void>;
  log?(msg: string): void;
}

// ── Pure helpers ───────────────────────────────────────────────────────

export function searchUrl(applikation: string, page: number, from?: string, to?: string): string {
  const url = new URL(`${RIS_BASE}/judikatur`);
  url.searchParams.set("Applikation", applikation);
  url.searchParams.set("DokumenteProSeite", "OneHundred");
  url.searchParams.set("Seitennummer", String(page));
  if (from) url.searchParams.set("EntscheidungsdatumVon", from);
  if (to) url.searchParams.set("EntscheidungsdatumBis", to);
  return url.toString();
}

/** RIS Hits of a search response; null when the response carries none. */
export function hitsOf(data: unknown): number | null {
  const results = (data as any)?.OgdSearchResult?.OgdDocumentResults;
  if (!results) return null;
  const h = results.Hits;
  const raw = h && typeof h === "object" ? h["#text"] : h;
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const parts = (d: string) => d.split("-").map(Number) as [number, number, number];

/** The day before a YYYY-MM-DD date. */
export function dayBefore(d: string): string {
  const [y, m, day] = parts(d);
  const t = new Date(Date.UTC(y, m - 1, day));
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
}

/**
 * Split a window that did not reconcile into smaller ones covering exactly
 * the same days: several years → years, one year → months, one month → days.
 * A single day cannot be split: null.
 */
export function splitWindow(w: DateWindow): DateWindow[] | null {
  const [fy, fm, fd] = parts(w.from);
  const [ty, tm, td] = parts(w.to);
  const clip = (from: string, to: string): DateWindow => ({
    from: from < w.from ? w.from : from,
    to: to > w.to ? w.to : to,
  });
  const out: DateWindow[] = [];
  if (fy !== ty) {
    for (let y = fy; y <= ty; y++) out.push(clip(iso(y, 1, 1), iso(y, 12, 31)));
  } else if (fm !== tm) {
    for (let m = fm; m <= tm; m++) out.push(clip(iso(fy, m, 1), iso(fy, m, daysIn(fy, m))));
  } else if (fd !== td) {
    for (let d = fd; d <= td; d++) out.push({ from: iso(fy, fm, d), to: iso(fy, fm, d) });
  } else {
    return null;
  }
  return out;
}

/** Top-level windows of a crawl: the "future" window, then the current year. */
export function futureWindow(currentYear: number): DateWindow {
  return { from: iso(currentYear + 1, 1, 1), to: iso(currentYear + 100, 12, 31) };
}

export function yearWindow(year: number): DateWindow {
  return { from: iso(year, 1, 1), to: iso(year, 12, 31) };
}

export function windowKey(w: DateWindow): string {
  return `${w.from}_${w.to}`;
}

/** One RIS search hit → one index line. Null for a hit without a document number. */
export function buildIndexLine(ref: Record<string, unknown>, now = new Date()): IndexLine | null {
  const item = mapRisReference(ref, now);
  if (!item) return null;
  const id = item.id.replace(/^ris-/, "");
  const jud = (((ref.Data as any)?.Metadaten ?? {}).Judikatur ?? {}) as Record<string, unknown>;
  const rawDate = typeof jud.Entscheidungsdatum === "string" ? jud.Entscheidungsdatum : "";
  const datum = /^\d{4}-\d{2}-\d{2}/.test(rawDate) ? rawDate.slice(0, 10) : "";
  const typRaw = typeof jud.Dokumenttyp === "string" ? jud.Dokumenttyp.trim() : "";
  return {
    id,
    kurztitel: item.az || id,
    datum,
    typ: typRaw ? typRaw.toLowerCase() : "unbekannt",
    meta: {
      court: item.court,
      date: item.date,
      az: item.az ?? "",
      ...(item.ecli ? { ecli: item.ecli } : {}),
      legalArea: item.legalArea,
      keywords: item.keywords,
      normen: item.normen ?? [],
      ...(decisionTypeOf(ref) ? { decisionType: decisionTypeOf(ref) } : {}),
      url: item.url,
      title: item.title,
      htmlUrl: extractHtmlUrl(ref),
    },
  };
}

/** Every line once, first occurrence wins, order kept. */
export function dedupeLines(lines: IndexLine[]): IndexLine[] {
  const seen = new Set<string>();
  const out: IndexLine[] = [];
  for (const l of lines) {
    if (seen.has(l.id)) continue;
    seen.add(l.id);
    out.push(l);
  }
  return out;
}

/** Totals and the completeness verdict of a crawl. Pure. */
export function summarize(
  parts: WindowPart[],
  risTotal: number | null
): Pick<
  IndexMeta,
  | "listed"
  | "windowHitsSum"
  | "undatedHits"
  | "complete"
  | "incompleteWindows"
  | "windows"
  | "notes"
> & { lines: IndexLine[] } {
  const lines = dedupeLines(parts.flatMap((p) => p.lines));
  const windows = parts.flatMap((p) => p.records);
  const incomplete = windows.filter((w) => !w.ok);
  const windowHitsSum = windows.reduce((s, w) => s + Math.max(0, w.hits), 0);
  const notes: string[] = [];
  const undatedHits = risTotal === null ? null : risTotal - windowHitsSum;
  if (incomplete.length > 0) notes.push(`${incomplete.length} Fenster ohne Abgleich (ok=false)`);
  if (lines.length !== windowHitsSum)
    notes.push(`gelistet ${lines.length} ≠ Summe Fenster-Hits ${windowHitsSum}`);
  if (risTotal === null) notes.push("Gesamt-Hits (ohne Datumsfilter) nicht abrufbar");
  else if (undatedHits! < 0)
    notes.push(
      `Fenster-Hits ${windowHitsSum} > Gesamt-Hits ${risTotal} — RIS-Bestand hat sich während des Crawls geändert`
    );
  else if (undatedHits! > 0)
    notes.push(
      `${undatedHits} Dokumente fallen in kein Datumsfenster (ohne Entscheidungsdatum) — nicht einzeln gelistet`
    );
  const complete =
    incomplete.length === 0 &&
    lines.length === windowHitsSum &&
    risTotal !== null &&
    undatedHits! >= 0;
  return {
    lines,
    listed: lines.length,
    windowHitsSum,
    undatedHits,
    complete,
    incompleteWindows: incomplete.length,
    windows,
    notes,
  };
}

// ── Crawling (network through deps only) ───────────────────────────────

/** Hits of one query (first page only). */
export async function countHits(
  applikation: string,
  deps: CrawlDeps,
  from?: string,
  to?: string
): Promise<number> {
  await deps.pause();
  const data = await deps.fetchJson(searchUrl(applikation, 1, from, to));
  const hits = hitsOf(data);
  if (hits === null) throw new Error("Antwort ohne Hits");
  return hits;
}

/** List one window page by page and check it against its Hits. No splitting. */
export async function listWindow(
  applikation: string,
  w: DateWindow,
  deps: CrawlDeps
): Promise<{ record: WindowRecord; lines: IndexLine[] }> {
  const lines: IndexLine[] = [];
  const ids = new Set<string>();
  let hits = -1;
  let error: string | undefined;
  for (let page = 1; ; page++) {
    let data: unknown;
    try {
      await deps.pause();
      data = await deps.fetchJson(searchUrl(applikation, page, w.from, w.to));
    } catch (err) {
      error = `Seite ${page}: ${err instanceof Error ? err.message : String(err)}`;
      break;
    }
    const pageHits = hitsOf(data);
    if (pageHits === null) {
      error = `Seite ${page}: Antwort ohne Hits`;
      break;
    }
    if (page === 1) hits = pageHits;
    else if (pageHits !== hits) {
      error = `Hits änderten sich während des Blätterns (${hits} → ${pageHits})`;
      break;
    }
    const refs = extractRisReferences(data as Record<string, unknown>);
    for (const ref of refs) {
      const line = buildIndexLine(ref);
      if (!line || ids.has(line.id)) continue;
      ids.add(line.id);
      lines.push(line);
    }
    if (refs.length === 0 || page * PAGE_SIZE >= hits) break;
  }
  const ok = error === undefined && ids.size === hits;
  if (!ok && !error) error = `gelistet ${ids.size} ≠ Hits ${hits}`;
  return {
    record: { ...w, hits, listed: ids.size, ok, ...(error ? { error } : {}) },
    lines,
  };
}

/**
 * List a window; if it does not reconcile, split it and list the parts,
 * down to single days. Lines found at a coarser level are kept even when the
 * finer level misses them — a document RIS once returned is never dropped.
 */
export async function crawlWindow(
  applikation: string,
  w: DateWindow,
  deps: CrawlDeps
): Promise<{ records: WindowRecord[]; lines: IndexLine[] }> {
  const res = await listWindow(applikation, w, deps);
  if (res.record.ok) return { records: [res.record], lines: res.lines };
  const subs = splitWindow(w);
  if (!subs) {
    deps.log?.(`  ✗ ${w.from}: ${res.record.error} — bleibt unvollständig`);
    return { records: [res.record], lines: res.lines };
  }
  deps.log?.(`  ↳ ${w.from}…${w.to}: ${res.record.error} — teile in ${subs.length} Fenster`);
  const records: WindowRecord[] = [];
  const lines: IndexLine[] = [];
  for (const sub of subs) {
    const r = await crawlWindow(applikation, sub, deps);
    records.push(...r.records);
    lines.push(...r.lines);
  }
  // Coarse-level finds the sub-windows did not return, appended last.
  return { records, lines: dedupeLines([...lines, ...res.lines]) };
}

export interface CrawlCourtOptions {
  currentYear: number;
  /** Top-level windows already finished (resume), by windowKey. */
  done?: Map<string, WindowPart>;
  /** Called after each top-level window finishes (persist for resume). */
  onPart?(part: WindowPart): void;
}

/**
 * The whole court: the future window, then years from the current one
 * downwards until RIS has nothing older; then a re-check of the windows new
 * decisions land in, and the undated total.
 */
export async function crawlCourt(
  applikation: string,
  deps: CrawlDeps,
  opts: CrawlCourtOptions
): Promise<{ parts: WindowPart[]; risTotal: number | null; notes: string[] }> {
  const done = opts.done ?? new Map<string, WindowPart>();
  const parts: WindowPart[] = [];
  const notes: string[] = [];

  const runPart = async (w: DateWindow, askOlder: boolean): Promise<WindowPart> => {
    const prev = done.get(windowKey(w));
    if (prev) return prev;
    const r = await crawlWindow(applikation, w, deps);
    let olderHits: number | null = null;
    if (askOlder) {
      try {
        olderHits = await countHits(applikation, deps, undefined, dayBefore(w.from));
      } catch (err) {
        // Unknown ≠ zero: keep walking back rather than stop early.
        deps.log?.(`  ! Ältere Treffer vor ${w.from} nicht abfragbar: ${String(err)}`);
      }
    }
    const part: WindowPart = { window: w, records: r.records, lines: r.lines, olderHits };
    opts.onPart?.(part);
    return part;
  };

  // Decisions dated after this year (typos, pre-dated entries): one window.
  parts.push(await runPart(futureWindow(opts.currentYear), false));

  let reachedEnd = false;
  for (let y = opts.currentYear; y >= OLDEST_YEAR; y--) {
    const part = await runPart(yearWindow(y), true);
    parts.push(part);
    const got = part.lines.length;
    deps.log?.(
      `  ${y}: ${got} gelistet${part.records.some((r) => !r.ok) ? " (unvollständig)" : ""}` +
        (part.olderHits !== null ? ` · älter: ${part.olderHits}` : "")
    );
    if (part.olderHits === 0) {
      reachedEnd = true;
      break;
    }
  }
  if (!reachedEnd)
    notes.push(`Rückwärtslauf bei ${OLDEST_YEAR} abgebrochen, ohne 0 ältere Treffer`);

  // New decisions arrive during a crawl of hours; they land in the current
  // year (or the future window). If its Hits moved since it was listed, list
  // it once more so the totals below compare like with like.
  for (const i of [0, 1]) {
    const p = parts[i];
    if (!p) continue;
    const leafHits = p.records.reduce((s, r) => s + Math.max(0, r.hits), 0);
    let now: number;
    try {
      now = await countHits(applikation, deps, p.window.from, p.window.to);
    } catch {
      continue;
    }
    if (now !== leafHits) {
      deps.log?.(`  ↻ ${p.window.from}…${p.window.to}: Hits ${leafHits} → ${now}, neu gelistet`);
      const r = await crawlWindow(applikation, p.window, deps);
      parts[i] = { ...p, records: r.records, lines: r.lines };
      opts.onPart?.(parts[i]);
    }
  }

  let risTotal: number | null = null;
  try {
    risTotal = await countHits(applikation, deps);
  } catch (err) {
    notes.push(`Gesamt-Hits-Abfrage fehlgeschlagen: ${String(err)}`);
  }
  return { parts, risTotal, notes };
}

// ── IO ─────────────────────────────────────────────────────────────────

export function indexPaths(corpusRoot: string, courtKey: string) {
  const dir = join(corpusRoot, "_state");
  return {
    dir,
    index: join(dir, `ris-index-jud-${courtKey}.jsonl`),
    meta: join(dir, `ris-index-jud-${courtKey}.meta.json`),
    parts: join(dir, `ris-index-jud-${courtKey}.parts`),
  };
}

export function writeAtomic(path: string, content: string): void {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, content, "utf8");
  renameSync(tmp, path);
}

export function loadParts(partsDir: string): Map<string, WindowPart> {
  const out = new Map<string, WindowPart>();
  if (!existsSync(partsDir)) return out;
  for (const f of readdirSync(partsDir)) {
    if (!f.endsWith(".json")) continue;
    try {
      const p = JSON.parse(readFileSync(join(partsDir, f), "utf8")) as WindowPart;
      if (p?.window?.from && Array.isArray(p.lines)) out.set(windowKey(p.window), p);
    } catch {
      // Torn file of a killed run — that window is simply crawled again.
    }
  }
  return out;
}

async function productionFetchJson(url: string): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, RIS_PAUSE_MS * 2 ** attempt));
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": RIS_USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(60_000),
        ...proxyFetchOptions(),
      });
      if (res.ok) return await res.json();
      lastErr = new Error(`HTTP ${res.status}`);
      // 4xx other than 429 will not get better by asking again.
      if (res.status < 500 && res.status !== 429) break;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function crawlOne(courtKey: string, resume: boolean): Promise<IndexMeta> {
  const court = COURT_CONFIGS[courtKey]!;
  const paths = indexPaths(CORPUS_ROOT, courtKey);
  mkdirSync(paths.dir, { recursive: true });
  if (!resume && existsSync(paths.parts)) rmSync(paths.parts, { recursive: true, force: true });
  mkdirSync(paths.parts, { recursive: true });
  const done = loadParts(paths.parts);
  const startedFile = join(paths.parts, "started-at");
  const startedAt = existsSync(startedFile)
    ? readFileSync(startedFile, "utf8").trim()
    : new Date().toISOString();
  if (!existsSync(startedFile)) writeFileSync(startedFile, startedAt);

  console.log(`\n═══ ${court.label} (${court.applikation}) → ${paths.index}`);
  if (done.size > 0)
    console.log(`  Fortsetzung: ${done.size} Fenster schon fertig (seit ${startedAt})`);

  const deps: CrawlDeps = {
    fetchJson: productionFetchJson,
    pause: () => risMassPause("Judikatur-Index"),
    log: (m) => console.log(m),
  };
  const { parts, risTotal, notes } = await crawlCourt(court.applikation, deps, {
    currentYear: new Date().getFullYear(),
    done,
    onPart: (p) => writeAtomic(join(paths.parts, `${windowKey(p.window)}.json`), JSON.stringify(p)),
  });
  const s = summarize(parts, risTotal);
  const meta: IndexMeta = {
    court: courtKey,
    label: court.label,
    applikation: court.applikation,
    corpus: court.outDir,
    startedAt,
    crawledAt: new Date().toISOString(),
    risTotal,
    listed: s.listed,
    windowHitsSum: s.windowHitsSum,
    undatedHits: s.undatedHits,
    complete: s.complete,
    incompleteWindows: s.incompleteWindows,
    windows: s.windows,
    notes: [...notes, ...s.notes],
  };
  writeAtomic(
    paths.index,
    s.lines.map((l) => JSON.stringify(l)).join("\n") + (s.lines.length ? "\n" : "")
  );
  writeAtomic(paths.meta, JSON.stringify(meta, null, 2) + "\n");
  rmSync(paths.parts, { recursive: true, force: true });

  console.log(
    `  ${court.label}: ${s.listed} gelistet · RIS gesamt ${risTotal ?? "?"} · ` +
      `${s.complete ? "vollständig" : "UNVOLLSTÄNDIG"}`
  );
  for (const n of meta.notes) console.log(`    – ${n}`);
  return meta;
}

async function main() {
  const args = process.argv.slice(2);
  const courtIdx = args.indexOf("--court");
  const sourceIdx = args.indexOf("--source"); // pipeline trigger vocabulary
  const courtArg =
    courtIdx >= 0 ? args[courtIdx + 1] : sourceIdx >= 0 ? args[sourceIdx + 1] : undefined;
  const resume = args.includes("--resume");
  if (!courtArg) {
    console.error(
      `Usage: bun scripts/ris-jud-index-crawl.ts --court <${Object.keys(COURT_CONFIGS).join("|")}|all> [--resume]`
    );
    process.exit(2);
  }
  const courts =
    courtArg === "all" ? Object.keys(COURT_CONFIGS) : courtArg.split(",").map((c) => c.trim());
  const unknown = courts.filter((c) => !COURT_CONFIGS[c]);
  if (unknown.length > 0) {
    console.error(
      `Unbekanntes Gericht: ${unknown.join(", ")}. Verfügbar: ${Object.keys(COURT_CONFIGS).join(", ")}`
    );
    process.exit(2);
  }

  await acquireRisLock();
  console.log(`RIS-Pacing: ${RIS_PAUSE_MS} ms vor jeder Anfrage, eine Verbindung.`);
  let incomplete = 0;
  for (const c of courts) {
    const meta = await crawlOne(c, resume);
    if (!meta.complete) incomplete++;
  }
  // An incomplete index is a finished run with a documented gap (meta.json),
  // not a crash: exit 0 so a pipeline trigger does not respawn it forever.
  if (incomplete > 0) console.log(`\n${incomplete} Index(e) unvollständig — siehe *.meta.json`);
}

if (import.meta.main) {
  main()
    .then(() => releaseRisLock())
    .catch((err) => {
      console.error("Fatal:", err);
      releaseRisLock();
      process.exit(1);
    });
}
