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
vi.mock("@/lib/support-session-audit", () => ({
  writeFirmVisibleSupportAuditEntry: vi.fn().mockResolvedValue(undefined),
}));

const ORG = { id: "org_a", name: "Kanzlei A", brainId: "brain_org_a", ownerId: "owner_1" };
const getOrgById = vi.fn(async (id: string) => (id === ORG.id ? ORG : null));
vi.mock("@/lib/auth/store", () => ({
  getOrgStore: () => ({ getById: (id: string) => getOrgById(id) }),
}));

const startSupportSession = vi.fn();
const getActiveSupportSession = vi.fn(async () => null as unknown);
vi.mock("@/lib/support-session", () => ({
  startSupportSession: (input: unknown) => startSupportSession(input),
  getActiveSupportSession: (id: string) => getActiveSupportSession(id),
}));

import { GET, POST } from "./route";
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

function postRequest(body: unknown, host = "ops.subsum.eu") {
  return new NextRequest("http://localhost:3000/api/admin/support-session", {
    method: "POST",
    headers: {
      host,
      "Content-Type": "application/json",
      "x-csrf-token": "t",
      cookie: "sb_csrf=t",
    },
    body: JSON.stringify(body),
  });
}

function getRequest(host = "ops.subsum.eu") {
  return new NextRequest("http://localhost:3000/api/admin/support-session", { headers: { host } });
}

describe("POST /api/admin/support-session (start)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("PLATFORM_OPERATOR_EMAILS", OPERATOR.email);
    vi.mocked(requireEngineContext).mockResolvedValue(opCtx() as any);
  });

  it("starts a session for an existing org and writes both audit trails", async () => {
    const session = {
      id: "s1",
      operatorId: OPERATOR.id,
      operatorEmail: OPERATOR.email,
      orgId: ORG.id,
      orgName: ORG.name,
      reason: "Ticket #99 — Fristen-Export schlägt fehl",
      startedAt: "2026-01-01T10:00:00.000Z",
      expiresAt: "2026-01-01T11:00:00.000Z",
      endedAt: null,
    };
    startSupportSession.mockResolvedValue(session);

    const res = await POST(
      postRequest({ orgId: ORG.id, reason: "Ticket #99 — Fristen-Export schlägt fehl" })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.session).toMatchObject({ orgId: ORG.id, orgName: ORG.name });

    expect(startSupportSession).toHaveBeenCalledWith(
      expect.objectContaining({ operatorId: OPERATOR.id, orgId: ORG.id })
    );
    expect(logAudit).toHaveBeenCalledWith(
      "support.session_start",
      "org",
      expect.objectContaining({ brainId: ORG.brainId, userEmail: OPERATOR.email })
    );
    expect(writeFirmVisibleSupportAuditEntry).toHaveBeenCalledWith(
      ORG.brainId,
      "support.session_start",
      session
    );
  });

  it("404s for an org that does not exist, without creating a session", async () => {
    const res = await POST(postRequest({ orgId: "no-such-org", reason: "irrelevant reason text" }));
    expect(res.status).toBe(404);
    expect(startSupportSession).not.toHaveBeenCalled();
  });

  it("rejects a reason that is too short", async () => {
    const res = await POST(postRequest({ orgId: ORG.id, reason: "kurz" }));
    expect(res.status).toBe(400);
    expect(startSupportSession).not.toHaveBeenCalled();
  });

  it("is blocked outside the ops host in production (same lock as other operator routes)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await POST(postRequest({ orgId: ORG.id, reason: "gültiger Grund-Text" }, "subsum.eu"));
    expect(res.status).toBe(404);
    expect(startSupportSession).not.toHaveBeenCalled();
  });

  it("rejects Kanzlei users (not platform operators)", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue({
      ...opCtx(),
      user: { id: "u2", email: "partner@kanzlei.example", role: "admin" },
    } as any);
    const res = await POST(postRequest({ orgId: ORG.id, reason: "gültiger Grund-Text" }));
    expect(res.status).toBe(403);
  });
});

describe("GET /api/admin/support-session (status)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("PLATFORM_OPERATOR_EMAILS", OPERATOR.email);
    vi.mocked(requireEngineContext).mockResolvedValue(opCtx() as any);
  });

  it("returns null when the operator has no active session", async () => {
    getActiveSupportSession.mockResolvedValue(null);
    const res = await GET(getRequest());
    expect((await res.json()).data.session).toBeNull();
  });

  it("returns the active session, trimmed to the public shape", async () => {
    getActiveSupportSession.mockResolvedValue({
      id: "s1",
      operatorId: OPERATOR.id,
      operatorEmail: OPERATOR.email,
      orgId: ORG.id,
      orgName: ORG.name,
      reason: "laufende Sitzung",
      startedAt: "2026-01-01T10:00:00.000Z",
      expiresAt: "2026-01-01T11:00:00.000Z",
      endedAt: null,
    });
    const res = await GET(getRequest());
    const body = await res.json();
    expect(body.data.session).toEqual({
      orgId: ORG.id,
      orgName: ORG.name,
      reason: "laufende Sitzung",
      startedAt: "2026-01-01T10:00:00.000Z",
      expiresAt: "2026-01-01T11:00:00.000Z",
    });
    // The public shape never leaks the internal session id or operator identity.
    expect(body.data.session.id).toBeUndefined();
    expect(body.data.session.operatorEmail).toBeUndefined();
  });
});
