/**
 * Autonomous Task Priority Queue — Brain-basierte Task Queue mit Priorisierung.
 *
 * Erweitert das post-upload-outbox Pattern für autonome Sachbearbeitungs-Tasks.
 * Tasks werden als Brain Pages (type="autonomous_task") persistiert, überleben
 * Container-Restarts und werden mit Priorität (urgent > normal > low) verarbeitet.
 *
 * Priority Queue Logic:
 * - urgent: Sofortige Ausführung (Frist-Alerts, kritische Aktionen)
 * - normal: Standard-Ausführung (Routine-Tasks)
 * - low: Hintergrund-Ausführung (Analyse, Reports)
 *
 * Retry mit exponentiellem Backoff (MAX_ATTEMPTS=4).
 */

import { ENGINE_URL, engineHeadersForBrain, enginePatchPage } from "@/lib/engine";
import { ENGINE_LIST_MAX } from "@/lib/engine-pages";
import { logger } from "@/lib/logger";
import { createHash } from "node:crypto";
import {
  broadcastAutonomousTaskQueued as broadcastQueued,
  broadcastAutonomousTaskCompleted as broadcastCompleted,
} from "@/lib/realtime-bus";

export type AutonomousTaskType =
  | "deadline_followup" // Frist-Alert Follow-up
  | "inbox_triage" // E-Mail Triage
  | "document_analysis" // Dokument-Analyse
  | "workflow_start" // Workflow autonom starten
  | "email_draft" // E-Mail Entwurf generieren
  | "client_update" // Mandanten-Update generieren
  | "report_generation" // Report generieren
  | "legal_draft_generation"; // Schriftsatz im Hintergrund generieren

export type TaskPriority = "urgent" | "normal" | "low";

export interface AutonomousTask {
  id: string;
  task_type: AutonomousTaskType;
  priority: TaskPriority;
  brain_id: string;
  case_slug?: string;
  title: string;
  payload: Record<string, unknown>;
  attempts: number;
  next_attempt_at: string;
  status: "pending" | "running" | "completed" | "failed" | "requires_approval";
  last_error?: string;
  result?: Record<string, unknown>;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export const MAX_ATTEMPTS = 4;

/** Safety stop for the pending-task scan (pages of 100). */
const PENDING_SCAN_CAP = 10_000;

const log = logger("autonomous-queue");

// Priority ordering (higher number = higher priority)
const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 3,
  normal: 2,
  low: 1,
};

function taskSlug(taskType: AutonomousTaskType, caseSlug: string | undefined): string {
  const casePart = caseSlug ? `-${caseSlug.replace(/[^a-z0-9-]/gi, "-").slice(0, 32)}` : "";
  const timestamp = Date.now().toString(36);
  const hash = createHash("sha256")
    .update(`${taskType}${caseSlug}${timestamp}`)
    .digest("hex")
    .slice(0, 8);
  return `autonomous-tasks/${taskType}${casePart}-${hash}`;
}

function encodeSlug(slug: string): string {
  return slug.split("/").map(encodeURIComponent).join("/");
}

/**
 * Enqueue an autonomous task with priority.
 */
export async function enqueueAutonomousTask(
  task: Omit<AutonomousTask, "id" | "attempts" | "next_attempt_at" | "status" | "created_at">
): Promise<string> {
  const id = taskSlug(task.task_type, task.case_slug);
  const headers = {
    ...engineHeadersForBrain(task.brain_id),
    "Content-Type": "application/json",
  };

  const payload: AutonomousTask = {
    ...task,
    id,
    attempts: 0,
    next_attempt_at: new Date().toISOString(),
    status: "pending",
    created_at: new Date().toISOString(),
  };

  const create = await fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      slug: id,
      title: task.title,
      type: "autonomous_task",
      frontmatter: payload,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!create.ok) {
    throw new Error(
      `autonomous_task_create_failed_${create.status}: ${(await create.text()).slice(0, 300)}`
    );
  }

  return id;
}

/**
 * Fetch pending tasks ordered by priority (urgent > normal > low).
 */
export async function fetchPendingTasks(
  brainId: string,
  limit: number = 20,
  now: Date = new Date()
): Promise<AutonomousTask[]> {
  const headers = engineHeadersForBrain(brainId);

  // The engine lists by last update and cannot filter on frontmatter, so the
  // queue is paged until every task has been seen. Taking only the 30 most
  // recently updated tasks starved old pending ones behind newer completed
  // ones — they were never run. Tasks whose retry backoff has not elapsed yet
  // are left for a later run.
  const pending: AutonomousTask[] = [];
  for (let offset = 0; offset < PENDING_SCAN_CAP; offset += ENGINE_LIST_MAX) {
    const params = new URLSearchParams({
      type: "autonomous_task",
      limit: String(ENGINE_LIST_MAX),
      offset: String(offset),
    });
    let res: Response;
    try {
      res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      break;
    }
    if (!res.ok) break;

    const data = (await res.json()) as unknown;
    const pages = (
      Array.isArray(data) ? data : ((data as { pages?: unknown[] })?.pages ?? [])
    ) as Array<{ slug: string; frontmatter?: AutonomousTask }>;

    for (const p of pages) {
      const fm = p.frontmatter;
      if (fm?.status !== "pending") continue;
      const due = Date.parse(fm.next_attempt_at ?? "");
      if (Number.isFinite(due) && due > now.getTime()) continue;
      // Older task pages may lack `id`; the slug is the task id.
      pending.push({ ...fm, id: fm.id || p.slug });
    }
    if (pages.length < ENGINE_LIST_MAX) break;
  }

  // Sort by priority
  const sorted = pending.sort((a, b) => {
    // First by priority (descending)
    const priorityDiff = PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];
    if (priorityDiff !== 0) return priorityDiff;
    // Then by next_attempt_at (ascending)
    return new Date(a.next_attempt_at).getTime() - new Date(b.next_attempt_at).getTime();
  });

  return sorted.slice(0, limit);
}

