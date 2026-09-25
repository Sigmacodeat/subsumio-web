// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

const queryResults: Record<string, unknown>[][] = [];
const queryCalls: { sql: string; params: unknown[] }[] = [];
const pool = {
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    queryCalls.push({ sql, params });
    return { rows: queryResults.shift() ?? [], rowCount: 0 };
  }),
};

const getSharedPgPool = vi.fn((): typeof pool | null => pool);
const filterNewIds = vi.fn(async (..._args: unknown[]) => new Set<number>([0]));
const logTrackingEvent = vi.fn(async (..._args: unknown[]) => null);
const logAudit = vi.fn(async (..._args: unknown[]) => undefined);
const listEnginePages = vi.fn(async (..._args: unknown[]) => [] as Record<string, unknown>[]);
const enginePatchPage = vi.fn(async (..._args: unknown[]) => new Response("{}", { status: 200 }));

vi.mock("@/lib/auth/store", () => ({
  getSharedPgPool: () => getSharedPgPool(),
}));
vi.mock("@/lib/caselaw-dedup", () => ({
  filterNewIds: (...args: unknown[]) => filterNewIds(...args),
}));
vi.mock("@/lib/email/tracking", () => ({
  logTrackingEvent: (...args: unknown[]) => logTrackingEvent(...args),
}));
vi.mock("@/lib/audit", () => ({
  logAudit: (...args: unknown[]) => logAudit(...args),
}));
vi.mock("@/lib/engine", () => ({
  engineHeadersForBrain: (brainId: string) => ({ "x-subsumio-source": brainId }),
  enginePatchPage: (...args: unknown[]) => enginePatchPage(...args),
  ENGINE_URL: "http://engine.test",
}));
vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: (...args: unknown[]) => listEnginePages(...args),
}));

import { reconcileResendDeliveryEvent } from "./delivery-status";

const bounceEvent = {
  type: "email.bounced",
  data: { email_id: "re_abc", subject: "Test", to: ["m@x.at"], created_at: "2026-01-01T10:00:00Z" },
};

describe("reconcileResendDeliveryEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryResults.length = 0;
    queryCalls.length = 0;
    getSharedPgPool.mockReturnValue(pool);
    filterNewIds.mockResolvedValue(new Set([0]));
    listEnginePages.mockResolvedValue([]);
  });

  test("ignoriert Nicht-Delivery-Events", async () => {
    const res = await reconcileResendDeliveryEvent({ type: "contact.created" }, "k");
    expect(res.handled).toBe(false);
    expect(filterNewIds).not.toHaveBeenCalled();
  });

  test("Replay/Doppel-Endpoint: dedupeKey schon gesehen → deduped, keine Writes", async () => {
    filterNewIds.mockResolvedValue(new Set<number>());
    const res = await reconcileResendDeliveryEvent(bounceEvent, "re_abc:email.bounced");
    expect(res.deduped).toBe(true);
    expect(logTrackingEvent).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  test("korreliert via provider_id und schreibt Tracking-Event + Audit", async () => {
    queryResults.push([{ id: "m1", brain_id: "brain-1", tracking_id: "trk_1" }]);
    const res = await reconcileResendDeliveryEvent(bounceEvent, "re_abc:email.bounced");

    expect(res.status).toBe("bounced");
    expect(res.messageId).toBe("m1");
    expect(res.brainId).toBe("brain-1");
    expect(logTrackingEvent).toHaveBeenCalledWith(
      expect.objectContaining({ trackingId: "trk_1", eventType: "bounced", messageId: "m1" })
    );
    expect(logAudit).toHaveBeenCalledWith(
      "comm.delivery_status",
      "outbound_email",
      expect.objectContaining({
        entityId: "m1",
        brainId: "brain-1",
        details: expect.objectContaining({ status: "bounced", emailId: "re_abc" }),
      })
    );
  });

  test("korreliert via tracking-Event raw.resend_id (Case-E-Mail-Pfad)", async () => {
    queryResults.push([]); // kein mailbox-Treffer
    queryResults.push([{ tracking_id: "trk_9", message_id: null, brain_id: "brain-2" }]);
    const res = await reconcileResendDeliveryEvent(
      { type: "email.failed", data: { email_id: "re_z" } },
      "re_z:email.failed"
    );
    expect(res.status).toBe("failed");
    expect(res.trackingId).toBe("trk_9");
    expect(res.brainId).toBe("brain-2");
    expect(logTrackingEvent).toHaveBeenCalledWith(
      expect.objectContaining({ trackingId: "trk_9", eventType: "failed" })
    );
  });

  test("schreibt delivery_status auf passende outbound_entry-Seiten", async () => {
    queryResults.push([{ id: "m1", brain_id: "brain-1", tracking_id: "trk_1" }]);
    listEnginePages.mockResolvedValue([
      {
        slug: "legal/outbound-register/out-1",
        frontmatter: { tracking_id: "trk_1", delivery_status: "sent" },
      },
      {
        slug: "legal/outbound-register/out-2",
        frontmatter: { tracking_id: "trk_other", delivery_status: "sent" },
      },
    ] as never);

    const res = await reconcileResendDeliveryEvent(bounceEvent, "re_abc:email.bounced");
    expect(res.pagesUpdated).toBe(1);
    expect(enginePatchPage).toHaveBeenCalledTimes(1);
    expect(enginePatchPage).toHaveBeenCalledWith(
      expect.objectContaining({ "x-subsumio-source": "brain-1" }),
      expect.objectContaining({
        slug: "legal/outbound-register/out-1",
        frontmatter: expect.objectContaining({
          delivery_status: "bounced",
          delivery_status_at: "2026-01-01T10:00:00Z",
          delivery_event: "email.bounced",
          provider_id: "re_abc",
        }),
      })
    );
  });

  test("späteres 'delivered' überschreibt terminalen Fehler nicht", async () => {
    queryResults.push([{ id: "m1", brain_id: "brain-1", tracking_id: "trk_1" }]);
    listEnginePages.mockResolvedValue([
      {
        slug: "legal/outbound-register/out-1",
        frontmatter: { tracking_id: "trk_1", delivery_status: "bounced" },
      },
    ] as never);

    const res = await reconcileResendDeliveryEvent(
      { type: "email.delivered", data: { email_id: "re_abc" } },
      "re_abc:email.delivered"
    );
    expect(res.pagesUpdated).toBe(0);
    expect(enginePatchPage).not.toHaveBeenCalled();
    // Die Mailbox-/Tracking-Aggregate werden trotzdem gepflegt.
    expect(logTrackingEvent).toHaveBeenCalled();
  });

  test("kein Treffer → Status-Event landet im Audit, keine Page-Updates", async () => {
    queryResults.push([], []); // mailbox + tracking-Lookup leer
    const res = await reconcileResendDeliveryEvent(bounceEvent, "re_abc:email.bounced");
    expect(res.handled).toBe(true);
    expect(res.pagesUpdated).toBe(0);
    expect(logTrackingEvent).not.toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledWith(
      "comm.delivery_status",
      "outbound_email",
      expect.objectContaining({ entityId: "re_abc" })
    );
  });

  test("ohne DB-Pool: kein Crash, nur Audit", async () => {
    getSharedPgPool.mockReturnValue(null);
    const res = await reconcileResendDeliveryEvent(bounceEvent, "re_abc:email.bounced");
    expect(res.handled).toBe(true);
    expect(res.pagesUpdated).toBe(0);
    expect(logAudit).toHaveBeenCalled();
  });
});
