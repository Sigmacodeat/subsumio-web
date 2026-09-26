// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mandant A (client_viewer) on its own matter sees only the released client
// view — no internal notes, strategy, time entries, drafts or unreleased
// documents — and nothing at all of matter B.

const { viewer } = vi.hoisted(() => ({
  viewer: { id: "u-client-a", role: "client_viewer" as string },
}));

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: (brainId: string) => ({ "x-subsumio-source": brainId }),
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { action: string },
      handler: (ctx: unknown, body: unknown, query: unknown) => Promise<Response>
    ) =>
    async (req: Request) => {
      const { can } = await import("@/lib/permissions");
      const ctx = { brainId: "firm-1", user: { ...viewer }, headers: {} };
      if (!can(ctx.user as never, opts.action as never)) {
        return Response.json({ error: "forbidden" }, { status: 403 });
      }
      const url = new URL(req.url);
      return handler(ctx, undefined, Object.fromEntries(url.searchParams));
    },
  apiSuccess: (data: unknown) => Response.json({ data }),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
}));

import { GET } from "./route";

const CASE_A = {
  slug: "legal/cases/mandant-a",
  title: "Mandant A ./. Gegner",
  type: "legal_case",
  content: "INTERNE STRATEGIE: Vergleich nicht unter 40k",
  frontmatter: {
    type: "legal_case",
    status: "active",
    portal_enabled: true,
    portal_summary: "Die Klage ist eingebracht.",
    internal_notes: "Mandant zahlt schleppend",
    time_entries: [{ id: "t1", minutes: 120, description: "Strategie" }],
    permissions: { grants: [{ user_id: "u-client-a", level: "read" }] },
    documents: [
      { id: "d1", name: "Klage.pdf", slug: "documents/klage", portal_visible: true },
      { id: "d2", name: "KI-Entwurf Berufung.docx", slug: "documents/entwurf", privileged: true },
      { id: "d3", name: "Aktenvermerk.docx", slug: "documents/vermerk" },
    ],
    deadlines: [
      { title: "Tagsatzung", due_date: "2026-11-02", review_status: "approved" },
      { title: "KI-Vorschlag", due_date: "2026-11-05", review_status: "unreviewed" },
    ],
  },
};
const CASE_B = {
  slug: "legal/cases/mandant-b",
  title: "Mandant B",
  type: "legal_case",
  content: "Fremde Akte",
  frontmatter: { type: "legal_case", status: "active", portal_enabled: true },
};

beforeEach(() => {
  viewer.role = "client_viewer";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/pages?")) return Response.json([CASE_A, CASE_B]);
      if (u.endsWith("/api/pages/legal/cases/mandant-a")) return Response.json(CASE_A);
      if (u.endsWith("/api/pages/legal/cases/mandant-b")) return Response.json(CASE_B);
      return Response.json({}, { status: 404 });
    })
  );
});

const get = (qs = "") =>
  (GET as unknown as (r: Request) => Promise<Response>)(
    new Request(`http://localhost/api/client/matters${qs}`)
  );

describe("GET /api/client/matters", () => {
  it("lists only the client's own matter, as the whitelisted portal view", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const text = await res.text();
    const { data } = JSON.parse(text);
    expect(data.matters.map((m: { slug: string }) => m.slug)).toEqual(["legal/cases/mandant-a"]);
    const m = data.matters[0];
    expect(m.content).toBe("Die Klage ist eingebracht.");
    expect(m.frontmatter.documents.map((d: { name: string }) => d.name)).toEqual(["Klage.pdf"]);
    expect(m.frontmatter.deadlines.map((d: { title: string }) => d.title)).toEqual(["Tagsatzung"]);
    for (const secret of [
      "INTERNE STRATEGIE",
      "schleppend",
      "time_entries",
      "KI-Entwurf",
      "Aktenvermerk",
      "KI-Vorschlag",
      "Mandant B",
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it("a foreign matter looks exactly like a missing one", async () => {
    const res = await get("?slug=legal/cases/mandant-b");
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("Fremde Akte");
  });

  it("a matter not released for the portal is not shown", async () => {
    CASE_A.frontmatter.portal_enabled = false;
    try {
      const res = await get("?slug=legal/cases/mandant-a");
      expect(res.status).toBe(404);
    } finally {
      CASE_A.frontmatter.portal_enabled = true;
    }
  });

  it("is the client view only — staff use the brain routes", async () => {
    viewer.role = "lawyer";
    expect((await get()).status).toBe(403);
  });
});

describe("client accounts and the brain routes", () => {
  it("brain.read, settings.read and presence are closed to client accounts", async () => {
    const { can } = await import("@/lib/permissions");
    const client = { id: "c", role: "client_viewer" } as never;
    for (const action of ["brain.read", "settings.read", "presence.list", "query.submit"]) {
      expect(can(client, action as never)).toBe(false);
    }
    expect(can(client, "client.read" as never)).toBe(true);
    expect(can(client, "account.read" as never)).toBe(true);
  });
});
