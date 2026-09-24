// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("./csrf", () => ({
  csrfFetch: vi.fn(),
  getCsrfToken: vi.fn(() => "csrf-token"),
}));

vi.mock("@/lib/env", () => ({
  env: vi.fn((key: string) => process.env[key] || ""),
}));

import { api } from "./api";
import { csrfFetch } from "./csrf";

describe("api.brain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("stats() calls /api/stats", async () => {
    vi.mocked(csrfFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ total_pages: 10 }), { status: 200 })
    );
    const result = await api.brain.stats();
    expect(result.total_pages).toBe(10);
    expect(csrfFetch).toHaveBeenCalledOnce();
    const [url] = vi.mocked(csrfFetch).mock.calls[0];
    expect(url).toContain("/api/stats");
  });

  test("search() calls /api/search with query and limit", async () => {
    vi.mocked(csrfFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify([{ slug: "cases/1", title: "Test", snippet: "...", score: 0.9 }]),
        { status: 200 }
      )
    );
    const result = await api.brain.search("test query", 5);
    expect(result).toHaveLength(1);
    const [url] = vi.mocked(csrfFetch).mock.calls[0];
    expect(url).toContain("/api/search?q=test%20query&limit=5");
  });

  test("search() encodes special characters", async () => {
    vi.mocked(csrfFetch).mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    await api.brain.search("äöü & special", 10);
    const [url] = vi.mocked(csrfFetch).mock.calls[0];
    expect(url).toContain("%C3%A4%C3%B6%C3%BC");
    expect(url).toContain("%26");
  });

  test("getPage() encodes slug segments", async () => {
    vi.mocked(csrfFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ slug: "cases/1", title: "Test", content: "" }), { status: 200 })
    );
    await api.brain.getPage("cases/test case");
    const [url] = vi.mocked(csrfFetch).mock.calls[0];
    expect(url).toContain("/api/pages/cases/test%20case");
  });

  test("listPages() builds query params", async () => {
    vi.mocked(csrfFetch).mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    await api.brain.listPages({ limit: 20, type: "case", source: "upload" });
    const [url] = vi.mocked(csrfFetch).mock.calls[0];
    expect(url).toContain("limit=20");
    expect(url).toContain("type=case");
    expect(url).toContain("source=upload");
  });

  test("listPages() with no options", async () => {
    vi.mocked(csrfFetch).mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    await api.brain.listPages();
    const [url] = vi.mocked(csrfFetch).mock.calls[0];
    expect(url).toContain("/api/pages?");
  });

  test("createPage() sends POST with body", async () => {
    vi.mocked(csrfFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ slug: "cases/new" }), { status: 200 })
    );
    const result = await api.brain.createPage({ slug: "cases/new", title: "New" });
    expect(result.slug).toBe("cases/new");
    const [, opts] = vi.mocked(csrfFetch).mock.calls[0];
    expect(opts?.method).toBe("POST");
  });

  test("updatePage() sends POST with merge:true", async () => {
    vi.mocked(csrfFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ slug: "cases/1", success: true }), { status: 200 })
    );
    await api.brain.updatePage({ slug: "cases/1", title: "Updated" });
    const [, opts] = vi.mocked(csrfFetch).mock.calls[0];
    const body = JSON.parse(opts?.body as string);
    expect(body.merge).toBe(true);
    expect(body.title).toBe("Updated");
  });

  test("deletePage() sends DELETE", async () => {
    vi.mocked(csrfFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );
    await api.brain.deletePage("cases/1");
    const [, opts] = vi.mocked(csrfFetch).mock.calls[0];
    expect(opts?.method).toBe("DELETE");
  });

  test("graph() calls /api/graph", async () => {
    vi.mocked(csrfFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ nodes: [], links: [] }), { status: 200 })
    );
    await api.brain.graph();
    const [url] = vi.mocked(csrfFetch).mock.calls[0];
    expect(url).toContain("/api/graph");
  });

  test("recentQueries() calls /api/queries/recent", async () => {
    vi.mocked(csrfFetch).mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    await api.brain.recentQueries(5);
    const [url] = vi.mocked(csrfFetch).mock.calls[0];
    expect(url).toContain("/api/queries/recent?limit=5");
  });

  test("throws on non-OK response", async () => {
    vi.mocked(csrfFetch).mockResolvedValueOnce(new Response("Not found", { status: 404 }));
    await expect(api.brain.stats()).rejects.toThrow();
  });

  test("throws with HTTP status when body is empty", async () => {
    vi.mocked(csrfFetch).mockResolvedValueOnce(new Response("", { status: 500 }));
    await expect(api.brain.stats()).rejects.toThrow("HTTP 500");
  });
});

