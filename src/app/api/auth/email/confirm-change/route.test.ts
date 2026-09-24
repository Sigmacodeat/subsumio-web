// @vitest-environment node
//
// OWASP change-of-email flow, confirm half: the signed token (mailed to the
// NEW address) is the only proof needed. Single-use is enforced via the
// old+new bind fragment; success swaps the address, revokes every session
// (they embed the old email), audits, and notifies the old address.
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

let user: { id: string; email: string; name: string; locale: string } | null = null;
let tokenPayload: { uid: string; email?: string; bind: string } | null = null;
let bindValue = "expected-bind";
let emailTaken = false;
let updated: { id: string; patch: unknown } | null = null;

vi.mock("@/lib/api-handler", () => ({
  createPublicHandler:
    (
      opts: { body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } } },
      handler: (req: Request, body: unknown) => Promise<Response>
    ) =>
    async (req: Request) => {
      const parsed = opts.body!.safeParse(await req.json());
      if (!parsed.success) return Response.json({ error: "validation_failed" }, { status: 400 });
      return handler(req, parsed.data);
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
}));

vi.mock("@/lib/auth/tokens", () => ({
  verifyActionToken: vi.fn(async () => tokenPayload),
  bindFragment: vi.fn(async () => bindValue),
}));

const revokeAllSessions = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock("@/lib/auth/session", () => ({
  revokeAllSessions: (...args: unknown[]) => revokeAllSessions(...args),
}));

vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({
    getById: async () => user,
    getByEmail: async (email: string) => (emailTaken ? { id: "other", email } : null),
    update: async (id: string, patch: unknown) => {
      updated = { id, patch };
      return user;
    },
  }),
}));

const sendMail = vi.fn(async (_input: { to: string; text?: string }) => ({ sent: true }));
vi.mock("@/lib/mail", () => ({
  sendMail: (input: { to: string; text?: string }) => sendMail(input),
}));

vi.mock("@/lib/auth/rate-limit", () => ({ clientIp: () => "127.0.0.1" }));
const logAudit = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock("@/lib/audit", () => ({ logAudit: (...args: unknown[]) => logAudit(...args) }));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { POST } from "./route";

const request = (body: unknown) =>
  POST(
    new Request("https://app.test/api/auth/email/confirm-change", {
      method: "POST",
      body: JSON.stringify(body),
    }) as unknown as NextRequest
  );

beforeEach(() => {
  vi.clearAllMocks();
  user = { id: "u1", email: "alt@kanzlei.at", name: "Dr. Test", locale: "de" };
  tokenPayload = { uid: "u1", email: "neu@kanzlei.at", bind: "expected-bind" };
  bindValue = "expected-bind";
  emailTaken = false;
  updated = null;
});

describe("POST /api/auth/email/confirm-change", () => {
  it("rejects an invalid/expired token", async () => {
    tokenPayload = null;
    const res = await request({ token: "bad-but-long-enough" });
    expect(res.status).toBe(400);
    expect(updated).toBeNull();
  });

  it("rejects a token without the email claim", async () => {
    tokenPayload = { uid: "u1", bind: "expected-bind" };
    const res = await request({ token: "tok-enough-chars" });
    expect(res.status).toBe(400);
  });

  it("rejects on bind mismatch — token is single-use", async () => {
    bindValue = "different-bind";
    const res = await request({ token: "tok-enough-chars" });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_token");
    expect(updated).toBeNull();
  });

  it("rejects when the address was taken between request and confirm", async () => {
    emailTaken = true;
    const res = await request({ token: "tok-enough-chars" });
    expect(res.status).toBe(409);
    expect(updated).toBeNull();
  });

  it("success: swaps email, revokes all sessions, audits, notifies old address", async () => {
    const res = await request({ token: "tok-enough-chars" });
    expect(res.status).toBe(200);
    expect(updated).toEqual({ id: "u1", patch: { email: "neu@kanzlei.at" } });
    expect(revokeAllSessions).toHaveBeenCalledWith("u1");
    expect(logAudit).toHaveBeenCalledWith(
      "user.email_changed",
      "user",
      expect.objectContaining({ entityId: "u1" })
    );
    // Flush the voided mail promise before asserting.
    await new Promise((r) => setTimeout(r, 0));
    const recipients = sendMail.mock.calls.map((c) => c[0].to);
    expect(recipients).toContain("alt@kanzlei.at");
  });
});
