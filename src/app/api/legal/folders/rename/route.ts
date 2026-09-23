import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain, enginePatchPage } from "@/lib/engine";
import { withKeyedLock } from "@/lib/keyed-lock";
import { logger } from "@/lib/logger";

const log = logger("api/legal/folders/rename");

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/legal/folders/rename
 *
 * Atomar wirkender Prefix-Rename für Dokumenten-Ordner: statt N
 * Einzel-PATCHes aus dem Client prüft der Server pro Seite, ob
 * `frontmatter.folder` wirklich unter `from` hängt (exact oder
 * `from/…`), und schreibt den neuen Pfad. Client-seitige Angabe der
 * Slug-Liste begrenzt den Scope — der Server verifiziert trotzdem.
 */
const schema = z.object({
  slugs: z.array(z.string().min(1).max(500)).min(1).max(500),
  from: z.string().min(1).max(500),
  to: z.string().min(1).max(500),
});

function encodeSlug(slug: string): string {
  return slug.split("/").map(encodeURIComponent).join("/");
}

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    body: schema,
    audit: (ctx, body) => ({
      action: "case.update" as const,
      entityType: "folder",
      entityId: `${body.from}→${body.to}`,
      details: { brainId: ctx.brainId, slugs: body.slugs.length },
    }),
  },
  async (ctx, body) => {
    const headers = engineHeadersForBrain(ctx.brainId);
    const from = body.from;
    const to = body.to;

    if (to === from || to.startsWith(`${from}/`)) {
      return apiError("invalid_target", "Zielordner darf nicht im Quellordner liegen", 400);
    }

    const moved: string[] = [];
    const failed: string[] = [];
    const skipped: string[] = [];

    try {
      await withKeyedLock(`folder-rename:${ctx.brainId}:${from}`, async () => {
        for (const slug of body.slugs) {
          try {
            const getRes = await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(slug)}`, {
              headers,
              signal: AbortSignal.timeout(10_000),
            });
            if (!getRes.ok) {
              failed.push(slug);
              continue;
            }
            const page = (await getRes.json()) as { frontmatter?: Record<string, unknown> };
            const folder = String(page.frontmatter?.folder ?? "");
            if (folder !== from && !folder.startsWith(`${from}/`)) {
              skipped.push(slug);
              continue;
            }
            const next = `${to}${folder.slice(from.length)}`;
            const res = await enginePatchPage(headers, {
              slug,
              frontmatter: { folder: next },
            });
            if (res.ok) moved.push(slug);
            else failed.push(slug);
          } catch {
            failed.push(slug);
          }
        }
      });
    } catch (err) {
      log.error("[folders/rename] failed:", err instanceof Error ? err.message : String(err));
      return apiError("rename_failed", "Ordner konnte nicht umbenannt werden", 500);
    }

    return apiSuccess({
      moved: moved.length,
      failed: failed.length,
      skipped: skipped.length,
      moved_slugs: moved,
      failed_slugs: failed,
    });
  }
);
