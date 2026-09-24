// @vitest-environment node
//
// OWASP change-of-email flow, request half: password re-auth gates the
// request, a signed single-use token goes to the NEW address, and a
// notification-only mail goes to the still-current address.
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

let user: {
  id: string;
  email: string;
  name: string;
  locale: string;
  passwordHash: string;
} | null = null;
let emailTaken = false;

vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } } },
      handler: (ctx: unknown, body: unknown) => Promise<Response>
    ) =>
    async (req: Request) => {
      const parsed = opts.body!.safeParse(await req.json());
      if (!parsed.success) return Response.json({ error: "validation_failed" }, { status: 400 });
      return handler({ user: { id: "u1" } }, parsed.data);
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
}));

const verifyPassword = vi.fn(async (_a: string, _b: string) => true);
vi.mock("@/lib/auth/password", () => ({
  verifyPassword: (a: string, b: string) => verifyPassword(a, b),
}));

vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({
    getById: async () => user,
    getByEmail: async (email: string) => (emailTaken ? { id: "other", email } : null),
  }),
}));

const signActionToken = vi.fn(async (..._args: unknown[]) => "signed-token");
vi.mock("@/lib/auth/tokens", () => ({
  signActionToken: (...args: unknown[]) => signActionToken(...args),
  bindFragment: vi.fn(async () => "bind"),
  EMAIL_CHANGE_TOKEN_TTL_SECONDS: 3600,
}));

const sendMail = vi.fn(async (_input: { to: string; text?: string }) => ({ sent: true }));
vi.mock("@/lib/mail", () => ({
  sendMail: (input: { to: string; text?: string }) => sendMail(input),
  siteUrl: () => "https://app.test",
}));

vi.mock("@/lib/env", () => ({ env: () => "production" }));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { POST } from "./route";

const ctx = { user: { id: "u1" } };
const request = (body: unknown) =>
  POST(
    new Request("https://app.test/api/auth/email/request-change", {
      method: "POST",
      body: JSON.stringify(body),
    }) as unknown as NextRequest
  );

beforeEach(() => {
  vi.clearAllMocks();
  emailTaken = false;
  user = {
    id: "u1",
    email: "alt@kanzlei.at",
    name: "Dr. Test",
    locale: "de",
    passwordHash: "hash",
  };
});

describe("POST /api/auth/email/request-change", () => {
  it("rejects a wrong password with 403 before doing anything else", async () => {
    verifyPassword.mockResolvedValueOnce(false);
    const res = await request({ newEmail: "neu@kanzlei.at", password: "wrong" });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("invalid_password");
    expect(signActionToken).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("rejects the unchanged address", async () => {
    const res = await request({ newEmail: "alt@kanzlei.at", password: "pw" });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("same_email");
  });

  it("rejects an address already taken by another account", async () => {
    emailTaken = true;
    const res = await request({ newEmail: "neu@kanzlei.at", password: "pw" });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("email_taken");
  });

  it("success: token bound to old+new pair, confirm mail to NEW, notice to OLD", async () => {
    const res = await request({ newEmail: "Neu@Kanzlei.AT", password: "pw" });
    expect(res.status).toBe(200);

    // Token purpose + carries the normalized new address.
    expect(signActionToken).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "u1", purpose: "email_change", email: "neu@kanzlei.at" }),
      3600
    );

    // Two mails: confirm link to the NEW address, notification to the OLD.
    const recipients = sendMail.mock.calls.map((c) => c[0].to);
    expect(recipients).toContain("neu@kanzlei.at");
    expect(recipients).toContain("alt@kanzlei.at");
    const confirmMail = sendMail.mock.calls.find((c) => c[0].to === "neu@kanzlei.at");
    expect(confirmMail![0].text).toContain("token=signed-token");
  });

  it("mail failure surfaces a 502 (no silent fake success)", async () => {
    sendMail.mockResolvedValueOnce({ sent: false });
    const res = await request({ newEmail: "neu@kanzlei.at", password: "pw" });
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("mail_failed");
  });
});

void ctx;
