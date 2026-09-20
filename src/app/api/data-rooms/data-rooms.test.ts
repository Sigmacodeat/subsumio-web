// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

type User = { id: string; email: string; name?: string; role: string; orgId: string | null };
const who = vi.hoisted(() => ({
  user: null as unknown as User,
  brainId: "",
  mails: [] as Array<{ to: string; text: string }>,
  audit: [] as Array<{ action: string; brainId?: string }>,
}));

vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: {
        body?: { parse: (d: unknown) => unknown };
        query?: { parse: (d: unknown) => unknown };
      },
      handler: (ctx: unknown, body: unknown, query: unknown, req: unknown) => Promise<Response>
    ) =>
    async (req: Request, routeCtx?: { params: Promise<Record<string, string>> }) => {
      const ctx = {
        user: who.user,
        brainId: who.brainId,
        headers: { "x-subsumio-source": who.brainId },
      };
      const url = new URL(req.url);
      const body =
        opts.body && req.method !== "GET" ? opts.body.parse(await req.json()) : undefined;
      const query = opts.query ? opts.query.parse(Object.fromEntries(url.searchParams)) : undefined;
      if (routeCtx) (req as unknown as { params: unknown }).params = routeCtx.params;
      return handler(ctx, body, query, req);
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: { code, message } }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
}));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine",
  engineHeadersForBrain: (b: string) => ({ "x-subsumio-source": b }),
}));
vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: async () => [
    { slug: "docs/klage", title: "Klage", frontmatter: { case_slug: "cases/a" } },
    { slug: "docs/intern", title: "Interne Notiz", frontmatter: { case_slug: "cases/a" } },
  ],
}));
vi.mock("@/lib/auth/store", () => ({
  getOrgStore: () => ({
    getById: async (id: string) => ({
      id,
      name: id === "org-host" ? "Kanzlei Host" : "Kanzlei Gast",
    }),
  }),
  getSharedPgPool: () => null,
}));
vi.mock("@/lib/mail", () => ({
  siteUrl: () => "https://app.test",
  sendMail: async (m: { to: string; text: string }) => {
    who.mails.push(m);
    return { sent: true };
  },
}));
vi.mock("@/lib/audit", () => ({
  logAudit: async (action: string, _t: string, opts?: { brainId?: string }) => {
    who.audit.push({ action, brainId: opts?.brainId });
  },
}));

import { MemoryDataRoomStore, setDataRoomStoreForTests } from "@/lib/data-rooms";
import * as rooms from "./route";
import * as room from "./[id]/route";
import * as members from "./[id]/members/route";
import * as document from "./[id]/document/route";
import * as accept from "./accept/route";

const host: User = { id: "u-host", email: "anwalt@host.at", role: "lawyer", orgId: "org-host" };
const guest: User = { id: "u-guest", email: "kollegin@gast.at", role: "lawyer", orgId: "org-gast" };
const stranger: User = { id: "u-x", email: "x@gast.at", role: "lawyer", orgId: "org-gast" };

