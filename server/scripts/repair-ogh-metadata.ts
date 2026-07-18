#!/usr/bin/env bun
/**
 * repair-ogh-metadata — fix the 30k OGH pages imported with placeholder slugs.
 *
 * A slug-generation bug stamped ~30,385 law-at-judikatur pages as
 * `legal/judikatur/at/2000-01-01-unknown-<n>` with title "— Entscheidung",
 * although the page body carries the real metadata:
 *
 *   ## Entscheidungsdatum \n\n DD.MM.YYYY
 *   ## Geschäftszahl      \n\n 1Ob52/00d[; 2Ob...]
 *
 * This script re-parses both fields from `compiled_truth` and rewrites
 * slug/title/effective_date to the canonical convention used by the healthy
 * pages (e.g. `legal/judikatur/at/2024-11-19-8ob560-76`, "OGH — 8Ob560/76").
 * If the canonical slug already exists (decision was later imported
 * correctly), the unknown page is a duplicate and gets soft-deleted.
 *
 * Usage:
 *   bun scripts/repair-ogh-metadata.ts             # dry-run (default)
 *   bun scripts/repair-ogh-metadata.ts --apply     # write changes
 *   bun scripts/repair-ogh-metadata.ts --apply --limit 1000
 */

import postgres from "postgres";

const args = Bun.argv.slice(2);
const APPLY = args.includes("--apply");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;
const BATCH = 500;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
const sql = postgres(DATABASE_URL, { max: 2, prepare: false });

function parseMeta(body: string): { date: string; gzs: string[] } | null {
  const dateMatch = /##\s*Entscheidungsdatum\s*\n+\s*(\d{2})\.(\d{2})\.(\d{4})/.exec(body);
  const gzMatch = /##\s*Geschäftszahl\s*\n+\s*([^\n]+)/.exec(body);
  if (!dateMatch || !gzMatch) return null;
  const [, dd, mm, yyyy] = dateMatch;
  const year = parseInt(yyyy, 10);
  if (year < 1850 || year > 2100) return null;
  const gzs = gzMatch[1]
    .split(";")
    .map((s) => s.trim().replace(/[.,]$/, ""))
    .filter((s) => s.length > 0)
    .slice(0, 2);
  if (gzs.length === 0) return null;
  return { date: `${yyyy}-${mm}-${dd}`, gzs };
}

function gzToSlug(gz: string): string {
  return gz
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  console.log(`repair-ogh-metadata — mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  let repaired = 0;
  let dupes = 0;
  let unparseable = 0;
  let scanned = 0;
  const seenTargets = new Set<string>();

  for (;;) {
    if (scanned >= LIMIT) break;
    const rows = await sql<
      { id: string; slug: string; compiled_truth: string | null }[]
    >`SELECT id, slug, compiled_truth FROM pages
      WHERE source_id = 'law-at-judikatur'
        AND deleted_at IS NULL
        AND slug LIKE 'legal/judikatur/at/2000-01-01-unknown-%'
      ORDER BY slug
      LIMIT ${Math.min(BATCH, LIMIT - scanned)} OFFSET ${APPLY ? 0 : scanned}`;
    if (rows.length === 0) break;
    scanned += rows.length;

    for (const row of rows) {
      const meta = row.compiled_truth ? parseMeta(row.compiled_truth) : null;
      if (!meta) {
        unparseable++;
        continue;
      }
      const gzSlugs = meta.gzs.map(gzToSlug).filter((s) => s.length > 0);
      if (gzSlugs.length === 0) {
        unparseable++;
        continue;
      }
      const newSlug = `legal/judikatur/at/${meta.date}-${gzSlugs.join("-")}`;
      const title =
        meta.gzs.length > 1 ? `OGH — ${meta.gzs[0]} (${meta.gzs[1]})` : `OGH — ${meta.gzs[0]}`;

      if (APPLY) {
        // Collision policy: same slug + same content_hash = true duplicate →
        // soft-delete. Same GZ but different content (e.g. Rechtssatz vs
        // Entscheidungstext) → keep with a stable numeric suffix, no data loss.
        let finalSlug = newSlug;
        const existing = await sql<{ id: string; content_hash: string | null }[]>`
          SELECT p.id, p.content_hash FROM pages p
          WHERE p.source_id = 'law-at-judikatur' AND p.slug = ${newSlug} AND p.id <> ${row.id} LIMIT 1`;
        if (existing.length > 0 || seenTargets.has(newSlug)) {
          const own = await sql<{ content_hash: string | null }[]>`
            SELECT content_hash FROM pages WHERE id = ${row.id}`;
          const sameContent =
            existing.length > 0 &&
            existing[0].content_hash !== null &&
            existing[0].content_hash === own[0]?.content_hash;
          if (sameContent) {
            await sql`UPDATE pages SET deleted_at = now() WHERE id = ${row.id}`;
            dupes++;
            continue;
          }
          let n = 2;
          for (;;) {
            const candidate = `${newSlug}-r${n}`;
            const clash = await sql`
              SELECT 1 FROM pages WHERE source_id = 'law-at-judikatur' AND slug = ${candidate} LIMIT 1`;
            if (clash.length === 0 && !seenTargets.has(candidate)) {
              finalSlug = candidate;
              break;
            }
            n++;
          }
        }
        seenTargets.add(finalSlug);
        await sql`
          UPDATE pages
          SET slug = ${finalSlug},
              title = ${title},
              effective_date = ${meta.date}::timestamptz,
              effective_date_source = 'date'
          WHERE id = ${row.id}`;
        repaired++;
      } else {
        if (seenTargets.has(newSlug)) {
          dupes++;
        } else {
          seenTargets.add(newSlug);
          repaired++;
        }
      }
    }
    process.stderr.write(
      `  scanned=${scanned} repaired=${repaired} dupes=${dupes} unparseable=${unparseable}\n`
    );
    if (!APPLY && rows.length < BATCH) break;
  }

  console.log(
    `${APPLY ? "" : "[dry-run] "}repaired=${repaired} duplicates-soft-deleted=${dupes} unparseable=${unparseable}`
  );
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
