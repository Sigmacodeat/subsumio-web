import { describe, expect, it } from "vitest";
import {
  applyAgentTaskResult,
  buildAgentTaskPrompt,
  collectPendingAgentTasks,
  markAgentTaskFailed,
} from "./agent-tasks";
import type { TaskEntry } from "./legal-types";

const baseTask = (over: Partial<TaskEntry> = {}): TaskEntry => ({
  id: "t1",
  text: "Recherche zu § 6 ZPO",
  done: false,
  createdAt: "2026-09-22T08:00:00Z",
  ...over,
});

describe("collectPendingAgentTasks", () => {
  it("sammelt nur pending Agent-Tasks", () => {
    const pages = [
      {
        slug: "cases/mueller",
        title: "Müller ./. Huber",
        frontmatter: {
          tasks: [
            baseTask({ assigneeType: "agent", agentStatus: "pending" }),
            baseTask({ id: "t2", assigneeType: "user", assigneeId: "u1" }),
            baseTask({ id: "t3", assigneeType: "agent", agentStatus: "needs_review" }),
            baseTask({ id: "t4", assigneeType: "agent", agentStatus: "pending", done: true }),
          ],
        },
      },
      { slug: "cases/leer", title: "Leer", frontmatter: {} },
      { slug: "cases/kein-array", frontmatter: { tasks: "kein-array" } },
    ];
    const pending = collectPendingAgentTasks(pages);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.task.id).toBe("t1");
    expect(pending[0]?.caseSlug).toBe("cases/mueller");
  });
});

describe("buildAgentTaskPrompt", () => {
  it("enthält Aktenkontext und Aufgabe", () => {
    const { system, prompt } = buildAgentTaskPrompt(baseTask(), {
      slug: "cases/mueller",
      title: "Müller ./. Huber",
      content: "Sachverhalt: Rücktritt vom Kaufvertrag.",
      frontmatter: { client_name: "Müller", legal_area: "Zivilrecht" },
    });
    expect(prompt).toContain("Müller ./. Huber");
    expect(prompt).toContain("Recherche zu § 6 ZPO");
    expect(prompt).toContain("Rücktritt");
    expect(system).toContain("Anwalt"); // Prüf-Vorbehalt im Systemprompt
  });
});

describe("applyAgentTaskResult", () => {
  it("setzt needs_review + Ergebnis, lässt andere Tasks unberührt", () => {
    const tasks = [
      baseTask({ assigneeType: "agent", agentStatus: "pending" }),
      baseTask({ id: "t2", text: "Andere" }),
    ];
    const updated = applyAgentTaskResult(tasks, "t1", "Ergebnis-Text");
    expect(updated[0]?.agentStatus).toBe("needs_review");
    expect(updated[0]?.agentResult).toBe("Ergebnis-Text");
    expect(updated[1]?.agentStatus).toBeUndefined();
  });

  it("kappt überlange Ergebnisse", () => {
    const updated = applyAgentTaskResult(
      [baseTask({ assigneeType: "agent", agentStatus: "pending" })],
      "t1",
      "x".repeat(20_000)
    );
    expect(updated[0]?.agentResult).toHaveLength(8_000);
  });
});

describe("markAgentTaskFailed", () => {
  it("stellt den Task zurück auf pending", () => {
    const tasks = [baseTask({ assigneeType: "agent", agentStatus: "needs_review" })];
    expect(markAgentTaskFailed(tasks, "t1")[0]?.agentStatus).toBe("pending");
  });
});
