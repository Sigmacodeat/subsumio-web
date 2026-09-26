// @vitest-environment node
//
// engineContext()'s support-session override — the actual enforcement point
// for "support access": every route built on requireEngineContext() must
// transparently operate against the target firm's brain while a session is
// active, with the operator's role elevated only within the returned,
// request-scoped context, and must fall back to the operator's own (org-less)
// context the instant nothing active remains.
import { describe, expect, test, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => new Map([["sb_session", { value: "tok" }]])),
}));

vi.mock("@/lib/auth/session", () => ({
  verifySession: vi.fn(async () => ({ uid: "operator_1" })),
  SESSION_COOKIE: "sb_session",
}));

const OPERATOR = {
  id: "operator_1",
  email: "ops@subsumio.example",
  role: "lawyer", // deliberately NOT admin — the override must still grant admin for the session
  plan: "free",
  brainId: "brain_operator_personal",
  orgId: undefined,
  deactivatedAt: null,
  twoFactorEnabled: true,
};

const FIRM_OWNER = { id: "owner_1", plan: "team" };
const ORG = { id: "org_a", name: "Kanzlei A", brainId: "brain_org_a", ownerId: "owner_1" };

const getById = vi.fn(async (id: string) => {
  if (id === OPERATOR.id) return { ...OPERATOR };
  if (id === FIRM_OWNER.id) return { ...FIRM_OWNER };
  return null;
});
const getOrgById = vi.fn(async (id: string) => (id === ORG.id ? { ...ORG } : null));

vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({ getById }),
  getOrgStore: () => ({ getById: getOrgById }),
}));

vi.mock("@/lib/env", () => ({ env: () => undefined }));

vi.mock("@/lib/auth/platform-operator", () => ({
  isPlatformOperator: (u: { email?: string }) => u?.email === OPERATOR.email,
}));

const getActiveSupportSession = vi.fn(async (_operatorId: string) => null as unknown);
vi.mock("@/lib/support-session", () => ({
  getActiveSupportSession: (id: string) => getActiveSupportSession(id),
}));

import { engineContext, requireEngineContext } from "./engine";

describe("engineContext — support session override", () => {
  test("a platform operator with no active session gets their own (org-less) context", async () => {
    getActiveSupportSession.mockResolvedValueOnce(null);
    const ctx = await engineContext();
    expect(ctx?.brainId).toBe(OPERATOR.brainId);
    expect(ctx?.user.role).toBe("lawyer");
    expect(ctx?.supportSession).toBeUndefined();
  });

  test("an active session switches brainId/plan to the firm and elevates role to admin", async () => {
    getActiveSupportSession.mockResolvedValueOnce({
      id: "sess_1",
      operatorId: OPERATOR.id,
      operatorEmail: OPERATOR.email,
      orgId: ORG.id,
      orgName: ORG.name,
      reason: "Fehlerticket #42",
      startedAt: "2026-01-01T10:00:00.000Z",
      expiresAt: "2026-01-01T11:00:00.000Z",
      endedAt: null,
    });
    const ctx = await engineContext();
    expect(ctx?.brainId).toBe(ORG.brainId);
    expect(ctx?.plan).toBe("team"); // the firm owner's plan, not the operator's own "free"
    expect(ctx?.user.role).toBe("admin");
    expect(ctx?.user.orgId).toBe(ORG.id);
    expect(ctx?.headers["x-subsumio-source"]).toBe(ORG.brainId);
    expect(ctx?.supportSession?.orgId).toBe(ORG.id);
    expect(ctx?.supportSession?.reason).toBe("Fehlerticket #42");
  });

  test("the operator's REAL stored record is never mutated by the override", async () => {
    getActiveSupportSession.mockResolvedValueOnce({
      id: "sess_2",
      operatorId: OPERATOR.id,
      operatorEmail: OPERATOR.email,
      orgId: ORG.id,
      orgName: ORG.name,
      reason: "Fehlerticket #43",
      startedAt: "2026-01-01T10:00:00.000Z",
      expiresAt: "2026-01-01T11:00:00.000Z",
      endedAt: null,
    });
    await engineContext();
    expect(OPERATOR.role).toBe("lawyer");
    expect(OPERATOR.orgId).toBeUndefined();
  });

  test("a firm member (non-operator) is completely unaffected — no support-session lookup even happens", async () => {
    getById.mockImplementationOnce(async () => ({
      id: "firm_lawyer_1",
      email: "lawyer@kanzlei.example",
      role: "lawyer",
      plan: "free",
      brainId: "brain_lawyer_personal",
      orgId: ORG.id,
      deactivatedAt: null,
    }));
    getActiveSupportSession.mockClear();
    const ctx = await engineContext();
    expect(ctx?.brainId).toBe(ORG.brainId); // via ordinary org membership, not support-session
    expect(ctx?.user.role).toBe("lawyer");
    expect(getActiveSupportSession).not.toHaveBeenCalled();
  });

  test("an org whose id no longer resolves is a safe no-op (falls back to the operator's own brain)", async () => {
    getActiveSupportSession.mockResolvedValueOnce({
      id: "sess_3",
      operatorId: OPERATOR.id,
      operatorEmail: OPERATOR.email,
      orgId: "org_deleted",
      orgName: "Gelöschte Kanzlei",
      reason: "Stale session",
      startedAt: "2026-01-01T10:00:00.000Z",
      expiresAt: "2026-01-01T11:00:00.000Z",
      endedAt: null,
    });
    const ctx = await engineContext();
    expect(ctx?.brainId).toBe(OPERATOR.brainId);
    expect(ctx?.supportSession).toBeUndefined();
  });
});

