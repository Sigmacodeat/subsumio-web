/**
 * Server side of the task assignment: after a matter write, notify every
 * person who was newly assigned an open task. Best effort — the write has
 * already succeeded; a lost notification is logged, never an error.
 */
import { newTaskAssignments } from "@/lib/task-assignment";
import { broadcastSseEventToUser } from "@/lib/realtime-bus";
import { logger } from "@/lib/logger";

const log = logger("lib/task-assignment-notify");

export async function notifyTaskAssignments(input: {
  brainId: string;
  actor: { id: string; name?: string | null; email: string };
  caseSlug: string;
  caseTitle?: string;
  storedTasks: unknown;
  incomingTasks: unknown;
}): Promise<number> {
  const assignments = newTaskAssignments(input.storedTasks, input.incomingTasks, input.actor.id);
  if (assignments.length === 0) return 0;
  let sent = 0;
  try {
    const { createTaskAssignedNotification } = await import("@/lib/comments");
    for (const a of assignments) {
      await createTaskAssignedNotification({
        userId: a.assigneeId,
        brainId: input.brainId,
        caseSlug: input.caseSlug,
        caseTitle: input.caseTitle,
        taskId: a.taskId,
        taskText: a.text,
        dueDate: a.dueDate,
        assignedBy: input.actor.name || input.actor.email,
      });
      sent++;
      // Only the assignee's open sessions refresh their bell.
      broadcastSseEventToUser(input.brainId, a.assigneeId, "notification.created", {
        kind: "task_assigned",
        case_slug: input.caseSlug,
      });
    }
  } catch (err) {
    log.warn("task assignment notification failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return sent;
}
