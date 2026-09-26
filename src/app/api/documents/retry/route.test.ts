// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

const mockPatch = vi.fn();
const mockEnqueue = vi.fn();

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  enginePatchPage: (...args: unknown[]) => mockPatch(...args),
}));
vi.mock("@/lib/post-upload-outbox", () => ({
  enqueueAllPostUploadTasks: (...args: unknown[]) => mockEnqueue(...args),
}));
vi.mock("@/lib/realtime-bus", () => ({ broadcastSseEvent: vi.fn() }));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (_opts: unknown, handler: (ctx: unknown, body: unknown) => Promise<Response>) =>
    async (req: Request) =>
      handler({ headers: {}, brainId: "b", user: { id: "u", email: "a@b.at" } }, await req.json()),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
}));

import { POST } from "./route";

let docFm: Record<string, unknown> = {};
let backfillQueued: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  mockPatch.mockResolvedValue(new Response("{}", { status: 200 }));
  mockEnqueue.mockResolvedValue(undefined);
  backfillQueued = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).endsWith("/api/ocr/backfill")
        ? Response.json({ queued: backfillQueued })
        : Response.json({ slug: "docs/x", frontmatter: docFm })
    )
  );
});

function retry() {
  return POST(
    new Request("http://localhost/api/documents/retry", {
      method: "POST",
      body: JSON.stringify({ slug: "docs/x" }),
    }) as never
  );
}

describe("POST /api/documents/retry", () => {
  test("failed extraction that cannot be re-run keeps its failure and cause", async () => {
    docFm = {
      extraction_status: "failed",
      extraction_error_code: "password_protected",
      analysis_status: "failed",
    };
    const res = await retry();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("reextract_unavailable");
    expect(mockPatch).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  test("failed extraction with a queued engine job becomes processing", async () => {
    docFm = { extraction_status: "failed", ocr_status: "needs_backfill" };
    backfillQueued = ["docs/x"];
    const res = await retry();
    expect(res.status).toBe(200);
    expect((await res.json()).data.extraction_retry).toBe("queued");
    const fm = mockPatch.mock.calls[0]![1].frontmatter as Record<string, unknown>;
    expect(fm.extraction_status).toBe("processing");
    expect(fm.extraction_error_code).toBeNull();
  });

  test("a failed analysis is reset without touching the extraction state", async () => {
    docFm = { extraction_status: "ready", analysis_status: "failed" };
    const res = await retry();
    expect(res.status).toBe(200);
    const fm = mockPatch.mock.calls[0]![1].frontmatter as Record<string, unknown>;
    expect(fm.analysis_status).toBe("pending");
    expect("extraction_status" in fm).toBe(false);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });
});
