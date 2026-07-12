#!/usr/bin/env bun
/**
 * Gap 3: Standalone statute sync script for German federal laws.
 *
 * Fetches current statute texts from gesetze-im-internet.de and compares
 * with local corpus hashes to detect amendments.
 *
 * Usage: bun scripts/sync-statutes-de.ts [--json]
 */

import { runAmendmentCheck, buildFreshnessSummary, type Jurisdiction } from "../../src/lib/statute-freshness";

const STATUTES = [
  { jurisdiction: "DE" as Jurisdiction, statuteCode: "BGB" },
  { jurisdiction: "DE" as Jurisdiction, statuteCode: "HGB" },
  { jurisdiction: "DE" as Jurisdiction, statuteCode: "StGB" },
  { jurisdiction: "DE" as Jurisdiction, statuteCode: "ZPO" },
  { jurisdiction: "DE" as Jurisdiction, statuteCode: "AO" },
  { jurisdiction: "DE" as Jurisdiction, statuteCode: "StPO" },
  { jurisdiction: "DE" as Jurisdiction, statuteCode: "GG" },
  { jurisdiction: "DE" as Jurisdiction, statuteCode: "UWG" },
];

async function main() {
  const jsonOutput = process.argv.includes("--json");
  console.log(`[sync-statutes-de] Checking ${STATUTES.length} German statutes...`);

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

  console.log(`\n[sync-statutes-de] Done: ${allAmendments.length} total amendments`);
  console.log(`  Freshness: ${summary.fresh}/${summary.total_statutes} fresh, ${summary.stale} stale`);

  if (jsonOutput) {
    console.log(JSON.stringify({ reports, summary }, null, 2));
  }
}

main().catch((err) => {
  console.error(`[sync-statutes-de] Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
