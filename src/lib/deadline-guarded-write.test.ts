// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPatch, mockAudit } = vi.hoisted(() => ({
  mockPatch: vi.fn(),
  mockAudit: vi.fn(async () => undefined),
}));

vi.mock("@/lib/audit", () => ({ logAudit: mockAudit, SYSTEM_BRAIN: "system" }));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  enginePatchPage: (...args: unknown[]) => mockPatch(...args),
}));

import { completeDeadlineAfterFiling, writeDeadlineGuarded } from "./deadline-guarded-write";
import { guardDeadlineWrite } from "./deadline-write-policy";

let stored: Record<string, unknown> | null;

beforeEach(() => {
  vi.clearAllMocks();
  mockPatch.mockResolvedValue(Response.json({ success: true }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      stored ? Response.json(stored) : Response.json({ error: "nf" }, { status: 404 })
    )
  );
});

const assistant = { id: "u-a", email: "a@kanzlei.example", name: "Assistenz", role: "assistant" };
const ctx = { headers: {}, user: assistant, brainId: "brain-1" };

const notfrist = (extra: Record<string, unknown> = {}) => ({
  slug: "legal/deadlines/berufung",
  type: "legal_deadline",
  frontmatter: {
    title: "Berufung",
    status: "pending",
    is_notfrist: true,
    due_date: "2026-10-05",
    created_by_id: "u-l",
    version: 3,
    ...extra,
  },
});

describe("guardDeadlineWrite", () => {
  it("refuses completing a Notfrist inside a matter without second check", () => {
    const current = {
      type: "legal_case",
      frontmatter: { deadlines: [{ id: "d1", title: "Klage", is_notfrist: true, status: "open" }] },
    };
    const res = guardDeadlineWrite({
      slug: "legal/cases/m1",
      type: "legal_case",
      incoming: { deadlines: [{ id: "d1", title: "Klage", is_notfrist: true, status: "done" }] },
      current,
      user: assistant,
    });
    expect("reject" in res && res.reject.error).toBe("notfrist_second_check_required");
  });

  it("drops client-sent second-check stamps", () => {
    const res = guardDeadlineWrite({
      slug: "legal/deadlines/x",
      type: "legal_deadline",
      incoming: { status: "done", second_check_by: "Fake", second_check_at: "2026-09-26" },
      current: notfrist(),
      user: assistant,
    });
    expect("reject" in res && res.reject.error).toBe("notfrist_second_check_required");
  });
});

describe("writeDeadlineGuarded", () => {
  it("does not complete a Notfrist and writes nothing", async () => {
    stored = notfrist();
    const res = await writeDeadlineGuarded(ctx, "legal/deadlines/berufung", { status: "done" });
    expect(res.ok).toBe(false);
    expect(!res.ok && res.rejection.error).toBe("notfrist_second_check_required");
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("completes an ordinary deadline with stamps, version and audit", async () => {
    stored = notfrist({ is_notfrist: false });
    const res = await writeDeadlineGuarded(ctx, "legal/deadlines/berufung", { status: "done" });
    expect(res.ok).toBe(true);
    const fm = mockPatch.mock.calls[0][1].frontmatter;
    expect(fm.status).toBe("done");
    expect(fm.completed_by_id).toBe("u-a");
    expect(fm.version).toBe(4);
    expect(fm.audit_log.at(-1)).toMatchObject({ action: "complete", actor_id: "u-a" });
    expect(mockAudit).toHaveBeenCalled();
  });

  it("refuses a matter slug (would close the matter instead of the deadline)", async () => {
    stored = { slug: "legal/cases/m1", type: "legal_case", frontmatter: { status: "open" } };
    const res = await writeDeadlineGuarded(ctx, "legal/cases/m1", { status: "done" });
    expect(!res.ok && res.rejection.error).toBe("not_a_deadline");
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("fails closed when the stored page cannot be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("x", { status: 500 }))
    );
    const res = await writeDeadlineGuarded(ctx, "legal/deadlines/berufung", { status: "done" });
    expect(!res.ok && res.rejection.error).toBe("guard_unavailable");
    expect(mockPatch).not.toHaveBeenCalled();
  });
});

describe("completeDeadlineAfterFiling (beA)", () => {
  it("records the filing on a Notfrist but leaves it open for the second check", async () => {
    stored = notfrist();
    const out = await completeDeadlineAfterFiling(ctx, "legal/deadlines/berufung", {
      filing_id: "F-1",
    });
    expect(out).toEqual({ updated: true, second_check_required: true });
    expect(mockPatch).toHaveBeenCalledTimes(1);
    const fm = mockPatch.mock.calls[0][1].frontmatter;
    expect(fm.status).toBeUndefined();
    expect(fm.filing_status).toBe("submitted");
    expect(fm.filing_id).toBe("F-1");
  });

  it("completes an ordinary deadline", async () => {
    stored = notfrist({ is_notfrist: false });
    const out = await completeDeadlineAfterFiling(ctx, "legal/deadlines/berufung", {
      filing_id: "F-1",
    });
    expect(out).toEqual({ updated: true, second_check_required: false });
    expect(mockPatch.mock.calls[0][1].frontmatter.status).toBe("done");
  });
});
