/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", async () => ({
  ENGINE_URL: "http://engine.test",
}));

import { buildIcs, deadlinesIcsFor, fristenToIcsEntries, fristUid } from "./deadlines-ics";

const HEADERS = { "x-subsumio-source": "brain_a" };

function engine(routes: Record<string, unknown>, failing: string[] = []) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const parsed = new URL(url);
      const type = parsed.searchParams.get("type") ?? "";
      if (failing.includes(parsed.pathname) || failing.includes(type)) {
        return new Response("down", { status: 502 });
      }
      if (parsed.pathname === "/api/legal/fristenbuch") {
        return new Response(
          JSON.stringify(routes.fristenbuch ?? { heute: "", eintraege: [], zusammenfassung: {} }),
          { status: 200 }
        );
      }
      if (parsed.pathname === "/api/pages") {
        const offset = Number(parsed.searchParams.get("offset") ?? 0);
        const pages = offset === 0 ? ((routes[type] as unknown[]) ?? []) : [];
        return new Response(JSON.stringify(pages), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    })
  );
}

afterEach(() => vi.unstubAllGlobals());

/** RFC 5545 unfolding: CRLF followed by one space/tab continues the line. */
function contentLines(ics: string): string[] {
  return ics
    .replace(/\r\n[ \t]/g, "")
    .split("\r\n")
    .filter(Boolean);
}

function uids(ics: string): string[] {
  return contentLines(ics)
    .filter((l) => l.startsWith("UID:"))
    .map((l) => l.slice(4));
}

describe("deadlinesIcsFor", () => {
  it("merges Fristenbuch, deadline pages and matter-embedded deadlines", async () => {
    engine({
      fristenbuch: {
        heute: "2026-09-24",
        eintraege: [
          {
            case_slug: "cases/c",
            datum: "2026-10-20",
            frist: "Revision",
            rechtsgrundlage: "§ 505 ZPO",
            status: "ok",
            vorfrist: "2026-10-13",
          },
        ],
        zusammenfassung: {},
      },
      legal_deadline: [
        {
          slug: "legal/deadlines/tagsatzung",
          title: "Tagsatzung",
          frontmatter: { due_date: "2026-10-01", case_slug: "cases/a", status: "pending" },
        },
      ],
      legal_case: [
        {
          slug: "cases/a",
          title: "Akte A",
          frontmatter: {
            deadlines: [{ id: "d1", title: "Berufung", due_date: "2026-10-05" }],
          },
        },
      ],
    });
    const ics = await deadlinesIcsFor(HEADERS);
    expect(ics).toContain("SUMMARY:Tagsatzung");
    expect(ics).toContain("SUMMARY:Berufung");
    expect(ics).toContain("Revision");
    // Vorfrist gets its own event.
    expect(ics).toContain("DTSTART;VALUE=DATE:20261013");
  });

  it("leaves out completed and rejected deadlines", async () => {
    engine({
      legal_deadline: [
        {
          slug: "legal/deadlines/erledigt",
          frontmatter: { due_date: "2026-10-01", status: "done", description: "Erledigt" },
        },
        {
          slug: "legal/deadlines/verworfen",
          frontmatter: {
            due_date: "2026-10-02",
            review_status: "rejected",
            description: "Verworfen",
          },
        },
        {
          slug: "legal/deadlines/offen",
          frontmatter: { due_date: "2026-10-03", status: "pending", description: "Offen" },
        },
      ],
      legal_case: [
        {
          slug: "cases/a",
          frontmatter: {
            deadlines: [
              { id: "d9", title: "Schon erledigt", due_date: "2026-10-04", status: "done" },
            ],
          },
        },
      ],
    });
    const ics = await deadlinesIcsFor(HEADERS);
    expect(ics).toContain("SUMMARY:Offen");
    expect(ics).not.toContain("Erledigt");
    expect(ics).not.toContain("Verworfen");
    expect(ics).not.toContain("Schon erledigt");
  });

  it("gives same-named deadlines in different matters distinct UIDs", async () => {
    engine({
      legal_case: [
        {
          slug: "cases/a",
          frontmatter: { deadlines: [{ id: "x1", title: "Berufung", due_date: "2026-10-05" }] },
        },
        {
          slug: "cases/b",
          frontmatter: { deadlines: [{ id: "x1", title: "Berufung", due_date: "2026-10-05" }] },
        },
        {
          slug: "cases/c",
          frontmatter: { deadlines: [{ title: "Berufung", due_date: "2026-10-05" }] },
        },
      ],
    });
    const ics = await deadlinesIcsFor(HEADERS);
    const all = uids(ics);
    expect(all).toHaveLength(3);
    expect(new Set(all).size).toBe(3);
    expect(all.some((u) => u.includes("cases-a") && u.includes("x1"))).toBe(true);
  });

  it("is not capped at 300 deadline pages", async () => {
    // 350 deadline pages across four 100-page batches.
    const pages = Array.from({ length: 350 }, (_, i) => ({
      slug: `legal/deadlines/f${i}`,
      frontmatter: { due_date: "2026-11-02", status: "pending", description: `Frist ${i}` },
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const parsed = new URL(url);
        if (parsed.pathname === "/api/legal/fristenbuch") {
          return new Response(JSON.stringify({ heute: "", eintraege: [] }), { status: 200 });
        }
        const type = parsed.searchParams.get("type");
        const offset = Number(parsed.searchParams.get("offset") ?? 0);
        const limit = Number(parsed.searchParams.get("limit") ?? 100);
        const body = type === "legal_deadline" ? pages.slice(offset, offset + limit) : [];
        return new Response(JSON.stringify(body), { status: 200 });
      })
    );
    const ics = await deadlinesIcsFor(HEADERS);
    expect(uids(ics).filter((u) => !u.startsWith("vorfrist-"))).toHaveLength(350);
  });

  it("throws (caller answers 502) when a deadline source is unavailable", async () => {
    engine({ legal_deadline: [] }, ["legal_case"]);
    await expect(deadlinesIcsFor(HEADERS)).rejects.toThrow(/legal_case/);
  });

  it("throws when the engine Fristenbuch is unavailable", async () => {
    engine({}, ["/api/legal/fristenbuch"]);
    await expect(deadlinesIcsFor(HEADERS)).rejects.toThrow(/fristenbuch/);
  });
});

