// @vitest-environment node
//
// The reminder cron reads SMTP from EACH firm's own settings (server-side,
// trusted headers) and reports a failed run as HTTP 500 instead of 200.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  settings: {} as Record<string, Record<string, unknown> | Error>,
  pages: {} as Record<string, Record<string, unknown[] | Error>>,
  transports: [] as Array<{ host: string; sendMail: ReturnType<typeof vi.fn> }>,
  patch: vi.fn(),
}));

vi.mock("@/lib/api-handler", () => ({
  createCronHandler: (handler: (req: NextRequest) => Promise<Response>) => handler,
}));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: (b: string) => ({ "x-subsumio-source": b }),
  enginePatchPage: (...a: unknown[]) => m.patch(...a),
}));
vi.mock("@/lib/kanzlei-settings-server", () => ({
  loadKanzleiSettingsForBrain: vi.fn(async (brainId: string) => {
    const s = m.settings[brainId];
    if (s instanceof Error) throw s;
    return { stundensatz: "200", rechtsgebietSaetze: {}, ...(s ?? {}) };
  }),
  isSmtpConfigured: (s: Record<string, unknown>) => !!(s.smtpHost && s.smtpUser && s.smtpPassword),
}));
vi.mock("@/lib/cron-utils", () => {
  const read = async (brainId: string, type: string) => {
    const v = m.pages[brainId]?.[type];
    if (v instanceof Error) throw v;
    return v ?? [];
  };
  return {
    fetchAllPagesStrict: vi.fn(read),
    fetchPages: vi.fn(read),
    getRecipientsByBrain: vi.fn(
      async () =>
        new Map([
          ["brain-a", [{ id: "ua", email: "a@firm-a.test" }]],
          ["brain-b", [{ id: "ub", email: "b@firm-b.test" }]],
        ])
    ),
  };
});
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn((opts: { host: string }) => {
      const t = { host: opts.host, sendMail: vi.fn(async () => ({})) };
      m.transports.push(t);
      return t;
    }),
  },
}));
vi.mock("@/lib/email/tracking", () => ({
  generateTrackingId: () => "tid",
  injectTracking: (html: string) => html,
  logTrackingEvent: vi.fn(),
}));
vi.mock("@/lib/comments", () => ({
  createDeadlineNotification: vi.fn(async () => undefined),
  createIntakeStaleNotification: vi.fn(async () => undefined),
  createNotificationFailureNotification: vi.fn(async () => undefined),
}));
vi.mock("@/lib/whatsapp/proactive-send", () => ({ sendProactiveMessage: vi.fn() }));
vi.mock("@/lib/whatsapp/identity-store", () => ({
  getWhatsAppIdentityStore: () => ({ listByOrg: vi.fn(async () => []) }),
}));
vi.mock("@/lib/push-send", () => ({ sendPushToUser: vi.fn(async () => 0) }));

import { GET } from "./route";

const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const deadline = (slug: string) => ({
  slug,
  title: "Berufungsfrist",
  frontmatter: { due_date: tomorrow, status: "open" },
});
const run = () =>
  (GET as unknown as (r: Request) => Promise<Response>)(
    new Request("http://localhost/api/cron/deadline-reminders")
  );

beforeEach(() => {
  vi.clearAllMocks();
  m.transports.length = 0;
  m.patch.mockResolvedValue(Response.json({ ok: true }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ frontmatter: {} }))
  );
  m.settings = {
    "brain-a": { smtpHost: "smtp.a.test", smtpUser: "ua", smtpPassword: "pa" },
    "brain-b": {},
  };
  m.pages = {
    "brain-a": { legal_deadline: [deadline("legal/deadlines/a1")] },
    "brain-b": { legal_deadline: [deadline("legal/deadlines/b1")] },
  };
});

describe("cron deadline-reminders", () => {
  it("emails with each firm's own SMTP settings", async () => {
    const res = await run();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);

    // Only firm A has SMTP; its transport uses firm A's host and mails firm A.
    expect(m.transports).toHaveLength(1);
    expect(m.transports[0]!.host).toBe("smtp.a.test");
    expect(m.transports[0]!.sendMail).toHaveBeenCalledTimes(1);
    expect(m.transports[0]!.sendMail.mock.calls[0]![0]).toMatchObject({ to: "a@firm-a.test" });
    expect(body.emailed).toBe(1);
    expect(body.smtp_configured_brains).toBe(1);

    // Firm B is reported as smtp_not_configured, still gets in-app reminders.
    expect(body.failed).toEqual([
      expect.objectContaining({ deadline_id: "legal/deadlines/b1", reason: "smtp_not_configured" }),
    ]);
    expect(body.in_app).toBe(2);
  });

  it("returns 500 when a firm's deadlines cannot be read (strict), keeping the report", async () => {
    m.pages["brain-b"] = { legal_deadline: new Error("list legal_deadline failed: HTTP 503") };
    const res = await run();
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.errors.join("\n")).toMatch(/brain-b.*HTTP 503/);
    // Firm A was still processed.
    expect(body.emailed).toBe(1);
  });

  it("unreadable settings are an error, not 'SMTP not configured'", async () => {
    m.settings["brain-a"] = new Error("kanzlei settings read returned HTTP 401");
    const res = await run();
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.errors.join("\n")).toMatch(/settings unreadable for brain brain-a/);
    expect(body.failed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          deadline_id: "legal/deadlines/a1",
          reason: "settings_unavailable",
        }),
      ])
    );
  });
});
