import type { NextRequest } from "next/server";
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const user = vi.hoisted(() => ({
  current: { id: "u-admin", role: "admin", email: "a@x.at", orgId: "org-1" },
}));
const patches = vi.hoisted(
  () => [] as Array<{ headers: Record<string, string>; body: Record<string, unknown> }>
);

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine-test:3001",
  enginePatchPage: vi.fn(async (headers: Record<string, string>, body: Record<string, unknown>) => {
    patches.push({ headers, body });
    return new Response("{}", { status: 200 });
  }),
}));
vi.mock("@/lib/audit", () => ({ listAuditLogs: vi.fn(async () => []), logAudit: vi.fn() }));
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({
    list: async () => [
      { id: "u-admin", name: "Admin", email: "a@x.at", role: "admin", orgId: "org-1" },
      { id: "u-lawyer", name: "Lawyer", email: "l@x.at", role: "lawyer", orgId: "org-1" },
      { id: "u-assistant", name: "Assistant", email: "s@x.at", role: "assistant", orgId: "org-1" },
      { id: "u-other", name: "Other firm", email: "o@y.at", role: "lawyer", orgId: "org-2" },
      { id: "u-client", name: "Client A", email: "c@m.at", role: "client_viewer", orgId: "org-1" },
      { id: "u-client2", name: "Client B", email: "d@m.at", role: "client_viewer", orgId: "org-1" },
    ],
  }),
}));
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
      const ctx = {
        brainId: "firm-a",
        headers: { "x-subsumio-source": "firm-a" },
        user: user.current,
      };
      const url = new URL(req.url);
      const body = opts.body ? opts.body.parse(await req.json()) : undefined;
      const query = opts.query ? opts.query.parse(Object.fromEntries(url.searchParams)) : undefined;
      return handler(ctx, body, query);
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: { code, message } }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
}));

import { GET, PUT } from "./route";

let stored: Record<string, unknown> = {};

beforeEach(() => {
  patches.length = 0;
  stored = {};
  user.current = { id: "u-admin", role: "admin", email: "a@x.at", orgId: "org-1" };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ title: "Müller", type: "legal_case", frontmatter: { permissions: stored } })
    )
  );
});

function put(body: Record<string, unknown>) {
  return PUT(
    new Request("http://x/api/cases/access", {
      method: "PUT",
      body: JSON.stringify({ case_slug: "cases/mueller", ...body }),
    }) as unknown as NextRequest
  );
}

