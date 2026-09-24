import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 }),
  clientIp: () => "203.0.113.7",
}));
vi.mock("@/lib/portal-token", () => ({
  verifyPortalToken: vi.fn(),
  isPortalTokenSuperseded: vi.fn(() => false),
}));

import { GET } from "./route";
import { verifyPortalToken } from "@/lib/portal-token";

const ENGINE = "http://localhost:3001";
const CASE_SLUG = "cases/mueller";

function pageOfType(
  type: "signature_request" | "power_of_attorney",
  slug: string,
  caseSlug: string,
  status = "sent"
) {
  return {
    slug,
    title: slug,
    frontmatter: { case_slug: caseSlug, status },
  };
}

/**
 * Mocks the firm-wide /api/pages?type=...&limit=...&offset=... listing so a
 * test can control exactly how many pages of results exist per type, and
 * asserts a single request never asks for more than the engine's own 200-row
 * cap. Also mocks the per-document GET the route makes for each still-open
 * match, so the client can read the text before signing (`content`, keyed by
 * slug in `contentBySlug`).
 */
function mockEngine(
  pagesByType: Record<string, ReturnType<typeof pageOfType>[]>,
  contentBySlug: Record<string, string> = {}
) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      if (url === `${ENGINE}/api/pages/${encodeURIComponent(CASE_SLUG)}`) {
        return new Response(
          JSON.stringify({
            slug: CASE_SLUG,
            frontmatter: { status: "open", portal_enabled: true },
          }),
          { status: 200 }
        );
      }
      if (!url.includes("?")) {
        // Per-document content fetch: /api/pages/<slug>
        const slug = decodeURIComponent(url.replace(`${ENGINE}/api/pages/`, ""));
        return new Response(JSON.stringify({ slug, content: contentBySlug[slug] ?? "" }), {
          status: 200,
        });
      }
      const parsed = new URL(url);
      const type = parsed.searchParams.get("type") ?? "";
      const limit = Number(parsed.searchParams.get("limit"));
      const offset = Number(parsed.searchParams.get("offset"));
      expect(limit).toBeLessThanOrEqual(200);
      const all = pagesByType[type] ?? [];
      return new Response(JSON.stringify(all.slice(offset, offset + limit)), { status: 200 });
    })
  );
  return calls;
}

function request() {
  return new NextRequest(
    `http://localhost:3000/api/portal/signable-docs?token=tok&${new URLSearchParams()}`
  );
}

describe("GET /api/portal/signable-docs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SUBSUMIO_API_URL", ENGINE);
    vi.mocked(verifyPortalToken).mockResolvedValue({
      case_slug: CASE_SLUG,
      brain_id: "brain_firm_a",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
  });

  it("finds this matter's document even when 200+ other matters' docs sort ahead of it", async () => {
    // 250 other matters' signature requests, newest-first, then this
    // matter's one open request landing on page 2 of a limit=200 listing.
    const others = Array.from({ length: 250 }, (_, i) =>
      pageOfType("signature_request", `docs/other-${i}`, `cases/other-${i}`)
    );
    const ours = pageOfType("signature_request", "docs/ours", CASE_SLUG);
    mockEngine({ signature_request: [...others, ours], power_of_attorney: [] });

    const res = await GET(request());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.docs.map((d: { slug: string }) => d.slug)).toEqual(["docs/ours"]);
  });

  it("excludes closed documents and documents belonging to other matters", async () => {
    mockEngine({
      signature_request: [
        pageOfType("signature_request", "docs/open", CASE_SLUG, "sent"),
        pageOfType("signature_request", "docs/signed", CASE_SLUG, "signed"),
        pageOfType("signature_request", "docs/elsewhere", "cases/other", "sent"),
      ],
      power_of_attorney: [],
    });

    const res = await GET(request());
    const json = await res.json();

    expect(json.data.docs.map((d: { slug: string }) => d.slug)).toEqual(["docs/open"]);
  });

  it("fetches the document text so the client can read it before signing", async () => {
    mockEngine(
      {
        signature_request: [pageOfType("signature_request", "docs/nda", CASE_SLUG)],
        power_of_attorney: [],
      },
      { "docs/nda": "GEHEIMHALTUNGSVEREINBARUNG\n\n§ 1 Gegenstand ..." }
    );

    const res = await GET(request());
    const json = await res.json();

    expect(json.data.docs[0].content).toBe("GEHEIMHALTUNGSVEREINBARUNG\n\n§ 1 Gegenstand ...");
  });

  it("stops paging once a short page signals the end of the list", async () => {
    const calls = mockEngine({
      signature_request: [pageOfType("signature_request", "docs/ours", CASE_SLUG)],
      power_of_attorney: [],
    });

    await GET(request());

    const signatureRequestCalls = calls.filter((u) => u.includes("type=signature_request"));
    expect(signatureRequestCalls).toHaveLength(1);
  });
});
