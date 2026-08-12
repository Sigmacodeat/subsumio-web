#!/usr/bin/env bun
/**
 * Judikatur-Dubletten: Analyse und Merge-Plan.
 *
 * Der AT-Judikatur-Korpus enthält pro Gericht zwei Dateikonventionen, die aus
 * zwei verschiedenen Fetch-Läufen stammen:
 *
 *   <datum>-<az>.md   type=court_decision  — sauberer Volltext (## Gericht/## Spruch/## Text)
 *                                            Frontmatter: ecli, case_number, legal_area
 *   <az>-<datum>.md   type=judikatur       — gleicher Text als Blob mit PDF-Fußzeilen
 *                                            Frontmatter: normen, entscheidungsart, document_id
 *
 * Wo beide denselben Fall beschreiben, ist die Datum-Variante inhaltlich besser,
 * die AZ-Variante hat die reicheren Metadaten. Der Plan: Text der Datum-Variante
 * behalten, Zusatzfelder der AZ-Variante übernehmen, AZ-Variante entfernen.
 *
 * ACHTUNG: Nicht jede AZ-Datei ist eine Dublette. Bei lvwg/vfgh/vwgh ist die
 * AZ-Menge fast vollständig eigenständig (Rechtssätze statt Entscheidungstexte).
 * Nur echte Paare (gleiches Aktenzeichen UND gleiches Datum) werden angefasst.
 *
 *   bun run server/scripts/judikatur-dedupe-plan.ts              # nur Analyse
 *   bun run server/scripts/judikatur-dedupe-plan.ts --json out.json
 */
