// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// Grounding (CitationPanel), the source-support check and the norm reader sit
// next to every AI answer: every role that may see an AI answer must reach
// them, not only those allowed to start a paid research run.
const { declared } = vi.hoisted(() => ({ declared: [] as Array<{ action: string }> }));

vi.mock("@/lib/api-handler", () => ({
  createHandler: (opts: { action: string }) => {
    declared.push(opts);
    return async () => new Response(null);
  },
}));
vi.mock("@/lib/citation-gate", () => ({ groundAnswerCitations: vi.fn() }));
vi.mock("@/lib/legal-grounding", () => ({ readNorm: vi.fn() }));

import { can } from "@/lib/permissions";
import type { User } from "@/lib/auth/store";

describe("grounding routes — action per route", () => {
  it("ground, support and norm are open to the assistant role", async () => {
    await import("./route");
    await import("../support/route");
    await import("../norm/route");
    const actions = declared.map((d) => d.action);
    expect(actions).toContain("legal.ground");
    expect(actions).toContain("legal.statute");
    expect(actions).not.toContain("legal.research");
    const assistant = { id: "a", role: "assistant" } as User;
    for (const action of actions) {
      expect(can(assistant, action as Parameters<typeof can>[1])).toBe(true);
    }
    const client = { id: "c", role: "client_viewer" } as User;
    for (const action of actions) {
      expect(can(client, action as Parameters<typeof can>[1])).toBe(false);
    }
  });
});
