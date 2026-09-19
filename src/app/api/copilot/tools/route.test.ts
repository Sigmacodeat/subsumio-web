// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const credits = vi.hoisted(() => ({ ok: true, consumed: [] as string[] }));

vi.mock("@/lib/billing/credits", () => ({
  CREDIT_COSTS: { think: 1, document_analysis: 2, subsumption: 3, deadline_detect: 1 },
  ensureTrialCredits: vi.fn(async () => true),
  checkCredits: vi.fn(async () => ({ ok: credits.ok, balance: 0, required: 1 })),
  insufficientCreditsResponse: () =>
    Response.json({ error: "insufficient_credits" }, { status: 402 }),
}));
vi.mock("@/lib/engine", async (orig) => ({
  ...(await orig<typeof import("@/lib/engine")>()),
  ENGINE_URL: "http://engine-test:3001",
  recordCreditConsumption: vi.fn(async (_ctx: unknown, op: string) => {
    credits.consumed.push(op);
  }),
  engineHeadersWithCaseJurisdiction: async (h: Record<string, string>) => h,
}));
vi.mock("@/lib/email/mailbox", () => ({
  sendMailboxMessage: vi.fn(async () => ({ id: "m-1", status: "sent" })),
  buildMailDraft: (d: unknown) => d,
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { body?: { parse: (d: unknown) => unknown } },
      handler: (ctx: unknown, body: unknown) => Promise<Response>
    ) =>
    async (req: Request) => {
      const ctx = {
        brainId: "firm-a",
        headers: { "x-subsumio-source": "firm-a" },
        user: { id: "u-lawyer", role: "lawyer", email: "l@x.at", brainId: "firm-a" },
        billing: { ownerId: "u-owner", ownerType: "user" },
      };
      return handler(ctx, opts.body!.parse(await req.json()));
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: { code, message } }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
}));

import { POST } from "./route";

function call(body: Record<string, unknown>) {
  return POST(
    new Request("http://x/api/copilot/tools", { method: "POST", body: JSON.stringify(body) })
  );
}

function sse(answer: string): Response {
  const body = `data: ${JSON.stringify({ chunk: answer })}\n\ndata: ${JSON.stringify({ citations: [] })}\n\ndata: [DONE]\n\n`;
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

beforeEach(() => {
  credits.ok = true;
  credits.consumed = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/api/think")) return sse("Sehr geehrte Frau Müller, …");
      if (url.includes("/api/pages/")) {
        return Response.json({
          slug: "cases/mueller",
          title: "Müller",
          content: "Akte",
          frontmatter: {},
        });
      }
      return Response.json({ ok: true, slug: "x" });
    })
  );
});

describe("POST /api/copilot/tools", () => {
  it("runs a write tool only with a confirmation issued for the same parameters", async () => {
    const params = { to: "a@b.at", subject: "Termin", text: "Hallo" };
    expect((await call({ tool: "send_email", params })).status).toBe(403);

    const prepared = await (await call({ tool: "send_email", params, mode: "prepare" })).json();
    const token = prepared.data.confirmation as string;
    expect(
      (
        await call({
          tool: "send_email",
          params: { ...params, to: "evil@x.at" },
          confirmation: token,
        })
      ).status
    ).toBe(403);
    const ok = await call({ tool: "send_email", params, confirmation: token });
    expect(ok.status).toBe(200);
    expect((await call({ tool: "send_email", params, confirmation: token })).status).toBe(403);
  });

  it("runs matter tools when the call names the matter", async () => {
    const res = await call({ tool: "case_summary", params: { case_slug: "cases/mueller" } });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it("reads the streamed think answer and charges the tool's credits", async () => {
    const res = await call({ tool: "email_draft", params: { subject: "Termin" } });
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.draft).toContain("Sehr geehrte Frau Müller");
    expect(credits.consumed).toEqual(["think"]);
  });

  it("refuses a paid tool without credits", async () => {
    credits.ok = false;
    const res = await call({ tool: "email_draft", params: { subject: "Termin" } });
    expect(res.status).toBe(402);
  });
});
