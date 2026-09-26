import { describe, expect, it } from "vitest";
import { countOpenTasksFor, newTaskAssignments } from "./task-assignment";

describe("newTaskAssignments (W4-08)", () => {
  const stored = [
    { id: "t1", text: "Ladung an Mandantin", done: false },
    { id: "t2", text: "Akt anlegen", done: false, assigneeId: "sek" },
  ];

  it("a task handed to the Sekretariat is a new assignment", () => {
    const incoming = [{ ...stored[0], assigneeId: "sek", dueDate: "2026-09-28" }, stored[1]];
    expect(newTaskAssignments(stored, incoming, "ra")).toEqual([
      { taskId: "t1", text: "Ladung an Mandantin", assigneeId: "sek", dueDate: "2026-09-28" },
    ]);
  });

  it("re-saving an unchanged assignment notifies nobody", () => {
    expect(newTaskAssignments(stored, stored, "ra")).toEqual([]);
  });

  it("assigning to oneself, done tasks and agent tasks are left out", () => {
    const incoming = [
      { id: "t1", text: "x", done: false, assigneeId: "ra" },
      { id: "t3", text: "y", done: true, assigneeId: "sek" },
      { id: "t4", text: "z", done: false, assigneeId: "agent", assigneeType: "agent" },
    ];
    expect(newTaskAssignments(stored, incoming, "ra")).toEqual([]);
  });

  it("a new task that arrives already assigned counts", () => {
    const incoming = [...stored, { id: "t5", text: "Frist eintragen", assigneeId: "sek" }];
    expect(newTaskAssignments(stored, incoming, "ra").map((a) => a.taskId)).toEqual(["t5"]);
  });
});

describe("countOpenTasksFor", () => {
  it("counts open tasks of the person in active matters only", () => {
    const matters = [
      {
        frontmatter: {
          status: "open",
          tasks: [
            { id: "a", done: false, assigneeId: "sek" },
            { id: "b", done: true, assigneeId: "sek" },
            { id: "c", done: false, assigneeId: "ra" },
          ],
        },
      },
      { frontmatter: { status: "archived", tasks: [{ id: "d", done: false, assigneeId: "sek" }] } },
    ];
    expect(countOpenTasksFor(matters, "sek")).toBe(1);
    expect(countOpenTasksFor(matters, "")).toBe(0);
  });
});
