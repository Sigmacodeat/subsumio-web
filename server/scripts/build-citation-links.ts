#!/usr/bin/env bun
/**
 * Decision → cited norm links, resolved from data instead of guessed paths.
 *
 * Every decision carries the norms it applies as RIS lists them
 * (cited_norms: "ABGB §1295 Abs1", "B-VG Art.133 Abs4"). Every federal norm
 * carries its abbreviation and paragraph (abbr, paragraph_ref). This script
 * joins the two in the database and writes one `judikatur-cites` link per
 * decision and cited provision, pointing at the version in force today
 * (or the most recent one if none is).
 *
 * The importer used to build the target slug from a fixed list of ~60
 * abbreviations and looked in the wrong source (law-at instead of
 * law-at-normen), so every existing link pointed at a deleted page.
 *
 *   bun scripts/build-citation-links.ts            # measure only
 *   bun scripts/build-citation-links.ts --apply    # write links
 *
 * Idempotent: an existing identical link is left alone (unique index).
 */

const APPLY = process.argv.includes("--apply");

/** "§ 1295" / "Art. 133" / "Anl. 2" → "P1295" / "A133" / "N2"; null if unparseable. */
export function provisionKey(ref: string | null | undefined): string | null {
  const m = (ref ?? "").match(/(§+|Art\.?|Artikel|Anl\.?|Anlage)\s*([0-9]+[a-zA-Z]?)/i);
  if (!m) return null;
  const kind = m[1].startsWith("§") ? "P" : /^art/i.test(m[1]) ? "A" : "N";
  return `${kind}${m[2].toLowerCase()}`;
}

/** Abbreviation as a join key: letters and digits only, upper case ("B-VG" → "BVG"). */
export function abbrKey(abbr: string | null | undefined): string | null {
  const k = (abbr ?? "").toUpperCase().replace(/[^A-Z0-9ÄÖÜ]/g, "");
  return k || null;
}

/** "ABGB §1295 Abs1" → { abbr: "ABGB", key: "P1295" }. */
export function parseCitedNorm(raw: string): { abbr: string; key: string } | null {
  const m = raw.match(/^(.+?)\s*(§+|Art\.?|Artikel|Anl\.?|Anlage)\s*([0-9]+[a-zA-Z]?)/i);
  if (!m) return null;
  const abbr = abbrKey(m[1]);
  const key = provisionKey(`${m[2]} ${m[3]}`);
  return abbr && key ? { abbr, key } : null;
}

// SQL mirrors of abbrKey / provisionKey, so the join runs inside Postgres.
const SQL_ABBR = (e: string) => `nullif(regexp_replace(upper(${e}), '[^A-Z0-9ÄÖÜ]', '', 'g'), '')`;
const SQL_KEY = (e: string) => `(
  SELECT CASE WHEN m[1] LIKE '§%' THEN 'P' WHEN m[1] ~* '^art' THEN 'A' ELSE 'N' END || lower(m[2])
  FROM (SELECT regexp_match(${e}, '(§+|Art\\.?|Artikel|Anl\\.?|Anlage)\\s*([0-9]+[a-zA-Z]?)', 'i') AS m) x
  WHERE m IS NOT NULL)`;

