// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const audits = vi.hoisted(() => [] as Array<{ action: string; brainId?: string }>);
const schedule = vi.hoisted(() => ({ impl: null as null | (() => Promise<unknown>) }));

vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { body: { safeParse: (d: unknown) => { success: boolean; data?: unknown } } },
      handler: (ctx: unknown, b: unknown, q: unknown, req: unknown) => Promise<Response>
    ) =>
    async (req: Request) => {
      const parsed = opts.body.safeParse(await req.json());
      if (!parsed.success) return Response.json({ error: "validation" }, { status: 400 });
      return handler(
        { user: { id: "op", email: "op@subsum.io" } },
        parsed.data,
        {},
        Object.assign(req, { params: Promise.resolve({ id: "org-1" }) })
      );
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
}));
vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(async (action: string, _t: string, o?: { brainId?: string }) => {
    audits.push({ action, brainId: o?.brainId });
  }),
}));
vi.mock("@/lib/tenants", () => ({
  getTenant: async () => ({ id: "org-1", kind: "org", name: "K", brainId: "brain-firm" }),
}));
vi.mock("@/lib/tenant-admin", () => ({
  TenantAdminFailure: class extends Error {},
  reactivateTenant: vi.fn(),
  setMemberRole: vi.fn(),
  suspendTenant: vi.fn(),
  tenantAdminMessage: () => "",
  transferOwnership: vi.fn(),
}));
vi.mock("@/lib/firm-deletion", async () => {
  class FirmDeletionRefused extends Error {
    constructor(
      readonly code: string,
      message: string,
      readonly status: number
    ) {
      super(message);
    }
  }
  return {
    FirmDeletionRefused,
    scheduleFirmDeletion: () => schedule.impl!(),
    cancelFirmDeletion: vi.fn(async () => ({ restored: 2 })),
  };
});

import { PATCH } from "./route";
import { FirmDeletionRefused } from "@/lib/firm-deletion";

const patch = (body: unknown) =>
  (PATCH as unknown as (r: Request) => Promise<Response>)(
    new Request("http://x/api/admin/tenants/org-1", {
      method: "PATCH",
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  audits.length = 0;
});

describe("PATCH /api/admin/tenants/<id> — firm data deletion (contract end)", () => {
  it("schedules the deletion and writes an audit entry under the firm's brain", async () => {
    schedule.impl = async () => ({
      scheduledFor: "2026-10-26T00:00:00.000Z",
      membersDeactivated: 3,
    });
    const res = await patch({
      action: "schedule_deletion",
      reason: "Vertrag gekündigt zum 30.09.",
    });
    expect(res.status).toBe(200);
    expect(audits).toEqual([{ action: "admin.tenant_deletion_scheduled", brainId: "brain-firm" }]);
  });

  it("answers 409 under legal hold and writes no audit entry", async () => {
    schedule.impl = async () => {
      throw new FirmDeletionRefused("legal_hold_active", "Legal Hold", 409);
    };
    const res = await patch({
      action: "schedule_deletion",
      reason: "Vertrag gekündigt zum 30.09.",
    });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("legal_hold_active");
    expect(audits).toEqual([]);
  });

  it("requires a reason", async () => {
    expect((await patch({ action: "schedule_deletion", reason: "kurz" })).status).toBe(400);
  });
});
