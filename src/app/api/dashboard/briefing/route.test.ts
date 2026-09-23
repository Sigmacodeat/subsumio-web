import type { NextRequest } from "next/server";
// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";

const mockFetchPages = vi.fn();
const mockComplete = vi.fn();

vi.mock("@/lib/cockpit", () => ({
  DEFAULT_TYPES: {},
  fetchPagesByTypes: (...args: unknown[]) => mockFetchPages(...args),
}));

vi.mock("@/lib/engine-llm", () => ({
  engineComplete: (...args: unknown[]) => mockComplete(...args),
}));

vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    opts: {
      body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } };
    },
    handler: (ctx: unknown, body: unknown, query: unknown) => Promise<Response>
  ) => {
    const ctx = {
      headers: { "x-subsumio-source": "brain-at" },
      brainId: "brain-at",
      user: { id: "u1", name: "Anwalt", email: "anwalt@example.com" },
    };
    return async (req: Request) => {
      const raw = await req.json().catch(() => ({}));
      const parsed = opts.body?.safeParse(raw);
      if (parsed && !parsed.success) {
        return Response.json({ error: "validation_failed" }, { status: 400 });
      }
      return handler(ctx, parsed?.data ?? raw, undefined);
    };
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }, { status: 200 }),
}));

import { POST } from "./route";

function absence(fm: Record<string, unknown>) {
  return { slug: `absences/${fm.id ?? "x"}`, type: "absence_record", frontmatter: fm };
}

const ACTIVE = {
  id: "absence-1",
  user_email: "mueller@kanzlei.at",
  user_name: "RA Müller",
  delegate_email: "berger@kanzlei.at",
  delegate_name: "Dr. Berger",
  start_date: "2020-01-01",
  end_date: "2099-12-31",
  status: "active",
  auto_route_enabled: true,
};

function post(language = "de") {
  return POST(
    new Request("http://localhost/api/dashboard/briefing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language }),
    }) as unknown as NextRequest
  );
}

interface BriefingBody {
  data: {
    narrative: string;
    usedFallback: boolean;
    data: { activeDelegations: Array<{ name: string; delegate: string; until: string }> };
  };
}

describe("POST /api/dashboard/briefing — Delegationen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockComplete.mockResolvedValue(null);
    mockFetchPages.mockResolvedValue({});
  });

  test("keine Abwesenheiten → leere Delegationen, kein Vertretungs-Satz", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    const body = (await res.json()) as BriefingBody;
    expect(body.data.data.activeDelegations).toEqual([]);
    expect(body.data.narrative).not.toContain("vertritt");
  });

  test("eine aktive Abwesenheit → Vertretung im Fallback-Text", async () => {
    mockFetchPages.mockResolvedValueOnce({ absence_record: [absence(ACTIVE)] });
    const res = await post();
    const body = (await res.json()) as BriefingBody;
    expect(body.data.data.activeDelegations).toEqual([
      { name: "RA Müller", delegate: "Dr. Berger", until: "2099-12-31" },
    ]);
    expect(body.data.narrative).toContain("Dr. Berger vertritt RA Müller bis 2099-12-31");
  });

  test("mehrere aktive Abwesenheiten → alle gelistet", async () => {
    mockFetchPages.mockResolvedValueOnce({
      absence_record: [
        absence(ACTIVE),
        absence({
          ...ACTIVE,
          id: "absence-2",
          user_email: "huber@kanzlei.at",
          user_name: "RA Huber",
          delegate_name: "RA Novak",
        }),
      ],
    });
    const res = await post();
    const body = (await res.json()) as BriefingBody;
    expect(body.data.data.activeDelegations).toHaveLength(2);
    expect(body.data.narrative).toContain("RA Novak vertritt RA Huber");
  });

  test("stornierte/abgeschlossene/abgelaufene Abwesenheiten werden ignoriert", async () => {
    mockFetchPages.mockResolvedValueOnce({
      absence_record: [
        absence({ ...ACTIVE, id: "a1", status: "cancelled" }),
        absence({ ...ACTIVE, id: "a2", status: "completed" }),
        absence({ ...ACTIVE, id: "a3", end_date: "2020-12-31" }),
        absence({ ...ACTIVE, id: "a4", auto_route_enabled: false }),
      ],
    });
    const res = await post();
    const body = (await res.json()) as BriefingBody;
    expect(body.data.data.activeDelegations).toEqual([]);
    expect(body.data.narrative).not.toContain("vertritt");
  });

  test("englischer Fallback nennt die Vertretung", async () => {
    mockFetchPages.mockResolvedValueOnce({ absence_record: [absence(ACTIVE)] });
    const res = await post("en");
    const body = (await res.json()) as BriefingBody;
    expect(body.data.narrative).toContain("Dr. Berger covers for RA Müller until 2099-12-31");
  });
});
