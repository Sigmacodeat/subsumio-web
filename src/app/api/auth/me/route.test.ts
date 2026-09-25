/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const update = vi.fn();
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({ update, countReferrals: vi.fn(async () => 0) }),
  toPublic: (u: unknown) => u,
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), SYSTEM_BRAIN: "system" }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 }),
  clientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/engine", async () => ({
  ENGINE_URL: "http://engine.test",
  engineConfigurationResponse: () => null,
  requireEngineContext: vi.fn(),
  recordQuota: vi.fn(),
}));

import { PATCH } from "./route";
import { requireEngineContext } from "@/lib/engine";

function ctxFor(role: string) {
  return {
    headers: { "x-subsumio-source": "brain_a" },
    brainId: "brain_a",
    plan: "team",
    user: { id: "u1", email: "u1@kanzlei.example", role, name: "Alt" },
  };
}

function patch(body: unknown) {
  return PATCH(
    new NextRequest("http://localhost:3000/api/auth/me", {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-csrf-token": "t", cookie: "sb_csrf=t" },
      body: JSON.stringify(body),
    })
  );
}

describe("PATCH /api/auth/me — eigenes Profil (SEC-15)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    update.mockImplementation(async (id: string, p: object) => ({ id, ...p }));
  });

  it.each(["lawyer", "assistant", "admin"])("role %s may change its own name", async (role) => {
    vi.mocked(requireEngineContext).mockResolvedValue(ctxFor(role) as any);
    const res = await patch({ name: "Neu" });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith("u1", { name: "Neu" });
  });

  it("only ever updates the caller's own record", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue(ctxFor("lawyer") as any);
    await patch({ name: "Neu", id: "someone-else" });
    expect(update.mock.calls[0][0]).toBe("u1");
  });
});
