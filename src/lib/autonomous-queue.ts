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

import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
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
  | "report_generation"; // Report generieren

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
  limit: number = 20
): Promise<AutonomousTask[]> {
  const headers = engineHeadersForBrain(brainId);
  const params = new URLSearchParams({
    type: "autonomous_task",
    limit: String(limit * 3), // Fetch more to filter by priority
  });

  const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    return [];
  }

  const data = await res.json();
  const pages = (Array.isArray(data) ? data : (data.pages ?? [])) as Array<{
    slug: string;
    frontmatter: AutonomousTask;
  }>;

  // Filter pending tasks and sort by priority
  const pending = pages
    .filter((p) => p.frontmatter.status === "pending")
    .map((p) => p.frontmatter)
    .sort((a, b) => {
      // First by priority (descending)
      const priorityDiff = PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      // Then by next_attempt_at (ascending)
      return new Date(a.next_attempt_at).getTime() - new Date(b.next_attempt_at).getTime();
    });

  return pending.slice(0, limit);
}

/**
 * Mark task as running and update started_at.
 */
export async function markTaskRunning(brainId: string, taskId: string): Promise<void> {
  const headers = {
    ...engineHeadersForBrain(brainId),
    "Content-Type": "application/json",
  };

  await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(taskId)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      frontmatter: {
        status: "running",
        started_at: new Date().toISOString(),
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });
}

/**
 * Mark task as completed with result.
 */
export async function markTaskCompleted(
  brainId: string,
  taskId: string,
  result?: Record<string, unknown>
): Promise<void> {
  const headers = {
    ...engineHeadersForBrain(brainId),
    "Content-Type": "application/json",
  };

  await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(taskId)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      frontmatter: {
        status: "completed",
        completed_at: new Date().toISOString(),
        result,
      },
    }),
    signal: AbortSignal.timeout(10_000),
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
  const headers = {
    ...engineHeadersForBrain(brainId),
    "Content-Type": "application/json",
  };

  // Fetch current task to check attempts
  const getRes = await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(taskId)}`, {
    headers,
    signal: AbortSignal.timeout(5_000),
  });

  if (!getRes.ok) {
    throw new Error(`task_fetch_failed_${getRes.status}`);
  }

  const task = (await getRes.json()) as { frontmatter: AutonomousTask };
  const attempts = task.frontmatter.attempts + 1;

  if (attempts >= MAX_ATTEMPTS) {
    // Mark as exhausted
    await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(taskId)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        frontmatter: {
          status: "failed",
          attempts,
          last_error: error,
          completed_at: new Date().toISOString(),
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } else {
    // Retry with exponential backoff
    const backoffMs = Math.min(1000 * 2 ** attempts, 60_000); // Max 60s
    const nextAttemptAt = new Date(Date.now() + backoffMs).toISOString();

    await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(taskId)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        frontmatter: {
          status: "pending",
          attempts,
          last_error: error,
          next_attempt_at: nextAttemptAt,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
  }
}

/**
 * Mark task as requiring human approval.
 */
export async function markTaskRequiresApproval(
  brainId: string,
  taskId: string,
  result?: Record<string, unknown>
): Promise<void> {
  const headers = {
    ...engineHeadersForBrain(brainId),
    "Content-Type": "application/json",
  };

  await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(taskId)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      frontmatter: {
        status: "requires_approval",
        result,
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });
}

/**
 * Get task queue stats.
 */
export async function getQueueStats(brainId: string): Promise<{
  pending: number;
  running: number;
  completed: number;
  failed: number;
  requires_approval: number;
  by_priority: Record<TaskPriority, number>;
}> {
  const headers = engineHeadersForBrain(brainId);
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
