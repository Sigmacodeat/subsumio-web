/**
 * CORPUS_META Generator — reads frontmatter from all statute markdown files
 * in law-corpus/{at,de,ch,eu,at-staatsvertraege,at-landesrecht} and generates
 * src/lib/corpus-meta.ts.
 *
 * Collision resolution (fail-closed):
 *   1. Group by normalized abbreviation + jurisdiction.
 *   2. Within each group, keep the entry with the lowest numeric gesetzesnummer.
 *   3. If no gesetzesnummer is present, use category/state_code as a tiebreaker.
 *   4. If still ambiguous, keep one deterministically and report the rest.
 *   5. Cross-jurisdiction collisions are disambiguated by a jurisdiction suffix.
 *
 * Usage:
 *   bun scripts/generate-corpus-meta.ts
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const CORPUS_DIR = join(ROOT, "law-corpus");
const OUTPUT_FILE = join(ROOT, "src", "lib", "corpus-meta.ts");
const EXCLUDED_REPORT_FILE = join(ROOT, "scripts", "corpus-meta-excluded-report.json");

type Jurisdiction = "at" | "de" | "ch" | "eu";
type MetaType = "statute" | "state_treaty" | "state_law";

export interface StatuteEntry {
  slugKey: string;
  jurisdiction: Jurisdiction;
  label: string;
  file: string;
  abbr: string;
  gesetzesnummer: string | null;
  title: string;
  type: MetaType;
  stateCode?: string;
}

interface ParsedFrontmatter {
  title: string;
  abbreviation: string;
  jurisdiction: string;
  gesetzesnummer: string | null;
  type: string | null;
  state_code?: string;
}

export function parseFrontmatter(text: string): ParsedFrontmatter | null {
  if (!text.startsWith("---")) return null;

  // Handle double-`---` pattern: some files (at-landesrecht) start with
  // an empty `---\n---\n` block followed by the actual frontmatter.
  // Skip empty blocks and parse the first non-empty one.
  let pos = 0;
  let raw = "";
  while (pos < text.length) {
    if (!text.startsWith("---", pos)) break;
    const endIdx = text.indexOf("---", pos + 3);
    if (endIdx === -1) {
      // No closing `---` — treat rest of file as frontmatter (some files lack closing marker)
      raw = text.slice(pos + 3).trim();
      break;
    }
    raw = text.slice(pos + 3, endIdx).trim();
    if (raw.length > 0) break; // Found non-empty block
    pos = endIdx; // Skip empty block, try next
  }

  if (raw.length === 0) return null;

  const fm: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (m) fm[m[1].toLowerCase()] = m[2].replace(/^"|"$/g, "").trim();
  }

  if (!fm.jurisdiction) return null;

  // Fallback for abbreviation: use title if no abbreviation field
  const abbr = fm.abbreviation || fm.title || "";

  return {
    title: fm.title || fm.abbreviation || "",
    abbreviation: abbr,
    jurisdiction: fm.jurisdiction.toLowerCase(),
    gesetzesnummer: fm.gesetzesnummer || null,
    type: fm.type || null,
    state_code: fm.state_code || undefined,
  };
}

export function extractBodyAbbreviation(text: string): string | null {
  const body = text.includes("---") ? text.slice(text.indexOf("---", 3) + 3) : text;
  const m = body.match(/(?:^|\n)Abkürzung\s*([^\n]+)/i);
  return m ? m[1].trim() : null;
}

function isGenericAbbr(abbr: string): boolean {
  const norm = normalizeAbbr(abbr);
  const generic = new Set([
    "ABKOMMEN", "UBEREINKOMMEN", "VEREINBARUNG", "PROTOKOLL", "KONVENTION",
    "ABANDERUNG", "VERORDNUNG", "GESETZ", "BUNDESGESETZ", "LANDESGESETZ",
    "BURGENLANDISCHES", "BURGENLAND", "KARNTNER", "KARNTEN", "STEIRISCHES",
    "STEIERMARK", "TIROLER", "TIROL", "VORARLBERGER", "VORARLBERG",
    "OBEROSTERREICHISCHES", "OBEROSTERREICH", "NIEDEROSTERREICHISCHES",
    "NIEDEROSTERREICH", "SALZBURGER", "SALZBURG", "WIENER", "WIEN",
    "EUROPAISCHE", "EUROPAISCHES", "REPUBLIK",
  ]);
  return norm.length <= 2 || generic.has(norm);
}

function mapMetaType(fmType: string | null, file: string): MetaType {
  const lower = (fmType || "").toLowerCase();
  if (lower === "staatsvertrag" || file.startsWith("at-staatsvertraege/")) return "state_treaty";
  if (lower === "landesgesetz" || file.startsWith("at-landesrecht/")) return "state_law";
  return "statute";
}

function slugifyBase(filename: string): string {
  return basename(filename, ".md")
    .replace(/-/g, "_")
    .toLowerCase();
}

function normalizeAbbr(abbr: string): string {
  return abbr.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function parseGesetzesnummer(gn: string | null): number {
  if (!gn) return Infinity;
  const n = Number(gn.replace(/\D/g, ""));
  return Number.isFinite(n) && n > 0 ? n : Infinity;
}

/**
 * Detect slug collisions within the same jurisdiction and across jurisdictions.
 * Returns a map from "jur/file" → final slug key.
 */
