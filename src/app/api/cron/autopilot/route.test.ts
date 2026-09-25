// @vitest-environment node
//
// autopilot cron — before 2026-09-25 this ran once against a hardcoded
// "system" brain (not any real firm's data) and had no per-firm opt-in.
// These tests pin the fix: one scan per firm that opted in
// (kanzleiSettings.autopilotEnabled), each with its own budget, a firm
// whose settings can't be read is skipped (not assumed enabled), and a
// firm that never opted in sees the engine touched not at all.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const settingsByBrain = vi.hoisted(() => new Map<string, Record<string, unknown> | Error>());
const brains = vi.hoisted(() => new Map<string, unknown[]>());
const enginePages = vi.hoisted(() => new Map<string, Array<Record<string, unknown>>>());
const supervisorCalls = vi.hoisted(() => [] as Array<{ brainId: string; body: unknown }>);
const pagesTouched = vi.hoisted(() => [] as string[]);

vi.mock("@/lib/api-handler", () => ({
  createCronHandler: (h: (req: NextRequest) => Promise<Response>) => h,
}));
vi.mock("@/lib/cron-utils", () => ({
  getRecipientsByBrain: async () => brains,
}));

const FakeKanzleiSettingsUnavailableError = vi.hoisted(
  () => class FakeKanzleiSettingsUnavailableError extends Error {}
);
vi.mock("@/lib/kanzlei-settings-server", () => ({
  KanzleiSettingsUnavailableError: FakeKanzleiSettingsUnavailableError,
  loadKanzleiSettingsForBrain: async (brainId: string) => {
    const s = settingsByBrain.get(brainId);
    if (s instanceof Error) throw s;
    return s ?? {};
  },
}));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: (brainId: string) => ({ "x-subsumio-source": brainId }),
}));

import { POST } from "./route";

function req() {
  return POST(new NextRequest("http://localhost:3000/api/cron/autopilot", { method: "POST" }));
}

function intakePage(slug: string, urgency: string) {
  return { slug, frontmatter: { status: "new", urgency, legal_area: "", source: "" } };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  settingsByBrain.clear();
  brains.clear();
  enginePages.clear();
  supervisorCalls.length = 0;
  pagesTouched.length = 0;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      const brainId = (init?.headers as Record<string, string> | undefined)?.["x-subsumio-source"];
      if (u.pathname === "/api/agents/supervisor") {
        supervisorCalls.push({ brainId: brainId ?? "", body: JSON.parse(String(init?.body)) });
        return new Response(JSON.stringify({ jobId: 1 }), { status: 200 });
      }
      if (u.pathname === "/api/pages" && init?.method === "POST") {
        pagesTouched.push(brainId ?? "");
        return new Response("{}", { status: 200 });
      }
      if (u.pathname === "/api/pages") {
        const type = u.searchParams.get("type") ?? "";
        const key = `${brainId}:${type}`;
        return new Response(JSON.stringify(enginePages.get(key) ?? []), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    })
  );
});

describe("POST /api/cron/autopilot", () => {
  it("skips a firm that never opted in — the engine is never queried for it", async () => {
    brains.set("brain_off", [{ id: "u1" }]);
    settingsByBrain.set("brain_off", { autopilotEnabled: false });
    enginePages.set("brain_off:intake_request", [intakePage("legal/a", "high")]);

    const body = await (await req()).json();
    expect(body.brainsChecked).toBe(1);
    expect(body.brainsEnabled).toBe(0);
    expect(body.totalExecutions).toBe(0);
    expect(supervisorCalls).toHaveLength(0);
  });

  it("scans and fires for a firm that opted in, against its OWN brain — not the old hardcoded 'system' source", async () => {
    brains.set("brain_on", [{ id: "u1" }]);
    settingsByBrain.set("brain_on", { autopilotEnabled: true });
    enginePages.set("brain_on:intake_request", [intakePage("legal/urgent-case", "high")]);

    const body = await (await req()).json();
    expect(body.brainsEnabled).toBe(1);
    expect(body.totalExecutions).toBe(1);
    expect(supervisorCalls).toHaveLength(1);
    expect(supervisorCalls[0].brainId).toBe("brain_on");
    // Never finalized on its own — every execution is approval-gated.
    expect(supervisorCalls[0].body).toMatchObject({ approval_required: true, may_finalize: false });
    expect(pagesTouched).toEqual(["brain_on"]);
  });

  it("skips (fail-closed) a firm whose settings can't be read — never assumes enabled", async () => {
    brains.set("brain_broken", [{ id: "u1" }]);
    settingsByBrain.set("brain_broken", new FakeKanzleiSettingsUnavailableError("engine down"));
    enginePages.set("brain_broken:intake_request", [intakePage("legal/a", "high")]);

    const body = await (await req()).json();
    expect(body.brainsSkippedUnreadable).toBe(1);
    expect(body.brainsEnabled).toBe(0);
    expect(supervisorCalls).toHaveLength(0);
  });

  it("gives each enabled firm its own budget — one firm's spend never exhausts another's", async () => {
    vi.stubEnv("AUTOPILOT_NIGHTLY_BUDGET_CENTS", "5"); // one execution's worth (default est. cost 5c)
    brains.set("brain_1", [{ id: "u1" }]);
    brains.set("brain_2", [{ id: "u2" }]);
    settingsByBrain.set("brain_1", { autopilotEnabled: true });
    settingsByBrain.set("brain_2", { autopilotEnabled: true });
    // Both firms have TWO candidates each — a shared 5c budget could only
    // afford one execution total across both; a per-firm budget affords one
    // PER firm (two total).
    enginePages.set("brain_1:intake_request", [
      intakePage("legal/a1", "high"),
      intakePage("legal/a2", "high"),
    ]);
    enginePages.set("brain_2:intake_request", [
      intakePage("legal/b1", "high"),
      intakePage("legal/b2", "high"),
    ]);

    const body = await (await req()).json();
    const byBrain = Object.fromEntries(
      (body.perBrain as Array<{ brainId: string; executions: number }>).map((b) => [
        b.brainId,
        b.executions,
      ])
    );
    expect(byBrain.brain_1).toBe(1); // first candidate spends the 5c cap, second is budget-exhausted
    expect(byBrain.brain_2).toBe(1); // brain_2's own cap is untouched by brain_1's spend
    expect(body.totalExecutions).toBe(2);
  });

  it("the global kill switch still short-circuits before any brain is touched", async () => {
    vi.stubEnv("DISABLE_AUTOPILOT_CRON", "true");
    brains.set("brain_on", [{ id: "u1" }]);
    settingsByBrain.set("brain_on", { autopilotEnabled: true });

    const body = await (await req()).json();
    expect(body.disabled).toBe(true);
    expect(supervisorCalls).toHaveLength(0);
  });
});
