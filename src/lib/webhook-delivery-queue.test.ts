// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/store", () => ({ getSharedPgPool: () => null }));

import {
  enqueueWebhookRetry,
  MAX_WEBHOOK_ATTEMPTS,
  recordWebhookRetryFailure,
  webhookBackoffSeconds,
} from "./webhook-delivery-queue";

describe("webhook delivery queue", () => {
  it("backs off 1 min, 5 min, 30 min, 2 h", () => {
    expect([1, 2, 3, 4, 9].map(webhookBackoffSeconds)).toEqual([60, 300, 1800, 7200, 7200]);
  });

  it("gives up after the maximum attempts or on a permanent error", async () => {
    expect(await recordWebhookRetryFailure("d", MAX_WEBHOOK_ATTEMPTS, "x", true)).toBe("exhausted");
    expect(await recordWebhookRetryFailure("d", 2, "x", false)).toBe("exhausted");
    expect(await recordWebhookRetryFailure("d", 2, "x", true)).toBe("pending");
  });

  it("reports that nothing was persisted without a database", async () => {
    expect(
      await enqueueWebhookRetry({
        brainId: "b",
        webhookId: "w",
        event: "e",
        body: "{}",
        error: "x",
      })
    ).toBe(false);
  });
});