function as(user: User, brainId: string) {
  who.user = user;
  who.brainId = brainId;
}
const req = (method: string, path: string, body?: unknown) =>
  new Request(`http://x${path}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  setDataRoomStoreForTests(new MemoryDataRoomStore());
  who.mails = [];
  who.audit = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/pages/cases%2Fa")) {
        return Response.json({ title: "Müller gegen Maier", type: "legal_case", frontmatter: {} });
      }
      if (url.includes("/api/pages/docs%2Fklage")) {
        return Response.json({
          title: "Klage",
          content: "Klagetext",
          frontmatter: { case_slug: "cases/a" },
        });
      }
      if (url.includes("/api/files/docs/klage")) {
        return new Response("%PDF-1.7", {
          headers: {
            "content-type": "application/pdf",
            "content-disposition": 'attachment; filename="klage.pdf"',
          },
        });
      }
      return new Response("{}", { status: 404 });
    })
  );
});

async function openRoomWithInvite() {
  as(host, "brain-host");
  const created = await (
    await rooms.POST(req("POST", "/api/data-rooms", { case_slug: "cases/a" }))
  ).json();
  const id = created.data.id as string;
  expect(
    (await room.PUT(req("PUT", `/api/data-rooms/${id}`, { doc_slugs: ["docs/klage"] }), params(id)))
      .status
  ).toBe(200);
  const invited = await members.POST(
    req("POST", `/api/data-rooms/${id}/members`, { email: guest.email }),
    params(id)
  );
  expect(invited.status).toBe(200);
  const token = new URL(who.mails[0]!.text.match(/https:\S+/)![0]).searchParams.get("token")!;
  return { id, token };
}

describe("data rooms", () => {
  it("lets another firm's invited lawyer read exactly the shared documents", async () => {
    const { id, token } = await openRoomWithInvite();

    as(stranger, "brain-gast");
    expect((await accept.POST(req("POST", "/api/data-rooms/accept", { token }))).status).toBe(403);

    as(guest, "brain-gast");
    expect((await accept.POST(req("POST", "/api/data-rooms/accept", { token }))).status).toBe(200);
    expect((await accept.POST(req("POST", "/api/data-rooms/accept", { token }))).status).toBe(410);

    const view = await (await room.GET(req("GET", `/api/data-rooms/${id}`), params(id))).json();
    expect(view.data).toMatchObject({ role: "guest", host_firm: "Kanzlei Host" });
    expect(view.data.documents.map((d: { slug: string }) => d.slug)).toEqual(["docs/klage"]);
    expect(view.data.members).toBeUndefined();

    const file = await document.GET(
      req("GET", `/api/data-rooms/${id}/document?slug=docs/klage&inline=1`),
      params(id)
    );
    expect(file.status).toBe(200);
    expect(file.headers.get("content-disposition")).toMatch(/^inline/);
    const other = await document.GET(
      req("GET", `/api/data-rooms/${id}/document?slug=docs/intern`),
      params(id)
    );
    expect(other.status).toBe(404);
    expect(
      who.audit.some((a) => a.action === "data_room.access" && a.brainId === "brain-host")
    ).toBe(true);

    const list = await (await rooms.GET(req("GET", "/api/data-rooms"))).json();
    expect(list.data.shared_with_us).toHaveLength(1);
  });

  it("ends access when the host revokes it", async () => {
    const { id, token } = await openRoomWithInvite();
    as(guest, "brain-gast");
    await accept.POST(req("POST", "/api/data-rooms/accept", { token }));

    as(host, "brain-host");
    const detail = await (await room.GET(req("GET", `/api/data-rooms/${id}`), params(id))).json();
    const memberId = detail.data.members[0].id as string;
    expect(
      (
        await members.DELETE(
          req("DELETE", `/api/data-rooms/${id}/members`, { member_id: memberId }),
          params(id)
        )
      ).status
    ).toBe(200);

    as(guest, "brain-gast");
    expect((await room.GET(req("GET", `/api/data-rooms/${id}`), params(id))).status).toBe(404);
    expect(
      (await document.GET(req("GET", `/api/data-rooms/${id}/document?slug=docs/klage`), params(id)))
        .status
    ).toBe(404);
  });

  it("refuses guests from managing and colleagues of the host from accepting", async () => {
    const { id, token } = await openRoomWithInvite();
    as({ ...host, id: "u-host2", email: guest.email }, "brain-host");
    expect((await accept.POST(req("POST", "/api/data-rooms/accept", { token }))).status).toBe(409);

    as(guest, "brain-gast");
    await accept.POST(req("POST", "/api/data-rooms/accept", { token }));
    expect(
      (await room.PUT(req("PUT", `/api/data-rooms/${id}`, { doc_slugs: [] }), params(id))).status
    ).toBe(403);
    expect(
      (
        await members.POST(
          req("POST", `/api/data-rooms/${id}/members`, { email: "a@b.at" }),
          params(id)
        )
      ).status
    ).toBe(403);
  });

  it("only shares documents of the room's matter", async () => {
    as(host, "brain-host");
    const created = await (
      await rooms.POST(req("POST", "/api/data-rooms", { case_slug: "cases/a" }))
    ).json();
    const id = created.data.id as string;
    const res = await room.PUT(
      req("PUT", `/api/data-rooms/${id}`, { doc_slugs: ["docs/fremd"] }),
      params(id)
    );
    expect(res.status).toBe(400);
  });
});
