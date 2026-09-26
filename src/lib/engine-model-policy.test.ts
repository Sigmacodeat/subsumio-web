// @vitest-environment node
//
// Every engine request states the firm's "Nur EU" policy, so the engine can
// refuse non-EU models for that firm (and remember it for server-side work).
import { describe, expect, test, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => new Map([["sb_session", { value: "tok" }]])),
}));
let sessionUid = "solo";
vi.mock("@/lib/auth/session", () => ({
  verifySession: vi.fn(async () => ({ uid: sessionUid })),
  SESSION_COOKIE: "sb_session",
}));
vi.mock("@/lib/env", () => ({ env: () => undefined }));
vi.mock("@/lib/auth/platform-operator", () => ({ isPlatformOperator: () => false }));
vi.mock("@/lib/support-session", () => ({ getActiveSupportSession: async () => null }));

const users: Record<string, Record<string, unknown>> = {
  solo: { id: "solo", plan: "pro", brainId: "b_solo" },
  euLawyer: { id: "euLawyer", plan: "team", brainId: "b_eu", orgId: "org-eu" },
  anyLawyer: { id: "anyLawyer", plan: "team", brainId: "b_any", orgId: "org-any" },
};
const orgs: Record<string, Record<string, unknown>> = {
  "org-eu": { id: "org-eu", brainId: "b_eu", ownerId: "euLawyer", modelPolicy: "eu_only" },
  "org-any": { id: "org-any", brainId: "b_any", ownerId: "anyLawyer" },
};
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({ getById: async (id: string) => users[id] ?? null, update: vi.fn() }),
  getOrgStore: () => ({
    getById: async (id: string) => orgs[id] ?? null,
    getByBrainId: async (b: string) =>
      Object.values(orgs).find((o) => (o as { brainId?: string }).brainId === b) ?? null,
  }),
}));

import { engineContext } from "./engine";

async function headersOf(uid: string) {
  sessionUid = uid;
  return (await engineContext())?.headers ?? {};
}

describe("model policy header", () => {
  test("a firm with Nur EU sends eu_only", async () => {
    expect((await headersOf("euLawyer"))["x-subsumio-model-policy"]).toBe("eu_only");
  });

  test("other firms and solo lawyers state 'any'", async () => {
    expect((await headersOf("anyLawyer"))["x-subsumio-model-policy"]).toBe("any");
    expect((await headersOf("solo"))["x-subsumio-model-policy"]).toBe("any");
  });
});
