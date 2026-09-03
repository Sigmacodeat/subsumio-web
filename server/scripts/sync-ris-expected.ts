/**
 * sync-ris-expected.ts — populates the `ris_expected` registry table.
 *
 * For each judikatur source, scans the RIS API (metadata-only, no full-text
 * fetch) and upserts every OgdDocumentReference into `ris_expected`.
 * This gives us a complete registry of what RIS publishes, so we can do
 * 1:1 coverage checks: "which ECLIs are in RIS but NOT in our corpus?"
 *
 * Usage:
 *   bun run scripts/sync-ris-expected.ts [--court ogh,vwgh] [--dry-run]
 *
 * --court   comma-separated court keys (default: all)
 * --dry-run fetch + print counts, don't write to DB
 *
 * Rate limiting: 100 docs/page, 1 page/sec → same as fetch-all-at-judikatur.
 */

import { parseArgs } from "node:util";
import { acquireRisLock, releaseRisLock } from "./ris-lock";
import { proxyFetchOptions, getUserAgent } from "./ris-proxy";
import {
  extractRisReferences,
  mapRisReference,
} from "../src/core/ingestion/connectors/legal-judgements.ts";

const RIS_BASE = "https://data.bka.gv.at/ris/api/v2.6";
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

// ── Court configs (mirrors fetch-all-at-judikatur.ts) ───────────────

interface CourtConfig {
  applikation: string;
  sourceId: string;
  label: string;
  defaultFrom: number;
}

const COURT_CONFIGS: Record<string, CourtConfig> = {
  ogh: { applikation: "Justiz", sourceId: "law-at-judikatur-ogh", label: "OGH", defaultFrom: 2000 },
  vwgh: {
    applikation: "Vwgh",
    sourceId: "law-at-judikatur-vwgh",
    label: "VwGH",
    defaultFrom: 1990,
  },
  vfgh: {
    applikation: "Vfgh",
    sourceId: "law-at-judikatur-vfgh",
    label: "VfGH",
    defaultFrom: 1980,
  },
  bvwg: {
    applikation: "Bvwg",
    sourceId: "law-at-judikatur-bvwg",
    label: "BVwG",
    defaultFrom: 2014,
  },
  lvwg: {
    applikation: "Lvwg",
    sourceId: "law-at-judikatur-lvwg",
    label: "LVwG",
    defaultFrom: 2014,
  },
  asylgh: {
    applikation: "AsylGH",
    sourceId: "law-at-judikatur-asylgh",
    label: "AsylGH",
    defaultFrom: 2008,
  },
  uvs: { applikation: "Uvs", sourceId: "law-at-judikatur-uvs", label: "UVS", defaultFrom: 1991 },
  dsk: { applikation: "Dsk", sourceId: "law-at-judikatur-dsk", label: "DSB", defaultFrom: 2010 },
  gbk: { applikation: "Gbk", sourceId: "law-at-judikatur-gbk", label: "GBK", defaultFrom: 2004 },
  pvak: {
    applikation: "Pvak",
    sourceId: "law-at-judikatur-pvak",
    label: "PVAK",
    defaultFrom: 2002,
  },
  dok: { applikation: "Dok", sourceId: "law-at-judikatur-dok", label: "DOK", defaultFrom: 2000 },
  ubas: {
    applikation: "Ubas",
    sourceId: "law-at-judikatur-ubas",
    label: "UBAS",
    defaultFrom: 2000,
  },
  umse: {
    applikation: "Umse",
    sourceId: "law-at-judikatur-umse",
    label: "UmSE",
    defaultFrom: 2001,
  },
};

// ── CLI ──────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    court: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});

const COURT_FILTER = values.court
  ? values.court
      .split(",")
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean)
  : Object.keys(COURT_CONFIGS);

const DRY_RUN = values["dry-run"] ?? false;

// ── DB connection ────────────────────────────────────────────────────

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://sigmabrain:2bfa7d4107f0b40e171cb508f27a9a703501b160d61957f0@localhost:15432/subsumio_law_v2";

async function getDb() {
  const { default: postgres } = await import("postgres");
  return postgres(DATABASE_URL, { max: 5 });
}

// ── Helpers ──────────────────────────────────────────────────────────

async function fetchWithRetry(url: string): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": getUserAgent() },
        signal: AbortSignal.timeout(30_000),
        ...proxyFetchOptions(),
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt)));
          continue;
        }
      }
      return res;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`max retries exceeded for ${url}`);
}

// ── Scan one court ───────────────────────────────────────────────────

