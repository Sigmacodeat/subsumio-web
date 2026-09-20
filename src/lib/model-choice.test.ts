import { beforeEach, describe, expect, test, vi } from "vitest";

const users = new Map<string, { id: string; orgId?: string; preferredModel?: string | null }>();
const orgs = new Map<string, { id: string; modelPolicy?: "any" | "eu_only" }>();

vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({ getById: async (id: string) => users.get(id) ?? null }),
  getOrgStore: () => ({ getById: async (id: string) => orgs.get(id) ?? null }),
}));

import { resolveModelChoice } from "./model-choice";

beforeEach(() => {
  users.clear();
  orgs.clear();
  users.set("u1", { id: "u1", orgId: "o1" });
  orgs.set("o1", { id: "o1", modelPolicy: "any" });
});

describe("resolveModelChoice", () => {
  test("no pick and no preference means automatic routing", async () => {
    expect(await resolveModelChoice("u1", undefined)).toBeUndefined();
  });

  test("'auto' means automatic routing", async () => {
    users.set("u1", { id: "u1", orgId: "o1", preferredModel: "claude-opus-5" });
    expect(await resolveModelChoice("u1", "auto")).toBeUndefined();
  });

  test("the pick in the chat wins over the saved preference", async () => {
    users.set("u1", { id: "u1", orgId: "o1", preferredModel: "claude-opus-5" });
    expect(await resolveModelChoice("u1", "claude-haiku-4-5")).toBe("claude-haiku-4-5");
  });

  test("the saved preference applies when the chat sends no pick", async () => {
    users.set("u1", { id: "u1", orgId: "o1", preferredModel: "claude-opus-5" });
    expect(await resolveModelChoice("u1", undefined)).toBe("claude-opus-5");
  });

  test("an unknown or retired model falls back to automatic", async () => {
    expect(await resolveModelChoice("u1", "claude-sonnet-4-6")).toBeUndefined();
    expect(await resolveModelChoice("u1", "gpt-4o")).toBeUndefined();
  });

  test("the firm's EU-only policy blocks non-EU models", async () => {
    orgs.set("o1", { id: "o1", modelPolicy: "eu_only" });
    expect(await resolveModelChoice("u1", "claude-opus-5")).toBeUndefined();
    expect(await resolveModelChoice("u1", "mistral-large-3")).toBe("mistral-large-3");
  });
});
