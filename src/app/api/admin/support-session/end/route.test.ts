/* eslint-disable @typescript-eslint/no-explicit-any */
// The most important property of this route: unlike every other operator
// route, it must work OFF the ops host too — the operator ends their session
// from the banner inside the firm dashboard they were browsing, on the
// firm's own domain.
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
vi.mock("@/lib/support-session-audit", () => ({
  writeFirmVisibleSupportAuditEntry: vi.fn().mockResolvedValue(undefined),
}));

const ORG = { id: "org_a", name: "Kanzlei A", brainId: "brain_org_a", ownerId: "owner_1" };
const getOrgById = vi.fn(async (id: string) => (id === ORG.id ? ORG : null));
vi.mock("@/lib/auth/store", () => ({
  getOrgStore: () => ({ getById: (id: string) => getOrgById(id) }),
}));

const endSupportSession = vi.fn();
vi.mock("@/lib/support-session", () => ({
  endSupportSession: (id: string) => endSupportSession(id),
}));

import { POST } from "./route";
import { requireEngineContext } from "@/lib/engine";
import { writeFirmVisibleSupportAuditEntry } from "@/lib/support-session-audit";
import { logAudit } from "@/lib/audit";

const OPERATOR = {
  id: "op_1",
  email: "ops@subsumio.example",
  role: "admin",
  twoFactorEnabled: true,
};

function opCtx() {
  return { headers: {}, brainId: "brain_operator", plan: "team", user: OPERATOR };
}

function request(host: string) {
  return new NextRequest("http://localhost:3000/api/admin/support-session/end", {
    method: "POST",
    headers: { host, "x-csrf-token": "t", cookie: "sb_csrf=t" },
  });
}

describe("POST /api/admin/support-session/end", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("PLATFORM_OPERATOR_EMAILS", OPERATOR.email);
    vi.mocked(requireEngineContext).mockResolvedValue(opCtx() as any);
  });

  it("ends the caller's session and writes both audit trails — from the ops host", async () => {
    const ended = {
      id: "s1",
      operatorId: OPERATOR.id,
      operatorEmail: OPERATOR.email,
      orgId: ORG.id,
      orgName: ORG.name,
      reason: "Ticket #99",
      startedAt: "2026-01-01T10:00:00.000Z",
      expiresAt: "2026-01-01T11:00:00.000Z",
      endedAt: "2026-01-01T10:15:00.000Z",
    };
    endSupportSession.mockResolvedValue(ended);

    const res = await POST(request("ops.subsum.io"));
    expect(res.status).toBe(200);
    expect((await res.json()).data.session).toBeNull();
    expect(endSupportSession).toHaveBeenCalledWith(OPERATOR.id);
    expect(logAudit).toHaveBeenCalledWith(
      "support.session_end",
      "org",
      expect.objectContaining({ brainId: ORG.brainId, userEmail: OPERATOR.email })
    );
    expect(writeFirmVisibleSupportAuditEntry).toHaveBeenCalledWith(
      ORG.brainId,
      "support.session_end",
      ended
    );
  });

  it("also works from the firm's own app host, in production — unlike platform.operator routes", async () => {
    vi.stubEnv("NODE_ENV", "production");
    endSupportSession.mockResolvedValue(null);
    const res = await POST(request("subsum.io"));
    expect(res.status).toBe(200);
  });

  it("is a no-op (200, no audit writes) when the operator has nothing active", async () => {
    endSupportSession.mockResolvedValue(null);
    const res = await POST(request("ops.subsum.io"));
    expect(res.status).toBe(200);
    expect((await res.json()).data.session).toBeNull();
    expect(logAudit).not.toHaveBeenCalled();
    expect(writeFirmVisibleSupportAuditEntry).not.toHaveBeenCalled();
  });

  it("still requires platform-operator identity", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue({
      ...opCtx(),
      user: { id: "u2", email: "partner@kanzlei.example", role: "admin", twoFactorEnabled: true },
    } as any);
    const res = await POST(request("subsum.io"));
    expect(res.status).toBe(403);
    expect(endSupportSession).not.toHaveBeenCalled();
  });
});
