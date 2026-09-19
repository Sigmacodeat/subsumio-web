#!/usr/bin/env bun
/**
 * RIS ↔ database reconciliation. Writes one corpus_reconciliation row per
 * source (migration 142), so completeness is a dated measurement.
 *
 * - Federal norms: document-level. The inventory of every norm in force
 *   (ris-inforce-crawl.ts → _state/ris-inforce.jsonl) is compared with the
 *   active law-at-normen pages by NOR number: missing = in force at RIS but
 *   not in the database; extra = active in the database but not in force
 *   at RIS (repealed or superseded — still searchable, ranked down).
 * - Courts and state law: count-level against RIS hit totals, one request
 *   per application. For OGH/VwGH/VfGH RIS counts Rechtssätze, so the
 *   database side counts Rechtssätze too (decision texts are reported in the
 *   note).
 *
 *   bun scripts/reconcile-ris.ts            # measure and record
 *   bun scripts/reconcile-ris.ts --dry-run  # measure, print only
 *
 * RIS OGD rules: one connection, pause between requests, shared ris-lock.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { acquireRisLock, releaseRisLock } from "./ris-lock";
import { getUserAgent, proxyFetchOptions } from "./ris-proxy";

const DRY = process.argv.includes("--dry-run");
const ROOT = process.env.LAW_CORPUS_ROOT ?? join(import.meta.dir, "..", "..", "law-corpus");
const INVENTORY = join(ROOT, "_state", "ris-inforce.jsonl");
const API = "https://data.bka.gv.at/ris/api/v2.6";

/** source_id → RIS application; `rs` = RIS counts Rechtssätze for this court. */
export const COURT_SOURCES: Array<{ source: string; applikation: string; rs: boolean }> = [
  { source: "law-at-judikatur", applikation: "Justiz", rs: true },
  { source: "law-at-judikatur-vwgh", applikation: "Vwgh", rs: true },
  { source: "law-at-judikatur-vfgh", applikation: "Vfgh", rs: true },
  { source: "law-at-judikatur-bvwg", applikation: "Bvwg", rs: false },
  { source: "law-at-judikatur-lvwg", applikation: "Lvwg", rs: false },
  { source: "law-at-judikatur-asylgh", applikation: "AsylGH", rs: false },
  { source: "law-at-judikatur-uvs", applikation: "Uvs", rs: false },
  { source: "law-at-judikatur-dsk", applikation: "Dsk", rs: false },
  { source: "law-at-judikatur-gbk", applikation: "Gbk", rs: false },
  { source: "law-at-judikatur-pvak", applikation: "Pvak", rs: false },
  { source: "law-at-judikatur-dok", applikation: "Dok", rs: false },
  { source: "law-at-judikatur-ubas", applikation: "Ubas", rs: false },
  { source: "law-at-judikatur-umse", applikation: "Umse", rs: false },
];

/** Norms RIS lists without text ("§ 0" = the law's metadata record). */
export function isMetadataOnlyNorm(apa: string | null | undefined): boolean {
  return !apa || /^§+\s*0\s*$/.test(apa.trim());
}

/** NOR numbers in force per the inventory file, excluding metadata-only records. */
export function inventoryNorIds(jsonl: string): Set<string> {
  const out = new Set<string>();
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    const n = JSON.parse(line) as { nor?: string; apa?: string | null };
    if (n.nor && !isMetadataOnlyNorm(n.apa)) out.add(n.nor);
  }
  return out;
}

