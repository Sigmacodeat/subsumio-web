#!/usr/bin/env bun
/**
 * Judikatur-Frontmatter: Alt-Format auf Neu-Format normalisieren.
 *
 * WARUM: `isCourtDecisionPage()` (src/core/embedding-context.ts) erkennt nur
 * `type: "court_decision"` und `"judgement"`. Dateien mit `type: "judikatur"`
 * fallen durch — auch durch `isLegalPage()` — und bekommen dadurch:
 *   - den generischen Recursive-Chunker statt chunkLegalDecision()
 *   - LEERE Chunk-Metadaten (court, case_number, decision_date, ecli, chunk_role)
 *   - generischen statt juristischem Embedding-Kontext
 *
 * Belegt an law-at-judikatur-umse: 4.769 court_decision-Chunks haben alle
 * Metadaten, 5.568 judikatur-Chunks haben NULL in jedem Feld.
 *
 * Die Umschreibung ist ADDITIV: bestehende Felder bleiben unangetastet, es
 * kommen nur die englischen Pendants dazu. `type_original` merkt sich den
 * Ausgangswert, damit der Schritt nachvollziehbar und umkehrbar ist.
 *
 *   bun run server/scripts/judikatur-normalize-frontmatter.ts              # Probelauf
 *   bun run server/scripts/judikatur-normalize-frontmatter.ts --apply
 *   bun run server/scripts/judikatur-normalize-frontmatter.ts --apply --court pvak
 *   bun run server/scripts/judikatur-normalize-frontmatter.ts --undo
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

function arg(name: string, fb?: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fb;
}
const APPLY = process.argv.includes("--apply");
const UNDO = process.argv.includes("--undo");
const COURT = arg("court");
const CORPUS_ROOT = process.env.LAW_CORPUS_ROOT ?? join(import.meta.dir, "..", "..", "law-corpus");

/** Gerichtsbezeichnung je Verzeichnis, abgeglichen mit den Neu-Format-Dateien. */
const COURTS: Record<string, { court: string; courtType: string }> = {
  "at-judikatur": { court: "OGH", courtType: "ogh" },
  "at-judikatur-vfgh": { court: "Verfassungsgerichtshof (VfGH)", courtType: "vfgh" },
  "at-judikatur-vwgh": { court: "Verwaltungsgerichtshof (VwGH)", courtType: "vwgh" },
  "at-judikatur-bvwg": { court: "Bundesverwaltungsgericht", courtType: "bvwg" },
  "at-judikatur-lvwg": { court: "Landesverwaltungsgericht", courtType: "lvwg" },
  "at-judikatur-asylgh": { court: "Asylgerichtshof", courtType: "asylgh" },
  "at-judikatur-uvs": { court: "Unabhängiger Verwaltungssenat", courtType: "uvs" },
  "at-judikatur-dsk": { court: "Datenschutzbehörde", courtType: "dsk" },
  "at-judikatur-gbk": { court: "Bundes-Gleichbehandlungskommission", courtType: "gbk" },
  "at-judikatur-pvak": { court: "Personalvertretungsaufsichtsbehörde", courtType: "pvak" },
  "at-judikatur-dok": { court: "Berufungskommission", courtType: "dok" },
  "at-judikatur-ubas": { court: "Unabhängiger Bundesasylsenat", courtType: "ubas" },
  "at-judikatur-umse": { court: "Umweltsenat", courtType: "umse" },
};

/**
 * UVS-Entscheidungen tragen das Bundesland im document_id (JUR_<BL>_…).
 * Die Neu-Format-Dateien benennen sie als "UVS <Bundesland>" — hier gleich
 * abgeleitet, damit die Gerichts-Facette nicht zerfällt.
 */
const UVS_LAND: Record<string, string> = {
  BU: "Burgenland", KA: "Kärnten", NI: "Niederösterreich", OB: "Oberösterreich",
  SA: "Salzburg", ST: "Steiermark", TI: "Tirol", VO: "Vorarlberg", WI: "Wien",
};

type FM = { keys: string[]; get: (k: string) => string | undefined; raw: string };

