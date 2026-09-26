#!/usr/bin/env bun
/**
 * RIS Landesrecht — Vollbestands-Crawl der GELTENDEN Landesnormen (LrKons).
 *
 * The federal equivalent (ris-inforce-crawl.ts, Applikation=BrKons) is what
 * made the 2026-09-21 field-by-field audit of Bundesrecht possible: without
 * a local, authoritative "this is every currently valid document" list,
 * "vollständig" can only ever be an aggregate count, never a per-Gesetz
 * table. State law has never had that list. This is it.
 *
 * Same API family, same endpoint host, different Applikation and a
 * different metadata shape (`Metadaten.Landesrecht.LrKons.*` instead of
 * `Metadaten.Bundesrecht.BrKons.*`) — confirmed against the fields
 * fetch-at-landesrecht-xml.ts already reads live (Gesetzesnummer,
 * Dokumenttyp, ArtikelParagraphAnlage, Eli, Kurztitel/Titel/Langtitel,
 * Bundesland). The remaining fields (Abkuerzung, Inkrafttretensdatum,
 * Ausserkrafttretensdatum, Kundmachungsorgan) are read by the same-shaped
 * path as their BrKons counterparts on the assumption the two schemas are
 * symmetric — RIS OGD documents them as parallel "konsolidierte Fassung"
 * applications — but that assumption is UNVERIFIED against a live response
 * as of this writing. This script therefore checks itself: if any of those
 * four fields is empty on essentially every document in a real run, it
 * stops and says so instead of writing an index that silently starves every
 * script built on top of it.
 *
 *   bun run server/scripts/ris-inforce-crawl-landesrecht.ts [--out /tmp/ris-inforce-landesrecht.jsonl]
 */
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { dirname } from "path";
import { acquireRisLock, releaseRisLock } from "./ris-lock";
import { assessIndexCompleteness, parseTotalHits, writeIndexAtomic } from "./ris-index-write";
import { risMassPause, RIS_USER_AGENT } from "./ris-pace";

const API = "https://data.bka.gv.at/ris/api/v2.6/Landesrecht";
const UA = { "User-Agent": RIS_USER_AGENT };
// RIS OGD: one connection, 1–2 s between requests.
const PAGE_SIZE = 100;

const outArg = process.argv.indexOf("--out");
const OUT = outArg > -1 ? process.argv[outArg + 1] : "/tmp/ris-inforce-landesrecht.jsonl";
// Ein Lauf mit uebersprungenen Seiten landet hier statt am Zielpfad — das
// Soll entscheidet ueber Soft-Deletes und darf nie Luecken haben. Der
// Nachlade-Modus (--pages) fuellt diese Datei und tauscht sie erst bei
// Vollstaendigkeit atomar nach OUT.
const PARTIAL = `${OUT}.partial`;
const SKIPPED_FILE = `${OUT}.skipped.json`;
// --pages=1106,1107: Nachlade-Modus — laedt nur die genannten Seiten und
// mergt sie in den bestehenden Index (dedup via nor). Fuellt die Luecken,
// die der Voll-Crawl in OUT.skipped.json dokumentiert hat.
const PAGES_ARG = process.argv.find((a) => a.startsWith("--pages="));
const ONLY_PAGES = PAGES_ARG
  ? PAGES_ARG.slice("--pages=".length)
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0)
  : null;
const FASSUNG = new Date().toISOString().slice(0, 10);
// Below this share of non-empty values across the sample, a field is
// treated as mismapped rather than legitimately sparse. Kurztitel and Eli
// are known-universal on Bundesrecht's BrKons; the same is asserted here.
const SELF_CHECK_SAMPLE = 500;
const SELF_CHECK_MIN_SHARE = 0.5;

type Norm = {
  nor: string;
  gnr: string;
  kurztitel: string;
  abk: string | null;
  typ: string | null;
  dokumenttyp: string | null;
  apa: string | null;
  para: string | null;
  artikel: string | null;
  anlage: string | null;
  inkraft: string | null;
  ausserkraft: string | null;
  kundmachungsorgan: string | null;
  eli: string | null;
  region: string | null;
  url: string | null;
  indizes: string[];
};

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

