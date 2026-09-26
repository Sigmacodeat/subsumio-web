// @vitest-environment node
// A chronology requested with only the matter (Word add-in) is built from
// the matter's own dated records instead of coming back empty.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } } },
      handler: (ctx: unknown, body: unknown, query: unknown) => Promise<Response>
    ) =>
    async (req: Request) => {
      const parsed = opts.body!.safeParse(await req.json());
      if (!parsed.success) return Response.json({ error: "bad" }, { status: 400 });
      return handler(
        { headers: { "x-test": "1" }, brainId: "b", user: { id: "u" } },
        parsed.data,
        {}
      );
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
}));

import { POST } from "./route";

let matter: Record<string, unknown> | null = null;
const seenHeaders: Array<Record<string, string>> = [];

beforeEach(() => {
  seenHeaders.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      seenHeaders.push((init?.headers ?? {}) as Record<string, string>);
      return matter ? Response.json(matter) : new Response("{}", { status: 404 });
    })
  );
});

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/legal/chronology", {
      method: "POST",
      body: JSON.stringify(body),
    }) as never
  );
}

describe("POST /api/legal/chronology", () => {
  it("a matter with 3 dated documents gives at least 3 entries", async () => {
    matter = {
      slug: "cases/a",
      title: "Müller ./. Beispiel",
      type: "legal_case",
      frontmatter: {
        type: "legal_case",
        documents: [
          { name: "Klage.pdf", uploadedAt: "2026-03-01T10:00:00Z" },
          { name: "Klagebeantwortung.pdf", uploadedAt: "2026-04-02T10:00:00Z" },
          { name: "Urteil.pdf", uploadedAt: "2026-06-15T10:00:00Z" },
        ],
        deadlines: [
          { title: "Berufung", due_date: "2026-07-13", is_notfrist: true },
          { title: "KI-Vorschlag", due_date: "2026-07-20", review_status: "rejected" },
        ],
        communications: [
          {
            channel: "email",
            direction: "incoming",
            subject: "Vergleichsangebot",
            timestamp: "2026-05-05T08:00:00Z",
          },
        ],
      },
    };
    const res = await post({ case_slug: "cases/a" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.count).toBe(5);
    expect(json.markdown).toContain("Klage.pdf");
    expect(json.markdown).toContain("Frist: Berufung");
    expect(json.markdown).not.toContain("KI-Vorschlag");
    // Oldest first.
    expect(json.chronology.entries[0].event).toContain("Klage.pdf");
    // Read with the caller's headers (matter access rules apply).
    expect(seenHeaders[0]).toMatchObject({ "x-test": "1" });
  });

  it("an unknown or inaccessible matter is a 404, not an empty chronology", async () => {
    matter = null;
    const res = await post({ case_slug: "cases/x" });
    expect(res.status).toBe(404);
  });
});
