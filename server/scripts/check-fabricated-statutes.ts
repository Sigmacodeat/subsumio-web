#!/usr/bin/env bun
/**
 * Sucht erfundene bzw. nicht-quellenbelegte Gesetzestexte in law-corpus/at/.
 *
 * Hintergrund: `brag.md` und `uwg.md` enthalten handgeschriebenen, zusammen-
 * gefassten "Gesetzestext", der nicht aus dem RIS stammt — brag.md beschreibt
 * ein Gesetz, das RIS gar nicht kennt (gemeint ist das EIRAG), uwg.md gibt das
 * UWG mit ~10 Absätzen wieder, während RIS 68 geltende Normen führt.
 *
 * In einem juristischen Produkt ist das der gefährlichste Defekt überhaupt:
 * der Text sieht aus wie Gesetz, ist aber keins. Solche Dateien dürfen NICHT
 * importiert werden.
 *
 * Erkennungsmerkmale (jedes für sich ein Verdacht, mehrere = Befund):
 *   - kein YAML-Frontmatter
 *   - source_url fehlt oder zeigt nicht auf ris.bka.gv.at
 *   - kein retrieved_at (RIS-Fetches setzen das immer)
 *   - Platzhalter im Text ("xxx/2025", "i.d.g.F." ohne Fundstelle)
 *
 *   bun run server/scripts/check-fabricated-statutes.ts
 */
import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = process.env.LAW_CORPUS_ROOT ?? join(import.meta.dir, "..", "..", "law-corpus");

/**
 * Je Verzeichnis die Hosts, die als amtliche Quelle gelten. Eine source_url,
 * die auf keinen davon zeigt, ist der belastbare Fabrikationsverdacht.
 */
const OFFICIAL_HOSTS: Record<string, RegExp> = {
  at: /ris\.bka\.gv\.at|data\.bka\.gv\.at/,
  "at-landesrecht": /ris\.bka\.gv\.at|data\.bka\.gv\.at/,
  "at-staatsvertraege": /ris\.bka\.gv\.at|data\.bka\.gv\.at/,
  de: /gesetze-im-internet\.de|rechtsinformationen\.bund\.de|bgbl\.de/,
  ch: /fedlex\.admin\.ch|admin\.ch|odat\.ch/,
  eu: /eur-lex\.europa\.eu|europa\.eu|publications\.europa\.eu/,
};

const dirArg = process.argv.indexOf("--dir");
const DIRS = dirArg > -1 ? [process.argv[dirArg + 1]] : Object.keys(OFFICIAL_HOSTS);

type Finding = { dir: string; file: string; bytes: number; reasons: string[] };

function fm(raw: string): Record<string, string> | null {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const out: Record<string, string> = {};
  for (const l of m[1].split("\n")) {
    const km = l.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (km) out[km[1]] = km[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

/** Rekursiv, weil law-corpus/eu/ seine 8.039 Dateien in Unterordnern hält. */
function walk(dir: string, base = ""): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(join(dir, e.name), rel));
    else if (e.name.endsWith(".md")) out.push(rel);
  }
  return out;
}

function main() {
  const findings: Finding[] = [];
  let checked = 0;

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Nicht quellenbelegte Gesetzestexte                          ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  for (const dir of DIRS) {
    const full = join(ROOT, dir);
    if (!existsSync(full)) continue;
    const official = OFFICIAL_HOSTS[dir];
    const files = walk(full);
    let hits = 0;

    for (const f of files) {
      const raw = readFileSync(join(full, f), "utf-8");
      const meta = fm(raw);
      const reasons: string[] = [];

      // Das einzig belastbare Merkmal: der Text ist nicht auf eine amtliche
      // Quelle zurückführbar. Alles andere produziert Fehlalarme —
      //   - "ausserkraft vor version_date" heißt nur "außer Kraft getretenes
      //     Gesetz, heute abgerufen" (1.336 Dateien allein in at/, normal),
      //   - "BGBl. I Nr. xx/2019" steht so im ECHTEN RIS-Text (RIS nutzt xx
      //     für noch nicht vergebene Nummern).
      if (!meta) {
        reasons.push("kein Frontmatter — nicht aus einer amtlichen Quelle erzeugt");
      } else {
        const url = meta.source_url ?? meta.source ?? "";
        if (!/^https?:\/\//.test(url)) reasons.push(`source_url ist keine URL (${url || "fehlt"})`);
        else if (official && !official.test(url)) reasons.push(`source_url zeigt nicht auf die amtliche Quelle (${url.slice(0, 60)})`);
      }

      if (reasons.length > 0) {
        if (/\bTODO\b|\blorem ipsum\b/i.test(raw)) reasons.push("zusätzlich: TODO/Platzhalter im Text");
        if (meta?.gesetzesnummer) reasons.push(`Gesetzesnummer laut Datei: ${meta.gesetzesnummer}`);
        findings.push({ dir, file: f, bytes: raw.length, reasons });
        hits++;
      }
      checked++;
    }

    console.log(`  ${dir.padEnd(22)} ${String(files.length).padStart(6)} Dateien · ${hits > 0 ? `${hits} AUFFÄLLIG` : "sauber"}`);
  }

  if (findings.length > 0) {
    console.log("\n  ── BEFUNDE ──\n");
    for (const f of findings.sort((a, b) => b.reasons.length - a.reasons.length)) {
      console.log(`  ${f.dir}/${f.file}  (${f.bytes} Bytes)`);
      for (const r of f.reasons) console.log(`      - ${r}`);
    }
    console.log("\n  Diese Dateien dürfen NICHT importiert werden, solange sie nicht");
    console.log("  gegen die amtliche Quelle belegt sind.");
  }

  console.log(`\n  ${checked} Dateien geprüft, ${findings.length} auffällig`);
  process.exit(findings.length > 0 ? 1 : 0);
}

main();
