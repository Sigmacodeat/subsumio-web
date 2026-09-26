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
  async (ctx) => {
    const [all, stats] = await Promise.all([listBackups(), getBackupStats()]);
    // Inside a support session only that firm's backups are listed.
    const backups = ctx.supportSession ? all.filter((b) => b.brainId === ctx.brainId) : all;
    const tenant = ctx.supportSession
      ? { brainId: ctx.brainId, orgName: ctx.supportSession.orgName }
      : null;
    return Response.json({ backups, stats, tenant });
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
      details: {
        triggeredBy: ctx.user.email,
        brainId: ctx.brainId,
        orgName: ctx.supportSession?.orgName ?? null,
      },
    }),
  },
  async (ctx, _body) => {
    // A backup is always one firm's data. Without a support session the
    // operator's context is their own empty workspace — refuse instead of
    // storing an "empty full backup".
    if (!ctx.supportSession) {
      return apiError(
        "support_session_required",
        "Backups nur innerhalb einer Support-Sitzung für eine Kanzlei",
        409
      );
    }
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
      {
        brainId: ctx.brainId,
        orgId: ctx.supportSession.orgId,
        orgName: ctx.supportSession.orgName,
      },
      completeness
    );
    return Response.json({ ok: true, backup: metadata });
  }
);
