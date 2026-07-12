#!/usr/bin/env bun
/**
 * Statute Completeness Check — vergleicht DB-Gesetze mit offiziellen APIs.
 *
 * AT: RIS-OGD API v2.6 (Bundesrecht)
 * DE: buzer.de (Suche + Detailseiten)
 * CH: OpenCaseLaw / Fedlex
 *
 * Usage:
 *   bun run server/scripts/check-statute-completeness.ts
 *   bun run server/scripts/check-statute-completeness.ts --jurisdiction at
 */

import { parseArgs } from "util";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import {
  fetchLiveStatuteVersion,
  fetchRisOgdByGesetzesnummer,
  type LiveStatuteVersion,
} from "../src/lib/statute-live-source.ts";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    jurisdiction: { type: "string", default: "" },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (values.help) {
  console.log(`
Statute Completeness Check — DB vs. offizielle APIs

Usage:
  bun run server/scripts/check-statute-completeness.ts [options]

Options:
  --jurisdiction  Nur eine Jurisdiction prüfen (at|de|ch)
  --help          Diese Hilfe
`);
  process.exit(0);
}

const CORPUS = join(import.meta.dir, "..", "..", "law-corpus");
const ONLY_JUR = values.jurisdiction as string;

interface StatuteCheck {
  abbr: string;
  jurisdiction: string;
  db_versionDate: string | null;
  live_version: LiveStatuteVersion | null;
  status: "current" | "outdated" | "not_found_live" | "error";
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Subsumio — Statute Completeness Check (vs. offizielle APIs)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");

  const jurisdictions = ONLY_JUR ? [ONLY_JUR] : ["de", "at", "ch"];
  const allResults: StatuteCheck[] = [];

  for (const jur of jurisdictions) {
    const dirPath = join(CORPUS, jur);
    let files: string[];
    try {
      files = readdirSync(dirPath).filter((f) => f.endsWith(".md"));
    } catch {
      console.log(`  ⚠️  Kein law-corpus/${jur}/ Verzeichnis — überspringe`);
      continue;
    }

    // Extract versionDate and gesetzesnummer from frontmatter for each file
    const statutes: { abbr: string; versionDate: string | null; gesetzesnummer: string | null }[] = [];
    for (const file of files) {
      const raw = readFileSync(join(dirPath, file), "utf-8");
      const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
      let versionDate: string | null = null;
      let gesetzesnummer: string | null = null;
      if (fmMatch) {
        const vdMatch = fmMatch[1]!.match(/version_date:\s*"?(\d{4}-\d{2}-\d{2})"?/);
        if (vdMatch) versionDate = vdMatch[1]!;
        // Extract Gesetzesnummer from source_url (AT laws from RIS)
        const urlMatch = fmMatch[1]!.match(/Gesetzesnummer=(\d+)/);
        if (urlMatch) gesetzesnummer = urlMatch[1]!;
        if (!gesetzesnummer) {
          const pathMatch = fmMatch[1]!.match(/Bundesnormen\/(\d+)\//);
          if (pathMatch) gesetzesnummer = pathMatch[1]!;
        }
      }
      statutes.push({ abbr: file.replace(/\.md$/, ""), versionDate, gesetzesnummer });
    }

    console.log(`\n📋 ${jur.toUpperCase()}: ${statutes.length} Gesetze im law-corpus`);
    console.log("─".repeat(60));

    let current = 0;
    let outdated = 0;
    let notFound = 0;
    let errors = 0;

    for (const { abbr, versionDate, gesetzesnummer } of statutes) {
      const abbrClean = abbr.replace(/-at$/, "").replace(/-de$/, "").replace(/-ch$/, "");
      const jurCode = jur as "at" | "de" | "ch";

      try {
        // For AT: try Gesetzesnummer first (more reliable), then abbr
        let live = null as Awaited<ReturnType<typeof fetchLiveStatuteVersion>>;
        if (jurCode === "at" && gesetzesnummer) {
          live = await fetchRisOgdByGesetzesnummer(gesetzesnummer, abbrClean);
        }
        if (!live) {
          live = await fetchLiveStatuteVersion(jurCode, abbrClean);
        }

        if (!live) {
          notFound++;
          allResults.push({
            abbr,
            jurisdiction: jur,
            db_versionDate: versionDate,
            live_version: null,
            status: "not_found_live",
          });
          console.log(`  ❓ ${abbr.padEnd(20)} — nicht auf offizieller API gefunden`);
        } else if (!live.version_date || !versionDate) {
          current++;
          allResults.push({
            abbr,
            jurisdiction: jur,
            db_versionDate: versionDate,
            live_version: live,
            status: "current",
          });
          console.log(
            `  ✅ ${abbr.padEnd(20)} — DB: ${versionDate ?? "?"} | Live: ${live.version_date ?? "?"} (kein Datum-Vergleich möglich)`
          );
        } else {
          const dbDate = versionDate;
          const liveDate = live.version_date;
          if (dbDate >= liveDate) {
            current++;
            allResults.push({
              abbr,
              jurisdiction: jur,
              db_versionDate: versionDate,
              live_version: live,
              status: "current",
            });
            console.log(`  ✅ ${abbr.padEnd(20)} — DB: ${dbDate} | Live: ${liveDate} → AKTUELL`);
          } else {
            outdated++;
            allResults.push({
              abbr,
              jurisdiction: jur,
              db_versionDate: versionDate,
              live_version: live,
              status: "outdated",
            });
            console.log(`  ⚠️  ${abbr.padEnd(20)} — DB: ${dbDate} | Live: ${liveDate} → VERALTET`);
          }
        }
      } catch (e) {
        errors++;
        allResults.push({
          abbr,
          jurisdiction: jur,
          db_versionDate: versionDate,
          live_version: null,
          status: "error",
        });
        console.log(`  ❌ ${abbr.padEnd(20)} — Fehler: ${e instanceof Error ? e.message : String(e)}`);
      }

      // Rate limit
      await new Promise((r) => setTimeout(r, 300));
    }

    console.log(`\n  ${jur.toUpperCase()} Zusammenfassung: ${current} aktuell, ${outdated} veraltet, ${notFound} nicht gefunden, ${errors} Fehler`);
  }

  // Final summary
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  GESAMT-ERGEBNIS");
  console.log("═══════════════════════════════════════════════════════════");

  const total = allResults.length;
  const totalCurrent = allResults.filter((r) => r.status === "current").length;
  const totalOutdated = allResults.filter((r) => r.status === "outdated").length;
  const totalNotFound = allResults.filter((r) => r.status === "not_found_live").length;
  const totalErrors = allResults.filter((r) => r.status === "error").length;

  console.log(`  Gesetze geprüft:  ${total}`);
  console.log(`  Aktuell:          ${totalCurrent}`);
  console.log(`  Veraltet:         ${totalOutdated}`);
  console.log(`  Nicht auf API:    ${totalNotFound}`);
  console.log(`  Fehler:           ${totalErrors}`);

  if (totalOutdated > 0) {
    console.log("\n  ⚠️  Veraltete Gesetze:");
    for (const r of allResults.filter((r) => r.status === "outdated")) {
      console.log(
        `    ${r.jurisdiction.toUpperCase()}/${r.abbr}: DB=${r.db_versionDate} → Live=${r.live_version?.version_date}`
      );
    }
  }

  if (totalNotFound > 0) {
    console.log("\n  ❓ Auf offizieller API nicht gefunden:");
    for (const r of allResults.filter((r) => r.status === "not_found_live")) {
      console.log(`    ${r.jurisdiction.toUpperCase()}/${r.abbr}`);
    }
  }

  console.log("");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
