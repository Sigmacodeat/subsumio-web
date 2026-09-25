import { listEnginePages } from "@/lib/engine-pages";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";
import { redactPageSecrets } from "@/lib/kanzlei-settings-secrets";

import { logger } from "@/lib/logger";
const log = logger("api/data-export/gdpr");

export const maxDuration = 300;

/** Upper bound for the export; reaching it is reported as `truncated`. */
const MAX_PAGES = 100_000;
/** Page texts are read one by one (listings carry no text), in small batches. */
const CONTENT_BATCH = 10;

/**
 * Firm-wide portability export (Art. 20 DSGVO) of the firm's records:
 * exercised by the firm as controller, i.e. its admins — not by every member.
 * Mirrors the backup route: every record of every type (no hand-kept type
 * list that silently misses new record types such as matter notes or
 * document requests), with its text. A failed listing aborts; a text that
 * cannot be read is named, and `complete` says whether anything is missing.
 */
export const GET = createHandler(
  {
    action: "admin.data_export",
    rateTier: "heavy",
    audit: (ctx) => ({
      action: "admin.data_export" as const,
      entityType: "brain",
      entityId: ctx.brainId,
      details: { scope: "firm_portability_export" },
    }),
  },
  async (ctx, _body, _query, _req) => {
    let listed: Array<Record<string, unknown>>;
    try {
      // All types ("" = no type filter), cursor-paginated and strict: a failed
      // or shortened read aborts instead of shipping a silently partial export.
      listed = (await listEnginePages(ctx.headers, "", MAX_PAGES, {
        strict: true,
        timeoutMs: 30_000,
        includeTombstoned: true,
      })) as unknown as Array<Record<string, unknown>>;
    } catch (err) {
      log.error("[gdpr-export] listing failed:", err instanceof Error ? err.message : String(err));
      return apiError("export_failed", "Datenexport fehlgeschlagen", 500);
    }
    const truncated = listed.length >= MAX_PAGES;

    const pagesWithoutContent: string[] = [];
    for (let i = 0; i < listed.length; i += CONTENT_BATCH) {
      await Promise.all(
        listed.slice(i, i + CONTENT_BATCH).map(async (entry) => {
          const slug = typeof entry.slug === "string" ? entry.slug : "";
          if (!slug) return;
          try {
            const res = await fetch(
              `${ENGINE_URL}/api/pages/${slug.split("/").map(encodeURIComponent).join("/")}`,
              { headers: ctx.headers, signal: AbortSignal.timeout(20_000) }
            );
            if (!res.ok) {
              pagesWithoutContent.push(slug);
              return;
            }
            const full = (await res.json()) as Record<string, unknown> | null;
            entry.content = full && typeof full.content === "string" ? full.content : "";
          } catch {
            pagesWithoutContent.push(slug);
          }
        })
      );
    }

    const complete = !truncated && pagesWithoutContent.length === 0;
    const exportData = {
      export_metadata: {
        generated_at: new Date().toISOString(),
        user_id: ctx.user.id,
        user_email: ctx.user.email,
        format: "JSON",
        legal_basis: "DSGVO Art. 20",
        description:
          "Strukturierter, gängiger und maschinenlesbarer Export aller Einträge der Kanzlei samt Texten (Art. 20 DSGVO)",
        complete,
        total_pages: listed.length,
        pages_without_content: pagesWithoutContent.length,
        ...(pagesWithoutContent.length > 0
          ? {
              pages_without_content_slugs: pagesWithoutContent.slice(0, 200),
              content_warning: `Bei ${pagesWithoutContent.length.toLocaleString("de-AT")} Einträgen konnte der Text nicht gelesen werden — der Export ist unvollständig.`,
            }
          : {}),
        ...(truncated
          ? {
              truncated: true,
              truncated_warning: `Export bei ${MAX_PAGES.toLocaleString("de-AT")} Einträgen abgeschnitten. Bitte wenden Sie sich an den Support für eine vollständige Ausleitung.`,
            }
          : {}),
      },
      // Settings secrets (SMTP password) never leave in an export file.
      data: redactPageSecrets(listed),
      statistics: {
        total_pages: listed.length,
        by_type: listed.reduce((acc: Record<string, number>, p) => {
          const t = String(p.type || "unknown");
          acc[t] = (acc[t] || 0) + 1;
          return acc;
        }, {}),
      },
    };

    return Response.json(exportData);
  }
);
