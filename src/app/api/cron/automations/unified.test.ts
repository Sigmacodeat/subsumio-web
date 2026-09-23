// @vitest-environment node
/**
 * One rule model end to end: a rule created in the UI before the model was
 * unified (page type `automation_rule`, never executed) is taken over by the
 * cron exactly once, runs as its creator, does NOT replay anything that
 * existed before it became executable, and fires each new event once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { createFakeEngine, type FakeEngine } from "@/test/fake-engine-pages";

const ENGINE = "http://engine.test";

const state = vi.hoisted(() => ({
  clock: "2026-09-23T10:00:00.000Z",
  users: new Map([
    ["u-anna", { id: "u-anna", email: "anna@kanzlei.at", name: "Anna", brainId: "firm-a" }],
  ]) as Map<string, { id: string; email: string; name: string; brainId: string }>,
  mails: [] as Array<{ to: string; subject: string }>,
  broadcasts: [] as Array<{ userId?: string; data: Record<string, unknown> }>,
}));

vi.mock("@/lib/api-handler", () => ({
  createCronHandler: (fn: (req: NextRequest) => Promise<Response>) => fn,
}));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: (brainId: string) => ({ "x-subsumio-source": brainId }),
  engineHeadersForUserId: async (userId: string) => {
    const u = state.users.get(userId);
    return u
      ? { headers: { "x-subsumio-source": u.brainId, "x-test-user": userId }, user: u }
      : null;
  },
}));
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({
    getByEmail: async (email: string) =>
      [...state.users.values()].find((u) => u.email === email.trim().toLowerCase()) ?? null,
    getById: async (id: string) => state.users.get(id) ?? null,
  }),
}));
vi.mock("@/lib/cron-utils", async (orig) => ({
  ...(await orig<typeof import("@/lib/cron-utils")>()),
  getRecipientsByBrain: async () => new Map([["firm-a", []]]),
}));
vi.mock("@/lib/mail", () => ({
  sendMail: async (m: { to: string; subject: string }) => {
    state.mails.push({ to: m.to, subject: m.subject });
  },
}));
vi.mock("@/lib/realtime-bus", () => ({
  broadcastSseEvent: (_b: string, _e: string, data: Record<string, unknown>) =>
    state.broadcasts.push({ data }),
  broadcastSseEventToUser: (
    _b: string,
    userId: string,
    _e: string,
    data: Record<string, unknown>
  ) => state.broadcasts.push({ userId, data }),
}));

import { GET } from "./route";

let engine: FakeEngine;

async function runCron() {
  const res = await GET(new Request("http://x/api/cron/automations") as unknown as NextRequest);
  return (await res.json()) as {
    dispatched: number;
    migratedRules: number;
    errors: string[];
  };
}

function tasksOf(slug: string): Array<{ text: string; source?: string }> {
  return (engine.pages.get(slug)?.frontmatter.tasks as Array<{ text: string }>) ?? [];
}

beforeEach(() => {
  state.clock = "2026-09-23T10:00:00.000Z";
  state.mails = [];
  state.broadcasts = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(state.clock));
  engine = createFakeEngine(ENGINE, () => new Date().toISOString());
  vi.stubGlobal("fetch", vi.fn(engine.fetch));

  // A rule saved in the old UI — never executed.
  engine.put({
    slug: "legal/automation-rules/r1",
    title: "Erstgespräch",
    type: "automation_rule",
    created_at: "2026-09-10T08:00:00.000Z",
    frontmatter: {
      name: "Erstgespräch",
      enabled: true,
      trigger: { type: "case_created" },
      actions: [
        { type: "create_task", text: "Erstgespräch {title}", dueInDays: 3 },
        { type: "notify_kanzlei" },
      ],
      fired_keys: [],
      created_by: "anna@kanzlei.at",
      created_at: "2026-09-10T08:00:00.000Z",
    },
  });
  // Matters that existed long before the fix.
  engine.put({
    slug: "cases/alt",
    title: "Alt",
    type: "legal_case",
    created_at: "2026-01-05T09:00:00.000Z",
    frontmatter: { status: "open" },
  });
  // A matter whose creation time is unknown (e.g. an older engine).
  engine.put({
    slug: "cases/ohne-datum",
    title: "Ohne Datum",
    type: "legal_case",
    created_at: "",
    frontmatter: { status: "open" },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("cron/automations — UI rules are executed, without replaying history", () => {
  it("takes over a UI rule once, runs it as its creator, fires only on new events", async () => {
    // Run 1: take over + inventory. Nothing that already existed fires.
    const first = await runCron();
    expect(first.errors).toEqual([]);
    expect(first.migratedRules).toBe(1);
    expect(first.dispatched).toBe(0);
    const rule = engine.pages.get("legal/automation-rules/r1")!;
    expect(rule.type).toBe("automation");
    expect(rule.frontmatter).toMatchObject({
      event: "case.created",
      owner_user_id: "u-anna",
      active_since: "2026-09-23T10:00:00.000Z",
      baseline_done_for: "2026-09-23T10:00:00.000Z",
      migrated_from: "automation_rule",
      actions: [
        { type: "create_task", title: "Erstgespräch {title}", due_in_days: 3 },
        { type: "notify" },
      ],
    });
    expect(rule.frontmatter.trigger).toBeUndefined();
    // The matter with unknown creation time is remembered, the old one ignored.
    expect(rule.frontmatter.fired_keys).toEqual(["case:cases/ohne-datum"]);
    expect(tasksOf("cases/alt")).toEqual([]);
    expect(tasksOf("cases/ohne-datum")).toEqual([]);
    expect(state.broadcasts).toEqual([]);

    // Run 2: idempotent — no second take-over, still nothing replayed.
    const second = await runCron();
    expect(second.migratedRules).toBe(0);
    expect(second.dispatched).toBe(0);
    expect([...engine.pages.values()].filter((p) => p.type === "automation")).toHaveLength(1);

    // A new matter after the rule became executable fires — once.
    vi.setSystemTime(new Date("2026-09-23T10:30:00.000Z"));
    engine.put({ slug: "cases/neu", title: "Neu", type: "legal_case", frontmatter: {} });
    vi.setSystemTime(new Date("2026-09-23T11:00:00.000Z"));
    const third = await runCron();
    expect(third.errors).toEqual([]);
    expect(third.dispatched).toBe(1);
    expect(tasksOf("cases/neu").map((t) => t.text)).toEqual(["Erstgespräch Neu"]);
    expect(tasksOf("cases/neu")[0]!.source).toBe("automation:legal/automation-rules/r1");
    // The in-app notice about a matter goes to the owner only.
    expect(state.broadcasts).toHaveLength(1);
    expect(state.broadcasts[0]!.userId).toBe("u-anna");
    expect(state.broadcasts[0]!.data.message).toBe("Neue Akte angelegt: Neu");
    expect(engine.pages.get("legal/automation-rules/r1")!.frontmatter).toMatchObject({
      last_run_at: "2026-09-23T11:00:00.000Z",
    });

    const fourth = await runCron();
    expect(fourth.dispatched).toBe(0);
    expect(tasksOf("cases/neu")).toHaveLength(1);
    expect(tasksOf("cases/alt")).toEqual([]);
  });

  it("a rule's first run executes events that happened after its cutoff", async () => {
    // Engine reports creation times: a matter created between saving the
    // rule and the next cron run is new — it fires right away.
    engine.pages.delete("legal/automation-rules/r1");
    engine.put({
      slug: "automation-neu-1",
      title: "Neu angelegt",
      type: "automation",
      frontmatter: {
        enabled: true,
        event: "case.created",
        actions: [{ type: "create_task", title: "Prüfen {title}" }],
        created_at: "2026-09-23T09:00:00.000Z",
        created_by: "anna@kanzlei.at",
        owner_user_id: "u-anna",
        active_since: "2026-09-23T09:00:00.000Z",
      },
    });
    engine.put({
      slug: "cases/dazwischen",
      title: "Dazwischen",
      type: "legal_case",
      created_at: "2026-09-23T09:30:00.000Z",
      frontmatter: {},
    });
    const res = await runCron();
    expect(res.dispatched).toBe(1);
    expect(tasksOf("cases/dazwischen").map((t) => t.text)).toEqual(["Prüfen Dazwischen"]);
    expect(tasksOf("cases/alt")).toEqual([]);
  });

  it("records a failing action as the rule's last error", async () => {
    engine.pages.delete("legal/automation-rules/r1");
    engine.put({
      slug: "automation-status",
      title: "Status",
      type: "automation",
      frontmatter: {
        enabled: true,
        event: "booking.created",
        // A booking belongs to no matter — the status cannot be set.
        actions: [{ type: "set_status", status: "pending" }],
        created_at: "2026-09-23T09:00:00.000Z",
        created_by: "anna@kanzlei.at",
        owner_user_id: "u-anna",
        active_since: "2026-09-23T09:00:00.000Z",
      },
    });
    engine.put({
      slug: "bookings/b1",
      title: "Termin",
      type: "booking",
      created_at: "2026-09-23T09:30:00.000Z",
      frontmatter: { client_name: "Eva" },
    });
    await runCron();
    const fm = engine.pages.get("automation-status")!.frontmatter;
    expect(fm.last_error).toMatch(/set_status/);
    expect(fm.last_error_at).toBe("2026-09-23T10:00:00.000Z");
    // Not marked as handled: nothing ran for it.
    expect(fm.fired_keys ?? []).toEqual([]);
  });

  it("pauses a rule whose owner left, visibly, and resumes it once the owner is back", async () => {
    engine.pages.delete("legal/automation-rules/r1");
    engine.put({
      slug: "automation-weg",
      title: "Weg",
      type: "automation",
      frontmatter: {
        enabled: true,
        event: "case.created",
        actions: [{ type: "notify" }],
        created_at: "2026-09-23T09:00:00.000Z",
        created_by: "x@kanzlei.at",
        owner_user_id: "u-weg",
        active_since: "2026-09-23T09:00:00.000Z",
      },
    });
    await runCron();
    expect(engine.pages.get("automation-weg")!.frontmatter).toMatchObject({
      paused_reason: "owner_inactive",
      status_message: "Besitzer nicht mehr in der Kanzlei aktiv — bitte neu speichern",
    });
    state.users.set("u-weg", { id: "u-weg", email: "x@kanzlei.at", name: "X", brainId: "firm-a" });
    await runCron();
    expect(engine.pages.get("automation-weg")!.frontmatter.paused_reason).toBeUndefined();
    state.users.delete("u-weg");
  });
});
