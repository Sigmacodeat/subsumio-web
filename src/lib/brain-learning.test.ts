// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const data = vi.hoisted(() => ({
  orgs: [
    { id: "o-on", brainId: "org_on" },
    { id: "o-off", brainId: "org_off", brainLearning: false },
    { id: "o-true", brainId: "org_true", brainLearning: true },
  ] as Array<Record<string, unknown>>,
  users: [
    // Member of a firm that learns: their personal flag is ignored.
    { id: "m1", orgId: "o-on", brainId: "brain_m1", brainLearning: false },
    { id: "m2", orgId: "o-off", brainId: "brain_m2" },
    { id: "solo-off", orgId: null, brainId: "brain_solo_off", brainLearning: false },
    { id: "solo-on", orgId: null, brainId: "brain_solo_on" },
    // Firm record gone → works alone → own flag counts.
    { id: "dangling", orgId: "o-gone", brainId: "brain_dangling", brainLearning: false },
  ] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/auth/store", () => ({
  getOrgStore: () => ({
    list: async () => data.orgs,
    getById: async (id: string) => data.orgs.find((o) => o.id === id) ?? null,
  }),
  getStore: () => ({ list: async () => data.users }),
}));

import { firmLearningState, isLearningOn, learningDisabledBrainIds } from "./brain-learning";

describe("brain-learning", () => {
  it("only an explicit false switches learning off", () => {
    expect(isLearningOn(undefined)).toBe(true);
    expect(isLearningOn(null)).toBe(true);
    expect(isLearningOn(true)).toBe(true);
    expect(isLearningOn(false)).toBe(false);
  });

  it("the firm decides for its members; solo lawyers decide for themselves", async () => {
    expect(await firmLearningState({ orgId: "o-on", brainLearning: false })).toMatchObject({
      enabled: true,
      scope: "org",
    });
    expect(await firmLearningState({ orgId: "o-off" })).toMatchObject({
      enabled: false,
      scope: "org",
    });
    expect(await firmLearningState({ orgId: null, brainLearning: false })).toMatchObject({
      enabled: false,
      scope: "solo",
    });
  });

  it("lists the brains of every firm that switched learning off", async () => {
    expect((await learningDisabledBrainIds()).sort()).toEqual([
      "brain_dangling",
      "brain_solo_off",
      "org_off",
    ]);
  });
});
