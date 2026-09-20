// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const listed = vi.hoisted(() => [] as string[]);

vi.mock("@/lib/api-handler", () => ({
  createCronHandler: (h: (req: NextRequest) => Promise<Response>) => h,
}));
vi.mock("@/lib/cron-utils", () => ({
  getRecipientsByBrain: async () =>
    new Map([
      ["org_on", [{ id: "u1" }]],
      ["org_off", [{ id: "u2" }]],
    ]),
}));
vi.mock("@/lib/brain-learning", () => ({ learningDisabledBrainIds: async () => ["org_off"] }));
vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: vi.fn(async (headers: Record<string, string>) => {
    listed.push(headers["x-subsumio-source"]);
    return [];
  }),
}));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: (b: string) => ({ "x-subsumio-source": b }),
  enginePatchPage: vi.fn(async () => new Response("{}")),
}));

import { GET } from "./route";

beforeEach(() => {
  listed.length = 0;
});

describe("auto-playbook cron", () => {
  it("skips firms that switched 'Kanzlei-Gehirn lernt mit' off", async () => {
    const res = await GET(new NextRequest("http://x/api/cron/auto-playbook"));
    const body = await res.json();
    expect(listed).toEqual(["org_on"]);
    expect(body).toMatchObject({ brains_checked: 1, brains_learning_off: 1 });
  });
});
