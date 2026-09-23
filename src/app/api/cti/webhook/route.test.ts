// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mockPatch = vi.fn();
const mockSse = vi.fn();

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: () => ({ "x-subsumio-source": "brain-at" }),
  enginePatchPage: (...a: unknown[]) => mockPatch(...a),
}));
vi.mock("@/lib/realtime-bus", () => ({ broadcastSseEvent: (...a: unknown[]) => mockSse(...a) }));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/lib/api-response", () => ({ apiSuccess: (d: unknown) => Response.json({ data: d }) }));
vi.mock("@/lib/api-handler", () => ({
  createPublicHandler:
    (_opts: unknown, handler: (req: NextRequest, body: unknown) => Promise<Response>) =>
    async (req: NextRequest) =>
      handler(req, await req.json()),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
}));

import { POST } from "./route";

/** 150 legal_contact pages; the caller is number 140 — beyond the engine's 100-row cap. */
const contacts = Array.from({ length: 150 }, (_, i) => ({
  slug: `contacts/k-${i}`,
  title: `Kontakt ${i}`,
  frontmatter: { name: `Kontakt ${i}`, phone: `+43 1 ${String(1_000_000 + i)}` },
}));
const cases = [
  { slug: "legal/cases/akte-1", title: "Akte 1", frontmatter: { client_slug: "contacts/k-140" } },
];

let listUrls: string[];

beforeEach(() => {
  vi.clearAllMocks();
  listUrls = [];
  process.env.CTI_WEBHOOK_SECRET = "s3cret-token";
  process.env.CTI_BRAIN_ID = "brain-at";
  mockPatch.mockResolvedValue(Response.json({ ok: true }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      if (init?.method === "POST") return Response.json({ ok: true });
      if (u.pathname === "/api/pages") {
        listUrls.push(url);
        const type = u.searchParams.get("type");
        const limit = Number(u.searchParams.get("limit"));
        const offset = Number(u.searchParams.get("offset") ?? 0);
        const all = type === "legal_contact" ? contacts : type === "legal_case" ? cases : [];
        return Response.json(all.slice(offset, offset + Math.min(limit, 100)));
      }
      return Response.json({ slug: "legal/phone-notes/cti-c1", frontmatter: {} });
    })
  );
});

afterEach(() => {
  delete process.env.CTI_WEBHOOK_SECRET;
  delete process.env.CTI_BRAIN_ID;
});

function webhook(body: unknown, opts: { auth?: string; query?: string } = {}) {
  return POST(
    new Request(`http://localhost/api/cti/webhook${opts.query ?? ""}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(opts.auth ? { authorization: opts.auth } : {}),
      },
      body: JSON.stringify(body),
    }) as unknown as NextRequest
  );
}

const ringing = { event: "ringing", call_id: "c1", caller: "+43 1 1000140" };

describe("POST /api/cti/webhook", () => {
  it("recognises a caller stored as legal_contact beyond the first 100 contacts", async () => {
    const res = await webhook(ringing, { auth: "Bearer s3cret-token" });
    expect(res.status).toBe(200);
    const data = (await res.json()).data;
    expect(data.contact).toBe("Kontakt 140");
    expect(data.case_slug).toBe("legal/cases/akte-1");
    expect(listUrls.some((u) => u.includes("type=legal_contact"))).toBe(true);
    expect(listUrls.some((u) => u.includes("type=contact&"))).toBe(false);
    expect(listUrls.some((u) => u.includes("offset=100"))).toBe(true);
  });

  it("does not accept the secret as a URL parameter", async () => {
    const res = await webhook(ringing, { query: "?secret=s3cret-token" });
    expect(res.status).toBe(401);
    expect(mockSse).not.toHaveBeenCalled();
  });

  it("rejects a wrong or truncated bearer token", async () => {
    expect((await webhook(ringing, { auth: "Bearer s3cret-tokeX" })).status).toBe(401);
    expect((await webhook(ringing, { auth: "Bearer s3cret" })).status).toBe(401);
    expect((await webhook(ringing, { auth: "s3cret-token" })).status).toBe(401);
  });

  it("writes the call duration into the existing note on hangup", async () => {
    const res = await webhook(
      { event: "ended", call_id: "c1", caller: "+43 1 1000140", duration: 42 },
      { auth: "Bearer s3cret-token" }
    );
    expect(res.status).toBe(200);
    expect(mockPatch.mock.calls[0][1]).toMatchObject({
      slug: "legal/phone-notes/cti-c1",
      frontmatter: { duration_s: 42, call_status: "ended" },
    });
  });
});
