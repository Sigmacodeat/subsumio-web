// @vitest-environment node
//
// The firm-wide briefing may name any matter, so it goes only to active staff
// with access to every matter, one mail per person.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  mails: [] as Array<{ to: unknown }>,
  cases: [] as Array<Record<string, unknown>> | Error,
}));

vi.mock("@/lib/api-handler", () => ({
  createCronHandler: (h: (req: NextRequest) => Promise<Response>) => h,
}));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: (b: string) => ({ "x-subsumio-source": b }),
}));
vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: vi.fn(async () => {
    if (m.cases instanceof Error) throw m.cases;
    return m.cases;
  }),
}));
vi.mock("@/lib/mail", () => ({
  isMailConfigured: () => true,
  sendMail: vi.fn(async (p: { to: unknown }) => {
    m.mails.push(p);
    return { sent: true };
  }),
}));
vi.mock("@/lib/markdown", () => ({ renderMarkdown: (s: string) => s }));
vi.mock("@/lib/whatsapp/verify", () => ({ loadAllowedSenders: () => [] }));
vi.mock("@/lib/whatsapp/proactive-send", () => ({ sendProactiveMessage: vi.fn() }));
vi.mock("@/lib/cron-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cron-utils")>();
  return {
    ...actual,
    billableRecipientsByBrain: vi.fn(
      async () =>
        new Map([
          [
            "brain-a",
            [
              { id: "admin", email: "admin@firm.test", role: "admin" },
              { id: "law", email: "law@firm.test", role: "lawyer" },
              { id: "walled", email: "walled@firm.test", role: "lawyer" },
              { id: "client", email: "client@firm.test", role: "client_viewer" },
            ],
          ],
        ])
    ),
  };
});

import { GET } from "./route";

const run = () =>
  (GET as unknown as (r: Request) => Promise<Response>)(
    new Request("http://localhost/api/cron/rundown")
  );

beforeEach(() => {
  m.mails.length = 0;
  m.cases = [
    { slug: "legal/cases/open", title: "A", frontmatter: {} },
    {
      slug: "legal/cases/walled",
      title: "B",
      frontmatter: { permissions: { blocked_users: ["walled"] } },
    },
  ];
  // Poll immediately instead of waiting 5 s between status checks.
  vi.stubGlobal("setTimeout", ((fn: () => void) => {
    fn();
    return 0;
  }) as unknown as typeof setTimeout);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? Response.json({ jobId: 7 })
        : String(url).endsWith("/api/agents/7")
          ? Response.json({ status: "completed", result: "## Fristen\n- legal/cases/walled" })
          : new Response("", { status: 404 })
    )
  );
});

describe("cron rundown — recipients", () => {
  it("one mail per person; never client accounts or people walled off any matter", async () => {
    await run();
    expect(m.mails.every((x) => typeof x.to === "string")).toBe(true);
    expect(m.mails.map((x) => x.to).sort()).toEqual(["admin@firm.test", "law@firm.test"]);
  });

  it("matters unreadable: admins only (fail-closed)", async () => {
    m.cases = new Error("engine down");
    await run();
    expect(m.mails.map((x) => x.to)).toEqual(["admin@firm.test"]);
  });
});
