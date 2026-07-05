interface SseConnection {
  brainId: string;
  send: (event: string, data: unknown) => void;
}

const sseConnections = new Set<SseConnection>();

export function addSseConnection(conn: SseConnection): void {
  sseConnections.add(conn);
}

export function removeSseConnection(conn: SseConnection): void {
  sseConnections.delete(conn);
}

export function broadcastSseEvent(brainId: string, event: string, data: unknown): void {
  for (const conn of sseConnections) {
    if (conn.brainId === brainId) conn.send(event, data);
  }
}

export function getSseConnectionCount(): number {
  return sseConnections.size;
}

// ── Autonomous Event Broadcast Helpers ─────────────────────────────────────

export function broadcastDeadlineAlert(
  brainId: string,
  data: {
    caseSlug: string;
    deadlineId: string;
    urgency: "urgent" | "warning" | "normal";
    dueDate: string;
  }
): void {
  broadcastSseEvent(brainId, "deadline.alert", data);
}

export function broadcastInboxTriage(
  brainId: string,
  data: {
    messageId: string;
    subject: string;
    urgency: "urgent" | "normal" | "low";
    suggestedAction: string;
  }
): void {
  broadcastSseEvent(brainId, "inbox.triage", data);
}

export function broadcastDocumentUploaded(
  brainId: string,
  data: {
    caseSlug: string;
    documentId: string;
    filename: string;
    fileType: string;
  }
): void {
  broadcastSseEvent(brainId, "document.uploaded", data);
}

export function broadcastAutonomousTaskQueued(
  brainId: string,
  data: {
    taskId: string;
    taskType: string;
    priority: "urgent" | "normal" | "low";
    caseSlug?: string;
  }
): void {
  broadcastSseEvent(brainId, "autonomous.task_queued", data);
}

export function broadcastAutonomousTaskCompleted(
  brainId: string,
  data: {
    taskId: string;
    status: "completed" | "failed" | "requires_approval";
    result?: Record<string, unknown>;
  }
): void {
  broadcastSseEvent(brainId, "autonomous.task_completed", data);
}

// ── User Activity & Time Tracking Broadcast Helpers ───────────────────────

export function broadcastUserActivity(
  brainId: string,
  data: {
    userId: string;
    activityType: string;
    caseSlug?: string;
    description: string;
  }
): void {
  broadcastSseEvent(brainId, `user.activity.${data.activityType}`, data);
}

export function broadcastTimeEntryCreated(
  brainId: string,
  data: {
    entryId: string;
    userId: string;
    description: string;
    minutes: number;
  }
): void {
  broadcastSseEvent(brainId, "time.entry.created", data);
}

export function broadcastTimeEntryUpdated(
  brainId: string,
  data: {
    entryId: string;
    userId: string;
  }
): void {
  broadcastSseEvent(brainId, "time.entry.updated", data);
}

export function broadcastTimeEntryDeleted(
  brainId: string,
  data: {
    entryId: string;
    userId: string;
  }
): void {
  broadcastSseEvent(brainId, "time.entry.deleted", data);
}

export function broadcastTimeActivityStarted(
  brainId: string,
  data: {
    userId: string;
    activityType: string;
    description: string;
  }
): void {
  broadcastSseEvent(brainId, "time.activity.started", data);
}

export function broadcastTimeActivityStopped(
  brainId: string,
  data: {
    userId: string;
    entryId?: string;
  }
): void {
  broadcastSseEvent(brainId, "time.activity.stopped", data);
}
