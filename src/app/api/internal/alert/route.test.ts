// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  audits: [] as Array<Record<string, unknown>>,
  mails: [] as Array<{ subject: string; text: string }>,
  authFails: false,
}));

vi.mock("@/lib/auth/internal-guard", () => ({
  requireInternalSecret: async () =>
    mocks.authFails ? Response.json({ error: "unauthorized" }, { status: 401 }) : null,
}));
vi.mock("@/lib/audit", () => ({
  SYSTEM_BRAIN: "system",
  logAudit: async (_a: string, _t: string, opts: Record<string, unknown>) => {
    mocks.audits.push(opts);
  },
}));
vi.mock("@/lib/ops-alert", () => ({
  notifyOps: async (subject: string, text: string) => {
    mocks.mails.push({ subject, text });
    return { notified: true };
  },
}));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/internal/alert", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );

beforeEach(() => {
  mocks.audits.length = 0;
  mocks.mails.length = 0;
  mocks.authFails = false;
});

describe("POST /api/internal/alert", () => {
  it("rejects callers without the internal secret", async () => {
    mocks.authFails = true;
    expect((await post({ type: "x", severity: "critical", message: "m" })).status).toBe(401);
    expect(mocks.mails).toHaveLength(0);
  });

  it("mails the ops mailbox for a critical alert and records it", async () => {
    const res = await post({
      type: "integrity_mismatch",
      severity: "critical",
      message: "1 file(s) failed integrity re-verification (GoBD)",
      details: [{ filename: "secret-client.pdf" }],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, notified: true });
    expect(mocks.mails).toHaveLength(1);
    expect(mocks.mails[0]!.subject).toContain("integrity_mismatch");
    // File names stay in the audit log, not in the mail.
    expect(mocks.mails[0]!.text).not.toContain("secret-client");
    expect(mocks.audits).toHaveLength(1);
  });

  it("does not mail for warnings", async () => {
    await post({ type: "x", severity: "warning", message: "m" });
    expect(mocks.mails).toHaveLength(0);
    expect(mocks.audits).toHaveLength(1);
  });

  it("details can never overwrite type or severity", async () => {
    await post({
      type: "integrity_mismatch",
      severity: "critical",
      message: "m",
      details: { alert_type: "noise", severity: "info" },
    });
    const d = mocks.audits[0]!.details as Record<string, unknown>;
    expect(d.alert_type).toBe("integrity_mismatch");
    expect(d.severity).toBe("critical");
  });

  it("rejects malformed bodies", async () => {
    expect((await post("not json")).status).toBe(400);
    expect((await post({ type: "x", severity: "panic", message: "m" })).status).toBe(400);
    expect(mocks.audits).toHaveLength(0);
  });
});
