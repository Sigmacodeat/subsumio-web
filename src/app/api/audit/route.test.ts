/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), listAuditLogs: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 }),
}));
vi.mock("@/lib/engine", async () => ({
  ENGINE_URL: "http://engine.test",
  engineConfigurationResponse: () => null,
  requireEngineContext: vi.fn(),
  recordQuota: vi.fn(),
}));

import { GET } from "./route";
import { requireEngineContext } from "@/lib/engine";
import { listAuditLogs } from "@/lib/audit";

const ctx = {
  headers: { "x-subsumio-source": "brain_a" },
  brainId: "brain_a",
  plan: "team",
  user: { id: "u1", email: "admin@kanzlei.example", role: "admin", name: "Admin" },
};

describe("GET /api/audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireEngineContext).mockResolvedValue(ctx as any);
  });

  it("lists the firm's entries from the Postgres audit store, scoped by brain", async () => {
    vi.mocked(listAuditLogs).mockResolvedValue([
      { id: "1", action: "case.create", entityType: "page", timestamp: "2026-09-16T10:00:00Z" },
    ] as any);
    const res = await GET(
      new NextRequest(
        "http://localhost:3000/api/audit?action=case&entityType=page&from=2026-09-01&to=2026-09-16&limit=50"
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.entries[0]).toMatchObject({ action: "case.create" });
    expect(vi.mocked(listAuditLogs).mock.calls[0][0]).toMatchObject({
      brainId: "brain_a",
      action: "case",
      entityType: "page",
      from: "2026-09-01",
      to: "2026-09-16T23:59:59.999Z",
      limit: 50,
    });
  });

  it("filters one entry's history on the server (entityId)", async () => {
    vi.mocked(listAuditLogs).mockResolvedValue([] as any);
    const res = await GET(
      new NextRequest("http://localhost:3000/api/audit?entityId=docs%2Fbrief&limit=500")
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(listAuditLogs).mock.calls[0][0]).toMatchObject({
      brainId: "brain_a",
      entityId: "docs/brief",
      limit: 500,
    });
  });

  it("reports a store failure as an error instead of an empty log", async () => {
    vi.mocked(listAuditLogs).mockRejectedValue(new Error("db down"));
    const res = await GET(new NextRequest("http://localhost:3000/api/audit"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("audit_unavailable");
    expect(body.entries).toBeUndefined();
  });

  it.each(["lawyer", "assistant", "client_viewer"])(
    "refuses the firm-wide log for role %s",
    async (role) => {
      vi.mocked(requireEngineContext).mockResolvedValue({
        ...ctx,
        user: { ...ctx.user, role },
      } as any);
      const res = await GET(new NextRequest("http://localhost:3000/api/audit"));
      expect(res.status).toBe(403);
      expect(listAuditLogs).not.toHaveBeenCalled();
    }
  );
});
