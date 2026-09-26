// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  brainId: "brain-b",
  createCalendarEvent: vi.fn(),
  connected: false,
}));

vi.mock("@/lib/msgraph", async (orig) => {
  const real = await orig<typeof import("@/lib/msgraph")>();
  return {
    ...real,
    isMsGraphConfigured: () => true,
    createCalendarEvent: (...a: unknown[]) => m.createCalendarEvent(...a),
  };
});
vi.mock("@/lib/msgraph-user", () => ({
  createUserCalendarEvent: vi.fn(),
  isDelegatedMs365Configured: () => true,
  isMs365Connected: () => m.connected,
}));
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({ getById: async () => ({ id: "u1" }) }),
}));
vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test", enginePatchPage: vi.fn() }));
vi.mock("@/lib/engine-write", () => ({ engineWriteBestEffort: vi.fn(async () => true) }));
vi.mock("@/lib/api-handler", async (orig) => {
  const real = await orig<typeof import("@/lib/api-handler")>();
  return {
    ...real,
    createHandler:
      (
        opts: { body?: { parse: (v: unknown) => unknown } },
        handler: (ctx: unknown, body: unknown) => Promise<Response>
      ) =>
      async (req: Request) =>
        handler(
          { brainId: m.brainId, headers: {}, user: { id: "u1" } },
          opts.body!.parse(await req.json())
        ),
  };
});

import { POST } from "./route";

const post = () =>
  (POST as unknown as (r: Request) => Promise<Response>)(
    new Request("http://x/api/outlook/calendar/create", {
      method: "POST",
      body: JSON.stringify({
        subject: "Termin",
        start: "2026-10-01T10:00",
        end: "2026-10-01T11:00",
      }),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MS365_BRAIN_ID = "brain-a";
  m.brainId = "brain-b";
  m.connected = false;
  m.createCalendarEvent.mockResolvedValue({ id: "ev1" });
});

describe("POST /api/outlook/calendar/create", () => {
  it("a firm other than the bound one without a personal connection is skipped, not sent to the service mailbox", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toMatchObject({ delegated: false, skipped: "not_connected" });
    expect(m.createCalendarEvent).not.toHaveBeenCalled();
  });

  it("the bound firm still uses the service mailbox", async () => {
    m.brainId = "brain-a";
    const res = await post();
    expect(res.status).toBe(200);
    expect(m.createCalendarEvent).toHaveBeenCalledTimes(1);
  });
});
