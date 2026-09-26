// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ brainId: "brain-a", syncMail: vi.fn(), syncCalendar: vi.fn() }));

vi.mock("@/lib/msgraph", async (orig) => {
  const real = await orig<typeof import("@/lib/msgraph")>();
  return {
    ...real,
    isMsGraphConfigured: () => true,
    syncMail: (...a: unknown[]) => m.syncMail(...a),
    syncCalendar: (...a: unknown[]) => m.syncCalendar(...a),
  };
});
vi.mock("@/lib/api-handler", async (orig) => {
  const real = await orig<typeof import("@/lib/api-handler")>();
  return {
    ...real,
    createHandler:
      (
        opts: { query?: { parse: (v: unknown) => unknown } },
        handler: (ctx: unknown, body: unknown, query: unknown) => Promise<Response>
      ) =>
      async (req: Request) => {
        const url = new URL(req.url);
        const query = opts.query ? opts.query.parse(Object.fromEntries(url.searchParams)) : {};
        return handler({ brainId: m.brainId, headers: {}, user: { id: "u1" } }, undefined, query);
      },
  };
});

import { GET as mailGET } from "./route";
import { GET as calendarGET } from "../calendar/route";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MS365_BRAIN_ID = "brain-a";
  process.env.MS365_MAILBOX = "kanzlei@firma.example";
  m.brainId = "brain-a";
  m.syncMail.mockResolvedValue({ messages: [] });
  m.syncCalendar.mockResolvedValue({ events: [] });
});

const get = (fn: typeof mailGET, qs = "") =>
  (fn as unknown as (r: Request) => Promise<Response>)(new Request(`http://x/api/outlook/x${qs}`));

describe("/api/outlook/mail and /calendar (app access)", () => {
  it("serve only the firm the service mailbox is bound to", async () => {
    m.brainId = "brain-b";
    expect((await get(mailGET)).status).toBe(403);
    expect((await get(calendarGET)).status).toBe(403);
    expect(m.syncMail).not.toHaveBeenCalled();
    expect(m.syncCalendar).not.toHaveBeenCalled();
  });

  it("serve nobody while no firm is bound", async () => {
    process.env.MS365_BRAIN_ID = "";
    expect((await get(mailGET)).status).toBe(403);
  });

  it("reject a delta link outside the service mailbox with 400", async () => {
    const res = await get(mailGET, "?deltaLink=/users/x/messages");
    expect(res.status).toBe(400);
    expect(m.syncMail).not.toHaveBeenCalled();
  });

  it("the bound firm gets its mail", async () => {
    expect((await get(mailGET)).status).toBe(200);
    expect(m.syncMail).toHaveBeenCalledTimes(1);
  });
});
