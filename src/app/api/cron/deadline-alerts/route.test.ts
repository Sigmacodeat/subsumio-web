// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  webhook: vi.fn(),
  sse: vi.fn(),
  patch: vi.fn(),
  pages: {} as Record<string, unknown[] | Error>,
}));

vi.mock("@/lib/api-handler", () => ({
  createCronHandler: (handler: (req: NextRequest) => Promise<Response>) => handler,
}));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: () => ({}),
  enginePatchPage: (...a: unknown[]) => m.patch(...a),
}));
vi.mock("@/lib/cron-utils", () => ({
  excludeDemoPages: <T extends { frontmatter?: Record<string, unknown> | null }>(p: T[]) =>
    p.filter((x) => x.frontmatter?.demo !== true),
  fetchAllPagesStrict: vi.fn(async (_brainId: string, type: string) => {
    const v = m.pages[type];
    if (v instanceof Error) throw v;
    return v ?? [];
  }),
  getRecipientsByBrain: vi.fn(async () => new Map([["brain-at", []]])),
}));
vi.mock("@/lib/realtime-bus", () => ({
  broadcastDeadlineAlert: (...a: unknown[]) => m.sse(...a),
}));
vi.mock("@/lib/webhook-dispatch", () => ({
  dispatchWebhookEvent: (...a: unknown[]) => m.webhook(...a),
}));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { POST } from "./route";

const soon = new Date(Date.now() + 6 * 3_600_000).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  m.patch.mockResolvedValue(Response.json({ ok: true }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ frontmatter: {} }))
  );
});

describe("cron deadline-alerts", () => {
  it("fires the webhook for a confirmed deadline, only in-app for an unreviewed AI one", async () => {
    m.pages = {
      legal_case: [],
      legal_deadline: [
        {
          slug: "legal/deadlines/ki",
          title: "KI-Frist",
          frontmatter: { due_date: soon, source: "ai_detected", review_status: "unreviewed" },
        },
        {
          slug: "legal/deadlines/manuell",
          title: "Berufung",
          frontmatter: { due_date: soon, source: "manual", review_status: "unreviewed" },
        },
      ],
    };
    const res = await (POST as unknown as (r: Request) => Promise<Response>)(
      new Request("http://localhost/api/cron/deadline-alerts", { method: "POST" })
    );
    expect(res.status).toBe(200);

    expect(m.sse).toHaveBeenCalledTimes(2);
    const ki = m.sse.mock.calls.find((c) => c[1].deadlineId === "legal/deadlines/ki")![1];
    expect(ki).toMatchObject({ unreviewed: true, label: "ungeprüfter KI-Vorschlag" });

    expect(m.webhook).toHaveBeenCalledTimes(1);
    // Delivered to the firm whose deadline it is, not a shared brain.
    expect(m.webhook.mock.calls[0][0]).toBe("brain-at");
    expect(m.webhook.mock.calls[0][1]).toBe("deadline.critical");
    expect(m.webhook.mock.calls[0][2]).toMatchObject({ deadline_id: "legal/deadlines/manuell" });

    // The unreviewed alert is remembered in its own list.
    const kiWrite = m.patch.mock.calls.find((c) => c[1].slug === "legal/deadlines/ki")![1];
    expect(kiWrite.frontmatter.alert_stages_unreviewed).toContain("urgent");
    expect(kiWrite.frontmatter.alert_stages_sent).toBeUndefined();
  });

  it("answers 500 with the error in the body when a firm's deadlines cannot be read", async () => {
    m.pages = {
      legal_case: [],
      legal_deadline: new Error("list legal_deadline failed: HTTP 503"),
    };
    const res = await (POST as unknown as (r: Request) => Promise<Response>)(
      new Request("http://localhost/api/cron/deadline-alerts", { method: "POST" })
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.errors[0]).toMatch(/brain-at.*HTTP 503/);
    expect(m.sse).not.toHaveBeenCalled();
  });
});
