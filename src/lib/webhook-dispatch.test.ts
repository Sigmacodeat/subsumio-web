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
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import {
  dispatchWebhookEvent,
  getRegisteredWebhooks,
  verifyWebhookSignature,
} from "./webhook-dispatch";

const hook = (id: string, fm: Record<string, unknown>) => ({
  slug: `settings/webhooks/${id}`,
  title: id,
  frontmatter: { id, status: "active", events: ["intake.new"], ...fm },
});

beforeEach(() => {
  vi.clearAllMocks();
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

  it("sends nothing without a brain", async () => {
    const result = await dispatchWebhookEvent("", "intake.new", {});
    expect(result).toEqual({ dispatched: 0, failed: 0 });
    expect(m.list).not.toHaveBeenCalled();
  });
});
