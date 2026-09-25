// @vitest-environment node
//
// Task notifications go only to the task's own firm: active staff, and for a
// matter's task only to people who may open that matter.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  tasks: [] as Array<Record<string, unknown>>,
  notified: [] as Array<{ userId: string; brainId: string }>,
  matterPage: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/api-handler", () => ({
  createCronHandler: (h: (req: NextRequest) => Promise<Response>) => h,
}));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: (b: string) => ({ "x-subsumio-source": b }),
}));
vi.mock("@/lib/autonomous-queue", () => ({
  fetchPendingTasks: vi.fn(async () => m.tasks),
  markTaskRunning: vi.fn(async () => undefined),
  markTaskCompleted: vi.fn(async () => undefined),
  markTaskFailed: vi.fn(async () => undefined),
  markTaskRequiresApproval: vi.fn(async () => undefined),
  broadcastAutonomousTaskCompleted: vi.fn(),
}));
vi.mock("@/lib/comments", () => ({
  createAutonomousTaskNotification: vi.fn(async (n: { userId: string; brainId: string }) => {
    m.notified.push({ userId: n.userId, brainId: n.brainId });
  }),
}));
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn(), isMailConfigured: () => false }));
vi.mock("@/lib/triage", () => ({ triageMessage: vi.fn() }));
vi.mock("@/lib/webhook-dispatch", () => ({ dispatchWebhookEvent: vi.fn() }));
vi.mock("@/lib/post-upload-outbox", () => ({ enqueuePostUploadTask: vi.fn() }));
vi.mock("@/lib/cron-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cron-utils")>();
  return {
    ...actual,
    getRecipientsByBrain: vi.fn(
      async () =>
        new Map([
          [
            "brain-a",
            [
              { id: "admin", role: "admin" },
              { id: "law", role: "lawyer" },
              { id: "walled", role: "lawyer" },
              { id: "client", role: "client_viewer" },
              { id: "gone", role: "lawyer", deactivatedAt: "2026-01-01" },
            ],
          ],
          ["brain-b", [{ id: "other-firm", role: "admin" }]],
        ])
    ),
  };
});

import { POST } from "./route";

const run = () =>
  (POST as unknown as (r: Request) => Promise<Response>)(
    new Request("http://localhost/api/cron/autonomous-engine")
  );

// An unknown task type fails immediately — the "failed" notice is what we check.
const task = (extra: Record<string, unknown> = {}) => ({
  id: "t1",
  task_type: "unknown_type",
  priority: "normal",
  brain_id: "brain-a",
  title: "Task",
  payload: {},
  attempts: 0,
  next_attempt_at: "",
  status: "pending",
  created_at: "",
  ...extra,
});

beforeEach(() => {
  m.notified.length = 0;
  m.matterPage = {
    slug: "legal/cases/walled",
    frontmatter: { permissions: { blocked_users: ["walled"] } },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).endsWith("/api/pages/legal/cases/walled") && m.matterPage
        ? Response.json(m.matterPage)
        : new Response("unavailable", { status: 503 })
    )
  );
});

describe("cron autonomous-engine — task notifications", () => {
  it("only the task's firm, only active staff, each in the firm's brain", async () => {
    m.tasks = [task()];
    await run();
    expect(m.notified).toEqual([
      { userId: "admin", brainId: "brain-a" },
      { userId: "law", brainId: "brain-a" },
      { userId: "walled", brainId: "brain-a" },
    ]);
  });

  it("a matter's task only reaches people who may open the matter", async () => {
    m.tasks = [task({ case_slug: "legal/cases/walled" })];
    await run();
    expect(m.notified.map((n) => n.userId)).toEqual(["admin", "law"]);
  });

  it("unreadable matter: admins only (fail-closed)", async () => {
    m.matterPage = null;
    m.tasks = [task({ case_slug: "legal/cases/walled" })];
    await run();
    expect(m.notified.map((n) => n.userId)).toEqual(["admin"]);
  });

  it("a task without a firm of its own notifies nobody", async () => {
    m.tasks = [task({ brain_id: "system" })];
    await run();
    expect(m.notified).toEqual([]);
  });
});