/**
 * Merge task frontmatter fields on the engine. The engine has NO `PATCH`
 * route for pages (see enginePatchPage): the previous `PATCH /api/pages/…`
 * calls 404'd silently, so no status transition was ever persisted and a
 * task stayed `pending` forever.
 */
async function writeTaskFields(
  brainId: string,
  taskId: string,
  frontmatter: Record<string, unknown>
): Promise<Response> {
  return enginePatchPage(
    engineHeadersForBrain(brainId),
    { slug: taskId, frontmatter },
    { timeoutMs: 10_000 }
  );
}

/** Best-effort status write: a failure is logged, never thrown. */
async function writeTaskFieldsLogged(
  brainId: string,
  taskId: string,
  frontmatter: Record<string, unknown>
): Promise<void> {
  try {
    const res = await writeTaskFields(brainId, taskId, frontmatter);
    if (!res.ok) {
      log.warn("autonomous task status write failed", {
        taskId,
        status: String(frontmatter.status),
        http: res.status,
      });
    }
  } catch (err) {
    log.warn("autonomous task status write failed", {
      taskId,
      status: String(frontmatter.status),
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Claim a task: mark it running and set started_at. Throws when the engine
 * does not accept the write — the caller must NOT execute a task it could not
 * claim (the next run would pick it up again and execute it twice).
 */
export async function markTaskRunning(brainId: string, taskId: string): Promise<void> {
  const res = await writeTaskFields(brainId, taskId, {
    status: "running",
    started_at: new Date().toISOString(),
  });
  if (!res.ok) {
    throw new Error(`task_claim_failed_${res.status}`);
  }
}

/**
 * Mark task as completed with result. Never throws: the task already ran, and
 * a thrown error here would send it down the retry path and run it again.
 */
export async function markTaskCompleted(
  brainId: string,
  taskId: string,
  result?: Record<string, unknown>
): Promise<void> {
  await writeTaskFieldsLogged(brainId, taskId, {
    status: "completed",
    completed_at: new Date().toISOString(),
    result,
  });
}

/**
 * Mark task as failed with retry or exhausted.
 */
export async function markTaskFailed(
  brainId: string,
  taskId: string,
  error: string
): Promise<void> {
  const headers = engineHeadersForBrain(brainId);

  // Fetch current task to check attempts
  const getRes = await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(taskId)}`, {
    headers,
    signal: AbortSignal.timeout(5_000),
  });

  if (!getRes.ok) {
    throw new Error(`task_fetch_failed_${getRes.status}`);
  }

  const task = (await getRes.json()) as { frontmatter?: AutonomousTask };
  const attempts = (Number(task.frontmatter?.attempts) || 0) + 1;

  if (attempts >= MAX_ATTEMPTS) {
    // Mark as exhausted
    await writeTaskFieldsLogged(brainId, taskId, {
      status: "failed",
      attempts,
      last_error: error,
      completed_at: new Date().toISOString(),
    });
  } else {
    // Retry with exponential backoff
    const backoffMs = Math.min(1000 * 2 ** attempts, 60_000); // Max 60s
    const nextAttemptAt = new Date(Date.now() + backoffMs).toISOString();

    await writeTaskFieldsLogged(brainId, taskId, {
      status: "pending",
      attempts,
      last_error: error,
      next_attempt_at: nextAttemptAt,
    });
  }
}

/**
 * Mark task as requiring human approval. Never throws (see markTaskCompleted).
 */
export async function markTaskRequiresApproval(
  brainId: string,
  taskId: string,
  result?: Record<string, unknown>
): Promise<void> {
  await writeTaskFieldsLogged(brainId, taskId, {
    status: "requires_approval",
    result,
  });
}

/**
 * Get task queue stats.
 */
export async function getQueueStats(
  brainId: string,
  /** The signed-in caller's `ctx.headers`, so walled matters' tasks are not counted. */
  callerHeaders?: Record<string, string>
): Promise<{
  pending: number;
  running: number;
  completed: number;
  failed: number;
  requires_approval: number;
  by_priority: Record<TaskPriority, number>;
}> {
  const headers = callerHeaders ?? engineHeadersForBrain(brainId);
  const params = new URLSearchParams({ type: "autonomous_task", limit: "500" });

  const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    return {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      requires_approval: 0,
      by_priority: { urgent: 0, normal: 0, low: 0 },
    };
  }

  const data = await res.json();
  const pages = (Array.isArray(data) ? data : (data.pages ?? [])) as Array<{
    frontmatter: AutonomousTask;
  }>;

  const stats = {
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    requires_approval: 0,
    by_priority: { urgent: 0, normal: 0, low: 0 } as Record<TaskPriority, number>,
  };

  for (const page of pages) {
    const fm = page.frontmatter;
    stats[fm.status]++;
    if (fm.status === "pending") {
      stats.by_priority[fm.priority]++;
    }
  }

  return stats;
}

// Re-exports for SSE broadcast helpers
export const broadcastAutonomousTaskQueued = broadcastQueued;
export const broadcastAutonomousTaskCompleted = broadcastCompleted;
