#!/usr/bin/env bun
/**
 * Full decision texts of OGH (incl. OLG/LG in "Justiz"), VwGH and VfGH.
 *
 * For these courts the RIS search returns Rechtssätze (JJR/JWR/JFR). The
 * decisions themselves (JJT/JWT/JFT) are only reachable through each
 * Rechtssatz's `Entscheidungstexte` list. Every earlier fetch took the search
 * hit's own ID, so the corpus held 55 666 OGH Rechtssätze and no OGH decision
 * text at all (VwGH: 1, VfGH: 3).
 *
 * Walks the RIS search year by year (100 Rechtssätze per request), collects
 * every referenced decision text, and fetches each one missing from
 * _normalized as XML. One file per RIS document number, so a later run never
 * writes the same decision under a second name.
 *
 *   bun scripts/fetch-entscheidungstexte.ts --court ogh
 *   bun scripts/fetch-entscheidungstexte.ts --court vfgh,vwgh --from 1990
 *
 * RIS OGD: one connection, 2 s between requests (ris-pace.ts); the shared
 * ris-lock is currently switched off (see ris-lock.ts).
 * Resumable: finished years are recorded; fetched texts are skipped.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { dump as yamlDump } from "js-yaml";
import { acquireRisLock, releaseRisLock } from "./ris-lock";
import { getUserAgent, proxyFetchOptions } from "./ris-proxy";
import { atomicWrite, contentMatchesDocument, risXmlToText } from "./backfill-utils";
import { extractRisReferences } from "../src/core/ingestion/connectors/legal-judgements.ts";
import { dokumentnummerOf } from "./judikatur-file";
import { risMassPause } from "./ris-pace";

const RIS_BASE = "https://data.bka.gv.at/ris/api/v2.6";

const COURTS: Record<string, { applikation: string; dir: string; label: string }> = {
  ogh: { applikation: "Justiz", dir: "at-judikatur", label: "OGH" },
  vwgh: { applikation: "Vwgh", dir: "at-judikatur-vwgh", label: "VwGH" },
  vfgh: { applikation: "Vfgh", dir: "at-judikatur-vfgh", label: "VfGH" },
};

const args = process.argv.slice(2);
const arg = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const FROM = parseInt(arg("--from") ?? "1900", 10);
const LIMIT = parseInt(arg("--limit") ?? "0", 10);
const courts = (arg("--court") ?? "ogh").split(",");
const ROOT = process.env.LAW_CORPUS_ROOT ?? join(import.meta.dirname, "..", "..", "law-corpus");
const STATE = join(ROOT, "_normalized", "_state", "fetch-entscheidungstexte.json");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function risGet(url: string): Promise<Response | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": getUserAgent() },
        signal: AbortSignal.timeout(60_000),
        ...proxyFetchOptions(),
      });
      if (res.ok) return res;
      if (res.status !== 429 && res.status < 500) return null;
    } catch {
      /* retry */
    }
    await sleep(2000 * 2 ** attempt);
  }
  return null;
}

export interface TextRef {
  dokNr: string;
  gz: string;
  date: string;
  court: string;
  note?: string;
}

/** Every decision text a Rechtssatz search hit refers to, whatever the court block is called. */
export function textRefsOf(ref: Record<string, unknown>): TextRef[] {
  const jud = ((ref.Data as any)?.Metadaten?.Judikatur ?? {}) as Record<string, any>;
  const out: TextRef[] = [];
  for (const block of Object.values(jud)) {
    const items = block && typeof block === "object" ? block.Entscheidungstexte?.item : undefined;
    if (!items) continue;
    for (const t of Array.isArray(items) ? items : [items]) {
      const dokNr = dokumentnummerOf(String(t?.DokumentUrl ?? ""));
      if (!dokNr || !/^J[A-Z]T_/.test(dokNr)) continue;
      out.push({
        dokNr,
        gz: String(t.Geschaeftszahl ?? "").trim(),
        date: String(t.Entscheidungsdatum ?? "").slice(0, 10),
        court: String(t.Gericht ?? "").trim(),
        note: t.Anmerkung ? String(t.Anmerkung) : undefined,
      });
    }
  }
  return out;
}

export function buildTextMarkdown(
  r: TextRef,
  courtKey: string,
  applikation: string,
  text: string,
  ecli: string | null
): string {
  const court = r.court || COURTS[courtKey].label;
  const url = `https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=${applikation}&Dokumentnummer=${r.dokNr}`;
  const fm: Record<string, unknown> = {
    type: "court_decision",
    jurisdiction: "at",
    court_type: courtKey,
    title: `${court} — ${r.gz || r.dokNr}`,
    court,
    date: r.date,
    decision_date: r.date,
    ecli: ecli ?? "",
    case_number: r.gz,
    dokumenttyp: "Entscheidungstext",
    source: "ris-ogd",
    source_url: url,
    source_format: "xml",
  };
  if (r.note) fm.anmerkung = r.note;
  return `---\n${yamlDump(fm, { lineWidth: -1, noRefs: true }).trimEnd()}\n---\n\n# ${court} — ${r.gz}\n\n${text}\n`;
}

