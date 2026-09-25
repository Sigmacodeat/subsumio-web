/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 }),
}));
vi.mock("@/lib/engine", async () => ({
  ENGINE_URL: "http://engine.test",
  engineConfigurationResponse: () => null,
  requireEngineContext: vi.fn(),
}));
vi.mock("@/lib/email/mailbox", () => ({
  buildMailDraft: vi.fn(),
  sendMailboxMessage: vi.fn(),
  listMailMessages: vi.fn(),
  getUnreadCounts: vi.fn().mockResolvedValue({ inbox: 0, sent: 0, archive: 0, spam: 0, trash: 0 }),
  mailboxAddressForBrain: (brainId: string) => `hello+${brainId}@subsum.io`,
  supportMailboxBrainId: () => "subsumio-support",
}));

import { GET } from "./route";
import { requireEngineContext } from "@/lib/engine";
import { listMailMessages } from "@/lib/email/mailbox";

const ctx = {
  headers: { "x-subsumio-source": "org_firma" },
  brainId: "org_firma",
  plan: "team",
  user: { id: "lawyer_walled", email: "anwalt@kanzlei.example", role: "admin" },
};

function cases(pages: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const slug = decodeURIComponent(url.replace("http://engine.test/api/pages/", ""));
      return slug in pages
        ? new Response(JSON.stringify(pages[slug]), { status: 200 })
        : new Response("{}", { status: 404 });
    })
  );
}

const walled = {
  type: "legal_case",
  frontmatter: { permissions: { blocked_users: ["lawyer_walled"] } },
};
const open = { type: "legal_case", frontmatter: {} };

describe("GET /api/email/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireEngineContext).mockResolvedValue(ctx as any);
    vi.mocked(listMailMessages).mockResolvedValue([
      { id: "m1", subject: "Offen", caseSlug: "cases/open" },
      { id: "m2", subject: "Gesperrt", caseSlug: "cases/walled" },
      { id: "m3", subject: "Unzugeordnet", caseSlug: null },
    ] as any);
  });

  it("scopes to the firm brain and hides mail of walled matters, even for admins", async () => {
    cases({ "cases/open": open, "cases/walled": walled });
    const res = await GET(new NextRequest("http://localhost:3000/api/email/messages"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages.map((m: { id: string }) => m.id)).toEqual(["m1", "m3"]);
    expect(body.address).toBe("hello+org_firma@subsum.io");
    expect(vi.mocked(listMailMessages).mock.calls[0][0]).toEqual({
      userId: "lawyer_walled",
      brainId: "org_firma",
    });
  });

  it("refuses the matter filter for a walled matter", async () => {
    cases({ "cases/walled": walled });
    const res = await GET(
      new NextRequest("http://localhost:3000/api/email/messages?case=cases%2Fwalled")
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 for a matter outside the firm brain", async () => {
    cases({});
    const res = await GET(
      new NextRequest("http://localhost:3000/api/email/messages?case=cases%2Fforeign")
    );
    expect(res.status).toBe(404);
  });

  it("hides mail of matters the engine answers with 404 (outside the matter scope)", async () => {
    // cases/walled is not returned at all — as the engine does for out-of-scope matters.
    cases({ "cases/open": open });
    const res = await GET(new NextRequest("http://localhost:3000/api/email/messages"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages.map((m: { id: string }) => m.id)).toEqual(["m1", "m3"]);
  });

  it("checks every distinct matter, not only the first 100", async () => {
    const pages: Record<string, unknown> = {};
    const listed = [];
    for (let i = 0; i < 150; i++) {
      pages[`cases/c${i}`] = open;
      listed.push({ id: `m${i}`, subject: "x", caseSlug: `cases/c${i}` });
    }
    // The 130th matter is out of scope: its mail must not be listed.
    delete pages["cases/c130"];
    cases(pages);
    vi.mocked(listMailMessages).mockResolvedValue(listed as any);
    const res = await GET(new NextRequest("http://localhost:3000/api/email/messages?limit=200"));
    const body = await res.json();
    const ids = body.messages.map((m: { id: string }) => m.id);
    expect(ids).toHaveLength(149);
    expect(ids).not.toContain("m130");
  });
});
