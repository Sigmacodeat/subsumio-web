#!/usr/bin/env bun
/**
 * Gap 3: Standalone statute sync script for Austrian federal laws.
 *
 * Fetches current statute texts from RIS-OGD API and compares
 * with local corpus hashes to detect amendments.
 *
 * Usage: bun scripts/sync-statutes-at.ts [--json]
 */

import { runAmendmentCheck, buildFreshnessSummary, type Jurisdiction } from "../../src/lib/statute-freshness";

const STATUTES = [
  { jurisdiction: "AT" as Jurisdiction, statuteCode: "ABGB" },
  { jurisdiction: "AT" as Jurisdiction, statuteCode: "StGB" },
  { jurisdiction: "AT" as Jurisdiction, statuteCode: "ZPO" },
  { jurisdiction: "AT" as Jurisdiction, statuteCode: "StPO" },
  { jurisdiction: "AT" as Jurisdiction, statuteCode: "AO" },
  { jurisdiction: "AT" as Jurisdiction, statuteCode: "AHG" },
];

async function main() {
  const jsonOutput = process.argv.includes("--json");
  console.log(`[sync-statutes-at] Checking ${STATUTES.length} Austrian statutes...`);

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

  console.log(`\n[sync-statutes-at] Done: ${allAmendments.length} total amendments`);
  console.log(`  Freshness: ${summary.fresh}/${summary.total_statutes} fresh, ${summary.stale} stale`);

  if (jsonOutput) {
    console.log(JSON.stringify({ reports, summary }, null, 2));
  }
}

main().catch((err) => {
  console.error(`[sync-statutes-at] Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
