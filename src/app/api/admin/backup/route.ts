import { createHandler, apiError } from "@/lib/api-handler";
import { collectFullBackup } from "@/lib/full-backup";
import { redactPageSecrets } from "@/lib/kanzlei-settings-secrets";
import { listBackups, createBackup, getBackupStats, type BackupMetadata } from "@/lib/backup";
import { z } from "zod";

export const maxDuration = 300;

export const GET = createHandler(
  {
    action: "platform.operator",
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
    action: "platform.operator",
    rateTier: "heavy",
    body: postSchema,
    audit: (ctx) => ({
      action: "admin.backup" as const,
      entityType: "backup",
      details: { triggeredBy: ctx.user.email },
    }),
  },
  async (ctx, _body) => {
    // Every entry with its text; the result says whether anything is missing.
    const { pages: allPages, completeness } = await collectFullBackup(ctx.headers);
    if (completeness.engine_error && allPages.length === 0) {
      return apiError(
        "engine_error",
        "Engine nicht erreichbar, Backup konnte nicht erstellt werden",
        502
      );
    }

    // Settings secrets (SMTP password) are not written into backup files.
    const metadata: BackupMetadata = await createBackup(
      redactPageSecrets(allPages),
      ctx.user.email,
      completeness
    );
    return Response.json({ ok: true, backup: metadata });
  }
);