function resolveSlugKeys(entries: StatuteEntry[]): Map<string, string> {
  // 1. Count how many entries share each base slug globally (across jurisdictions)
  const slugCounts = new Map<string, number>();
  for (const e of entries) {
    slugCounts.set(e.slugKey, (slugCounts.get(e.slugKey) || 0) + 1);
  }

  // 2. For cross-jurisdiction collisions, pick a canonical jurisdiction to keep the bare slug
  const jurPreference: Jurisdiction[] = ["at", "de", "ch", "eu"];
  const slugWinner = new Map<string, Jurisdiction>();
  for (const [slug, count] of slugCounts) {
    if (count <= 1) continue;
    const jurs = new Set(
      entries.filter((e) => e.slugKey === slug).map((e) => e.jurisdiction)
    );
    for (const jur of jurPreference) {
      if (jurs.has(jur)) {
        slugWinner.set(slug, jur);
        break;
      }
    }
  }

  // 3. Count collisions within the same jurisdiction (e.g. multiple state laws with same slug)
  const slugJurCounts = new Map<string, number>();
  for (const e of entries) {
    const key = `${e.jurisdiction}:${e.slugKey}`;
    slugJurCounts.set(key, (slugJurCounts.get(key) || 0) + 1);
  }

  const result = new Map<string, string>();
  for (const e of entries) {
    const key = `${e.jurisdiction}:${e.slugKey}`;
    const withinCollision = slugJurCounts.get(key)! > 1;
    const crossCollision =
      slugWinner.get(e.slugKey) && slugWinner.get(e.slugKey) !== e.jurisdiction;

    let prefix = "";
    if (withinCollision) {
      prefix =
        e.type === "state_law"
          ? e.stateCode || e.jurisdiction
          : e.type === "state_treaty"
          ? "st"
          : e.jurisdiction;
    } else if (crossCollision) {
      prefix = e.jurisdiction;
    }

    result.set(`${e.jurisdiction}/${e.file}`, prefix ? `${prefix}_${e.slugKey}` : e.slugKey);
  }
  return result;
}

