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
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { dirname } from "path";
import { acquireRisLock, releaseRisLock } from "./ris-lock";
import { risMassPause, RIS_USER_AGENT } from "./ris-pace";

const API = "https://data.bka.gv.at/ris/api/v2.6/Landesrecht";
const UA = { "User-Agent": RIS_USER_AGENT };
// RIS OGD: one connection, 1–2 s between requests.
const PAGE_SIZE = 100;

const outArg = process.argv.indexOf("--out");
const OUT = outArg > -1 ? process.argv[outArg + 1] : "/tmp/ris-inforce-landesrecht.jsonl";
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
  if (typeof v === "object" && "#text" in (v as any)) return String((v as any)["#text"]).trim() || null;
  return null;
}

function pageUrl(seite: number): string {
  return `${API}?Applikation=LrKons&DokumenteProSeite=OneHundred&Seitennummer=${seite}&Fassung.FassungVom=${FASSUNG}`;
}

async function fetchPage(seite: number, attempt = 0): Promise<Norm[]> {
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
    throw err;
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

async function main() {
  console.log("RIS Landesrecht in-force Crawl — Applikation=LrKons");
  await acquireRisLock();
  try {
    mkdirSync(dirname(OUT), { recursive: true });

    const first = await fetchPage(1);
    const totalHint = first.length;
    if (totalHint === 0) {
      console.error("Erste Seite lieferte 0 Dokumente — Fassungsfilter oder Applikation prüfen.");
      process.exit(1);
    }
    selfCheck(first);

    const all: Norm[] = [...first];
    let page = 2;
    let lastLog = Date.now();
    while (true) {
      const batch = await fetchPage(page);
      if (batch.length === 0) break;
      all.push(...batch);
      if (Date.now() - lastLog > 5000) {
        console.log(`  Seite ${page} · ${all.length} Dokumente bisher`);
        lastLog = Date.now();
      }
      page++;
      await risMassPause("Landesrecht-Inventar");
    }

    const nonGnr = all.filter((n) => !n.gnr).length;
    console.log(`\n${all.length} Dokumente, davon ${nonGnr} ohne Gesetzesnummer`);
    selfCheck(all.slice(0, SELF_CHECK_SAMPLE));

    writeFileSync(OUT, all.map((n) => JSON.stringify(n)).join("\n") + "\n");
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
