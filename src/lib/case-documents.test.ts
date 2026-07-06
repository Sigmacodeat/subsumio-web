import { describe, it, expect, beforeEach } from "vitest";
import { reconcileCaseDocuments, type CaseDocumentEntry } from "./case-documents";

// In-memory fake engine: /api/pages/<slug> GET returns the page; POST /api/pages
// with merge:true overlays the documents array. Lets us drive the convergence
// loop deterministically.
function fakeEngine(initialDocs: Record<string, unknown>[] = []) {
  const state: { documents: Record<string, unknown>[] } = { documents: [...initialDocs] };
  let getCalls = 0;
  let postCalls = 0;
  // Optional hook to mutate state between a writer's write and its verify read,
  // simulating a concurrent writer that overwrote the array.
  let onAfterPost: (() => void) | null = null;

  global.fetch = (async (url: string, init?: { method?: string; body?: string }) => {
    const path = new URL(url, "http://localhost").pathname;
    if (init?.method === "POST" && path === "/api/pages") {
      postCalls++;
      const body = JSON.parse(init.body ?? "{}") as {
        frontmatter?: { documents?: Record<string, unknown>[] };
      };
      if (body.frontmatter?.documents) state.documents = body.frontmatter.documents;
      const hook = onAfterPost;
      onAfterPost = null;
      hook?.();
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (path.startsWith("/api/pages/")) {
      getCalls++;
      return new Response(JSON.stringify({ frontmatter: { documents: state.documents } }), {
        status: 200,
      });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  return {
    state,
    get calls() {
      return { get: getCalls, post: postCalls };
    },
    setOnAfterPost(fn: () => void) {
      onAfterPost = fn;
    },
  };
}

const entry = (slug: string): CaseDocumentEntry => ({
  id: slug,
  slug,
  name: `${slug}.pdf`,
  url: `/api/files/${slug}`,
  uploadedAt: "2026-07-06T00:00:00Z",
  size: 100,
});

describe("reconcileCaseDocuments", () => {
  beforeEach(() => {
    // no-op; each test builds its own fakeEngine
  });

  it("appends a new document to an empty case", async () => {
    const eng = fakeEngine([]);
    await reconcileCaseDocuments({ "x-subsumio-source": "b1" }, "cases/x", entry("documents/a"));
    expect(eng.state.documents.map((d) => d.slug)).toEqual(["documents/a"]);
  });

  it("is idempotent — re-adding the same slug is a no-op (no duplicate)", async () => {
    const eng = fakeEngine([entry("documents/a") as unknown as Record<string, unknown>]);
    await reconcileCaseDocuments({ "x-subsumio-source": "b1" }, "cases/x", entry("documents/a"));
    expect(eng.state.documents).toHaveLength(1);
    // Already present → detected on first read, no write needed.
    expect(eng.calls.post).toBe(0);
  });

  it("converges when a concurrent writer overwrites the array (P2-1)", async () => {
    const eng = fakeEngine([]);
    // Simulate: right after our first write, a concurrent writer replaces the
    // whole array with only THEIR entry (dropping ours). The verify read then
    // finds ours missing, so we loop, re-read (now see the other entry), and
    // re-append ours → both end up present.
    eng.setOnAfterPost(() => {
      eng.state.documents = [entry("documents/other") as unknown as Record<string, unknown>];
    });
    await reconcileCaseDocuments({ "x-subsumio-source": "b1" }, "cases/x", entry("documents/a"));
    const slugs = eng.state.documents.map((d) => d.slug).sort();
    expect(slugs).toEqual(["documents/a", "documents/other"]);
  });

  it("throws convergence_failed if it never survives (bounded retries)", async () => {
    const eng = fakeEngine([]);
    // Every write is immediately clobbered by a concurrent writer, forever.
    const clobber = () => {
      eng.state.documents = [entry("documents/other") as unknown as Record<string, unknown>];
      eng.setOnAfterPost(clobber);
    };
    eng.setOnAfterPost(clobber);
    await expect(
      reconcileCaseDocuments({ "x-subsumio-source": "b1" }, "cases/x", entry("documents/a"), 3)
    ).rejects.toThrow(/convergence_failed/);
  });
});
