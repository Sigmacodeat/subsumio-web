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
  getMailMessage: vi.fn(),
  updateMailMessage: vi.fn(),
  supportMailboxBrainId: () => "subsumio-support",
}));
vi.mock("@/lib/email/imap-sync", () => ({ fileAssignedMail: vi.fn() }));

import { GET, PATCH } from "./route";
import { requireEngineContext } from "@/lib/engine";
import { getMailMessage, updateMailMessage } from "@/lib/email/mailbox";

const ctx = {
  headers: { "x-subsumio-source": "org_firma" },
  brainId: "org_firma",
  plan: "team",
  user: { id: "u_walled", email: "anwalt@kanzlei.example", role: "lawyer" },
};

function engine(pages: Record<string, unknown>) {
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

const params = { params: Promise.resolve({ id: "m1" }) };
const open = { type: "legal_case", frontmatter: {} };

describe("/api/email/messages/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireEngineContext).mockResolvedValue(ctx as any);
    vi.mocked(getMailMessage).mockResolvedValue({
      id: "m1",
      subject: "Vertraulich",
      text: "Volltext",
      caseSlug: "cases/hidden",
    } as any);
  });

  it("does not return mail of a matter outside the caller's scope (engine 404)", async () => {
    engine({});
    const res = await GET(new NextRequest("http://localhost:3000/api/email/messages/m1"), params);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("Volltext");
  });

  it("returns mail of a readable matter", async () => {
    engine({ "cases/hidden": open });
    const res = await GET(new NextRequest("http://localhost:3000/api/email/messages/m1"), params);
    expect(res.status).toBe(200);
  });

  it("refuses to change mail of a matter outside the caller's scope", async () => {
    engine({});
    const res = await PATCH(
      new NextRequest("http://localhost:3000/api/email/messages/m1", {
        method: "PATCH",
        body: JSON.stringify({ isRead: true }),
        headers: { "content-type": "application/json", "x-csrf-token": "t", cookie: "sb_csrf=t" },
      }),
      params
    );
    expect(res.status).toBe(404);
    expect(updateMailMessage).not.toHaveBeenCalled();
  });
});
