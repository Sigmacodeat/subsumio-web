import type { NextRequest } from "next/server";
// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

const mockListEnginePages = vi.fn();
const mockListPortalMessages = vi.fn();
const mockListMailMessages = vi.fn();
const mockCaseAccess = vi.fn();

vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: (...args: unknown[]) => mockListEnginePages(...args),
}));
vi.mock("@/lib/portal-messages", () => ({
  listPortalMessages: (...args: unknown[]) => mockListPortalMessages(...args),
}));
vi.mock("@/lib/email/mailbox", () => ({
  listMailMessages: (...args: unknown[]) => mockListMailMessages(...args),
}));
vi.mock("@/lib/email/mailbox-scope", () => ({
  mailboxScopeFor: () => ({ userId: "u1", brainId: "brain-at" }),
}));
vi.mock("@/lib/email/case-link", () => ({
  caseAccessForUser: (...args: unknown[]) => mockCaseAccess(...args),
}));

vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    opts: {
      query?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } };
    },
    handler: (ctx: unknown, body: unknown, query: unknown, req: Request) => Promise<Response>
  ) => {
    const ctx = {
      headers: { "x-subsumio-source": "brain-at" },
      brainId: "brain-at",
      user: { id: "u1", name: "Anwalt", email: "anwalt@example.com" },
    };
    return async (req: Request) => {
      const url = new URL(req.url);
      const query = Object.fromEntries(url.searchParams.entries());
      const parsed = opts.query?.safeParse(query);
      if (parsed && !parsed.success) {
        return Response.json({ error: "validation_failed" }, { status: 400 });
      }
      return handler(ctx, undefined, parsed?.data ?? query, req);
    };
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiSuccess: (data: unknown, _meta?: unknown, status = 200) => Response.json({ data }, { status }),
}));

import { GET } from "./route";

const CS = "legal/cases/2026-0001";

function get(caseSlug = CS) {
  return GET(
    new Request(
      `http://localhost/api/legal/communications?case_slug=${encodeURIComponent(caseSlug)}`
    ) as unknown as NextRequest
  );
}

describe("GET /api/legal/communications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCaseAccess.mockResolvedValue("allowed");
    mockListEnginePages.mockResolvedValue([]);
    mockListPortalMessages.mockResolvedValue([]);
    mockListMailMessages.mockResolvedValue([]);
  });

  test("rejects a missing case_slug", async () => {
    const res = await get("");
    expect(res.status).toBe(400);
    expect(mockCaseAccess).not.toHaveBeenCalled();
  });

  test("returns 404 when the case does not exist", async () => {
    mockCaseAccess.mockResolvedValue("not_found");
    const res = await get();
    expect(res.status).toBe(404);
  });

  test("returns 403 for an ethical-wall-blocked case", async () => {
    mockCaseAccess.mockResolvedValue("blocked");
    const res = await get();
    expect(res.status).toBe(403);
    expect(mockListEnginePages).not.toHaveBeenCalled();
    expect(mockListMailMessages).not.toHaveBeenCalled();
  });

  test("aggregates all sources sorted newest first", async () => {
    mockListEnginePages.mockImplementation((_h: unknown, type: string) => {
      if (type === "inbound_entry") {
        return Promise.resolve([
          {
            slug: "legal/inbound-register/in-1",
            frontmatter: {
              id: "in-1",
              received_at: "2026-09-20T10:00:00Z",
              channel: "erv",
              direction: "inbound",
              subject: "Ladung BG",
              case_slug: CS,
              sender_name: "Bezirksgericht",
            },
          },
          {
            // Fremde Akte — darf nicht durchrutschen
            slug: "legal/inbound-register/in-9",
            frontmatter: {
              id: "in-9",
              received_at: "2026-09-21T10:00:00Z",
              channel: "post",
              direction: "inbound",
              subject: "Andere Akte",
              case_slug: "legal/cases/2026-9999",
            },
          },
        ]);
      }
      if (type === "outbound_entry") {
        return Promise.resolve([
          {
            slug: "legal/outbound-register/out-1",
            frontmatter: {
              id: "out-1",
              date: "2026-09-22",
              created_at: "2026-09-22T09:00:00Z",
              channel: "erv",
              subject: "Klage eingereicht",
              case_slug: CS,
              recipient_name: "LG Wien",
              delivery_status: "delivered",
            },
          },
        ]);
      }
      if (type === "conversation_event") {
        return Promise.resolve([
          {
            slug: "legal/conversations/whatsapp/wamid-1",
            title: "WhatsApp question",
            frontmatter: {
              channel: "whatsapp",
              direction: "inbound",
              case_slug: CS,
              normalized_text: "Habe die Unterlagen geschickt",
              actor_name: "Max Mandant",
              provider_message_id: "wamid-1",
              status: "received",
              created_at: "2026-09-19T12:00:00Z",
            },
          },
        ]);
      }
      return Promise.resolve([]);
    });
    mockListPortalMessages.mockResolvedValue([
      {
        id: "pm-1",
        text: "Wann ist der Termin?",
        sender: "client",
        createdAt: "2026-09-23T08:00:00Z",
      },
    ]);
    mockListMailMessages.mockResolvedValue([
      {
        id: "m-1",
        direction: "outbound",
        status: "sent",
        fromEmail: "kanzlei@example.com",
        fromName: "Kanzlei",
        toEmails: ["mandant@example.com"],
        subject: "Ihre Akte — Zwischenstand",
        createdAt: "2026-09-24T07:00:00Z",
      },
    ]);

    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    const items = body.data.items;
    expect(items).toHaveLength(5);
    // Chronologisch absteigend
    expect(items[0].id).toBe("mail-m-1");
    expect(items[1].id).toBe("pm-pm-1");
    expect(items[2].id).toBe("out-out-1");
    expect(items[3].id).toBe("in-in-1");
    expect(items[4].id).toBe("wa-wamid-1");
    // Cross-matter-Leak ausgeschlossen
    expect(items.some((i: { id: string }) => i.id === "in-in-9")).toBe(false);
    // Normalisierung
    expect(items[2]).toMatchObject({
      direction: "outbound",
      channel: "erv",
      party: "LG Wien",
      status: "delivered",
      source: "postausgang",
    });
    expect(items[1]).toMatchObject({ direction: "inbound", channel: "portal", source: "portal" });
  });

  test("survives a failing source (partial result)", async () => {
    mockListEnginePages.mockRejectedValue(new Error("engine down"));
    mockListPortalMessages.mockResolvedValue([
      { id: "pm-1", text: "Hallo", sender: "lawyer", createdAt: "2026-09-23T08:00:00Z" },
    ]);
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].id).toBe("pm-pm-1");
  });

  test("returns an empty list when nothing exists", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toEqual([]);
    expect(body.data.total).toBe(0);
  });
});
