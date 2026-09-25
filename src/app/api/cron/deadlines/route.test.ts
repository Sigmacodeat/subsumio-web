// @vitest-environment node
//
// The daily Fristen digest and the Notfrist escalation reach only active firm
// staff, and each person only hears about matters they may see.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  pages: {} as Record<string, unknown[]>,
  users: [] as Array<Record<string, unknown>>,
  senders: [] as Array<Record<string, unknown>>,
  sendMail: vi.fn(async (_opts: { to: string; subject: string; text: string }) => ({
    sent: true,
  })),
  sendWa: vi.fn(async (_opts: { to: string; freeform: string }) => ({ sent: true })),
}));

vi.mock("@/lib/api-handler", () => ({
  createCronHandler: (handler: (req: NextRequest) => Promise<Response>) => handler,
}));
vi.mock("@/lib/mail", () => ({ sendMail: m.sendMail }));
vi.mock("@/lib/cron-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cron-utils")>();
  return {
    activeStaffRecipients: actual.activeStaffRecipients,
    matterPermissionsBySlug: actual.matterPermissionsBySlug,
    mayReceiveMatterNotice: actual.mayReceiveMatterNotice,
    mayReceiveMatterNoticeAnonymously: actual.mayReceiveMatterNoticeAnonymously,
    fetchAllPagesStrict: vi.fn(async (_brain: string, type: string) => m.pages[type] ?? []),
    getRecipientsByBrain: vi.fn(async () => new Map([["brain-a", m.users]])),
    createDailyDedup: () => async () => false,
    createKeyedDedup: () => ({ isNew: async () => true, mark: async () => undefined }),
  };
});
vi.mock("@/lib/deadline-notify", () => ({
  isQuietDay: () => false,
  notfristEscalationKey: (i: { title: string; dueDate: string }) => `${i.title}|${i.dueDate}`,
}));
vi.mock("@/lib/whatsapp/proactive-send", () => ({ sendProactiveMessage: m.sendWa }));
vi.mock("@/lib/whatsapp/verify", () => ({ loadAllowedSenders: () => m.senders }));
vi.mock("@/lib/legal/pipeline-sync", () => ({
  syncPipelineDeadlines: vi.fn(async () => ({ scanned: 0, created: 0 })),
}));
vi.mock("@/lib/kanzlei-settings-server", () => ({
  loadKanzleiSettingsForBrain: vi.fn(async () => ({ deadlineEscalationEmail: "" })),
}));

import { GET } from "./route";

const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const run = () =>
  (GET as unknown as (r: Request) => Promise<Response>)(
    new Request("http://localhost/api/cron/deadlines")
  );

beforeEach(() => {
  vi.clearAllMocks();
  m.senders = [];
  m.users = [
    { id: "admin", email: "admin@firm.test", role: "admin" },
    { id: "walled", email: "walled@firm.test", role: "lawyer" },
    { id: "client", email: "client@client.test", role: "client_viewer" },
    { id: "gone", email: "gone@firm.test", role: "lawyer", deactivatedAt: "2026-01-01" },
  ];
  m.pages = {
    legal_case: [
      {
        slug: "cases/secret",
        title: "Akte Geheim",
        frontmatter: {
          permissions: { blocked_users: ["walled"] },
          deadlines: [{ title: "Notfrist Geheim", due_date: yesterday, is_notfrist: true }],
        },
      },
      {
        slug: "cases/open",
        title: "Akte Offen",
        frontmatter: { deadlines: [{ title: "Frist Offen", due_date: yesterday }] },
      },
    ],
    legal_deadline: [],
  };
});

function mailsTo(addr: string) {
  return m.sendMail.mock.calls.map((c) => c[0]).filter((o) => o.to === addr);
}

describe("cron deadlines", () => {
  it("never mails client accounts or deactivated users", async () => {
    const res = await run();
    expect(res.status).toBe(200);
    expect(mailsTo("client@client.test")).toHaveLength(0);
    expect(mailsTo("gone@firm.test")).toHaveLength(0);
  });

  it("keeps walled-off matters out of a person's digest and escalation", async () => {
    await run();
    const walled = mailsTo("walled@firm.test");
    expect(walled.length).toBeGreaterThan(0);
    for (const mail of walled) {
      expect(mail.text).not.toContain("Geheim");
      expect(mail.subject).not.toContain("NOTFRIST");
    }
    const admin = mailsTo("admin@firm.test")
      .map((x) => x.text)
      .join("\n");
    expect(admin).toContain("Akte Geheim");
    expect(admin).toContain("Akte Offen");
  });

  it("sends one address per mail", async () => {
    await run();
    for (const [opts] of m.sendMail.mock.calls) expect(opts.to).not.toContain(",");
  });

  it("gives a role-only WhatsApp number only unrestricted matters", async () => {
    m.senders = [{ phone: "+430000", brainId: "brain-a", role: "lawyer" }];
    await run();
    expect(m.sendWa).toHaveBeenCalledTimes(1);
    const text = m.sendWa.mock.calls[0]![0].freeform;
    expect(text).toContain("Frist Offen");
    expect(text).not.toContain("Geheim");
  });
});
