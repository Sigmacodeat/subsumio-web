#!/usr/bin/env bun
/**
 * Gap 3: Standalone statute sync script for Swiss federal laws.
 *
 * Fetches current statute texts from fedlex.ch API and compares
 * with local corpus hashes to detect amendments.
 *
 * Usage: bun scripts/sync-statutes-ch.ts [--json]
 */

import { runAmendmentCheck, buildFreshnessSummary, type Jurisdiction } from "../../src/lib/statute-freshness";

const STATUTES = [
  { jurisdiction: "CH" as Jurisdiction, statuteCode: "OR" },
  { jurisdiction: "CH" as Jurisdiction, statuteCode: "ZGB" },
  { jurisdiction: "CH" as Jurisdiction, statuteCode: "StGB" },
  { jurisdiction: "CH" as Jurisdiction, statuteCode: "StPO" },
  { jurisdiction: "CH" as Jurisdiction, statuteCode: "ZPO" },
  { jurisdiction: "CH" as Jurisdiction, statuteCode: "DSG" },
];

async function main() {
  const jsonOutput = process.argv.includes("--json");
  console.log(`[sync-statutes-ch] Checking ${STATUTES.length} Swiss statutes...`);

  const reports = await runAmendmentCheck(STATUTES);
  const allAmendments = reports.flatMap((r) => r.amendments);
  const summary = buildFreshnessSummary(reports, []);

  for (const report of reports) {
    const statuteCount = report.total_statutes_checked;
    const amendCount = report.total_amendments;
    if (report.errors.length > 0) {
      console.log(`  Errors: ${report.errors.length} — ${report.errors.join("; ")}`);
    } else if (amendCount === 0) {
      console.log(`  All ${statuteCount} statutes up to date`);
    } else {
      console.log(`  ${amendCount} amendments detected across ${statuteCount} statutes`);
      for (const a of report.amendments) {
        console.log(`    ${a.statute_code} § ${a.paragraph} ${a.change_type}`);
      }
    }
  }

  console.log(`\n[sync-statutes-ch] Done: ${allAmendments.length} total amendments`);
  console.log(`  Freshness: ${summary.fresh}/${summary.total_statutes} fresh, ${summary.stale} stale`);

  if (jsonOutput) {
    console.log(JSON.stringify({ reports, summary }, null, 2));
  }
}

main().catch((err) => {
  console.error(`[sync-statutes-ch] Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
