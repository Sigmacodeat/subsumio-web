// @vitest-environment node
// Freigabe-Entscheidung (OPS-13): only a pending agent_action, only by a
// lawyer/admin who did not propose it.
import { beforeEach, describe, expect, it, vi } from "vitest";

const user = { id: "u1", email: "anwalt@kanzlei.example", role: "lawyer" };
const updatePage = vi.fn(async () => ({ slug: "x", success: true }));
let auditAction: string | undefined;

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/keyed-lock", () => ({
  withKeyedLock: <T>(_k: string, fn: () => Promise<T>) => fn(),
}));
vi.mock("@/lib/whatsapp/proactive-send", () => ({ sendProactiveMessage: vi.fn() }));
vi.mock("@/lib/approval-execution", () => ({
  executeApprovedAction: vi.fn(async () => ({ status: "executed", effects: [] })),
}));
vi.mock("@/lib/server-brain", () => ({
  createServerBrainClient: () => ({
    updatePage,
    getPage: vi.fn(),
    createPage: vi.fn(),
    listPages: vi.fn(async () => []),
    mutatePageArray: vi.fn(),
  }),
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    opts: {
      body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } };
      audit?: (ctx: unknown, body: unknown) => { action: string };
    },
    handler: (ctx: unknown, body: unknown) => Promise<Response>
  ) => {
    return async (req: Request) => {
      const ctx = { headers: {}, brainId: "b1", user };
      const raw = await req.json().catch(() => ({}));
      const parsed = opts.body?.safeParse(raw);
      if (parsed && !parsed.success) return Response.json({ error: "bad" }, { status: 400 });
      auditAction = opts.audit?.(ctx, parsed?.data ?? raw).action;
      return handler(ctx, parsed?.data ?? raw);
    };
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
}));

import { PATCH } from "./route";

let stored: Record<string, unknown> | number;

beforeEach(() => {
  vi.clearAllMocks();
  user.role = "lawyer";
  user.email = "anwalt@kanzlei.example";
  auditAction = undefined;
  stored = {
    slug: "agent-action/2026-09-25/a",
    type: "agent_action",
    frontmatter: { status: "pending", action_type: "client_message_send", proposed_by: "KI" },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      typeof stored === "number" ? new Response("x", { status: stored }) : Response.json(stored)
    )
  );
});

function decide(body: Record<string, unknown>) {
  return (PATCH as unknown as (r: Request) => Promise<Response>)(
    new Request("http://localhost/api/approvals", {
      method: "PATCH",
      body: JSON.stringify({ id: "agent-action/2026-09-25/a", ...body }),
    })
  );
}

describe("PATCH /api/approvals", () => {
  it("decides a pending agent action and audits it as an approval", async () => {
    const res = await decide({ decision: "approved" });
    expect(res.status).toBe(200);
    expect(updatePage).toHaveBeenCalledTimes(1);
    expect(auditAction).toBe("approval.approve");
  });

  it("refuses any page that is not an agent action (e.g. an invoice)", async () => {
    stored = { slug: "legal/invoices/r1", type: "invoice", frontmatter: { status: "sent" } };
    const res = await decide({ id: "legal/invoices/r1", decision: "rejected" });
    expect(res.status).toBe(400);
    expect(updatePage).not.toHaveBeenCalled();
  });

  it("refuses an action that was already decided (409)", async () => {
    stored = { type: "agent_action", frontmatter: { status: "approved", proposed_by: "KI" } };
    const res = await decide({ decision: "rejected" });
    expect(res.status).toBe(409);
    expect(updatePage).not.toHaveBeenCalled();
  });

  it("the proposer or submitter cannot decide their own action (403)", async () => {
    stored = {
      type: "agent_action",
      frontmatter: { status: "pending", proposed_by: "KI", submitted_by: "Anwalt@Kanzlei.example" },
    };
    const res = await decide({ decision: "approved" });
    expect(res.status).toBe(403);
    expect(updatePage).not.toHaveBeenCalled();
  });

  it("an assistant cannot decide (403)", async () => {
    user.role = "assistant";
    const res = await decide({ decision: "approved", execute: true });
    expect(res.status).toBe(403);
    expect(updatePage).not.toHaveBeenCalled();
  });

  it("a missing action is 404, an unreadable one 503", async () => {
    stored = 404;
    expect((await decide({ decision: "approved" })).status).toBe(404);
    stored = 500;
    expect((await decide({ decision: "approved" })).status).toBe(503);
    expect(updatePage).not.toHaveBeenCalled();
  });
});
