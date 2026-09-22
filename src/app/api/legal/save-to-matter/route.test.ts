import type { NextRequest } from "next/server";
// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://mock-engine:3001" }));

const reconcile = vi.fn();
vi.mock("@/lib/case-documents", () => ({
  reconcileCaseDocuments: (...args: unknown[]) => reconcile(...args),
}));

vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (_opts: unknown, handler: (ctx: unknown, body: unknown) => Promise<Response>) =>
    async (req: Request) =>
      handler(
        { headers: { "x-subsumio-source": "firm" }, user: { email: "anwalt@example.com" } },
        await req.json()
      ),
  apiSuccess: (data: unknown) => Response.json({ data }),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
}));

import { POST } from "./route";

const body = {
  case_slug: "legal/cases/2026-001",
  title: "Antwort zur Verjährung",
  content: "Die Frist beträgt drei Jahre (§ 1489 ABGB).",
  source: "chat",
  citations: [{ code: "ABGB", paragraph: "§ 1489", verified: true }],
};

function req(b: unknown) {
  return new Request("http://x/api/legal/save-to-matter", {
    method: "POST",
    body: JSON.stringify(b),
  }) as unknown as NextRequest;
}

describe("POST /api/legal/save-to-matter", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    reconcile.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  test("writes an unreviewed legal_document and lists it in the matter", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ slug: body.case_slug }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    reconcile.mockResolvedValue(undefined);

    const res = await POST(req(body));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { slug: string; listed: boolean } };
    expect(json.data.listed).toBe(true);
    expect(json.data.slug).toMatch(/^legal\/documents\/2026-001\/ki-antwort-zur-verjahrung-/);

    const write = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(write.type).toBe("legal_document");
    expect(write.frontmatter).toMatchObject({
      case_slug: body.case_slug,
      review_status: "unreviewed",
      ai_generated: true,
      saved_by: "anwalt@example.com",
    });
    expect(write.content).toContain("anwaltlich zu prüfen");
    expect(reconcile).toHaveBeenCalledWith(
      expect.anything(),
      body.case_slug,
      expect.objectContaining({ slug: json.data.slug, kind: "ki_ergebnis" })
    );
  });

  test("refuses a matter the caller cannot read", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not found", { status: 404 }));
    const res = await POST(req(body));
    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("reports a missing list entry instead of claiming success", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ slug: body.case_slug }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    reconcile.mockRejectedValue(new Error("lock timeout"));
    const res = await POST(req(body));
    const json = (await res.json()) as { data: { listed: boolean } };
    expect(json.data.listed).toBe(false);
  });
});
