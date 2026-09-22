// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  pages: new Map<
    string,
    { slug: string; title: string; content: string; frontmatter: Record<string, unknown> }
  >(),
  thinkAnswer: "```json\n{}\n```",
}));

vi.mock("@/lib/api", () => ({
  api: {
    query: { think: vi.fn(async () => ({ answer: store.thinkAnswer })) },
    brain: {
      createPage: vi.fn(
        async (p: {
          slug: string;
          title: string;
          content: string;
          frontmatter: Record<string, unknown>;
        }) => {
          store.pages.set(p.slug, { ...p });
          return p;
        }
      ),
      getPage: vi.fn(async (slug: string) => store.pages.get(slug) ?? null),
      listPages: vi.fn(async () => [...store.pages.values()]),
      updatePage: vi.fn(
        async (p: { slug: string; content: string; frontmatter: Record<string, unknown> }) => {
          const existing = store.pages.get(p.slug);
          store.pages.set(p.slug, { ...(existing ?? { title: "" }), ...p });
          return p;
        }
      ),
    },
  },
}));

import { createPlan, loadPlan, markStepExecuted, proposeStepAction } from "./planning-session";

beforeEach(() => {
  store.pages.clear();
  store.thinkAnswer =
    '{"title":"Mandatsprüfung","steps":[{"title":"Kollision prüfen","description":"Konfliktcheck","estimatedTime":"10 Min"},{"title":"Frist setzen","description":"Erhörungsfrist eintragen"}]}';
});

async function seedPlan() {
  const plan = await createPlan({ goal: "Mandat aufnehmen", caseSlug: "fall-1" });
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
    const proposal = await proposeStepAction(plan.id, plan.steps[1].id);
    expect(proposal?.tool).toBe("create_deadline");
    expect(proposal?.params.case_slug).toBe("fall-1");
    const reloaded = await loadPlan(plan.id);
    expect(reloaded?.steps[1].suggested_tool).toBe("create_deadline");
  });

  it("proposeStepAction rejects non-whitelisted tool names", async () => {
    const plan = await seedPlan();
    store.thinkAnswer = '{"tool":"delete_everything","params":{},"rationale":"x"}';
    const proposal = await proposeStepAction(plan.id, plan.steps[0].id);
    expect(proposal?.tool).toBeNull();
  });

  it("markStepExecuted completes step, records tool, advances index", async () => {
    const plan = await seedPlan();
    await markStepExecuted(plan.id, plan.steps[0].id, "search_cases", "Keine Kollision");
    const reloaded = await loadPlan(plan.id);
    expect(reloaded?.steps[0].status).toBe("completed");
    expect(reloaded?.steps[0].executed_tool).toBe("search_cases");
    expect(reloaded?.steps[0].notes).toBe("Keine Kollision");
    expect(reloaded?.currentStepIndex).toBe(1);
    expect(reloaded?.status).toBe("active");
  });

  it("markStepExecuted completes the plan when all steps are done", async () => {
    const plan = await seedPlan();
    await markStepExecuted(plan.id, plan.steps[0].id, "t", "a");
    await markStepExecuted(plan.id, plan.steps[1].id, "t", "b");
    const reloaded = await loadPlan(plan.id);
    expect(reloaded?.status).toBe("completed");
  });
});
