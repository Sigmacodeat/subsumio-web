// Named, reusable column-mapping presets for the Kanzlei-Import. A firm that
// imports recurring exports from the same source (e.g. the same practice
// management tool) shouldn't have to re-map columns by hand every time.
//
// Presets are stored as engine pages (type "import_preset", one per firm
// brain — no cross-firm sharing) and map each field key to the SOURCE
// HEADER TEXT, not a column index: exports of the same tool commonly change
// column order (or add/drop columns) between runs, so a stored index would
// silently mismatch. Applying a preset re-resolves each header by exact,
// case-insensitive text match against the current file's headers; a header
// no longer present maps to -1 (unmapped), same as `guessMapping` would.

import { api } from "@/lib/api";
import type { BrainPage } from "@/lib/types";
import type { ColumnMapping, ImportKind } from "./fields";

const PRESET_PAGE_TYPE = "import_preset";

export interface ImportPreset {
  slug: string;
  kind: ImportKind;
  name: string;
  headerMapping: Record<string, string>;
  createdAt: string;
}

function toPreset(page: BrainPage): ImportPreset | null {
  const fm = page.frontmatter ?? {};
  if (typeof fm.kind !== "string" || typeof fm.name !== "string") return null;
  if (!fm.header_mapping || typeof fm.header_mapping !== "object") return null;
  const headerMapping: Record<string, string> = {};
  for (const [k, v] of Object.entries(fm.header_mapping as Record<string, unknown>)) {
    if (typeof v === "string") headerMapping[k] = v;
  }
  return {
    slug: page.slug,
    kind: fm.kind as ImportKind,
    name: fm.name,
    headerMapping,
    createdAt: typeof fm.created_at === "string" ? fm.created_at : "",
  };
}

/** Saved presets for one import kind, newest first. */
export async function listImportPresets(kind: ImportKind): Promise<ImportPreset[]> {
  const pages = await api.brain.listAllPages({
    type: PRESET_PAGE_TYPE,
    frontmatter: { kind },
    max: 100,
  });
  return pages
    .map(toPreset)
    .filter((p): p is ImportPreset => p !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function slugifyName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "vorlage"
  );
}

/** Saves the CURRENT mapping (by header text, resolved against `headers`)
 *  as a named, reusable preset for this import kind. */
export async function saveImportPreset(
  kind: ImportKind,
  name: string,
  headers: string[],
  mapping: ColumnMapping
): Promise<ImportPreset> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Bitte einen Namen für die Import-Vorlage angeben.");
  const headerMapping: Record<string, string> = {};
  for (const [fieldKey, idx] of Object.entries(mapping)) {
    if (idx >= 0 && headers[idx] !== undefined) headerMapping[fieldKey] = headers[idx];
  }
  const createdAt = new Date().toISOString();
  const slug = `import-presets/${kind}-${slugifyName(trimmedName)}-${Date.now()}`;
  await api.brain.createPage({
    slug,
    title: `Import-Vorlage: ${trimmedName}`,
    type: PRESET_PAGE_TYPE,
    frontmatter: {
      kind,
      name: trimmedName,
      header_mapping: headerMapping,
      created_at: createdAt,
    },
  });
  return { slug, kind, name: trimmedName, headerMapping, createdAt };
}

export async function deleteImportPreset(slug: string): Promise<void> {
  await api.brain.deletePage(slug);
}

/** Resolves a preset's header→field mapping against THIS file's actual
 *  headers (exact, case-insensitive text match — never by position). A
 *  header the preset expects but this file doesn't have maps to -1, same
 *  as an unmapped field from `guessMapping`. */
export function applyImportPreset(preset: ImportPreset, headers: string[]): ColumnMapping {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  const mapping: ColumnMapping = {};
  for (const [fieldKey, headerName] of Object.entries(preset.headerMapping)) {
    mapping[fieldKey] = normalized.indexOf(headerName.trim().toLowerCase());
  }
  return mapping;
}
