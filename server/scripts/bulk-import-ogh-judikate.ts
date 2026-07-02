#!/usr/bin/env bun
/**
 * RIS-OGD Bulk Import Script — fetches historical OGH/BGH/VwGH decisions
 * and ingests them into the Brain for precedent matching.
 *
 * Usage:
 *   bun run server/scripts/bulk-import-ogh-judikate.ts --query "Haftung" --from 2015 --to 2025 --max 500
 *   bun run server/scripts/bulk-import-ogh-judikate.ts --query "Kündigung" --from 2018 --max 200
 *   bun run server/scripts/bulk-import-ogh-judikate.ts --all --max 1000
 *
 * Flags:
 *   --query   Suchwort (z.B. "Haftung", "Schadensersatz", "Kündigung")
 *   --from    Startjahr (default: 2015)
 *   --to      Endjahr (default: aktuelles Jahr)
 *   --max     Max Anzahl Entscheidungen (default: 500)
 *   --all     Lädt Standard-Queries: Haftung, Schadensersatz, Vertrag, Kündigung, Amtshaftung, Gewährleistung
 *   --dry-run Zeigt nur was importiert würde, ohne es zu tun
 *   --output  Output-Verzeichnis für Markdown-Dateien (default: law-corpus/at/judikate)
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const RIS_OGD_BASE = "https://data.bka.gv.at/ris/api/v2.6";

const DEFAULT_QUERIES = [
  "Haftung",
  "Schadensersatz",
  "Vertrag",
  "Kündigung",
  "Amtshaftung",
  "Gewährleistung",
  "Unterhalt",
  "Erbrecht",
  "Scheidung",
  "Strafzumessung",
];

interface RisReference {
  id: string;
  court: string;
  date: string;
  az: string;
  ecli?: string;
  keywords: string[];
  legalArea: string;
  url: string;
  text?: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractRisReferences(data: Record<string, unknown>): Array<Record<string, unknown>> {
  const result = (data.OgdSearchResult ?? data) as Record<string, unknown>;
  const docResults = result.OgdDocumentResults as Record<string, unknown> | undefined;
  if (!docResults) return [];
  const refs = docResults.OgdDocumentReference;
  if (Array.isArray(refs)) return refs as Array<Record<string, unknown>>;
  if (refs && typeof refs === "object") return [refs as Record<string, unknown>];
  return [];
}

function firstListItem(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const item = (value as Record<string, unknown>).item;
    if (typeof item === "string") return item.split(";")[0]?.trim() ?? "";
    if (Array.isArray(item) && item.length > 0) return String(item[0]);
  }
  return "";
}

function mapRisReference(ref: Record<string, unknown>): RisReference | null {
  const metadaten = ((ref.Data as Record<string, unknown> | undefined)?.Metadaten ?? {}) as Record<string, unknown>;
  const technisch = (metadaten.Technisch ?? {}) as Record<string, unknown>;
  const allgemein = (metadaten.Allgemein ?? {}) as Record<string, unknown>;
  const judikatur = (metadaten.Judikatur ?? {}) as Record<string, unknown>;
  const justiz = (judikatur.Justiz ?? {}) as Record<string, unknown>;

  const id = String(technisch.ID ?? "");
  if (!id) return null;

  const court = String(justiz.Gericht ?? technisch.Organ ?? "Unbekannt");
  const rawDate = String(judikatur.Entscheidungsdatum ?? "");
  const az = firstListItem(judikatur.Geschaeftszahl);
  const ecli = judikatur.EuropeanCaseLawIdentifier ? String(judikatur.EuropeanCaseLawIdentifier) : undefined;
  const keywords = String(judikatur.Schlagworte ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  const legalArea = firstListItem(justiz.Rechtsgebiete) || "Allgemein";
  const url = String(
    allgemein.DokumentUrl ??
      `https://ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=${id}`
  );

  return { id, court, date: rawDate, az, ecli, keywords, legalArea, url };
}

async function fetchRisDetailText(id: string): Promise<string> {
  try {
    const url = new URL(`${RIS_OGD_BASE}/judikatur`);
    url.searchParams.set("Applikation", "Justiz");
    url.searchParams.set("Dokumentnummer", id);
    const res = await fetch(url.toString());
    if (!res.ok) return "";
    const data = (await res.json()) as Record<string, unknown>;
    const refs = extractRisReferences(data);
    if (refs.length === 0) return "";
    const ref = refs[0];
    const content = (ref as Record<string, unknown>).Content as Record<string, unknown> | undefined;
    if (!content) return "";
    const dataContent = (content.Data as Record<string, unknown> | undefined) ?? {};
    const text = String(dataContent.Text ?? "");
    return stripHtml(text);
  } catch {
    return "";
  }
}

async function searchRis(
  query: string,
  fromDate: string,
  toDate: string,
  maxPages: number
): Promise<RisReference[]> {
  const results: RisReference[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= maxPages; page++) {
    const url = new URL(`${RIS_OGD_BASE}/judikatur`);
    url.searchParams.set("Applikation", "Justiz");
    url.searchParams.set("Suchworte", query);
    url.searchParams.set("EntscheidungsdatumVon", fromDate);
    url.searchParams.set("EntscheidungsdatumBis", toDate);
    url.searchParams.set("DokumenteProSeite", "OneHundred");
    url.searchParams.set("Seitennummer", String(page));

    console.log(`  [RIS] Page ${page}: ${url.toString().substring(0, 120)}...`);

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.warn(`  [RIS] HTTP ${res.status} on page ${page}`);
      break;
    }

    const data = (await res.json()) as Record<string, unknown>;
    const refs = extractRisReferences(data);
    if (refs.length === 0) break;

    for (const ref of refs) {
      const mapped = mapRisReference(ref);
      if (!mapped) continue;
      if (seen.has(mapped.id)) continue;
      seen.add(mapped.id);
      results.push(mapped);
    }

    if (refs.length < 100) break;

    // Rate limit: be respectful
    await new Promise((r) => setTimeout(r, 500));
  }

  return results;
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unbekannt"
  );
}

function toMarkdown(ref: RisReference, text: string): string {
  const frontmatter = [
    "---",
    `type: court_decision`,
    `court: "${ref.court}"`,
    `date: "${ref.date}"`,
    `case_number: "${ref.az}"`,
    `ecli: "${ref.ecli ?? ""}"`,
    `legal_area: "${ref.legalArea}"`,
    `keywords: [${ref.keywords.map((k) => `"${k}"`).join(", ")}]`,
    `source: "ris-ogd"`,
    `source_url: "${ref.url}"`,
    "---",
  ].join("\n");

  const body = text || `*Volltext nicht abgerufen — siehe Quelle.*`;

  return `${frontmatter}\n\n# ${ref.court} — ${ref.date}\n\n**GZ:** ${ref.az}\n\n${body}\n\n---\n*Quelle: [RIS](${ref.url})*\n`;
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i]?.startsWith("--")) {
      const key = args[i]!.slice(2);
      if (i + 1 < args.length && !args[i + 1]?.startsWith("--")) {
        flags[key] = args[++i];
      } else {
        flags[key] = true;
      }
    }
  }

  const queries: string[] = flags.all
    ? DEFAULT_QUERIES
    : flags.query
      ? [String(flags.query)]
      : ["Haftung"];

  const fromYear = parseInt(String(flags.from ?? "2015"), 10);
  const toYear = parseInt(String(flags.to ?? String(new Date().getFullYear())), 10);
  const maxTotal = parseInt(String(flags.max ?? "500"), 10);
  const dryRun = !!flags.dryRun;
  const outputDir = String(flags.output ?? "law-corpus/at/judikate");

  const fromDate = `${fromYear}-01-01`;
  const toDate = `${toYear}-12-31`;

  console.log("═══════════════════════════════════════════════════");
  console.log("  RIS-OGD Bulk Import — OGH Judikatur");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Queries:   ${queries.join(", ")}`);
  console.log(`  Zeitraum:  ${fromYear} — ${toYear}`);
  console.log(`  Max:       ${maxTotal} Entscheidungen`);
  console.log(`  Output:    ${outputDir}`);
  console.log(`  Dry-Run:   ${dryRun ? "JA" : "NEIN"}`);
  console.log("═══════════════════════════════════════════════════\n");

  if (!dryRun && !existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  let totalImported = 0;
  let totalSkipped = 0;
  const allRefs: RisReference[] = [];
  const seenIds = new Set<string>();

  for (const query of queries) {
    if (totalImported >= maxTotal) {
      console.log(`\n✅ Max limit (${maxTotal}) erreicht — stoppe.`);
      break;
    }

    console.log(`\n🔍 Suche: "${query}" (${fromDate} — ${toDate})`);
    const maxPagesPerQuery = Math.ceil((maxTotal - totalImported) / 100);
    const refs = await searchRis(query, fromDate, toDate, Math.min(maxPagesPerQuery, 10));

    console.log(`  → ${refs.length} Entscheidungen gefunden`);

    for (const ref of refs) {
      if (totalImported >= maxTotal) break;
      if (seenIds.has(ref.id)) {
        totalSkipped++;
        continue;
      }
      seenIds.add(ref.id);

      // Fetch full text for top results
      console.log(`  📄 ${ref.court} ${ref.az} (${ref.date}) — hole Volltext...`);
      const text = dryRun ? "" : await fetchRisDetailText(ref.id);

      if (dryRun) {
        console.log(`     [DRY-RUN] würde importieren: ${ref.id}`);
        totalImported++;
        continue;
      }

      const md = toMarkdown(ref, text);
      const slug = slugify(`${ref.date}-${ref.court}-${ref.az}`);
      const filename = join(outputDir, `${slug}.md`);
      writeFileSync(filename, md, "utf-8");
      console.log(`     ✅ ${filename}`);
      totalImported++;

      // Rate limit
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  console.log("\n═══════════════════════════════════════════════════");
  console.log(`  Importiert:  ${totalImported}`);
  console.log(`  Übersprungen: ${totalSkipped} (Duplikate)`);
  console.log(`  Output:      ${outputDir}`);
  console.log("═══════════════════════════════════════════════════\n");

  if (!dryRun && totalImported > 0) {
    console.log("💡 Nächster Schritt: Diese Dateien in das Brain ingesten:");
    console.log(`   gbrain ingest --source ${outputDir} --type court_decision`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
