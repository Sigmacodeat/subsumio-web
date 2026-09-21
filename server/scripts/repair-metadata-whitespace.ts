#!/usr/bin/env bun
/**
 * Replaces invisible whitespace in the metadata search and citation rely on.
 *
 * "VAG 2016" with a non-breaking space looks identical to "VAG 2016" with an
 * ordinary one, and is a different string. Keyword search does not find it,
 * a citation label carrying it does not match the label a user types, and the
 * embedding context gets a token the query never contains. The RIS index
 * writes U+00A0 into thousands of its titles; the normalizer's clean() removes
 * it on the import path, but a metadata backfill that bypassed clean() put
 * 1,474 of them into `short_title` on 2026-09-20.
 *
 * Touches only the named metadata fields, never the norm text. Pages get
 * `updated_at = now()`, because title and frontmatter feed the embedding
 * context — a vector made with the old string has to be made again.
 *
 * Usage:
 *   bun run scripts/repair-metadata-whitespace.ts            # nur zählen
 *   bun run scripts/repair-metadata-whitespace.ts --apply
 */

import { parseArgs } from "util";
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: { apply: { type: "boolean", default: false }, help: { type: "boolean", default: false } },
  allowPositionals: false,
});

if (values.help) {
  console.log("Usage: repair-metadata-whitespace.ts [--apply]");
  process.exit(0);
}

process.env.GBRAIN_STATEMENT_TIMEOUT = "20min";

interface Engine {
  executeRaw(sql: string, params?: unknown[]): Promise<unknown[]>;
  disconnect(): Promise<void>;
  connect(cfg: unknown): Promise<void>;
}

/** U+00A0 no-break, U+2007 figure, U+202F narrow no-break — all read as a space. */
const ODD = `[${String.fromCharCode(0xa0)}${String.fromCharCode(0x2007)}${String.fromCharCode(0x202f)}]`;
/** The same cleaning as SQL: odd space → space, runs collapsed, ends trimmed. */
const fix = (expr: string) => `btrim(regexp_replace(regexp_replace(${expr}, '${ODD}', ' ', 'g'), '\\s+', ' ', 'g'))`;

const FM_FIELDS = ["short_title", "abbr", "promulgation_organ", "paragraph_ref", "case_number", "court"];
const CHUNK_FIELDS = ["canonical_label", "statute_abbr", "paragraph_ref", "case_number", "court"];

const n = (v: unknown) => Number(v ?? 0).toLocaleString("de-AT");

async function main() {
  const fileCfg = loadConfig();
  if (!fileCfg) throw new Error("No engine configured. Set DATABASE_URL or ~/.gbrain/config.json.");
  const cfg = toEngineConfig(fileCfg);
  const engine = (await createEngine(cfg)) as unknown as Engine;
  await engine.connect(cfg);
  const count = async (sql: string) =>
    Number(((await engine.executeRaw(sql)) as Array<{ cnt: string }>)[0]?.cnt ?? 0);

  console.log("Unsichtbare Leerzeichen in Metadaten\n");

  let total = 0;
  const title = await count(
    `SELECT count(*)::text AS cnt FROM pages WHERE source_id LIKE 'law-%' AND title ~ '${ODD}'`
  );
  console.log(`  pages.title                      ${n(title)}`);
  total += title;
  for (const f of FM_FIELDS) {
    const c = await count(
      `SELECT count(*)::text AS cnt FROM pages WHERE source_id LIKE 'law-%' AND frontmatter->>'${f}' ~ '${ODD}'`
    );
    console.log(`  pages.frontmatter.${f.padEnd(20)} ${n(c)}`);
    total += c;
  }
  for (const f of CHUNK_FIELDS) {
    const c = await count(`SELECT count(*)::text AS cnt FROM content_chunks WHERE "${f}" ~ '${ODD}'`);
    console.log(`  content_chunks.${f.padEnd(23)} ${n(c)}`);
    total += c;
  }
  console.log(`\n  Summe: ${n(total)}`);

  if (!values.apply) {
    console.log("\nNichts geändert. Zum Beheben --apply angeben.");
    await engine.disconnect();
    return;
  }

  await engine.executeRaw(
    `UPDATE pages SET title = ${fix("title")}, updated_at = now()
      WHERE source_id LIKE 'law-%' AND title ~ '${ODD}'`
  );
  for (const f of FM_FIELDS) {
    // jsonb_set with to_jsonb(text): a JSON string value, never a stringified blob.
    await engine.executeRaw(
      `UPDATE pages
          SET frontmatter = jsonb_set(frontmatter, '{${f}}', to_jsonb(${fix(`frontmatter->>'${f}'`)})),
              updated_at = now()
        WHERE source_id LIKE 'law-%' AND frontmatter->>'${f}' ~ '${ODD}'`
    );
  }
  for (const f of CHUNK_FIELDS) {
    await engine.executeRaw(`UPDATE content_chunks SET "${f}" = ${fix(`"${f}"`)} WHERE "${f}" ~ '${ODD}'`);
  }

  console.log(`\n✓ ${n(total)} Felder bereinigt.`);
  await engine.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
