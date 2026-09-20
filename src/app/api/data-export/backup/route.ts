import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";

import { logger } from "@/lib/logger";
const log = logger("api/data-export/backup");

export const maxDuration = 300;

/** Pages per engine request (the engine caps a list request at 200). */
const PER_PAGE = 200;
/** Hard ceiling, so one request cannot run forever. */
const MAX_PAGES = 50_000;
/** Page texts are fetched one by one; this many at a time. */
const CONTENT_BATCH = 20;

export const GET = createHandler(
  {
    action: "admin.*",
    rateTier: "heavy",
  },
  async (ctx, _body, _query, _req) => {
    try {
      const allPages: Array<Record<string, unknown>> = [];
      let page = 0;
      const perPage = PER_PAGE;
      let hasMore = true;
      let truncated = false;

      let engineError = false;
      while (hasMore) {
        if (allPages.length >= MAX_PAGES) {
          truncated = true;
          break;
        }
        const res = await fetch(
          `${ENGINE_URL}/api/pages?limit=${perPage}&offset=${page * perPage}`,
          {
            headers: ctx.headers,
            signal: AbortSignal.timeout(30_000),
          }
        );
        if (!res.ok) {
          engineError = true;
          break;
        }
        const raw = await res.json().catch(() => null);
        if (!raw) {
          engineError = true;
          break;
        }
        const pages = Array.isArray(raw)
          ? raw
          : Array.isArray((raw as Record<string, unknown>)?.pages)
            ? (raw as Record<string, unknown[]>).pages
            : [];
        if (pages.length === 0) {
          hasMore = false;
        } else {
          allPages.push(...pages);
          // Stop early if we got fewer than requested — last page
          if (pages.length < perPage) hasMore = false;
          page++;
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
          pages_without_content: missingContent.length,
          complete: !engineError && !truncated && missingContent.length === 0,
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
          ...(missingContent.length > 0
            ? { pages_without_content_slugs: missingContent.slice(0, 200) }
            : {}),
        },
        data: allPages,
      };

      return Response.json(exportData);
    } catch (err) {
      log.error("[backup] failed:", err instanceof Error ? err.message : String(err));
      return apiError("backup_failed", "Backup konnte nicht erstellt werden", 500);
    }
  }
);
