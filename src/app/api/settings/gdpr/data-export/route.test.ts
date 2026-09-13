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
vi.mock("@/lib/encryption", () => ({ decrypt: async () => null }));
vi.mock("@/lib/api-key-store", () => ({
  getApiKeyStore: () => ({ listByOwner: async () => [] }),
}));
const listPages = vi.fn(async () => [{ slug: "cases/other-client", title: "Fremde Akte" }]);
vi.mock("@/lib/server-brain", () => ({ createServerBrainClient: () => ({ listPages }) }));
let storedUser: Record<string, unknown> = {};
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({ getById: async () => storedUser }),
}));

import { GET } from "./route";
import { requireEngineContext } from "@/lib/engine";

function ctxFor(user: Record<string, unknown>) {
  return {
    headers: { "x-subsumio-source": user.orgId ? "org_firm" : "brain_personal" },
    brainId: user.orgId ? "org_firm" : "brain_personal",
    plan: "team",
    user,
  };
}

describe("GET /api/settings/gdpr/data-export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never includes the firm's matter store for firm members", async () => {
    storedUser = {
      id: "u_assist",
      email: "assistenz@kanzlei.example",
      role: "client_viewer",
      orgId: "org_1",
      createdAt: "2026-01-01",
    };
    vi.mocked(requireEngineContext).mockResolvedValue(ctxFor(storedUser) as any);
    const res = await GET(new NextRequest("http://localhost:3000/api/settings/gdpr/data-export"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.brainPages).toEqual([]);
    expect(listPages).not.toHaveBeenCalled();
    expect(body.user.email).toBe("assistenz@kanzlei.example");
  });

  it("includes the personal brain for users without a firm", async () => {
    storedUser = {
      id: "u_solo",
      email: "solo@example.com",
      role: "admin",
      createdAt: "2026-01-01",
    };
    vi.mocked(requireEngineContext).mockResolvedValue(ctxFor(storedUser) as any);
    const res = await GET(new NextRequest("http://localhost:3000/api/settings/gdpr/data-export"));
    const body = await res.json();
    expect(body.brainPages).toHaveLength(1);
  });
});
