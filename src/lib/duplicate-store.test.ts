import { describe, it, expect, vi } from "vitest";
import { brainDuplicateStore } from "./duplicate-store";

type PageResponse = { frontmatter?: { original_slug?: string; original_name?: string } };

function createFakeFetch(pages: Record<string, PageResponse>) {
  return (async (
    url: string,
    init?: { method?: string; body?: string; headers?: Record<string, string> }
  ) => {
    const urlObj = new URL(url, "http://localhost");
    const path = urlObj.pathname;
    const match = path.match(/\/api\/pages\/(.+)$/);
    if (!match) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    const slug = decodeURIComponent(match[1]!);
    if (init?.method === "POST") {
      const body = JSON.parse(init.body ?? "{}") as { content?: string };
      const content = body.content ?? "";
      const originalSlug = content.match(/original_slug: "([^"]+)"/)?.[1];
      const originalName = content.match(/original_name: "([^"]+)"/)?.[1];
      pages[slug] = { frontmatter: { original_slug: originalSlug, original_name: originalName } };
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    const page = pages[slug];
    if (!page) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    return new Response(JSON.stringify(page), { status: 200 });
  }) as typeof fetch;
}

describe("brainDuplicateStore", () => {
  it("returns null when no hash is recorded", async () => {
    const pages: Record<string, PageResponse> = {};
    global.fetch = createFakeFetch(pages);
    const store = brainDuplicateStore({ "x-subsumio-source": "brain-1" });
    const result = await store.lookup("abc123");
    expect(result).toBeNull();
  });

  it("records and looks up a duplicate hash", async () => {
    const pages: Record<string, PageResponse> = {};
    global.fetch = createFakeFetch(pages);
    const store = brainDuplicateStore({ "x-subsumio-source": "brain-1" });
    await store.record("abc123", "documents/contract", "contract.pdf");
    const result = await store.lookup("abc123");
    expect(result).toEqual({ slug: "documents/contract", name: "contract.pdf" });
  });

  it("returns null for a different hash", async () => {
    const pages: Record<string, PageResponse> = {};
    global.fetch = createFakeFetch(pages);
    const store = brainDuplicateStore({ "x-subsumio-source": "brain-1" });
    await store.record("abc123", "documents/contract", "contract.pdf");
    const result = await store.lookup("xyz789");
    expect(result).toBeNull();
  });
});
