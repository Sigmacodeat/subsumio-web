// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (_opts: unknown, handler: (ctx: unknown, b: unknown, q: unknown, r: unknown) => unknown) =>
    (req: unknown) =>
      handler(
        { headers: {}, brainId: "b", user: { id: "u", email: "a@b.at" } },
        undefined,
        {},
        req
      ),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
}));

import { GET } from "./route";

const LISTED = [
  { slug: "legal/notes/n1", title: "Vermerk", type: "legal_note", frontmatter: {} },
  {
    slug: "legal/document-requests/r1",
    title: "Anfrage",
    type: "document_request",
    frontmatter: {},
  },
  { slug: "legal/cases/a", title: "Akte", type: "legal_case", frontmatter: {} },
];

function engine(opts: { listStatus?: number; brokenSlug?: string } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = new URL(url);
      if (u.pathname === "/api/pages") {
        if (opts.listStatus) return new Response("{}", { status: opts.listStatus });
        return Response.json(LISTED);
      }
      const slug = decodeURIComponent(u.pathname.slice("/api/pages/".length));
      if (slug === opts.brokenSlug) return new Response("{}", { status: 500 });
      return Response.json({ slug, content: `Text von ${slug}` });
    })
  );
}

async function run() {
  return (await (GET as unknown as (r: unknown) => Promise<Response>)({})) as Response;
}

describe("GET /api/data-export/gdpr", () => {
  test("exports every record type with its text (incl. matter notes and requests)", async () => {
    engine();
    const res = await run();
    expect(res.status).toBe(200);
    const body = await res.json();
    const note = body.data.find((p: { slug: string }) => p.slug === "legal/notes/n1");
    expect(note.content).toBe("Text von legal/notes/n1");
    expect(body.statistics.by_type.document_request).toBe(1);
    expect(body.export_metadata.complete).toBe(true);
    expect(body.export_metadata.legal_basis).toBe("DSGVO Art. 20");
  });

  test("a text that cannot be read makes the export incomplete and is named", async () => {
    engine({ brokenSlug: "legal/cases/a" });
    const body = await (await run()).json();
    expect(body.export_metadata.complete).toBe(false);
    expect(body.export_metadata.pages_without_content_slugs).toEqual(["legal/cases/a"]);
  });

  test("a failed listing aborts the export instead of shipping a partial one", async () => {
    engine({ listStatus: 500 });
    const res = await run();
    expect(res.status).toBe(500);
  });
});
