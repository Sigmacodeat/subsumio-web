// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const created: Array<Record<string, unknown>> = [];
const toUser: Array<[string, string, string]> = [];
vi.mock("@/lib/comments", () => ({
  createTaskAssignedNotification: async (o: Record<string, unknown>) => {
    created.push(o);
  },
}));
vi.mock("@/lib/realtime-bus", () => ({
  broadcastSseEventToUser: (b: string, u: string, e: string) => toUser.push([b, u, e]),
}));

import { notifyTaskAssignments } from "./task-assignment-notify";

describe("notifyTaskAssignments (W4-08)", () => {
  it("notifies the assignee and only the assignee's sessions", async () => {
    const n = await notifyTaskAssignments({
      brainId: "b1",
      actor: { id: "ra", name: "RA Muster", email: "ra@k.example" },
      caseSlug: "legal/cases/a",
      caseTitle: "Muster ./. X",
      storedTasks: [{ id: "t1", text: "Ladung an Mandantin", done: false }],
      incomingTasks: [{ id: "t1", text: "Ladung an Mandantin", done: false, assigneeId: "sek" }],
    });
    expect(n).toBe(1);
    expect(created[0]).toMatchObject({
      userId: "sek",
      brainId: "b1",
      caseSlug: "legal/cases/a",
      taskId: "t1",
      taskText: "Ladung an Mandantin",
      assignedBy: "RA Muster",
    });
    expect(toUser).toEqual([["b1", "sek", "notification.created"]]);
  });
});
