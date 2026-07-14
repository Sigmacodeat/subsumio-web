/**
 * CORPUS_META Generator — reads frontmatter from all statute markdown files
 * in law-corpus/{at,de,ch,eu} (top-level only) and generates src/lib/corpus-meta.ts.
 *
 * Collision resolution (fail-closed):
 *   1. Unique abbreviation → label = abbr
 *   2. Same abbr, same jurisdiction, all with gesetzesnummer → label = "${abbr} (${GN})"
 *   3. Same abbr, same jurisdiction, some without GN → with GN disambiguated; without GN EXCLUDED + reported
 *   4. Same abbr, different jurisdictions → label = "${abbr} (${JUR})"
 *   5. Mixed (same+jur) → same-jur get GN suffix, cross-jur get JUR suffix
 *
 * Usage:
 *   bun scripts/generate-corpus-meta.ts
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

const ROOT = process.cwd();
const CORPUS_DIR = join(ROOT, "law-corpus");
const OUTPUT_FILE = join(ROOT, "src", "lib", "corpus-meta.ts");

type Jurisdiction = "at" | "de" | "ch" | "eu";

interface StatuteEntry {
  slugKey: string;
  jurisdiction: Jurisdiction;
  label: string;
  file: string;
  abbr: string;
  gesetzesnummer: string | null;
  title: string;
}

interface ParsedFrontmatter {
  title: string;
  abbreviation: string;
  jurisdiction: string;
  gesetzesnummer: string | null;
}

function parseFrontmatter(text: string): ParsedFrontmatter | null {
  if (!text.startsWith("---")) return null;
  const endIdx = text.indexOf("---", 3);
  if (endIdx === -1) return null;
  const raw = text.slice(3, endIdx).trim();

  const fm: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (m) fm[m[1].toLowerCase()] = m[2].replace(/^"|"$/g, "").trim();
  }

  if (!fm.abbreviation || !fm.jurisdiction) return null;

  return {
    title: fm.title || fm.abbreviation,
    abbreviation: fm.abbreviation,
    jurisdiction: fm.jurisdiction.toLowerCase(),
    gesetzesnummer: fm.gesetzesnummer || null,
  };
}

function slugifyBase(filename: string): string {
  return basename(filename, ".md")
    .replace(/-/g, "_")
    .toLowerCase();
}

/**
 * Detect cross-jurisdiction slug collisions and prefix them with jurisdiction.
 * Returns a map from "jur/file" → final slug key.
 */
function resolveSlugKeys(entries: StatuteEntry[]): Map<string, string> {
  // Count how many jurisdictions use each base slug
  const slugJurs = new Map<string, Set<string>>();
  for (const e of entries) {
    if (!slugJurs.has(e.slugKey)) slugJurs.set(e.slugKey, new Set());
    slugJurs.get(e.slugKey)!.add(e.jurisdiction);
  }

  const result = new Map<string, string>();
  for (const e of entries) {
    const jurs = slugJurs.get(e.slugKey)!;
    if (jurs.size > 1) {
      // Cross-jurisdiction collision → suffix with jurisdiction
      result.set(`${e.jurisdiction}/${e.file}`, `${e.slugKey}_${e.jurisdiction}`);
    } else {
      result.set(`${e.jurisdiction}/${e.file}`, e.slugKey);
    }
  }
  return result;
}

