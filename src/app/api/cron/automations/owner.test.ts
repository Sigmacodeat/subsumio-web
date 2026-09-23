// @vitest-environment node
/**
 * Automation rules run with their owner's matter access: an owner never
 * mails content of a matter they are walled from, rules whose owner left
 * are skipped, and e-mail rules without owner are paused visibly instead
 * of running as the whole firm.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const ENGINE = "http://engine.test";

const state = vi.hoisted(() => ({
  rules: [] as Array<{ slug: string; title: string; frontmatter: Record<string, unknown> }>,
  updates: [] as Array<Record<string, unknown>>,
  mails: [] as Array<{ to: string; subject: string }>,
  broadcasts: [] as Array<{ userId?: string; data: unknown }>,
  /** Matters each user is walled from. */
  walls: new Map<string, string[]>([["u-walled", ["cases/walled"]]]),
  activeUsers: new Set(["u-walled", "u-open"]),
}));

const CASES = [
  { slug: "cases/open", title: "Akte Offen", frontmatter: {} },
  { slug: "cases/walled", title: "Akte Geheim", frontmatter: {} },
];

vi.mock("@/lib/api-handler", () => ({
  createCronHandler: (fn: (req: NextRequest) => Promise<Response>) => fn,
}));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: (brainId: string) => ({ "x-subsumio-source": brainId }),
  engineHeadersForUserId: async (userId: string) =>
    state.activeUsers.has(userId)
      ? { headers: { "x-subsumio-source": "firm-a", "x-test-user": userId }, user: { id: userId } }
      : null,
}));
vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: async (headers: Record<string, string>, type: string) => {
    if (type === "automation") return state.rules;
    if (type !== "legal_case") return [];
    const walled = state.walls.get(headers["x-test-user"] ?? "") ?? [];
    return CASES.filter((c) => !walled.includes(c.slug));
  },
}));
vi.mock("@/lib/cron-utils", async (orig) => ({
  ...(await orig<typeof import("@/lib/cron-utils")>()),
  getRecipientsByBrain: async () => new Map([["firm-a", []]]),
  batchFetchPages: async () => ({ legal_case: CASES }),
}));
vi.mock("@/lib/mail", () => ({
  sendMail: async (m: { to: string; subject: string }) => {
    state.mails.push({ to: m.to, subject: m.subject });
  },
}));
vi.mock("@/lib/realtime-bus", () => ({
  broadcastSseEvent: (_b: string, _e: string, data: unknown) => state.broadcasts.push({ data }),
  broadcastSseEventToUser: (_b: string, userId: string, _e: string, data: unknown) =>
    state.broadcasts.push({ userId, data }),
}));

import { GET } from "./route";

function rulePage(
  slug: string,
  action: Record<string, unknown>,
  extra: Record<string, unknown> = {}
) {
  return {
    slug,
    title: slug,
    frontmatter: {
      type: "automation",
      enabled: true,
      event: "case.created",
      action,
      fired_keys: [],
      created_at: "2026-09-01T00:00:00Z",
      created_by: "x@kanzlei.at",
      ...extra,
    },
  };
}

beforeEach(() => {
  state.updates = [];
  state.mails = [];
  state.broadcasts = [];
  state.rules = [
    rulePage(
      "rule-owner-mail",
      { type: "send_mail", recipient: "extern@example.com", title: "Neu: {title}" },
      { owner_user_id: "u-walled" }
    ),
    rulePage("rule-legacy-mail", {
      type: "send_mail",
      recipient: "extern@example.com",
      title: "Alt: {title}",
    }),
    rulePage("rule-legacy-notify", { type: "notify", title: "Hinweis {title}" }),
    rulePage(
      "rule-gone-mail",
      { type: "send_mail", recipient: "extern@example.com", title: "Weg: {title}" },
      { owner_user_id: "u-deleted" }
    ),
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const headers = (init?.headers ?? {}) as Record<string, string>;
      if (u.startsWith(`${ENGINE}/api/pages?type=automation`)) {
        return Response.json({ pages: state.rules });
      }
      if (u === `${ENGINE}/api/pages` && init?.method === "POST") {
        state.updates.push(JSON.parse(String(init.body)));
        return Response.json({ ok: true });
      }
      const m = /\/api\/pages\/(.+)$/.exec(u);
      if (m) {
        const slug = decodeURIComponent(m[1]!);
        const walled = state.walls.get(headers["x-test-user"] ?? "") ?? [];
        return walled.includes(slug)
          ? new Response("not found", { status: 404 })
          : Response.json({ slug, title: slug, frontmatter: {} });
      }
      return new Response("unexpected", { status: 500 });
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cron/automations under ethical walls", () => {
  it("runs each rule as its owner, pauses ownerless mail rules, skips gone owners", async () => {
    const res = await GET(new Request("http://x/api/cron/automations") as unknown as NextRequest);
    const body = (await res.json()) as {
      dispatched: number;
      pausedRules: number;
      skippedRules: number;
    };

    // The owner is walled from cases/walled: only the open matter is mailed.
    expect(state.mails.map((m) => m.subject)).toEqual(["Neu: Akte Offen"]);
    // No legacy mail rule and no rule of a deleted owner sent anything.
    expect(state.mails.some((m) => m.subject.startsWith("Alt:"))).toBe(false);
    expect(state.mails.some((m) => m.subject.startsWith("Weg:"))).toBe(false);

    // The ownerless in-app rule still runs as before, firm-wide.
    expect(state.broadcasts).toHaveLength(2);
    expect(state.broadcasts.every((b) => b.userId === undefined)).toBe(true);

    // The ownerless mail rule is paused with a visible status.
    const paused = state.updates.find((u) => u.slug === "rule-legacy-mail");
    expect(paused?.frontmatter).toMatchObject({
      paused_reason: "owner_missing",
      status_message: "Besitzer fehlt — bitte neu speichern",
    });
    expect(body.pausedRules).toBe(1);
    expect(body.skippedRules).toBe(1);

    // The owner's rule remembers only what it actually fired for.
    const ownerUpdate = state.updates.find((u) => u.slug === "rule-owner-mail");
    expect((ownerUpdate?.frontmatter as { fired_keys: string[] }).fired_keys).toEqual([
      "case:cases/open",
    ]);
  });

  it("an owner's in-app notice about a matter reaches only the owner", async () => {
    state.rules = [
      rulePage(
        "rule-owner-notify",
        { type: "notify", title: "{title}" },
        { owner_user_id: "u-open" }
      ),
    ];
    await GET(new Request("http://x/api/cron/automations") as unknown as NextRequest);
    expect(state.broadcasts).toHaveLength(2);
    expect(state.broadcasts.every((b) => b.userId === "u-open")).toBe(true);
  });
});
