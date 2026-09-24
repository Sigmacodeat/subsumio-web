// @vitest-environment node
//
// Autonomous task queue: old pending tasks must not starve behind newer
// completed ones, a task that cannot be claimed must not run, and status
// writes go through the engine's merge-POST (there is no PATCH route).
import { beforeEach, describe, expect, test, vi } from "vitest";

const m = vi.hoisted(() => ({ patch: vi.fn() }));

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: (b: string) => ({ "x-subsumio-source": b }),
  enginePatchPage: (...a: unknown[]) => m.patch(...a),
}));
vi.mock("@/lib/realtime-bus", () => ({
  broadcastAutonomousTaskQueued: vi.fn(),
  broadcastAutonomousTaskCompleted: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import {
  fetchPendingTasks,
  markTaskCompleted,
  markTaskFailed,
  markTaskRunning,
  type AutonomousTask,
} from "./autonomous-queue";

const past = new Date(Date.now() - 3_600_000).toISOString();
const future = new Date(Date.now() + 3_600_000).toISOString();

function task(i: number, over: Partial<AutonomousTask> = {}) {
  return {
    slug: `autonomous-tasks/t${i}`,
    frontmatter: {
      id: `autonomous-tasks/t${i}`,
      task_type: "report_generation",
      priority: "normal",
      brain_id: "b",
      title: `T${i}`,
      payload: {},
      attempts: 0,
      next_attempt_at: past,
      status: "completed",
      created_at: past,
      ...over,
    },
  };
}

const fetchMock = vi.fn();

function engineWith(rows: ReturnType<typeof task>[]) {
  fetchMock.mockImplementation(async (url: string) => {
    const u = new URL(url);
    if (u.pathname !== "/api/pages") return Response.json(rows[0]);
    const offset = Number(u.searchParams.get("offset") ?? 0);
    const limit = Number(u.searchParams.get("limit"));
    return Response.json(rows.slice(offset, offset + limit));
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  m.patch.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("fetchPendingTasks", () => {
  test("finds old pending tasks behind hundreds of newer completed ones", async () => {
    const rows = Array.from({ length: 450 }, (_, i) => task(i));
    rows.push(task(450, { status: "pending", priority: "low" }));
    rows.push(task(451, { status: "pending", priority: "urgent" }));
    engineWith(rows);

    const pending = await fetchPendingTasks("b", 10);
    expect(pending.map((t) => t.id)).toEqual(["autonomous-tasks/t451", "autonomous-tasks/t450"]);
    expect(fetchMock).toHaveBeenCalledTimes(5); // 4 full batches + 1 short
  });

  test("leaves tasks whose retry backoff has not elapsed", async () => {
    engineWith([
      task(1, { status: "pending", next_attempt_at: future }),
      task(2, { status: "pending" }),
    ]);
    const pending = await fetchPendingTasks("b", 10);
    expect(pending.map((t) => t.id)).toEqual(["autonomous-tasks/t2"]);
  });
});

describe("status writes", () => {
  test("claim uses the engine merge-POST and throws when it is refused", async () => {
    m.patch.mockResolvedValueOnce(Response.json({ ok: true }));
    await markTaskRunning("b", "autonomous-tasks/t1");
    expect(m.patch.mock.calls[0]![1]).toMatchObject({
      slug: "autonomous-tasks/t1",
      frontmatter: { status: "running" },
    });

    m.patch.mockResolvedValueOnce(new Response("nope", { status: 404 }));
    await expect(markTaskRunning("b", "autonomous-tasks/t1")).rejects.toThrow(
      /task_claim_failed_404/
    );
  });

  test("a refused completion write is logged, not thrown (no re-run)", async () => {
    m.patch.mockResolvedValueOnce(new Response("busy", { status: 503 }));
    await expect(markTaskCompleted("b", "autonomous-tasks/t1", {})).resolves.toBeUndefined();
  });

  test("a failure schedules a retry with backoff", async () => {
    engineWith([task(1, { status: "running", attempts: 1 })]);
    m.patch.mockResolvedValueOnce(Response.json({ ok: true }));
    await markTaskFailed("b", "autonomous-tasks/t1", "boom");
    expect(m.patch.mock.calls[0]![1]).toMatchObject({
      frontmatter: { status: "pending", attempts: 2, last_error: "boom" },
    });
  });
});