export function str(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "object" && "#text" in (v as any))
    return String((v as any)["#text"]).trim() || null;
  return null;
}

function pageUrl(seite: number): string {
  return `${API}?Applikation=LrKons&DokumenteProSeite=OneHundred&Seitennummer=${seite}&Fassung.FassungVom=${FASSUNG}`;
}

/**
 * Gesamtzahl der geltenden Dokumente aus der Hits-Angabe der ersten
 * Seite. RIS antwortet jenseits des Ergebnis-Endes mit HTTP 500 statt
 * einer leeren Seite (beobachtet 2026-09-23, LrKons ab Seite 1106 bei
 * 110.457 Hits) — ohne bekanntes Ende wuerde der Crawl genau dort sterben.
 */
async function fetchTotalHits(): Promise<number | null> {
  const res = await fetch(pageUrl(1), { headers: UA, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseTotalHits(await res.json());
}

async function fetchPage(seite: number, attempt = 0): Promise<Norm[] | null> {
  try {
    const res = await fetch(pageUrl(seite), { headers: UA, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as any;
    const results = data?.OgdSearchResult?.OgdDocumentResults;
    const refs = asArray(results?.OgdDocumentReference);
    return refs.map((ref: any) => {
      const md = ref?.Data?.Metadaten ?? {};
      const land = md.Landesrecht ?? {};
      const lk = land.LrKons ?? {};
      return {
        nor: str(md.Technisch?.ID) ?? "",
        gnr: str(lk.Gesetzesnummer) ?? "",
        kurztitel: str(land.Kurztitel) ?? str(land.Titel) ?? str(land.Langtitel) ?? "",
        abk: str(lk.Abkuerzung),
        typ: str(lk.Typ),
        dokumenttyp: str(lk.Dokumenttyp),
        apa: str(lk.ArtikelParagraphAnlage),
        para: str(lk.Paragraphnummer),
        artikel: str(lk.Artikelnummer),
        anlage: str(lk.Anlagennummer),
        inkraft: str(lk.Inkrafttretensdatum),
        ausserkraft: str(lk.Ausserkrafttretensdatum),
        kundmachungsorgan: str(lk.Kundmachungsorgan),
        eli: str(lk.Eli),
        region: str(land.Bundesland),
        url: str(md.Allgemein?.DokumentUrl),
        indizes: asArray(lk.Indizes?.item)
          .map((i) => str(i) ?? "")
          .filter(Boolean),
      };
    });
  } catch (err) {
    if (attempt < 5) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      return fetchPage(seite, attempt + 1);
    }
    // Fehlgeschlagene Seiten duerfen den Lauf nicht toeten — der Caller
    // ueberspringt sie, sammelt sie in skippedPages und schreibt sie in
    // ein Sidecar-File zum gezielten Nachladen (--pages).
    console.warn(
      `  ⚠️  Seite ${seite} nach ${attempt + 1} Versuchen fehlgeschlagen — wird uebersprungen`
    );
    return null;
  }
}

/**
 * Warns loudly, does not throw: an operator reading the run's own output
 * should see this before trusting the index, but a self-check false
 * positive (a field that is legitimately sparse, e.g. Ausserkrafttretensdatum
 * on documents still in force) must not block a genuinely good run.
 */
export function fieldShare(sample: Norm[], get: (n: Norm) => string | null): number {
  return sample.length === 0 ? 1 : sample.filter((n) => get(n) != null).length / sample.length;
}

function selfCheck(sample: Norm[]): void {
  const checks: Array<[string, (n: Norm) => string | null]> = [
    ["abk", (n) => n.abk],
    ["inkraft", (n) => n.inkraft],
    ["kundmachungsorgan", (n) => n.kundmachungsorgan],
  ];
  for (const [name, get] of checks) {
    const s = fieldShare(sample, get);
    if (s < SELF_CHECK_MIN_SHARE) {
      console.warn(
        `⚠️  Feld "${name}" ist bei ${((1 - s) * 100).toFixed(0)}% der ersten ${sample.length} ` +
          `Dokumente leer. Das kann heißen, der angenommene JSON-Pfad für LrKons ist falsch — ` +
          `vor dem Vertrauen auf diesen Index den rohen API-Response manuell prüfen.`
      );
    }
  }
}

/**
 * Nachlade-Modus fuer vergiftete Seiten: merged die Dokumente der
 * angegebenen Seiten in den bestehenden Index (nor-Dedup, neue Zeile
 * gewinnt) und kuerzt OUT.skipped.json um die gelungenen Seiten.
 * Seiteninhalte verschieben sich upstream — das ist egal, der Index ist
 * eine nor-Menge, kein Seiten-Snapshot.
 */
async function refillSkippedPages(pages: number[]): Promise<void> {
  // Basis ist der Teil-Index des letzten Voll-Crawls; nur Altbestand ohne
  // .partial (vor dieser Regel geschrieben) wird direkt in OUT gemergt.
  const base = existsSync(PARTIAL) ? PARTIAL : OUT;
  if (!existsSync(base)) {
    console.error(`Index fehlt: ${OUT} — erst Voll-Crawl, dann --pages.`);
    process.exit(1);
  }
  let expectedTotal: number | null = null;
  try {
    const t = (JSON.parse(readFileSync(SKIPPED_FILE, "utf8")) as { total?: unknown }).total;
    expectedTotal = typeof t === "number" && t > 0 ? t : null;
  } catch {
    // kein/kaputtes Sidecar — Gesamtzahl unbekannt
  }
  const rows = new Map<string, string>();
  for (const line of readFileSync(base, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const n = JSON.parse(line) as Norm;
      if (n.nor) rows.set(n.nor, line);
    } catch {
      // kaputte Zeile — Voll-Crawl schreibt sie neu
    }
  }
  console.log(`Nachlade-Modus: ${pages.length} Seiten → ${base} (${rows.size} Zeilen)`);

  const remaining: number[] = [];
  for (const page of pages) {
    const batch = await fetchPage(page);
    if (batch === null) {
      remaining.push(page);
    } else {
      let added = 0;
      for (const n of batch) {
        if (!n.nor) continue;
        if (!rows.has(n.nor)) added++;
        rows.set(n.nor, JSON.stringify(n));
      }
      console.log(`  Seite ${page}: +${added} neue Normen (${batch.length} gelesen)`);
    }
    await risMassPause("Landesrecht-Inventar-Nachladen");
  }

  const lines = [...rows.values()];
  if (remaining.length > 0) {
    writeIndexAtomic(base, lines);
    writeFileSync(
      SKIPPED_FILE,
      JSON.stringify({ pages: remaining, total: expectedTotal, at: new Date().toISOString() }) +
        "\n"
    );
    console.warn(`⚠️  weiterhin offen: ${remaining.join(", ")} → ${SKIPPED_FILE}`);
    console.log(`✓ Teil-Index aktualisiert: ${base} (${rows.size} Zeilen) — ${OUT} unverändert`);
    return;
  }
  if (base === PARTIAL) {
    const verdict = assessIndexCompleteness({
      total: expectedTotal,
      written: rows.size,
      failedPages: [],
    });
    if (!verdict.ok) {
      writeIndexAtomic(PARTIAL, lines);
      rmSync(SKIPPED_FILE, { force: true });
      throw new Error(
        `Teil-Index nach Nachladen unplausibel (${verdict.reason}) — ${OUT} bleibt unverändert, ` +
          `nächster Voll-Crawl holt neu.`
      );
    }
  }
  writeIndexAtomic(OUT, lines);
  rmSync(PARTIAL, { force: true });
  rmSync(SKIPPED_FILE, { force: true });
  console.log(`✓ alle Nachlade-Seiten geholt — ${SKIPPED_FILE} entfernt`);
  console.log(`✓ geschrieben: ${OUT} (${rows.size} Zeilen)`);
}

async function main() {
  console.log("RIS Landesrecht in-force Crawl — Applikation=LrKons");
  await acquireRisLock();
  try {
    mkdirSync(dirname(OUT), { recursive: true });

    if (ONLY_PAGES) {
      if (ONLY_PAGES.length === 0) {
        console.error("--pages angegeben, aber keine gueltige Seitenzahl darin.");
        process.exit(1);
      }
      await refillSkippedPages(ONLY_PAGES);
      return;
    }

    const totalHits = await fetchTotalHits();
    if (totalHits === null) {
      // Keine Trefferzahl = unbrauchbare Antwort, nie "0 geltende Normen".
      throw new Error("Keine Trefferzahl (Hits) — Fassungsfilter/Applikation prüfen; Index unverändert.");
    }
    const totalPages = Math.ceil(totalHits / PAGE_SIZE);
    console.log(
      `RIS LrKons, Fassung vom ${FASSUNG}: ${totalHits} geltende Normen auf ${totalPages} Seiten`
    );

    const first = await fetchPage(1);
    if (first === null || first.length === 0) {
      console.error("Erste Seite lieferte 0 Dokumente — Fassungsfilter oder Applikation prüfen.");
      process.exit(1);
    }
    selfCheck(first);

    const all: Norm[] = [...first];
    const skippedPages: number[] = [];
    let consecutiveFailures = 0;
    let lastLog = Date.now();
    for (let page = 2; page <= totalPages; page++) {
      const batch = await fetchPage(page);
      // Fehlgeschlagene UND unerwartet leere Seiten innerhalb des
      // gemeldeten Bereichs werden uebersprungen + dokumentiert; erst ein
      // langer Fehler-Schub deutet auf einen echten RIS-Ausfall.
      if (batch === null || batch.length === 0) {
        skippedPages.push(page);
        consecutiveFailures++;
        if (consecutiveFailures >= 10) {
          throw new Error(
            `${consecutiveFailures} aufeinanderfolgende Seiten fehlgeschlagen (ab Seite ${page - 9}) — ` +
              `sieht nach RIS-Ausfall aus, nicht nach Einzelseiten. Abbruch zum Schutz vor Muell-Index.`
          );
        }
        await risMassPause("Landesrecht-Inventar");
        continue;
      }
      consecutiveFailures = 0;
      all.push(...batch);
      if (Date.now() - lastLog > 5000) {
        console.log(`  Seite ${page}/${totalPages} · ${all.length} Dokumente bisher`);
        lastLog = Date.now();
      }
      await risMassPause("Landesrecht-Inventar");
    }

    const nonGnr = all.filter((n) => !n.gnr).length;
    console.log(`\n${all.length} Dokumente, davon ${nonGnr} ohne Gesetzesnummer`);
    selfCheck(all.slice(0, SELF_CHECK_SAMPLE));
    const lines = all.map((n) => JSON.stringify(n));

    if (skippedPages.length > 0) {
      // Lueckenhaft: nur als Teil-Index ablegen, OUT bleibt der letzte
      // vollstaendige Stand. Die Pipeline laedt die Seiten per --pages nach.
      console.warn(`⚠️  ${skippedPages.length} Seiten uebersprungen: ${skippedPages.join(", ")}`);
      writeIndexAtomic(PARTIAL, lines);
      writeFileSync(
        SKIPPED_FILE,
        JSON.stringify({ pages: skippedPages, total: totalHits, at: new Date().toISOString() }) +
          "\n"
      );
      console.log(`Teil-Index: ${PARTIAL} — ${OUT} unverändert bis zum vollständigen Nachladen`);
      return;
    }

    const verdict = assessIndexCompleteness({
      total: totalHits,
      written: all.length,
      failedPages: [],
    });
    if (!verdict.ok) {
      throw new Error(`Index NICHT geschrieben: ${verdict.reason} — ${OUT} bleibt unverändert`);
    }
    writeIndexAtomic(OUT, lines);
    rmSync(PARTIAL, { force: true });
    rmSync(SKIPPED_FILE, { force: true });
    console.log(`✓ geschrieben: ${OUT} (${statSync(OUT).size} Bytes)`);
  } finally {
    releaseRisLock();
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    releaseRisLock();
    process.exit(1);
  });
}
