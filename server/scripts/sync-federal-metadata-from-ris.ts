#!/usr/bin/env bun
/**
 * Brings every federal norm's metadata level with the RIS index, document by
 * document.
 *
 * The RIS in-force index (_state/ris-inforce.jsonl, written by
 * ris-inforce-crawl) is RIS's own statement about each document: short title,
 * abbreviation, section, entry into force, promulgation organ. A field-by-field
 * comparison of all 148,056 shared documents on 2026-09-21 found the database
 * agreeing wherever it had a value — statute number and section 148,055 of
 * 148,056 — but leaving gaps: 64,045 norms without the law's short title, 118
 * without an entry-into-force date, 113 without the abbreviation RIS has, and
 * promulgation organs missing.
 *
 * A search that cites "§ 12" without being able to say of which law is of no
 * use to a lawyer, so the gaps get filled — from the index, keyed on the
 * document number, which is exact. Only EMPTY fields are written. A value the
 * database already holds came from the document itself and stays.
 *
 * Every value passes the normalizer's clean(): the index carries non-breaking
 * spaces in 9,284 lines.
 *
 * Usage:
 *   bun run scripts/sync-federal-metadata-from-ris.ts             # nur zählen
 *   bun run scripts/sync-federal-metadata-from-ris.ts --apply
 */

import { parseArgs } from "util";
import { existsSync, readFileSync } from "node:fs";
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import { clean } from "./normalize/normalize-corpus.ts";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    apply: { type: "boolean", default: false },
    index: { type: "string", default: "/law-corpus/_state/ris-inforce.jsonl" },
    source: { type: "string", default: "law-at-normen" },
    batch: { type: "string", default: "2000" },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (values.help) {
  console.log("Usage: sync-federal-metadata-from-ris.ts [--apply] [--index <jsonl>] [--source law-at-normen]");
  process.exit(0);
}

process.env.GBRAIN_STATEMENT_TIMEOUT = "20min";
const BATCH = Number(values.batch);

interface IndexRow {
  nor?: string;
  kurztitel?: string | null;
  abk?: string | null;
  apa?: string | null;
  inkraft?: string | null;
  kundmachungsorgan?: string | null;
}

interface Engine {
  executeRaw(sql: string, params?: unknown[]): Promise<unknown[]>;
  disconnect(): Promise<void>;
  connect(cfg: unknown): Promise<void>;
}

interface PageRow {
  id: number;
  nor: string;
  short_title: string | null;
  abbr: string | null;
  paragraph_ref: string | null;
  in_force_from: string | null;
  promulgation_organ: string | null;
}

const FIELDS = ["short_title", "abbr", "paragraph_ref", "in_force_from", "promulgation_organ"] as const;
type Field = (typeof FIELDS)[number];

const n = (v: number) => v.toLocaleString("de-AT");

async function main() {
  const indexPath = values.index as string;
  if (!existsSync(indexPath)) {
    console.error(`Index fehlt: ${indexPath} — erst ris-inforce-crawl laufen lassen.`);
    process.exit(1);
  }
  const ris = new Map<string, Record<Field, string | null>>();
  for (const line of readFileSync(indexPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let d: IndexRow;
    try {
      d = JSON.parse(line) as IndexRow;
    } catch {
      continue;
    }
    if (!d.nor) continue;
    ris.set(d.nor, {
      short_title: clean(d.kurztitel),
      abbr: clean(d.abk),
      paragraph_ref: clean(d.apa),
      in_force_from: clean(d.inkraft),
      promulgation_organ: clean(d.kundmachungsorgan),
    });
  }
  console.log(`RIS-Index: ${n(ris.size)} Dokumente`);

  const fileCfg = loadConfig();
  if (!fileCfg) throw new Error("No engine configured. Set DATABASE_URL or ~/.gbrain/config.json.");
  const cfg = toEngineConfig(fileCfg);
  const engine = (await createEngine(cfg)) as unknown as Engine;
  await engine.connect(cfg);

  const pages = (await engine.executeRaw(
    `SELECT id, frontmatter->>'doc_id' AS nor,
            frontmatter->>'short_title' AS short_title, frontmatter->>'abbr' AS abbr,
            frontmatter->>'paragraph_ref' AS paragraph_ref,
            frontmatter->>'in_force_from' AS in_force_from,
            frontmatter->>'promulgation_organ' AS promulgation_organ
       FROM pages
      WHERE deleted_at IS NULL AND source_id = $1 AND frontmatter->>'doc_id' IS NOT NULL
        AND (frontmatter->>'short_title' IS NULL OR frontmatter->>'abbr' IS NULL
             OR frontmatter->>'paragraph_ref' IS NULL OR frontmatter->>'in_force_from' IS NULL
             OR frontmatter->>'promulgation_organ' IS NULL)`,
    [values.source]
  )) as PageRow[];
  console.log(`Seiten mit mindestens einem leeren Feld: ${n(pages.length)}`);

  const filled: Record<Field, number> = {
    short_title: 0,
    abbr: 0,
    paragraph_ref: 0,
    in_force_from: 0,
    promulgation_organ: 0,
  };
  const patches: Array<{ id: number } & Record<Field, string | null>> = [];
  for (const p of pages) {
    const r = ris.get(p.nor);
    if (!r) continue;
    const patch = { id: p.id } as { id: number } & Record<Field, string | null>;
    let any = false;
    for (const f of FIELDS) {
      // Only an empty field is written; RIS has no value for many (not every
      // law has an abbreviation), and then it stays empty.
      if (p[f] == null && r[f] != null) {
        patch[f] = r[f];
        filled[f]++;
        any = true;
      } else {
        patch[f] = null;
      }
    }
    if (any) patches.push(patch);
  }

  for (const f of FIELDS) console.log(`  ${f.padEnd(20)} ${n(filled[f])} zu füllen`);
  console.log(`  Seiten betroffen:    ${n(patches.length)}`);

  if (!values.apply) {
    console.log("\nNichts geändert. Zum Schreiben --apply angeben.");
    await engine.disconnect();
    return;
  }

  let done = 0;
  for (let i = 0; i < patches.length; i += BATCH) {
    const slice = patches.slice(i, i + BATCH);
    // Plain text arrays, assembled into jsonb by the database — no stringified
    // JSON goes through a ::jsonb cast. jsonb_strip_nulls drops the fields
    // this page does not need, so existing values are never touched.
    await engine.executeRaw(
      `UPDATE pages p
          SET frontmatter = p.frontmatter || jsonb_strip_nulls(jsonb_build_object(
                'short_title', v.st, 'abbr', v.ab, 'paragraph_ref', v.par,
                'in_force_from', v.inf, 'promulgation_organ', v.org)),
              updated_at = now()
         FROM unnest($1::int[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[])
              AS v(id, st, ab, par, inf, org)
        WHERE p.id = v.id`,
      [
        slice.map((s) => s.id),
        slice.map((s) => s.short_title),
        slice.map((s) => s.abbr),
        slice.map((s) => s.paragraph_ref),
        slice.map((s) => s.in_force_from),
        slice.map((s) => s.promulgation_organ),
      ]
    );
    done += slice.length;
    console.log(`  ${n(done)} / ${n(patches.length)}`);
  }
  console.log(`✓ ${n(done)} Seiten ergänzt.`);
  await engine.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
