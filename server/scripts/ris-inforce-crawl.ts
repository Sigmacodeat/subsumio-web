#!/usr/bin/env bun
/**
 * RIS Bundesrecht — Vollbestands-Crawl der GELTENDEN Normen (BrKons).
 *
 * Enumeriert alle mit `Fassungvom=<heute>` in Kraft stehenden Normen und
 * schreibt eine Zeile pro Norm als JSONL. Grundlage für den 1:1-Abgleich
 * gegen die lokale DB (siehe ris-db-audit.ts).
 *
 *   bun run server/scripts/ris-inforce-crawl.ts [--out /tmp/ris-inforce.jsonl]
 */
import { existsSync, mkdirSync, readFileSync, statSync } from "fs";
import { dirname } from "path";
import { acquireRisLock, releaseRisLock } from "./ris-lock";
import { assessIndexCompleteness, parseTotalHits, writeIndexAtomic } from "./ris-index-write";
import { risMassPause, RIS_USER_AGENT } from "./ris-pace";

const API = "https://data.bka.gv.at/ris/api/v2.6/Bundesrecht";
const UA = { "User-Agent": RIS_USER_AGENT };
// RIS OGD: one connection per process. The cross-process slot limit in
// ris-lock.ts is currently switched off (see its header).
const CONCURRENCY = 1;
const PAGE_SIZE = 100;

const outArg = process.argv.indexOf("--out");
const OUT = outArg > -1 ? process.argv[outArg + 1] : "/tmp/ris-inforce.jsonl";
const FASSUNG = new Date().toISOString().slice(0, 10);

type Norm = {
  nor: string;
  gnr: string;
  kurztitel: string;
  abk: string | null;
  typ: string | null;
  dokumenttyp: string | null;
  apa: string | null; // ArtikelParagraphAnlage, z.B. "§ 1152"
  para: string | null;
  artikel: string | null;
  anlage: string | null;
  inkraft: string | null;
  ausserkraft: string | null;
  kundmachungsorgan: string | null;
  eli: string | null;
  url: string | null;
  indizes: string[];
};

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function str(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "object" && "#text" in (v as any))
    return String((v as any)["#text"]).trim() || null;
  return null;
}

function pageUrl(seite: number): string {
  return `${API}?Applikation=BrKons&DokumenteProSeite=OneHundred&Seitennummer=${seite}&Fassungvom=${FASSUNG}`;
}

/** null = page lost after all retries (never an empty page). */
async function fetchPage(seite: number, attempt = 0): Promise<Norm[] | null> {
  try {
    const res = await fetch(pageUrl(seite), { headers: UA });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as any;
    const results = data?.OgdSearchResult?.OgdDocumentResults;
    const refs = asArray(results?.OgdDocumentReference);
    return refs.map((ref: any) => {
      const md = ref?.Data?.Metadaten ?? {};
      const bund = md.Bundesrecht ?? {};
      const bk = bund.BrKons ?? {};
      return {
        nor: str(md.Technisch?.ID) ?? "",
        gnr: str(bk.Gesetzesnummer) ?? "",
        kurztitel: str(bund.Kurztitel) ?? "",
        abk: str(bk.Abkuerzung),
        typ: str(bk.Typ),
        dokumenttyp: str(bk.Dokumenttyp),
        apa: str(bk.ArtikelParagraphAnlage),
        para: str(bk.Paragraphnummer),
        artikel: str(bk.Artikelnummer),
        anlage: str(bk.Anlagennummer),
        inkraft: str(bk.Inkrafttretensdatum),
        ausserkraft: str(bk.Ausserkrafttretensdatum),
        kundmachungsorgan: str(bk.Kundmachungsorgan),
        eli: str(bund.Eli),
        url: str(md.Allgemein?.DokumentUrl),
        indizes: asArray(bk.Indizes?.item)
          .map((i) => str(i) ?? "")
          .filter(Boolean),
      };
    });
  } catch (err) {
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      return fetchPage(seite, attempt + 1);
    }
    console.error(`  ! Seite ${seite} nach 5 Versuchen aufgegeben: ${String(err)}`);
    return null;
  }
}

/** Hours after which the index is refetched; --force ignores it. */
const MAX_AGE_HOURS = Number(
  process.argv.find((a) => a.startsWith("--max-age-hours="))?.split("=")[1] ?? 24
);

async function main() {
  // The index is ~1,600 paged requests, about an hour inside the allowed
  // window. A queue restarted the same day must not spend that hour again:
  // when the file is younger than --max-age-hours, this step is skipped.
  if (!process.argv.includes("--force") && existsSync(OUT)) {
    const ageHours = (Date.now() - statSync(OUT).mtimeMs) / 3_600_000;
    if (ageHours < MAX_AGE_HOURS) {
      const lines = readFileSync(OUT, "utf8").trimEnd().split("\n").length;
      console.log(
        `Index ist ${ageHours.toFixed(1)} h alt (${lines} Normen) — wird nicht erneut geholt. ` +
          `Mit --force oder --max-age-hours=0 erzwingen.`
      );
      return;
    }
  }

  await acquireRisLock();
  // Gesamtzahl ermitteln. Eine Fehlerantwort (HTTP-Fehler oder JSON ohne
  // Hits) ist ein Abbruch, nie "0 geltende Normen" — ein leerer Index
  // wuerde sonst als gueltiges Soll alle Gesetzesseiten verwaisen lassen.
  const probe = await fetch(pageUrl(1), { headers: UA });
  if (!probe.ok) throw new Error(`Trefferzahl-Abfrage: HTTP ${probe.status}`);
  const total = parseTotalHits(await probe.json());
  if (total === null) {
    throw new Error("Trefferzahl-Abfrage ohne Hits — Index bleibt unverändert.");
  }
  const pages = Math.ceil(total / PAGE_SIZE);
  console.log(`RIS BrKons, Fassung vom ${FASSUNG}: ${total} geltende Normen auf ${pages} Seiten`);

  if (!existsSync(dirname(OUT))) mkdirSync(dirname(OUT), { recursive: true });

  let done = 0;
  let written = 0;
  let next = 1;
  const buf: string[] = [];
  const failedPages: number[] = [];

  async function worker() {
    while (true) {
      const seite = next++;
      if (seite > pages) return;
      const norms = await fetchPage(seite);
      await risMassPause("Normen-Inventar");
      if (norms === null) failedPages.push(seite);
      for (const n of norms ?? []) {
        buf.push(JSON.stringify(n));
        written++;
      }
      done++;
      if (done % 25 === 0 || done === pages) {
        process.stderr.write(`\r  ${done}/${pages} Seiten · ${written} Normen`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  process.stderr.write("\n");
  // Erst pruefen, dann schreiben: ein unvollstaendiger Lauf laesst den
  // bisherigen Index stehen (atomarer Tausch nur bei vollstaendigem Ergebnis).
  const verdict = assessIndexCompleteness({ total, written, failedPages });
  if (!verdict.ok) {
    throw new Error(`Index NICHT geschrieben: ${verdict.reason} — ${OUT} bleibt unverändert`);
  }
  writeIndexAtomic(OUT, buf);
  console.log(`✓ ${written} Normen geschrieben → ${OUT}`);
}

main()
  .then(() => releaseRisLock())
  .catch((e) => {
    console.error(e);
    releaseRisLock();
    process.exit(1);
  });
