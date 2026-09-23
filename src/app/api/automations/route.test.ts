// @vitest-environment node
/**
 * /api/automations is the one surface the UI uses for rules: saving stamps
 * the saver as owner, a saved rule starts a new cutoff (no replay), rules of
 * the old UI model are listed read-only until the cron takes them over and
 * are taken over in place when someone saves them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { createFakeEngine, type FakeEngine } from "@/test/fake-engine-pages";

const ENGINE = "http://engine.test";

const state = vi.hoisted(() => ({ userId: "u-anna" }));

vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { body?: { parse: (d: unknown) => unknown } },
      handler: (ctx: unknown, body: unknown) => Promise<Response>
    ) =>
    async (req: Request) => {
      const ctx = {
        brainId: "firm-a",
        headers: { "x-subsumio-source": "firm-a", "x-test-user": state.userId },
        user: { id: state.userId, role: "lawyer", email: `${state.userId}@kanzlei.at` },
      };
      const body = opts.body ? opts.body.parse(await req.json()) : {};
      return handler(ctx, body);
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
}));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: (brainId: string) => ({ "x-subsumio-source": brainId }),
  engineHeadersForUserId: async () => null,
}));
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({
    getById: async (id: string) =>
      id === "u-anna" ? { id, email: "anna@kanzlei.at", name: "Anna Anwältin" } : null,
    getByEmail: async () => null,
  }),
}));

import { DELETE, GET, PATCH, POST } from "./route";

let engine: FakeEngine;

function req(method: string, body?: unknown) {
  return new Request("http://x/api/automations", {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  state.userId = "u-anna";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-23T10:00:00.000Z"));
  engine = createFakeEngine(ENGINE, () => new Date().toISOString());
  vi.stubGlobal("fetch", vi.fn(engine.fetch));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("/api/automations", () => {
  it("creating a rule makes the creator its owner and starts its cutoff now", async () => {
    const res = await POST(
      req("POST", {
        name: "Fristen",
        event: "deadline_approaching", // old UI name is accepted
        within_days: 3,
        actions: [
          { type: "create_task", title: "Frist vorbereiten", due_in_days: 2, message: "" },
          { type: "set_status", status: "pending" },
        ],
      })
    );
    expect(res.status).toBe(200);
    const { rule } = (await res.json()).data;
    const page = engine.pages.get(rule.slug)!;
    expect(page.type).toBe("automation");
    expect(page.frontmatter).toMatchObject({
      event: "deadline.due_soon",
      within_days: 3,
      owner_user_id: "u-anna",
      active_since: "2026-09-23T10:00:00.000Z",
      enabled: true,
      actions: [
        { type: "create_task", title: "Frist vorbereiten", due_in_days: 2 },
        { type: "set_status", status: "pending" },
      ],
    });
  });

  it("rejects actions that lack what they need", async () => {
    const res = await POST(
      req("POST", { name: "Mail", event: "case.created", actions: [{ type: "send_mail" }] })
    );
    expect(res.status).toBe(400);
    expect(engine.writes).toHaveLength(0);
  });

  it("saving someone else's paused rule makes the saver owner and resumes it without replay", async () => {
    engine.put({
      slug: "automation-mail",
      title: "Mail",
      type: "automation",
      frontmatter: {
        enabled: true,
        event: "invoice.overdue",
        actions: [{ type: "send_mail", recipient: "buchhaltung@kanzlei.at" }],
        created_at: "2026-09-01T00:00:00.000Z",
        created_by: "x@kanzlei.at",
        paused_reason: "owner_missing",
        status_message: "Besitzer fehlt — bitte neu speichern",
        fired_keys: ["invoice:inv/1"],
      },
    });
    state.userId = "u-bernd";
    const res = await PATCH(req("PATCH", { slug: "automation-mail" }));
    expect(res.status).toBe(200);
    const fm = engine.pages.get("automation-mail")!.frontmatter;
    expect(fm.owner_user_id).toBe("u-bernd");
    expect(fm.paused_reason).toBeUndefined();
    expect(fm.status_message).toBeUndefined();
    expect(fm.active_since).toBe("2026-09-23T10:00:00.000Z");
    expect(fm.fired_keys).toEqual(["invoice:inv/1"]);
  });

  it("lists rules with owner, pause reason and not-yet-migrated UI rules — without writing", async () => {
    engine.put({
      slug: "automation-a",
      title: "A",
      type: "automation",
      frontmatter: {
        enabled: true,
        event: "case.created",
        actions: [{ type: "notify" }],
        created_at: "2026-09-20T00:00:00.000Z",
        created_by: "anna@kanzlei.at",
        owner_user_id: "u-anna",
        active_since: "2026-09-20T00:00:00.000Z",
        last_run_at: "2026-09-22T00:00:00.000Z",
      },
    });
    engine.put({
      slug: "automation-b",
      title: "B",
      type: "automation",
      frontmatter: {
        enabled: true,
        event: "case.created",
        actions: [{ type: "send_mail", recipient: "a@b.at" }],
        created_at: "2026-09-19T00:00:00.000Z",
        created_by: "x",
        paused_reason: "owner_missing",
      },
    });
    engine.put({
      slug: "legal/automation-rules/old",
      title: "Alt",
      type: "automation_rule",
      frontmatter: {
        name: "Alt",
        trigger: { type: "invoice_overdue" },
        actions: [{ type: "notify_kanzlei" }],
        created_by: "anna@kanzlei.at",
        created_at: "2026-09-01T00:00:00.000Z",
      },
    });
    const res = await GET(req("GET"));
    const { rules } = (await res.json()).data as {
      rules: Array<Record<string, unknown>>;
    };
    const by = (slug: string) => rules.find((r) => r.slug === slug)!;
    expect(by("automation-a")).toMatchObject({
      owner_name: "Anna Anwältin",
      last_run_at: "2026-09-22T00:00:00.000Z",
    });
    expect(by("automation-b").status_message).toBe("Besitzer fehlt — bitte neu speichern");
    expect(by("legal/automation-rules/old")).toMatchObject({
      pending_migration: true,
      event: "invoice.overdue",
      actions: [{ type: "notify" }],
    });
    expect(by("legal/automation-rules/old").fired_keys).toBeUndefined();
    // Listing never writes — only the cron and a human save migrate.
    expect(engine.writes).toHaveLength(0);
  });

  it("saving a not-yet-migrated UI rule takes it over in place", async () => {
    engine.put({
      slug: "legal/automation-rules/old",
      title: "Alt",
      type: "automation_rule",
      frontmatter: {
        name: "Alt",
        enabled: true,
        trigger: { type: "document_uploaded" },
        actions: [{ type: "create_task", text: "Ablegen" }],
        created_by: "x@kanzlei.at",
        created_at: "2026-09-01T00:00:00.000Z",
      },
    });
    const res = await PATCH(req("PATCH", { slug: "legal/automation-rules/old", enabled: false }));
    expect(res.status).toBe(200);
    const page = engine.pages.get("legal/automation-rules/old")!;
    expect(page.type).toBe("automation");
    expect(page.frontmatter).toMatchObject({
      event: "document.uploaded",
      enabled: false,
      owner_user_id: "u-anna",
      migrated_from: "automation_rule",
      actions: [{ type: "create_task", title: "Ablegen" }],
    });
    expect(page.frontmatter.trigger).toBeUndefined();
    expect([...engine.pages.values()].filter((p) => p.type === "automation")).toHaveLength(1);
  });

  it("deletes only rules, never another page named by the caller", async () => {
    engine.put({ slug: "cases/a", title: "A", type: "legal_case", frontmatter: {} });
    expect((await DELETE(req("DELETE", { slug: "cases/a" }))).status).toBe(404);
    expect(engine.pages.get("cases/a")!.deleted).toBeUndefined();

    engine.put({
      slug: "automation-x",
      title: "X",
      type: "automation",
      frontmatter: { event: "case.created", actions: [{ type: "notify" }] },
    });
    expect((await DELETE(req("DELETE", { slug: "automation-x" }))).status).toBe(200);
    expect(engine.pages.get("automation-x")!.deleted).toBe(true);
  });
});
