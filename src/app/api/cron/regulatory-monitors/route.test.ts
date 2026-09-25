// @vitest-environment node
//
// Monitor digests without explicit addresses go to active firm staff only; a
// matter-bound monitor only to people who may open that matter.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  mails: [] as Array<{ to: unknown }>,
  monitors: [] as Array<Record<string, unknown>>,
  cases: [] as Array<Record<string, unknown>> | Error,
}));

vi.mock("@/lib/api-handler", () => ({
  createCronHandler: (h: (req: NextRequest) => Promise<Response>) => h,
}));
vi.mock("@/lib/mail", () => ({
  sendMail: vi.fn(async (p: { to: unknown }) => {
    m.mails.push(p);
    return { sent: true };
  }),
}));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: (b: string) => ({ "x-subsumio-source": b }),
}));
vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: vi.fn(async () => m.monitors),
}));
vi.mock("@/lib/judgements", () => ({
  searchJudgements: vi.fn(async () => ({
    results: [{ id: "j1", court: "OGH", caseNumber: "1 Ob 1/26a", date: "2026-09-20", title: "" }],
  })),
}));
vi.mock("@/lib/caselaw-dedup", () => ({
  filterNewHitIds: vi.fn(async (_b: string, ids: string[]) => new Set(ids.map((_, i) => i))),
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
    new Request("http://localhost/api/cron/regulatory-monitors")
  );

const monitor = (extra: Record<string, unknown> = {}) => ({
  slug: "monitoring/regulatory/m1",
  type: "regulatory_monitor",
  title: "Mietrecht",
  frontmatter: {
    type: "regulatory_monitor",
    monitor_id: "m1",
    topic: "Mietrecht",
    keywords: ["Mietzins"],
    frequency: "daily",
    status: "active",
    ...extra,
  },
});

beforeEach(() => {
  m.mails.length = 0;
  m.cases = [
    {
      slug: "legal/cases/walled",
      title: "B",
      frontmatter: { permissions: { blocked_users: ["walled"] } },
    },
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST" ? Response.json({}) : new Response("", { status: 404 })
    )
  );
});

describe("cron regulatory-monitors — recipients", () => {
  it("firm-wide monitor: active staff only, one mail each", async () => {
    m.monitors = [monitor()];
    await run();
    expect(m.mails.map((x) => x.to).sort()).toEqual([
      "admin@firm.test",
      "law@firm.test",
      "walled@firm.test",
    ]);
  });

  it("matter-bound monitor: only people who may open the matter", async () => {
    m.monitors = [monitor({ case_slug: "legal/cases/walled" })];
    await run();
    expect(m.mails.map((x) => x.to).sort()).toEqual(["admin@firm.test", "law@firm.test"]);
  });

  it("matter-bound monitor with unreadable matters: admins only (fail-closed)", async () => {
    m.cases = new Error("engine down");
    m.monitors = [monitor({ case_slug: "legal/cases/walled" })];
    await run();
    expect(m.mails.map((x) => x.to)).toEqual(["admin@firm.test"]);
  });

  it("explicit notification addresses stay as configured", async () => {
    m.monitors = [monitor({ notify_emails: ["team@firm.test"] })];
    await run();
    expect(m.mails.map((x) => x.to)).toEqual(["team@firm.test"]);
  });
});
