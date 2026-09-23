// @vitest-environment node
//
// The WebDAV document endpoints ask resolveFeedToken for the "documents"
// scope (so the calendar link is refused there); fristen.ics asks for
// "calendar".
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveFeedToken = vi.fn();
vi.mock("@/lib/feed-auth", () => ({
  resolveFeedToken: (...args: unknown[]) => resolveFeedToken(...args),
}));
vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/deadlines-ics", () => ({ deadlinesIcsFor: vi.fn(async () => "BEGIN:VCALENDAR") }));

import { GET as listDocuments } from "./route";
import { GET as getDocument } from "./[slug]/route";
import { GET as getIcs } from "../../fristen.ics/route";

const fetchMock = vi.fn();

beforeEach(() => {
  resolveFeedToken.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

const params = <T>(p: T) => ({ params: Promise.resolve(p) });

describe("DAV document routes require the documents scope", () => {
  it("listing asks for the documents scope and refuses a calendar-only token", async () => {
    resolveFeedToken.mockResolvedValue({ ok: false, status: 404 });
    const res = await listDocuments(new Request("http://x"), params({ token: "u1.cal" }));
    expect(resolveFeedToken).toHaveBeenCalledWith("u1.cal", "documents");
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a single document asks for the documents scope and refuses a calendar-only token", async () => {
    resolveFeedToken.mockResolvedValue({ ok: false, status: 404 });
    const res = await getDocument(
      new Request("http://x"),
      params({ token: "u1.cal", slug: "docs/a" })
    );
    expect(resolveFeedToken).toHaveBeenCalledWith("u1.cal", "documents");
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a DAV token lists documents from the owner's brain", async () => {
    resolveFeedToken.mockResolvedValue({
      ok: true,
      userId: "u1",
      kind: "dav",
      headers: { "x-subsumio-source": "b1" },
    });
    fetchMock.mockResolvedValue(Response.json([{ slug: "docs/a", title: "A", frontmatter: {} }]));
    const res = await listDocuments(new Request("http://x"), params({ token: "u1.dav" }));
    expect(res.status).toBe(200);
    expect((await res.json()).documents[0].slug).toBe("docs/a");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["x-subsumio-source"]).toBe("b1");
  });

  it("the ICS feed asks for the calendar scope", async () => {
    resolveFeedToken.mockResolvedValue({ ok: true, userId: "u1", kind: "calendar", headers: {} });
    const res = await getIcs(new Request("http://x"), params({ token: "u1.cal" }));
    expect(resolveFeedToken).toHaveBeenCalledWith("u1.cal", "calendar");
    expect(res.status).toBe(200);
  });
});
