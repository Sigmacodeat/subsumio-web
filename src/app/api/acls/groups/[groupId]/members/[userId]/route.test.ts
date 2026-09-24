/* eslint-disable @typescript-eslint/no-explicit-any */
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

import { DELETE } from "./route";
import { requireEngineContext } from "@/lib/engine";
import { logAudit } from "@/lib/audit";

function ctxFor(role: string) {
  return {
    headers: { "x-subsumio-source": "brain_a" },
    brainId: "brain_a",
    plan: "team",
    user: { id: "u_admin", email: "admin@kanzlei.example", role, name: "Admin" },
  };
}

function del(groupId: string, userId: string) {
  return DELETE(
    new NextRequest(
      `http://localhost:3000/api/acls/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
      {
        method: "DELETE",
        headers: { "x-csrf-token": "t", cookie: "sb_csrf=t" },
      }
    )
  );
}

describe("DELETE /api/acls/groups/[groupId]/members/[userId]", () => {
  let engineCalls: Array<{ url: string; method?: string }>;
  let engineBody: unknown;

  beforeEach(() => {
    vi.clearAllMocks();
    engineCalls = [];
    engineBody = { success: true };
    vi.mocked(requireEngineContext).mockResolvedValue(ctxFor("admin") as any);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        engineCalls.push({ url: String(url), method: init?.method });
        return new Response(JSON.stringify(engineBody), { status: 200 });
      })
    );
  });

  it("removes the member in the engine and writes an audit entry", async () => {
    const res = await del("wall-1", "user@kanzlei.example");
    expect(res.status).toBe(200);
    expect(engineCalls).toEqual([
      {
        url: "http://engine.test/api/acls/groups/wall-1/members/user%40kanzlei.example",
        method: "DELETE",
      },
    ]);
    expect(logAudit).toHaveBeenCalledWith(
      "acl.remove_member",
      "acl_group",
      expect.objectContaining({
        entityId: "wall-1",
        details: expect.objectContaining({ userId: "user@kanzlei.example" }),
      })
    );
  });

  it("answers 404 when the engine had no such membership", async () => {
    engineBody = { success: false };
    const res = await del("wall-1", "u_missing");
    expect(res.status).toBe(404);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("runs under the admin-only settings.write scope", async () => {
    const { can } = await import("@/lib/permissions");
    expect(can({ role: "admin" } as any, "settings.write")).toBe(true);
    expect(can({ role: "lawyer" } as any, "settings.write")).toBe(false);
  });
});
