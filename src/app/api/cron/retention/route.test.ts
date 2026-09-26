// @vitest-environment node
//
// Retention digests go only to active firm staff, each matter only to people
// who may open it, one mail per recipient.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  users: [] as Array<Record<string, unknown>>,
  cases: [] as Array<Record<string, unknown>>,
  mails: [] as Array<{ to: unknown; subject: string; text: string }>,
  notified: [] as Array<{ userId: string; caseSlug: string }>,
}));

vi.mock("@/lib/api-handler", () => ({
  createCronHandler: (h: (req: NextRequest) => Promise<Response>) => h,
}));
vi.mock("@/lib/mail", () => ({
  sendMail: vi.fn(async (p: { to: unknown; subject: string; text: string }) => {
    m.mails.push(p);
    return { sent: true };
  }),
}));
vi.mock("@/lib/engine", () => ({
  engineHeadersForBrain: (b: string) => ({ "x-subsumio-source": b }),
  enginePatchPage: vi.fn(async () => Response.json({ ok: true })),
}));
vi.mock("@/lib/comments", () => ({
  createRetentionNotification: vi.fn(async (o: { userId: string; caseSlug: string }) => {
    m.notified.push({ userId: o.userId, caseSlug: o.caseSlug });
  }),
}));
vi.mock("@/lib/cron-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cron-utils")>();
  return {
    ...actual,
    fetchAllPagesStrict: vi.fn(async () => m.cases),
    getRecipientsByBrain: vi.fn(async () => new Map([["brain-a", m.users]])),
    createDailyDedup: () => async () => false,
  };
});

import { GET } from "./route";

const run = () =>
  (GET as unknown as (r: Request) => Promise<Response>)(
    new Request("http://localhost/api/cron/retention")
  );

const closed = (slug: string, permissions?: Record<string, unknown>) => ({
  slug,
  title: `Akte ${slug}`,
  frontmatter: {
    closed_at: "2010-01-01",
    status: "closed",
    ...(permissions ? { permissions } : {}),
  },
});

beforeEach(() => {
  m.mails.length = 0;
  m.notified.length = 0;
  m.users = [
    { id: "admin", email: "admin@firm.test", role: "admin" },
    { id: "law", email: "law@firm.test", role: "lawyer" },
    { id: "walled", email: "walled@firm.test", role: "lawyer" },
    { id: "client", email: "client@firm.test", role: "client_viewer" },
    { id: "gone", email: "gone@firm.test", role: "lawyer", deactivatedAt: "2026-01-01" },
  ];
  m.cases = [
    closed("legal/cases/open-matter"),
    closed("legal/cases/walled", { blocked_users: ["walled"] }),
  ];
});

describe("cron retention — recipients", () => {
  it("never mails client accounts or deactivated users", async () => {
    await run();
    const to = m.mails.map((x) => x.to);
    expect(to).not.toContain("client@firm.test");
    expect(to).not.toContain("gone@firm.test");
    expect(m.notified.map((n) => n.userId)).not.toContain("client");
    expect(m.notified.map((n) => n.userId)).not.toContain("gone");
  });

  it("sends one mail per recipient, each with only the matters they may see", async () => {
    await run();
    expect(m.mails.every((x) => typeof x.to === "string")).toBe(true);
    const byTo = new Map(m.mails.map((x) => [x.to, x.text]));
    expect(byTo.size).toBe(3);
    expect(byTo.get("law@firm.test")).toContain("walled");
    expect(byTo.get("walled@firm.test")).toContain("open-matter");
    expect(byTo.get("walled@firm.test")).not.toContain("legal/cases/walled");
    expect(m.notified).not.toContainEqual({ userId: "walled", caseSlug: "legal/cases/walled" });
    expect(m.notified).toContainEqual({ userId: "law", caseSlug: "legal/cases/walled" });
  });

  it("a person with no visible matter gets no mail", async () => {
    m.cases = [closed("legal/cases/walled", { blocked_users: ["walled"] })];
    await run();
    expect(m.mails.map((x) => x.to)).not.toContain("walled@firm.test");
  });
});

describe("retention digest reads every matter (R12-9)", () => {
  it("the oldest of 600 matters, closed 11 years ago, is in the digest", async () => {
    const many = Array.from({ length: 599 }, (_, i) => ({
      slug: `legal/cases/new-${i}`,
      title: `Neu ${i}`,
      frontmatter: { status: "open" },
    }));
    m.cases = [...many, { ...closed("legal/cases/very-old"), title: "Sehr alt" }];
    m.cases[599]!.frontmatter = { closed_at: "2015-01-01", status: "closed" };
    const res = await run();
    expect(res.status).toBe(200);
    expect(m.mails.some((mail) => mail.text.includes("Sehr alt"))).toBe(true);
    const { fetchAllPagesStrict } = await import("@/lib/cron-utils");
    expect(fetchAllPagesStrict).toHaveBeenCalledWith("brain-a", "legal_case");
  });

  it("an archived matter without closed_at counts from its archive date", async () => {
    m.cases = [
      {
        slug: "legal/cases/arch",
        title: "Archiviert",
        frontmatter: { status: "archived", archived_at: "2012-03-01" },
      },
    ];
    await run();
    expect(m.mails.some((mail) => mail.text.includes("Archiviert"))).toBe(true);
  });

  it("a failed read is a failed run, not ok", async () => {
    const { fetchAllPagesStrict } = await import("@/lib/cron-utils");
    vi.mocked(fetchAllPagesStrict).mockRejectedValueOnce(new Error("HTTP 500"));
    const res = await run();
    expect(res.status).toBe(500);
  });
});
