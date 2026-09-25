// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  applyDeadlineArrayPolicy,
  applyDeadlineWritePolicy,
  checkDeadlinePageDelete,
  mutationTargets,
  planDeadlineArrayAppend,
  planDeadlineArrayMutation,
} from "./deadline-write-policy";

const lawyer = { id: "u1", email: "anwalt@example.com", name: "Anwalt", role: "lawyer" };
const colleague = { id: "u2", email: "kollegin@example.com", name: "Kollegin", role: "lawyer" };
const assistant = {
  id: "u3",
  email: "assistenz@example.com",
  name: "Assistenz",
  role: "assistant",
};
const NOW = "2026-09-25T10:00:00.000Z";

describe("FRI-6 — identity is stamped from the session", () => {
  it("a new deadline page gets created_by* of the signed-in user; client values are dropped", () => {
    const res = applyDeadlineWritePolicy({
      slug: "legal/deadlines/neu",
      type: "legal_deadline",
      incoming: { due_date: "2026-03-30", created_by: "fake", created_by_id: "fake-id" },
      current: null,
      user: lawyer,
      now: NOW,
    });
    if ("reject" in res) throw new Error("rejected");
    expect(res.frontmatter).toMatchObject({
      created_by: "anwalt@example.com",
      created_by_id: "u1",
      created_by_email: "anwalt@example.com",
    });
    expect(res.events[0]).toMatchObject({ kind: "create", deadline_id: "legal/deadlines/neu" });
  });

  it("stored identities survive a later write (a client cannot rewrite who created it)", () => {
    const res = applyDeadlineWritePolicy({
      slug: "legal/deadlines/f1",
      incoming: { created_by_id: "u2", title: "Neu" },
      current: { type: "legal_deadline", frontmatter: { created_by_id: "u1", title: "Alt" } },
      user: colleague,
    });
    if ("reject" in res) throw new Error("rejected");
    expect(res.frontmatter.created_by_id).toBe("u1");
  });

  it("approval stamps reviewed_by_id; completion stamps completed_by_id", () => {
    const approved = applyDeadlineWritePolicy({
      slug: "legal/deadlines/f1",
      incoming: { review_status: "approved", reviewed_by: "irgendwer", reviewed_by_id: "x" },
      current: { type: "legal_deadline", frontmatter: { review_status: "unreviewed" } },
      user: colleague,
    });
    if ("reject" in approved) throw new Error("rejected");
    expect(approved.frontmatter.reviewed_by_id).toBe("u2");
    expect(approved.frontmatter.reviewed_by).toBe("Kollegin");

    const done = applyDeadlineWritePolicy({
      slug: "legal/deadlines/f2",
      incoming: { status: "done" },
      current: { type: "legal_deadline", frontmatter: { status: "pending" } },
      user: lawyer,
    });
    if ("reject" in done) throw new Error("rejected");
    expect(done.frontmatter.completed_by_id).toBe("u1");
  });

  it("service identities (internal) are not stamped as a person", () => {
    const res = applyDeadlineWritePolicy({
      slug: "legal/deadlines/neu",
      type: "legal_deadline",
      incoming: { due_date: "2026-03-30" },
      current: null,
      user: { id: "internal", email: "internal@subsumio", role: "admin" },
    });
    if ("reject" in res) throw new Error("rejected");
    expect(res.frontmatter.created_by_id).toBeUndefined();
  });

  it("new matter entries get an id and a creator; unchanged entries produce no event", () => {
    const res = applyDeadlineArrayPolicy(
      [
        { id: "d1", title: "Alt", due_date: "2026-04-01" },
        { title: "Neu", due_date: "2026-05-01" },
      ],
      [{ id: "d1", title: "Alt", due_date: "2026-04-01" }],
      lawyer,
      "legal/cases/akte-1",
      NOW
    );
    if ("reject" in res) throw new Error("rejected");
    const [alt, neu] = res.deadlines as Array<Record<string, unknown>>;
    expect(alt.created_by_id).toBeUndefined();
    expect(typeof neu.id).toBe("string");
    expect(neu.created_by_id).toBe("u1");
    expect(res.events.map((e) => e.kind)).toEqual(["create"]);
  });
});

