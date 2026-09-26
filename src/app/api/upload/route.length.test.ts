// @vitest-environment node
//
// R11-12: an upload without a declared length (chunked body) is refused
// before the body is buffered — size limit and concurrency slot need it.
import { describe, expect, test, vi } from "vitest";

const acquireUploadSlot = vi.fn(() => ({ ok: true, release: vi.fn() }));
vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test", enginePatchPage: vi.fn() }));
vi.mock("@/lib/upload-pipeline", () => ({ scanUploadWithDuplicateCheck: vi.fn() }));
vi.mock("@/lib/extraction-status", () => ({
  inferInitialExtractionStatus: vi.fn(),
  createInitialMetadata: vi.fn(),
}));
vi.mock("@/lib/duplicate-store", () => ({ brainDuplicateStore: vi.fn() }));
vi.mock("@/lib/post-upload-outbox", () => ({ enqueueAllPostUploadTasks: vi.fn() }));
vi.mock("@/lib/case-documents", () => ({ reconcileCaseDocuments: vi.fn() }));
vi.mock("@/lib/upload-concurrency", () => ({
  acquireUploadSlot: (...a: unknown[]) => acquireUploadSlot(...(a as [])),
}));
vi.mock("@/lib/inbound-register-stamp", () => ({ stampInboundEntryBestEffort: vi.fn() }));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      _o: unknown,
      handler: (ctx: unknown, b: unknown, q: unknown, req: Request) => Promise<Response>
    ) =>
    (req: Request) =>
      handler({ headers: {}, brainId: "b", user: { id: "u" } }, {}, {}, req),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
  recordQuota: vi.fn(),
}));

import { POST } from "./route";

describe("POST /api/upload without Content-Length", () => {
  test("is refused with 411 before any slot or buffering", async () => {
    const req = {
      headers: new Headers(),
      formData: vi.fn(),
    } as unknown as Request;
    const res = await (POST as unknown as (r: Request) => Promise<Response>)(req);
    expect(res.status).toBe(411);
    expect(acquireUploadSlot).not.toHaveBeenCalled();
    expect(
      (req as unknown as { formData: ReturnType<typeof vi.fn> }).formData
    ).not.toHaveBeenCalled();
  });
});
