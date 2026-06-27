import { describe, it, expect, vi } from "vitest";
import { recordBriefingFeedback, parseFeedbackFromReply } from "./briefing-feedback";

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

describe("parseFeedbackFromReply", () => {
  it("parses thumbs up as positive feedback", () => {
    const result = parseFeedbackFromReply("👍");
    expect(result.isFeedback).toBe(true);
    expect(result.useful).toBe(true);
  });

  it("parses thumbs down as negative feedback", () => {
    const result = parseFeedbackFromReply("👎");
    expect(result.isFeedback).toBe(true);
    expect(result.useful).toBe(false);
  });

  it("parses 'ja' as positive", () => {
    const result = parseFeedbackFromReply("ja, sehr hilfreich");
    expect(result.isFeedback).toBe(true);
    expect(result.useful).toBe(true);
  });

  it("parses 'nein' as negative", () => {
    const result = parseFeedbackFromReply("nein, nicht nützlich");
    expect(result.isFeedback).toBe(true);
    expect(result.useful).toBe(false);
  });

  it("parses 'hilfreich' as positive", () => {
    const result = parseFeedbackFromReply("Das war hilfreich");
    expect(result.isFeedback).toBe(true);
    expect(result.useful).toBe(true);
  });

  it("parses 'nicht hilfreich' as negative", () => {
    const result = parseFeedbackFromReply("nicht hilfreich");
    expect(result.isFeedback).toBe(true);
    expect(result.useful).toBe(false);
  });

  it("parses 'useful' as positive", () => {
    const result = parseFeedbackFromReply("This was useful, thanks");
    expect(result.isFeedback).toBe(true);
    expect(result.useful).toBe(true);
  });

  it("parses 'unhelpful' as negative", () => {
    const result = parseFeedbackFromReply("unhelpful briefing");
    expect(result.isFeedback).toBe(true);
    expect(result.useful).toBe(false);
  });

  it("returns isFeedback=false for non-feedback text", () => {
    const result = parseFeedbackFromReply("Was sind die Fristen für heute?");
    expect(result.isFeedback).toBe(false);
    expect(result.useful).toBeNull();
  });

  it("handles empty string", () => {
    const result = parseFeedbackFromReply("");
    expect(result.isFeedback).toBe(false);
  });
});

describe("recordBriefingFeedback", () => {
  it("records feedback and returns feedback_id", async () => {
    const result = await recordBriefingFeedback({
      brain_id: "brain-1",
      org_id: "org-1",
      user_id: "user-1",
      useful: true,
    });
    expect(result.recorded).toBe(true);
    expect(result.feedback_id).toBeTruthy();
  });

  it("records feedback with comment", async () => {
    const result = await recordBriefingFeedback({
      brain_id: "brain-1",
      org_id: "org-1",
      user_id: "user-1",
      useful: false,
      comment: "Zu viele Fristen, zu wenig Kontext",
    });
    expect(result.recorded).toBe(true);
  });
});