import { readdirSync, readFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";

const CORPUS_ROOT = process.env.LAW_CORPUS_ROOT ?? join(import.meta.dir, "..", "..", "law-corpus");
const jsonIdx = process.argv.indexOf("--json");
const JSON_OUT = jsonIdx > -1 ? process.argv[jsonIdx + 1] : null;

/** Felder, die nur die AZ-Variante trägt und die übernommen werden sollen. */
const MERGE_FIELDS = ["normen", "entscheidungsart", "document_id", "dokumenttyp", "source_url"];

const DATE_FIRST = /^(\d{4}-\d{2}-\d{2})-(.+)$/;
const AZ_FIRST = /^(.+)-(\d{4}-\d{2}-\d{2})$/;
const ECLI_FIRST = /^ecli-(.+)$/;

type Pair = { key: string; dateFile: string; dupFile: string; kind: "az" | "ecli" };

function frontmatter(path: string): Record<string, string> {
  const head = readFileSync(path, "utf-8").slice(0, 4000);
  const m = head.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const km = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (km) out[km[1]] = km[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function normEcli(s: string): string {
  return s.toLowerCase().replace(/^ecli[-:]/, "").replace(/[:.]/g, "-").replace(/-+/g, "-").trim();
}

function analyseCourt(dir: string) {
  const full = join(CORPUS_ROOT, dir);
  if (!existsSync(full)) return null;
  const files = readdirSync(full).filter((f) => f.endsWith(".md"));

  const byKeyDate = new Map<string, string>();   // "<az>|<datum>" → Datei
  const byEcliDate = new Map<string, string>();  // normalisierte ECLI → Datum-Datei
  const byKeyAz = new Map<string, string>();
  const ecliFiles: string[] = [];
  /**
   * Vierte Dateiform: `<az>-<datum>-<N>.md`. Der Fetcher hängt eine Nummer an,
   * wenn mehrere RIS-Dokumente auf denselben Dateinamen fallen (etwa
   * Geschäftszahl 3 vs. 3a, oder Entscheidungstext vs. Rechtssatz). Das sind
   * EIGENSTÄNDIGE Dokumente mit eigener document_id — sie werden nie
   * quarantänisiert, aber hier gezählt, damit die Bilanz aufgeht.
   */
  const numbered: string[] = [];

  for (const f of files) {
    const base = f.replace(/\.md$/, "");
    const d = base.match(DATE_FIRST);
    if (d) {
      byKeyDate.set(`${d[2]}|${d[1]}`, f);
      const fm = frontmatter(join(full, f));
      if (fm.ecli) byEcliDate.set(normEcli(fm.ecli), f);
      continue;
    }
    if (ECLI_FIRST.test(base)) {
      ecliFiles.push(f);
      continue;
    }
    if (/-\d{4}-\d{2}-\d{2}-\d+$/.test(base)) {
      numbered.push(f);
      continue;
    }
    const a = base.match(AZ_FIRST);
    if (a) byKeyAz.set(`${a[1]}|${a[2]}`, f);
  }

  const pairs: Pair[] = [];

  // Klasse A: <az>-<datum> gegen <datum>-<az>
  for (const [key, azFile] of byKeyAz) {
    const dateFile = byKeyDate.get(key);
    if (dateFile) pairs.push({ key, dateFile, dupFile: azFile, kind: "az" });
  }
  const azOnly = [...byKeyAz.keys()].filter((k) => !byKeyDate.has(k)).length;

  // Klasse B: ecli-*.md NUR wenn dokumenttyp='Text' UND gleiche ECLI existiert.
  // Rechtssätze bleiben IMMER erhalten — sie sind eigener Inhalt, keine Dublette.
  let rechtssaetze = 0;
  let ecliUnmatched = 0;
  for (const f of ecliFiles) {
    const fm = frontmatter(join(full, f));
    const typ = (fm.dokumenttyp ?? "").toLowerCase();
    if (typ !== "text") {
      rechtssaetze++;
      continue;
    }
    const key = normEcli(fm.ecli ?? f.replace(/\.md$/, ""));
    const dateFile = byEcliDate.get(key);
    if (dateFile) pairs.push({ key, dateFile, dupFile: f, kind: "ecli" });
    else ecliUnmatched++;
  }

  return {
    dir,
    dateFiles: byKeyDate.size,
    azFiles: byKeyAz.size,
    ecliFiles: ecliFiles.length,
    dupAz: pairs.filter((p) => p.kind === "az").length,
    dupEcli: pairs.filter((p) => p.kind === "ecli").length,
    keepRechtssaetze: rechtssaetze,
    keepAzOnly: azOnly,
    keepEcliUnmatched: ecliUnmatched,
    keepNumbered: numbered.length,
    pairs,
  };
}

function main() {
  const courts = readdirSync(CORPUS_ROOT).filter((d) => d.startsWith("at-judikatur-"));
  const results = courts.map(analyseCourt).filter(Boolean) as NonNullable<ReturnType<typeof analyseCourt>>[];
  results.sort((a, b) => b.dupAz + b.dupEcli - (a.dupAz + a.dupEcli));

  console.log("╔════════════════════════════════════════════════════════════════════════╗");
  console.log("║  Judikatur-Dubletten — Analyse                                        ║");
  console.log("╚════════════════════════════════════════════════════════════════════════╝\n");
  const H = (s: string, n: number) => s.padStart(n);
  console.log(
    `  ${"Gericht".padEnd(10)}${H("datum", 9)}${H("dup-az", 9)}${H("dup-ecli", 10)}${H("Rechtssätze", 13)}${H("sonst behalten", 16)}`
  );
  console.log(`  ${"-".repeat(10)}${"-".repeat(9)}${"-".repeat(9)}${"-".repeat(10)}${"-".repeat(13)}${"-".repeat(16)}`);

  let totDup = 0;
  let totKeep = 0;
  for (const r of results) {
    const dup = r.dupAz + r.dupEcli;
    const keepOther = r.keepAzOnly + r.keepEcliUnmatched + r.keepNumbered;
    totDup += dup;
    totKeep += r.keepRechtssaetze + keepOther;
    console.log(
      `  ${r.dir.replace("at-judikatur-", "").padEnd(10)}${H(String(r.dateFiles), 9)}${H(String(r.dupAz), 9)}${H(String(r.dupEcli), 10)}${H(String(r.keepRechtssaetze), 13)}${H(String(keepOther), 16)}`
    );
  }
  console.log(`  ${"-".repeat(10)}${"-".repeat(9)}${"-".repeat(9)}${"-".repeat(10)}${"-".repeat(13)}${"-".repeat(16)}`);
  console.log(`  ${"SUMME".padEnd(10)}${H("", 9)}${H(String(results.reduce((a, r) => a + r.dupAz, 0)), 9)}${H(String(results.reduce((a, r) => a + r.dupEcli, 0)), 10)}${H(String(results.reduce((a, r) => a + r.keepRechtssaetze, 0)), 13)}${H(String(results.reduce((a, r) => a + r.keepAzOnly + r.keepEcliUnmatched + r.keepNumbered, 0)), 16)}`);

  // Merge-Nutzen an einer Stichprobe belegen
  console.log("\n  ÜBERNEHMBARE FELDER (Stichprobe je Gericht, max. 50 Paare)\n");
  const fieldStats: Record<string, { present: number; missingInDate: number }> = {};
  for (const f of MERGE_FIELDS) fieldStats[f] = { present: 0, missingInDate: 0 };
  let sampled = 0;

  for (const r of results) {
    for (const p of r.pairs.slice(0, 50)) {
      const azKeys = new Set(Object.keys(frontmatter(join(CORPUS_ROOT, r.dir, p.dupFile))));
      const dateKeys = new Set(Object.keys(frontmatter(join(CORPUS_ROOT, r.dir, p.dateFile))));
      sampled++;
      for (const f of MERGE_FIELDS) {
        if (azKeys.has(f)) {
          fieldStats[f].present++;
          if (!dateKeys.has(f)) fieldStats[f].missingInDate++;
        }
      }
    }
  }
  console.log(`  Stichprobe: ${sampled} Paare`);
  for (const f of MERGE_FIELDS) {
    const s = fieldStats[f];
    console.log(
      `    ${f.padEnd(18)} in AZ-Datei: ${String(s.present).padStart(5)}   davon in Datum-Datei fehlend: ${String(s.missingInDate).padStart(5)}`
    );
  }

  console.log("\n  PLAN");
  console.log(`    1. ${totDup} Paare: Zusatzfelder der Dublette → Datum-Datei übernehmen`);
  console.log(`    2. ${totDup} Dubletten-Dateien entfernen (Text liegt sauberer in der Datum-Variante)`);
  console.log(`    3. ${totKeep} Dateien BEHALTEN — Rechtssätze und eigenständige Dokumente`);
  console.log(`    4. DB: die zu 1./2. gehörenden Seiten (type='judikatur') löschen`);
  console.log("\n  Dieses Skript schreibt nichts. Ausführung erfolgt getrennt nach Freigabe.");

  if (JSON_OUT) {
    writeFileSync(
      JSON_OUT,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          corpusRoot: CORPUS_ROOT,
          totals: { duplicates: totDup, keep: totKeep },
          mergeFields: MERGE_FIELDS,
          courts: results.map((r) => ({
            dir: r.dir,
            dateFiles: r.dateFiles,
            dupAz: r.dupAz,
            dupEcli: r.dupEcli,
            keepRechtssaetze: r.keepRechtssaetze,
            keepOther: r.keepAzOnly + r.keepEcliUnmatched + r.keepNumbered,
            keepNumbered: r.keepNumbered,
            pairs: r.pairs,
          })),
        },
        null,
        2
      )
    );
    console.log(`\n  ✓ Plan → ${JSON_OUT}`);
  }
}

main();
