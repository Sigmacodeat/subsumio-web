// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// The encryption module reads its key at import time.
vi.hoisted(() => {
  process.env.SUBSUMIO_ENCRYPTION_KEY = "test-key-test-key-test-key-12345";
});

const patches: Array<{ slug: string; frontmatter: Record<string, unknown> }> = [];
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  enginePatchPage: vi.fn(
    async (_h: unknown, p: { slug: string; frontmatter: Record<string, unknown> }) => {
      patches.push(p);
      return new Response("{}", { status: 200 });
    }
  ),
}));
const listEnginePages = vi.fn();
const health = vi.hoisted(() => ({
  reset: vi.fn(async (..._a: unknown[]) => undefined),
  streaks: vi.fn(async (..._a: unknown[]): Promise<Record<string, number>> => ({})),
}));
vi.mock("@/lib/webhook-health", () => ({
  WEBHOOK_AUTO_DISABLE_THRESHOLD: 10,
  resetWebhookFailures: (...a: unknown[]) => health.reset(...a),
  getWebhookFailureStreaks: (...a: unknown[]) => health.streaks(...a),
}));
vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: (...a: unknown[]) => listEnginePages(...a),
}));
vi.mock("@/lib/api-handler", async (orig) => {
  const real = await orig<typeof import("@/lib/api-handler")>();
  return {
    ...real,
    createHandler:
      (
        opts: {
          body?: { parse: (v: unknown) => unknown };
          query?: { parse: (v: unknown) => unknown };
        },
        handler: (ctx: unknown, body: unknown, query: unknown) => Promise<Response>
      ) =>
      async (req: Request) => {
        const url = new URL(req.url);
        const body =
          (req.method === "POST" || req.method === "PATCH") && opts.body
            ? opts.body.parse(await req.json())
            : undefined;
        const query = opts.query ? opts.query.parse(Object.fromEntries(url.searchParams)) : {};
        return handler(
          { brainId: "brain_1", headers: { "x-subsumio-source": "brain_1" }, user: {} },
          body,
          query
        );
      },
  };
});

import { DELETE, GET, PATCH, POST } from "./route";
import { setEgressHostResolver } from "@/lib/security/egress";

const SECRET = "super-geheimer-signaturschluessel";
let posted: Array<Record<string, unknown>>;
let engineStatus = 200;

beforeEach(() => {
  patches.length = 0;
  posted = [];
  engineStatus = 200;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      posted.push(JSON.parse(String(init?.body)));
      return new Response("{}", { status: engineStatus });
    })
  );
});

function register(url = "https://hooks.example.at/x") {
  return POST(
    new Request("http://x/api/webhooks/outgoing", {
      method: "POST",
      body: JSON.stringify({
        url,
        events: ["case.created"],
        secret: SECRET,
      }),
    }) as never
  );
}

describe("/api/webhooks/outgoing", () => {
  it("stores the signing secret only in encrypted form", async () => {
    const res = await register();
    expect(res.status).toBe(200);
    expect(JSON.stringify(posted[0])).not.toContain(SECRET);
    const fm = posted[0].frontmatter as Record<string, unknown>;
    expect(fm.secret).toBeUndefined();
    expect(typeof fm.secret_enc).toBe("string");
  });

  it.each([
    "http://127.0.0.1/x",
    "http://10.0.0.5/x",
    "https://169.254.169.254/latest",
    "http://hooks.example.at/x",
  ])("rejects the non-public or non-https target %s with 400", async (url) => {
    const res = await register(url);
    expect(res.status).toBe(400);
    expect(posted).toHaveLength(0);
  });

  it("rejects a host name that resolves to an internal address", async () => {
    setEgressHostResolver(async () => ["10.0.0.7"]);
    try {
      const res = await register("https://intern.example.at/x");
      expect(res.status).toBe(400);
      expect(posted).toHaveLength(0);
    } finally {
      setEgressHostResolver(async () => ["93.184.216.34"]);
    }
  });

  it("reports a failed engine write instead of success", async () => {
    engineStatus = 500;
    const res = await register();
    expect(res.status).toBe(502);
  });

  it("lists without secrets; a failed read is an error", async () => {
    listEnginePages.mockResolvedValueOnce([
      { slug: "settings/webhooks/wh-1", frontmatter: { id: "wh-1", url: "u", secret_enc: "x" } },
    ]);
    const ok = await GET(new Request("http://x/api/webhooks/outgoing") as never);
    const json = await ok.json();
    expect(json.data.webhooks).toEqual([expect.objectContaining({ id: "wh-1", url: "u" })]);
    expect(JSON.stringify(json)).not.toContain("secret");
    listEnginePages.mockRejectedValueOnce(new Error("down"));
    const bad = await GET(new Request("http://x/api/webhooks/outgoing") as never);
    expect(bad.status).toBe(502);
  });

  it("delete marks the entry and drops its secret (slug path not %2F-encoded)", async () => {
    const res = await DELETE(new Request("http://x/api/webhooks/outgoing?id=wh-1") as never);
    expect(res.status).toBe(200);
    expect(patches[0]).toMatchObject({
      slug: "settings/webhooks/wh-1",
      frontmatter: { status: "tombstoned", secret: null, secret_enc: null },
    });
  });

  const reactivate = (id = "wh-1") =>
    PATCH(
      new Request("http://x/api/webhooks/outgoing", {
        method: "PATCH",
        body: JSON.stringify({ id, action: "reactivate" }),
      }) as never
    );

  it("lists an auto-disabled webhook with reason and failure streak", async () => {
    listEnginePages.mockResolvedValueOnce([
      {
        slug: "settings/webhooks/wh-1",
        frontmatter: {
          id: "wh-1",
          url: "u",
          secret_enc: "x",
          status: "disabled",
          disabled_reason: "auto_failures",
          disabled_failures: 10,
        },
      },
    ]);
    health.streaks.mockResolvedValueOnce({ "wh-1": 10 });
    const json = await (await GET(new Request("http://x/api/webhooks/outgoing") as never)).json();
    expect(json.data.webhooks[0]).toMatchObject({
      status: "disabled",
      disabled_reason: "auto_failures",
      disabled_failures: 10,
      consecutive_failures: 10,
    });
  });

  it("reactivate switches a disabled webhook back on and resets its failure streak", async () => {
    listEnginePages.mockResolvedValueOnce([
      {
        slug: "settings/webhooks/wh-1",
        frontmatter: { id: "wh-1", status: "disabled", secret_enc: "x" },
      },
    ]);
    const res = await reactivate();
    expect(res.status).toBe(200);
    expect(patches[0]).toMatchObject({
      slug: "settings/webhooks/wh-1",
      frontmatter: { status: "active", disabled_reason: null },
    });
    expect(health.reset).toHaveBeenCalledWith("brain_1", "wh-1");
  });

  it("a deleted webhook cannot be reactivated", async () => {
    listEnginePages.mockResolvedValueOnce([
      {
        slug: "settings/webhooks/wh-1",
        frontmatter: { id: "wh-1", status: "tombstoned", secret_enc: null },
      },
    ]);
    const res = await reactivate();
    expect(res.status).toBe(409);
    expect(patches).toHaveLength(0);
  });

  it("an unknown webhook is 404", async () => {
    listEnginePages.mockResolvedValueOnce([]);
    expect((await reactivate("wh-x")).status).toBe(404);
  });
});
