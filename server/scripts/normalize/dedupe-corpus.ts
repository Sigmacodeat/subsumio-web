#!/usr/bin/env bun
/**
 * Dedupe: dieselbe RIS-Dokumentnummer liegt mehrfach auf der Platte.
 *
 * URSACHE: zwei Fetcher-Generationen mit zwei Slug-Schemata haben dieselben
 * Dokumente doppelt geschrieben — erkennbar an der Umlaut-Transliteration
 * (`kurzparkzonengebuhrenverordnung` vs `kurzparkzonengebuehrenverordnung`),
 * beide auf `Dokumentnummer=GEMRE_KA_21002_1_6400_2024_AdZ_MR`.
 *
 * Bestätigt durch die RIS-OGD-API als maßgebliche Quelle:
 *   Gemeinden  RIS 18.420 ↔ 26.591 Dateien  (8.171 zuviel)
 *   AVSV       RIS  4.710 ↔  6.306 Dateien  (1.596 zuviel)
 *   AVN        RIS    702 ↔  1.124 Dateien  (  422 zuviel)
 *   SPG        RIS     75 ↔    116 Dateien  (   41 zuviel)
 *   KmGer      RIS     53 ↔     70 Dateien  (   17 zuviel)
 *
 * AUSWAHL: behalten wird die inhaltlich beste Fassung, nicht die neuere Datei.
 * Rangfolge — (1) kein Navigationsmüll, (2) mehr Substanztext, (3) mehr
 * Metadatenfelder, (4) alphabetisch stabil. Damit ist der Lauf deterministisch
 * und wiederholbar.
 *
 * SICHERHEIT: Dry-Run ist Standard. `--apply` löscht erst nach einem
 * geschriebenen Manifest, das jede Entscheidung mit Begründung festhält.
 *
 *   bun server/scripts/normalize/dedupe-corpus.ts --corpus at-gemeinden
 *   bun server/scripts/normalize/dedupe-corpus.ts --corpus at-gemeinden --apply
 */

import { readFileSync, writeFileSync, readdirSync, statSync, unlinkSync, mkdirSync } from "fs";
import { join, relative } from "path";

const args = process.argv.slice(2);
const arg = (n: string, d?: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const CORPUS = arg("--corpus");
const APPLY = args.includes("--apply");

const CORPUS_ROOT = process.env.LAW_CORPUS_ROOT ?? join(import.meta.dir, "..", "..", "..", "law-corpus");
const MANIFEST_DIR = join(CORPUS_ROOT, "_dedupe-manifests");

if (!CORPUS) { console.error("--corpus <name> erforderlich"); process.exit(1); }

const RE_CHROME = /Accesskey \d|Seitenbereiche:|Zur Navigationsleiste|Zum Seitenanfang/;
const RE_STUB = /Volltext nicht abrufbar/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (e.endsWith(".md")) out.push(p);
  }
  return out;
}

interface Cand {
  path: string; rel: string; docNr: string;
  chrome: boolean; stub: boolean; substance: number; fields: number;
}