describe("FRI-7 — Notfristen are protected", () => {
  const notfrist = {
    status: "pending",
    is_notfrist: true,
    due_date: "2026-03-30",
    title: "Berufung",
  };

  it.each([
    ["cancel", { status: "cancelled" }],
    ["reject", { review_status: "rejected" }],
    ["move", { due_date: "2026-04-30" }],
  ])("%s without a reason → 422", (_label, change) => {
    const res = applyDeadlineWritePolicy({
      slug: "legal/deadlines/f1",
      incoming: change,
      current: { type: "legal_deadline", frontmatter: notfrist },
      user: lawyer,
    });
    expect("reject" in res && res.reject.status).toBe(422);
  });

  it("an assistant may not cancel a Notfrist even with a reason → 403", () => {
    const res = applyDeadlineWritePolicy({
      slug: "legal/deadlines/f1",
      incoming: { status: "cancelled", change_reason: "Doppelt erfasst" },
      current: { type: "legal_deadline", frontmatter: notfrist },
      user: assistant,
    });
    expect("reject" in res && res.reject.status).toBe(403);
  });

  it("a lawyer with a reason may cancel — the reason is logged, not stored as a field", () => {
    const res = applyDeadlineWritePolicy({
      slug: "legal/deadlines/f1",
      incoming: { status: "cancelled", change_reason: "Doppelt erfasst" },
      current: { type: "legal_deadline", frontmatter: notfrist },
      user: lawyer,
      now: NOW,
    });
    if ("reject" in res) throw new Error("rejected");
    expect(res.frontmatter.change_reason).toBeUndefined();
    expect(res.events[0]).toMatchObject({
      kind: "cancel",
      reason: "Doppelt erfasst",
      status_before: "pending",
      status_after: "cancelled",
      is_notfrist: true,
    });
  });

  it("an ordinary deadline can be cancelled without a reason", () => {
    const res = applyDeadlineWritePolicy({
      slug: "legal/deadlines/f3",
      incoming: { status: "cancelled" },
      current: {
        type: "legal_deadline",
        frontmatter: { status: "pending", due_date: "2026-03-30" },
      },
      user: assistant,
    });
    expect("reject" in res).toBe(false);
  });

  it("a Notfrist dropped from a matter's list is refused; a cancelled one may be removed", () => {
    const refused = applyDeadlineArrayPolicy([], [{ id: "d1", ...notfrist }], lawyer, "c");
    expect("reject" in refused && refused.reject.status).toBe(403);
    const ok = applyDeadlineArrayPolicy(
      [],
      [{ id: "d1", ...notfrist, status: "cancelled" }],
      lawyer,
      "c"
    );
    expect("reject" in ok).toBe(false);
  });

  it("a legacy entry without id keeps its identity when the client adds one", () => {
    const res = applyDeadlineArrayPolicy(
      [{ id: "dl-new", ...notfrist }],
      [{ ...notfrist }],
      lawyer,
      "c"
    );
    expect("reject" in res).toBe(false);
  });

  it("deleting a live Notfrist page is refused", () => {
    expect(checkDeadlinePageDelete(notfrist)?.status).toBe(403);
    expect(checkDeadlinePageDelete({ ...notfrist, status: "cancelled" })).toBeNull();
    expect(checkDeadlinePageDelete({ status: "pending" })).toBeNull();
  });
});

