// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: vi.fn(async () => [
    {
      slug: "calendar/outlook/a@k.at/1",
      type: "calendar_event",
      frontmatter: { type: "calendar_event", owner_user_id: "userA", subject: "Arzt" },
    },
    {
      slug: "calendar/outlook/b@k.at/2",
      type: "calendar_event",
      frontmatter: { type: "calendar_event", owner_user_id: "userB", subject: "Termin B" },
    },
  ]),
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { body: { parse: (v: unknown) => unknown } },
      handler: (ctx: unknown, body: unknown) => Promise<Response>
    ) =>
    async (req: Request) =>
      handler(
        { headers: {}, brainId: "b", user: { id: "userB" } },
        opts.body.parse(await req.json())
      ),
}));

import { POST } from "./route";

describe("POST /api/pages/batch-list — personal calendar mirrors", () => {
  it("user B gets no calendar_event pages owned by user A", async () => {
    const res = await (POST as unknown as (r: Request) => Promise<Response>)(
      new Request("http://x/api/pages/batch-list", {
        method: "POST",
        body: JSON.stringify({ types: ["calendar_event"] }),
      })
    );
    const json = (await res.json()) as { results: Record<string, Array<{ slug: string }>> };
    expect(json.results.calendar_event.map((p) => p.slug)).toEqual(["calendar/outlook/b@k.at/2"]);
    expect(JSON.stringify(json)).not.toContain("Arzt");
  });
});