export function collectStatutes(): StatuteEntry[] {
  const entries: StatuteEntry[] = [];
  const sources: { jur: Jurisdiction; dir: string; depth: "top" | "one" | "mixed" }[] = [
    { jur: "at", dir: "at", depth: "top" },
    { jur: "de", dir: "de", depth: "top" },
    { jur: "ch", dir: "ch", depth: "top" },
    { jur: "eu", dir: "eu", depth: "top" },
    { jur: "at", dir: "at-staatsvertraege", depth: "top" },
    { jur: "at", dir: "at-landesrecht", depth: "mixed" as const },
  ];

  for (const source of sources) {
    const dir = join(CORPUS_DIR, source.dir);
    if (!existsSync(dir)) {
      console.warn(`  Skipping ${dir} (not found)`);
      continue;
    }

    let files: string[] = [];
    if (source.depth === "top" || source.depth === "mixed") {
      const topFiles = readdirSync(dir)
        .filter((f) => f.endsWith(".md") && !f.startsWith("."))
        .map((f) => `${source.dir}/${f}`);
      files.push(...topFiles);
    }
    if (source.depth === "one" || source.depth === "mixed") {
      const subdirs = readdirSync(dir)
        .filter((d) => !d.startsWith("."))
        .map((d) => join(dir, d))
        .filter((d) => statSync(d).isDirectory());
      for (const subDir of subdirs) {
        const sub = basename(subDir);
        const subFiles = readdirSync(subDir)
          .filter((f) => f.endsWith(".md") && !f.startsWith("."))
          .map((f) => `${source.dir}/${sub}/${f}`);
        files.push(...subFiles);
      }
    }

    for (const file of files) {
      const filePath = join(CORPUS_DIR, file);
      try {
        const text = readFileSync(filePath, "utf8");
        const fm = parseFrontmatter(text);
        if (!fm) {
          console.warn(`  SKIP ${file}: no valid frontmatter`);
          continue;
        }

        let abbr = fm.abbreviation;
        let label = abbr;
        const type = mapMetaType(fm.type, file);
        const stateCode = (fm.state_code || "").toLowerCase();

        if (type === "state_law" && isGenericAbbr(abbr)) {
          const bodyAbbr = extractBodyAbbreviation(text);
          if (bodyAbbr && !isGenericAbbr(bodyAbbr)) {
            abbr = bodyAbbr;
            label = bodyAbbr;
          } else {
            abbr = `${stateCode.toUpperCase()} ${fm.title}`;
            label = `${fm.title} (${stateCode.toUpperCase()})`;
          }
        }

        if (type === "state_treaty" && isGenericAbbr(abbr)) {
          // Prefer the full title for generic treaty abbreviations
          abbr = fm.title;
          label = fm.title;
        }

        const slugKey = slugifyBase(file);
        entries.push({
          slugKey,
          jurisdiction: source.jur,
          label,
          file,
          abbr,
          gesetzesnummer: fm.gesetzesnummer,
          title: fm.title,
          type,
          stateCode,
        });
      } catch (err) {
        console.error(`  ERROR reading ${file}: ${err}`);
      }
    }
  }

  // Resolve slug collisions
  const slugMap = resolveSlugKeys(entries);
  for (const e of entries) {
    e.slugKey = slugMap.get(`${e.jurisdiction}/${e.file}`)!;
  }

  return entries;
}

export interface CollisionResolution {
  entries: StatuteEntry[];
  excluded: { entry: StatuteEntry; reason: string }[];
}

