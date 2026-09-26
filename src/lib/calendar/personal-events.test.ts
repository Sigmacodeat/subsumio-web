import { describe, expect, it } from "vitest";
import {
  hideForeignPersonalEventHits,
  hideForeignPersonalEvents,
  isForeignPersonalEvent,
} from "./personal-events";

const ev = (owner?: string) => ({
  slug: `calendar/outlook/x/${owner ?? "none"}`,
  type: "calendar_event",
  frontmatter: { type: "calendar_event", ...(owner ? { owner_user_id: owner } : {}) },
});

describe("personal calendar mirrors (R8-5)", () => {
  it("user B does not receive user A's personal events", () => {
    const list = [ev("A"), ev("B"), ev(), { slug: "legal/appointments/1", frontmatter: {} }];
    const forB = hideForeignPersonalEvents(list, "B");
    expect(forB.map((p) => p.slug)).toEqual([
      "calendar/outlook/x/B",
      "calendar/outlook/x/none",
      "legal/appointments/1",
    ]);
    expect(isForeignPersonalEvent(ev("A"), "A")).toBe(false);
    expect(isForeignPersonalEvent(ev("A"), undefined)).toBe(true);
  });
});

describe("search hits of personal calendar mirrors (R8-5 rest)", () => {
  const pages: Record<string, unknown> = {
    "calendar/outlook/a@k.at/1": ev("A"),
    "calendar/outlook/b@k.at/2": ev("B"),
    "calendar/firm/3": { slug: "calendar/firm/3", type: "calendar_event", frontmatter: {} },
  };
  const load = async (slug: string) => {
    if (slug === "calendar/outlook/broken/9") throw new Error("engine down");
    return pages[slug] ?? null;
  };

  it("drops a colleague's mirror, keeps own mirrors, firm events and other hits in order", async () => {
    const hits = [
      { slug: "legal/cases/x", type: "legal_case" },
      { slug: "calendar/outlook/a@k.at/1", type: "calendar_event" },
      { slug: "calendar/outlook/b@k.at/2", type: "calendar_event" },
      { slug: "calendar/firm/3", type: "calendar_event" },
    ];
    const out = await hideForeignPersonalEventHits(hits, "B", load);
    expect(out.map((h) => h.slug)).toEqual([
      "legal/cases/x",
      "calendar/outlook/b@k.at/2",
      "calendar/firm/3",
    ]);
  });

  it("is fail-closed: an unreadable or missing calendar page is dropped, also without a type", async () => {
    const hits = [
      { slug: "calendar/outlook/broken/9" },
      { slug: "calendar/outlook/gone/8", type: "calendar_event" },
      { slug: "legal/cases/x" },
    ];
    const out = await hideForeignPersonalEventHits(hits, "B", load);
    expect(out.map((h) => h.slug)).toEqual(["legal/cases/x"]);
  });

  it("does not read any page when there is no calendar hit", async () => {
    let reads = 0;
    const out = await hideForeignPersonalEventHits([{ slug: "legal/cases/x" }], "B", async () => {
      reads++;
      return null;
    });
    expect(out).toHaveLength(1);
    expect(reads).toBe(0);
  });
});