function validatedIds(dir: string): Set<string> {
  const out = new Set<string>();
  for (const base of [join(ROOT, "_normalized", dir), join(ROOT, dir)]) {
    if (!existsSync(base)) continue;
    for (const f of readdirSync(base)) {
      // Raw files count only when named by document number (written by this
      // script); anything else must have passed the normalizer.
      if (base.endsWith(`/${dir}`) && !base.includes("_normalized") && !/^j[a-z]t_/.test(f))
        continue;
      if (!f.endsWith(".md")) continue;
      const head = readFileSync(join(base, f), "utf8").slice(0, 1500);
      const id =
        head.match(/^doc_id:\s*["']?(J[A-Z]T_[^"'\s]+)/m)?.[1] ??
        dokumentnummerOf(head.match(/^source_url:\s*["']?([^\s"']+)/m)?.[1] ?? "");
      if (id && /^J[A-Z]T_/.test(id)) out.add(id);
    }
  }
  return out;
}

async function main() {
  const state: Record<string, number[]> = existsSync(STATE)
    ? JSON.parse(readFileSync(STATE, "utf8"))
    : {};
  const thisYear = new Date().getFullYear();
  await acquireRisLock();
  try {
    for (const courtKey of courts) {
      const cfg = COURTS[courtKey];
      if (!cfg) throw new Error(`Unbekanntes Gericht: ${courtKey}`);
      const have = validatedIds(cfg.dir);
      const outDir = join(ROOT, cfg.dir);
      mkdirSync(outDir, { recursive: true });
      const done = new Set(state[courtKey] ?? []);
      let written = 0;
      let failed = 0;
      let requests = 0;
      console.log(`\n=== ${cfg.label}: ${have.size} Entscheidungstexte bereits vorhanden`);

      for (let year = thisYear; year >= FROM; year--) {
        if (done.has(year)) continue;
        const queue = new Map<string, TextRef>();
        for (let page = 1; page <= 5000; page++) {
          const url = new URL(`${RIS_BASE}/judikatur`);
          url.searchParams.set("Applikation", cfg.applikation);
          url.searchParams.set("DokumenteProSeite", "OneHundred");
          url.searchParams.set("Seitennummer", String(page));
          url.searchParams.set("EntscheidungsdatumVon", `${year}-01-01`);
          url.searchParams.set("EntscheidungsdatumBis", `${year}-12-31`);
          const res = await risGet(url.toString());
          requests++;
          await risMassPause("Entscheidungstexte");
          if (!res) break;
          const refs = extractRisReferences((await res.json()) as Record<string, unknown>);
          for (const ref of refs)
            for (const t of textRefsOf(ref)) if (!have.has(t.dokNr)) queue.set(t.dokNr, t);
          if (refs.length < 100) break;
        }

        for (const t of queue.values()) {
          if (LIMIT && written >= LIMIT) break;
          const xmlRes = await risGet(
            `https://www.ris.bka.gv.at/Dokumente/${cfg.applikation}/${t.dokNr}/${t.dokNr}.xml`
          );
          requests++;
          await risMassPause("Entscheidungstexte");
          const xml = xmlRes ? await xmlRes.text() : "";
          const text = xml ? risXmlToText(xml) : "";
          // Identity guard: the text must name its own case number.
          if (text.length < 200 || (t.gz && !contentMatchesDocument(text, { case_number: t.gz }))) {
            failed++;
            continue;
          }
          const ecli = xml.match(/ECLI:AT:[A-Z0-9]+:\d{4}:[A-Z0-9.]+/)?.[0] ?? null;
          atomicWrite(
            join(outDir, `${t.dokNr.toLowerCase()}.md`),
            buildTextMarkdown(t, courtKey, cfg.applikation, text, ecli)
          );
          have.add(t.dokNr);
          written++;
        }

        done.add(year);
        state[courtKey] = [...done];
        mkdirSync(dirname(STATE), { recursive: true });
        writeFileSync(STATE, JSON.stringify(state));
        console.log(
          `  ${cfg.label} ${year}: ${queue.size} fehlten, ${written} geschrieben gesamt, ${failed} fehlgeschlagen, ${requests} Anfragen`
        );
        if (LIMIT && written >= LIMIT) break;
      }
      console.log(
        `=== ${cfg.label} fertig: ${written} Entscheidungstexte neu, ${failed} fehlgeschlagen`
      );
    }
  } finally {
    releaseRisLock();
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error("Fatal:", e);
    releaseRisLock();
    process.exit(1);
  });
}
