// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  list: vi.fn(),
  patch: vi.fn(async (..._a: unknown[]) => new Response("{}", { status: 200 })),
  record: vi.fn(
    async (..._a: unknown[]): Promise<{ failures: number; disable: boolean } | null> => ({
      failures: 1,
      disable: false,
    })
  ),
  reset: vi.fn(async (..._a: unknown[]) => undefined),
  release: vi.fn(async (..._a: unknown[]) => undefined),
  audit: vi.fn(async (..._a: unknown[]) => undefined),
  notify: vi.fn(async (..._a: unknown[]) => undefined),
  recipients: vi.fn(async () => new Map<string, unknown[]>()),
  fail: vi.fn(async (..._a: unknown[]): Promise<"pending" | "exhausted"> => "pending"),
  claim: vi.fn(async (..._a: unknown[]): Promise<unknown[]> => []),
}));

vi.mock("@/lib/engine", () => ({
  engineHeadersForBrain: (brainId: string) => ({ "x-subsumio-source": brainId }),
  enginePatchPage: (...a: unknown[]) => m.patch(...a),
}));
vi.mock("@/lib/engine-pages", () => ({ listEnginePages: (...a: unknown[]) => m.list(...a) }));
vi.mock("@/lib/encryption", () => ({ decrypt: vi.fn(async (v: string) => v.slice(4)) }));
vi.mock("@/lib/webhook-delivery-queue", () => ({
  enqueueWebhookRetry: vi.fn(async () => true),
  claimDueWebhookDeliveries: (...a: unknown[]) => m.claim(...a),
  finishWebhookDelivery: vi.fn(async () => undefined),
  recordWebhookRetryFailure: (...a: unknown[]) => m.fail(...a),
}));
vi.mock("@/lib/webhook-health", () => ({
  recordWebhookFinalFailure: (...a: unknown[]) => m.record(...a),
  resetWebhookFailures: (...a: unknown[]) => m.reset(...a),
  releaseWebhookDisableClaim: (...a: unknown[]) => m.release(...a),
}));
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => m.audit(...a) }));
vi.mock("@/lib/cron-utils", () => ({ getRecipientsByBrain: () => m.recipients() }));
vi.mock("@/lib/comments", () => ({
  createWebhookDisabledNotification: (...a: unknown[]) => m.notify(...a),
}));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import {
  dispatchWebhookEvent,
  noteWebhookFinalFailure,
  retryDueWebhookDeliveries,
} from "./webhook-dispatch";
import { setEgressHostResolver } from "@/lib/security/egress";

const active = {
  slug: "settings/webhooks/wh-1",
  title: "wh-1",
  frontmatter: {
    id: "wh-1",
    status: "active",
    url: "https://receiver.example/h",
    events: ["intake.new"],
    secret_enc: "enc:geheim-geheim-1",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  setEgressHostResolver(async () => ["93.184.216.34"]);
  m.list.mockResolvedValue([active]);
});

describe("webhook auto-disable", () => {
  it("a non-retryable failure counts as final; below the threshold nothing is switched off", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("gone", { status: 410 }))
    );
    await dispatchWebhookEvent("firm-a", "intake.new", { x: 1 });
    expect(m.record).toHaveBeenCalledWith("firm-a", "wh-1", "HTTP 410");
    expect(m.patch).not.toHaveBeenCalled();
  });

  it("a successful delivery resets the failure streak", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("ok"))
    );
    await dispatchWebhookEvent("firm-a", "intake.new", { x: 1 });
    expect(m.reset).toHaveBeenCalledWith("firm-a", "wh-1");
    expect(m.record).not.toHaveBeenCalled();
  });

  it("at the threshold: disables the webhook, audits and notifies the firm's admins", async () => {
    m.record.mockResolvedValueOnce({ failures: 10, disable: true });
    m.recipients.mockResolvedValueOnce(
      new Map([
        [
          "firm-a",
          [
            { id: "admin-1", role: "admin" },
            { id: "lawyer-1", role: "lawyer" },
            { id: "admin-old", role: "admin", deactivatedAt: "2020-01-01T00:00:00Z" },
          ],
        ],
      ])
    );
    const disabled = await noteWebhookFinalFailure(
      "firm-a",
      { id: "wh-1", url: "https://receiver.example/h" },
      "HTTP 503"
    );
    expect(disabled).toBe(true);
    const [, patch] = m.patch.mock.calls[0] as [
      unknown,
      { slug: string; frontmatter: Record<string, unknown> },
    ];
    expect(patch.slug).toBe("settings/webhooks/wh-1");
    expect(patch.frontmatter).toMatchObject({
      status: "disabled",
      disabled_reason: "auto_failures",
      disabled_failures: 10,
    });
    expect(m.audit).toHaveBeenCalledWith(
      "webhook.auto_disable",
      "webhook",
      expect.objectContaining({ brainId: "firm-a", entityId: "wh-1" })
    );
    expect(m.notify).toHaveBeenCalledTimes(1);
    expect(m.notify.mock.calls[0][0]).toMatchObject({
      userId: "admin-1",
      brainId: "firm-a",
      webhookId: "wh-1",
      failures: 10,
    });
  });

  it("if the switch-off cannot be saved, the claim is released for the next failure", async () => {
    m.record.mockResolvedValueOnce({ failures: 10, disable: true });
    m.patch.mockResolvedValueOnce(new Response("down", { status: 502 }));
    const disabled = await noteWebhookFinalFailure(
      "firm-a",
      { id: "wh-1", url: "https://receiver.example/h" },
      "HTTP 503"
    );
    expect(disabled).toBe(false);
    expect(m.release).toHaveBeenCalledWith("firm-a", "wh-1");
    expect(m.notify).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("an exhausted retry counts as final failure", async () => {
    m.claim.mockResolvedValueOnce([
      {
        id: "d1",
        brainId: "firm-a",
        webhookId: "wh-1",
        event: "intake.new",
        body: "{}",
        attempts: 4,
      },
    ]);
    m.fail.mockResolvedValueOnce("exhausted");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 503 }))
    );
    await retryDueWebhookDeliveries();
    expect(m.record).toHaveBeenCalledWith("firm-a", "wh-1", "HTTP 503");
  });

  it("a retry that is still pending does not count yet", async () => {
    m.claim.mockResolvedValueOnce([
      {
        id: "d1",
        brainId: "firm-a",
        webhookId: "wh-1",
        event: "intake.new",
        body: "{}",
        attempts: 1,
      },
    ]);
    m.fail.mockResolvedValueOnce("pending");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 503 }))
    );
    await retryDueWebhookDeliveries();
    expect(m.record).not.toHaveBeenCalled();
  });
});
