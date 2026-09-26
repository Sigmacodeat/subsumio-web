// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

let user: Record<string, unknown> = {};
const created: Array<Record<string, unknown>> = [];

vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { body?: { parse: (d: unknown) => unknown } },
      handler: (ctx: unknown, body: unknown) => Promise<Response>
    ) =>
    async (req: Request) =>
      handler(
        { brainId: "b1", user, headers: {} },
        opts.body ? opts.body.parse(await req.json()) : undefined
      ),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
}));

vi.mock("@/lib/auth/store", async (orig) => {
  const actual = await orig<typeof import("@/lib/auth/store")>();
  return {
    buildNewOrg: actual.buildNewOrg,
    toPublic: actual.toPublic,
    withInviteRevoked: actual.withInviteRevoked,
    getOrgStore: () => ({
      create: async (org: Record<string, unknown>) => {
        created.push(org);
        return org;
      },
    }),
    getStore: () => ({ update: async () => null }),
  };
});
vi.mock("@/lib/auth/firm-brain", () => ({ detachFromFirm: vi.fn() }));

import { POST } from "./route";

function found(jurisdiction: string) {
  user = { id: "u1", email: "u@k.at", brainId: "brain-u1", jurisdiction, orgId: null };
  return POST(
    new Request("http://x/api/org", {
      method: "POST",
      body: JSON.stringify({ name: "Kanzlei Muster" }),
    }) as never
  );
}

afterEach(() => {
  created.length = 0;
  vi.unstubAllEnvs();
});

describe("POST /api/org — EU-Datenmodus als Voreinstellung", () => {
  it("an AT firm starts EU-only when an EU model route is confirmed", async () => {
    vi.stubEnv("SUBSUMIO_EU_MODEL_ROUTE", "1");
    await found("AT");
    expect(created[0]!.modelPolicy).toBe("eu_only");
  });

  it("without an EU route the policy stays open (app remains usable)", async () => {
    vi.stubEnv("SUBSUMIO_EU_MODEL_ROUTE", "");
    vi.stubEnv("SUBSUMIO_EU_ONLY", "");
    await found("AT");
    expect(created[0]!.modelPolicy).toBeUndefined();
  });
});
