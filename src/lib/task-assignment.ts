/**
 * Aufgaben-Zuweisung: which matter tasks were newly assigned by a write, and
 * how many open tasks a person has. Pure — the page routes do the I/O.
 */

export interface TaskLike {
  id?: unknown;
  text?: unknown;
  done?: unknown;
  dueDate?: unknown;
  assigneeId?: unknown;
  assigneeType?: unknown;
}

export interface NewTaskAssignment {
  taskId: string;
  text: string;
  assigneeId: string;
  dueDate?: string;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asTasks(v: unknown): TaskLike[] {
  return Array.isArray(v)
    ? v.filter((t): t is TaskLike => !!t && typeof t === "object" && !Array.isArray(t))
    : [];
}

/**
 * Open tasks whose assignee changed with this write (or that arrived already
 * assigned) — excluding tasks the writer assigned to themself and agent tasks.
 */
export function newTaskAssignments(
  storedTasks: unknown,
  incomingTasks: unknown,
  actorId: string
): NewTaskAssignment[] {
  const before = new Map<string, string>();
  for (const t of asTasks(storedTasks)) {
    const id = str(t.id);
    if (id) before.set(id, str(t.assigneeId));
  }
  const out: NewTaskAssignment[] = [];
  for (const t of asTasks(incomingTasks)) {
    const id = str(t.id);
    const assignee = str(t.assigneeId);
    if (!id || !assignee || t.done === true) continue;
    if (t.assigneeType === "agent") continue;
    if (assignee === actorId) continue;
    if (before.get(id) === assignee) continue;
    out.push({
      taskId: id,
      text: str(t.text) || "Aufgabe",
      assigneeId: assignee,
      ...(str(t.dueDate) ? { dueDate: str(t.dueDate) } : {}),
    });
  }
  return out;
}

/** Open tasks assigned to `userId` across the given matters' frontmatter. */
export function countOpenTasksFor(
  matters: Array<{ frontmatter?: Record<string, unknown> }>,
  userId: string
): number {
  if (!userId) return 0;
  let n = 0;
  for (const m of matters) {
    const status = str(m.frontmatter?.status).toLowerCase();
    if (status === "archived" || status === "tombstoned") continue;
    for (const t of asTasks(m.frontmatter?.tasks)) {
      if (t.done !== true && str(t.assigneeId) === userId) n++;
    }
  }
  return n;
}
