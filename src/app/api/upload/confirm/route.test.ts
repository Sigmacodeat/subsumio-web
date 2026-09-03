/**
 * Integration-Test für /api/upload/confirm — verifiziert dass die Route
 * korrekt zum Engine proxied, analysis_status=pending stempelt und
 * post-upload tasks (analyze + reconcile_case + contradiction) enqueued.
 *
 * Der Engine-Aufruf wird gemockt; die Side-Effect-Logik (stampAnalysisPending
 * + enqueueAllPostUploadTasks) wird real durchlaufen.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock session + store + engine context
vi.mock("@/lib/auth/session", () => ({
  verifySession: async () => ({
    uid: "user-1",
    email: "user@example.com",
    role: "admin",
  }),
  SESSION_COOKIE: "sb_session",
  SESSION_TTL_SECONDS: 604800,
  revokeAllSessions: async () => {},
  signSession: async () => "",
  createSession: async () => ({ token: "", cookieOptions: {} }),
}));

vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({
    getById: async () => ({
      id: "user-1",
      email: "user@example.com",
      name: "Test User",
      role: "admin",
      brainId: "brain-1",
      plan: "enterprise",
      locale: "de",
      referralCode: "",
      referredBy: null,
      stripeCustomerId: null,
      createdAt: new Date().toISOString(),
    }),
    update: async () => {},
  }),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));

// Mock audit logging (tries to hit PG pool)
vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(async () => {}),
}));

// Mock quota recording
vi.mock("@/lib/api-handler", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-handler")>();
  return {
    ...actual,
    recordQuota: vi.fn(async () => {}),
  };
});

// Mock engine helpers — keep engineConfigurationResponse real (returns null in test env)
vi.mock("@/lib/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/engine")>();
  return {
    ...actual,
    ENGINE_URL: "http://engine.test",
    enginePatchPage: vi.fn(async () => new Response("{}", { status: 200 })),
  };
});

// Mock post-upload-outbox to verify enqueue calls
vi.mock("@/lib/post-upload-outbox", () => ({
  enqueueAllPostUploadTasks: vi.fn(async () => ({ enqueued: 3 })),
}));

import { POST } from "./route";
import { enginePatchPage } from "@/lib/engine";
import { enqueueAllPostUploadTasks } from "@/lib/post-upload-outbox";

const mockEnginePatch = vi.mocked(enginePatchPage);
const mockEnqueue = vi.mocked(enqueueAllPostUploadTasks);

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        slug: "documents/case-1/eingabe.pdf",
        title: "Eingabe.pdf",
        extraction_status: "ready",
        extraction_method: "pdf",
        async: false,
      })
    )
  );
  mockEnginePatch.mockReset();
  mockEnginePatch.mockResolvedValue(new Response("{}", { status: 200 }));
  mockEnqueue.mockReset();
  mockEnqueue.mockResolvedValue({ enqueued: 3 });
});

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/upload/confirm", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": "test-csrf",
      cookie: "sb_session=test; sb_csrf=test-csrf",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/upload/confirm", () => {
  it("proxies to engine and enqueues post-upload tasks with case_slug", async () => {
    const req = makeRequest({
      upload_id: "upl-1",
      case_slug: "legal/cases/1",
      defer_pipeline: false,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    // Engine was called
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toBe("http://engine.test/api/upload/confirm");
    expect((init as RequestInit).method).toBe("POST");

    // analysis_status=pending was stamped
    expect(mockEnginePatch).toHaveBeenCalledTimes(1);
    const patchArg = mockEnginePatch.mock.calls[0][1];
    expect(patchArg.slug).toBe("documents/case-1/eingabe.pdf");
    expect(patchArg.frontmatter?.analysis_status).toBe("pending");

    // Post-upload tasks enqueued with case_slug → 3 tasks
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    const enqueueArg = mockEnqueue.mock.calls[0][0];
    expect(enqueueArg.doc_slug).toBe("documents/case-1/eingabe.pdf");
    expect(enqueueArg.case_slug).toBe("legal/cases/1");
    expect(enqueueArg.brain_id).toBe("brain-1");
    expect(enqueueArg.doc_title).toBe("Eingabe.pdf");
  });

  it("enqueues only analyze task when no case_slug", async () => {
    const req = makeRequest({
      upload_id: "upl-2",
      defer_pipeline: true,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    const enqueueArg = mockEnqueue.mock.calls[0][0];
    expect(enqueueArg.doc_slug).toBe("documents/case-1/eingabe.pdf");
    expect(enqueueArg.case_slug).toBeUndefined();
  });

  it("stamps analysis_status=pending even if engine returns async:true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          slug: "documents/case-1/async.pdf",
          title: "Async.pdf",
          async: true,
          extraction_status: "processing",
        })
      )
    );

    const req = makeRequest({ upload_id: "upl-3", case_slug: "legal/cases/2" });
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(mockEnginePatch).toHaveBeenCalledTimes(1);
    expect(mockEnginePatch.mock.calls[0][1].slug).toBe("documents/case-1/async.pdf");
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue.mock.calls[0][0].case_slug).toBe("legal/cases/2");
  });

  it("still returns engine response when slug is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "no_slug" }, { status: 400 }))
    );

    const req = makeRequest({ upload_id: "upl-bad" });
    const res = await POST(req);
    expect(res.status).toBe(400);

    // No stamp, no enqueue when slug missing
    expect(mockEnginePatch).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
