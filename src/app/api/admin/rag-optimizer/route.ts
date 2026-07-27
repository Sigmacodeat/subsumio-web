import { spawn } from "node:child_process";
import { join } from "node:path";
import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import type { AuditAction } from "@/lib/audit";
import {
  getActiveOptimizationRun,
  getOptimizationRun,
  getOptimizationRuns,
  getSweepConfigs,
} from "@/lib/rag-optimizer-store";

export const maxDuration = 20;

const SCRIPT = join(process.cwd(), "server/scripts/run-rag-optimizer.ts");

function spawnOptimizer(args: string[]): Promise<{ pid: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn("bun", [SCRIPT, ...args], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env },
    });
    child.on("error", reject);
    child.unref();
    // Give the process a moment to start before returning; if it fails immediately, report it.
    child.on("spawn", () => resolve({ pid: child.pid ?? -1 }));
  });
}

const postBodySchema = z.object({
  action: z.enum(["baseline", "auto", "sweep", "apply", "rollback"]),
  baselineId: z.number().optional(),
  runId: z.number().optional(),
  sweepConfig: z.string().optional(),
});

export const POST = createHandler(
  {
    action: "admin.*",
    rateTier: "heavy",
    body: postBodySchema,
    audit: (_ctx, body) => ({
      action: "admin.rag_optimizer" as unknown as AuditAction,
      entityType: "rag_optimization",
      details: { action: body.action, runId: body.runId, baselineId: body.baselineId },
    }),
  },
  async (_ctx, body) => {
    const args: string[] = [`--${body.action}`];

    if (body.action === "sweep") {
      if (body.baselineId == null) {
        return apiError("missing_baseline", "baselineId ist für Sweep erforderlich", 400);
      }
      args.push(String(body.baselineId));
      if (body.sweepConfig) {
        args.push("--config", body.sweepConfig);
      }
    }
    if (body.action === "apply" || body.action === "rollback") {
      if (body.runId == null) {
        return apiError("missing_run_id", "runId ist für apply/rollback erforderlich", 400);
      }
      args.push(String(body.runId));
    }

    try {
      const { pid } = await spawnOptimizer(args);
      return apiSuccess({ launched: true, action: body.action, pid });
    } catch (err) {
      console.error(
        "[rag-optimizer] spawn failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("spawn_failed", "Hintergrundjob konnte nicht gestartet werden", 500);
    }
  }
);

const getQuerySchema = z.object({
  type: z.enum(["history", "active", "sweep-configs"]).default("history"),
  limit: z.coerce.number().default(20),
  runId: z.coerce.number().optional(),
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
      if (query.runId != null) {
        const run = await getOptimizationRun(query.runId);
        return apiSuccess({ run });
      }
      if (query.type === "history") {
        const runs = await getOptimizationRuns({ limit: query.limit });
        return apiSuccess({ runs });
      }
      if (query.type === "active") {
        const run = await getActiveOptimizationRun();
        return apiSuccess({ active: run });
      }
      const configs = await getSweepConfigs();
      return apiSuccess({ sweepConfigs: configs });
    } catch (err) {
      console.error(
        "[rag-optimizer] GET failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError(
        "rag_optimizer_read_failed",
        "RAG-Optimizer-Daten konnten nicht geladen werden",
        500
      );
    }
  }
);
