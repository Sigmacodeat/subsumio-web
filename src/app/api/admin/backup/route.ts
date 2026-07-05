import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { listBackups, createBackup, getBackupStats, type BackupMetadata } from "@/lib/backup";
import { z } from "zod";

export const maxDuration = 120;

export const GET = createHandler(
  {
    action: "admin.*",
    rateTier: "standard",
  },
  async (_ctx) => {
    const [backups, stats] = await Promise.all([listBackups(), getBackupStats()]);
    return Response.json({ backups, stats });
  }
);

const postSchema = z.object({
  confirm: z.boolean().refine((v) => v === true, "confirmation_required"),
});

export const POST = createHandler(
  {
    action: "admin.*",
    rateTier: "heavy",
    body: postSchema,
  },
  async (ctx, _body) => {
    // Fetch all pages from the engine
    const allPages: Array<Record<string, unknown>> = [];
    let page = 0;
    const perPage = 100;
    let hasMore = true;

    while (hasMore && page < 100) {
      const res = await fetch(`${ENGINE_URL}/api/pages?limit=${perPage}&offset=${page * perPage}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        return apiError("engine_error", "Failed to fetch pages from engine", 502);
      }
      const raw = await res.json();
      const pages = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as Record<string, unknown>)?.pages)
          ? (raw as Record<string, unknown[]>).pages
          : [];
      if (pages.length === 0) {
        hasMore = false;
      } else {
        allPages.push(...pages);
        page++;
      }
    }

    const metadata: BackupMetadata = await createBackup(allPages, ctx.user.email);
    return Response.json({ ok: true, backup: metadata });
  }
);
