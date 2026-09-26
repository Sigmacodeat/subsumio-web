import { describe, expect, it } from "vitest";
import { hideForeignPersonalEvents, isForeignPersonalEvent } from "./personal-events";

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
