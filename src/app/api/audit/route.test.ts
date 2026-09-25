/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(),
  listAuditLogsPage: vi.fn(),
  SYSTEM_BRAIN: "system",
}));
vi.mock("@/lib/auth/internal", () => ({
  hasValidInternalSecret: (req: Request) => req.headers.get("x-internal-secret") === "s3cret",
}));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 }),
}));
vi.mock("@/lib/engine", async () => ({
  ENGINE_URL: "http://engine.test",
  engineConfigurationResponse: () => null,
  requireEngineContext: vi.fn(),
  recordQuota: vi.fn(),
}));

import { GET, POST } from "./route";
import { requireEngineContext } from "@/lib/engine";
import { listAuditLogsPage as listAuditLogs, logAudit } from "@/lib/audit";

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
    vi.mocked(listAuditLogs).mockResolvedValue({
      entries: [
        { id: "1", action: "case.create", entityType: "page", timestamp: "2026-09-16T10:00:00Z" },
      ],
      nextCursor: "next-1",
    } as any);
    const res = await GET(
      new NextRequest(
        "http://localhost:3000/api/audit?action=case&entityType=page&from=2026-09-01&to=2026-09-16&limit=50"
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.nextCursor).toBe("next-1");
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

describe("GET /api/audit — paging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireEngineContext).mockResolvedValue(ctx as any);
  });

  it("passes the cursor through to the store", async () => {
    vi.mocked(listAuditLogs).mockResolvedValue({ entries: [], nextCursor: null } as any);
    const res = await GET(new NextRequest("http://localhost:3000/api/audit?cursor=abc"));
    expect(res.status).toBe(200);
    expect(vi.mocked(listAuditLogs).mock.calls[0][0]).toMatchObject({ cursor: "abc" });
    expect((await res.json()).nextCursor).toBeNull();
  });

  it("answers 400 for an invalid cursor", async () => {
    vi.mocked(listAuditLogs).mockRejectedValue(new RangeError("invalid audit cursor"));
    const res = await GET(new NextRequest("http://localhost:3000/api/audit?cursor=zzz"));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/audit (engine → web)", () => {
  beforeEach(() => vi.clearAllMocks());

  function post(body: unknown, secret = "s3cret") {
    return POST(
      new NextRequest("http://localhost:3000/api/audit", {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-secret": secret },
        body: JSON.stringify(body),
      })
    );
  }

  it("writes the entry into the named tenant's protocol", async () => {
    const res = await post({
      action: "document.upload",
      entity_type: "file",
      entity_id: "docs/a",
      brain_id: "brain_a",
    });
    expect(res.status).toBe(200);
    expect(vi.mocked(logAudit).mock.calls[0][2]).toMatchObject({
      brainId: "brain_a",
      entityId: "docs/a",
    });
  });

  it("falls back to the explicit system chain without brain_id", async () => {
    await post({ action: "document.upload", entity_type: "file" });
    expect(vi.mocked(logAudit).mock.calls[0][2]).toMatchObject({ brainId: "system" });
  });

  it("rejects a malformed brain_id", async () => {
    const res = await post({ action: "x", entity_type: "file", brain_id: "../evil" });
    expect(res.status).toBe(400);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("requires the internal secret", async () => {
    const res = await post({ action: "x", entity_type: "file" }, "wrong");
    expect(res.status).toBe(401);
  });
});
