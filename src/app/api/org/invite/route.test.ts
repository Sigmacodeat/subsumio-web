/* eslint-disable @typescript-eslint/no-explicit-any */
// An invite carries the role the owner chose, bound into the signed token;
// the default is the least privileged staff role and admin is never offered.
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
const signActionToken = vi.fn(async (_p: { bind: string }) => "tok");
vi.mock("@/lib/auth/tokens", () => ({
  signActionToken: (p: { bind: string }) => signActionToken(p),
  bindFragment: async (v: string) => `bound:${v}`,
  INVITE_TOKEN_TTL_SECONDS: 604800,
}));
vi.mock("@/lib/mail", () => ({
  sendMail: vi.fn(async () => ({ sent: false })),
  siteUrl: () => "https://app.example",
}));
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({ listByOrg: async () => [], getByEmail: async () => null }),
  getOrgStore: () => ({
    getById: async (id: string) => (id === "org_a" ? { id, name: "A", ownerId: "owner" } : null),
  }),
  markOnboardingProgress: vi.fn(async () => undefined),
}));

import { POST } from "./route";
import { requireEngineContext } from "@/lib/engine";

function invite(
  body: Record<string, unknown>,
  user: Record<string, unknown> = {
    id: "owner",
    email: "owner@kanzlei.at",
    name: "Owner",
    orgId: "org_a",
    role: "admin",
  }
) {
  vi.mocked(requireEngineContext).mockResolvedValue({
    headers: {},
    brainId: "b",
    plan: "team",
    user,
  } as any);
  return POST(
    new NextRequest("http://localhost:3000/api/org/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": "t", cookie: "sb_csrf=t" },
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => signActionToken.mockClear());

describe("POST /api/org/invite — role", () => {
  it("defaults to the least privileged staff role", async () => {
    const res = await invite({ email: "neu@kanzlei.at" });
    expect(res.status).toBe(200);
    expect(signActionToken.mock.calls[0][0].bind).toBe("bound:org_a:neu@kanzlei.at:assistant");
    expect((await res.json()).devJoinUrl).toContain("role=assistant");
  });

  it("binds the chosen role into the token", async () => {
    const res = await invite({ email: "mandant@example.at", role: "client_viewer" });
    expect(res.status).toBe(200);
    expect(signActionToken.mock.calls[0][0].bind).toBe(
      "bound:org_a:mandant@example.at:client_viewer"
    );
  });

  it("refuses admin", async () => {
    const res = await invite({ email: "neu@kanzlei.at", role: "admin" });
    expect(res.status).toBe(400);
    expect(signActionToken).not.toHaveBeenCalled();
  });

  it("a second administrator may invite; a lawyer may not", async () => {
    const admin2 = {
      id: "admin2",
      email: "a2@kanzlei.at",
      name: "A2",
      orgId: "org_a",
      role: "admin",
    };
    expect((await invite({ email: "neu2@kanzlei.at" }, admin2)).status).toBe(200);
    const lawyer = { id: "l1", email: "l1@kanzlei.at", name: "L1", orgId: "org_a", role: "lawyer" };
    expect((await invite({ email: "neu3@kanzlei.at" }, lawyer)).status).toBe(403);
  });
});
