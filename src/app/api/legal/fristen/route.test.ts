/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 }),
}));
vi.mock("@/lib/engine", async () => ({
  ENGINE_URL: "http://engine.test",
  engineConfigurationResponse: () => null,
  requireEngineContext: vi.fn(),
}));

import { GET } from "./route";
import { requireEngineContext } from "@/lib/engine";

const ctx = {
  headers: { "x-subsumio-source": "brain_a" },
  brainId: "brain_a",
  plan: "team",
  user: { id: "u1", email: "anwalt@kanzlei.example", role: "lawyer", name: "Anwalt" },
};

function engine(routes: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const parsed = new URL(url);
      const withQuery = `${parsed.pathname}${parsed.search}`;
      const key = withQuery in routes ? withQuery : parsed.pathname;
      if (key in routes) return new Response(JSON.stringify(routes[key]), { status: 200 });
      return new Response("{}", { status: 404 });
    })
  );
}

describe("GET /api/legal/fristen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireEngineContext).mockResolvedValue(ctx as any);
  });

  it("adds the responsible lawyer and keeps the completion note of duplicates", async () => {
    engine({
      "/api/legal/fristenbuch": {
        heute: "2026-09-14",
        eintraege: [
          {
            case_slug: "cases/mueller",
            datum: "2026-09-01",
            frist: "Berufung",
            rechtsgrundlage: "§ 464 ZPO",
            status: "overdue",
            vorfrist: "",
          },
        ],
        zusammenfassung: {},
      },
      // The route fetches each page type separately (the real engine has no
      // batch-list endpoint).
      "/api/pages?type=legal_case&limit=300": [
        {
          slug: "cases/mueller",
          title: "Müller gegen Maier",
          frontmatter: {
            own_lawyer_name: "Dr. Anna Beispiel",
            deadlines: [
              {
                id: "d1",
                title: "Berufung",
                due_date: "2026-09-01",
                status: "done",
                completed_at: "2026-08-30T16:00:00Z",
                completed_by: "Mag. Berta Zweit",
              },
            ],
          },
        },
      ],
      "/api/pages?type=legal_deadline&limit=300": [
        {
          slug: "legal/deadlines/2026-10-01-tagsatzung",
          title: "Tagsatzung",
          frontmatter: { due_date: "2026-10-01", case_slug: "cases/mueller", status: "pending" },
        },
      ],
    });

    const res = await GET(new NextRequest("http://localhost:3000/api/legal/fristen"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fristen).toHaveLength(2);
    const berufung = body.fristen.find((f: { title: string }) => f.title === "Berufung");
    expect(berufung).toMatchObject({
      responsible: "Dr. Anna Beispiel",
      status: "done",
      completed_by: "Mag. Berta Zweit",
    });
    // Standalone deadline pages inherit the case title (and responsible lawyer)
    // from the case page so the Fristenbuch never has to show a raw slug.
    const tagsatzung = body.fristen.find((f: { title: string }) => f.title === "Tagsatzung");
    expect(tagsatzung).toMatchObject({
      case_slug: "cases/mueller",
      case_title: "Müller gegen Maier",
      responsible: "Dr. Anna Beispiel",
    });
    expect(body.zusammenfassung.overdue).toBe(0);
    expect(body.zusammenfassung.done).toBe(1);
  });
});
