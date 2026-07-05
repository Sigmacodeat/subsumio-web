import { describe, test, expect } from "vitest";
import {
  createDictationEntry,
  transitionDictationStatus,
  getPendingCorrections,
  formatDictationDuration,
} from "./dictation";

describe("dictation", () => {
  describe("createDictationEntry", () => {
    test("creates entry with correct defaults", () => {
      const entry = createDictationEntry({
        lawyer_email: "ra@test.de",
        lawyer_name: "RA Test",
        duration_seconds: 120,
      });
      expect(entry.id).toMatch(/^dict-/);
      expect(entry.lawyer_email).toBe("ra@test.de");
      expect(entry.duration_seconds).toBe(120);
      expect(entry.status).toBe("recording");
      expect(entry.language).toBe("de-DE");
    });

    test("accepts optional case_slug", () => {
      const entry = createDictationEntry({
        lawyer_email: "ra@test.de",
        lawyer_name: "RA Test",
        duration_seconds: 60,
        case_slug: "case-123",
      });
      expect(entry.case_slug).toBe("case-123");
    });
  });

  describe("transitionDictationStatus", () => {
    test("transitions recording → transcribed", () => {
      const entry = createDictationEntry({
        lawyer_email: "ra@test.de",
        lawyer_name: "RA Test",
        duration_seconds: 30,
      });
      const updated = transitionDictationStatus(entry, "transcribed", { transcript: "Test text" });
      expect(updated.status).toBe("transcribed");
      expect(updated.transcript).toBe("Test text");
      expect(updated.transcribed_at).toBeTruthy();
    });

    test("transitions transcribed → corrected", () => {
      const entry = transitionDictationStatus(
        createDictationEntry({
          lawyer_email: "ra@test.de",
          lawyer_name: "RA Test",
          duration_seconds: 30,
        }),
        "transcribed"
      );
      const updated = transitionDictationStatus(entry, "corrected", {
        corrected_text: "Corrected",
        corrected_by: "RA Test",
      });
      expect(updated.status).toBe("corrected");
      expect(updated.corrected_text).toBe("Corrected");
    });

    test("rejects invalid transition", () => {
      const entry = createDictationEntry({
        lawyer_email: "ra@test.de",
        lawyer_name: "RA Test",
        duration_seconds: 30,
      });
      expect(() => transitionDictationStatus(entry, "filed")).toThrow();
    });
  });

  describe("getPendingCorrections", () => {
    test("returns only transcribed entries", () => {
      const entries = [
        createDictationEntry({ lawyer_email: "a@b.de", lawyer_name: "A", duration_seconds: 10 }),
        transitionDictationStatus(
          createDictationEntry({ lawyer_email: "c@d.de", lawyer_name: "C", duration_seconds: 20 }),
          "transcribed"
        ),
      ];
      const pending = getPendingCorrections(entries);
      expect(pending).toHaveLength(1);
      expect(pending[0]!.lawyer_name).toBe("C");
    });
  });

  test("formatDictationDuration formats correctly", () => {
    expect(formatDictationDuration(65)).toBe("1:05");
    expect(formatDictationDuration(30)).toBe("0:30");
    expect(formatDictationDuration(3600)).toBe("60:00");
  });
});
