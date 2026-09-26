// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  list: vi.fn(),
  headersFor: vi.fn((brainId: string) => ({ "x-subsumio-source": brainId })),
}));

vi.mock("@/lib/engine", () => ({
  engineHeadersForBrain: (brainId: string) => m.headersFor(brainId),
}));
vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: (...a: unknown[]) => m.list(...a),
}));
vi.mock("@/lib/encryption", () => ({
  decrypt: vi.fn(async (v: string) => {
    if (v === "enc:broken") throw new Error("bad key");
    return v.startsWith("enc:") ? v.slice(4) : v;
  }),
}));
const q = vi.hoisted(() => ({
  enqueue: vi.fn(async (..._a: unknown[]) => true),
  claim: vi.fn(async (..._a: unknown[]): Promise<unknown[]> => []),
  finish: vi.fn(async (..._a: unknown[]) => undefined),
  fail: vi.fn(async (..._a: unknown[]) => "pending"),
}));
vi.mock("@/lib/webhook-delivery-queue", () => ({
  enqueueWebhookRetry: (...a: unknown[]) => q.enqueue(...a),
  claimDueWebhookDeliveries: (...a: unknown[]) => q.claim(...a),
  finishWebhookDelivery: (...a: unknown[]) => q.finish(...a),
  recordWebhookRetryFailure: (...a: unknown[]) => q.fail(...a),
}));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import {
  dispatchWebhookEvent,
  getRegisteredWebhooks,
  retryDueWebhookDeliveries,
  verifyWebhookSignature,
} from "./webhook-dispatch";
import { setEgressHostResolver } from "@/lib/security/egress";

const hook = (id: string, fm: Record<string, unknown>) => ({
  slug: `settings/webhooks/${id}`,
  title: id,
  frontmatter: { id, status: "active", events: ["intake.new"], ...fm },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  setEgressHostResolver(async () => ["93.184.216.34"]);
});