describe("fristUid / fristenToIcsEntries", () => {
  it("uses the page slug for legal_deadline rows", () => {
    expect(
      fristUid({
        id: "legal/deadlines/x",
        source: "legal_deadline",
        source_slug: "legal/deadlines/x",
        title: "X",
        due_date: "2026-10-01",
        status: "pending",
        type: "deadline",
      })
    ).toBe("legal_deadline-legal-deadlines-x");
  });

  it("marks unreviewed deadlines and Notfristen in the summary", () => {
    const ics = buildIcs(
      fristenToIcsEntries([
        {
          id: "cases/a-1",
          source: "legal_case",
          source_slug: "cases/a",
          deadline_ref: { id: "1" },
          title: "Berufung",
          due_date: "2026-10-01",
          status: "pending",
          type: "deadline",
          review_status: "unreviewed",
          is_notfrist: true,
        } as any,
      ])
    );
    expect(ics).toContain("SUMMARY:[UNGEPRÜFT] NOTFRIST: Berufung");
    expect(ics).toContain("TRIGGER:-P2D");
  });
});

describe("RFC 5545 form", () => {
  const longTitle =
    "Berufungsbeantwortung gegen das Urteil des Landesgerichts für Zivilrechtssachen — Äußerung zur Beweiswürdigung und Schätzung nach § 273 ZPO";
  const ics = buildIcs(
    fristenToIcsEntries([
      {
        id: "legal/deadlines/lang",
        source: "legal_deadline",
        source_slug: "legal/deadlines/lang",
        title: longTitle,
        case_title: "Müller gegen Österreichische Versicherungsgesellschaft AG — Schadenersatz",
        due_date: "2026-10-01",
        vorfrist_date: "2026-09-24",
        status: "pending",
        type: "deadline",
        law: "§ 464 ZPO",
      } as any,
    ])
  );
  const octets = (s: string) => new TextEncoder().encode(s).length;

  it("ends every line with CRLF and never a bare LF", () => {
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("folds every line to at most 75 octets without breaking UTF-8 characters", () => {
    const physical = ics.split("\r\n").filter(Boolean);
    for (const line of physical) expect(octets(line)).toBeLessThanOrEqual(75);
    expect(physical.some((l) => l.startsWith(" "))).toBe(true);
    // Unfolding restores the full summary, umlauts and dashes intact.
    expect(contentLines(ics)).toContain(`SUMMARY:${longTitle}`);
  });

  it("parses as a well-formed calendar (balanced components, name:value lines)", () => {
    const lines = contentLines(ics);
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines[lines.length - 1]).toBe("END:VCALENDAR");
    const stack: string[] = [];
    for (const line of lines) {
      expect(line).toMatch(/^[A-Z][A-Z0-9-]*(;[^:]*)?:/);
      if (line.startsWith("BEGIN:")) stack.push(line.slice(6));
      if (line.startsWith("END:")) expect(stack.pop()).toBe(line.slice(4));
    }
    expect(stack).toEqual([]);
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(2);
  });
});
