// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  pages: new Map<
    string,
    { slug: string; title: string; content: string; frontmatter: Record<string, unknown> }
  >(),
  thinkAnswer: "```json\n{}\n```",
}));

const calls = vi.hoisted(() => ({
  headers: [] as Array<Record<string, string>>,
  think: [] as Array<Record<string, unknown>>,
}));

// All engine traffic goes through the caller's headers — never the browser
// client, which reaches the engine without tenant or identity.
vi.mock("@/lib/api", () => ({
  api: new Proxy(
    {},
    {
      get() {
        throw new Error("planning-session must not use the browser API client");
      },
    }
  ),
}));

vi.mock("@/lib/engine-think", () => ({
  engineThink: vi.fn(async (headers: Record<string, string>, req: Record<string, unknown>) => {
    calls.headers.push(headers);
    calls.think.push(req);
    return { answer: store.thinkAnswer, citations: [], gaps: [], warnings: [], revised: false };
  }),
}));

vi.mock("@/lib/engine-page-io", () => ({
  getEnginePage: vi.fn(async (headers: Record<string, string>, slug: string) => {
    calls.headers.push(headers);
    return store.pages.get(slug) ?? null;
  }),
  writeEnginePage: vi.fn(
    async (
      headers: Record<string, string>,
      p: { slug: string; title?: string; content?: string; frontmatter?: Record<string, unknown> },
      opts: { merge?: boolean } = {}
    ) => {
      calls.headers.push(headers);
      const existing = opts.merge ? store.pages.get(p.slug) : undefined;
      store.pages.set(p.slug, {
        title: "",
        content: "",
        frontmatter: {},
        ...(existing ?? {}),
        ...p,
      } as never);
    }
  ),
}));

vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: vi.fn(async (headers: Record<string, string>) => {
    calls.headers.push(headers);
    return [...store.pages.values()];
  }),
}));

const HEADERS = {
  "x-subsumio-source": "brain-1",
  "x-subsumio-identity-token": "signed-token",
};

import {
  createPlan,
  listPlans,
  loadPlan,
  markStepExecuted,
  proposeStepAction,
} from "./planning-session";

beforeEach(() => {
  store.pages.clear();
  calls.headers.length = 0;
  calls.think.length = 0;
  store.thinkAnswer =
    '{"title":"Mandatsprüfung","steps":[{"title":"Kollision prüfen","description":"Konfliktcheck","estimatedTime":"10 Min"},{"title":"Frist setzen","description":"Erhörungsfrist eintragen"}]}';
});

async function seedPlan() {
  const plan = await createPlan(HEADERS, { goal: "Mandat aufnehmen", caseSlug: "fall-1" });
  return plan;
}

describe("planning-session", () => {
  it("createPlan parses LLM steps and persists", async () => {
    const plan = await seedPlan();
    expect(plan.title).toBe("Mandatsprüfung");
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0].status).toBe("pending");
    const stored = store.pages.get(`copilot/plan/${plan.id}`);
    expect(stored?.frontmatter.type).toBe("copilot_plan");
  });

  it("proposeStepAction maps a step to a whitelisted tool and injects case_slug", async () => {
    const plan = await seedPlan();
    store.thinkAnswer =
      '{"tool":"create_deadline","params":{"title":"Erhörungsfrist"},"rationale":"Frist anlegen"}';
    const proposal = await proposeStepAction(HEADERS, plan.id, plan.steps[1].id);
    expect(proposal?.tool).toBe("create_deadline");
    expect(proposal?.params.case_slug).toBe("fall-1");
    const reloaded = await loadPlan(HEADERS, plan.id);
    expect(reloaded?.steps[1].suggested_tool).toBe("create_deadline");
  });

  it("proposeStepAction rejects non-whitelisted tool names", async () => {
    const plan = await seedPlan();
    store.thinkAnswer = '{"tool":"delete_everything","params":{},"rationale":"x"}';
    const proposal = await proposeStepAction(HEADERS, plan.id, plan.steps[0].id);
    expect(proposal?.tool).toBeNull();
  });

  it("proposeStepAction never offers sending an e-mail from matter content", async () => {
    const plan = await seedPlan();
    store.thinkAnswer =
      '{"tool":"send_email","params":{"to":["a@example.com"],"subject":"x","text":"y"},"rationale":"x"}';
    const proposal = await proposeStepAction(HEADERS, plan.id, plan.steps[0].id);
    expect(proposal?.tool).toBeNull();
    const think = calls.think[calls.think.length - 1] as { query: string };
    expect(think.query).not.toContain("send_email");
  });

  it("markStepExecuted completes step, records tool, advances index", async () => {
    const plan = await seedPlan();
    await markStepExecuted(HEADERS, plan.id, plan.steps[0].id, "search_cases", "Keine Kollision");
    const reloaded = await loadPlan(HEADERS, plan.id);
    expect(reloaded?.steps[0].status).toBe("completed");
    expect(reloaded?.steps[0].executed_tool).toBe("search_cases");
    expect(reloaded?.steps[0].notes).toBe("Keine Kollision");
    expect(reloaded?.currentStepIndex).toBe(1);
    expect(reloaded?.status).toBe("active");
  });

  it("markStepExecuted completes the plan when all steps are done", async () => {
    const plan = await seedPlan();
    await markStepExecuted(HEADERS, plan.id, plan.steps[0].id, "t", "a");
    await markStepExecuted(HEADERS, plan.id, plan.steps[1].id, "t", "b");
    const reloaded = await loadPlan(HEADERS, plan.id);
    expect(reloaded?.status).toBe("completed");
  });

  it("sends every engine call with the caller's identity-bearing headers", async () => {
    const plan = await seedPlan();
    await proposeStepAction(HEADERS, plan.id, plan.steps[0].id);
    await listPlans(HEADERS, { caseSlug: "fall-1" });
    expect(calls.headers.length).toBeGreaterThan(0);
    for (const h of calls.headers) expect(h).toBe(HEADERS);
  });

  it("scopes the planning answer to the plan's matter", async () => {
    await seedPlan();
    expect(calls.think[0]).toMatchObject({ caseSlug: "fall-1", queryMode: "deep_matter" });
  });
});
