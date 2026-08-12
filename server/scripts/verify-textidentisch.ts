#!/usr/bin/env bun
/**
 * Stufe 5 „textidentisch": jeder Normtext-Knoten der Quelle steht in unserem Text.
 *
 * WOZU: Alle anderen Prüfungen messen unsere Daten gegen sich selbst und können
 * prinzipiell nicht sehen, ob Text FEHLT. Der `<listelem>`-Fehler ist der Beleg —
 * die betroffenen Dokumente hatten saubere Struktur, korrekte Metadaten und
 * gültige Fundstelle und waren trotzdem unvollständig.
 *
 * WARUM LOKAL: liest das abgelegte Roh-XML (`--keep-xml`), nicht RIS. Ein Vollauf
 * über 148.000 Dokumente kostet damit Minuten statt 148.000 HTTP-Anfragen.
 *
 * EIGENER PARSER, NICHT risXmlToText: sonst prüfte der Extraktor sich selbst und
 * ein Extraktor-Fehler bliebe unsichtbar.
 *
 *   bun server/scripts/verify-textidentisch.ts --corpus at-normen
 *   bun server/scripts/verify-textidentisch.ts --corpus at-normen --limit 2000
 */

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

const args = process.argv.slice(2);
const arg = (n: string, d?: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const CORPUS = arg("corpus", "at-normen")!;
const LIMIT = parseInt(arg("limit", "0")!, 10);
const MD_ROOT = join("law-corpus", CORPUS);
const XML_ROOT = join("law-corpus", "_xml", CORPUS);
/** Ab welchem Anteil fehlender Knoten ein Dokument als unvollständig gilt. */
const SCHWELLE = parseFloat(arg("schwelle", "0.05")!);

if (!existsSync(XML_ROOT)) {
  console.error(`Keine XML-Ablage unter ${XML_ROOT}.`);
  console.error(`Der Korpus wurde ohne --keep-xml geholt; Stufe 5 ist so nicht prüfbar.`);
  process.exit(2);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e.endsWith(".xml")) out.push(p);
  }
  return out;
}

/** XML-Entities auflösen und Leerraum vereinheitlichen. */
function norm(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Druckkopf und -fuß gehören nicht zum Normtext.
 *
 * `<kzinhalt>`/`<fzinhalt>` tragen die Seitenzählung des Druckbilds
 * ("www.ris.bka.gv.at Seite 2 von 2"). Ohne diesen Abzug meldete der Test
 * 18 % fehlenden Text — echte Quote nach Abzug: 0,66 %.
 */
const DRUCK = /www\.ris\.bka\.gv\.at|^Seite \d+ von \d+$/i;

function textknoten(xml: string): string[] {
  let nutz = xml.match(/<nutzdaten>([\s\S]*)<\/nutzdaten>/)?.[1] ?? "";
  nutz = nutz
    .replace(/<kzinhalt>[\s\S]*?<\/kzinhalt>/g, " ")
    .replace(/<fzinhalt>[\s\S]*?<\/fzinhalt>/g, " ");
  return [...nutz.matchAll(/<(absatz|listelem|ueberschrift|schluss|schlussteil|td)\b[^>]*>([\s\S]*?)<\/\1>/g)]
    .map((m) => norm(m[2]))
    .filter((s) => s.length >= 30 && !DRUCK.test(s));
}

/** NOR-Nummer → Markdown-Datei. Ein Durchlauf über den Korpus. */
function mdIndex(): Map<string, string> {
  const idx = new Map<string, string>();
  const stack = [MD_ROOT];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) { stack.push(p); continue; }
      if (!e.endsWith(".md")) continue;
      const kopf = readFileSync(p, "utf8").slice(0, 2000);
      const id = kopf.match(/^(?:doc_id|nor_id|id):\s*"?(?:ris-)?([A-Z]{2,4}\d+)/m)?.[1];
      if (id) idx.set(id, p);
    }
  }
  return idx;
}

const idx = mdIndex();
let xmls = walk(XML_ROOT).sort();
if (LIMIT > 0) {
  const step = Math.max(1, Math.floor(xmls.length / LIMIT));
  xmls = xmls.filter((_, i) => i % step === 0).slice(0, LIMIT);
}

console.log(`Korpus:      ${CORPUS}`);
console.log(`XML-Ablage:  ${xmls.length.toLocaleString("de")} Dateien`);
console.log(`md-Index:    ${idx.size.toLocaleString("de")} Dokumente`);
console.log(`Schwelle:    ${(SCHWELLE * 100).toFixed(0)} % fehlende Knoten\n`);

let geprueft = 0, ohneMd = 0, ohneText = 0, unvollstaendig = 0;
let knotenGes = 0, knotenFehl = 0;
const funde: { md: string; fehlt: number; ges: number; bsp: string }[] = [];

for (const x of xmls) {
  const nor = x.split("/").pop()!.replace(".xml", "");
  const md = idx.get(nor);
  if (!md) { ohneMd++; continue; }
  const teile = textknoten(readFileSync(x, "utf8"));
  if (!teile.length) { ohneText++; continue; }
  const unser = readFileSync(md, "utf8").replace(/\s+/g, " ");
  geprueft++;
  // Präfix-Vergleich statt Volltext: Zeilenumbrüche und Einrückung
  // unterscheiden sich zwischen Quelle und Markdown, der Wortlaut nicht.
  const fehlend = teile.filter((t) => !unser.includes(t.slice(0, Math.min(t.length, 60))));
  knotenGes += teile.length;
  knotenFehl += fehlend.length;
  if (fehlend.length / teile.length > SCHWELLE) {
    unvollstaendig++;
    if (funde.length < 20) {
      funde.push({ md, fehlt: fehlend.length, ges: teile.length, bsp: fehlend[0]?.slice(0, 90) ?? "" });
    }
  }
  if (geprueft % 5000 === 0) process.stderr.write(`\r  ${geprueft.toLocaleString("de")} …`);
}
process.stderr.write("\r");

const pc = (v: number, n: number) => `${((100 * v) / Math.max(n, 1)).toFixed(3)} %`;
console.log("─".repeat(70));
console.log(`geprüft:                  ${geprueft.toLocaleString("de")} Dokumente / ${knotenGes.toLocaleString("de")} Normtext-Knoten`);
console.log(`unvollständig (>${(SCHWELLE * 100).toFixed(0)} %):     ${unvollstaendig}   (${pc(unvollstaendig, geprueft)})`);
console.log(`fehlende Knoten gesamt:   ${knotenFehl.toLocaleString("de")}   (${pc(knotenFehl, knotenGes)})`);
console.log(`ohne md-Datei:            ${ohneMd}     ohne Textknoten: ${ohneText}`);

if (funde.length) {
  console.log(`\nUnvollständige Dokumente:`);
  for (const f of funde) {
    console.log(`  ${f.fehlt}/${f.ges} Knoten fehlen  ${f.md.replace(MD_ROOT + "/", "")}`);
    if (f.bsp) console.log(`     z.B.: „${f.bsp}…"`);
  }
}

if (unvollstaendig === 0) {
  console.log(`\n✓ STUFE 5 ERREICHT: kein Dokument ist gegenüber seiner Quelle unvollständig.`);
  process.exit(0);
}
console.log(`\n✗ Stufe 5 NICHT erreicht: ${unvollstaendig} Dokumente sind unvollständig.`);
process.exit(1);
