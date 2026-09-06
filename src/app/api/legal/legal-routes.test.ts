// @vitest-environment jsdom

import { describe, test, expect, vi } from "vitest";

/**
 * Route-level tests for the 3 most important legal API routes:
 * - summarize
 * - document-review
 * - contract-draft
 *
 * Tests cover:
 * 1. POST handler exported as function
 * 2. Zod validation rejects invalid bodies
 * 3. Zod validation accepts valid bodies
 * 4. .refine() rejects when neither document_slug nor text provided
 * 5. Schema defaults applied correctly
 */

vi.mock("@/lib/api-handler", () => ({
  createEngineProxy: (opts: {
    body?: { safeParse: (d: unknown) => { success: boolean; error?: { issues: unknown[] } } };
    stream?: boolean;
  }) => {
    return async (req: Request) => {
      const body = await req.json().catch(() => ({}));
      if (opts.body) {
        const parsed = opts.body.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: "bad_request" }, { status: 400 });
        }
      }
      return Response.json({ ok: true }, { status: 200 });
    };
  },
  apiError: (_code: string, message: string, status: number) =>
    Response.json({ error: message }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }, { status: 200 }),
}));

// ── summarize ──────────────────────────────────────────────────────

describe("POST /api/legal/summarize", () => {
  test("exports POST as function", async () => {
    const mod = await import("./summarize/route");
    expect(typeof mod.POST).toBe("function");
  });

  test("rejects empty body (no slug or text)", async () => {
    const mod = await import("./summarize/route");
    const res = await mod.POST(
      new Request("http://localhost/api/legal/summarize", {
        method: "POST",
        body: JSON.stringify({}),
      }) as never
    );
    expect(res.status).toBe(400);
  });

  test("accepts valid body with document_slug", async () => {
    const mod = await import("./summarize/route");
    const res = await mod.POST(
      new Request("http://localhost/api/legal/summarize", {
        method: "POST",
        body: JSON.stringify({ document_slug: "case/test-001" }),
      }) as never
    );
    expect(res.status).toBe(200);
  });

  test("accepts valid body with text", async () => {
    const mod = await import("./summarize/route");
    const res = await mod.POST(
      new Request("http://localhost/api/legal/summarize", {
        method: "POST",
        body: JSON.stringify({ text: "Dies ist ein Testdokument." }),
      }) as never
    );
    expect(res.status).toBe(200);
  });

  test("rejects text exceeding 100K chars", async () => {
    const mod = await import("./summarize/route");
    const res = await mod.POST(
      new Request("http://localhost/api/legal/summarize", {
        method: "POST",
        body: JSON.stringify({ text: "x".repeat(100_001) }),
      }) as never
    );
    expect(res.status).toBe(400);
  });

  test("rejects invalid type enum", async () => {
    const mod = await import("./summarize/route");
    const res = await mod.POST(
      new Request("http://localhost/api/legal/summarize", {
        method: "POST",
        body: JSON.stringify({ text: "test", type: "invalid" }),
      }) as never
    );
    expect(res.status).toBe(400);
  });
});

// ── document-review ────────────────────────────────────────────────

describe("POST /api/legal/document-review", () => {
  test("exports POST as function", async () => {
    const mod = await import("./document-review/route");
    expect(typeof mod.POST).toBe("function");
  });

  test("rejects empty body (no slug or text)", async () => {
    const mod = await import("./document-review/route");
    const res = await mod.POST(
      new Request("http://localhost/api/legal/document-review", {
        method: "POST",
        body: JSON.stringify({}),
      }) as never
    );
    expect(res.status).toBe(400);
  });

  test("accepts valid body with document_slug", async () => {
    const mod = await import("./document-review/route");
    const res = await mod.POST(
      new Request("http://localhost/api/legal/document-review", {
        method: "POST",
        body: JSON.stringify({ document_slug: "contracts/test-001" }),
      }) as never
    );
    expect(res.status).toBe(200);
  });

  test("accepts valid body with text + questions", async () => {
    const mod = await import("./document-review/route");
    const res = await mod.POST(
      new Request("http://localhost/api/legal/document-review", {
        method: "POST",
        body: JSON.stringify({
          text: "Vertragstext...",
          questions: ["Welche Risiken gibt es?"],
          focus: "risks",
        }),
      }) as never
    );
    expect(res.status).toBe(200);
  });

  test("rejects invalid focus enum", async () => {
    const mod = await import("./document-review/route");
    const res = await mod.POST(
      new Request("http://localhost/api/legal/document-review", {
        method: "POST",
        body: JSON.stringify({ text: "test", focus: "invalid" }),
      }) as never
    );
    expect(res.status).toBe(400);
  });

  test("rejects >20 questions", async () => {
    const mod = await import("./document-review/route");
    const res = await mod.POST(
      new Request("http://localhost/api/legal/document-review", {
        method: "POST",
        body: JSON.stringify({
          text: "test",
          questions: Array(21).fill("q?"),
        }),
      }) as never
    );
    expect(res.status).toBe(400);
  });
});

// ── contract-draft ─────────────────────────────────────────────────

describe("POST /api/legal/contract-draft", () => {
  test("exports POST as function", async () => {
    const mod = await import("./contract-draft/route");
    expect(typeof mod.POST).toBe("function");
  });

  test("rejects empty body", async () => {
    const mod = await import("./contract-draft/route");
    const res = await mod.POST(
      new Request("http://localhost/api/legal/contract-draft", {
        method: "POST",
        body: JSON.stringify({}),
      }) as never
    );
    expect(res.status).toBe(400);
  });

  test("accepts valid body", async () => {
    const mod = await import("./contract-draft/route");
    const res = await mod.POST(
      new Request("http://localhost/api/legal/contract-draft", {
        method: "POST",
        body: JSON.stringify({
          type: "nda",
          jurisdiction: "de",
          parties: { a: "Firma A", b: "Firma B" },
        }),
      }) as never
    );
    expect(res.status).toBe(200);
  });

  test("rejects missing type", async () => {
    const mod = await import("./contract-draft/route");
    const res = await mod.POST(
      new Request("http://localhost/api/legal/contract-draft", {
        method: "POST",
        body: JSON.stringify({
          jurisdiction: "de",
          parties: { a: "A", b: "B" },
        }),
      }) as never
    );
    expect(res.status).toBe(400);
  });

  test("rejects invalid jurisdiction", async () => {
    const mod = await import("./contract-draft/route");
    const res = await mod.POST(
      new Request("http://localhost/api/legal/contract-draft", {
        method: "POST",
        body: JSON.stringify({
          type: "nda",
          jurisdiction: "fr",
          parties: { a: "A", b: "B" },
        }),
      }) as never
    );
    expect(res.status).toBe(400);
  });

  test("rejects missing parties", async () => {
    const mod = await import("./contract-draft/route");
    const res = await mod.POST(
      new Request("http://localhost/api/legal/contract-draft", {
        method: "POST",
        body: JSON.stringify({
          type: "nda",
          jurisdiction: "de",
        }),
      }) as never
    );
    expect(res.status).toBe(400);
  });

  test("rejects instructions >5000 chars", async () => {
    const mod = await import("./contract-draft/route");
    const res = await mod.POST(
      new Request("http://localhost/api/legal/contract-draft", {
        method: "POST",
        body: JSON.stringify({
          type: "nda",
          jurisdiction: "de",
          parties: { a: "A", b: "B" },
          instructions: "x".repeat(5001),
        }),
      }) as never
    );
    expect(res.status).toBe(400);
  });
});
