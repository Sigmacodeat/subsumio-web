import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { TimeTrackingWidget } from "./time-tracking-widget";

vi.mock("@/lib/realtime", () => ({ useRealtime: () => {} }));
vi.mock("@/lib/queries/auth", () => ({ useMe: () => ({ data: { user: { id: "u1" } } }) }));
vi.mock("@/lib/csrf", () => ({ csrfFetch: vi.fn(() => Promise.resolve({ status: 200 })) }));

describe("TimeTrackingWidget — Timer-Semantik", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-09-26T10:00:00Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          json: () =>
            Promise.resolve({
              current: {
                id: "a1",
                description: "Klageschrift",
                case_slug: "akte-1",
                started_at: "2026-09-26T09:58:30Z",
              },
            }),
        })
      )
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("zeichnet die laufende Anzeige als role=timer mit aria-live=off aus", async () => {
    render(<TimeTrackingWidget />);
    const timer = await screen.findByRole("timer", { name: "Laufende Zeiterfassung" });
    expect(timer).toHaveAttribute("aria-live", "off");
    expect(timer.textContent).toMatch(/^1m \d+s$/);
  });

  it("sagt die Minuten in einer polite-Region an und aktualisiert sie nur pro Minute", async () => {
    const { container } = render(<TimeTrackingWidget />);
    await screen.findByRole("timer");
    const region = container.querySelector('[aria-live="polite"]');
    expect(region).not.toBeNull();
    expect(region).toHaveClass("sr-only");
    expect(region?.textContent).toBe("Laufende Zeiterfassung: 1 Minute");

    // 20 s später: gleiche Minute → unveränderter Text (keine neue Ansage).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(region?.textContent).toBe("Laufende Zeiterfassung: 1 Minute");

    // Nach weiteren 40 s ist die 2. Minute voll → neue Ansage.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(41_000);
    });
    expect(region?.textContent).toBe("Laufende Zeiterfassung: 2 Minuten");
  });
});
