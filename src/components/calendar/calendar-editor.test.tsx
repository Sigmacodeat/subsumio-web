import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const batch = vi.fn();
vi.mock("@/lib/api", () => ({
  api: { brain: { batchListPagesDetailed: (...a: unknown[]) => batch(...a) } },
}));
vi.mock("@/lib/queries/auth", () => ({
  useMe: () => ({ data: { user: { id: "u-lawyer", email: "anwalt@kanzlei.at", role: "lawyer" } } }),
}));
vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t: (k: string) => k, lang: "de" }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("@/lib/csrf", () => ({ csrfFetch: vi.fn() }));

import { CALENDAR_LIST_MAX, useAppointments } from "./calendar-editor";

const appointments = Array.from({ length: 250 }, (_, i) => ({
  slug: `legal/appointments/a-${i}`,
  title: `Termin ${i}`,
  frontmatter: { type: "appointment", title: `Termin ${i}`, date: "2026-10-05", time: "10:00" },
}));

beforeEach(() => batch.mockReset());

describe("useAppointments", () => {
  it("loads every appointment (not the 200 last-edited) plus the user's own Outlook events", async () => {
    batch.mockResolvedValue({
      results: {
        appointment: appointments,
        legal_case: [],
        calendar_event: [
          {
            slug: "calendar/outlook/anwalt@kanzlei.at/E1",
            title: "Termin: Privat",
            frontmatter: {
              type: "calendar_event",
              outlook_event_id: "E1",
              subject: "Arzttermin",
              start: "2026-10-06T08:00:00",
              end: "2026-10-06T09:00:00",
              timezone: "Europe/Vienna",
              owner_email: "anwalt@kanzlei.at",
            },
          },
          {
            slug: "calendar/outlook/kollegin@kanzlei.at/E2",
            title: "Termin: fremd",
            frontmatter: {
              type: "calendar_event",
              outlook_event_id: "E2",
              start: "2026-10-06T08:00:00",
              timezone: "Europe/Vienna",
              owner_email: "kollegin@kanzlei.at",
            },
          },
        ],
      },
      errors: [],
    });
    const { result } = renderHook(() => useAppointments());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(batch).toHaveBeenCalledWith(
      ["appointment", "legal_case", "calendar_event"],
      CALENDAR_LIST_MAX
    );
    expect(CALENDAR_LIST_MAX).toBeGreaterThanOrEqual(10_000);
    expect(result.current.appointments).toHaveLength(250);
    expect(result.current.capped).toBe(false);
    // Role "lawyer" sees their own Outlook appointments, not a colleague's.
    expect(result.current.outlookEvents.map((e) => e.title)).toEqual(["Arzttermin"]);
  });

  it("reports a load failure instead of an empty calendar", async () => {
    batch.mockResolvedValue({ results: {}, errors: ["appointment"] });
    const { result } = renderHook(() => useAppointments());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
  });
});
