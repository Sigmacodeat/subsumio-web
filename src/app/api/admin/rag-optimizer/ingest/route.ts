import { spawn } from "node:child_process";
import { join } from "node:path";
import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { getIngestQueue } from "@/lib/rag-optimizer-store";
import type { AuditAction } from "@/lib/audit";

export const maxDuration = 20;

const SCRIPT = join(process.cwd(), "server/scripts/auto-rag-ops.ts");

function spawnAutoOps(args: string[]): Promise<{ pid: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn("bun", [SCRIPT, ...args], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env },
    });
    child.on("error", reject);
    child.unref();
    child.on("spawn", () => resolve({ pid: child.pid ?? -1 }));
  });
}

const postBodySchema = z.object({
  optimize: z.boolean().default(false),
});

export const POST = createHandler(
  {
    action: "admin.*",
    rateTier: "heavy",
    body: postBodySchema,
    audit: (_ctx, body) => ({
      action: "admin.rag_optimizer" as unknown as AuditAction,
      entityType: "law_ingestion_queue",
      details: { optimize: body.optimize },
    }),
  },
  async (_ctx, body) => {
    try {
      const args = body.optimize ? ["--optimize"] : [];
      const { pid } = await spawnAutoOps(args);
      return apiSuccess({ launched: true, pid, optimize: body.optimize });
    } catch (err) {
      console.error(
        "[rag-optimizer/ingest] spawn failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("spawn_failed", "Auto-Ingestion konnte nicht gestartet werden", 500);
    }
  }
);

const getQuerySchema = z.object({
  limit: z.coerce.number().default(50),
});

export const GET = createHandler(
  {
    action: "admin.*",
    rateTier: "standard",
    query: getQuerySchema,
    cacheMaxAge: 10,
  },
  async (_ctx, _body, query) => {
    try {
      const queue = await getIngestQueue(query.limit);
      return apiSuccess({ queue });
    } catch (err) {
      console.error(
        "[rag-optimizer/ingest] GET failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("ingest_queue_failed", "Ingest-Queue konnte nicht geladen werden", 500);
    }
  }
);
