import { describe, expect, it } from "vitest";
import { draftError, draftFrom } from "./time-suggestion-draft";
import type { TimeSuggestion } from "./passive-time";

const base: TimeSuggestion = {
  id: "s1",
  user_email: "a@example.com",
  date: "2026-09-19",
  start_time: "09:00",
  end_time: "09:45",
  duration_minutes: 45,
  description: "Schriftsatz entworfen",
  activity_type: "drafting",
  activity_ids: [],
  status: "suggested",
  confidence: "high",
  created_at: "2026-09-19T20:00:00Z",
};

describe("time suggestion draft", () => {
  it("starts from the suggestion, billable", () => {
    expect(draftFrom({ ...base, case_slug: "legal/cases/a" })).toEqual({
      case_slug: "legal/cases/a",
      minutes: "45",
      description: "Schriftsatz entworfen",
      billable: true,
    });
  });

  it("requires a matter — a suggestion without one cannot be booked as is", () => {
    expect(draftError(draftFrom(base))).toBe("Bitte eine Akte wählen.");
    expect(draftError({ ...draftFrom(base), case_slug: "legal/cases/a" })).toBeNull();
  });

  it("rejects non-integer, zero and over-a-day durations", () => {
    const d = { ...draftFrom(base), case_slug: "legal/cases/a" };
    expect(draftError({ ...d, minutes: "0" })).not.toBeNull();
    expect(draftError({ ...d, minutes: "12.5" })).not.toBeNull();
    expect(draftError({ ...d, minutes: "1441" })).not.toBeNull();
    expect(draftError({ ...d, minutes: "abc" })).not.toBeNull();
    expect(draftError({ ...d, minutes: "90" })).toBeNull();
  });

  it("requires a description", () => {
    const d = { ...draftFrom(base), case_slug: "legal/cases/a" };
    expect(draftError({ ...d, description: "   " })).not.toBeNull();
    expect(draftError({ ...d, description: "x".repeat(501) })).not.toBeNull();
  });
});