describe("401 handling by area", async () => {
  const { isAuthenticatedArea, isPublicRoute } = await import("./api");
  test("only firm areas trigger the login redirect", () => {
    expect(isAuthenticatedArea("/dashboard/cases")).toBe(true);
    expect(isAuthenticatedArea("/ops")).toBe(true);
    expect(isAuthenticatedArea("/portal/abc")).toBe(false);
    expect(isAuthenticatedArea("/at/login")).toBe(false);
  });
  test("public routes skip the session probe", () => {
    expect(isPublicRoute("/portal/abc")).toBe(true);
    expect(isPublicRoute("/at")).toBe(true);
    expect(isPublicRoute("/join/x")).toBe(true);
    expect(isPublicRoute("/dashboard")).toBe(false);
  });
});

describe("request dedupe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("identical concurrent GETs share one fetch", async () => {
    vi.mocked(csrfFetch).mockResolvedValue(
      new Response(JSON.stringify({ slug: "cases/dedupe-1", title: "A" }), { status: 200 })
    );
    const [a, b] = await Promise.all([
      api.brain.getPage("cases/dedupe-1"),
      api.brain.getPage("cases/dedupe-1"),
    ]);
    expect(a.title).toBe("A");
    expect(b).toBe(a);
    expect(csrfFetch).toHaveBeenCalledTimes(1);
  });

  test("different paths and sequential reads are not shared", async () => {
    vi.mocked(csrfFetch).mockImplementation(
      async (url) =>
        new Response(JSON.stringify({ slug: String(url), title: "x" }), { status: 200 })
    );
    await Promise.all([api.brain.getPage("cases/dedupe-2"), api.brain.getPage("cases/dedupe-3")]);
    expect(csrfFetch).toHaveBeenCalledTimes(2);
    await api.brain.getPage("cases/dedupe-2");
    expect(csrfFetch).toHaveBeenCalledTimes(3);
  });

  test("identical batch reads share one fetch, mutations never do", async () => {
    vi.mocked(csrfFetch).mockImplementation(
      async () =>
        new Response(JSON.stringify({ pages: {}, results: {}, slug: "s" }), { status: 200 })
    );
    await Promise.all([api.brain.getPages(["a", "b"]), api.brain.getPages(["a", "b"])]);
    expect(csrfFetch).toHaveBeenCalledTimes(1);
    vi.clearAllMocks();
    await Promise.all([
      api.brain.createPage({ slug: "s", title: "t", content: "c" }),
      api.brain.createPage({ slug: "s", title: "t", content: "c" }),
    ]);
    expect(csrfFetch).toHaveBeenCalledTimes(2);
  });
});

describe("response envelope contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("request() gibt das JSON-Body direkt zurück — kein data-Unwrap", async () => {
    // Routes liefern entweder Rohtypen ({ count, lastAt }) oder die
    // apiSuccess-Hülle ({ data: ... }); request() parst nur — die
    // Entscheidung liegt beim Aufrufer. Pinnt den Contract, damit ein
    // späteres apiSuccess-Refactoring einer Route nicht lautlos
    // { data: undefined } an den Client liefert.
    vi.mocked(csrfFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ count: 3, lastAt: null }), { status: 200 })
    );
    const raw = await api.whatsapp.muted();
    expect(raw).toEqual({ count: 3, lastAt: null });
    expect("data" in raw).toBe(false);

    vi.mocked(csrfFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { count: 3, lastAt: null } }), { status: 200 })
    );
    const enveloped = await api.whatsapp.muted();
    // Ein apiSuccess-Envelope käme unverändert als { data: ... } an —
    // der Aufrufer müsste .data selbst lesen (aktuelle Route tut das nicht).
    expect(enveloped).toEqual({ data: { count: 3, lastAt: null } });
  });
});

describe("api.query.think (SSE)", () => {
  function sseResponse(events: string[]): Response {
    const body = events.map((e) => `data: ${e}`).join("\n\n") + "\n\ndata: [DONE]\n\n";
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  test("a degraded final_answer is mapped to the lawyer-facing message, onRevised fires once", async () => {
    const degraded =
      "(no LLM available — anthropic: credit balance too low, see console.anthropic.com)";
    vi.mocked(csrfFetch).mockResolvedValueOnce(
      sseResponse([
        JSON.stringify({ chunk: "Entwurf " }),
        JSON.stringify({ final_answer: degraded }),
        JSON.stringify({ citations: [], gaps: [] }),
      ])
    );
    const onRevised = vi.fn();
    const result = await api.query.think("frage", { onRevised });
    expect(result.answer).toContain("Assistent kann gerade keine Antwort");
    expect(result.answer).not.toContain("anthropic");
    expect(result.answer_revised).toBe(true);
    expect(onRevised).toHaveBeenCalledTimes(1);
  });

  test("a normal final_answer replaces the streamed draft once", async () => {
    vi.mocked(csrfFetch).mockResolvedValueOnce(
      sseResponse([
        JSON.stringify({ chunk: "Teil " }),
        JSON.stringify({ final_answer: "Endfassung" }),
        JSON.stringify({ citations: [{ slug: "x" }], gaps: [] }),
      ])
    );
    const onRevised = vi.fn();
    const result = await api.query.think("frage", { onRevised });
    expect(result.answer).toBe("Endfassung");
    expect(onRevised).toHaveBeenCalledTimes(1);
  });
});
