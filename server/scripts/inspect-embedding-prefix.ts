#!/usr/bin/env bun
/**
 * Shows what a chunk really looks like on its way to the embedding model.
 *
 * The contextual prefix decides whether a vector carries the document's
 * identity ("AT ABGB § 1295") or nothing to tell it apart ("AT § 1295"). It is
 * built from page metadata, so it can degrade silently when an import changes
 * field names. This prints the finished string for a sample per source, which
 * is the check to run before paying for a re-embedding run.
 *
 * Usage:
 *   bun run scripts/inspect-embedding-prefix.ts
 *   bun run scripts/inspect-embedding-prefix.ts --source law-at-normen --limit 5
 */

import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import {
  buildContextualPrefix,
  buildLegalContextualPrefix,
  isCourtDecisionPage,
  isLegalPage,
  sanitizeTitle,
  wrapChunkForEmbedding,
} from "../src/core/embedding-context.ts";

const args = Bun.argv.slice(2);
const argOf = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const LIMIT = Number(argOf("--limit") ?? "3");
const SOURCES = argOf("--source")
  ? [argOf("--source") as string]
  : [
      "law-at-normen",
      "law-at-landesrecht",
      "law-at-judikatur",
      "law-at-judikatur-vwgh",
      "law-at-gemeinden",
    ];

interface Row {
  slug: string;
  title: string | null;
  type: string | null;
  frontmatter: Record<string, unknown> | null;
  chunk_text: string;
  chunk_source: string | null;
}

async function main() {
  const cfg = toEngineConfig(loadConfig());
  const engine = await createEngine(cfg);
  await engine.connect(cfg);

  for (const source of SOURCES) {
    // A chunk that would actually be embedded: long enough, page alive.
    const rows = (await engine.executeRaw(
      `SELECT p.slug, p.title, p.type, p.frontmatter, c.chunk_text, c.chunk_source
         FROM content_chunks c
         JOIN pages p ON p.id = c.page_id
        WHERE p.deleted_at IS NULL
          AND p.source_id = $1
          AND length(btrim(c.chunk_text)) >= 80
        ORDER BY random()
        LIMIT $2`,
      [source, LIMIT]
    )) as Row[];

    console.log(`\n══ ${source} ${"═".repeat(Math.max(0, 60 - source.length))}`);
    for (const r of rows) {
      const fm = r.frontmatter ?? {};
      const title = sanitizeTitle(r.title ?? "");
      // Same test the embedder makes — anything else inspects a prefix that
      // never reaches the model.
      const legal =
        isLegalPage(fm) ||
        isCourtDecisionPage(fm) ||
        ["law", "statute", "court_decision", "judgement"].includes(r.type ?? "");
      const prefix = legal
        ? buildLegalContextualPrefix(title, fm, null)
        : buildContextualPrefix(title, null);
      const wrapped = wrapChunkForEmbedding(r.chunk_text, prefix, r.chunk_source ?? undefined);
      console.log(`\n  ${r.slug}`);
      console.log(`  Präfix: ${prefix ? prefix.replace(/\n/g, " ⏎ ") : "(keiner)"}`);
      console.log(`  Eingebettet: ${wrapped.slice(0, 220).replace(/\n/g, " ⏎ ")}…`);
    }
  }

  await engine.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
