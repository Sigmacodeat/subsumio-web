import { describe, expect, it } from "vitest";
import { ownOutlookEvents } from "./outlook-events";
import { addMinutesToWallClock, graphDateTimeToFirmLocal } from "./wall-clock";

const page = (slug: string, fm: Record<string, unknown>) => ({
  slug,
  title: "Termin",
  frontmatter: { type: "calendar_event", ...fm },
});

// A lawyer (no admin/connector rights) — the page only needs the user identity.
const lawyer = { id: "u-lawyer", email: "Anwalt@Kanzlei.at" };

describe("ownOutlookEvents", () => {
  it("shows the lawyer's own pulled Outlook events in Vienna time", () => {
    const items = ownOutlookEvents(
      [
        page("calendar/outlook/anwalt@kanzlei.at/E1", {
          outlook_event_id: "E1",
          subject: "Mandantengespräch",
          start: "2026-10-05T09:00:00.0000000",
          end: "2026-10-05T10:30:00.0000000",
          timezone: "Europe/Vienna",
          owner_email: "anwalt@kanzlei.at",
        }),
        // Older pull: UTC without zone, keyed by user id.
        page("calendar/outlook/u-lawyer/E2", {
          outlook_event_id: "E2",
          subject: "Telefonat",
          start: "2026-12-10T08:00:00.0000000",
          end: "2026-12-10T08:30:00.0000000",
          owner_user_id: "u-lawyer",
        }),
      ],
      lawyer
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: "Mandantengespräch",
      date: "2026-10-05",
      time: "09:00",
    });
    expect(items[0].durationMin).toBe(90);
    expect(items[1]).toMatchObject({ date: "2026-12-10", time: "09:00" });
  });

  it("hides colleagues' events, cancelled ones, duplicates and mirrors of Subsumio appointments", () => {
    const items = ownOutlookEvents(
      [
        page("a", {
          outlook_event_id: "X",
          start: "2026-10-05T09:00:00",
          timezone: "Europe/Vienna",
          owner_email: "kollegin@kanzlei.at",
        }),
        page("b", {
          outlook_event_id: "C",
          start: "2026-10-05T09:00:00",
          timezone: "Europe/Vienna",
          owner_email: "anwalt@kanzlei.at",
          cancelled: true,
        }),
        page("c1", {
          outlook_event_id: "D",
          start: "2026-10-05T11:00:00",
          timezone: "Europe/Vienna",
          owner_email: "anwalt@kanzlei.at",
        }),
        page("c2", {
          outlook_event_id: "D",
          start: "2026-10-05T11:00:00",
          timezone: "Europe/Vienna",
          owner_user_id: "u-lawyer",
        }),
        page("m", {
          outlook_event_id: "M",
          start: "2026-10-05T12:00:00",
          timezone: "Europe/Vienna",
          owner_email: "anwalt@kanzlei.at",
        }),
      ],
      lawyer,
      new Set(["M"])
    );
    expect(items.map((i) => i.eventId)).toEqual(["D"]);
  });
});

describe("wall-clock helpers", () => {
  it("rolls the end past midnight into the next day", () => {
    expect(addMinutesToWallClock("2026-12-31", "23:30", 60)).toEqual({
      date: "2027-01-01",
      time: "00:30",
    });
  });
  it("converts UTC Graph times into Vienna wall time (summer and winter)", () => {
    expect(graphDateTimeToFirmLocal("2026-07-15T07:00:00.0000000", "UTC")).toMatchObject({
      date: "2026-07-15",
      time: "09:00",
    });
    expect(graphDateTimeToFirmLocal("2026-12-10T23:30:00", "UTC")).toMatchObject({
      date: "2026-12-11",
      time: "00:30",
    });
  });
});
