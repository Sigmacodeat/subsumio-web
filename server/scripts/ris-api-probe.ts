#!/usr/bin/env bun
/**
 * RIS API Probe — Query RIS OGD API v2.6 Bundesrecht and dump full structure.
 *
 *   bun run server/scripts/ris-api-probe.ts [--full]
 *
 * Outputs:
 *   - Total laws, Gesetze, Verordnungen, außer Kraft counts
 *   - All unique metadata field names with types and example values
 *   - Full JSON for first 3 laws
 *   - Saves everything to /tmp/ris-api-probe.json
 *
 * Without --full: samples first 10 pages (1000 laws) for structure analysis.
 * With --full: paginates through ALL pages (~4400, takes ~22min).
 */

import { writeFileSync } from "fs";

const args = process.argv.slice(2);
const FULL = args.includes("--full");
const SAMPLE_PAGES = 10;

const RIS_API = "https://data.bka.gv.at/ris/api/v2.6/Bundesrecht";
const RIS_UA = {
  "User-Agent": "subsumio-law-corpus/1.0 (corpus build; contact: hello@subsum.io)",
};

interface FieldInfo {
  path: string;
  type: string;
  example: string;
  count: number;
}

function collectFields(obj: unknown, prefix: string, fields: Map<string, FieldInfo>) {
  if (obj === null || obj === undefined) return;
  if (typeof obj !== "object") {
    const path = prefix;
    const existing = fields.get(path);
    const type = typeof obj;
    const example = String(obj).slice(0, 120);
    if (existing) {
      existing.count++;
      if (existing.example.length < 5 && example.length > 5) existing.example = example;
    } else {
      fields.set(path, { path, type, example, count: 1 });
    }
    return;
  }
  if (Array.isArray(obj)) {
    // Sample first element
    if (obj.length > 0) collectFields(obj[0], `${prefix}[]`, fields);
    return;
  }
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    collectFields(val, path, fields);
  }
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log(`║  RIS OGD API v2.6 — Bundesrecht ${FULL ? "FULL Probe" : "Sample Probe       "}       ║`);
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const allLaws: Record<string, unknown>[] = [];
  const fieldsMap = new Map<string, FieldInfo>();
  const sampleLaws: Record<string, unknown>[] = [];
  let totalPages = 0;

  const maxPages = FULL ? 5000 : SAMPLE_PAGES;
  for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
    const url = `${RIS_API}?Applikation=BrKons&DokumenteProSeite=OneHundred&Seitennummer=${pageNo}`;
    process.stdout.write(`  Page ${pageNo}...`);

    try {
      const res = await fetch(url, { headers: RIS_UA });
      if (!res.ok) {
        console.log(` HTTP ${res.status} — stopping`);
        break;
      }
      const data = (await res.json()) as Record<string, unknown>;
      const result = (data.OgdSearchResult as Record<string, unknown>)
        ?.OgdDocumentResults as Record<string, unknown>;
      let refs = result?.OgdDocumentReference as
        | Array<Record<string, unknown>>
        | Record<string, unknown>
        | undefined;
      if (!refs) {
        console.log(" no more results");
        break;
      }
      if (!Array.isArray(refs)) refs = [refs];
      totalPages = pageNo;

      let count = 0;
      for (const ref of refs as Array<Record<string, unknown>>) {
        allLaws.push(ref);
        collectFields(ref, "", fieldsMap);

        // Save first 3 full law JSONs
        if (sampleLaws.length < 3) {
          sampleLaws.push(ref);
        }
        count++;
      }

      console.log(` ${count} laws (total: ${allLaws.length})`);

      if ((refs as Array<Record<string, unknown>>).length < 100) break;
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      console.log(` error: ${err} — stopping`);
      break;
    }
  }

  // ── Aggregate stats ──────────────────────────────────────────
  const stats = {
    totalLaws: allLaws.length,
    totalPages,
    gesetze: 0,
    verordnungen: 0,
    ausserKraft: 0,
    inKraft: 0,
    withInkraftdatum: 0,
    withAusserKraftdatum: 0,
    typCounts: {} as Record<string, number>,
  };

  const gesetzesnummern = new Set<string>();
  const kurztitelSet = new Set<string>();

  for (const law of allLaws) {
    const meta = (law.Data as Record<string, unknown>)?.Metadaten as Record<string, unknown> | undefined;
    const bund = meta?.Bundesrecht as Record<string, unknown> | undefined;
    if (!bund) continue;

    const brKons = bund.BrKons as Record<string, unknown> | undefined;
    const typ = brKons?.Typ as string | undefined;
    if (typ) stats.typCounts[typ] = (stats.typCounts[typ] ?? 0) + 1;
    if (typ === "G") stats.gesetze++;
    if (typ === "V") stats.verordnungen++;

    const gnr = brKons?.Gesetzesnummer as string | undefined;
    if (gnr) gesetzesnummern.add(gnr);

    const kurztitel = bund.Kurztitel as string | undefined;
    if (kurztitel) kurztitelSet.add(kurztitel);

    const ikd = brKons?.Inkrafttretensdatum as string | undefined;
    const akd = brKons?.Ausserkrafttretensdatum as string | undefined;
    if (ikd) stats.withInkraftdatum++;
    if (akd) {
      stats.withAusserKraftdatum++;
      stats.ausserKraft++;
    } else {
      stats.inKraft++;
    }
  }

  // ── Print summary ────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  SUMMARY");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Total pages fetched:     ${stats.totalPages}`);
  console.log(`  Total OgdDocumentRefs:   ${stats.totalLaws}`);
  console.log(`  Unique Gesetzesnummern:  ${gesetzesnummern.size}`);
  console.log(`  Unique Kurztitel:        ${kurztitelSet.size}`);
  console.log(`  Gesetze (Typ=G):         ${stats.gesetze}`);
  console.log(`  Verordnungen (Typ=V):    ${stats.verordnungen}`);
  console.log(`  In Kraft:                ${stats.inKraft}`);
  console.log(`  Außer Kraft:             ${stats.ausserKraft}`);
  console.log(`  With Inkraftdatum:       ${stats.withInkraftdatum}`);
  console.log(`  With Außerkraftdatum:    ${stats.withAusserKraftdatum}`);
  console.log(`  Typ distribution:`);
  for (const [typ, cnt] of Object.entries(stats.typCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${typ}: ${cnt}`);
  }

  // ── Print all fields ─────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  ALL METADATA FIELDS (from OgdDocumentReference)");
  console.log("═══════════════════════════════════════════════════════════");
  const sortedFields = [...fieldsMap.values()].sort((a, b) => a.path.localeCompare(b.path));
  console.log(`  ${"Field".padEnd(55)} | ${"Type".padEnd(8)} | ${"Count".padStart(6)} | Example`);
  console.log(`  ${"-".repeat(55)}-+-${"-".repeat(8)}-+-${"-".repeat(6)}-+-${"-".repeat(40)}`);
  for (const f of sortedFields) {
    const example = f.example.slice(0, 60).replace(/\n/g, " ");
    console.log(`  ${f.path.padEnd(55)} | ${f.type.padEnd(8)} | ${String(f.count).padStart(6)} | ${example}`);
  }

  // ── Print sample laws ────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  SAMPLE: First 3 laws (full JSON)");
  console.log("═══════════════════════════════════════════════════════════");
  for (let i = 0; i < sampleLaws.length; i++) {
    console.log(`\n--- Law ${i + 1} ---`);
    console.log(JSON.stringify(sampleLaws[i], null, 2));
  }

  // ── Save full output ─────────────────────────────────────────
  const report = {
    timestamp: new Date().toISOString(),
    stats,
    fields: sortedFields,
    uniqueGesetzesnummern: [...gesetzesnummern].sort(),
    uniqueKurztitel: [...kurztitelSet].sort(),
    sampleLaws,
    totalDocumentRefs: allLaws.length,
  };
  writeFileSync("/tmp/ris-api-probe.json", JSON.stringify(report, null, 2));
  console.log(`\n✅ Full report saved to /tmp/ris-api-probe.json (${(JSON.stringify(report).length / 1024).toFixed(0)} KB)`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
