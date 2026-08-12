#!/usr/bin/env bun
/**
 * Siegel: fertige Quellen festschreiben und gegen stille Beschädigung schützen.
 *
 * WOZU: Eine Quelle, die alle Prüfungen bestanden hat, ist damit noch nicht
 * sicher — jeder spätere Lauf kann sie beschädigen, ohne dass es auffällt.
 * In dieser Sitzung ist genau das zweimal passiert: ein Vergleich zweier
 * verschieden sortierter Slug-Listen hat 7.729 gültige Seiten stillgelegt,
 * und ein Import mit zurückgesetztem Cursor hat 41.943 bereits korrekte
 * Dokumente überschrieben. Beides war umkehrbar, aber nur, weil es zufällig
 * rechtzeitig auffiel.
 *
 * Das Siegel hält je Dokument den `content_hash` fest. Danach ist jede
 * Abweichung eine Meldung, kein Zufallsfund:
 *
 *   fehlend    — war gesiegelt, ist nicht mehr aktiv        → Datenverlust
 *   verändert  — anderer content_hash als beim Siegeln      → stille Änderung
 *   neu        — nach dem Siegeln dazugekommen              → Zuwachs, erlaubt
 *
 * „neu" ist kein Fehler: der Bestand soll wachsen. „fehlend" und „verändert"
 * sind es, solange sie nicht ausdrücklich gewollt sind.
 *
 *   bun server/scripts/korpus-siegel.ts --siegeln law-at-normen
 *   bun server/scripts/korpus-siegel.ts --pruefen            # alle Siegel
 *   bun server/scripts/korpus-siegel.ts --pruefen law-at-normen
 */

import { $ } from "bun";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";

const args = process.argv.slice(2);
const arg = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const SIEGELN = arg("siegeln");
const PRUEFEN = args.includes("--pruefen");
const NUR = arg("pruefen");
const DIR = "law-corpus/_siegel";

if (!SIEGELN && !PRUEFEN) {
  console.error("--siegeln <quelle> oder --pruefen [quelle]");
  process.exit(2);
}

const url = (await $`grep -hoE 'postgres://[^"'"'"' ]+subsumio_law[^"'"'"' ]*' server/.env`.quiet())
  .stdout.toString().trim().split("\n")[0];

interface Siegel {
  quelle: string;
  gesiegelt_am: string;
  seiten: number;
  /** slug → content_hash */
  dokumente: Record<string, string>;
  /** Was zum Zeitpunkt des Siegelns nachgewiesen war. */
  nachweise: string[];
}

async function bestand(quelle: string): Promise<Record<string, string>> {
  // \x1f als Trenner: Slugs enthalten keine Steuerzeichen, Pipes wären
  // unsicher. Sortierung bewusst NICHT über SQL — der Vergleich läuft über
  // Mengen, nicht über sortierte Listen. Ein `comm` über zwei verschieden
  // sortierte Listen hat in dieser Sitzung 7.729 Seiten fälschlich als
  // verwaist gemeldet.
  const sql = `select slug || E'\\x1f' || coalesce(frontmatter->>'content_hash','')
               from pages where source_id = '${quelle}' and deleted_at is null`;
  const raw = (await $`psql ${url} -tAc ${sql}`.quiet()).stdout.toString();
  const out: Record<string, string> = {};
  for (const zeile of raw.split("\n")) {
    const i = zeile.indexOf("\x1f");
    if (i < 0) continue;
    out[zeile.slice(0, i).trim()] = zeile.slice(i + 1).trim();
  }
  return out;
}

if (SIEGELN) {
  if (!/^law-[a-z-]+$/.test(SIEGELN)) { console.error("Ungültige Quelle"); process.exit(2); }
  const dok = await bestand(SIEGELN);
  const n = Object.keys(dok).length;
  if (n === 0) { console.error(`Quelle ${SIEGELN} hat keine aktiven Seiten — nicht gesiegelt.`); process.exit(1); }
  const ohneHash = Object.values(dok).filter((h) => !h).length;
  if (ohneHash > 0) {
    console.error(`${ohneHash} von ${n} Seiten haben keinen content_hash — Siegel wäre wertlos.`);
    process.exit(1);
  }
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  const s: Siegel = {
    quelle: SIEGELN,
    gesiegelt_am: new Date().toISOString(),
    seiten: n,
    dokumente: dok,
    nachweise: args.slice(args.indexOf("--nachweis") + 1).filter((x) => !x.startsWith("--")),
  };
  writeFileSync(join(DIR, `${SIEGELN}.json`), JSON.stringify(s));
  console.log(`✓ ${SIEGELN} gesiegelt: ${n.toLocaleString("de")} Dokumente`);
  process.exit(0);
}

// ── Prüfen ────────────────────────────────────────────────────────────────
if (!existsSync(DIR)) { console.log("Keine Siegel vorhanden."); process.exit(0); }
const dateien = readdirSync(DIR).filter((f) => f.endsWith(".json"))
  .filter((f) => !NUR || f === `${NUR}.json`);
if (!dateien.length) { console.log("Kein passendes Siegel gefunden."); process.exit(0); }

let verletzt = 0;
console.log(`${"Quelle".padEnd(26)}${"gesiegelt".padStart(10)}${"aktiv".padStart(9)}${"fehlend".padStart(9)}${"verändert".padStart(11)}${"neu".padStart(8)}`);
console.log("─".repeat(73));

for (const f of dateien) {
  const s: Siegel = JSON.parse(readFileSync(join(DIR, f), "utf8"));
  const jetzt = await bestand(s.quelle);
  const fehlend: string[] = [];
  const veraendert: string[] = [];
  for (const [slug, hash] of Object.entries(s.dokumente)) {
    const h = jetzt[slug];
    if (h === undefined) fehlend.push(slug);
    else if (h !== hash) veraendert.push(slug);
  }
  const neu = Object.keys(jetzt).filter((k) => !(k in s.dokumente)).length;
  const schlecht = fehlend.length + veraendert.length;
  if (schlecht > 0) verletzt++;
  const mark = schlecht > 0 ? "✗" : "✓";
  console.log(
    `${mark} ${s.quelle.padEnd(24)}${String(s.seiten).padStart(10)}${String(Object.keys(jetzt).length).padStart(9)}` +
    `${String(fehlend.length).padStart(9)}${String(veraendert.length).padStart(11)}${String(neu).padStart(8)}`
  );
  for (const x of fehlend.slice(0, 5)) console.log(`      fehlt:     ${x}`);
  for (const x of veraendert.slice(0, 5)) console.log(`      verändert: ${x}`);
}

console.log("─".repeat(73));
if (verletzt === 0) {
  console.log(`Alle Siegel unversehrt. Zuwachs ist erlaubt und zählt nicht als Verletzung.`);
  process.exit(0);
}
console.log(`${verletzt} Siegel verletzt — gesiegelte Dokumente fehlen oder wurden verändert.`);
process.exit(1);
