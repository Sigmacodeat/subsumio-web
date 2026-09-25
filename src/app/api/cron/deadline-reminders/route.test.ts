// @vitest-environment node
//
// The reminder cron reads SMTP from EACH firm's own settings (server-side,
// trusted headers) and reports a failed run as HTTP 500 instead of 200.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  settings: {} as Record<string, Record<string, unknown> | Error>,
  pages: {} as Record<string, Record<string, unknown[] | Error>>,
  users: null as null | Map<string, Array<Record<string, unknown>>>,
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
vi.mock("@/lib/cron-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cron-utils")>();
  const read = async (brainId: string, type: string) => {
    const v = m.pages[brainId]?.[type];
    if (v instanceof Error) throw v;
    return v ?? [];
  };
  return {
    activeStaffRecipients: actual.activeStaffRecipients,
    matterPermissionsBySlug: actual.matterPermissionsBySlug,
    recipientsForMatter: actual.recipientsForMatter,
    fetchAllPagesStrict: vi.fn(read),
    fetchPages: vi.fn(read),
    getRecipientsByBrain: vi.fn(
      async () =>
        m.users ??
        new Map([
          ["brain-a", [{ id: "ua", email: "a@firm-a.test", role: "lawyer" }]],
          ["brain-b", [{ id: "ub", email: "b@firm-b.test", role: "lawyer" }]],
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
  m.users = null;
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

describe("cron deadline-reminders — Ruhetage", () => {
  // 2026-09-26 08:00 UTC = Samstag in Wien. Nur Date wird gefälscht, damit
  // AbortSignal.timeout & Co. der Route normal weiterlaufen.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-09-26T08:00:00Z") });
    const page = (slug: string, fm: Record<string, unknown>) => ({
      slug,
      title: slug,
      frontmatter: { status: "open", ...fm },
    });
    m.settings = {
      "brain-a": {
        smtpHost: "smtp.a.test",
        smtpUser: "ua",
        smtpPassword: "pa",
        rechtsraumCountry: "AT",
      },
      // Firma B hat Ruhetage abgeschaltet.
      "brain-b": { deadlineQuietDays: false },
    };
    m.pages = {
      "brain-a": {
        legal_deadline: [
          // Stufe 3 ("in 3 Tagen") — Routine, wartet bis Montag.
          page("legal/deadlines/a-routine", { due_date: "2026-09-29" }),
          // Notfrist in 3 Tagen — geht IMMER raus.
          page("legal/deadlines/a-notfrist", { due_date: "2026-09-29", is_notfrist: true }),
          // Heute fällig (Stufe 0) — geht IMMER raus.
          page("legal/deadlines/a-today", { due_date: "2026-09-26" }),
        ],
      },
      "brain-b": {
        legal_deadline: [page("legal/deadlines/b-routine", { due_date: "2026-09-29" })],
      },
    };
  });
  afterEach(() => vi.useRealTimers());

  it("am Samstag warten Stufen-Erinnerungen, Notfristen und heute Fälliges gehen raus", async () => {
    const res = await run();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.quiet_days_deferred).toBe(1);

    // Firma A: eine Mail mit genau den zwei dringenden Fristen.
    expect(m.transports).toHaveLength(1);
    expect(m.transports[0]!.sendMail).toHaveBeenCalledTimes(1);
    const html = String((m.transports[0]!.sendMail.mock.calls[0]![0] as { html: string }).html);
    expect(html).toContain("legal/deadlines/a-notfrist");
    expect(html).toContain("legal/deadlines/a-today");
    expect(html).not.toContain("legal/deadlines/a-routine");

    // Die zurückgestellte Frist wird NICHT als gesendet markiert.
    const patchedSlugs = m.patch.mock.calls.map((c) => (c[1] as { slug: string }).slug);
    expect(patchedSlugs).toContain("legal/deadlines/a-notfrist");
    expect(patchedSlugs).not.toContain("legal/deadlines/a-routine");

    // Firma B (Ruhetage aus) bekommt ihre Routine-Erinnerung wie immer: drei
    // fällige Fristen insgesamt, In-App zählt pro Gruppe und Empfänger (A: 1, B: 1).
    expect(body.total).toBe(3);
    expect(body.in_app).toBe(2);
    expect(body.failed).toEqual([
      expect.objectContaining({
        deadline_id: "legal/deadlines/b-routine",
        reason: "smtp_not_configured",
      }),
    ]);
  });

  it("notifies only active staff with access to the matter, one mail per person", async () => {
    const { createDeadlineNotification } = await import("@/lib/comments");
    m.users = new Map([
      [
        "brain-a",
        [
          { id: "admin", email: "admin@firm-a.test", role: "admin" },
          { id: "lawyer", email: "lawyer@firm-a.test", role: "lawyer" },
          { id: "walled", email: "walled@firm-a.test", role: "assistant" },
          { id: "client", email: "client@client.test", role: "client_viewer" },
          {
            id: "gone",
            email: "gone@firm-a.test",
            role: "lawyer",
            deactivatedAt: "2026-01-01T00:00:00Z",
          },
        ],
      ],
    ]);
    m.pages = {
      "brain-a": {
        legal_case: [
          {
            slug: "cases/walled",
            title: "Akte W",
            type: "legal_case",
            frontmatter: { permissions: { blocked_users: ["walled"] } },
          },
        ],
        legal_deadline: [
          {
            slug: "legal/deadlines/w1",
            title: "Berufungsfrist",
            frontmatter: { due_date: tomorrow, status: "open", case_slug: "cases/walled" },
          },
        ],
      },
    };
    const res = await run();
    expect(res.status).toBe(200);
    const sent = m.transports[0]!.sendMail.mock.calls.map((c) => (c[0] as { to: string }).to);
    expect(sent.sort()).toEqual(["admin@firm-a.test", "lawyer@firm-a.test"]);
    for (const to of sent) expect(to).not.toContain(",");
    const notified = vi
      .mocked(createDeadlineNotification)
      .mock.calls.map((c) => (c[0] as { userId: string }).userId);
    expect([...new Set(notified)].sort()).toEqual(["admin", "lawyer"]);
  });
});

describe("cron deadline-reminders — stale intake notices", () => {
  it("go to active staff only; an intake tied to a matter only to people with access", async () => {
    const { createIntakeStaleNotification } = await import("@/lib/comments");
    m.users = new Map([
      [
        "brain-a",
        [
          { id: "admin", email: "admin@firm-a.test", role: "admin" },
          { id: "walled", email: "walled@firm-a.test", role: "lawyer" },
          { id: "client", email: "client@client.test", role: "client_viewer" },
          { id: "gone", email: "gone@firm-a.test", role: "lawyer", deactivatedAt: "2026-01-01" },
        ],
      ],
    ]);
    const old = new Date(Date.now() - 3 * 86_400_000).toISOString();
    m.pages = {
      "brain-a": {
        legal_case: [
          {
            slug: "cases/walled",
            title: "Akte W",
            frontmatter: { permissions: { blocked_users: ["walled"] } },
          },
        ],
        intake_request: [
          { slug: "intake/free", title: "I1", frontmatter: { status: "new", created_at: old } },
          {
            slug: "intake/tied",
            title: "I2",
            frontmatter: {
              status: "accepted",
              created_at: old,
              converted_case_slug: "cases/walled",
            },
          },
        ],
      },
    };
    await run();
    const calls = vi
      .mocked(createIntakeStaleNotification)
      .mock.calls.map((c) => c[0] as { userId: string; intakeSlug: string });
    const to = (slug: string) =>
      calls
        .filter((c) => c.intakeSlug === slug)
        .map((c) => c.userId)
        .sort();
    expect(to("intake/free")).toEqual(["admin", "walled"]);
    expect(to("intake/tied")).toEqual(["admin"]);
  });
});
