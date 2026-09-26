// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createFakeEngine, type FakeEngine } from "@/test/fake-engine-pages";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));

import { buildMatterContext } from "@/lib/matter-context";

let engine: FakeEngine;
let failingTypes: string[] = [];

beforeEach(() => {
  engine = createFakeEngine("http://engine.test", () => "2026-01-01T00:00:00Z");
  failingTypes = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(String(url));
      if (u.pathname === "/api/legal/fristenbuch") {
        return Response.json({ heute: "", eintraege: [], zusammenfassung: {} });
      }
      if (u.pathname === "/api/pages" && failingTypes.includes(u.searchParams.get("type") ?? "")) {
        return new Response("boom", { status: 500 });
      }
      // The real engine clamps every listing to 100 rows.
      if (u.pathname === "/api/pages" && Number(u.searchParams.get("limit")) > 100) {
        u.searchParams.set("limit", "100");
      }
      return engine.fetch(u.toString(), init);
    })
  );
  engine.put({
    slug: "legal/cases/a",
    title: "Akte A",
    type: "legal_case",
    frontmatter: {
      status: "open",
      deadlines: [
        { id: "d1", title: "Stornierte Frist", due_date: "2020-01-01", status: "cancelled" },
      ],
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildMatterContext — vollständige Listen je Akte", { timeout: 20_000 }, () => {
  test("150 Dokumente, das der Akte ist das älteste → erscheint im Bundle", async () => {
    for (let i = 0; i < 149; i++) {
      engine.put({
        slug: `docs/other-${i}`,
        title: `Fremd ${i}`,
        type: "document",
        frontmatter: { case_slug: "legal/cases/other" },
      });
    }
    // Listed last = edited longest ago.
    engine.put({
      slug: "docs/mine",
      title: "Klage.pdf",
      type: "document",
      frontmatter: { case_slug: "legal/cases/a" },
    });
    const bundle = await buildMatterContext("legal/cases/a", "http://engine.test", {});
    expect(bundle.documents.map((d) => d.slug)).toContain("docs/mine");
    expect(bundle.coverage.partial).toBeUndefined();
  });

  test("legal_deadline-Seite mit case_slug → in deadlines", async () => {
    engine.put({
      slug: "legal/deadlines/x",
      title: "Berufung",
      type: "legal_deadline",
      frontmatter: {
        case_slug: "legal/cases/a",
        due_date: "2099-03-01",
        status: "open",
        description: "Berufung",
      },
    });
    const bundle = await buildMatterContext("legal/cases/a", "http://engine.test", {});
    expect(bundle.deadlines.map((d) => d.title)).toEqual(["Berufung"]);
  });

  test("stornierte Frist → keine Lücke missing_deadline", async () => {
    const bundle = await buildMatterContext("legal/cases/a", "http://engine.test", {});
    expect(bundle.deadlines).toEqual([]);
    expect(bundle.gaps.some((g) => g.type === "missing_deadline")).toBe(false);
  });

  test("Lesefehler bei Dokumenten → coverage.partial", async () => {
    failingTypes = ["document"];
    const bundle = await buildMatterContext("legal/cases/a", "http://engine.test", {});
    expect(bundle.coverage.partial).toBe(true);
  });
});
