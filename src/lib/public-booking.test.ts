// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: (brainId: string) => ({ "x-subsumio-source": brainId }),
}));

import { availableSlots, bookedRangesForDate } from "./public-booking";
import { zonedWallTimeToUtc } from "./datetime";

const fetchMock = vi.fn();

function futureDate(days = 5): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

const SETTINGS = {
  frontmatter: { bookingEnabled: true, bookingStart: "09:00", bookingEnd: "12:00" },
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("public booking availability", () => {
  it("reads the engine's bare-array listing, so a firm appointment blocks its slots", async () => {
    const date = futureDate();
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("legal%2Fsettings%2Fkanzlei")) return Response.json(SETTINGS);
      if (u.includes("type=appointment")) {
        return Response.json([
          {
            slug: "appointments/a",
            frontmatter: { date, time: "10:00", duration_minutes: 60, status: "confirmed" },
          },
        ]);
      }
      return Response.json([]);
    });

    const { slots } = await availableSlots("brain-at", date);
    const at = (hhmm: string) =>
      slots.find((s) => s.start === zonedWallTimeToUtc(date, hhmm, "Europe/Vienna").toISOString());
    expect(at("09:30")?.status).toBe("available");
    expect(at("10:00")?.status).toBe("booked");
    expect(at("10:30")?.status).toBe("booked");
    expect(at("11:00")?.status).toBe("available");
  });

  it("reads past the engine's 100-row page cap", async () => {
    const date = futureDate();
    // 150 unrelated bookings on other days, then the one blocking 09:00.
    const others = Array.from({ length: 150 }, (_, i) => ({
      slug: `legal/bookings/other-${i}`,
      frontmatter: {
        slot_start: "2020-01-01T08:00:00.000Z",
        slot_end: "2020-01-01T08:30:00.000Z",
        status: "confirmed",
      },
    }));
    const start = zonedWallTimeToUtc(date, "09:00", "Europe/Vienna");
    const blocking = {
      slug: "legal/bookings/blocking",
      frontmatter: {
        slot_start: start.toISOString(),
        slot_end: new Date(start.getTime() + 30 * 60_000).toISOString(),
        status: "confirmed",
      },
    };
    const all = [...others, blocking];
    fetchMock.mockImplementation(async (url: string) => {
      const u = new URL(String(url));
      if (String(url).includes("legal%2Fsettings%2Fkanzlei")) return Response.json(SETTINGS);
      if (u.searchParams.get("type") === "booking") {
        const offset = Number(u.searchParams.get("offset") ?? 0);
        const limit = Number(u.searchParams.get("limit") ?? 100);
        return Response.json(all.slice(offset, offset + limit));
      }
      return Response.json([]);
    });
    const ranges = await bookedRangesForDate({}, date);
    expect(ranges).toHaveLength(1);
  });

  it("throws instead of reporting every slot free when the engine listing fails", async () => {
    const date = futureDate();
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("legal%2Fsettings%2Fkanzlei")) return Response.json(SETTINGS);
      return new Response("boom", { status: 500 });
    });
    await expect(availableSlots("brain-at", date)).rejects.toThrow();
  });
});
