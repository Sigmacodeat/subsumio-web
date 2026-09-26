// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Org, User } from "@/lib/auth/store";

const users = new Map<string, User>();
const orgs = new Map<string, Org>();
const revoked: string[] = [];
const audits: string[] = [];

vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({
    getById: async (id: string) => users.get(id) ?? null,
    listByOrg: async (orgId: string) => [...users.values()].filter((u) => u.orgId === orgId),
    update: async (id: string, patch: Partial<User>) => {
      const next = { ...users.get(id)!, ...patch };
      users.set(id, next);
      return next;
    },
  }),
  getOrgStore: () => ({
    list: async () => [...orgs.values()],
    update: async (id: string, patch: Partial<Org>) => {
      const next = { ...orgs.get(id)!, ...patch };
      orgs.set(id, next);
      return next;
    },
  }),
}));
vi.mock("@/lib/auth/session", () => ({
  revokeAllSessions: async (id: string) => void revoked.push(id),
}));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine",
  engineHeadersForBrain: (b: string) => ({ "x-subsumio-source": b }),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async (a: string) => void audits.push(a)) }));
vi.mock("@/lib/legal-hold-check", () => ({ checkFirmLegalHolds: vi.fn() }));
vi.mock("@/lib/firm-retention-check", () => ({
  checkFirmRetention: vi.fn(),
  retainedMessage: () => "aufbewahrungspflichtig — Export",
}));

import {
  cancelFirmDeletion,
  FirmDeletionRefused,
  purgeScheduledFirmDeletions,
  scheduleFirmDeletion,
} from "./firm-deletion";
import type { Tenant } from "./tenants";

const clear = vi.fn(async () => ({ status: "clear" as const }));
const NOW = new Date("2026-09-26T10:00:00Z");

function tenant(): Tenant {
  const org = orgs.get("org-1")!;
  return {
    id: org.id,
    kind: "org",
    name: org.name,
    brainId: org.brainId,
    ownerId: org.ownerId,
    createdAt: org.createdAt,
    billing: { ownerId: org.ownerId, ownerType: "user" },
    org,
  };
}

async function refusal(p: Promise<unknown>) {
  try {
    await p;
    return "ok";
  } catch (err) {
    return err instanceof FirmDeletionRefused ? `${err.status}:${err.code}` : String(err);
  }
}

beforeEach(() => {
  users.clear();
  orgs.clear();
  revoked.length = 0;
  audits.length = 0;
  orgs.set("org-1", {
    id: "org-1",
    name: "Kanzlei",
    brainId: "brain-firm",
    ownerId: "u-a",
    createdAt: "2026-01-01",
  } as Org);
  for (const id of ["u-a", "u-b"]) {
    users.set(id, { id, email: `${id}@x.at`, orgId: "org-1", role: "lawyer" } as User);
  }
});

