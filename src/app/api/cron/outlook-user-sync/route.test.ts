// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  tokenError: null as Error | null,
  notify: vi.fn(async (..._a: unknown[]) => undefined),
  success: vi.fn(async (..._a: unknown[]) => undefined),
}));

vi.mock("@/lib/api-handler", () => ({
  createCronHandler: (h: () => Promise<Response>) => h,
}));
vi.mock("@/lib/engine", () => ({ engineHeadersForBrain: () => ({}) }));
vi.mock("@/lib/cron-utils", () => ({
  getRecipientsByBrain: async () =>
    new Map([
      ["brain-a", [{ id: "u1", email: "a@k.at", ms365AccessToken: "a", ms365RefreshToken: "r" }]],
    ]),
  mapWithConcurrency: async <T>(items: T[], fn: (t: T) => Promise<void>) => {
    for (const i of items) await fn(i);
  },
}));
vi.mock("@/lib/msgraph-user", async (orig) => {
  const real = await orig<typeof import("@/lib/msgraph-user")>();
  return {
    ...real,
    getUserMs365Token: async () => {
      if (m.tokenError) throw m.tokenError;
      return "tok";
    },
    recordMs365SyncSuccess: (...a: unknown[]) => m.success(...a),
  };
});
const mb = vi.hoisted(() => ({
  accounts: [] as Array<{ id: string; calendarSync: boolean }>,
  sync: vi.fn(async (a: { id: string }) => ({ accountId: a.id, pulled: 1, pushed: 0, errors: [] })),
  recordError: vi.fn(async (..._a: unknown[]) => undefined),
}));
vi.mock("@/lib/email/imap-accounts", () => ({
  listCalendarSyncAccounts: async () => mb.accounts.filter((a) => a.calendarSync),
  recordCalendarSyncError: (...a: unknown[]) => mb.recordError(...a),
}));
vi.mock("@/lib/calendar/graph-user-sync", () => ({
  syncAccountCalendar: (a: { id: string }) => mb.sync(a),
  calendarSyncWindow: () => ({ start: new Date(), end: new Date() }),
  listAppointmentsForSync: async () => [],
  pushedEventIds: () => new Set(),
  pullOutlookEvents: async () => ({ pulled: 1, errors: [] }),
  pushAppointmentsToOutlook: async () => ({ pushed: 0, updated: 0, deleted: 0, errors: [] }),
}));
vi.mock("@/lib/comments", () => ({
  persistNotificationUpsert: (...a: unknown[]) => m.notify(...a),
}));

import { GET } from "./route";
import { Ms365AuthError, MS365_NEEDS_RECONNECT } from "@/lib/msgraph-user";

const run = async () =>
  (await (GET as unknown as () => Promise<Response>)()).json() as Promise<{
    errors: string[];
    usersSynced: number;
  }>;

beforeEach(() => {
  vi.clearAllMocks();
  m.tokenError = null;
  mb.accounts = [];
});

describe("cron/outlook-user-sync error classification", () => {
  it("classifies by error code: needs_reconnect notifies the user and is no job error", async () => {
    m.tokenError = new Ms365AuthError(
      "Token abgelaufen, kein Refresh-Token",
      MS365_NEEDS_RECONNECT
    );
    const out = await run();
    expect(out.errors).toEqual([]);
    expect(m.notify).toHaveBeenCalledTimes(1);
    expect(m.notify.mock.calls[0][0]).toMatchObject({ userId: "u1", brainId: "brain-a" });
  });

  it("any other failure is reported as an error", async () => {
    m.tokenError = new Ms365AuthError("boom", "temporarily_unavailable");
    const out = await run();
    expect(out.errors).toHaveLength(1);
    expect(m.notify).not.toHaveBeenCalled();
  });

  it("a clean run records the last successful sync", async () => {
    const out = await run();
    expect(out.usersSynced).toBe(1);
    expect(m.success).toHaveBeenCalledWith("u1");
  });

  it("syncs mailboxes that opted into the calendar sync, not the others", async () => {
    mb.accounts = [
      { id: "acc-on", calendarSync: true },
      { id: "acc-off", calendarSync: false },
    ];
    const out = (await run()) as unknown as { mailboxesSynced: number };
    expect(out.mailboxesSynced).toBe(1);
    expect(mb.sync).toHaveBeenCalledTimes(1);
    expect(mb.sync.mock.calls[0][0]).toMatchObject({ id: "acc-on" });
  });

  it("a mailbox whose sync fails keeps the error on the account", async () => {
    mb.accounts = [{ id: "acc-on", calendarSync: true }];
    mb.sync.mockRejectedValueOnce(new Error("calendar_sync_no_oauth_token"));
    const out = await run();
    expect(out.errors.some((e) => e.includes("acc-on"))).toBe(true);
    expect(mb.recordError).toHaveBeenCalledWith("acc-on", "calendar_sync_no_oauth_token");
  });
});
