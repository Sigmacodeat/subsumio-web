#!/usr/bin/env bun
/**
 * Validate the legal corpus manifest without a database or model provider.
 *
 * Usage:
 *   bun run server/scripts/check-legal-corpus-manifest.ts
 *   bun run server/scripts/check-legal-corpus-manifest.ts --report-only
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isQuarantinedLegalSource } from "../src/core/legal/corpus-policy.ts";

const ROOT = join(import.meta.dir, "..", "..", "law-corpus");
const JURISDICTIONS = new Set(["at", "de", "ch", "eu"]);
const reportOnly = Bun.argv.includes("--report-only");

type Entry = {
  file: string;
  jurisdiction: string;
  abbreviation: string;
  versionDate: string;
  sourceUrl: string;
};

function frontmatter(raw: string): Record<string, string> {
  if (!raw.startsWith("---")) return {};
  const end = raw.indexOf("---", 3);
  if (end < 0) return {};
  const out: Record<string, string> = {};
  for (const line of raw.slice(3, end).split("\n")) {
    const match = /^([a-z_]+):\s*["']?(.*?)["']?\s*$/.exec(line);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

const errors: string[] = [];
const entries: Entry[] = [];
let quarantined = 0;
for (const jurisdiction of JURISDICTIONS) {
  const dir = join(ROOT, jurisdiction);
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".md")) continue;
    const relative = `${jurisdiction}/${file}`;
    if (isQuarantinedLegalSource(relative)) {
      quarantined++;
      continue;
    }
    const fm = frontmatter(readFileSync(join(dir, file), "utf8"));
    const declared = (fm.jurisdiction ?? "").toLowerCase();
    const abbreviation = (fm.abbreviation ?? file.replace(/\.md$/, "")).toLowerCase();
    const versionDate = fm.version_date ?? "";
    const sourceUrl = fm.source_url ?? "";

    if (declared !== jurisdiction) errors.push(`${relative}: jurisdiction=${declared || "missing"}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(versionDate)) {
      errors.push(`${relative}: version_date missing or invalid`);
    }
    if (!/^https?:\/\//.test(sourceUrl)) errors.push(`${relative}: source_url missing or invalid`);
    entries.push({ file: relative, jurisdiction, abbreviation, versionDate, sourceUrl });
  }
}

const keys = new Map<string, string[]>();
for (const entry of entries) {
  const key = `${entry.jurisdiction}:${entry.abbreviation}:${entry.versionDate}`;
  const files = keys.get(key) ?? [];
  files.push(entry.file);
  keys.set(key, files);
}
for (const [key, files] of keys) {
  if (files.length > 1) errors.push(`duplicate legal version ${key}: ${files.join(", ")}`);
}

console.log(`[legal-corpus-manifest] healthy=${entries.length} quarantined=${quarantined} versions=${keys.size} errors=${errors.length}`);
for (const error of errors) console.log(`  ${error}`);
if (errors.length > 0 && !reportOnly) process.exit(1);
