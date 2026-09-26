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

const ORG = { id: "org_a", name: "Kanzlei A", brainId: "brain_org_a", ownerId: "admin_1" };
// In-memory support-session store (no Postgres pool).
vi.mock("@/lib/auth/store", () => ({
  getSharedPgPool: () => null,
  getOrgStore: () => ({ getById: async (id: string) => (id === ORG.id ? ORG : null) }),
  getStore: () => ({ getById: async () => null }),
}));

import { DELETE, GET, POST } from "./route";
import { requireEngineContext } from "@/lib/engine";
import { logAudit } from "@/lib/audit";
import {
  getActiveSupportGrant,
  getActiveSupportSession,
  startSupportSession,
} from "@/lib/support-session";

const ADMIN = {
  id: "admin_1",
  email: "admin@kanzlei-a.example",
  role: "admin",
  orgId: ORG.id,
  twoFactorEnabled: true,
};

function ctx(overrides: Record<string, unknown> = {}) {
  return { headers: {}, brainId: ORG.brainId, plan: "team", user: ADMIN, ...overrides };
}

function req(method: string, body?: unknown) {
  return new NextRequest("http://localhost:3000/api/settings/support-access", {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": "t",
      cookie: "sb_csrf=t",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("/api/settings/support-access", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(requireEngineContext).mockResolvedValue(ctx() as any);
    await DELETE(req("DELETE"));
    vi.clearAllMocks();
    vi.mocked(requireEngineContext).mockResolvedValue(ctx() as any);
  });

  it("a firm admin grants time-boxed read access, audited in the firm's trail", async () => {
    const res = await POST(req("POST", { hours: 24, mode: "read" }));
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.grant.mode).toBe("read");
    const ms = Date.parse(data.grant.expiresAt) - Date.now();
    expect(ms).toBeGreaterThan(23 * 3600_000);
    expect(ms).toBeLessThanOrEqual(24 * 3600_000);
    expect(logAudit).toHaveBeenCalledWith(
      "support.grant_created",
      "org",
      expect.objectContaining({ brainId: ORG.brainId, userId: ADMIN.id })
    );
    expect((await getActiveSupportGrant(ORG.id))?.mode).toBe("read");
  });

  it("rejects approvals longer than 7 days", async () => {
    const res = await POST(req("POST", { hours: 169, mode: "read" }));
    expect(res.status).toBe(400);
    expect(await getActiveSupportGrant(ORG.id)).toBeNull();
  });

  it("revoking ends running support sessions and is audited", async () => {
    await POST(req("POST", { hours: 8, mode: "write" }));
    const grant = await getActiveSupportGrant(ORG.id);
    await startSupportSession({
      operatorId: "op_1",
      operatorEmail: "ops@subsumio.example",
      orgId: ORG.id,
      orgName: ORG.name,
      reason: "Ticket — Fehlersuche",
      grant: grant!,
    });
    expect(await getActiveSupportSession("op_1")).not.toBeNull();

    const res = await DELETE(req("DELETE"));
    expect(res.status).toBe(200);
    expect((await res.json()).data.endedSessions).toBe(1);
    expect(await getActiveSupportSession("op_1")).toBeNull();
    expect(logAudit).toHaveBeenCalledWith("support.grant_revoked", "org", expect.anything());
    expect(logAudit).toHaveBeenCalledWith(
      "support.session_end",
      "org",
      expect.objectContaining({ details: expect.objectContaining({ endedBy: "revoked" }) })
    );
  });

  it("an operator inside a support session can never approve their own access", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue(
      ctx({ supportSession: { id: "s", mode: "write", orgId: ORG.id } }) as any
    );
    const res = await POST(req("POST", { hours: 168, mode: "write" }));
    expect(res.status).toBe(403);
    expect(await getActiveSupportGrant(ORG.id)).toBeNull();
  });

  it("members who are not admins cannot see or change the approval", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue(
      ctx({ user: { ...ADMIN, id: "lawyer_1", role: "lawyer" } }) as any
    );
    expect((await GET(req("GET"))).status).toBe(403);
    expect((await POST(req("POST", { hours: 1 }))).status).toBe(403);
  });

  it("GET shows the approval and running sessions to the firm admin", async () => {
    await POST(req("POST", { hours: 1, mode: "read" }));
    const res = await GET(req("GET"));
    const { data } = await res.json();
    expect(data.grant).toMatchObject({ mode: "read", grantedBy: ADMIN.email });
    expect(data.activeSessions).toEqual([]);
    expect(data.maxHours).toBe(168);
  });
});
