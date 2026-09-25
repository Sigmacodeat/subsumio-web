// @vitest-environment node
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  brainId: "brain-b",
  session: true as boolean,
  file: null as null | { content: string; metadata: Record<string, unknown> },
}));

vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (_opts: unknown, handler: (ctx: unknown, body: unknown, q: unknown, req: Request) => unknown) =>
    async (req: Request) =>
      handler(
        {
          headers: { "x-subsumio-source": state.brainId },
          brainId: state.brainId,
          user: { id: "op", email: "ops@test" },
          ...(state.session ? { supportSession: { orgId: "o", orgName: "Kanzlei" } } : {}),
        },
        await req.json().catch(() => ({})),
        {},
        req
      ),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
}));
vi.mock("@/lib/backup", async () => {
  const actual = await vi.importActual<typeof import("@/lib/backup")>("@/lib/backup");
  return {
    backupOriginBrainId: actual.backupOriginBrainId,
    getBackupFile: vi.fn(async () => state.file),
    deleteBackup: vi.fn(),
  };
});

import { POST } from "./route";

const fetchMock = vi.fn(async () => Response.json({ ok: true }));

function backupOf(brainId: string | null) {
  return {
    content: JSON.stringify({
      export_metadata: { type: "full_backup", ...(brainId ? { brain_id: brainId } : {}) },
      pages: [{ slug: "akten/a-1", title: "A 1", type: "case", content: "x", frontmatter: {} }],
    }),
    metadata: brainId ? { id: "backup_1", brainId } : { id: "backup_1" },
  };
}

function restore(body: Record<string, unknown> = {}) {
  const req = new Request("http://x/api/admin/backup/backup_1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ confirm: true, reason: "Datenverlust nach Fehlbedienung", ...body }),
  });
  (req as unknown as { params: Promise<{ id: string }> }).params = Promise.resolve({
    id: "backup_1",
  });
  return (POST as unknown as (r: NextRequest) => Promise<Response>)(req as NextRequest);
}

beforeEach(() => {
  state.brainId = "brain-b";
  state.session = true;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

describe("POST /api/admin/backup/[id] (restore)", () => {
  it("refuses to restore a backup of firm A into firm B — no engine writes", async () => {
    state.file = backupOf("brain-a");
    const res = await restore();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("backup_tenant_mismatch");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses older backups without a recorded firm", async () => {
    state.file = backupOf(null);
    const res = await restore();
    expect(res.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses outside a support session", async () => {
    state.session = false;
    state.file = backupOf("brain-b");
    const res = await restore();
    expect(res.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("restores into the firm the backup came from", async () => {
    state.file = backupOf("brain-b");
    const res = await restore();
    expect(res.status).toBe(200);
    expect((await res.json()).restored).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
