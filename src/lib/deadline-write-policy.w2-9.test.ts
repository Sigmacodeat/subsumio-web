import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyDeadlineWritePolicy,
  planDeadlineArrayMutation,
  type DeadlineChangeEvent,
} from "./deadline-write-policy";

const NOW = "2026-09-24T09:00:00.000Z"; // Donnerstag, kein Feiertag

const matter = (deadlines: Array<Record<string, unknown>>) => ({
  type: "legal_case",
  frontmatter: { type: "legal_case", deadlines },
});
const assistant = { id: "u-a", email: "sek@k.example", name: "Sek", role: "assistant" };
const lawyer = { id: "u-l", email: "anw@k.example", name: "Anw", role: "lawyer" };
const open = { id: "d1", title: "Stellungnahme", due_date: "2026-10-09", status: "pending" };

describe("W2-9: removing a deadline", () => {
  it("the Sekretariat removes an open deadline only with a reason", () => {
    const refused = applyDeadlineWritePolicy({
      slug: "legal/cases/m1",
      incoming: { deadlines: [] },
      current: matter([open]),
      user: assistant,
      now: NOW,
    });
    expect("reject" in refused && refused.reject.error).toBe("deadline_delete_reason_required");

    const ok = applyDeadlineWritePolicy({
      slug: "legal/cases/m1",
      incoming: { deadlines: [], deadline_delete_reason: "Doppelt erfasst" },
      current: matter([open]),
      user: assistant,
      now: NOW,
    });
    if ("reject" in ok) throw new Error(ok.reject.message);
    expect(ok.frontmatter.deadline_delete_reason).toBeUndefined();
    expect(ok.events[0]).toMatchObject({ kind: "delete", reason: "Doppelt erfasst" });
  });

  it("a lawyer removes without a reason; done entries are only tidied", () => {
    const byLawyer = applyDeadlineWritePolicy({
      slug: "legal/cases/m1",
      incoming: { deadlines: [] },
      current: matter([open]),
      user: lawyer,
      now: NOW,
    });
    expect("reject" in byLawyer).toBe(false);
    const done = applyDeadlineWritePolicy({
      slug: "legal/cases/m1",
      incoming: { deadlines: [] },
      current: matter([{ ...open, status: "done" }]),
      user: assistant,
      now: NOW,
    });
    expect("reject" in done).toBe(false);
  });

  it("array remove by the Sekretariat needs the reason too", () => {
    const refused = planDeadlineArrayMutation(
      [open],
      { match: ["d1"], remove: true },
      assistant,
      "m1"
    );
    expect("reject" in refused && refused.reject.error).toBe("deadline_delete_reason_required");
    const ok = planDeadlineArrayMutation(
      [open],
      { match: ["d1"], remove: true, reason: "Irrtümlich angelegt" },
      assistant,
      "m1"
    );
    expect("reject" in ok).toBe(false);
  });
});

// ── Notfrist change → second persons are notified ─────────────────────────

const { persisted, members } = vi.hoisted(() => ({
  persisted: [] as Array<{ userId: string; data: { message: string } }>,
  members: [] as Array<Record<string, unknown>>,
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined), SYSTEM_BRAIN: "system" }));
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({
    getById: async (id: string) => members.find((m) => m.id === id) ?? null,
    listByOrg: async () => members,
  }),
}));
vi.mock("@/lib/comments", () => ({
  persistNotificationUpsert: vi.fn(async (n: { userId: string; data: { message: string } }) => {
    persisted.push(n);
  }),
}));

describe("W2-9: cancelling or moving a Notfrist notifies the other lawyers", () => {
  beforeEach(() => {
    persisted.length = 0;
    members.length = 0;
    members.push(
      { id: "u-l", name: "Anw", role: "lawyer", orgId: "o1" },
      { id: "u-l2", name: "Zweite", role: "lawyer", orgId: "o1" },
      { id: "u-adm", name: "Admin", role: "admin", orgId: "o1" },
      { id: "u-a", name: "Sek", role: "assistant", orgId: "o1" }
    );
  });

  it("notifies every other lawyer/admin, not the actor and not the Sekretariat", async () => {
    const { logDeadlineEvents } = await import("./deadline-audit");
    const event: DeadlineChangeEvent = {
      kind: "cancel",
      deadline_id: "legal/cases/m1#d9",
      title: "Berufung",
      is_notfrist: true,
      reason: "Rechtsmittelverzicht",
    };
    await logDeadlineEvents({ brainId: "b1", user: { id: "u-l" } }, [event]);
    expect(persisted.map((p) => p.userId).sort()).toEqual(["u-adm", "u-l2"]);
    expect(persisted[0].data.message).toContain("storniert");
    expect(persisted[0].data.message).toContain("Rechtsmittelverzicht");
  });

  it("an ordinary deadline change notifies nobody", async () => {
    const { logDeadlineEvents } = await import("./deadline-audit");
    await logDeadlineEvents({ brainId: "b1", user: { id: "u-l" } }, [
      { kind: "cancel", deadline_id: "x", title: "Termin", is_notfrist: false },
    ]);
    expect(persisted).toHaveLength(0);
  });
});
