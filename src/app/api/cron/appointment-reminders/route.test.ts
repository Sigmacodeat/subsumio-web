// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const sendMail = vi.fn(async () => ({}));
const patchPage = vi.fn(async () => new Response("{}", { status: 200 }));
const fetchAllPagesStrict = vi.fn();

vi.mock("@/lib/api-handler", () => ({
  createCronHandler: (h: (req: NextRequest) => Promise<Response>) => h,
}));
vi.mock("@/lib/engine", () => ({
  engineHeadersForBrain: () => ({}),
  enginePatchPage: (...a: unknown[]) => patchPage(...(a as [])),
}));
vi.mock("@/lib/cron-utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cron-utils")>("@/lib/cron-utils");
  return {
    ...actual,
    getRecipientsByBrain: async () =>
      new Map([
        [
          "brain-1",
          [{ id: "u1", email: "anwalt@kanzlei.example", role: "lawyer", orgId: "org_1" }],
        ],
      ]),
    fetchAllPagesStrict: (...a: unknown[]) => fetchAllPagesStrict(...a),
    fetchPages: async () => [],
  };
});
vi.mock("@/lib/whatsapp/proactive-send", () => ({ sendProactiveMessage: vi.fn() }));
vi.mock("@/lib/whatsapp/identity-store", () => ({
  getWhatsAppIdentityStore: () => ({ listByOrg: async () => [] }),
}));
vi.mock("@/lib/kanzlei-settings-server", () => ({
  isSmtpConfigured: () => true,
  loadKanzleiSettingsForBrain: async () => ({
    smtpHost: "smtp.example",
    smtpUser: "u",
    smtpPassword: "p",
  }),
}));
vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail }) },
}));
vi.mock("@/lib/email/tracking", () => ({
  generateTrackingId: () => "t",
  injectTracking: (h: string) => h,
  logTrackingEvent: vi.fn(),
}));

import { GET } from "./route";

const req = () => new NextRequest("http://localhost/api/cron/appointment-reminders");

// Created in the calendar editor: no reminder_at, no WhatsApp.
const editorAppointment = {
  slug: "legal/appointments/appt-1",
  title: "Besprechung",
  frontmatter: {
    type: "appointment",
    title: "Besprechung",
    date: "2026-07-15",
    time: "09:00",
    status: "scheduled",
    appointment_type: "meeting",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => vi.useRealTimers());

describe("GET /api/cron/appointment-reminders", () => {
  it("reminds a calendar-created appointment 24 h ahead in Vienna time", async () => {
    fetchAllPagesStrict.mockResolvedValue([editorAppointment]);

    vi.setSystemTime(new Date("2026-07-14T06:30:00Z"));
    let res = await GET(req());
    expect(res.status).toBe(200);
    expect(sendMail).not.toHaveBeenCalled();

    vi.setSystemTime(new Date("2026-07-14T07:00:00Z"));
    res = await GET(req());
    expect(res.status).toBe(200);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(patchPage).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        slug: "legal/appointments/appt-1",
        frontmatter: expect.objectContaining({
          reminder_sent: true,
          reminder_sent_for: "2026-07-15T09:00",
        }),
      }),
      expect.anything()
    );
  });

  it("answers 5xx when the appointments cannot be read", async () => {
    fetchAllPagesStrict.mockRejectedValue(new Error("engine down"));
    vi.setSystemTime(new Date("2026-07-14T07:00:00Z"));
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBe(false);
  });
});
