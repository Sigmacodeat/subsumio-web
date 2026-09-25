// @vitest-environment node
//
// Critical client feedback goes only to active lawyers/admins, per matter only
// to people who may open it, one mail per recipient.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  mails: [] as Array<{ to: unknown; text: string }>,
  cases: [] as Array<Record<string, unknown>> | Error,
  feedback: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/api-handler", () => ({
  createCronHandler: (h: (req: NextRequest) => Promise<Response>) => h,
}));
vi.mock("@/lib/mail", () => ({
  sendMail: vi.fn(async (p: { to: unknown; text: string }) => {
    m.mails.push(p);
    return { sent: true };
  }),
}));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: (b: string) => ({ "x-subsumio-source": b }),
}));
vi.mock("@/lib/caselaw-dedup", () => ({
  filterNewIds: vi.fn(
    async (_b: string, _ns: string, ids: string[]) => new Set(ids.map((_, i) => i))
  ),
}));
vi.mock("@/lib/cron-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cron-utils")>();
  return {
    ...actual,
    fetchPages: vi.fn(async () => {
      if (m.cases instanceof Error) throw m.cases;
      return m.cases;
    }),
    getRecipientsByBrain: vi.fn(
      async () =>
        new Map([
          [
            "brain-a",
            [
              { id: "admin", email: "admin@firm.test", role: "admin" },
              { id: "law", email: "law@firm.test", role: "lawyer" },
              { id: "walled", email: "walled@firm.test", role: "lawyer" },
              { id: "client", email: "client@firm.test", role: "client_viewer" },
              { id: "gone", email: "gone@firm.test", role: "lawyer", deactivatedAt: "2026-01-01" },
            ],
          ],
        ])
    ),
  };
});

import { GET } from "./route";

const run = () =>
  (GET as unknown as (r: Request) => Promise<Response>)(
    new Request("http://localhost/api/cron/feedback-triage")
  );

const feedback = (slug: string, caseSlug: string) => ({
  slug,
  frontmatter: {
    case_slug: caseSlug,
    nps_score: 2,
    comment: `Kritik zu ${caseSlug}`,
    submitted_at: new Date().toISOString(),
  },
});

beforeEach(() => {
  m.mails.length = 0;
  m.feedback = [
    feedback("feedback-1", "legal/cases/open-matter"),
    feedback("feedback-2", "legal/cases/walled"),
  ];
  m.cases = [
    { slug: "legal/cases/open-matter", title: "A", frontmatter: {} },
    {
      slug: "legal/cases/walled",
      title: "B",
      frontmatter: { permissions: { blocked_users: ["walled"] } },
    },
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(m.feedback))
  );
});

describe("cron feedback-triage — recipients", () => {
  it("never mails client accounts or deactivated users; one mail per person", async () => {
    await run();
    const to = m.mails.map((x) => x.to);
    expect(to.sort()).toEqual(["admin@firm.test", "law@firm.test", "walled@firm.test"]);
  });

  it("each person sees only feedback on matters they may open", async () => {
    await run();
    const walled = m.mails.find((x) => x.to === "walled@firm.test")!;
    expect(walled.text).toContain("open-matter");
    expect(walled.text).not.toContain("legal%2Fcases%2Fwalled");
    const law = m.mails.find((x) => x.to === "law@firm.test")!;
    expect(law.text).toContain("legal%2Fcases%2Fwalled");
  });

  it("unreadable matters: feedback on a matter goes to admins only (fail-closed)", async () => {
    m.cases = new Error("engine down");
    await run();
    expect(m.mails.map((x) => x.to)).toEqual(["admin@firm.test"]);
  });
});
