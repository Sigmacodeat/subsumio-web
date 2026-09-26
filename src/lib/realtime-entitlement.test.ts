// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

let user: any;
let blocked = false;
let brain: string | null = "firm-brain";
vi.mock("@/lib/auth/store", () => ({ getStore: () => ({ getById: async () => user }) }));
vi.mock("@/lib/auth/account-status", () => ({ isAccountBlocked: async () => blocked }));
vi.mock("@/lib/engine", () => ({ firmBrainIdFor: async () => brain }));

import { sseStreamStillAllowed } from "./realtime-entitlement";

const stream = { userId: "u1", brainId: "firm-brain", role: "lawyer" };

beforeEach(() => {
  user = { id: "u1", role: "lawyer", orgId: "org-1", brainId: "own" };
  blocked = false;
  brain = "firm-brain";
});

describe("sseStreamStillAllowed", () => {
  it("keeps a stream of an unchanged member", async () => {
    expect(await sseStreamStillAllowed(stream)).toBe(true);
  });
  it("ends it after deactivation", async () => {
    blocked = true;
    expect(await sseStreamStillAllowed(stream)).toBe(false);
  });
  it("ends it after removal from the firm", async () => {
    brain = "own";
    expect(await sseStreamStillAllowed(stream)).toBe(false);
  });
  it("ends it after a role change", async () => {
    user.role = "client_viewer";
    expect(await sseStreamStillAllowed(stream)).toBe(false);
  });
  it("ends it when the account cannot be read (fail closed)", async () => {
    user = null;
    expect(await sseStreamStillAllowed(stream)).toBe(false);
  });
});