export function resolveCollisions(entries: StatuteEntry[]): CollisionResolution {
  const excluded: { entry: StatuteEntry; reason: string }[] = [];

  // Group by normalized abbreviation + jurisdiction
  const groups = new Map<string, StatuteEntry[]>();
  for (const e of entries) {
    const key = `${e.jurisdiction}:${normalizeAbbr(e.abbr)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  const resolved: StatuteEntry[] = [];

  for (const [, group] of groups) {
    if (group.length === 1) {
      resolved.push(group[0]);
      continue;
    }

    // Deterministic tie-breaker:
    // 1. lowest numeric gesetzesnummer
    // 2. non-statute category (state_treaty before state_law before statute)
    // 3. deterministic file path order
    const sorted = [...group].sort((a, b) => {
      const gnA = parseGesetzesnummer(a.gesetzesnummer);
      const gnB = parseGesetzesnummer(b.gesetzesnummer);
      if (gnA !== gnB) return gnA - gnB;

      const typeOrder = (t: MetaType) =>
        t === "state_treaty" ? 0 : t === "state_law" ? 1 : 2;
      if (typeOrder(a.type) !== typeOrder(b.type)) {
        return typeOrder(a.type) - typeOrder(b.type);
      }

      return a.file.localeCompare(b.file);
    });

    const winner = sorted[0];

    // Build a deterministic label for the winner
    if (winner.gesetzesnummer) {
      winner.label = `${winner.abbr} (${winner.gesetzesnummer})`;
    } else if (winner.type === "state_law" && winner.stateCode) {
      winner.label = `${winner.abbr} (${winner.stateCode.toUpperCase()})`;
    }

    // If the group contained a state_treaty or state_law entry, mark the winner accordingly
    const groupTypes = new Set(group.map((e) => e.type));
    if (groupTypes.has("state_treaty")) winner.type = "state_treaty";
    else if (groupTypes.has("state_law")) winner.type = "state_law";

    resolved.push(winner);

    for (let i = 1; i < sorted.length; i++) {
      excluded.push({
        entry: sorted[i],
        reason: `Ambiguous abbreviation "${sorted[i].abbr}" (${sorted[i].jurisdiction}) — selected "${winner.file}" with gesetzesnummer "${winner.gesetzesnummer}" over "${sorted[i].gesetzesnummer}"`,
      });
    }
  }

  // Cross-jurisdiction label collisions: add jurisdiction suffix
  const labelMap = new Map<string, number>();
  for (const e of resolved) {
    labelMap.set(e.label.toUpperCase(), (labelMap.get(e.label.toUpperCase()) || 0) + 1);
  }
  for (const e of resolved) {
    if (labelMap.get(e.label.toUpperCase())! > 1) {
      e.label = `${e.label} (${e.jurisdiction.toUpperCase()})`;
    }
  }

  // If still duplicated, append slug fragment
  const labelMap2 = new Map<string, number>();
  for (const e of resolved) {
    labelMap2.set(e.label.toUpperCase(), (labelMap2.get(e.label.toUpperCase()) || 0) + 1);
  }
  for (const e of resolved) {
    if (labelMap2.get(e.label.toUpperCase())! > 1) {
      const fragment = e.slugKey.slice(-8);
      e.label = `${e.label} [${fragment}]`;
    }
  }

  return { entries: resolved, excluded };
}

export function generateTypeScript(entries: StatuteEntry[]): string {
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
    '  { jurisdiction: "at" | "de" | "ch" | "eu"; label: string; file: string; type?: "statute" | "state_treaty" | "state_law" }',
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
      const labelEsc = e.label.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const typePart = e.type !== "statute" ? `, type: "${e.type}"` : "";
      lines.push(
        `  "${e.slugKey}": { jurisdiction: "${jur}", label: "${labelEsc}", file: "${e.file}"${typePart} },`
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

function byJurCount(entries: StatuteEntry[], jur: string): number {
  return entries.filter((e) => e.jurisdiction === jur).length;
}

function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  CORPUS_META Generator");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");

  const rawEntries = collectStatutes();
  console.log(`  Collected ${rawEntries.length} statute entries from frontmatter`);

  const { entries: resolved, excluded } = resolveCollisions(rawEntries);

  if (excluded.length > 0) {
    console.error("");
    console.error(`  ⚠️  EXCLUDED (${excluded.length} ambiguous entries):`);
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
  writeFileSync(
    EXCLUDED_REPORT_FILE,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        total_collected: rawEntries.length,
        total_resolved: resolved.length,
        total_excluded: excluded.length,
        excluded: excluded.map(({ entry, reason }) => ({
          file: entry.file,
          label: entry.label,
          abbreviation: entry.abbr,
          jurisdiction: entry.jurisdiction,
          gesetzesnummer: entry.gesetzesnummer,
          reason,
        })),
      },
      null,
      2
    ),
    "utf8"
  );

  console.log("");
  console.log(`  ✅ Written: ${OUTPUT_FILE}`);
  console.log(`  ✅ Excluded report: ${EXCLUDED_REPORT_FILE}`);
  console.log(`  Total entries: ${resolved.length}`);
  console.log(`  Jurisdictions: at=${byJurCount(resolved, "at")}, de=${byJurCount(resolved, "de")}, ch=${byJurCount(resolved, "ch")}, eu=${byJurCount(resolved, "eu")}`);
  console.log("");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