function normalizeAbbr(abbr: string): string {
  return abbr.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function collectStatutes(): StatuteEntry[] {
  const entries: StatuteEntry[] = [];
  const jurisdictions: Jurisdiction[] = ["at", "de", "ch", "eu"];

  for (const jur of jurisdictions) {
    const dir = join(CORPUS_DIR, jur);
    if (!existsSync(dir)) {
      console.warn(`  Skipping ${dir} (not found)`);
      continue;
    }

    // Top-level .md files only (EU has huge subdirectories we don't want)
    const files = readdirSync(dir).filter(
      (f) => f.endsWith(".md") && !f.startsWith(".")
    );

    for (const file of files) {
      const filePath = join(dir, file);
      try {
        const text = readFileSync(filePath, "utf8");
        const fm = parseFrontmatter(text);
        if (!fm) {
          console.warn(`  SKIP ${jur}/${file}: no valid frontmatter`);
          continue;
        }

        const slugKey = slugifyBase(file);
        entries.push({
          slugKey,
          jurisdiction: jur,
          label: fm.abbreviation,
          file: `${jur}/${file}`,
          abbr: fm.abbreviation,
          gesetzesnummer: fm.gesetzesnummer,
          title: fm.title,
        });
      } catch (err) {
        console.error(`  ERROR reading ${jur}/${file}: ${err}`);
      }
    }
  }

  // Resolve cross-jurisdiction slug collisions
  const slugMap = resolveSlugKeys(entries);
  for (const e of entries) {
    e.slugKey = slugMap.get(`${e.jurisdiction}/${e.file}`)!;
  }

  return entries;
}

interface CollisionResolution {
  entries: StatuteEntry[];
  excluded: { entry: StatuteEntry; reason: string }[];
}

function resolveCollisions(entries: StatuteEntry[]): CollisionResolution {
  const excluded: { entry: StatuteEntry; reason: string }[] = [];

  // Normalize labels: convert "Abbr-AT" → "Abbr (AT)" for readability + backward compat
  for (const e of entries) {
    e.label = e.abbr.replace(/-(AT|DE|CH|EU)$/i, " ($1)");
  }

  // Group by normalized abbreviation
  const byNormAbbr = new Map<string, StatuteEntry[]>();
  for (const e of entries) {
    const norm = normalizeAbbr(e.abbr);
    if (!byNormAbbr.has(norm)) byNormAbbr.set(norm, []);
    byNormAbbr.get(norm)!.push(e);
  }

  const resolved: StatuteEntry[] = [];

  for (const [normAbbr, group] of byNormAbbr) {
    if (group.length === 1) {
      // Unique abbreviation — use as-is
      resolved.push(group[0]);
      continue;
    }

    // Collision detected
    // Sub-group by jurisdiction
    const byJur = new Map<string, StatuteEntry[]>();
    for (const e of group) {
      if (!byJur.has(e.jurisdiction)) byJur.set(e.jurisdiction, []);
      byJur.get(e.jurisdiction)!.push(e);
    }

    const jurisdictions = [...byJur.keys()];
    const isCrossJur = jurisdictions.length > 1;

    for (const [jur, jurGroup] of byJur) {
      if (jurGroup.length === 1) {
        // Only one entry for this jurisdiction
        if (isCrossJur) {
          // Disambiguate by jurisdiction
          resolved.push({
            ...jurGroup[0],
            label: `${jurGroup[0].abbr} (${jur.toUpperCase()})`,
          });
        } else {
          // Shouldn't happen (group.length > 1 but single jur with single entry)
          resolved.push(jurGroup[0]);
        }
        continue;
      }

      // Multiple entries in same jurisdiction
      const withGN = jurGroup.filter((e) => e.gesetzesnummer);
      const withoutGN = jurGroup.filter((e) => !e.gesetzesnummer);

      // All have GN → disambiguate by GN
      if (withoutGN.length === 0) {
        for (const e of withGN) {
          resolved.push({
            ...e,
            label: `${e.abbr} (${e.gesetzesnummer})`,
          });
        }
        continue;
      }

      // Some lack GN
      // Those with GN get disambiguated
      for (const e of withGN) {
        const jurSuffix = isCrossJur ? ` (${jur.toUpperCase()})` : "";
        resolved.push({
          ...e,
          label: `${e.abbr} (${e.gesetzesnummer})${jurSuffix}`,
        });
      }
      // Those without GN are excluded and reported
      for (const e of withoutGN) {
        excluded.push({
          entry: e,
          reason: `Ambiguous abbreviation "${e.abbr}" (${jur}) without gesetzesnummer — cannot disambiguate`,
        });
      }
    }
  }

  // Verify label uniqueness — if still duplicated, append slug-key fragment
  const labelMap = new Map<string, number>();
  for (const e of resolved) {
    const key = e.label.toUpperCase();
    labelMap.set(key, (labelMap.get(key) || 0) + 1);
  }

  for (const e of resolved) {
    const key = e.label.toUpperCase();
    if (labelMap.get(key)! > 1) {
      // Append slug-key fragment for uniqueness
      const fragment = e.slugKey.slice(-8);
      e.label = `${e.label} [${fragment}]`;
    }
  }

  return { entries: resolved, excluded };
}

function generateTypeScript(entries: StatuteEntry[]): string {
  // Sort by slug-key for deterministic output
  entries.sort((a, b) => a.slugKey.localeCompare(b.slugKey));

  const now = new Date().toISOString().split("T")[0];
  const lines: string[] = [
    "/**",
    " * Client-safe corpus metadata — no node:fs/node:path imports.",
    " * This file can be safely imported from client-side code.",
    " * Server-only code (legal-grounding.ts) re-exports from here.",
    " *",
    " * AUTO-GENERATED by scripts/generate-corpus-meta.ts",
    ` * Generated: ${now}`,
    ` * Entries: ${entries.length}`,
    " * DO NOT EDIT MANUALLY — run: bun scripts/generate-corpus-meta.ts",
    " */",
    "",
    "export const CORPUS_META: Record<",
    "  string,",
    '  { jurisdiction: "at" | "de" | "ch" | "eu"; label: string; file: string }',
    "> = {",
  ];

  // Group by jurisdiction for readability
  const byJur: Record<string, StatuteEntry[]> = {
    at: [],
    de: [],
    ch: [],
    eu: [],
  };
  for (const e of entries) {
    byJur[e.jurisdiction]?.push(e);
  }

  const jurLabels: Record<string, string> = {
    at: "Austria",
    de: "Germany",
    ch: "Switzerland",
    eu: "EU",
  };

  for (const jur of ["at", "de", "ch", "eu"]) {
    const group = byJur[jur];
    if (group.length === 0) continue;
    lines.push(`  // ── ${jurLabels[jur]} (${group.length} statutes) ─────────────`);
    for (const e of group) {
      const labelEsc = e.label.replace(/'/g, "\\'");
      lines.push(
        `  "${e.slugKey}": { jurisdiction: "${jur}", label: "${labelEsc}", file: "${e.file}" },`
      );
    }
    lines.push("");
  }

  // Remove trailing empty line before closing brace
  if (lines[lines.length - 1] === "") lines.pop();

  lines.push("};");
  lines.push("");

  return lines.join("\n");
}

// ── Main ─────────────────────────────────────────────────────────────

console.log("═══════════════════════════════════════════════════════════");
console.log("  CORPUS_META Generator");
console.log("═══════════════════════════════════════════════════════════");
console.log("");

const rawEntries = collectStatutes();
console.log(`  Collected ${rawEntries.length} statute entries from frontmatter`);

const { entries: resolved, excluded } = resolveCollisions(rawEntries);

if (excluded.length > 0) {
  console.error("");
  console.error(`  ⚠️  EXCLUDED (${excluded.length} ambiguous entries without gesetzesnummer):`);
  for (const { entry, reason } of excluded) {
    console.error(`    ❌ ${entry.file}: ${reason}`);
  }
}

console.log("");
console.log(`  Resolved: ${resolved.length} entries (${excluded.length} excluded)`);

// Verify minimum count
if (resolved.length < 950) {
  console.error(`  ❌ FATAL: Only ${resolved.length} entries (minimum 950 required)`);
  process.exit(1);
}

const output = generateTypeScript(resolved);
writeFileSync(OUTPUT_FILE, output, "utf8");

console.log("");
console.log(`  ✅ Written: ${OUTPUT_FILE}`);
console.log(`  Total entries: ${resolved.length}`);
console.log(`  Jurisdictions: at=${byJurCount(resolved, "at")}, de=${byJurCount(resolved, "de")}, ch=${byJurCount(resolved, "ch")}, eu=${byJurCount(resolved, "eu")}`);
console.log("");

function byJurCount(entries: StatuteEntry[], jur: string): number {
  return entries.filter((e) => e.jurisdiction === jur).length;
}
