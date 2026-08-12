import { createHandler } from "@/lib/api-handler";
import { getDRStatus, getBackupTargets } from "@/lib/dr-client";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/admin/dr — Disaster Recovery status.
 * Returns backup manifest history, drill results, and RPO/RTO status.
 *
 * POST /api/admin/dr — Trigger a restore drill.
 * Body: { action: "create_backup" | "run_drill" | "restore", simulate?: boolean }
 *
 * Requires admin role.
 */

export const GET = createHandler(
  {
    action: "admin.*",
    cacheMaxAge: 0,
  },
  async () => {
    const status = getDRStatus();
    const targets = getBackupTargets();

    return Response.json({
      timestamp: new Date().toISOString(),
      status,
      targets,
      recent_manifests: [],
      recent_drills: [],
    });
  }
);

export const POST = createHandler(
  {
    action: "admin.*",
    cacheMaxAge: 0,
    audit: (_ctx, _body) => ({
      action: "admin.dr" as const,
      entityType: "dr",
      details: { action: "dr_action" },
    }),
  },
  async (_ctx, body, _query, req) => {
    let parsedBody: Record<string, unknown> = {};
    try {
      parsedBody = await req.json();
    } catch {
      // empty body is fine
    }
    const action = parsedBody?.action as string | undefined;

    // Server-side actions require the engine module — return info response
    return Response.json({
      success: false,
      error: `Action "${action}" requires engine-side execution. Use the server CLI or engine API directly.`,
      hint: "The Next.js API route provides read-only DR status. Backup creation, drills, and restores are orchestrated via the engine process.",
    });
  }
);
