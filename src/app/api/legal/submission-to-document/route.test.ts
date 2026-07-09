// @vitest-environment jsdom

import { describe, test, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for the submission-to-document API endpoint logic.
 *
 * The endpoint:
 * 1. Reads a client_submission page from the engine
 * 2. Fetches the stored file bytes
 * 3. Re-uploads through the engine's /api/upload (triggers OCR + legal pipeline)
 * 4. Reconciles case documents
 * 5. Enqueues post-upload analysis tasks
 * 6. Marks the submission as documents_imported
 */

const mockFetch = vi.fn();

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine-test:3001",
  enginePatchPage: vi.fn(() => Promise.resolve(new Response("{}", { status: 200 }))),
}));

vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    opts: { body?: { safeParse: (d: unknown) => { success: boolean } } },
    handler: (ctx: unknown, body: unknown) => Promise<Response>
  ) => {
    return async (req: Request) => {
      const body = await req.json().catch(() => ({}));
      if (opts.body) {
        const parsed = opts.body.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: "bad_request" }, { status: 400 });
        }
      }
      const ctx = {
        headers: { "x-test": "1" },
        brainId: "test-brain",
        user: { id: "user-1" },
      };
      return handler(ctx, body);
    };
  },
  apiError: (_code: string, message: string, status: number) =>
    Response.json({ error: message }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }, { status: 200 }),
  recordQuota: vi.fn(),
}));

vi.mock("@/lib/case-documents", () => ({
  reconcileCaseDocuments: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/post-upload-outbox", () => ({
  enqueueAllPostUploadTasks: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/extraction-status", () => ({
  inferInitialExtractionStatus: () => "ready",
  createInitialMetadata: () => ({}),
}));

global.fetch = mockFetch as unknown as typeof fetch;

describe("POST /api/legal/submission-to-document", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns 400 when submissionSlug is missing", async () => {
    const { POST } = await import("@/app/api/legal/submission-to-document/route");
    const res = await POST(
      new Request("http://localhost/api/legal/submission-to-document", {
        method: "POST",
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
  });

  test("returns 404 when submission page not found", async () => {
    mockFetch.mockResolvedValueOnce(new Response("not found", { status: 404 }));
    const { POST } = await import("@/app/api/legal/submission-to-document/route");
    const res = await POST(
      new Request("http://localhost/api/legal/submission-to-document", {
        method: "POST",
        body: JSON.stringify({ submissionSlug: "legal/submissions/whatsapp/test-1" }),
      })
    );
    expect(res.status).toBe(404);
  });

  test("returns 400 when submission has no media", async () => {
    mockFetch.mockResolvedValueOnce(
      Response.json({
        slug: "legal/submissions/whatsapp/test-1",
        frontmatter: { case_slug: "cases/test-case" },
      })
    );
    const { POST } = await import("@/app/api/legal/submission-to-document/route");
    const res = await POST(
      new Request("http://localhost/api/legal/submission-to-document", {
        method: "POST",
        body: JSON.stringify({ submissionSlug: "legal/submissions/whatsapp/test-1" }),
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("keine Datei");
  });

  test("returns 400 when submission has no case_slug", async () => {
    mockFetch.mockResolvedValueOnce(
      Response.json({
        slug: "legal/submissions/whatsapp/test-1",
        frontmatter: {
          media: {
            filename: "doc.pdf",
            mime_type: "application/pdf",
            sha256: "abc",
            size_bytes: 1000,
            storage_provider: "local",
            storage_path: "submissions/test-1/doc.pdf",
          },
        },
      })
    );
    const { POST } = await import("@/app/api/legal/submission-to-document/route");
    const res = await POST(
      new Request("http://localhost/api/legal/submission-to-document", {
        method: "POST",
        body: JSON.stringify({ submissionSlug: "legal/submissions/whatsapp/test-1" }),
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("keiner Akte zugeordnet");
  });

  test("successfully imports document with full pipeline", async () => {
    // 1. GET submission page
    mockFetch.mockResolvedValueOnce(
      Response.json({
        slug: "legal/submissions/whatsapp/test-1",
        frontmatter: {
          case_slug: "cases/test-case",
          media: {
            filename: "contract.pdf",
            mime_type: "application/pdf",
            sha256: "abc123",
            size_bytes: 5000,
            storage_provider: "local",
            storage_path: "submissions/test-1/contract.pdf",
          },
        },
      })
    );
    // 2. GET file bytes
    mockFetch.mockResolvedValueOnce(new Response(new ArrayBuffer(5000), { status: 200 }));
    // 3. POST upload to engine
    mockFetch.mockResolvedValueOnce(
      Response.json({
        slug: "documents/imported-contract-pdf",
        title: "contract.pdf",
        extraction_status: "ready",
      })
    );

    const { POST } = await import("@/app/api/legal/submission-to-document/route");
    const res = await POST(
      new Request("http://localhost/api/legal/submission-to-document", {
        method: "POST",
        body: JSON.stringify({ submissionSlug: "legal/submissions/whatsapp/test-1" }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.ok).toBe(true);
    expect(body.data.documentSlug).toBe("documents/imported-contract-pdf");
    expect(body.data.caseSlug).toBe("cases/test-case");
    expect(body.data.case_reconciliation.ok).toBe(true);
    expect(body.data.analysis_enqueued).toBe(true);

    // Verify fetch calls: 1) GET page, 2) GET file, 3) POST upload
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  test("returns success when already imported", async () => {
    mockFetch.mockResolvedValueOnce(
      Response.json({
        slug: "legal/submissions/whatsapp/test-1",
        frontmatter: {
          case_slug: "cases/test-case",
          media: {
            filename: "doc.pdf",
            mime_type: "application/pdf",
            sha256: "abc",
            size_bytes: 1000,
            storage_provider: "local",
            storage_path: "submissions/test-1/doc.pdf",
          },
          documents_imported: true,
        },
      })
    );

    const { POST } = await import("@/app/api/legal/submission-to-document/route");
    const res = await POST(
      new Request("http://localhost/api/legal/submission-to-document", {
        method: "POST",
        body: JSON.stringify({ submissionSlug: "legal/submissions/whatsapp/test-1" }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.alreadyImported).toBe(true);
    // Should not have fetched file or uploaded
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