vi.mock("@/lib/rate-limit-api", () => ({ requireApiRate: vi.fn(async () => null) }));

describe("requireEngineContext — support sessions are read-only by default", () => {
  const base = {
    id: "sess_ro",
    operatorId: OPERATOR.id,
    operatorEmail: OPERATOR.email,
    orgId: ORG.id,
    orgName: ORG.name,
    reason: "Ticket #7 — Ansicht prüfen",
    startedAt: "2026-01-01T10:00:00.000Z",
    expiresAt: "2099-01-01T11:00:00.000Z",
    endedAt: null,
  };
  const req = (method: string) => new Request("http://localhost/api/legal/cases", { method });

  test("a read session may read but not change anything", async () => {
    getActiveSupportSession.mockResolvedValue({ ...base, mode: "read" });
    const read = await requireEngineContext(req("GET"), "brain.read", "standard");
    expect(read).not.toBeInstanceOf(Response);

    const write = await requireEngineContext(req("POST"), "brain.write", "standard");
    expect(write).toBeInstanceOf(Response);
    expect((write as Response).status).toBe(403);
    expect((await (write as Response).json()).error).toBe("support_read_only");

    const del = await requireEngineContext(req("DELETE"), "brain.delete", "standard");
    expect((del as Response).status).toBe(403);
  });

  test("a session without a recorded mode counts as read-only", async () => {
    getActiveSupportSession.mockResolvedValue({ ...base });
    const write = await requireEngineContext(req("PATCH"), "brain.write", "standard");
    expect((write as Response).status).toBe(403);
  });

  test("ending the session stays possible in read mode", async () => {
    getActiveSupportSession.mockResolvedValue({ ...base, mode: "read" });
    const end = await requireEngineContext(req("POST"), "platform.support_session", "standard");
    expect(end).not.toBeInstanceOf(Response);
  });

  test("a write session may change data", async () => {
    getActiveSupportSession.mockResolvedValue({ ...base, mode: "write" });
    const write = await requireEngineContext(req("POST"), "brain.write", "standard");
    expect(write).not.toBeInstanceOf(Response);
    getActiveSupportSession.mockReset();
  });
});
