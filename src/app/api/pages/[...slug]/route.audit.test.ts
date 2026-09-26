// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPatch = vi.fn();
const mockLogAudit = vi.fn();
const mockArchive = vi.fn();
const mockRestore = vi.fn();

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  enginePatchPage: (...args: unknown[]) => mockPatch(...args),
}));
vi.mock("@/lib/audit", () => ({ logAudit: (...args: unknown[]) => mockLogAudit(...args) }));
vi.mock("@/lib/realtime-bus", () => ({ broadcastSseEvent: vi.fn() }));
vi.mock("@/lib/case-cascade", () => ({
  archiveCaseDocuments: (...args: unknown[]) => mockArchive(...args),
  restoreCaseDocuments: (...args: unknown[]) => mockRestore(...args),
}));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

// Like the real createHandler: run the handler, then write the `audit:` spec
// once on success.
vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    opts: {
      audit?: (
        ctx: unknown,
        body: unknown,
        query: unknown,
        req: Request
      ) => { action: string; entityId?: string; details?: Record<string, unknown> };
    },
    handler: (ctx: unknown, body: unknown, query: unknown, req: Request) => Promise<Response>
  ) => {
    return async (req: Request) => {
      const ctx = {
        headers: { "x-subsumio-source": "brain-at" },
        brainId: "brain-at",
        user: { id: "u1", email: "anwalt@example.com", name: "Anwalt", role: "lawyer" },
      };
      const body = req.method === "DELETE" ? {} : await req.json().catch(() => ({}));
      const res = await handler(ctx, body, {}, req);
      if (res.ok && opts.audit) {
        const spec = opts.audit(ctx, body, {}, req);
        mockLogAudit(spec.action, "page", { entityId: spec.entityId, details: spec.details });
      }
      return res;
    };
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiNotFound: (code: string) => Response.json({ error: code }, { status: 404 }),
}));

import { DELETE, PATCH } from "./route";

let stored: Record<string, unknown> | null;

beforeEach(() => {
  vi.clearAllMocks();
  mockPatch.mockResolvedValue(Response.json({ success: true }));
  mockArchive.mockResolvedValue({ attempted: true, matched: 2, succeeded: 2, failed: [] });
  mockRestore.mockResolvedValue({ attempted: true, matched: 1, succeeded: 1, failed: [] });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(stored))
  );
});

function call(method: "PATCH" | "DELETE", slug: string, body?: unknown) {
  const req = new Request(`http://localhost/api/pages/${slug}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  (req as unknown as { params: Promise<{ slug: string[] }> }).params = Promise.resolve({
    slug: slug.split("/"),
  });
  return method === "PATCH"
    ? (PATCH as unknown as (r: Request) => Promise<Response>)(req)
    : (DELETE as unknown as (r: Request) => Promise<Response>)(req);
}

describe("/api/pages/[...slug] — one audit entry per action", () => {
  it("DELETE of a document writes exactly one document.delete / soft_delete entry", async () => {
    stored = { slug: "docs/brief", type: "document", frontmatter: {} };
    const res = await call("DELETE", "docs/brief");
    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledTimes(1);
    expect(mockLogAudit).toHaveBeenCalledWith("document.delete", "page", {
      entityId: "docs/brief",
      details: expect.objectContaining({ method: "soft_delete" }),
    });
  });

  it("DELETE of a matter writes one case.delete entry with the cascade result", async () => {
    stored = { slug: "legal/cases/a", type: "legal_case", frontmatter: { status: "open" } };
    const res = await call("DELETE", "legal/cases/a");
    expect(res.status).toBe(200);
    expect(mockArchive).toHaveBeenCalledTimes(1);
    expect(mockLogAudit).toHaveBeenCalledTimes(1);
    expect(mockLogAudit).toHaveBeenCalledWith("case.delete", "page", {
      entityId: "legal/cases/a",
      details: expect.objectContaining({ method: "soft_delete", cascaded: 2, cascadeFailed: 0 }),
    });
  });

  it("restoring a matter uses the shared restore cascade and logs one case.restore", async () => {
    stored = { slug: "legal/cases/a", type: "legal_case", frontmatter: { status: "archived" } };
    const res = await call("PATCH", "legal/cases/a", {
      frontmatter: { status: "open", restored_at: "2026-09-25T10:00:00Z" },
    });
    expect(res.status).toBe(200);
    expect(mockRestore).toHaveBeenCalledTimes(1);
    expect((mockRestore.mock.calls[0]![1] as Set<string>).has("legal/cases/a")).toBe(true);
    expect(mockLogAudit).toHaveBeenCalledTimes(1);
    expect(mockLogAudit.mock.calls[0]![0]).toBe("case.restore");
  });
});