describe("/api/cases/access", () => {
  it("lets an admin wall a lawyer off, writing through the permissions channel", async () => {
    const res = await put({ blocked_users: ["u-lawyer"] });
    expect(res.status).toBe(200);
    expect(patches[0]!.headers["x-subsumio-matter-permissions"]).toBe("write");
    expect((patches[0]!.body.frontmatter as { permissions: unknown }).permissions).toMatchObject({
      blocked_users: ["u-lawyer"],
    });
  });

  it("refuses walls, team and visibility from a non-admin", async () => {
    user.current = { id: "u-lawyer", role: "lawyer", email: "l@x.at", orgId: "org-1" };
    const res = await put({ blocked_users: ["u-assistant"] });
    expect(res.status).toBe(403);
    expect(patches).toHaveLength(0);
  });

  it("lets a lawyer share with a colleague but not take back someone else's grant", async () => {
    user.current = { id: "u-lawyer", role: "lawyer", email: "l@x.at", orgId: "org-1" };
    const ok = await put({ grants: [{ user_id: "u-assistant", level: "read" }] });
    expect(ok.status).toBe(200);
    const grant = (patches[0]!.body.frontmatter as { permissions: { grants: unknown[] } })
      .permissions.grants[0] as Record<string, unknown>;
    expect(grant).toMatchObject({ user_id: "u-assistant", level: "read", granted_by: "u-lawyer" });

    stored = { grants: [{ user_id: "u-assistant", level: "write", granted_by: "u-admin" }] };
    const denied = await put({ grants: [] });
    expect(denied.status).toBe(403);
  });

  it("only accepts people from the firm", async () => {
    const res = await put({ allowed_users: ["u-other"] });
    expect(res.status).toBe(400);
  });

  it("refuses a change that locks the admin out", async () => {
    const res = await put({ visibility: "confidential", allowed_users: ["u-lawyer"] });
    expect(res.status).toBe(400);
    expect(patches).toHaveLength(0);
  });

  it("tells the caller what they may do", async () => {
    stored = { visibility: "restricted", grants: [{ user_id: "u-assistant", level: "read" }] };
    user.current = { id: "u-assistant", role: "assistant", email: "s@x.at", orgId: "org-1" };
    const res = await GET(
      new Request("http://x/api/cases/access?case_slug=cases/mueller") as unknown as NextRequest
    );
    const { data } = await res.json();
    expect(data).toMatchObject({ my_level: "read", can_manage: false, can_grant: false });
    expect(data.members.map((m: { id: string }) => m.id)).not.toContain("u-other");
  });

  it("shows a client account only itself and no access history", async () => {
    stored = { visibility: "restricted", allowed_users: ["u-client"] };
    user.current = { id: "u-client", role: "client_viewer", email: "c@m.at", orgId: "org-1" };
    const res = await GET(
      new Request("http://x/api/cases/access?case_slug=cases/mueller") as unknown as NextRequest
    );
    const { data } = await res.json();
    expect(data.members.map((m: { id: string }) => m.id)).toEqual(["u-client"]);
    expect(data.audit).toEqual([]);
  });

  describe("client accounts (W2-6)", () => {
    function withMatter(fm: Record<string, unknown>, contact?: Record<string, unknown>) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) =>
          String(url).includes("/api/pages/legal/contacts/")
            ? contact
              ? Response.json({ frontmatter: contact })
              : new Response("{}", { status: 404 })
            : Response.json({
                title: "Müller",
                type: "legal_case",
                frontmatter: { permissions: stored, ...fm },
              })
        )
      );
    }

    it("the assistant may not open a matter to a client account", async () => {
      user.current = { id: "u-assistant", role: "assistant", email: "s@x.at", orgId: "org-1" };
      const res = await put({
        grants: [{ user_id: "u-client", level: "read" }],
        confirm_client_access: true,
      });
      expect(res.status).toBe(403);
      expect(patches).toHaveLength(0);
    });

    it("a lawyer grants the matter's own client without extra confirmation", async () => {
      user.current = { id: "u-lawyer", role: "lawyer", email: "l@x.at", orgId: "org-1" };
      withMatter({ client_slug: "legal/contacts/client-a" }, { email: "C@m.at" });
      const res = await put({ grants: [{ user_id: "u-client", level: "read" }] });
      expect(res.status).toBe(200);
    });

    it("another matter's client needs an explicit confirmation", async () => {
      user.current = { id: "u-lawyer", role: "lawyer", email: "l@x.at", orgId: "org-1" };
      withMatter({ client_slug: "legal/contacts/client-a" }, { email: "c@m.at" });
      const refused = await put({ grants: [{ user_id: "u-client2", level: "read" }] });
      expect(refused.status).toBe(409);
      expect(patches).toHaveLength(0);
      const ok = await put({
        grants: [{ user_id: "u-client2", level: "read" }],
        confirm_client_access: true,
      });
      expect(ok.status).toBe(200);
    });

    it("an admin adding a client account to the team is judged the same way", async () => {
      withMatter({});
      const res = await put({ allowed_users: ["u-admin", "u-client2"] });
      expect(res.status).toBe(409);
    });

    it("GET tells the UI whether client accounts may be granted", async () => {
      user.current = { id: "u-assistant", role: "assistant", email: "s@x.at", orgId: "org-1" };
      const res = await GET(
        new Request("http://x/api/cases/access?case_slug=cases/mueller") as unknown as NextRequest
      );
      const { data } = await res.json();
      expect(data.can_grant).toBe(true);
      expect(data.can_grant_clients).toBe(false);
    });
  });
});