export function diff(ris: Set<string>, db: Set<string>): { missing: string[]; extra: string[] } {
  return {
    missing: [...ris].filter((id) => !db.has(id)),
    extra: [...db].filter((id) => !ris.has(id)),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function hits(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": getUserAgent() },
      signal: AbortSignal.timeout(30_000),
      ...proxyFetchOptions(),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const t = data?.OgdSearchResult?.OgdDocumentResults?.Hits?.["#text"];
    return t ? parseInt(String(t), 10) : null;
  } catch {
    return null;
  }
}

interface Row {
  source_id: string;
  method: "doc-ids" | "counts";
  ris_total: number | null;
  db_total: number;
  missing: number | null;
  extra: number | null;
  sample_missing: string[];
  sample_extra: string[];
  note: string | null;
}

async function main() {
  const { loadConfig, toEngineConfig } = await import("../src/core/config.ts");
  const { createEngine } = await import("../src/core/engine-factory.ts");
  const cfg = loadConfig();
  if (!cfg) throw new Error("No engine configured.");
  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));
  const q = (sql: string, params?: unknown[]) => engine.executeRaw(sql, params) as Promise<any[]>;
  const rows: Row[] = [];

  // Federal norms — document level.
  const dbNor = new Set<string>(
    (await q(
      `SELECT frontmatter->>'doc_id' AS id FROM pages
       WHERE source_id = 'law-at-normen' AND deleted_at IS NULL AND frontmatter->>'doc_id' LIKE 'NOR%'`
    )).map((r) => r.id)
  );
  if (existsSync(INVENTORY)) {
    const ris = inventoryNorIds(readFileSync(INVENTORY, "utf8"));
    const { missing, extra } = diff(ris, dbNor);
    rows.push({
      source_id: "law-at-normen",
      method: "doc-ids",
      ris_total: ris.size,
      db_total: dbNor.size,
      missing: missing.length,
      extra: extra.length,
      sample_missing: missing.slice(0, 50),
      sample_extra: extra.slice(0, 50),
      note: "extra = in der DB aktiv, im RIS nicht (mehr) in Kraft",
    });
  } else {
    console.error(`Inventar fehlt: ${INVENTORY} (ris-inforce-crawl.ts zuerst)`);
  }

  await acquireRisLock();
  try {
    // Courts — count level.
    for (const c of COURT_SOURCES) {
      const ris = await hits(`${API}/Judikatur?Applikation=${c.applikation}&DokumenteProSeite=Ten`);
      await sleep(1500);
      const [counts] = await q(
        `SELECT count(*)::int AS alle,
                count(*) FILTER (WHERE frontmatter->>'doc_id' ~ '^J[A-Z]R_')::int AS rs,
                count(*) FILTER (WHERE frontmatter->>'doc_id' ~ '^J[A-Z]T_')::int AS texte
         FROM pages WHERE source_id = $1 AND deleted_at IS NULL`,
        [c.source]
      );
      const db = c.rs ? counts.rs : counts.alle;
      rows.push({
        source_id: c.source,
        method: "counts",
        ris_total: ris,
        db_total: db,
        missing: ris === null ? null : Math.max(0, ris - db),
        extra: ris === null ? null : Math.max(0, db - ris),
        sample_missing: [],
        sample_extra: [],
        note: c.rs
          ? `RIS zählt Rechtssätze; Entscheidungstexte in der DB: ${counts.texte}`
          : null,
      });
    }

    // State law — count level. RIS includes "§ 0" metadata records the
    // database leaves out, so RIS is expected to be higher.
    const today = new Date().toISOString().slice(0, 10);
    const lr = await hits(`${API}/Landesrecht?Applikation=LrKons&DokumenteProSeite=Ten&Fassung.FassungVom=${today}`);
    const [lrDb] = await q(
      `SELECT count(*)::int AS n FROM pages WHERE source_id = 'law-at-landesrecht' AND deleted_at IS NULL`
    );
    rows.push({
      source_id: "law-at-landesrecht",
      method: "counts",
      ris_total: lr,
      db_total: lrDb.n,
      missing: lr === null ? null : Math.max(0, lr - lrDb.n),
      extra: lr === null ? null : Math.max(0, lrDb.n - lr),
      sample_missing: [],
      sample_extra: [],
      note: "RIS enthält §-0-Metadatensätze ohne Normtext; die DB nicht",
    });
  } finally {
    releaseRisLock();
  }

  for (const r of rows) {
    console.log(
      `${r.source_id.padEnd(26)} RIS ${String(r.ris_total ?? "?").padStart(7)}  DB ${String(r.db_total).padStart(7)}  fehlt ${String(r.missing ?? "?").padStart(7)}  zu viel ${String(r.extra ?? "?").padStart(7)}  ${r.note ?? ""}`
    );
  }
  if (!DRY) {
    for (const r of rows) {
      await q(
        `INSERT INTO corpus_reconciliation
           (source_id, method, ris_total, db_total, missing, extra, sample_missing, sample_extra, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7::text::jsonb, $8::text::jsonb, $9)`,
        [
          r.source_id,
          r.method,
          r.ris_total,
          r.db_total,
          r.missing,
          r.extra,
          JSON.stringify(r.sample_missing),
          JSON.stringify(r.sample_extra),
          r.note,
        ]
      );
    }
    console.log(`${rows.length} Messungen gespeichert (corpus_reconciliation).`);
  }
  await engine.disconnect();
}

if (import.meta.main) {
  main().catch((e) => {
    console.error("Fatal:", e);
    releaseRisLock();
    process.exit(1);
  });
}
