import { listEnginePages } from "@/lib/engine-pages";
import { createHandler, apiError } from "@/lib/api-handler";
import { redactPageSecrets } from "@/lib/kanzlei-settings-secrets";

import { logger } from "@/lib/logger";
const log = logger("api/data-export/gdpr");

export const maxDuration = 120;

// Firm-wide portability export (Art. 20) of the firm's records: exercised by the
// firm as controller, i.e. its admins — not by every member. Mirrors the backup route.
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
    try {
      const types = [
        "legal_case",
        "legal_contact",
        "invoice",
        // The pages are written as "legal_deadline"; the old "deadline" type
        // matched nothing, so an export contained no deadlines at all.
        "legal_deadline",
        "deadline",
        "appointment",
        "document",
        "document_draft",
        "time_entry",
        "note",
        "task",
        "shared_item",
        "signature_request",
        "agent_action",
        "audit_log",
        "judgement",
      ];
      const allPages: Array<Record<string, unknown>> = [];

      for (const type of types) {
        // Cursor-paginated + strict: a failed or shortened read must abort the
        // Art.-20 export rather than ship a silently incomplete archive
        // (pre-fix a filtered/short batch looked like "end of list").
        const pages = await listEnginePages(ctx.headers, type, 50_000, {
          strict: true,
          timeoutMs: 30_000,
          includeTombstoned: true,
        });
        allPages.push(...(pages as unknown as Array<Record<string, unknown>>));
      }

      const exportData = {
        export_metadata: {
          generated_at: new Date().toISOString(),
          user_id: ctx.user.id,
          user_email: ctx.user.email,
          format: "JSON",
          legal_basis: "GDPR Art. 20",
          description: "Structured, commonly used, machine-readable format per GDPR Art. 20",
        },
        data: redactPageSecrets(allPages),
        statistics: {
          total_pages: allPages.length,
          by_type: allPages.reduce((acc: Record<string, number>, p) => {
            const t = String(p.type || "unknown");
            acc[t] = (acc[t] || 0) + 1;
            return acc;
          }, {}),
        },
      };

      return Response.json(exportData);
    } catch (err) {
      log.error("[gdpr-export] failed:", err instanceof Error ? err.message : String(err));
      return apiError("export_failed", "Datenexport fehlgeschlagen", 500);
    }
  }
);
