import type { NextRequest } from "next/server";
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The case strategy must rest on the matter's own documents even in a large
 * firm (the documents are paged, not the newest window of the whole firm),
 * say how many it used, and refuse when they cannot be read.
 */
const pages = vi.hoisted(() => ({
  list: vi.fn(),
}));

vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { body?: { parse: (d: unknown) => unknown } },
      handler: (ctx: unknown, body: unknown) => Promise<Response>
    ) =>
    async (req: Request) =>
      handler(
        {
          brainId: "firm-a",
          headers: { "x-subsumio-source": "firm-a" },
          user: { id: "u-1", email: "l@x.at" },
          billing: { ownerId: "o", ownerType: "org" },
        },
        opts.body!.parse(await req.json())
      ),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
  recordCreditConsumption: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine-test:3001",
  enginePatchPage: vi.fn(async () => undefined),
}));
vi.mock("@/lib/engine-pages", () => ({ listEnginePages: pages.list }));

import { POST } from "./route";

const doc = (slug: string, caseSlug: string) => ({
  slug,
  title: slug,
  frontmatter: { case_slug: caseSlug, auto_analysis: { summary: `Inhalt ${slug}` } },
});

function call() {
  return POST(
    new Request("http://x/api/legal/case-strategy", {
      method: "POST",
      body: JSON.stringify({ case_slug: "cases/acme-old" }),
    }) as unknown as NextRequest
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  pages.list.mockReset();
});

describe("POST /api/legal/case-strategy", () => {
  it("uses every document of the matter, also behind 250 newer foreign ones", async () => {
    pages.list.mockResolvedValue([
      ...Array.from({ length: 250 }, (_, i) => doc(`docs/other-${i}`, "cases/other")),
      doc("docs/own-1", "cases/acme-old"),
      doc("docs/own-2", "cases/acme-old"),
      doc("docs/own-3", "cases/acme-old"),
    ]);
    let prompt = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes("/api/pages/")) {
          return Response.json({ title: "Akte", frontmatter: {} });
        }
        prompt = JSON.parse(String(init?.body)).question;
        return Response.json({
          answer: JSON.stringify({ summary: "s", recommended: "r", risks: [], next_steps: [] }),
        });
      })
    );
    const res = await call();
    expect(res.status).toBe(200);
    for (const d of ["own-1", "own-2", "own-3"]) expect(prompt).toContain(`docs/${d}`);
    expect((await res.json()).documentsConsidered).toBe(3);
    expect(pages.list.mock.calls[0][3]).toMatchObject({ strict: true });
  });

  it("a failed document read stops instead of producing a strategy without documents", async () => {
    pages.list.mockRejectedValue(new Error("engine down"));
    const thinkCalls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/think")) thinkCalls.push(url);
        return Response.json({ title: "Akte", frontmatter: {} });
      })
    );
    const res = await call();
    expect(res.status).toBe(503);
    expect(thinkCalls).toHaveLength(0);
  });
});