async function scanCourt(
  courtKey: string,
  court: CourtConfig,
  sql: ReturnType<Awaited<ReturnType<typeof getDb>>>
): Promise<{ scanned: number; upserted: number }> {
  const now = new Date().toISOString();
  const currentYear = new Date().getFullYear();
  let scanned = 0;
  let upserted = 0;

  console.log(`\n═══ ${court.label} (${court.applikation}) ═══`);
  console.log(`  Source: ${court.sourceId}`);
  console.log(`  Years: ${court.defaultFrom}–${currentYear}`);

  await acquireRisLock();

  try {
    for (const year of Array.from(
      { length: currentYear - court.defaultFrom + 1 },
      (_, i) => court.defaultFrom + i
    )) {
      const yearFrom = `${year}-01-01`;
      const yearTo = `${year}-12-31`;
      let yearCount = 0;

      for (let page = 1; page <= 5000; page++) {
        const url = new URL(`${RIS_BASE}/judikatur`);
        url.searchParams.set("Applikation", court.applikation);
        url.searchParams.set("DokumenteProSeite", "OneHundred");
        url.searchParams.set("Seitennummer", String(page));
        url.searchParams.set("EntscheidungsdatumVon", yearFrom);
        url.searchParams.set("EntscheidungsdatumBis", yearTo);

        let refs: Array<Record<string, unknown>>;
        try {
          const res = await fetchWithRetry(url.toString());
          if (!res.ok) {
            console.error(`  ${year} p${page}: HTTP ${res.status}`);
            break;
          }
          const data = (await res.json()) as Record<string, unknown>;
          refs = extractRisReferences(data);
        } catch (err) {
          console.error(`  ${year} p${page}: ${err}`);
          break;
        }
        if (refs.length === 0) break;

        // 1 req/sec rate limit
        await new Promise((r) => setTimeout(r, 1000));

        // Batch upsert
        const rows: Array<{
          source_id: string;
          ris_id: string;
          ecli: string | null;
          case_number: string | null;
          court: string;
          decision_date: string;
          ris_url: string;
          payload: Record<string, unknown>;
        }> = [];

        for (const ref of refs) {
          const item = mapRisReference(ref, new Date());
          if (!item) continue;

          const risId = item.id.replace(/^ris-/, "");
          scanned++;
          yearCount++;

          rows.push({
            source_id: court.sourceId,
            ris_id: risId,
            ecli: item.ecli ?? null,
            case_number: item.az ?? null,
            court: item.court,
            decision_date: item.date,
            ris_url: item.url,
            payload: {
              keywords: item.keywords,
              legalArea: item.legalArea,
              title: item.title,
            },
          });
        }

        if (!DRY_RUN && rows.length > 0) {
          // Bulk upsert via ON CONFLICT
          for (const row of rows) {
            await sql`
              INSERT INTO ris_expected ${sql(row)}
              ON CONFLICT (source_id, ris_id)
              DO UPDATE SET
                ecli = EXCLUDED.ecli,
                case_number = EXCLUDED.case_number,
                court = EXCLUDED.court,
                decision_date = EXCLUDED.decision_date,
                ris_url = EXCLUDED.ris_url,
                payload = EXCLUDED.payload,
                fetched_at = now(),
                updated_at = now()
            `;
            upserted++;
          }
        }

        if (page % 10 === 0) {
          console.log(`  ${year} p${page}: ${yearCount} docs (total: ${scanned})`);
        }

        if (refs.length < 100) break; // last page
      }

      if (yearCount > 0) {
        console.log(`  ${year}: ${yearCount} docs`);
      }
    }
  } finally {
    await releaseRisLock();
  }

  console.log(`  Total: ${scanned} scanned, ${upserted} upserted`);
  return { scanned, upserted };
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║  sync-ris-expected — RIS registry builder                 ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");
  console.log(`  Courts: ${COURT_FILTER.join(", ")}`);
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);

  const sql = DRY_RUN ? null : await getDb();

  let totalScanned = 0;
  let totalUpserted = 0;

  try {
    for (const courtKey of COURT_FILTER) {
      const court = COURT_CONFIGS[courtKey];
      if (!court) {
        console.error(`Unknown court: ${courtKey}`);
        continue;
      }

      const { scanned, upserted } = await scanCourt(
        courtKey,
        court,
        sql as ReturnType<Awaited<ReturnType<typeof getDb>>>
      );
      totalScanned += scanned;
      totalUpserted += upserted;
    }

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log(`  Grand total: ${totalScanned} scanned, ${totalUpserted} upserted`);

    if (!DRY_RUN && sql) {
      // Summary per source
      const summary = await sql`
        SELECT source_id, count(*) AS total,
          count(*) FILTER (WHERE ecli IS NOT NULL) AS with_ecli,
          count(*) FILTER (WHERE case_number IS NOT NULL) AS with_gz
        FROM ris_expected
        GROUP BY source_id
        ORDER BY total DESC
      `;
      console.log("\n  Registry summary:");
      for (const row of summary) {
        console.log(
          `    ${row.source_id}: ${row.total} docs (${row.with_ecli} ECLI, ${row.with_gz} GZ)`
        );
      }
    }
  } finally {
    if (sql) await sql.end();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
