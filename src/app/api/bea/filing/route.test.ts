// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { actor, writes } = vi.hoisted(() => ({
  actor: { role: "lawyer" as string, id: "u-lawyer" },
  writes: [] as Array<{ slug: string; frontmatter: Record<string, unknown> }>,
}));

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  enginePatchPage: vi.fn(
    async (_h: unknown, body: { slug: string; frontmatter: Record<string, unknown> }) => {
      writes.push(body);
      stored = { ...(stored ?? {}), ...body.frontmatter };
      for (const [k, v] of Object.entries(stored)) if (v === null) delete stored[k];
      return Response.json({ ok: true });
    }
  ),
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { body?: { parse: (v: unknown) => unknown } },
      handler: (ctx: unknown, body: unknown) => Promise<Response>
    ) =>
    async (req: Request) =>
      handler(
        {
          headers: {},
          brainId: "firm-1",
          user: { id: actor.id, email: `${actor.id}@k.example`, name: actor.id, role: actor.role },
        },
        opts.body!.parse(await req.json())
      ),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
}));

import { POST } from "./route";
import { hasServerFilingApproval } from "@/lib/bea-filing";

let stored: Record<string, unknown> | null;

beforeEach(() => {
  stored = null;
  writes.length = 0;
  actor.role = "lawyer";
  actor.id = "u-lawyer";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      stored
        ? Response.json({ slug: "legal/bea-filings/d1", frontmatter: stored })
        : Response.json({}, { status: 404 })
    )
  );
});

const step = (action: string) =>
  (POST as unknown as (r: Request) => Promise<Response>)(
    new Request("http://localhost/api/bea/filing", {
      method: "POST",
      body: JSON.stringify({ draft_slug: "legal/bea-drafts/d1", action }),
    })
  );

describe("POST /api/bea/filing", () => {
  it("the assistant prepares and submits, but only a lawyer releases — stamped with the session", async () => {
    actor.role = "assistant";
    actor.id = "u-sek";
    expect((await step("create")).status).toBe(200);
    expect((await step("submit")).status).toBe(200);
    const denied = await step("approve");
    expect(denied.status).toBe(403);
    expect((stored!.package as { status: string }).status).toBe("pending_approval");

    actor.role = "lawyer";
    actor.id = "u-lawyer";
    expect((await step("approve")).status).toBe(200);
    const pkg = stored!.package as { status: string; approved_by: string; id: string };
    expect(pkg.status).toBe("approved");
    expect(pkg.approved_by).toBe("u-lawyer");
    expect(pkg.approved_by).not.toBe("dashboard-user");
    expect(hasServerFilingApproval(stored, pkg)).toBe(true);
  });

  it("cancelling drops the release stamp", async () => {
    await step("create");
    await step("submit");
    await step("approve");
    await step("cancel");
    expect(stored!.filing_approval).toBeUndefined();
  });
});
