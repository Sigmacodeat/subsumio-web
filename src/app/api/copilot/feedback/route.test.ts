import type { NextRequest } from "next/server";
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const who = vi.hoisted(() => ({ role: "lawyer" }));
vi.mock("@/lib/auth/store", () => ({ getSharedPgPool: () => null }));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: {
        body?: { parse: (d: unknown) => unknown };
        query?: { parse: (d: unknown) => unknown };
      },
      handler: (ctx: unknown, body: unknown, query: unknown) => Promise<Response>
    ) =>
    async (req: Request) => {
      const ctx = { brainId: "firm-a", user: { id: `u-${who.role}`, role: who.role } };
      const url = new URL(req.url);
      const body =
        opts.body && req.method !== "GET" ? opts.body.parse(await req.json()) : undefined;
      const query = opts.query ? opts.query.parse(Object.fromEntries(url.searchParams)) : undefined;
      return handler(ctx, body, query);
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: { code, message } }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
}));

import { GET, POST } from "./route";

const rate = (body: Record<string, unknown>) =>
  POST(
    new Request("http://x/api/copilot/feedback", {
      method: "POST",
      body: JSON.stringify(body),
    }) as unknown as NextRequest
  );

describe("/api/copilot/feedback", () => {
  it("stores ratings, one per person and answer, and summarises them for admins", async () => {
    who.role = "lawyer";
    expect(
      (await rate({ message_id: "m1", rating: "up", question: "Frist?", answer: "Vier Wochen." }))
        .status
    ).toBe(200);
    await rate({
      message_id: "m1",
      rating: "down",
      reason: "wrong",
      question: "Frist?",
      answer: "Vier Wochen.",
    });
    await rate({
      message_id: "m2",
      rating: "down",
      reason: "missing_source",
      question: "Kosten?",
      answer: "…",
    });

    expect(
      (await GET(new Request("http://x/api/copilot/feedback") as unknown as NextRequest)).status
    ).toBe(403);
    who.role = "admin";
    const summary = (
      await (
        await GET(new Request("http://x/api/copilot/feedback?days=30") as unknown as NextRequest)
      ).json()
    ).data;
    expect(summary).toMatchObject({ up: 0, down: 2, reasons: { wrong: 1, missing_source: 1 } });
    expect(summary.recentDown.map((d: { question: string }) => d.question).sort()).toEqual([
      "Frist?",
      "Kosten?",
    ]);
  });
});
