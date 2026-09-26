// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/engine", async (orig) => ({
  ...(await orig<typeof import("@/lib/engine")>()),
  ENGINE_URL: "http://engine-test:3001",
  engineHeadersForBrainWithMatterScope: () => ({ "x-subsumio-source": "firm-a" }),
}));

import { processIntent } from "./actions";

const ctx = {
  sender: { brainId: "firm-a", matterScope: "all", name: "Anwalt" },
} as unknown as Parameters<typeof processIntent>[0];

function engineAnswer(answer: Record<string, unknown> | null, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      answer ? Response.json(answer, { status }) : new Response("down", { status: 503 })
    )
  );
}

describe("chat conflict check (§ 10 RAO)", () => {
  beforeEach(() => vi.unstubAllGlobals());

  test("reads the engine's answer shape and lists hits for review", async () => {
    engineAnswer({
      name: "Meier",
      severity: "low",
      explanation: "Auf Gegnerseite in 1 Akte bekannt.",
      matches: [
        {
          slug: "legal/cases/x",
          title: "Akte X",
          role: "opponent",
          matched_name: "Meier",
          assessment: "review",
        },
      ],
    });
    const reply = await processIntent(ctx, { kind: "conflict_check", name: "Meier" });
    expect(reply).toContain("Treffer");
    expect(reply).toContain("Akte X (Gegner)");
    expect(reply).not.toContain("Kein Treffer");
  });

  test("an unavailable check never reads as 'kein Konflikt'", async () => {
    engineAnswer(null);
    const reply = await processIntent(ctx, { kind: "conflict_check", name: "Meier" });
    expect(reply).toContain("nicht verfügbar");
    expect(reply).not.toMatch(/Kein (Treffer|Konflikt)/);
  });
});
