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
      "/api/pages?type=legal_case&limit=100&offset=0": [
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
      "/api/pages?type=legal_deadline&limit=100&offset=0": [
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
  it("marks the list partial (not silently short) when a deadline source fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const parsed = new URL(url);
        if (parsed.pathname === "/api/legal/fristenbuch") {
          return new Response(JSON.stringify({ heute: "", eintraege: [], zusammenfassung: {} }), {
            status: 200,
          });
        }
        const type = parsed.searchParams.get("type");
        if (type === "legal_deadline") return new Response("boom", { status: 500 });
        if (type === "legal_case") {
          return new Response(
            JSON.stringify([
              {
                slug: "cases/a",
                title: "A",
                frontmatter: {
                  deadlines: [{ id: "d1", title: "Berufung", due_date: "2026-10-01" }],
                },
              },
            ]),
            { status: 200 }
          );
        }
        return new Response("[]", { status: 200 });
      })
    );
    const res = await GET(new NextRequest("http://localhost:3000/api/legal/fristen"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.partial).toBe(true);
    expect(body.failed_sources).toContain("legal_deadline");
    expect(body.fristen).toHaveLength(1);
    // Embedded deadline carries its identity inside the matter.
    expect(body.fristen[0]).toMatchObject({
      source: "legal_case",
      source_slug: "cases/a",
      deadline_ref: { id: "d1" },
    });
  });

  it("answers 503 when every deadline source fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 502 }))
    );
    const res = await GET(new NextRequest("http://localhost:3000/api/legal/fristen"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("fristen_unavailable");
  });

  it("does not flag partial when only the absence records fail", async () => {
    engine({
      "/api/legal/fristenbuch": { heute: "", eintraege: [], zusammenfassung: {} },
      "/api/pages?type=legal_case&limit=100&offset=0": [],
      "/api/pages?type=legal_deadline&limit=100&offset=0": [],
    });
    const res = await GET(new NextRequest("http://localhost:3000/api/legal/fristen"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.partial).toBeUndefined();
    expect(body.failed_sources).toEqual(["absence_record"]);
  });

  it("gives legacy embedded deadlines (no id) a title + due_date reference", async () => {
    engine({
      "/api/legal/fristenbuch": { heute: "", eintraege: [], zusammenfassung: {} },
      "/api/pages?type=legal_case&limit=100&offset=0": [
        {
          slug: "cases/b",
          title: "B",
          frontmatter: { deadlines: [{ title: "Klagebeantwortung", due_date: "2026-11-02" }] },
        },
      ],
      "/api/pages?type=legal_deadline&limit=100&offset=0": [],
      "/api/pages?type=absence_record&limit=100&offset=0": [],
    });
    const body = await (
      await GET(new NextRequest("http://localhost:3000/api/legal/fristen"))
    ).json();
    expect(body.fristen[0].deadline_ref).toEqual({
      title: "Klagebeantwortung",
      due_date: "2026-11-02",
    });
  });
});
