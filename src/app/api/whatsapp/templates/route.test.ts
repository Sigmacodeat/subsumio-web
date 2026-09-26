// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const listEnginePages = vi.fn();
vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: (...a: unknown[]) => listEnginePages(...a),
}));
vi.mock("@/lib/api-handler", async (orig) => ({
  ...(await orig<typeof import("@/lib/api-handler")>()),
  createHandler: (_opts: unknown, handler: (ctx: unknown) => Promise<Response>) => async () =>
    handler({ brainId: "b1", headers: { "x-subsumio-source": "b1" }, user: {} }),
}));

import { GET } from "./route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/whatsapp/templates", () => {
  it("a failed read is an error, not an empty list", async () => {
    listEnginePages.mockRejectedValue(new Error("down"));
    const res = await GET(new Request("http://x") as never);
    expect(res.status).toBe(502);
  });

  it("lists the templates from the paged listing", async () => {
    listEnginePages.mockResolvedValue([
      { slug: "t/1", title: "Termin", frontmatter: { name: "termin", status: "approved" } },
    ]);
    const res = await GET(new Request("http://x") as never);
    const json = await res.json();
    expect(json.templates).toEqual([
      expect.objectContaining({ slug: "t/1", name: "termin", status: "approved" }),
    ]);
    expect(listEnginePages).toHaveBeenCalledWith(
      expect.anything(),
      "whatsapp_template",
      expect.any(Number),
      expect.objectContaining({ strict: true })
    );
  });
});
