import type { NextRequest } from "next/server";
// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

const mockFetch = vi.fn();
const mockSendMail = vi.fn(async (..._args: unknown[]) => undefined);

global.fetch = mockFetch as unknown as typeof fetch;

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine-test:3001",
  engineHeadersForBrain: vi.fn((brainId: string) => ({ "x-subsumio-source": brainId })),
}));

vi.mock("@/lib/api-handler", () => ({
  createPublicHandler: (
    opts: { body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } } },
    handler: (req: Request, body: unknown) => Promise<Response>
  ) => {
    return async (req: Request) => {
      const body = await req.json().catch(() => ({}));
      if (opts.body) {
        const parsed = opts.body.safeParse(body);
        if (!parsed.success) return Response.json({ error: "validation_failed" }, { status: 400 });
      }
      return handler(req, body);
    };
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  clientIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("@/lib/mail", () => ({
  sendMail: (...args: unknown[]) => mockSendMail(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { POST } from "./route";

const validBody = {
  name: "Max Muster",
  email: "max@example.com",
  phone: "+43 660 1234567",
  legalArea: "Arbeitsrecht",
  message: "Ich habe eine Kündigung erhalten.",
  consent: true,
};

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/intake/public", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as unknown as NextRequest
  );
}

describe("POST /api/intake/public", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("SUBSUMIO_PUBLIC_INTAKE_BRAIN_ID", "brain-at");
  });

  test("rejects honeypot submissions without calling the engine", async () => {
    const res = await post({ ...validBody, website: "https://spam.example" });
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("rejects missing consent", async () => {
    const res = await post({ ...validBody, consent: false });
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 503 when no public intake brain is configured", async () => {
    delete process.env.SUBSUMIO_PUBLIC_INTAKE_BRAIN_ID;
    delete process.env.WHATSAPP_DEFAULT_BRAIN_ID;
    const res = await post(validBody);
    expect(res.status).toBe(503);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("creates an intake request after a clear conflict check", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ severity: "none" }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ slug: "legal/intake/x" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ frontmatter: { kanzleiEmail: "kanzlei@example.com" } }), {
          status: 200,
        })
      );

    const res = await post(validBody);
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(3);

    const [conflictUrl, conflictInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(conflictUrl).toBe("http://engine-test:3001/api/legal/conflict-check");
    expect(JSON.parse(String(conflictInit.body))).toEqual({ name: validBody.name });

    const [createUrl, createInit] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(createUrl).toBe("http://engine-test:3001/api/pages");
    const payload = JSON.parse(String(createInit.body));
    expect(payload.type).toBe("intake_request");
    expect(payload.frontmatter).toMatchObject({
      status: "new",
      conflict_check_status: "clear",
      phone: validBody.phone,
    });
    await vi.waitFor(() => {
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "kanzlei@example.com" })
      );
    });
  });

  test("keeps the request when the conflict check is unavailable, but flags review", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("engine down"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ slug: "legal/intake/x" }), { status: 200 })
      )
      .mockResolvedValueOnce(new Response("{}", { status: 404 }));

    const res = await post(validBody);
    expect(res.status).toBe(200);
    const payload = JSON.parse(String((mockFetch.mock.calls[1] as [string, RequestInit])[1].body));
    expect(payload.frontmatter.conflict_check_status).toBe("needs_review");
  });

  test("checks the opponent against conflicts too (WP-5.28)", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ severity: "none" }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ severity: "critical" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ slug: "legal/intake/x" }), { status: 200 })
      )
      .mockResolvedValueOnce(new Response("{}", { status: 404 }));

    const res = await post({ ...validBody, opponent: "Gegenseite GmbH" });
    expect(res.status).toBe(200);
    // Beide Konflikt-Checks gelaufen: Anfragender + Gegenseite.
    expect(mockFetch.mock.calls[0][0]).toContain("conflict-check");
    expect(JSON.parse(String((mockFetch.mock.calls[1] as [string, RequestInit])[1].body))).toEqual({
      name: "Gegenseite GmbH",
    });
    const payload = JSON.parse(String((mockFetch.mock.calls[2] as [string, RequestInit])[1].body));
    expect(payload.frontmatter.conflict_check_status).toBe("conflict");
    expect(payload.frontmatter.opponent).toBe("Gegenseite GmbH");
  });

  test("does not send the submitter a mail and survives notification failure", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ severity: "critical" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ slug: "legal/intake/x" }), { status: 200 })
      )
      .mockRejectedValueOnce(new Error("settings unavailable"));
    mockSendMail.mockRejectedValueOnce(new Error("mail down"));

    const res = await post(validBody);
    expect(res.status).toBe(200);
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(mockFetch.mock.calls.some(([url]) => String(url).includes("mail"))).toBe(false);
  });
});
