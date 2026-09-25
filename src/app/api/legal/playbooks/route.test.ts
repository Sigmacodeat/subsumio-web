import type { NextRequest } from "next/server";
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Playbook and template lists: paged through the engine (not capped at one
 * listing), and a failed read is an error — never an empty list.
 */
const list = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { query?: { parse: (d: unknown) => unknown } },
      handler: (ctx: unknown, body: unknown, query: unknown) => Promise<Response>
    ) =>
    async (req: Request) => {
      const params = Object.fromEntries(new URL(req.url).searchParams);
      return handler({ headers: {} }, undefined, opts.query ? opts.query.parse(params) : params);
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
}));
vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine-test:3001" }));
vi.mock("@/lib/engine-pages", () => ({ listEnginePages: list }));

import { GET as playbooksGET } from "./route";
import { GET as templatesGET } from "../templates/route";

const get = (h: typeof playbooksGET, url: string) => h(new Request(url) as unknown as NextRequest);

afterEach(() => list.mockReset());

describe("GET /api/legal/playbooks and /templates", () => {
  it("returns every playbook beyond one engine listing (150 > 100)", async () => {
    list.mockResolvedValue(
      Array.from({ length: 150 }, (_, i) => ({ slug: `legal/playbooks/p${i}`, frontmatter: {} }))
    );
    const res = await get(playbooksGET, "http://x/api/legal/playbooks?limit=200");
    expect(res.status).toBe(200);
    expect((await res.json()).data).toHaveLength(150);
    expect(list.mock.calls[0][1]).toBe("legal_playbook");
    expect(list.mock.calls[0][3]).toMatchObject({ strict: true });
  });

  it("an engine failure is 503, not an empty list", async () => {
    list.mockRejectedValue(new Error("down"));
    for (const [h, url] of [
      [playbooksGET, "http://x/api/legal/playbooks"],
      [templatesGET, "http://x/api/legal/templates"],
    ] as const) {
      const res = await get(h, url);
      expect(res.status).toBe(503);
      expect((await res.json()).data).toBeUndefined();
    }
  });
});