describe("scheduleFirmDeletion (operator, contract end)", () => {
  it("schedules 30 days ahead and deactivates every member", async () => {
    const r = await scheduleFirmDeletion(
      tenant(),
      { reason: "Vertrag gekündigt zum 30.09.", operatorEmail: "op@subsum.io" },
      { checkHolds: clear, checkRetention: clear, now: () => NOW }
    );
    expect(r).toEqual({ scheduledFor: "2026-10-26T10:00:00.000Z", membersDeactivated: 2 });
    expect(orgs.get("org-1")!.deletionScheduledFor).toBe("2026-10-26T10:00:00.000Z");
    expect(users.get("u-b")!.deactivatedAt).toBeTruthy();
    expect(revoked.sort()).toEqual(["u-a", "u-b"]);
  });

  it("is refused under legal hold, with retained records or open matters, and when unclear", async () => {
    const input = { reason: "Vertrag gekündigt zum 30.09.", operatorEmail: "op@subsum.io" };
    expect(
      await refusal(
        scheduleFirmDeletion(tenant(), input, {
          checkHolds: async () => ({ status: "held", cases: ["c"] }),
          checkRetention: clear,
        })
      )
    ).toBe("409:legal_hold_active");
    expect(
      await refusal(
        scheduleFirmDeletion(tenant(), input, {
          checkHolds: clear,
          checkRetention: async () => ({
            status: "retained",
            cases: [],
            receipts: 0,
            until: null,
            openCases: ["offen"],
          }),
        })
      )
    ).toBe("409:retention_period_running");
    expect(
      await refusal(
        scheduleFirmDeletion(tenant(), input, {
          checkHolds: async () => ({ status: "unknown" }),
          checkRetention: clear,
        })
      )
    ).toBe("503:legal_hold_unknown");
    expect(orgs.get("org-1")!.deletionScheduledFor).toBeUndefined();
    expect(users.get("u-a")!.deactivatedAt).toBeUndefined();
  });

  it("a cancellation restores the members it deactivated", async () => {
    await scheduleFirmDeletion(
      tenant(),
      { reason: "Vertrag gekündigt zum 30.09.", operatorEmail: "op@subsum.io" },
      { checkHolds: clear, checkRetention: clear }
    );
    expect(await cancelFirmDeletion(tenant())).toEqual({ restored: 2 });
    expect(orgs.get("org-1")!.deletionScheduledFor).toBeNull();
    expect(users.get("u-a")!.deactivatedAt).toBeNull();
  });
});

describe("purgeScheduledFirmDeletions (cron)", () => {
  function due() {
    orgs.set("org-1", {
      ...orgs.get("org-1")!,
      deletionScheduledFor: "2026-09-01T00:00:00.000Z",
      deletionReason: "Vertragsende",
    });
  }
  const report = () => ({ failed: 0, errors: [] as string[], skippedHold: 0 });

  it("purges the firm brain once due and nothing must be kept; audit entry", async () => {
    due();
    const purgeBrain = vi.fn(async () => undefined);
    const n = await purgeScheduledFirmDeletions(report(), {
      checkHolds: clear,
      checkRetention: clear,
      purgeBrain,
      now: () => NOW,
    });
    expect(n).toBe(1);
    expect(purgeBrain).toHaveBeenCalledWith("brain-firm");
    expect(orgs.get("org-1")!.dataDeletedAt).toBeTruthy();
    expect(users.get("u-a")!.deletedAt).toBeTruthy();
    expect(audits).toContain("admin.tenant_data_deleted");
  });

  it("re-checks: a hold placed during the grace period keeps the data", async () => {
    due();
    const purgeBrain = vi.fn();
    const rep = report();
    const n = await purgeScheduledFirmDeletions(rep, {
      checkHolds: async () => ({ status: "held", cases: ["c"] }),
      checkRetention: clear,
      purgeBrain,
      now: () => NOW,
    });
    expect(n).toBe(0);
    expect(rep.skippedHold).toBe(1);
    expect(purgeBrain).not.toHaveBeenCalled();
    expect(orgs.get("org-1")!.dataDeletedAt).toBeUndefined();
  });

  it("does nothing before the date", async () => {
    orgs.set("org-1", { ...orgs.get("org-1")!, deletionScheduledFor: "2026-12-01T00:00:00.000Z" });
    const purgeBrain = vi.fn();
    expect(
      await purgeScheduledFirmDeletions(report(), {
        checkHolds: clear,
        checkRetention: clear,
        purgeBrain,
        now: () => NOW,
      })
    ).toBe(0);
    expect(purgeBrain).not.toHaveBeenCalled();
  });

  it("a failed engine purge is an error and leaves the firm unmarked", async () => {
    due();
    const rep = report();
    await purgeScheduledFirmDeletions(rep, {
      checkHolds: clear,
      checkRetention: clear,
      purgeBrain: async () => {
        throw new Error("HTTP 500");
      },
      now: () => NOW,
    });
    expect(rep.failed).toBe(1);
    expect(orgs.get("org-1")!.dataDeletedAt).toBeUndefined();
  });
});
