/**
 * Gap 11: Batch Document Editing — Bulk-Edit über mehrere Dokumente.
 *
 * Harvey-Feature: "Modify documents in bulk — replace terms, add clauses,
 * remove sections across hundreds of documents at once."
 *
 * Subsumio-Status vor Gap 11: Keine Bulk-Edit-Funktionalität.
 *
 * Dieses Modul bietet:
 * - BatchOperation: Typen von Bulk-Operationen (replace, tag, delete, move)
 * - executeBatch(): Führt eine Operation auf mehreren Pages aus
 * - BatchResult: Ergebnis pro Page mit Success/Error-Status
 * - Dry-Run-Modus: Zeigt was geändert würde ohne es zu tun
 * - API-Endpoint für Frontend
 */

import { ENGINE_URL } from "@/lib/engine";

export type BatchOperationType =
  | "replace_text" // Text ersetzen in compiled_truth
  | "add_tag" // Tag hinzufügen
  | "remove_tag" // Tag entfernen
  | "update_frontmatter" // Frontmatter-Feld aktualisieren
  | "delete_pages" // Pages löschen
  | "change_type"; // Page-Type ändern

export interface BatchOperation {
  type: BatchOperationType;
  /** Target page slugs */
  slugs: string[];
  /** For replace_text: search string */
  search?: string;
  /** For replace_text: replacement string */
  replacement?: string;
  /** For add_tag/remove_tag: tag name */
  tag?: string;
  /** For update_frontmatter: key-value pairs */
  frontmatter_updates?: Record<string, unknown>;
  /** For change_type: new type */
  new_type?: string;
  /** Dry run — return what would change without modifying */
  dry_run?: boolean;
}

export interface BatchPageResult {
  slug: string;
  success: boolean;
  error?: string;
  changes_made?: number;
  preview?: string;
}

export interface BatchResult {
  operation: BatchOperationType;
  total: number;
  succeeded: number;
  failed: number;
  dry_run: boolean;
  results: BatchPageResult[];
  duration_ms: number;
}

/**
 * Execute a batch operation on multiple pages.
 */
export async function executeBatch(
  op: BatchOperation,
  authHeaders: Record<string, string>
): Promise<BatchResult> {
  const start = Date.now();
  const results: BatchPageResult[] = [];
  const dryRun = op.dry_run ?? false;

  for (const slug of op.slugs) {
    try {
      const result = await executeOnPage(slug, op, authHeaders, dryRun);
      results.push(result);
    } catch (err) {
      results.push({
        slug,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.length - succeeded;

  return {
    operation: op.type,
    total: results.length,
    succeeded,
    failed,
    dry_run: dryRun,
    results,
    duration_ms: Date.now() - start,
  };
}

async function executeOnPage(
  slug: string,
  op: BatchOperation,
  authHeaders: Record<string, string>,
  dryRun: boolean
): Promise<BatchPageResult> {
  // Fetch the page
  const fetchRes = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
    headers: { ...authHeaders, "Content-Type": "application/json" },
  });
  if (!fetchRes.ok) {
    return { slug, success: false, error: `Fetch failed: ${fetchRes.status}` };
  }
  const page = await fetchRes.json();
  const content = String(page.compiled_truth ?? page.content ?? "");
  const frontmatter = (page.frontmatter ?? {}) as Record<string, unknown>;
  const tags = Array.isArray(page.tags) ? page.tags : [];
  const type = String(page.type ?? "page");

  let updatedContent = content;
  let updatedFrontmatter = frontmatter;
  let updatedTags = tags;
  let updatedType = type;
  let changesMade = 0;

  switch (op.type) {
    case "replace_text": {
      if (!op.search) return { slug, success: false, error: "search is required for replace_text" };
      const replacement = op.replacement ?? "";
      const occurrences = countOccurrences(updatedContent, op.search);
      if (occurrences === 0) {
        return {
          slug,
          success: true,
          changes_made: 0,
          preview: dryRun ? "No matches found" : undefined,
        };
      }
      updatedContent = updatedContent.split(op.search).join(replacement);
      changesMade = occurrences;
      break;
    }

    case "add_tag": {
      if (!op.tag) return { slug, success: false, error: "tag is required for add_tag" };
      if (updatedTags.includes(op.tag)) {
        return {
          slug,
          success: true,
          changes_made: 0,
          preview: dryRun ? "Tag already present" : undefined,
        };
      }
      updatedTags = [...updatedTags, op.tag];
      changesMade = 1;
      break;
    }

    case "remove_tag": {
      if (!op.tag) return { slug, success: false, error: "tag is required for remove_tag" };
      if (!updatedTags.includes(op.tag)) {
        return {
          slug,
          success: true,
          changes_made: 0,
          preview: dryRun ? "Tag not present" : undefined,
        };
      }
      updatedTags = updatedTags.filter((t: string) => t !== op.tag);
      changesMade = 1;
      break;
    }

    case "update_frontmatter": {
      if (!op.frontmatter_updates) {
        return { slug, success: false, error: "frontmatter_updates is required" };
      }
      updatedFrontmatter = { ...updatedFrontmatter, ...op.frontmatter_updates };
      changesMade = Object.keys(op.frontmatter_updates).length;
      break;
    }

    case "change_type": {
      if (!op.new_type)
        return { slug, success: false, error: "new_type is required for change_type" };
      if (updatedType === op.new_type) {
        return {
          slug,
          success: true,
          changes_made: 0,
          preview: dryRun ? "Type already set" : undefined,
        };
      }
      updatedType = op.new_type;
      changesMade = 1;
      break;
    }

    case "delete_pages": {
      if (dryRun) {
        return { slug, success: true, changes_made: 1, preview: "Would delete this page" };
      }
      const delRes = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      return {
        slug,
        success: delRes.ok,
        changes_made: delRes.ok ? 1 : 0,
        error: delRes.ok ? undefined : `Delete failed: ${delRes.status}`,
      };
    }

    default:
      return { slug, success: false, error: `Unknown operation type: ${op.type}` };
  }

  // Dry run — return preview without saving
  if (dryRun) {
    let preview: string | undefined;
    if (op.type === "replace_text" && changesMade > 0) {
      const firstMatch = updatedContent.indexOf(op.replacement ?? "");
      if (firstMatch >= 0) {
        const start = Math.max(0, firstMatch - 50);
        const end = Math.min(
          updatedContent.length,
          firstMatch + (op.replacement?.length ?? 0) + 50
        );
        preview = `...${updatedContent.slice(start, end)}...`;
      }
    }
    return { slug, success: true, changes_made: changesMade, preview };
  }

  // Save updated page
  const updateBody: Record<string, unknown> = {
    slug,
    content: updatedContent,
    frontmatter: updatedFrontmatter,
    tags: updatedTags,
    type: updatedType,
  };

  const updateRes = await fetch(`${ENGINE_URL}/api/pages`, {
    method: "PUT",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(updateBody),
  });

  return {
    slug,
    success: updateRes.ok,
    changes_made: changesMade,
    error: updateRes.ok ? undefined : `Update failed: ${updateRes.status}`,
  };
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}