function parseFm(raw: string): { fm: FM; body: string } | null {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return null;
  const lines = m[1].split("\n");
  const map = new Map<string, string>();
  const keys: string[] = [];
  for (const l of lines) {
    const km = l.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (km) {
      keys.push(km[1]);
      map.set(km[1], km[2].trim().replace(/^["']|["']$/g, ""));
    }
  }
  return { fm: { keys, get: (k) => map.get(k), raw: m[1] }, body: m[2] };
}

function q(v: string): string {
  return `"${v.replace(/"/g, "'")}"`;
}

function normalizeOne(dir: string, raw: string): string | null {
  const parsed = parseFm(raw);
  if (!parsed) return null;
  const { fm, body } = parsed;
  if (fm.get("type") !== "judikatur") return null; // nur Alt-Format

  const cfg = COURTS[dir];
  if (!cfg) return null;

  // court: bevorzugt das vorhandene deutsche Feld, sonst aus dem Verzeichnis.
  let court = fm.get("gericht") || cfg.court;
  if (cfg.courtType === "uvs") {
    const did = fm.get("document_id") ?? "";
    // JUR_ = Rechtssatz, JUT_ = Entscheidungstext — beide tragen das Bundesland.
    const bl = did.match(/^JU[RT]_([A-Z]{2})_/)?.[1];
    if (bl && UVS_LAND[bl]) court = `UVS ${UVS_LAND[bl]}`;
  }

  const caseNumber = fm.get("geschaeftszahl") ?? "";
  const decisionDate = fm.get("entscheidungsdatum") ?? "";

  const add: string[] = [];
  const has = (k: string) => fm.keys.includes(k);

  if (!has("court")) add.push(`court: ${q(court)}`);
  if (!has("court_type")) add.push(`court_type: ${cfg.courtType}`);
  if (!has("case_number") && caseNumber) add.push(`case_number: ${q(caseNumber)}`);
  if (!has("decision_date") && /^\d{4}-\d{2}-\d{2}$/.test(decisionDate)) {
    add.push(`decision_date: ${q(decisionDate)}`);
    if (!has("date")) add.push(`date: ${q(decisionDate)}`);
  }
  if (!has("legal_area")) add.push(`legal_area: ${q("Allgemein")}`);
  add.push(`type_original: ${q("judikatur")}`);

  // type umschreiben — der einzige destruktive Teil, deshalb per Zeilenersatz
  // statt Neuaufbau, damit alles andere bitgenau erhalten bleibt.
  const newFm = fm.raw.replace(/^type:\s*.*$/m, `type: "court_decision"`);
  return `---\n${newFm}\n${add.join("\n")}\n---\n${body}`;
}

function undoOne(raw: string): string | null {
  const parsed = parseFm(raw);
  if (!parsed) return null;
  const { fm, body } = parsed;
  if (fm.get("type_original") !== "judikatur") return null;
  const kept = fm.raw
    .split("\n")
    .filter((l) => !/^(court|court_type|case_number|decision_date|date|legal_area|type_original):/.test(l))
    .join("\n")
    .replace(/^type:\s*.*$/m, `type: "judikatur"`);
  return `---\n${kept}\n---\n${body}`;
}

function main() {
  const dirs = readdirSync(CORPUS_ROOT)
    .filter((d) => d.startsWith("at-judikatur"))
    .filter((d) => (COURT ? d === `at-judikatur-${COURT}` || (COURT === "ogh" && d === "at-judikatur") : true))
    .filter((d) => COURTS[d]);

  console.log(
    UNDO
      ? "RÜCKNAHME" + (APPLY ? " (--apply)" : " — Probelauf")
      : APPLY
        ? "NORMALISIERUNG (--apply)\n"
        : "PROBELAUF — es wird nichts geschrieben. Mit --apply ausführen.\n"
  );
  console.log(`  ${"Gericht".padEnd(10)}${"Dateien".padStart(9)}${"Alt-Format".padStart(12)}${"geändert".padStart(10)}`);
  console.log(`  ${"-".repeat(10)}${"-".repeat(9)}${"-".repeat(12)}${"-".repeat(10)}`);

  let totOld = 0;
  let totChanged = 0;

  for (const dir of dirs) {
    const full = join(CORPUS_ROOT, dir);
    if (!existsSync(full)) continue;
    const files = readdirSync(full).filter((f) => f.endsWith(".md"));
    let old = 0;
    let changed = 0;

    for (const f of files) {
      const p = join(full, f);
      let raw: string;
      try {
        raw = readFileSync(p, "utf-8");
      } catch {
        continue;
      }
      const out = UNDO ? undoOne(raw) : normalizeOne(dir, raw);
      if (out === null) continue;
      old++;
      if (APPLY) writeFileSync(p, out);
      changed++;
    }

    totOld += old;
    totChanged += changed;
    if (old > 0) {
      console.log(
        `  ${dir.replace("at-judikatur-", "").replace("at-judikatur", "ogh").padEnd(10)}${String(files.length).padStart(9)}${String(old).padStart(12)}${String(changed).padStart(10)}`
      );
    }
  }

  console.log(`  ${"-".repeat(10)}${"-".repeat(9)}${"-".repeat(12)}${"-".repeat(10)}`);
  console.log(`  ${"SUMME".padEnd(10)}${"".padStart(9)}${String(totOld).padStart(12)}${String(totChanged).padStart(10)}`);

  if (!APPLY) {
    console.log("\n  Nichts geschrieben. Mit --apply ausführen.");
  } else if (!UNDO) {
    console.log("\n  Danach neu importieren, damit der Structure-aware-Chunker greift:");
    console.log("    bun run server/scripts/import-judikatur.ts --source <gericht> --force-rechunk --no-embed");
    console.log("  Rücknahme: bun run server/scripts/judikatur-normalize-frontmatter.ts --undo --apply");
  }
}

main();
