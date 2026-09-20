import type { BrainEngine } from "../../core/engine.ts";
import { importFromContent } from "../../core/import-file.ts";
import {
  AT_LAW_SOURCES_STATUTES,
  LEGAL_SOURCE_BY_JURISDICTION,
} from "../../core/legal/jurisdiction.ts";
import { EVAL_TENANT, FIXTURE_PAGES } from "./fixtures.ts";

/** Sources an AT-matter request reads: the firm's own + AT statutes + EU. */
export const EVAL_READ_SOURCES = [
  EVAL_TENANT,
  ...AT_LAW_SOURCES_STATUTES,
  LEGAL_SOURCE_BY_JURISDICTION.eu,
];

/** Import the fixture corpus into production-shaped sources (keyword-searchable,
 *  no embeddings needed). */
export async function loadFixtureCorpus(engine: BrainEngine): Promise<void> {
  for (const src of new Set(FIXTURE_PAGES.map((p) => p.source))) {
    await engine.executeRaw(
      `INSERT INTO sources (id, name) VALUES ($1, $1) ON CONFLICT (id) DO NOTHING`,
      [src]
    );
  }
  for (const p of FIXTURE_PAGES) {
    const md = `---\ntitle: "${p.title.replace(/"/g, "'")}"\ntype: ${p.type}\n---\n\n${p.text}\n`;
    await importFromContent(engine, p.slug, md, { noEmbed: true, sourceId: p.source });
  }
}
