// @vitest-environment node
import { describe, expect, test, vi, beforeEach } from "vitest";

const enginePatchPage = vi.fn(async () => new Response("{}", { status: 200 }));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine-test:3001",
  enginePatchPage: (...a: unknown[]) => enginePatchPage(...(a as [])),
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } } },
      handler: (ctx: unknown, body: unknown) => Promise<Response>
    ) =>
    async (req: Request) => {
      const raw = await req.json();
      const parsed = opts.body!.safeParse(raw);
      if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
      return handler(
        { headers: { Authorization: "Bearer t" }, user: { email: "anwalt@example.test" } },
        parsed.data
      );
    },
  apiSuccess: (data: unknown) => Response.json({ data }),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
}));

const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

import { POST } from "./route";

function message(fm: Record<string, unknown>) {
  return new Response(JSON.stringify({ slug: "inbox/m1", frontmatter: fm }), { status: 200 });
}

async function createDeadline(body: Record<string, unknown>) {
  const res = await POST(
    new Request("http://localhost/api/triage/action", {
      method: "POST",
      body: JSON.stringify({ slug: "inbox/m1", action: "create_deadline", ...body }),
    }) as never
  );
  const create = fetchMock.mock.calls.find((c) => c[1]?.method === "POST");
  return { res, fm: create ? JSON.parse(create[1].body as string).frontmatter : null };
}

describe("POST /api/triage/action — Frist anlegen (W1-12)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    enginePatchPage.mockClear();
  });

  test("the deadline is unreviewed, bound to the confirmed matter, with an ISO due_date", async () => {
    fetchMock
      .mockResolvedValueOnce(message({ case_slug: "legal/cases/akte-1" }))
      .mockResolvedValueOnce(new Response("{}", { status: 201 }));
    const { res, fm } = await createDeadline({
      deadline_date: "4.5.2026",
      deadline_label: "Berufung",
    });
    expect(res.status).toBe(200);
    expect(fm).toMatchObject({
      type: "legal_deadline",
      case_slug: "legal/cases/akte-1",
      due_date: "2026-05-04",
      review_status: "unreviewed",
      status: "pending",
      description: "Berufung",
    });
  });

  test("an unconfirmed triage guess is only a hint, never the matter", async () => {
    fetchMock
      .mockResolvedValueOnce(message({ triage_suggested_case: "case/12-Cg-34-25" }))
      .mockResolvedValueOnce(new Response("{}", { status: 201 }));
    const { fm } = await createDeadline({ deadline_date: "2026-05-04" });
    expect(fm.case_slug).toBeUndefined();
    expect(fm.suggested_case_slug).toBe("case/12-Cg-34-25");
    expect(fm.review_status).toBe("unreviewed");
  });

  test("an unreadable date is refused instead of creating an undated deadline", async () => {
    fetchMock.mockResolvedValueOnce(message({}));
    const { res, fm } = await createDeadline({ deadline_date: "31.02.2026" });
    expect(res.status).toBe(400);
    expect(fm).toBeNull();
  });
});
