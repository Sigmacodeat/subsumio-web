// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

const mockRead = vi.fn();
const mockDetach = vi.fn();

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/realtime-bus", () => ({ broadcastSseEvent: vi.fn() }));
vi.mock("@/lib/page-write-guards", () => ({
  readCurrentPage: (...args: unknown[]) => mockRead(...args),
}));
vi.mock("@/lib/case-documents", () => {
  class CaseArchivedError extends Error {}
  return {
    CaseArchivedError,
    detachCaseDocument: (...args: unknown[]) => mockDetach(...args),
  };
});
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { body: { safeParse: (d: unknown) => { success: boolean; data?: unknown } } },
      handler: (ctx: unknown, body: unknown) => Promise<Response>
    ) =>
    async (req: Request) => {
      const parsed = opts.body.safeParse(await req.json());
      if (!parsed.success) return Response.json({ error: "bad" }, { status: 400 });
      return handler(
        { headers: {}, brainId: "b", user: { id: "u", email: "a@b.at" } },
        parsed.data
      );
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
}));

import { POST } from "./route";
import { CaseArchivedError } from "@/lib/case-documents";

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/cases/documents/detach", {
      method: "POST",
      body: JSON.stringify(body),
    }) as never
  );
}

describe("POST /api/cases/documents/detach", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRead.mockResolvedValue({ kind: "found", page: { type: "legal_case", frontmatter: {} } });
  });

  test("detaches the document from the matter", async () => {
    mockDetach.mockResolvedValue({ removedFromList: true });
    const res = await post({ case_slug: "legal/cases/a", doc_slug: "docs/x" });
    expect(res.status).toBe(200);
    expect(mockDetach).toHaveBeenCalledWith({}, "legal/cases/a", "docs/x");
    expect((await res.json()).data.removedFromList).toBe(true);
  });

  test("an engine failure is an error, not a success", async () => {
    mockDetach.mockRejectedValue(new Error("case_document_remove_failed"));
    const res = await post({ case_slug: "legal/cases/a", doc_slug: "docs/x" });
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("detach_failed");
  });

  test("an archived matter answers 409", async () => {
    mockDetach.mockRejectedValue(new CaseArchivedError("legal/cases/a", "archived"));
    const res = await post({ case_slug: "legal/cases/a", doc_slug: "docs/x" });
    expect(res.status).toBe(409);
  });

  test("only a matter can be detached from", async () => {
    mockRead.mockResolvedValue({ kind: "found", page: { type: "document", frontmatter: {} } });
    const res = await post({ case_slug: "docs/y", doc_slug: "docs/x" });
    expect(res.status).toBe(400);
    expect(mockDetach).not.toHaveBeenCalled();
  });
});