describe("FRI-15 — server-side history with before/after", () => {
  it("rebuilds the entry history from storage and appends the server entry", () => {
    const res = applyDeadlineArrayPolicy(
      [
        {
          id: "d1",
          title: "Termin",
          due_date: "2026-04-02",
          audit_log: [{ at: "fake", action: "forged" }],
        },
      ],
      [
        {
          id: "d1",
          title: "Termin",
          due_date: "2026-04-01",
          audit_log: [{ at: "t0", action: "created" }],
        },
      ],
      lawyer,
      "legal/cases/akte-1",
      NOW
    );
    if ("reject" in res) throw new Error("rejected");
    const entry = (res.deadlines as Array<Record<string, unknown>>)[0];
    expect(entry.audit_log).toEqual([
      { at: "t0", action: "created" },
      expect.objectContaining({
        at: NOW,
        action: "update",
        actor_id: "u1",
        due_date_before: "2026-04-01",
        due_date_after: "2026-04-02",
        server: true,
      }),
    ]);
    expect(res.events[0]).toMatchObject({
      deadline_id: "legal/cases/akte-1#d1",
      due_date_before: "2026-04-01",
      due_date_after: "2026-04-02",
    });
  });
});

describe("FRI-8 — atomic array ops are judged per entry", () => {
  const stored = [
    { id: "d1", title: "Berufung", due_date: "2026-03-30", is_notfrist: true, status: "pending" },
    { id: "d2", title: "Termin", due_date: "2026-04-01", status: "pending" },
  ];

  it("selects elements like the engine (text match + unless)", () => {
    expect(mutationTargets(stored, { match: ["d2"] }).map((d) => d.id)).toEqual(["d2"]);
    expect(
      mutationTargets(stored, {
        match: ["Termin"],
        match_key: "title",
        unless: { ne: { due_date: "2026-04-01" } },
      }).map((d) => d.id)
    ).toEqual(["d2"]);
    expect(
      mutationTargets(stored, {
        match: ["Termin"],
        match_key: "title",
        unless: { ne: { due_date: "2026-05-05" } },
      })
    ).toEqual([]);
  });

  it("plans one id-addressed mutation per entry with the policy's stamps", () => {
    const plan = planDeadlineArrayMutation(
      stored,
      { match: ["d2"], set: { review_status: "approved" } },
      colleague,
      "legal/cases/akte-1",
      NOW
    );
    if ("reject" in plan) throw new Error("rejected");
    expect(plan.perEntry).toHaveLength(1);
    expect(plan.perEntry[0].id).toBe("d2");
    expect(plan.perEntry[0].set).toMatchObject({
      review_status: "approved",
      reviewed_by_id: "u2",
    });
    expect(plan.perEntry[0].set?.audit_log).toHaveLength(1);
  });

  it("refuses to move a Notfrist atomically without a reason, and to remove it", () => {
    const moved = planDeadlineArrayMutation(
      stored,
      { match: ["d1"], set: { due_date: "2026-04-30" } },
      lawyer,
      "c"
    );
    expect("reject" in moved && moved.reject.status).toBe(422);
    const removed = planDeadlineArrayMutation(stored, { match: ["d1"], remove: true }, lawyer, "c");
    expect("reject" in removed && removed.reject.status).toBe(403);
  });

  it("appended entries are stamped like a create", () => {
    const plan = planDeadlineArrayAppend(
      [{ title: "Neu", due_date: "2026-05-01", created_by_id: "fake" }],
      lawyer,
      "c",
      NOW
    );
    if ("reject" in plan) throw new Error("rejected");
    const item = plan.items[0] as Record<string, unknown>;
    expect(item.created_by_id).toBe("u1");
    expect(typeof item.id).toBe("string");
    expect(plan.events[0].kind).toBe("create");
  });
});

describe("FRI-7/FRI-8 — identity of matter entries across writes", () => {
  it("an entry sent without the id the server assigned keeps that id (no delete + create)", () => {
    const res = applyDeadlineArrayPolicy(
      [{ title: "Berufung", due_date: "2026-03-30", is_notfrist: true, status: "pending" }],
      [
        {
          id: "d1",
          title: "Berufung",
          due_date: "2026-03-30",
          is_notfrist: true,
          status: "pending",
        },
      ],
      lawyer,
      "c"
    );
    if ("reject" in res) throw new Error("rejected");
    expect((res.deadlines[0] as Record<string, unknown>).id).toBe("d1");
    expect(res.events).toEqual([]);
  });
});
