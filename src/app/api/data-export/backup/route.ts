import { ENGINE_URL } from "@/lib/engine";
import { ENGINE_LIST_MAX } from "@/lib/engine-pages";
import { createHandler, apiError } from "@/lib/api-handler";
import { redactPageSecrets } from "@/lib/kanzlei-settings-secrets";

import { logger } from "@/lib/logger";
const log = logger("api/data-export/backup");

export const maxDuration = 300;

/** Pages per engine request — the engine answers a list request with at most this many. */
const PER_PAGE = ENGINE_LIST_MAX;
/** Hard ceiling, so one request cannot run forever. */
const MAX_PAGES = 50_000;
/** Page texts are fetched one by one; this many at a time. */
const CONTENT_BATCH = 20;

export const GET = createHandler(
  {
    action: "admin.*",
    rateTier: "heavy",
    // The whole firm's records leave the system: always in the audit trail.
    audit: (ctx) => ({
      action: "admin.data_export" as const,
      entityType: "brain",
      entityId: ctx.brainId,
      details: { scope: "full_backup" },
    }),
  },
  async (ctx, _body, _query, _req) => {
    try {
      // How many entries the brain holds — the backup is only complete when
      // it holds exactly that many. Without the number, completeness cannot
      // be confirmed and the backup is marked incomplete.
      const expectedTotal = await readExpectedTotal(ctx.headers);

      const bySlug = new Map<string, Record<string, unknown>>();
      const allPages: Array<Record<string, unknown>> = [];
      let truncated = false;
      let engineError = false;

      // A batch can come back shorter than requested while more pages follow
      // (the engine drops entries the caller may not see after the limit is
      // applied), so only an empty batch ends the listing.
      for (let offset = 0; ; offset += PER_PAGE) {
        if (allPages.length >= MAX_PAGES || offset >= MAX_PAGES * 2) {
          truncated = true;
          break;
        }
        const res = await fetch(`${ENGINE_URL}/api/pages?limit=${PER_PAGE}&offset=${offset}`, {
          headers: ctx.headers,
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) {
          engineError = true;
          break;
        }
        const raw = await res.json().catch(() => null);
        if (!raw) {
          engineError = true;
          break;
        }
        const pages = (
          Array.isArray(raw)
            ? raw
            : Array.isArray((raw as Record<string, unknown>)?.pages)
              ? (raw as Record<string, unknown[]>).pages
              : []
        ) as Array<Record<string, unknown>>;
        if (pages.length === 0) break;
        for (const entry of pages) {
          const slug = typeof entry?.slug === "string" ? entry.slug : "";
          // Entries edited during the backup move in the listing; keep each once.
          if (!slug || bySlug.has(slug)) continue;
          bySlug.set(slug, entry);
          allPages.push(entry);
        }
      }

      if (engineError && allPages.length === 0) {
        return apiError(
          "backup_failed",
          "Engine nicht erreichbar, Backup konnte nicht erstellt werden",
          503
        );
      }

      // The list endpoint returns metadata only (content is always empty), so a
      // backup made from it held no document texts at all. The texts are
      // fetched per page, in small batches, and a page whose text cannot be
      // read is named in the metadata instead of silently losing its content.
      const missingContent: string[] = [];
      for (let i = 0; i < allPages.length; i += CONTENT_BATCH) {
        const batch = allPages.slice(i, i + CONTENT_BATCH);
        await Promise.all(
          batch.map(async (entry) => {
            const slug = typeof entry.slug === "string" ? entry.slug : "";
            if (!slug) return;
            try {
              const res = await fetch(
                `${ENGINE_URL}/api/pages/${slug.split("/").map(encodeURIComponent).join("/")}`,
                { headers: ctx.headers, signal: AbortSignal.timeout(20_000) }
              );
              if (!res.ok) {
                missingContent.push(slug);
                return;
              }
              const full = (await res.json()) as Record<string, unknown> | null;
              const content = full && typeof full.content === "string" ? full.content : "";
              if (content) entry.content = content;
              else missingContent.push(slug);
            } catch {
              missingContent.push(slug);
            }
          })
        );
      }

      const exportData = {
        export_metadata: {
          type: "full_backup",
          generated_at: new Date().toISOString(),
          user_id: ctx.user.id,
          user_email: ctx.user.email,
          total_pages: allPages.length,
          expected_pages: expectedTotal,
          pages_without_content: missingContent.length,
          complete:
            !engineError &&
            !truncated &&
            missingContent.length === 0 &&
            expectedTotal !== null &&
            allPages.length === expectedTotal,
          format: "JSON",
          description:
            "Sicherung aller Einträge des Kanzleiwissens samt Texten — für Umzug oder Archivierung",
          ...(engineError
            ? {
                warning:
                  "Sicherung ist unvollständig — die Engine war währenddessen nicht erreichbar",
              }
            : {}),
          ...(truncated
            ? {
                truncated_warning: `Sicherung bei ${MAX_PAGES.toLocaleString("de-AT")} Einträgen abgeschnitten. Bitte wenden Sie sich an den Support für eine vollständige Ausleitung.`,
              }
            : {}),
          ...(!engineError && expectedTotal === null
            ? {
                count_warning:
                  "Die Gesamtzahl der Einträge war nicht abrufbar — ob die Sicherung vollständig ist, konnte nicht geprüft werden",
              }
            : {}),
          ...(!engineError && expectedTotal !== null && allPages.length !== expectedTotal
            ? {
                count_warning: `Sicherung enthält ${allPages.length.toLocaleString("de-AT")} von ${expectedTotal.toLocaleString("de-AT")} Einträgen`,
              }
            : {}),
          ...(missingContent.length > 0
            ? { pages_without_content_slugs: missingContent.slice(0, 200) }
            : {}),
        },
        // Settings secrets (SMTP password) never leave in a backup file.
        data: redactPageSecrets(allPages),
      };

      return Response.json(exportData);
    } catch (err) {
      log.error("[backup] failed:", err instanceof Error ? err.message : String(err));
      return apiError("backup_failed", "Backup konnte nicht erstellt werden", 500);
    }
  }
);

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