describe("webhook dispatch", () => {
  it("reads the webhooks of the firm's own brain", async () => {
    m.list.mockResolvedValue([hook("wh-1", { url: "https://a.example/h", secret_enc: "enc:s1" })]);
    const hooks = await getRegisteredWebhooks("firm-a");
    expect(m.headersFor).toHaveBeenCalledWith("firm-a");
    expect(m.headersFor).not.toHaveBeenCalledWith("system");
    expect(m.list.mock.calls[0][1]).toBe("webhook_config");
    expect(hooks).toHaveLength(1);
    expect(hooks[0].secret).toBe("s1");
  });

  it("delivers with the decrypted secret and skips entries whose secret is unreadable", async () => {
    m.list.mockResolvedValue([
      hook("wh-ok", { url: "https://a.example/ok", secret_enc: "enc:geheim-geheim-1" }),
      hook("wh-broken", { url: "https://a.example/broken", secret_enc: "enc:broken" }),
      hook("wh-off", { url: "https://a.example/off", secret_enc: "enc:x", status: "tombstoned" }),
    ]);
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await dispatchWebhookEvent("firm-a", "intake.new", { slug: "x" });
    expect(result).toEqual({ dispatched: 1, failed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://a.example/ok");
    const headers = init!.headers as Record<string, string>;
    expect(
      verifyWebhookSignature(String(init!.body), headers["X-Subsumio-Signature"], "geheim-geheim-1")
    ).toBe(true);
    vi.unstubAllGlobals();
  });

  it("does not deliver an entry that only holds a plaintext secret", async () => {
    m.list.mockResolvedValue([
      hook("wh-plain", { url: "https://a.example/plain", secret: "klartext-geheim-123" }),
    ]);
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    expect(await getRegisteredWebhooks("firm-a")).toEqual([]);
    const result = await dispatchWebhookEvent("firm-a", "intake.new", {});
    expect(result).toEqual({ dispatched: 0, failed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing without a brain", async () => {
    const result = await dispatchWebhookEvent("", "intake.new", {});
    expect(result).toEqual({ dispatched: 0, failed: 0 });
    expect(m.list).not.toHaveBeenCalled();
  });

  it.each([
    "http://127.0.0.1/x",
    "http://10.0.0.5",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/x",
  ])("never contacts the internal or non-https target %s and does not retry it", async (url) => {
    m.list.mockResolvedValue([hook("wh-bad", { url, secret_enc: "enc:geheim" })]);
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const result = await dispatchWebhookEvent("firm-a", "intake.new", {});
    expect(result).toEqual({ dispatched: 0, failed: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(q.enqueue).not.toHaveBeenCalled();
  });

  it("does not deliver to a host name that resolves to a private address", async () => {
    setEgressHostResolver(async () => ["192.168.1.20"]);
    m.list.mockResolvedValue([
      hook("wh-dns", { url: "https://intern.example", secret_enc: "enc:s" }),
    ]);
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    await dispatchWebhookEvent("firm-a", "intake.new", {});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not follow a redirect into the internal network", async () => {
    setEgressHostResolver(async (host) =>
      host === "intern.example" ? ["10.0.0.9"] : ["93.184.216.34"]
    );
    m.list.mockResolvedValue([hook("wh-r", { url: "https://a.example/h", secret_enc: "enc:s" })]);
    const fetchMock = vi.fn(
      async (_u: string, _i?: RequestInit) =>
        new Response(null, { status: 307, headers: { location: "https://intern.example/x" } })
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await dispatchWebhookEvent("firm-a", "intake.new", {});
    expect(result.failed).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://a.example/h");
    expect(fetchMock.mock.calls[0][1]?.redirect).toBe("manual");
  });

  it("queues a delivery the receiver answered with 503, but not one it refused with 400", async () => {
    m.list.mockResolvedValue([hook("wh-1", { url: "https://a.example/h", secret_enc: "enc:s" })]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("busy", { status: 503 }))
    );
    await dispatchWebhookEvent("firm-a", "intake.new", { slug: "i-1" });
    expect(q.enqueue).toHaveBeenCalledTimes(1);
    expect(q.enqueue.mock.calls[0][0]).toMatchObject({
      brainId: "firm-a",
      webhookId: "wh-1",
      event: "intake.new",
    });
    q.enqueue.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 400 }))
    );
    await dispatchWebhookEvent("firm-a", "intake.new", { slug: "i-1" });
    expect(q.enqueue).not.toHaveBeenCalled();
  });

  it("the retry run delivers a queued event again, signed with the current secret", async () => {
    m.list.mockResolvedValue([hook("wh-1", { url: "https://a.example/h", secret_enc: "enc:neu" })]);
    const body = JSON.stringify({ event: "intake.new", data: { slug: "i-1" } });
    q.claim.mockResolvedValueOnce([
      { id: "d1", brainId: "firm-a", webhookId: "wh-1", event: "intake.new", body, attempts: 1 },
      { id: "d2", brainId: "firm-a", webhookId: "wh-gone", event: "intake.new", body, attempts: 1 },
    ]);
    const fetchMock = vi.fn(async (_u: string, _i?: RequestInit) => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const stats = await retryDueWebhookDeliveries();
    expect(stats).toMatchObject({ retried: 2, delivered: 1, dropped: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1]!;
    expect(init.body).toBe(body);
    const headers = init.headers as Record<string, string>;
    expect(verifyWebhookSignature(body, headers["X-Subsumio-Signature"], "neu")).toBe(true);
    expect(q.finish).toHaveBeenCalledWith("d1", "delivered");
    expect(q.finish).toHaveBeenCalledWith("d2", "dropped", expect.any(String));
  });

  it("a failed retry is recorded with the next attempt count", async () => {
    m.list.mockResolvedValue([hook("wh-1", { url: "https://a.example/h", secret_enc: "enc:s" })]);
    q.claim.mockResolvedValueOnce([
      {
        id: "d1",
        brainId: "firm-a",
        webhookId: "wh-1",
        event: "intake.new",
        body: "{}",
        attempts: 2,
      },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 502 }))
    );
    await retryDueWebhookDeliveries();
    expect(q.fail).toHaveBeenCalledWith("d1", 3, "HTTP 502", true);
  });

  it("an unreadable registration postpones the retry instead of dropping it", async () => {
    m.list.mockRejectedValue(new Error("engine down"));
    q.claim.mockResolvedValueOnce([
      {
        id: "d1",
        brainId: "firm-a",
        webhookId: "wh-1",
        event: "intake.new",
        body: "{}",
        attempts: 2,
      },
    ]);
    await retryDueWebhookDeliveries();
    expect(q.finish).not.toHaveBeenCalled();
    expect(q.fail).toHaveBeenCalledWith("d1", 2, expect.stringContaining("engine down"), true);
  });
});
