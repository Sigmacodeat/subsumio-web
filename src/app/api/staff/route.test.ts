/* eslint-disable @typescript-eslint/no-explicit-any */
// Personnel files are HR records: only admins write them, and the audit entry
// shows what changed.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 }),
}));
vi.mock("@/lib/engine", async () => ({
  ENGINE_URL: "http://engine.test",
  engineConfigurationResponse: () => null,
  requireEngineContext: vi.fn(),
}));

import { PATCH, POST } from "./route";
import { requireEngineContext } from "@/lib/engine";
import { logAudit } from "@/lib/audit";
import { can, forbidden, type RouteAction } from "@/lib/permissions";

const existing = {
  id: "s1",
  name: "Sam Example",
  email: "sam@kanzlei.example",
  role: "assistenz",
  vacation_days_per_year: 25,
  vacation_carryover_days: 0,
  active: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

// requireEngineContext is where RBAC runs — apply the real rules here.
function as(role: string) {
  const user = { id: "u-" + role, email: `${role}@kanzlei.example`, role, orgId: "org" };
  vi.mocked(requireEngineContext).mockImplementation((async (_req: Request, action: RouteAction) =>
    can(user as any, action)
      ? { headers: {}, brainId: "b", plan: "team", user }
      : forbidden(action)) as any);
}

function req(method: string, body: unknown) {
  return new NextRequest("http://localhost:3000/api/staff", {
    method,
    headers: { "Content-Type": "application/json", "x-csrf-token": "t", cookie: "sb_csrf=t" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(logAudit).mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? Response.json({ ok: true })
        : Response.json({ slug: "legal/staff/s1", frontmatter: existing })
    )
  );
});

describe("/api/staff writes", () => {
  it("an assistant cannot create or change personnel files", async () => {
    as("assistant");
    expect((await POST(req("POST", { name: "X", email: "x@kanzlei.example" }))).status).toBe(403);
    expect(
      (await PATCH(req("PATCH", { id: "s1", member: { ...existing, vacation_days_per_year: 40 } })))
        .status
    ).toBe(403);
  });

  it("an admin change is audited with the values before and after", async () => {
    as("admin");
    const res = await PATCH(
      req("PATCH", { id: "s1", member: { ...existing, vacation_carryover_days: 12 } })
    );
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 0));
    expect(logAudit).toHaveBeenCalledWith(
      "settings.update",
      "staff_member",
      expect.objectContaining({
        entityId: "s1",
        details: { changes: { vacation_carryover_days: { before: 0, after: 12 } } },
      })
    );
  });
});
