// @vitest-environment node
// A firm member's running timer lives in the firm's brain, not in their
// unused personal workspace — the cron must look there to stop it.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/cron-auth", () => ({ validateCronAuth: async () => null }));
vi.mock("@/lib/realtime-bus", () => ({ broadcastTimeActivityStopped: vi.fn() }));
const logAudit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/audit", () => ({ logAudit }));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({
    list: async () => [
      { id: "member", brainId: "personal-member", orgId: "org-1" },
      { id: "solo", brainId: "brain-solo", orgId: null },
      { id: "gone", brainId: "x", orgId: null, deactivatedAt: "2026-01-01" },
    ],
  }),
}));
vi.mock("@/lib/engine", () => ({
  firmBrainIdFor: async (u: { brainId: string; orgId: string | null }) =>
    u.orgId === "org-1" ? "brain-firm" : u.brainId,
}));

const timers = vi.hoisted(() => ({
  getCurrentActivity: vi.fn(),
  stopCurrentActivity: vi.fn(async () => "entry-1"),
}));
vi.mock("@/lib/time-tracking", async () => {
  const actual = await vi.importActual<typeof import("@/lib/time-tracking")>("@/lib/time-tracking");
  return {
    ...actual,
    getCurrentActivity: timers.getCurrentActivity,
    stopCurrentActivity: timers.stopCurrentActivity,
  };
});

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  const longAgo = new Date(Date.now() - 48 * 3600_000).toISOString();
  timers.getCurrentActivity.mockImplementation(async (brainId: string, userId: string) =>
    brainId === "brain-firm" && userId === "member"
      ? {
          user_id: "member",
          started_at: longAgo,
          last_activity_at: new Date().toISOString(),
          case_slug: "akten/a",
          description: "Schriftsatz",
        }
      : null
  );
});

describe("time-tracking inactivity cron", () => {
  it("looks up a member's timer in the firm brain and stops it at the cap", async () => {
    const res = await GET(new NextRequest("http://x/api/cron/time-tracking/inactivity-check"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checked).toBe(2);
    expect(body.stopped).toBe(1);
    expect(timers.getCurrentActivity).toHaveBeenCalledWith("brain-firm", "member");
    expect(timers.getCurrentActivity).not.toHaveBeenCalledWith("personal-member", "member");
    expect(timers.stopCurrentActivity).toHaveBeenCalledWith(
      "brain-firm",
      "member",
      undefined,
      expect.any(String)
    );
    expect(logAudit).toHaveBeenCalledWith(
      "timer.max_duration",
      "time_entry",
      expect.objectContaining({ brainId: "brain-firm", userId: "member" })
    );
  });
});
