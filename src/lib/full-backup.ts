/**
 * Collects every entry of a brain with its text for a full backup.
 *
 * The engine's list endpoint answers at most `ENGINE_LIST_MAX` rows per
 * request and returns metadata only (`content` is always empty), so the
 * listing is paged until an empty batch and each text is fetched per page.
 * Nothing is dropped silently: the result says whether the backup is
 * complete, whether it was cut off at `maxPages`, and which entries came
 * without text.
 */
import { ENGINE_URL } from "@/lib/engine";
import { ENGINE_LIST_MAX } from "@/lib/engine-pages";

/** Default ceiling, so one backup run cannot grow without bound. */
export const FULL_BACKUP_MAX_PAGES = 50_000;
/** Page texts are fetched one by one; this many at a time. */
const CONTENT_BATCH = 20;
/** At most this many slugs without text are named in the metadata. */
const MISSING_SLUGS_LISTED = 200;

export interface FullBackupCompleteness {
  total_pages: number;
  expected_pages: number | null;
  pages_without_content: number;
  complete: boolean;
  truncated: boolean;
  engine_error: boolean;
  warning?: string;
  truncated_warning?: string;
  count_warning?: string;
  pages_without_content_slugs?: string[];
}

export interface FullBackupResult {
  pages: Array<Record<string, unknown>>;
  completeness: FullBackupCompleteness;
}

export interface FullBackupOptions {
  maxPages?: number;
}

export async function collectFullBackup(
  headers: Record<string, string>,
  opts: FullBackupOptions = {}
): Promise<FullBackupResult> {
  const maxPages = opts.maxPages ?? FULL_BACKUP_MAX_PAGES;
  const expectedTotal = await readExpectedTotal(headers);

  const seen = new Set<string>();
  const pages: Array<Record<string, unknown>> = [];
  let truncated = false;
  let engineError = false;

  // A batch can come back shorter than requested while more pages follow
  // (entries the caller may not see are dropped after the limit), so only an
  // empty batch ends the listing.
  for (let offset = 0; ; offset += ENGINE_LIST_MAX) {
    if (pages.length >= maxPages || offset >= maxPages * 2) {
      truncated = true;
      break;
    }
    let raw: unknown = null;
    try {
      const res = await fetch(`${ENGINE_URL}/api/pages?limit=${ENGINE_LIST_MAX}&offset=${offset}`, {
        headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) raw = await res.json().catch(() => null);
    } catch {
      raw = null;
    }
    if (!raw) {
      engineError = true;
      break;
    }
    const batch = (
      Array.isArray(raw)
        ? raw
        : Array.isArray((raw as Record<string, unknown>)?.pages)
          ? (raw as Record<string, unknown[]>).pages
          : []
    ) as Array<Record<string, unknown>>;
    if (batch.length === 0) break;
    for (const entry of batch) {
      if (pages.length >= maxPages) {
        truncated = true;
        break;
      }
      const slug = typeof entry?.slug === "string" ? entry.slug : "";
      // Entries edited during the run move in the listing; keep each once.
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      pages.push(entry);
    }
    if (truncated) break;
  }

  const missingContent: string[] = [];
  for (let i = 0; i < pages.length; i += CONTENT_BATCH) {
    await Promise.all(
      pages.slice(i, i + CONTENT_BATCH).map(async (entry) => {
        const slug = entry.slug as string;
        try {
          const res = await fetch(
            `${ENGINE_URL}/api/pages/${slug.split("/").map(encodeURIComponent).join("/")}`,
            { headers, signal: AbortSignal.timeout(20_000) }
          );
          if (!res.ok) {
            missingContent.push(slug);
            return;
          }
          const full = (await res.json().catch(() => null)) as Record<string, unknown> | null;
          // Only a failed read is "Text nicht lesbar". An entry whose text is
          // deliberately empty (a contact, a frontmatter-only record) is
          // backed up as it is.
          if (!full || typeof full !== "object") {
            missingContent.push(slug);
            return;
          }
          if (typeof full.content === "string") entry.content = full.content;
          else if (full.content === undefined || full.content === null) entry.content = "";
          else missingContent.push(slug);
        } catch {
          missingContent.push(slug);
        }
      })
    );
  }

  const countMismatch = expectedTotal !== null && pages.length !== expectedTotal;
  const completeness: FullBackupCompleteness = {
    total_pages: pages.length,
    expected_pages: expectedTotal,
    pages_without_content: missingContent.length,
    complete:
      !engineError &&
      !truncated &&
      missingContent.length === 0 &&
      expectedTotal !== null &&
      !countMismatch,
    truncated,
    engine_error: engineError,
    ...(engineError
      ? { warning: "Sicherung ist unvollständig — die Engine war währenddessen nicht erreichbar" }
      : {}),
    ...(truncated
      ? {
          truncated_warning: `Sicherung bei ${maxPages.toLocaleString("de-AT")} Einträgen abgeschnitten.`,
        }
      : {}),
    ...(!engineError && expectedTotal === null
      ? {
          count_warning:
            "Die Gesamtzahl der Einträge war nicht abrufbar — ob die Sicherung vollständig ist, konnte nicht geprüft werden",
        }
      : {}),
    ...(!engineError && countMismatch
      ? {
          count_warning: `Sicherung enthält ${pages.length.toLocaleString("de-AT")} von ${expectedTotal!.toLocaleString("de-AT")} Einträgen`,
        }
      : {}),
    ...(missingContent.length > 0
      ? { pages_without_content_slugs: missingContent.slice(0, MISSING_SLUGS_LISTED) }
      : {}),
  };
  return { pages, completeness };
}

/** Entry count of the brain from the engine's stats, or null when unavailable. */
async function readExpectedTotal(headers: Record<string, string>): Promise<number | null> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/stats`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const stats = (await res.json()) as { total_pages?: unknown; page_count?: unknown } | null;
    const n = Number(stats?.total_pages ?? stats?.page_count);
    return Number.isInteger(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}
