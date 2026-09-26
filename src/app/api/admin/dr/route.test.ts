/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment node
// /api/admin/dr shows the real backup/restore-verification status from the
// backup container's status files, and its POST no longer pretends to run
// anything (non-2xx → no audit entry).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 }),
}));
vi.mock("@/lib/engine", async () => ({
  ENGINE_URL: "http://engine.test",
  engineConfigurationResponse: () => null,
  requireEngineContext: vi.fn(),
}));
vi.mock("@/lib/auth/api-key-auth", () => ({ verifyApiKey: vi.fn().mockResolvedValue(null) }));

import { GET, POST } from "./route";
import { requireEngineContext } from "@/lib/engine";
import { logAudit } from "@/lib/audit";

const OPERATOR = {
  id: "op_1",
  email: "ops@subsumio.example",
  role: "admin",
  twoFactorEnabled: true,
  emailVerifiedAt: "2026-01-01T00:00:00.000Z",
};

function req(method: "GET" | "POST") {
  return new NextRequest("http://localhost:3000/api/admin/dr", {
    method,
    headers: {
      host: "ops.subsum.io",
      "Content-Type": "application/json",
      "x-csrf-token": "t",
      cookie: "sb_csrf=t",
    },
    ...(method === "POST" ? { body: JSON.stringify({ action: "create_backup" }) } : {}),
  });
}

let dir = "";
beforeEach(() => {
  vi.clearAllMocks();
  dir = mkdtempSync(join(tmpdir(), "dr-status-"));
  vi.stubEnv("PLATFORM_OPERATOR_EMAILS", OPERATOR.email);
  vi.mocked(requireEngineContext).mockResolvedValue({
    headers: {},
    brainId: "brain_operator",
    plan: "team",
    user: OPERATOR,
  } as any);
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe("GET /api/admin/dr", () => {
  it("reports the last backup and restore verification from the status files", async () => {
    const at = new Date(Date.now() - 2 * 3_600_000).toISOString();
    writeFileSync(
      join(dir, "last-success"),
      JSON.stringify({ at, offsite: true, files: "offsite" })
    );
    writeFileSync(
      join(dir, "last-verify"),
      JSON.stringify({ at, passed: true, pages: 1234, cases: 5, files: 9 })
    );
    vi.stubEnv("BACKUP_STATUS_FILE", join(dir, "last-success"));
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status.configured).toBe(true);
    expect(body.status.last_backup_at).toBe(at);
    expect(body.status.backup_ok).toBe(true);
    expect(body.status.backup_offsite).toBe(true);
    expect(body.status.last_drill_passed).toBe(true);
    expect(body.status.last_drill_pages).toBe(1234);
  });

  it("does not report ok for a local-only backup and says when nothing is wired up", async () => {
    writeFileSync(
      join(dir, "last-success"),
      JSON.stringify({ at: new Date().toISOString(), offsite: false, files: "local" })
    );
    vi.stubEnv("BACKUP_STATUS_FILE", join(dir, "last-success"));
    const local = await (await GET(req("GET"))).json();
    expect(local.status.backup_ok).toBe(false);
    expect(local.status.last_drill_passed).toBeNull();

    vi.stubEnv("BACKUP_STATUS_FILE", "");
    const none = await (await GET(req("GET"))).json();
    expect(none.status.configured).toBe(false);
    expect(none.status.last_backup_at).toBeNull();
  });
});

describe("POST /api/admin/dr", () => {
  it("answers 501 and writes no audit entry", async () => {
    const res = await POST(req("POST"));
    expect(res.status).toBe(501);
    expect(logAudit).not.toHaveBeenCalled();
  });
});
