// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeEngine, type FakeEngine } from "@/test/fake-engine-pages";

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: (brainId: string) => ({ "x-subsumio-source": brainId }),
  engineHeadersForUserId: async () => null,
}));
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({ getByEmail: async () => null, getById: async () => null }),
}));

import { legacyRuleToAutomation, migrateLegacyAutomationRules } from "./automation-migration";

const NOW = new Date("2026-09-23T10:00:00.000Z");

function legacyPage(frontmatter: Record<string, unknown>, slug = "legal/automation-rules/r1") {
  return { slug, title: "Regel", type: "automation_rule", frontmatter };
}

describe("legacyRuleToAutomation", () => {
  it("maps trigger and actions onto the one model with a cutoff at migration time", () => {
    const rule = legacyRuleToAutomation(
      legacyPage({
        name: "Fristen",
        enabled: false,
        trigger: { type: "deadline_approaching", days: 3 },
        actions: [
          { type: "create_task", text: "Vorbereiten", dueInDays: 2 },
          { type: "notify_kanzlei", text: "Frist naht" },
          { type: "set_status", status: "pending" },
        ],
        created_by: "anna@kanzlei.at",
        created_at: "2026-09-01T00:00:00.000Z",
        fired_keys: ["deadline:cases/a:d1"],
      }),
      { now: NOW, ownerUserId: "u-anna" }
    );
    expect(rule).toEqual({
      slug: "legal/automation-rules/r1",
      name: "Fristen",
      enabled: false,
      event: "deadline.due_soon",
      within_days: 3,
      actions: [
        { type: "create_task", title: "Vorbereiten", due_in_days: 2 },
        // Never executed as mail before — it does not start sending mail now.
        { type: "notify", message: "Frist naht" },
        { type: "set_status", status: "pending" },
      ],
      fired_keys: [],
      created_at: "2026-09-01T00:00:00.000Z",
      created_by: "anna@kanzlei.at",
      owner_user_id: "u-anna",
      active_since: NOW.toISOString(),
      migrated_from: "automation_rule",
    });
  });

  it("drops invalid statuses and skips dead or foreign pages", () => {
    const onlyBadStatus = legacyPage({
      trigger: { type: "case_created" },
      actions: [{ type: "set_status", status: "review" }],
    });
    expect(legacyRuleToAutomation(onlyBadStatus, { now: NOW })).toBeNull();
    const tombstoned = legacyPage({
      status: "tombstoned",
      trigger: { type: "case_created" },
      actions: [{ type: "create_task" }],
    });
    expect(legacyRuleToAutomation(tombstoned, { now: NOW })).toBeNull();
    expect(
      legacyRuleToAutomation(
        {
          ...legacyPage({ trigger: { type: "case_created" }, actions: [{ type: "create_task" }] }),
          type: "automation",
        },
        { now: NOW }
      )
    ).toBeNull();
  });
});

describe("migrateLegacyAutomationRules", () => {
  let engine: FakeEngine;

  beforeEach(() => {
    engine = createFakeEngine("http://engine.test", () => NOW.toISOString());
    vi.stubGlobal("fetch", vi.fn(engine.fetch));
    engine.put({
      ...legacyPage({
        trigger: { type: "booking_created" },
        actions: [{ type: "notify_kanzlei" }],
        created_by: "anna@kanzlei.at",
      }),
    });
    engine.put({
      ...legacyPage(
        { trigger: { type: "bogus" }, actions: [{ type: "notify_kanzlei" }] },
        "legal/automation-rules/kaputt"
      ),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("is idempotent: re-types in place once, a second run finds nothing", async () => {
    const owner = vi.fn(async () => "u-anna");
    const first = await migrateLegacyAutomationRules("firm-a", owner, NOW);
    expect(first).toEqual({ migrated: ["legal/automation-rules/r1"], failed: [] });
    expect(owner).toHaveBeenCalledWith("anna@kanzlei.at");
    const page = engine.pages.get("legal/automation-rules/r1")!;
    expect(page.type).toBe("automation");
    expect(page.frontmatter.owner_user_id).toBe("u-anna");

    const second = await migrateLegacyAutomationRules("firm-a", owner, NOW);
    expect(second).toEqual({ migrated: [], failed: [] });
    expect([...engine.pages.values()].filter((p) => p.type === "automation")).toHaveLength(1);
    // An invalid old rule is left untouched, not silently turned into something.
    expect(engine.pages.get("legal/automation-rules/kaputt")!.type).toBe("automation_rule");
  });

  it("a failed write leaves the rule in the old model for the next run", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) =>
        init?.method === "POST" ? new Response("down", { status: 503 }) : engine.fetch(url, init)
      )
    );
    const res = await migrateLegacyAutomationRules("firm-a", async () => undefined, NOW);
    expect(res).toEqual({ migrated: [], failed: ["legal/automation-rules/r1"] });
    expect(engine.pages.get("legal/automation-rules/r1")!.type).toBe("automation_rule");
  });
});