async function main() {
  const { loadConfig, toEngineConfig } = await import("../src/core/config.ts");
  const { createEngine } = await import("../src/core/engine-factory.ts");
  const cfg = loadConfig();
  if (!cfg) throw new Error("No engine configured.");
  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));
  const q = (sql: string, params?: unknown[]) => engine.executeRaw(sql, params) as Promise<any[]>;

  await q(`SET max_parallel_workers_per_gather = 8`);
  // Base key = abbreviation without a trailing year ("AVG1991" → "AVG"), so a
  // citation "AVG 1991 §66" finds the norm "AVG § 66" and "StVO §4" finds
  // "StVO 1960 § 4". A year on both sides must agree: "AsylG 1997" is a
  // different law from "AsylG 2005" and is never linked to it.
  const BASE = (e: string) => `regexp_replace(${e}, '(19|20)[0-9]{2}$', '')`;
  const YEAR = (e: string) => `(regexp_match(${e}, '((19|20)[0-9]{2})$'))[1]`;
  // Citation spellings RIS uses for laws we store under another abbreviation.
  const ALIAS = (e: string) =>
    `CASE ${e} WHEN 'MRK' THEN 'EMRK' WHEN 'BUNDESVERFASSUNGSGESETZ' THEN 'BVG' ELSE ${e} END`;

  await q(`DROP TABLE IF EXISTS _cl_norm_idx`);
  await q(`
    CREATE UNLOGGED TABLE _cl_norm_idx AS
    SELECT DISTINCT ON (akey, pkey) norm_id, akey, pkey, ${BASE("akey")} AS base, ${YEAR("akey")} AS nyear, statute_id
    FROM (
      SELECT id AS norm_id,
             ${SQL_ABBR("frontmatter->>'abbr'")} AS akey,
             ${SQL_KEY("frontmatter->>'paragraph_ref'")} AS pkey,
             frontmatter->>'statute_id' AS statute_id,
             (frontmatter->>'in_force_to' IS NULL OR (frontmatter->>'in_force_to')::date >= current_date) AS geltend,
             frontmatter->>'in_force_from' AS von
      FROM pages
      WHERE source_id IN ('law-at-normen', 'law-at-landesrecht') AND deleted_at IS NULL
    ) n
    WHERE akey IS NOT NULL AND pkey IS NOT NULL
    ORDER BY akey, pkey, geltend DESC, von DESC NULLS LAST, norm_id DESC`);
  await q(`CREATE INDEX ON _cl_norm_idx (akey, pkey)`);
  await q(`CREATE INDEX ON _cl_norm_idx (base, pkey)`);

  await q(`DROP TABLE IF EXISTS _cl_cites`);
  await q(`
    CREATE UNLOGGED TABLE _cl_cites AS
    SELECT from_id, raw, akey, pkey, ${BASE("akey")} AS base, ${YEAR("akey")} AS cyear FROM (
      SELECT p.id AS from_id, x.raw,
             ${ALIAS(SQL_ABBR("(regexp_match(x.raw, '^(.+?)\\s*(§+|Art\\.?|Artikel|Anl\\.?|Anlage)\\s*[0-9]', 'i'))[1]"))} AS akey,
             ${SQL_KEY("x.raw")} AS pkey
      FROM pages p, jsonb_array_elements_text(p.frontmatter->'cited_norms') AS x(raw)
      WHERE p.deleted_at IS NULL AND p.source_id LIKE 'law-at-judikatur%'
        AND jsonb_typeof(p.frontmatter->'cited_norms') = 'array'
    ) c`);

  // Resolution: exact abbreviation first; otherwise the base without year,
  // only when exactly one law qualifies and no conflicting year is involved.
  await q(`DROP TABLE IF EXISTS _cl_resolved`);
  await q(`
    CREATE UNLOGGED TABLE _cl_resolved AS
    SELECT c.from_id, c.raw, e.norm_id, 'exakt'::text AS how
    FROM _cl_cites c JOIN _cl_norm_idx e ON e.akey = c.akey AND e.pkey = c.pkey`);
  await q(`
    INSERT INTO _cl_resolved (from_id, raw, norm_id, how)
    WITH cand AS (
      SELECT c.from_id, c.raw, n.norm_id, coalesce(n.statute_id, n.akey) AS law, n.nyear, c.cyear
      FROM _cl_cites c JOIN _cl_norm_idx n ON n.base = c.base AND n.pkey = c.pkey
      WHERE NOT EXISTS (SELECT 1 FROM _cl_norm_idx e WHERE e.akey = c.akey AND e.pkey = c.pkey)
        AND (n.nyear IS NULL OR c.cyear IS NULL OR n.nyear = c.cyear)
    ),
    eindeutig AS (
      SELECT from_id, raw FROM cand GROUP BY from_id, raw HAVING count(DISTINCT law) = 1
    )
    SELECT DISTINCT ON (cand.from_id, cand.raw) cand.from_id, cand.raw, cand.norm_id, 'ohne Jahreszahl'
    FROM cand JOIN eindeutig USING (from_id, raw)
    ORDER BY cand.from_id, cand.raw, (cand.nyear = cand.cyear) DESC NULLS LAST, cand.nyear IS NULL DESC, cand.norm_id`);

  const [stats] = await q(`
    SELECT (SELECT count(*) FROM _cl_cites) AS refs,
           (SELECT count(*) FROM _cl_cites WHERE akey IS NOT NULL AND pkey IS NOT NULL) AS parsed,
           count(*) AS resolved,
           count(*) FILTER (WHERE how = 'exakt') AS exakt,
           count(*) FILTER (WHERE how = 'ohne Jahreszahl') AS ohne_jahreszahl,
           (SELECT count(DISTINCT from_id) FROM _cl_cites) AS decisions,
           count(DISTINCT from_id) AS decisions_linked
    FROM _cl_resolved`);
  console.log("Zitierte Normen in Urteilen:", stats);

  const unresolved = await q(`
    SELECT c.akey, count(*) AS n
    FROM _cl_cites c LEFT JOIN _cl_resolved r ON r.from_id = c.from_id AND r.raw = c.raw
    WHERE r.norm_id IS NULL AND c.akey IS NOT NULL
    GROUP BY 1 ORDER BY 2 DESC LIMIT 25`);
  console.log("Häufigste nicht auflösbare Kürzel:");
  for (const r of unresolved) console.log(`  ${String(r.n).padStart(8)}  ${r.akey}`);

  if (!APPLY) {
    console.log("\nNur gemessen. Mit --apply werden die Verknüpfungen geschrieben.");
  } else {
    const [w] = await q(`
      WITH ins AS (
        INSERT INTO links (from_page_id, to_page_id, link_type, context, link_source, resolution_type)
        SELECT DISTINCT ON (r.from_id, r.norm_id) r.from_id, r.norm_id, 'judikatur-cites', r.raw,
               'ris-cited-norms', 'qualified'
        FROM _cl_resolved r
        ORDER BY r.from_id, r.norm_id, r.raw
        ON CONFLICT DO NOTHING
        RETURNING 1)
      SELECT count(*) AS written FROM ins`);
    console.log("Geschriebene Verknüpfungen:", w);
  }
  // Working tables (not TEMP: a pooled connection may change between queries).
  await q(`DROP TABLE IF EXISTS _cl_norm_idx, _cl_cites, _cl_resolved`);
  await engine.disconnect();
}

if (import.meta.main) {
  main().catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
  });
}
