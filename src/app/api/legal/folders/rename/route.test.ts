// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

const patchedPages: Array<{ slug: string; frontmatter?: Record<string, unknown> }> = [];

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://mock-engine:3001",
  engineHeadersForBrain: () => ({ "x-subsumio-brain": "test" }),
  enginePatchPage: async (
    _headers: Record<string, string>,
    body: { slug: string; frontmatter?: Record<string, unknown> }
  ) => {
    patchedPages.push(body);
    return new Response(null, { status: 200 });
  },
}));

vi.mock("@/lib/api-handler", () => ({
  createHandler: (_opts: unknown, handler: (ctx: unknown, body: unknown) => Promise<unknown>) => {
    return async (req: Request) => {
      const ctx = {
        headers: { "x-subsumio-source": "test-brain" },
        brainId: "test-brain",
        user: { email: "test@test.com" },
      };
      const body = await req.json().catch(() => null);
      return handler(ctx, body) as Promise<Response>;
    };
  },
  apiSuccess: (data: unknown) => Response.json({ data }),
  apiError: (code: string, _msg: string, status: number) =>
    new Response(JSON.stringify({ error: code }), { status }),
}));

vi.mock("@/lib/keyed-lock", () => ({
  withKeyedLock: async (_key: string, fn: () => Promise<void>) => fn(),
}));

const PAGES: Record<string, { folder?: string }> = {
  "legal/akte/doc1": { folder: "Korrespondenz" },
  "legal/akte/doc2": { folder: "Korrespondenz/Ausgehend" },
  "legal/akte/doc3": { folder: "Schriftsaetze" },
  "legal/akte/doc4": {},
};

vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
  const url = String(input);
  const m = /\/api\/pages\/(.+)$/.exec(url);
  if (m) {
    const slug = decodeURIComponent(m[1]);
    const fm = PAGES[slug];
    if (!fm) return new Response("not found", { status: 404 });
    return Response.json({ slug, frontmatter: fm });
  }
  return new Response("not found", { status: 404 });
});

import type { NextRequest } from "next/server";
import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/legal/folders/rename", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe("POST /api/legal/folders/rename", () => {
  beforeEach(() => patchedPages.splice(0));

  test("verschiebt exact + Descendant-Ordner, überspringt Fremde", async () => {
    const res = (await POST(
      req({ slugs: Object.keys(PAGES), from: "Korrespondenz", to: "Mandantenpost" })
    )) as Response;
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.moved).toBe(2);
    expect(data.skipped).toBe(2); // doc3 (anderer Ordner) + doc4 (kein Ordner)
    expect(data.failed).toBe(0);

    const bySlug = new Map(patchedPages.map((p) => [p.slug, p.frontmatter?.folder]));
    expect(bySlug.get("legal/akte/doc1")).toBe("Mandantenpost");
    expect(bySlug.get("legal/akte/doc2")).toBe("Mandantenpost/Ausgehend");
  });

  test("lehnt Rename in eigenen Unterordner ab", async () => {
    const res = (await POST(req({ slugs: ["legal/akte/doc1"], from: "A", to: "A/B" }))) as Response;
    expect(res.status).toBe(400);
  });

  test("404-Seiten zählen als failed", async () => {
    const res = (await POST(req({ slugs: ["legal/akte/ghost"], from: "X", to: "Y" }))) as Response;
    const { data } = await res.json();
    expect(data.failed).toBe(1);
    expect(data.moved).toBe(0);
  });
});
