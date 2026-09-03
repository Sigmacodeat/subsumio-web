import { afterEach, describe, expect, it, vi } from "vitest";
import { enqueuePostUploadTask, enqueueAllPostUploadTasks } from "@/lib/post-upload-outbox";

describe("post-upload outbox", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("throws when the engine does not persist the task", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(new Response("write failed", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      enqueuePostUploadTask(
        {
          doc_slug: "documents/akte/eingabe.pdf",
          case_slug: "legal/cases/1",
          brain_id: "brain-1",
          task_type: "analyze",
        },
        "brain-1"
      )
    ).rejects.toThrow(/task_upsert_failed_500/);
  });

  it("keeps an already pending task idempotent", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ frontmatter: { status: "pending" } }));
    vi.stubGlobal("fetch", fetchMock);

    await enqueuePostUploadTask(
      {
        doc_slug: "documents/akte/eingabe.pdf",
        brain_id: "brain-1",
        task_type: "analyze",
      },
      "brain-1"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/legal/post-upload-tasks/analyze/");
  });

  it("enqueueAllPostUploadTasks creates analyze + reconcile_case + contradiction when case_slug is provided", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? "GET";
      // GET existing task → 404 (not found, proceed to upsert)
      if (method === "GET" && u.includes("/api/pages/")) {
        return new Response("not found", { status: 404 });
      }
      // PUT upsert task → 200
      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    await enqueueAllPostUploadTasks({
      doc_slug: "documents/akte/eingabe.pdf",
      case_slug: "legal/cases/1",
      brain_id: "brain-1",
      doc_title: "Eingabe.pdf",
    });

    // Should have made 6 calls: 3 GET (idempotency check) + 3 PUT (upsert)
    expect(fetchMock).toHaveBeenCalledTimes(6);

    const createBodies = fetchMock.mock.calls
      .filter(([, init]) => (init as RequestInit)?.method === "PUT")
      .map(([, init]) => JSON.parse((init as RequestInit).body as string));

    expect(createBodies).toHaveLength(3);
    const slugs = createBodies.map((b) => b.slug as string);
    expect(slugs.some((s) => s.includes("/analyze/"))).toBe(true);
    expect(slugs.some((s) => s.includes("/reconcile_case/"))).toBe(true);
    expect(slugs.some((s) => s.includes("/contradiction/"))).toBe(true);
  });

  it("enqueueAllPostUploadTasks creates only analyze when no case_slug", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? "GET";
      if (method === "GET" && u.includes("/api/pages/")) {
        return new Response("not found", { status: 404 });
      }
      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    await enqueueAllPostUploadTasks({
      doc_slug: "documents/standalone.pdf",
      brain_id: "brain-1",
    });

    // Only 2 calls: 1 GET (idempotency) + 1 PUT (upsert analyze)
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const createBodies = fetchMock.mock.calls
      .filter(([, init]) => (init as RequestInit)?.method === "PUT")
      .map(([, init]) => JSON.parse((init as RequestInit).body as string));

    expect(createBodies).toHaveLength(1);
    expect(createBodies[0].slug).toContain("/analyze/");
  });

  // G9 fix: retry logic for transient failures
  it("retries failed enqueue up to 3 times before giving up", async () => {
    let putAttempts = 0;
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "GET") {
        return new Response("not found", { status: 404 });
      }
      // PUT — fail first 2 times, succeed on 3rd
      putAttempts++;
      if (putAttempts < 3) {
        return new Response("server error", { status: 500 });
      }
      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    await enqueueAllPostUploadTasks({
      doc_slug: "documents/retry-test.pdf",
      brain_id: "brain-1",
    });

    // 1 GET + 3 PUTs (2 failed + 1 success)
    expect(putAttempts).toBe(3);
  });

  it("throws after all retries exhausted", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "GET") {
        return new Response("not found", { status: 404 });
      }
      // PUT — always fail
      return new Response("server error", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      enqueueAllPostUploadTasks({
        doc_slug: "documents/always-fail.pdf",
        brain_id: "brain-1",
      })
    ).rejects.toThrow(/task_upsert_failed_500/);

    // 1 GET + 3 PUTs (all failed)
    const putCalls = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit)?.method === "PUT"
    );
    expect(putCalls).toHaveLength(3);
  });
});
