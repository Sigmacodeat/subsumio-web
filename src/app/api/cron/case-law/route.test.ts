// @vitest-environment node
//
// Case-law digests go only to active firm staff, one mail per person.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  mails: [] as Array<{ to: unknown }>,
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
    getRecipientsByBrain: vi.fn(
      async () =>
        new Map([
          [
            "brain-a",
            [
              { id: "law", email: "law@firm.test", role: "lawyer" },
              { id: "ass", email: "ass@firm.test", role: "assistant" },
              { id: "client", email: "client@firm.test", role: "client_viewer" },
              { id: "gone", email: "gone@firm.test", role: "admin", deactivatedAt: "2026-01-01" },
            ],
          ],
        ])
    ),
  };
});

import { GET } from "./route";

beforeEach(() => {
  m.mails.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).includes("case-law-watchlist")
        ? Response.json({ frontmatter: { terms: [{ query: "Mietzins", jurisdiction: "at" }] } })
        : Response.json({})
    )
  );
});

describe("cron case-law — recipients", () => {
  it("mails active staff one by one, never client accounts or deactivated users", async () => {
    await (GET as unknown as (r: Request) => Promise<Response>)(
      new Request("http://localhost/api/cron/case-law")
    );
    expect(m.mails.map((x) => x.to).sort()).toEqual(["ass@firm.test", "law@firm.test"]);
  });
});