function inspect(path: string, srcDir: string): Cand | null {
  const text = readFileSync(path, "utf8");
  // Dokumentnummern enthalten prozent-kodierte Umlaute:
  // GEMRE_ST_60101_Pr%c3%a4s_028296_2013_0045 = "…Präs…".
  // Ein Muster wie [A-Za-z0-9_]+ bricht am % ab und verschmilzt 155
  // verschiedene Grazer Gesetze zu einer Scheingruppe "GEMRE_ST_60101_Pr".
  // Deshalb bis zum Trennzeichen lesen und danach dekodieren.
  const m = text.match(/Dokumentnummer=([^&"'\s]+)/) ?? text.match(/^document_id:\s*"?([^"\n]+)"?/m);
  if (!m) return null;
  let docNr: string;
  try { docNr = decodeURIComponent(m[1]); } catch { docNr = m[1]; }
  const fmEnd = text.indexOf("\n---", 4);
  const fm = fmEnd > 0 ? text.slice(0, fmEnd) : "";
  const body = fmEnd > 0 ? text.slice(fmEnd + 4) : text;
  const substance = body
    .split("\n").filter((l) => !/^#{1,6}\s/.test(l)).join(" ")
    .replace(/https?:\/\/\S+/g, " ").replace(/\s+/g, " ").trim().length;
  return {
    path, rel: relative(srcDir, path), docNr,
    chrome: RE_CHROME.test(body), stub: RE_STUB.test(body),
    substance, fields: (fm.match(/^[a-z_]+:/gm) ?? []).length,
  };
}

/**
 * Rangfolge: sauber schlägt schmutzig, Inhalt schlägt Metadaten — aber bei
 * praktisch gleichem Inhalt gewinnt die metadatenreichere Fassung.
 *
 * Ohne die Toleranz behielt der Lauf z.B. bei GEMRE_NI_30401_MAGWN_2018_2 die
 * Fassung mit 5.726 Zeichen und 8 Feldern statt der mit 5.671 Zeichen und 13
 * Feldern — 55 Zeichen Unterschied (1 %), dafür 5 Metadatenfelder weniger.
 * Die 2-%-Schwelle behandelt solche Slug-Zwillinge (gebuhren/gebuehren) als
 * inhaltsgleich und entscheidet dann über die Metadaten.
 */
function better(a: Cand, b: Cand): Cand {
  if (a.stub !== b.stub) return a.stub ? b : a;
  if (a.chrome !== b.chrome) return a.chrome ? b : a;
  const max = Math.max(a.substance, b.substance);
  const equivalent = max > 0 && Math.abs(a.substance - b.substance) / max < 0.02;
  if (!equivalent) return a.substance > b.substance ? a : b;
  if (a.fields !== b.fields) return a.fields > b.fields ? a : b;
  if (a.substance !== b.substance) return a.substance > b.substance ? a : b;
  return a.rel < b.rel ? a : b;
}

function main() {
  const srcDir = join(CORPUS_ROOT, CORPUS!);
  const files = walk(srcDir);
  const groups = new Map<string, Cand[]>();
  let noId = 0;

  for (const f of files) {
    const c = inspect(f, srcDir);
    if (!c) { noId++; continue; }
    const g = groups.get(c.docNr) ?? [];
    g.push(c);
    groups.set(c.docNr, g);
  }

  const lines: string[] = [`# Dedupe-Manifest ${CORPUS} — ${new Date().toISOString()}`, ""];
  let dupGroups = 0, toDelete: Cand[] = [];

  for (const [docNr, cands] of groups) {
    if (cands.length < 2) continue;
    dupGroups++;
    const keep = cands.reduce(better);
    const drop = cands.filter((c) => c.path !== keep.path);
    toDelete.push(...drop);
    lines.push(`## ${docNr}`);
    lines.push(`  BEHALTEN  ${keep.rel}  (Substanz=${keep.substance}, Felder=${keep.fields}${keep.chrome ? ", CHROME" : ""})`);
    for (const d of drop)
      lines.push(`  LÖSCHEN   ${d.rel}  (Substanz=${d.substance}, Felder=${d.fields}${d.chrome ? ", CHROME" : ""}${d.stub ? ", STUB" : ""})`);
    lines.push("");
  }

  console.log(`Korpus:              ${CORPUS}`);
  console.log(`Dateien:             ${files.length}`);
  console.log(`ohne Dokumentnummer: ${noId}`);
  console.log(`eindeutige Dokumente:${groups.size}`);
  console.log(`Kollisionsgruppen:   ${dupGroups}`);
  console.log(`zu löschen:          ${toDelete.length}`);
  const chromeDrops = toDelete.filter((c) => c.chrome).length;
  const stubDrops = toDelete.filter((c) => c.stub).length;
  console.log(`  davon Navigationsmüll: ${chromeDrops}`);
  console.log(`  davon Stubs:           ${stubDrops}`);
  console.log(`  davon inhaltsgleich:   ${toDelete.length - chromeDrops - stubDrops}`);

  // Warnung: löschen wir irgendwo die inhaltlich BESSERE Fassung?
  const risky = toDelete.filter((c) => !c.chrome && !c.stub && c.substance > 2000);
  if (risky.length) {
    console.log(`\n⚠ ${risky.length} Löschkandidaten haben >2000 Zeichen Substanztext — Stichprobe:`);
    for (const r of risky.slice(0, 5)) console.log(`    ${r.rel} (${r.substance})`);
  }

  mkdirSync(MANIFEST_DIR, { recursive: true });
  const manifest = join(MANIFEST_DIR, `${CORPUS}.md`);
  writeFileSync(manifest, lines.join("\n"), "utf8");
  console.log(`\nManifest: ${manifest}`);

  if (!APPLY) {
    console.log("\nDRY-RUN — nichts gelöscht. Mit --apply ausführen.");
    return;
  }
  for (const c of toDelete) unlinkSync(c.path);
  console.log(`\n${toDelete.length} Dateien gelöscht.`);
}

if (import.meta.main) main();
